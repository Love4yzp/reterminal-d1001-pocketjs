import { For } from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import { View } from "@pocketjs/framework/solid/components";
import type { NodeMirror } from "@pocketjs/framework/renderer";

interface HorizontalSliderProps {
  left: number;
  screenLeft: number;
  top: number;
  width: number;
  value: number;
  max: number;
  fillColor: number;
  colors?: readonly number[];
  onChange(value: number): void;
}

export function HorizontalSlider(props: HorizontalSliderProps) {
  let track: NodeMirror | undefined;
  const update = (x: number) => {
    const ratio = Math.min(1, Math.max(0, (x - props.screenLeft) / props.width));
    props.onChange(Math.round(ratio * props.max));
  };
  createGesture({
    region: { node: () => track },
    axis: "x",
    onDown: contact => update(contact.x),
    onPanMove: contact => update(contact.x),
  });
  const fraction = () => props.max > 0 ? props.value / props.max : 0;

  return (
    <View
      ref={node => { track = node; }}
      class="absolute"
      style={{ insetL: props.left, insetT: props.top, width: props.width, height: 18 }}
    >
      <View class="absolute left-[0] top-[3] w-full h-[12] rounded-[6] bg-[#30405a] overflow-hidden">
        {props.colors ? (
          <For each={props.colors}>{(color, index) => {
            const count = props.colors!.length;
            const left = Math.round(index() * props.width / count);
            return <View class="absolute h-full" style={{
              insetL: left,
              width: Math.round((index() + 1) * props.width / count) - left,
              bgColor: color,
            }} />;
          }}</For>
        ) : (
          <View class="absolute left-[0] top-[0] h-full" style={{
            width: Math.round(fraction() * props.width),
            bgColor: props.fillColor,
          }} />
        )}
      </View>
      <View class="absolute w-[8] h-[18] rounded-[4] bg-white" style={{
        insetL: 0,
        insetT: 0,
        translateX: Math.round(fraction() * (props.width - 8)),
      }} />
    </View>
  );
}
