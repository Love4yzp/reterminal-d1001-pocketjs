import { createSignal, For } from "solid-js";
import { View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { theme } from "../theme";

const DOT = 8;
const PITCH = 16;

/** Three cycling dots centred on (centerX, centerY); shown wherever data is not ready yet. */
export function LoadingDots(props: { centerX: number; centerY: number }) {
  const [phase, setPhase] = createSignal(0);
  let frame = 0;
  onFrame(() => {
    frame += 1;
    if (frame % 6 === 0) setPhase(value => (value + 1) % 3);
  });
  return (
    <For each={[0, 1, 2]}>{index => (
      <View
        class="absolute"
        style={{
          insetL: props.centerX - PITCH - DOT / 2 + index * PITCH,
          insetT: props.centerY - DOT / 2,
          width: DOT,
          height: DOT,
          radius: DOT / 2,
          bgColor: phase() === index ? theme.primary : theme.disabledText,
        }}
      />
    )}</For>
  );
}
