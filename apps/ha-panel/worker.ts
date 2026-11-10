import { FactKind, io, ResourceStatus, utf8Text } from "@pocketjs/framework/io";
import { settle, sleep } from "@pocketjs/framework/worker";
import { HaEngine, type HaResponse } from "./ha-engine";
import type { HttpRequest } from "./ha-request";
import {
  decodeMessage,
  encodeMessage,
  statusErrorText,
  type PanelHaConfig,
  type WorkerCommand,
  type WorkerEvent,
} from "./protocol";

const TICK_MICROS = 100_000;
let config: PanelHaConfig | undefined;
let lastConfig: Uint8Array | undefined;

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return statusErrorText(config?.token ? text.split(config.token).join("<redacted>") : text);
}

function publish(event: WorkerEvent): void {
  try {
    const bytes = new Uint8Array(512);
    encodeMessage(event, bytes);
    if (!io.channel("ha-events").publish(bytes))
      console.error("[ha-panel] HA event channel is full");
  } catch (error) {
    console.error(`[ha-panel] event publish failed: ${errorMessage(error)}`);
  }
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
    if (code < 200 || code >= 300) throw new Error(`HTTP status ${code}`);
    console.log(`[ha-panel] ${request.method} ${request.url} -> ${code}`);
    return { code, body };
  } finally {
    resource.close();
  }
}

const engine = new HaEngine(execute, publish);

async function commandLoop(): Promise<void> {
  for await (const bytes of io.channel("ha-commands").observe()) {
    try {
      await engine.command(decodeMessage<WorkerCommand>(bytes));
    } catch (error) {
      console.error(`[ha-panel] HA command failed: ${errorMessage(error)}`);
    }
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array | undefined): boolean {
  if (right === undefined || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1)
    if (left[index] !== right[index]) return false;
  return true;
}

async function run(): Promise<void> {
  void commandLoop();
  for (;;) {
    const bytes = io.channel("ha-config").snapshot();
    if (bytes && !sameBytes(bytes, lastConfig)) {
      lastConfig = bytes;
      try {
        config = decodeMessage<PanelHaConfig>(bytes);
        engine.setConfig(config);
      } catch (error) {
        config = { baseUrl: "", token: "", selftest: false, configError: errorMessage(error) };
        engine.setConfig(config);
        console.error(`[ha-panel] HA configuration failed: ${errorMessage(error)}`);
      }
    }
    engine.tick();
    await sleep(TICK_MICROS);
  }
}

void run();
