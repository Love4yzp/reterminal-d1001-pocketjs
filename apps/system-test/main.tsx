import { setBrightness, setSwitch } from "@pocketjs/framework/device";
import { file, write } from "@pocketjs/framework/fs";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { mount } from "@pocketjs/framework/solid";
import { Text, View } from "@pocketjs/framework/solid/components";
import { scanNetworks, wifiStatus } from "@pocketjs/framework/wifi";
import { createSignal } from "solid-js";

const COUNTER_PATH = "counter.json";
const FRAMES_PER_SECOND = 30;
const WIFI_POLL_SECONDS = 5;
const COLORS = [
  { name: "RED", leds: [true, false, false], hex: 0xffdc2626 },
  { name: "GREEN", leds: [false, true, false], hex: 0xff16a34a },
  { name: "BLUE", leds: [false, false, true], hex: 0xff2563eb },
  { name: "YELLOW", leds: [true, true, false], hex: 0xffeab308 },
  { name: "CYAN", leds: [false, true, true], hex: 0xff06b6d4 },
  { name: "MAGENTA", leds: [true, false, true], hex: 0xffd946ef },
  { name: "WHITE", leds: [true, true, true], hex: 0xffffffff },
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function incrementCounter(): { count: number; status: string } {
  let previous = 0;
  let readStatus = "NEW FILE";

  try {
    const saved = file(COUNTER_PATH);
    if (saved.exists()) {
      const data: unknown = saved.json();
      const value = typeof data === "object" && data !== null
        ? (data as { count?: unknown }).count
        : undefined;
      if (
        typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 ||
        value >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error("counter.json count must be a non-negative safe integer");
      }
      previous = value;
      readStatus = "READ OK";
    }
  } catch (error) {
    console.error(`counter read error: ${errorMessage(error)}`);
    readStatus = "READ ERROR / RESET 0";
  }

  const count = previous + 1;
  console.log(`persistent count=${count}`);

  try {
    write(COUNTER_PATH, `${JSON.stringify({ count })}\n`);
    return { count, status: `${readStatus} / WRITE OK` };
  } catch (error) {
    console.error(`counter write error: ${errorMessage(error)}`);
    return { count, status: `${readStatus} / WRITE ERROR` };
  }
}

function SystemTest() {
  const persistent = incrementCounter();
  const [colorIndex, setColorIndex] = createSignal(0);
  const [brightnessText, setBrightnessText] = createSignal("100%");
  const [wifiState, setWifiState] = createSignal("PENDING");
  const [apCount, setApCount] = createSignal(0);
  let frame = 0;

  const showColor = (index: number) => {
    const color = COLORS[index]!;
    const accepted = [
      setSwitch("led-r", color.leds[0]),
      setSwitch("led-g", color.leds[1]),
      setSwitch("led-b", color.leds[2]),
    ];
    setColorIndex(index);
    console.log(
      `rgb color=${color.name} led-r=${color.leds[0]} led-g=${color.leds[1]} led-b=${color.leds[2]} accepted=${accepted.every(Boolean)}`,
    );
  };

  const changeBrightness = (value: number) => {
    const accepted = setBrightness(value);
    setBrightnessText(`${value}%${accepted ? "" : " / REFUSED"}`);
    console.log(`brightness=${value} accepted=${accepted}`);
  };

  const pollWifi = () => {
    const status = wifiStatus();
    if (!status) {
      setWifiState("UNAVAILABLE");
      setApCount(0);
      console.log("wifi status unavailable");
      return;
    }

    const alreadyScanning = status.scanning === true;
    const scanStarted = alreadyScanning ? false : scanNetworks();
    const networks = status.networks ?? [];
    setWifiState(
      alreadyScanning ? "SCANNING" : scanStarted ? "SCAN STARTED" : status.state.toUpperCase(),
    );
    setApCount(networks.length);
    console.log(
      `wifi state=${status.state} scan=${alreadyScanning ? "active" : scanStarted ? "started" : "refused"} ap_count=${networks.length} aps=${JSON.stringify(networks)}`,
    );
    if (status.error) console.error(`wifi status error: ${status.error}`);
  };

  showColor(0);
  changeBrightness(100);
  pollWifi();

  onFrame(() => {
    frame++;
    if (frame % FRAMES_PER_SECOND !== 0) return;

    const elapsedSeconds = frame / FRAMES_PER_SECOND;
    showColor(elapsedSeconds % COLORS.length);
    if (elapsedSeconds === 1) changeBrightness(25);
    else if (elapsedSeconds === 2) changeBrightness(100);
    if (elapsedSeconds % WIFI_POLL_SECONDS === 0) pollWifi();
  });

  return (
    <View class="relative bg-slate-950" style={{ width: 400, height: 640 }}>
      <Text class="absolute left-[20] top-[18] w-[360] text-2xl text-white font-bold">D1001 SYSTEM TEST</Text>
      <Text class="absolute left-[20] top-[52] w-[360] text-xs text-slate-400">400 x 640 / NATIVE SOLID / 30 HZ</Text>

      <View class="absolute left-[16] top-[88] w-[368] h-[128] rounded-[8] bg-slate-900 border border-slate-700">
        <Text class="absolute left-[16] top-[14] w-[336] text-xs text-cyan-300 font-bold">PERSISTENT COUNTER</Text>
        <Text class="absolute left-[16] top-[40] w-[336] text-2xl text-white font-bold">{`COUNT ${persistent.count}`}</Text>
        <Text class="absolute left-[16] top-[88] w-[336] text-xs text-slate-300">{persistent.status}</Text>
      </View>

      <View class="absolute left-[16] top-[232] w-[368] h-[156] rounded-[8] bg-slate-900 border border-slate-700">
        <Text class="absolute left-[16] top-[14] w-[336] text-xs text-cyan-300 font-bold">RGB LED / 1 SECOND STEPS</Text>
        <View
          class="absolute left-[16] top-[48] w-[64] h-[64] rounded-[6] border border-slate-500"
          style={{ bgColor: COLORS[colorIndex()]!.hex }}
        />
        <Text class="absolute left-[100] top-[48] w-[248] text-2xl text-white font-bold">{COLORS[colorIndex()]!.name}</Text>
        <Text class="absolute left-[100] top-[82] w-[248] text-xs text-slate-300">R + G + B COMBINATIONS</Text>
        <Text class="absolute left-[100] top-[116] w-[248] text-xs text-amber-300">{`BACKLIGHT ${brightnessText()}`}</Text>
      </View>

      <View class="absolute left-[16] top-[404] w-[368] h-[168] rounded-[8] bg-slate-900 border border-slate-700">
        <Text class="absolute left-[16] top-[14] w-[336] text-xs text-cyan-300 font-bold">WIFI SCAN / 5 SECOND POLL</Text>
        <Text class="absolute left-[16] top-[46] w-[336] text-xl text-white font-bold">{`STATUS ${wifiState()}`}</Text>
        <Text class="absolute left-[16] top-[82] w-[336] text-2xl text-white">{`AP COUNT ${apCount()}`}</Text>
        <Text class="absolute left-[16] top-[122] w-[336] text-xs text-green-300">SCAN / CONFIGURED STA</Text>
        <Text class="absolute left-[16] top-[142] w-[336] text-xs text-slate-400">AP DETAILS PRINTED TO CONSOLE</Text>
      </View>

      <Text class="absolute left-[20] top-[602] w-[360] text-xs text-slate-500">counter.json / led-r + led-g + led-b</Text>
    </View>
  );
}

mount(() => <SystemTest />);
