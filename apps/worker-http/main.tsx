import { onFrame } from "@pocketjs/framework/lifecycle";
import { mount } from "@pocketjs/framework/solid";
import { Text, View } from "@pocketjs/framework/solid/components";
import { worker } from "@pocketjs/framework/worker/channels";
import { createSignal } from "solid-js";
import { decodeProgress, PHASES, TARGET_URL, type Progress } from "./protocol";

function WorkerHttp() {
  const progress = worker.channel("progress");
  const [latest, setLatest] = createSignal<Progress>({ phase: 0, bytes: 0, status: 0, code: 0, error: "" });

  onFrame(() => {
    for (const record of progress.observe()) setLatest(decodeProgress(record.copy()));
  });

  return (
    <View class="relative bg-slate-950" style={{ width: 400, height: 640 }}>
      <Text class="absolute left-[20] top-[20] w-[360] text-2xl text-white font-bold">D1001 WORKER HTTP</Text>
      <Text class="absolute left-[20] top-[56] w-[360] text-xs text-slate-400">RUNTIME.WORKER + NET.HTTP / GET</Text>

      <View class="absolute left-[16] top-[96] w-[368] h-[112] rounded-[8] bg-slate-900 border border-slate-700">
        <Text class="absolute left-[16] top-[14] w-[336] text-xs text-cyan-300 font-bold">TARGET</Text>
        <Text class="absolute left-[16] top-[44] w-[336] text-sm text-white">{TARGET_URL}</Text>
      </View>

      <View class="absolute left-[16] top-[224] w-[368] h-[160] rounded-[8] bg-slate-900 border border-slate-700">
        <Text class="absolute left-[16] top-[14] w-[336] text-xs text-cyan-300 font-bold">RESPONSE</Text>
        <Text class="absolute left-[16] top-[42] w-[336] text-xl text-white font-bold">{PHASES[latest().phase] ?? "Unknown"}</Text>
        <Text class="absolute left-[16] top-[78] w-[336] text-sm text-slate-300">{`HTTP status ${latest().code || "pending"}`}</Text>
        <Text class="absolute left-[16] top-[104] w-[336] text-sm text-slate-300">{`Body ${latest().bytes} bytes`}</Text>
        <Text class="absolute left-[16] top-[130] w-[336] text-xs text-slate-400">{`Resource status ${latest().status}`}</Text>
      </View>

      <View class="absolute left-[16] top-[400] w-[368] h-[184] rounded-[8] bg-slate-900 border border-slate-700">
        <Text class="absolute left-[16] top-[14] w-[336] text-xs text-cyan-300 font-bold">ERROR</Text>
        <Text class="absolute left-[16] top-[44] w-[336] text-sm text-red-300">{latest().error || "None"}</Text>
      </View>

      <Text class="absolute left-[20] top-[606] w-[360] text-xs text-slate-500">Headers, errors and totals print to serial.</Text>
    </View>
  );
}

mount(() => <WorkerHttp />);
