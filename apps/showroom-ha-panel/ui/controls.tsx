import { For } from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { Image, View } from "@pocketjs/framework/solid/components";
import { backlightFromX } from "../settings";
import { dragPercent, fillHeight, percentFromY } from "../dimmer";
import { theme } from "../theme";

const SLIDER_HEIGHT = 268;
const STRIP_COUNT = 32;

function channel(color: number, shift: number): number {
  return (color >>> shift) & 0xff;
}

function mix(from: number, to: number, fraction: number): number {
  const value = [0, 8, 16].map(shift => Math.round(channel(from, shift) + (channel(to, shift) - channel(from, shift)) * fraction));
  return (0xff000000 | (value[2]! << 16) | (value[1]! << 8) | value[0]!) >>> 0;
}

const STRIPS = Array.from({ length: STRIP_COUNT }, (_, index) => ({
  top: Math.round(index * SLIDER_HEIGHT / STRIP_COUNT),
  bottom: Math.round((index + 1) * SLIDER_HEIGHT / STRIP_COUNT),
  color: mix(theme.on, theme.onDeep, index / (STRIP_COUNT - 1)),
}));

export function VerticalSlider(props: {
  left: number;
  top: number;
  screenTop: number;
  value: number;
  enabled: boolean;
  onChange(percent: number): void;
}) {
  let track: NodeMirror | undefined;
  let startPercent = props.value;
  createGesture({
    region: { node: () => track },
    axis: "y",
    onDown: () => { startPercent = props.value; },
    onTap: contact => {
      if (props.enabled) props.onChange(percentFromY(contact.y, props.screenTop, SLIDER_HEIGHT));
    },
    onPanMove: contact => {
      if (props.enabled) props.onChange(dragPercent(startPercent, contact.dy, SLIDER_HEIGHT));
    },
  });
  const fill = () => fillHeight(props.value, SLIDER_HEIGHT);
  return (
    <View
      ref={node => { track = node; }}
      class="absolute overflow-hidden"
      style={{ insetL: props.left, insetT: props.top, width: 132, height: SLIDER_HEIGHT, radius: 28, bgColor: theme.secondaryBackground }}
    >
      <For each={STRIPS}>{strip => {
        const top = () => Math.max(strip.top, SLIDER_HEIGHT - fill());
        const height = () => Math.max(0, strip.bottom - top());
        return (
          <View
            class="absolute"
            style={{
              insetL: 0,
              insetT: top(),
              width: 132,
              height: height(),
              bgColor: props.enabled ? strip.color : theme.secondaryBackground,
            }}
          />
        );
      }}</For>
      {fill() > 16 ? (
        <View
          class="absolute"
          style={{ insetL: 46, insetT: SLIDER_HEIGHT - fill() + 10, width: 40, height: 4, radius: 2, bgColor: theme.sliderMark }}
        />
      ) : null}
      <Image
        class="absolute"
        style={{ insetL: 0, insetT: 0, width: 132, height: 28 }}
        src="art/dimmer-mask-top.svg"
      />
      <Image
        class="absolute"
        style={{ insetL: 0, insetT: SLIDER_HEIGHT - 28, width: 132, height: 28 }}
        src="art/dimmer-mask-bottom.svg"
      />
    </View>
  );
}

export function BacklightSlider(props: {
  left: number;
  top: number;
  screenLeft: number;
  width: number;
  value: number;
  onChange(percent: number): void;
}) {
  let track: NodeMirror | undefined;
  const update = (x: number) => props.onChange(backlightFromX(x, props.screenLeft, props.width));
  createGesture({
    region: { node: () => track },
    axis: "x",
    onDown: contact => update(contact.x),
    onPanMove: contact => update(contact.x),
  });
  const filled = () => Math.round(props.width * props.value / 100);
  const knobLeft = () => Math.round((props.width - 24) * props.value / 100);
  return (
    <View
      ref={node => { track = node; }}
      class="absolute"
      style={{ insetL: props.left, insetT: props.top, width: props.width, height: 30 }}
    >
      <View class="absolute" style={{ insetL: 0, insetT: 12, width: props.width, height: 6, radius: 3, bgColor: theme.secondaryBackground }}>
        <View class="absolute" style={{ insetL: 0, insetT: 0, width: filled(), height: 6, radius: 3, bgColor: theme.primary }} />
      </View>
      <View class="absolute" style={{ insetL: knobLeft(), insetT: 3, width: 24, height: 24, radius: 12, bgColor: theme.white }} />
    </View>
  );
}
