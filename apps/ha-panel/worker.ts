import { FactKind, io, ResourceStatus, utf8Text } from "@pocketjs/framework/io";
import { settle, sleep } from "@pocketjs/framework/worker";
import {
  createGetLightStateRequest,
  createSensorStateRequests,
  createSetLightStateRequest,
  type HttpRequest,
} from "./ha-request";
import {
  decodeMessage,
  encodeMessage,
  type PanelHaConfig,
  type WorkerCommand,
  type WorkerEvent,
} from "./protocol";

interface HaResponse {
  code: number;
  body: string;
}

let config: PanelHaConfig | undefined;
let configured = false;
let connected = false;
let lastConfig: Uint8Array | undefined;
let requests = Promise.resolve();

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return config?.token ? text.split(config.token).join("<redacted>") : text;
}

function publish(event: WorkerEvent): void {
  const bytes = new Uint8Array(512);
  encodeMessage(event, bytes);
  io.channel("ha-events").publish(bytes);
}

function publishStatus(error = ""): void {
  publish({ type: "status", configured, connected, error });
}

function enqueue(request: HttpRequest): Promise<HaResponse> {
  const result = requests.then(() => execute(request));
  requests = result.then(() => undefined, () => undefined);
  return result;
}

async function execute(request: HttpRequest): Promise<HaResponse> {
  const resource = io.http("http").open({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
    timeoutMs: 10_000,
    maxBytes: 16_384,
  });
  let requestId = -1;
  try {
    requestId = resource.submit();
    if (requestId < 0) throw new Error("HTTP request was not accepted");
    const completion = settle(requestId);
    void completion.then(() => resource.close(), () => resource.close());
    let code = 0;
    let body = "";
    for await (const fact of resource.observe()) {
      if (fact.kind === FactKind.headers) {
        const head = JSON.parse(utf8Text(fact.data)) as { status: number };
        code = head.status;
      } else if (fact.kind === FactKind.data) {
        body += utf8Text(fact.data);
      } else if (fact.kind === FactKind.error) {
        throw new Error(utf8Text(fact.data));
      }
    }
    const outcome = await completion;
    if (outcome.status !== ResourceStatus.ok)
      throw new Error(`HTTP resource status ${outcome.status}`);
    if (code < 200 || code >= 400) throw new Error(`HTTP status ${code}`);
    console.log(`[ha-panel] ${request.method} ${request.url} -> ${code}`);
    return { code, body };
  } finally {
    resource.close();
  }
}

function configuredConfig(value: PanelHaConfig): boolean {
  return value.baseUrl.length > 0 && value.token.length > 0;
}

async function readRemoteLight(): Promise<void> {
  if (!config?.lightEntityId) {
    publishStatus();
    return;
  }
  const response = await enqueue(createGetLightStateRequest(config));
  connected = true;
  const entity = JSON.parse(response.body) as {
    state?: unknown;
    attributes?: { brightness?: unknown; hs_color?: unknown };
  };
  const attributes = entity.attributes;
  const hue = Array.isArray(attributes?.hs_color) && typeof attributes.hs_color[0] === "number"
    ? attributes.hs_color[0]
    : 0;
  publish({
    type: "light",
    light: {
      on: entity.state === "on",
      brightness: typeof attributes?.brightness === "number" ? attributes.brightness : 128,
      hue,
    },
  });
  publishStatus();
}

async function handleCommand(command: WorkerCommand): Promise<void> {
  if (!config || !configured) return;
  if (command.type === "light") {
    const response = await enqueue(createSetLightStateRequest(config, command.light));
    connected = response.code >= 200 && response.code < 400;
    publishStatus();
    return;
  }
  const reports = createSensorStateRequests(config, command.sample);
  for (const report of reports) await enqueue(report);
  connected = true;
  console.log(`[ha-panel] reported ${reports.length} sensor states`);
  publishStatus();
}

async function commandLoop(): Promise<void> {
  for await (const bytes of io.channel("ha-commands").observe()) {
    try {
      await handleCommand(decodeMessage<WorkerCommand>(bytes));
    } catch (error) {
      connected = false;
      publishStatus(errorMessage(error));
      console.error(`[ha-panel] HA request failed: ${errorMessage(error)}`);
    }
  }
}

async function run(): Promise<void> {
  void commandLoop();
  for (;;) {
    const bytes = io.channel("ha-config").snapshot();
    if (bytes && bytes !== lastConfig) {
      lastConfig = bytes;
      try {
        config = decodeMessage<PanelHaConfig>(bytes);
        configured = configuredConfig(config);
        connected = false;
        publishStatus();
        if (configured) await readRemoteLight();
      } catch (error) {
        connected = false;
        publishStatus(errorMessage(error));
        console.error(`[ha-panel] HA configuration failed: ${errorMessage(error)}`);
      }
    }
    await sleep(100_000);
  }
}

void run();
