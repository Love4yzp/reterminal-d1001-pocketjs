import { For } from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { Image, Text, View } from "@pocketjs/framework/solid/components";
import { abgr, hsvToRgb } from "../color";
import { backlightFromX } from "../settings";
import { dragPercent, fillHeight, hueFromX, percentFromY, saturationFromX } from "../dimmer";
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

const COLOR_TRACK_HEIGHT = 36;
const COLOR_STRIP_COUNT = 24;
const COLOR_KNOB = 28;

/**
 * Continuous hue or saturation track. The value follows the finger's absolute
 * x, so a single tap or a drag both land on the exact color under the finger.
 */
export function ColorSlider(props: {
  kind: "hue" | "saturation";
  label: string;
  left: number;
  top: number;
  labelWidth: number;
  width: number;
  hue: number;
  saturation: number;
  enabled: boolean;
  onChange(hue: number, saturation: number): void;
}) {
  let track: NodeMirror | undefined;
  const trackLeft = () => props.left + props.labelWidth;
  const update = (x: number) => {
    if (!props.enabled) return;
    if (props.kind === "hue") props.onChange(hueFromX(x, trackLeft(), props.width), props.saturation);
    else props.onChange(props.hue, saturationFromX(x, trackLeft(), props.width));
  };
  createGesture({
    region: { node: () => track },
    axis: "x",
    onDown: contact => update(contact.x),
    onPanMove: contact => update(contact.x),
  });
  const strips = Array.from({ length: COLOR_STRIP_COUNT }, (_, index) => ({
    left: Math.round(index * props.width / COLOR_STRIP_COUNT),
    width: Math.round((index + 1) * props.width / COLOR_STRIP_COUNT) - Math.round(index * props.width / COLOR_STRIP_COUNT),
    fraction: index / (COLOR_STRIP_COUNT - 1),
  }));
  const stripColor = (fraction: number) => {
    if (!props.enabled) return theme.secondaryBackground;
    return abgr(props.kind === "hue"
      ? hsvToRgb(fraction * 359, 1)
      : hsvToRgb(props.hue, fraction));
  };
  const fraction = () => props.kind === "hue" ? props.hue / 359 : props.saturation / 100;
  const knobLeft = () => Math.round((props.width - COLOR_KNOB) * Math.min(1, Math.max(0, fraction())));
  return (
    <>
      <Text
        class="absolute text-xs"
        style={{ insetL: props.left, insetT: props.top + 10, width: props.labelWidth, textColor: props.enabled ? theme.secondaryText : theme.disabledText }}
      >
        {props.label}
      </Text>
      <View
        ref={node => { track = node; }}
        class="absolute"
        style={{ insetL: trackLeft(), insetT: props.top, width: props.width, height: COLOR_TRACK_HEIGHT }}
      >
        <View class="absolute overflow-hidden" style={{ insetL: 0, insetT: 8, width: props.width, height: 20, radius: 10, bgColor: theme.secondaryBackground }}>
          <For each={strips}>{strip => (
            <View class="absolute" style={{ insetL: strip.left, insetT: 0, width: strip.width, height: 20, bgColor: stripColor(strip.fraction) }} />
          )}</For>
        </View>
        <View
          class="absolute"
          style={{
            insetL: knobLeft(),
            insetT: (COLOR_TRACK_HEIGHT - COLOR_KNOB) / 2,
            width: COLOR_KNOB,
            height: COLOR_KNOB,
            radius: COLOR_KNOB / 2,
            bgColor: props.enabled ? abgr(hsvToRgb(props.hue, props.saturation / 100)) : theme.secondaryBackground,
            borderWidth: 3,
            borderColor: theme.white,
          }}
        />
      </View>
    </>
  );
}
