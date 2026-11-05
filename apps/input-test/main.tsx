import { createSignal, For } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { Text, View } from "@pocketjs/framework/components";
import { BTN, touches } from "@pocketjs/framework/input";
import { onButtonPress, onFrame } from "@pocketjs/framework/lifecycle";
import { VirtualList, type VirtualListHandle } from "@pocketjs/framework/virtual-list";

const ZONES = [
  { name: "TOP LEFT", x: 20, y: 72, w: 104, h: 58, bg: 0xff8a3a1e },
  { name: "TOP RIGHT", x: 276, y: 72, w: 104, h: 58, bg: 0xff634e16 },
  { name: "CENTER", x: 148, y: 147, w: 104, h: 58, bg: 0xff951d4c },
  { name: "BOTTOM LEFT", x: 20, y: 222, w: 104, h: 58, bg: 0xff4a4e13 },
  { name: "BOTTOM RIGHT", x: 276, y: 222, w: 104, h: 58, bg: 0xff812e31 },
] as const;

const ROW_COUNT = 80;
const ROW_HEIGHT = 42;
const LIST_HEIGHT = 250;
const AUTO_STEP = 6;
const INPUT_QUIET_FRAMES = 60;

function InputTest() {
  const [hits, setHits] = createSignal<number[]>(ZONES.map(() => 0));
  const [buttonCount, setButtonCount] = createSignal(0);
  const [touchText, setTouchText] = createSignal("id --  x --  y --");
  const [autoText, setAutoText] = createSignal("AUTO DOWN");
  const [rowTaps, setRowTaps] = createSignal(0);
  let list: VirtualListHandle | undefined;
  let previousTouchIds = new Set<number>();
  let direction = 1;
  let quietFrames = INPUT_QUIET_FRAMES;
  let autoRunning = true;

  const pauseAuto = (source: string) => {
    quietFrames = 0;
    if (!autoRunning) return;
    autoRunning = false;
    setAutoText(`PAUSE ${source}`);
    console.log(`[input-test] auto scroll paused (${source})`);
  };

  const changeDirection = (next: number, offset: number) => {
    direction = next;
    const name = direction > 0 ? "DOWN" : "UP";
    setAutoText(`AUTO ${name}`);
    console.log(`[input-test] auto scroll ${name} offset=${Math.round(offset)}`);
  };

  onButtonPress(BTN.CIRCLE, (pressed, buttons) => {
    const count = buttonCount() + 1;
    setButtonCount(count);
    pauseAuto("BUTTON");
    console.log(
      `[input-test] GPIO3/CIRCLE count=${count} pressed=0x${pressed.toString(16)} buttons=0x${buttons.toString(16)}`,
    );
  }, { latched: true });

  onFrame(() => {
    const contacts = touches();
    const nextTouchIds = new Set<number>();
    for (const contact of contacts) {
      nextTouchIds.add(contact.id);
      if (previousTouchIds.has(contact.id)) continue;
      const zoneIndex = ZONES.findIndex((zone) =>
        contact.x >= zone.x && contact.x < zone.x + zone.w &&
        contact.y >= zone.y && contact.y < zone.y + zone.h
      );
      if (zoneIndex < 0) continue;
      const nextHits = hits().slice();
      nextHits[zoneIndex] = nextHits[zoneIndex]! + 1;
      setHits(nextHits);
      console.log(
        `[input-test] hit ${ZONES[zoneIndex]!.name} count=${nextHits[zoneIndex]} id=${contact.id} logical=${contact.x},${contact.y}`,
      );
    }
    previousTouchIds = nextTouchIds;

    const contact = contacts[0];
    setTouchText(contact ? `id ${contact.id}  x ${contact.x}  y ${contact.y}` : "id --  x --  y --");
    if (contacts.length > 0) pauseAuto("TOUCH");
    if (!list) return;
    if (contacts.length > 0 || ++quietFrames <= INPUT_QUIET_FRAMES) return;

    const scroller = list.scroller;
    const offset = scroller.offset();
    if (!autoRunning) {
      autoRunning = true;
      setAutoText(direction > 0 ? "AUTO DOWN" : "AUTO UP");
      console.log(`[input-test] auto scroll resumed offset=${Math.round(offset)}`);
    }
    if (direction > 0 && scroller.isAtEnd()) changeDirection(-1, offset);
    else if (direction < 0 && offset <= 0) changeDirection(1, offset);
    scroller.scrollBy(direction * AUTO_STEP, { immediate: true });
  });

  console.log("[input-test] ready; auto scroll DOWN; CIRCLE mask=0x2000");

  return (
    <View
      debugName="InputTestScreen"
      class="relative bg-slate-950 overflow-hidden"
      style={{ width: 400, height: 640 }}
    >
      <Text class="absolute left-[16] top-[10] w-[368] text-xl text-white font-bold">D1001 INPUT TEST</Text>
      <Text class="absolute left-[16] top-[39] w-[368] text-xs text-slate-400">TOUCH + GPIO3/CIRCLE + RETAINED LIST</Text>

      <View class="absolute left-[12] top-[62] w-[376] h-[224] rounded-[8] bg-slate-900 border border-slate-700" />
      <For each={ZONES}>{(zone, index) => (
        <View
          debugName={`TouchZone${index()}`}
          class="absolute flex-col items-center justify-center rounded-[6] border border-slate-500"
          style={{ insetL: zone.x, insetT: zone.y, width: zone.w, height: zone.h, bgColor: zone.bg }}
        >
          <Text class="text-xs text-white font-bold">{zone.name}</Text>
          <Text class="text-sm text-white">{`hits ${hits()[index()]}`}</Text>
        </View>
      )}</For>

      <Text class="absolute left-[16] top-[295] w-[368] text-sm text-cyan-300">{`Touch ${touchText()}`}</Text>
      <Text class="absolute left-[16] top-[319] w-[368] text-sm text-amber-300">{`GPIO3 / CIRCLE presses ${buttonCount()}`}</Text>

      <Text class="absolute left-[16] top-[346] w-[210] text-xs text-slate-300 font-bold">VIRTUAL LIST / 80 ROWS</Text>
      <Text class="absolute left-[226] top-[346] w-[158] text-right text-xs text-green-300">{autoText()}</Text>
      <View class="absolute left-[0] top-[374] w-[400] h-[250] bg-slate-900 overflow-hidden">
        <VirtualList
          ref={(handle) => (list = handle)}
          count={ROW_COUNT}
          rowHeight={ROW_HEIGHT}
          height={LIST_HEIGHT}
          overscan={ROW_HEIGHT}
          focusRows={false}
          style={{ width: 400 }}
          renderRow={(index) => (
            <View class={index % 2 === 0 ? "w-full h-full flex-row items-center justify-between px-[12] border-slate-700 bg-slate-900" : "w-full h-full flex-row items-center justify-between px-[12] border-slate-700 bg-slate-800"}>
              <Text class="text-sm text-white">{`ROW ${String(index).padStart(2, "0")}`}</Text>
              <Text class="text-xs text-slate-400">retained move</Text>
            </View>
          )}
          onRowPress={(index) => {
            const count = rowTaps() + 1;
            setRowTaps(count);
            console.log(`[input-test] list row=${index} taps=${count}`);
          }}
        />
      </View>
    </View>
  );
}

mount(() => <InputTest />);
