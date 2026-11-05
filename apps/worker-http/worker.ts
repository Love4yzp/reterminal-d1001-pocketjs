// Adapted from pocket-m5 apps/worker-http at commit aa8a0ca. One GET starts
// with the worker; headers, errors and the final status print on the console.
import { FactKind, io, ResourceStatus } from "@pocketjs/framework/io";
import { settle, sleep } from "@pocketjs/framework/worker";
import { encodeProgress, Phase, TARGET_URL, type Progress } from "./protocol";

const progress = io.channel("progress");
const record = new Uint8Array(256);
let latest: Progress = { phase: Phase.ready, bytes: 0, status: 0, code: 0, error: "" };

function publish(update: Partial<Progress>): void {
  latest = { ...latest, ...update };
  progress.publish(encodeProgress(latest, record));
}

function ascii(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchOnce(): Promise<void> {
  console.log(`[worker-http] GET ${TARGET_URL}`);
  let resource;
  try {
    resource = io.http("http").open({ url: TARGET_URL, method: "GET", timeoutMs: 30_000, maxBytes: 262_144 });
  } catch (error) {
    const text = `open: ${errorMessage(error)}`;
    console.error(`[worker-http] ${text}`);
    publish({ phase: Phase.failed, status: ResourceStatus.failed, error: text });
    return;
  }

  const request = resource.submit();
  if (request < 0) {
    const text = `submit: status ${request}`;
    console.error(`[worker-http] ${text}`);
    publish({ phase: Phase.failed, status: ResourceStatus.busy, error: text });
    resource.close();
    return;
  }
  publish({ phase: Phase.accepted });
  const completion = settle(request);
  void completion.then(() => resource.close());
  let total = 0;
  let code = 0;
  let ended = false;

  try {
    for await (const fact of resource.observe()) {
      if (fact.kind === FactKind.headers) {
        const head = JSON.parse(ascii(fact.data)) as { status: number; url: string };
        code = head.status;
        console.log(`[worker-http] ${head.url} -> ${head.status} ${ascii(fact.data)}`);
        publish({ phase: Phase.headers, code });
      } else if (fact.kind === FactKind.data) {
        total = fact.offset + fact.data.length;
        publish({ phase: Phase.body, bytes: total, code });
      } else if (fact.kind === FactKind.error) {
        const text = ascii(fact.data);
        console.error(`[worker-http] ${text}`);
        publish({ error: text });
      } else if (fact.kind === FactKind.end) {
        ended = true;
        total = fact.offset;
        publish({
          phase: fact.status === ResourceStatus.ok ? Phase.complete : Phase.failed,
          bytes: total,
          status: fact.status,
          code,
        });
      }
    }
    const outcome = await completion;
    console.log(`[worker-http] HTTP ${code}, body ${total} bytes, resource status ${outcome.status}`);
    if (!ended) publish({ phase: Phase.failed, bytes: total, status: outcome.status, code });
  } catch (error) {
    const text = `stream: ${errorMessage(error)}`;
    console.error(`[worker-http] ${text}`);
    publish({ phase: Phase.failed, bytes: total, status: ResourceStatus.failed, code, error: text });
    resource.close();
  }
}

async function run(): Promise<void> {
  for (;;) {
    await fetchOnce();
    await sleep(5_000_000);
  }
}

void run();
