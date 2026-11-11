import { createGesture } from "@pocketjs/framework/gesture";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { Image, Text, View } from "@pocketjs/framework/solid/components";
import { abgr, hsvToRgb } from "../color";
import { backlightFromX } from "../settings";
import { dragPercent, fillHeight, hueSaturationFromPoint, percentFromY, wheelPoint } from "../dimmer";
import { theme } from "../theme";
import type { IconName } from "./art";
import { Icon, Pressable } from "./primitives";

const KNOB_SIZE = 28;

/**
 * A rounded-pill vertical brightness slider. The fill sits at the bottom and
 * takes the light's color while the light is on; the knob marks its top.
 */
export function VerticalSlider(props: {
  left: number;
  top: number;
  screenTop: number;
  width: number;
  height: number;
  value: number;
  color: number;
  on: boolean;
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
      if (props.enabled) props.onChange(percentFromY(contact.y, props.screenTop, props.height));
    },
    onPanMove: contact => {
      if (props.enabled) props.onChange(dragPercent(startPercent, contact.dy, props.height));
    },
  });
  const fill = () => fillHeight(props.value, props.height);
  const fillColor = () => props.enabled && props.on ? props.color : theme.disabledText;
  return (
    <View
      ref={node => { track = node; }}
      class="absolute overflow-hidden"
      style={{ insetL: props.left, insetT: props.top, width: props.width, height: props.height, radius: Math.min(props.width, props.height) / 2, bgColor: theme.secondaryBackground }}
    >
      <View
        class="absolute"
        style={{ insetL: 0, insetT: props.height - fill(), width: props.width, height: fill(), bgColor: fillColor() }}
      />
      {fill() > 0 ? (
        <View
          class="absolute"
          style={{
            insetL: Math.round((props.width - KNOB_SIZE) / 2),
            insetT: Math.max(0, Math.min(props.height - KNOB_SIZE, props.height - fill() - KNOB_SIZE / 2)),
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            radius: KNOB_SIZE / 2,
            bgColor: theme.white,
          }}
        />
      ) : null}
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

/**
 * Circular hue/saturation picker: hue is the angle clockwise from the top and
 * saturation grows with the distance from the center. The thumb follows the
 * same mapping as the touch.
 */
export function ColorWheel(props: {
  left: number;
  top: number;
  size: number;
  hue: number;
  saturation: number;
  enabled: boolean;
  onChange(hue: number, saturation: number): void;
}) {
  let node: NodeMirror | undefined;
  const radius = () => Math.max(1, props.size / 2 - 12);
  const update = (x: number, y: number) => {
    if (!props.enabled) return;
    const center = props.size / 2;
    const value = hueSaturationFromPoint(x, y, props.left + center, props.top + center, radius());
    props.onChange(value.hue, value.saturation);
  };
  createGesture({
    region: { node: () => node },
    axis: "any",
    onDown: contact => update(contact.x, contact.y),
    onPanMove: contact => update(contact.x, contact.y),
  });
  const thumb = () => wheelPoint(props.hue, props.saturation, props.size / 2, props.size / 2, radius());
  const thumbColor = () => props.enabled ? abgr(hsvToRgb(props.hue, props.saturation / 100)) : theme.disabledText;
  return (
    <View
      ref={mirror => { node = mirror; }}
      class="absolute"
      style={{ insetL: props.left, insetT: props.top, width: props.size, height: props.size }}
    >
      <Image class="absolute" style={{ insetL: 0, insetT: 0, width: props.size, height: props.size }} src="art/color-wheel.svg" />
      <View
        class="absolute"
        style={{ insetL: Math.round(props.size / 2 - 8), insetT: Math.round(props.size / 2 - 8), width: 16, height: 16, radius: 8, bgColor: theme.white }}
      />
      <View
        class="absolute"
        style={{ insetL: thumb().x - 16, insetT: thumb().y - 16, width: 32, height: 32, radius: 16, bgColor: theme.page }}
      >
        <View
          class="absolute"
          style={{ insetL: 3, insetT: 3, width: 26, height: 26, radius: 13, bgColor: thumbColor(), borderWidth: 3, borderColor: theme.white }}
        />
      </View>
    </View>
  );
}

/** Round mode button with a caption underneath. */
export function ModeButton(props: {
  left: number;
  top: number;
  size: number;
  icon: IconName;
  label: string;
  background: number;
  labelColor: number;
  enabled: boolean;
  onTap(): void;
}) {
  const iconOffset = Math.round((props.size - 24) / 2);
  return (
    <Pressable box={{ left: props.left, top: props.top, width: props.size, height: props.size + 22 }} onTap={props.onTap}>
      <View
        class="absolute"
        style={{ insetL: 0, insetT: 0, width: props.size, height: props.size, radius: props.size / 2, bgColor: props.enabled ? props.background : theme.secondaryBackground }}
      >
        <Icon name={props.icon} left={iconOffset} top={iconOffset} size={24} />
      </View>
      <Text
        class="absolute text-2xs text-center"
        style={{ insetL: 0, insetT: props.size + 4, width: props.size, textColor: props.enabled ? props.labelColor : theme.disabledText }}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}
