import { FactKind, io, ResourceStatus, utf8Text } from "@pocketjs/framework/io";
import { settle, sleep } from "@pocketjs/framework/worker";
import {
  buildAckAlarmRequest,
  buildSetpointRequest,
  buildSnapshotRequest,
  parseCommandPayload,
  parseSnapshotPayload,
  type HttpRequest,
} from "./ops-request";
import {
  decodeMessage,
  encodeMessage,
  statusErrorText,
  type OpsConfig,
  type OpsProfileId,
  type OpsTelemetrySnapshot,
  type WorkerCommand,
  type WorkerEvent,
} from "./protocol";

const TICK_MICROS = 100_000;
let config: OpsConfig | undefined;
let activeProfile: OpsProfileId = "ess";
let lastConfigBytes: Uint8Array | undefined;
let lastStatusConnected: boolean | null = null;
let lastStatusConfigured: boolean | null = null;
let lastStatusError = "";
let nextPollTick = 0;

function redact(text: string): string {
  return statusErrorText(config?.token ? text.split(config.token).join("<redacted>") : text);
}

function errorMessage(error: unknown): string {
  return redact(error instanceof Error ? error.message : String(error));
}

function publish(event: WorkerEvent): void {
  try {
    const bytes = new Uint8Array(1024);
    encodeMessage(event, bytes);
    if (!io.channel("ops-events").publish(bytes)) console.error("[field-ops] event channel full");
  } catch (error) {
    console.error(`[field-ops] publish failed: ${errorMessage(error)}`);
  }
}

function emitSnapshot(snapshot: OpsTelemetrySnapshot): void {
  const { alarms, ...summary } = snapshot;
  publish({ type: "summary", summary });
  if (alarms.length === 0) {
    publish({ type: "alarms-batch", profileId: snapshot.profileId, revision: snapshot.revision, reset: true, alarms: [] });
    return;
  }
  for (let i = 0; i < alarms.length; i += 2) {
    publish({
      type: "alarms-batch",
      profileId: snapshot.profileId,
      revision: snapshot.revision,
      reset: i === 0,
      alarms: alarms.slice(i, i + 2),
    });
  }
}

function emitStatus(configured: boolean, connected: boolean, error: string): void {
  if (lastStatusConfigured === configured && lastStatusConnected === connected && lastStatusError === error) return;
  lastStatusConfigured = configured;
  lastStatusConnected = connected;
  lastStatusError = error;
  publish({ type: "status", configured, connected, error });
}

async function execute(request: HttpRequest): Promise<{ code: number; body: string }> {
  const resource = io.http("http").open({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
    timeoutMs: 10_000,
    maxBytes: 16_384,
  });
  try {
    const requestId = resource.submit();
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
    if (outcome.status !== ResourceStatus.ok) throw new Error(`HTTP resource status ${outcome.status}`);
    if (code < 200 || code >= 300) throw new Error(`HTTP ${code}`);
    return { code, body };
  } finally {
    resource.close();
  }
}

async function pollOnce(): Promise<void> {
  if (!config || !config.baseUrl || !config.token) {
    emitStatus(false, false, config?.configError ?? "");
    return;
  }
  try {
    const res = await execute(buildSnapshotRequest(config, activeProfile));
    const snapshot = parseSnapshotPayload(res.body);
    emitStatus(true, true, "");
    emitSnapshot(snapshot);
  } catch (error) {
    emitStatus(true, false, errorMessage(error));
  }
}

async function handleCommand(command: WorkerCommand): Promise<void> {
  if (command.type === "poll") {
    nextPollTick = 0;
    return;
  }
  if (command.type === "set-profile") {
    activeProfile = command.profileId;
    nextPollTick = 0;
    return;
  }
  if (!config || !config.baseUrl || !config.token) {
    publish({ type: "command-result", commandId: command.commandId, ok: false, message: "Not configured" });
    return;
  }
  try {
    const req = command.type === "setpoint"
      ? buildSetpointRequest(config, activeProfile, command.mode, command.targetKw, command.commandId)
      : buildAckAlarmRequest(config, activeProfile, command.alarmId);
    const res = await execute(req);
    const parsed = parseCommandPayload(res.body);
    emitStatus(true, true, "");
    if (parsed.snapshot) emitSnapshot(parsed.snapshot);
    publish({
      type: "command-result",
      commandId: command.commandId,
      ok: parsed.ok,
      message: parsed.message,
    });
  } catch (error) {
    publish({ type: "command-result", commandId: command.commandId, ok: false, message: errorMessage(error) });
  }
}

async function commandLoop(): Promise<void> {
  for await (const bytes of io.channel("ops-commands").observe()) {
    try {
      await handleCommand(decodeMessage<WorkerCommand>(bytes));
    } catch (error) {
      console.error(`[field-ops] command error: ${errorMessage(error)}`);
    }
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array | undefined): boolean {
  if (right === undefined || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

async function run(): Promise<void> {
  void commandLoop();
  let ticks = 0;
  for (;;) {
    const configBytes = io.channel("ops-config").snapshot();
    if (configBytes && !sameBytes(configBytes, lastConfigBytes)) {
      lastConfigBytes = configBytes;
      try {
        config = decodeMessage<OpsConfig>(configBytes);
        activeProfile = config.profileId;
      } catch (error) {
        config = {
          baseUrl: "",
          token: "",
          profileId: "ess",
          staleAfterSeconds: 30,
          pollIntervalMs: 3000,
          configError: errorMessage(error),
        };
      }
      nextPollTick = 0;
    }
    if (ticks >= nextPollTick) {
      await pollOnce();
      const intervalTicks = Math.max(10, Math.round((config?.pollIntervalMs ?? 3000) / 100));
      nextPollTick = ticks + intervalTicks;
    }
    ticks += 1;
    await sleep(TICK_MICROS);
  }
}

void run();
