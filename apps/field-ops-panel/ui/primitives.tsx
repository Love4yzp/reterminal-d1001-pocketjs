import { For, type JSX } from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import { Image, View } from "@pocketjs/framework/solid/components";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { clampBacklight, backlightFromX } from "../settings";
import type { OpsTheme } from "../theme";
import { playOpsSound } from "../ui-sound";
import { ICONS, NUMERALS, type IconName } from "./art";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function Icon(props: { name: IconName; left: number; top: number; size: number }) {
  return (
    <Image
      class="absolute"
      style={{ insetL: props.left, insetT: props.top, width: props.size, height: props.size }}
      src={ICONS[props.name]}
    />
  );
}

type NumeralSize = keyof typeof NUMERALS;
type NumeralGlyph = keyof (typeof NUMERALS)[NumeralSize]["glyphs"];

export function numeralsWidth(text: string, size: NumeralSize): number {
  let width = 0;
  for (const character of text) width += NUMERALS[size].glyphs[character as NumeralGlyph]?.width ?? 0;
  return width;
}

export function Numerals(props: { text: string; size: NumeralSize; left: number; top: number; center?: boolean }) {
  const glyphs = () => {
    const font = NUMERALS[props.size];
    let x = props.center ? Math.round(props.left - numeralsWidth(props.text, props.size) / 2) : props.left;
    const placed: { src: string; x: number; width: number }[] = [];
    for (const character of props.text) {
      const glyph = font.glyphs[character as NumeralGlyph];
      if (!glyph) continue;
      placed.push({ src: glyph.src, x, width: glyph.width });
      x += glyph.width;
    }
    return placed;
  };
  return (
    <For each={glyphs()}>{glyph => (
      <Image
        class="absolute"
        style={{ insetL: glyph.x, insetT: props.top, width: glyph.width, height: NUMERALS[props.size].height }}
        src={glyph.src}
      />
    )}</For>
  );
}

export function Pressable(props: {
  box: Box;
  tapSlop?: number;
  style?: Record<string, number>;
  onTap?: () => void;
  onLongPress?: () => void;
  muted?: boolean;
  children?: JSX.Element;
}) {
  let node: NodeMirror | undefined;
  createGesture({
    region: { node: () => node },
    tapSlop: props.tapSlop ?? 20,
    onTap: () => {
      if (!props.onTap) return;
      playOpsSound("tap", props.muted);
      props.onTap();
    },
    onLongPress: () => {
      if (!props.onLongPress) return;
      playOpsSound("tap", props.muted);
      props.onLongPress();
    },
  });
  return (
    <View
      ref={mirror => { node = mirror; }}
      class="absolute"
      style={{
        insetL: props.box.left,
        insetT: props.box.top,
        width: props.box.width,
        height: props.box.height,
        ...props.style,
      }}
    >
      {props.children}
    </View>
  );
}

export function BacklightBar(props: {
  box: Box;
  percent: number | null;
  theme: OpsTheme;
  onChange(percent: number): void;
}) {
  let node: NodeMirror | undefined;
  const applyX = (x: number) => {
    if (props.percent === null) return;
    props.onChange(clampBacklight(backlightFromX(x, props.box.left, props.box.width)));
  };
  createGesture({
    region: { node: () => node },
    axis: "x",
    onTap: contact => applyX(contact.x),
    onPanMove: contact => applyX(contact.x),
  });
  const fillWidth = () => {
    if (props.percent === null) return 0;
    return Math.max(12, Math.round((props.box.width * clampBacklight(props.percent)) / 100));
  };
  return (
    <View
      ref={mirror => { node = mirror; }}
      class="absolute"
      style={{
        insetL: props.box.left,
        insetT: props.box.top,
        width: props.box.width,
        height: props.box.height,
        radius: Math.round(props.box.height / 2),
        bgColor: props.theme.cardElevated,
      }}
    >
      {props.percent === null ? null : (
        <View
          class="absolute"
          style={{
            insetL: 0,
            insetT: 0,
            width: fillWidth(),
            height: props.box.height,
            radius: Math.round(props.box.height / 2),
            bgColor: props.theme.accent,
          }}
        />
      )}
    </View>
  );
}

export function Divider(props: { left: number; top: number; width: number; theme: OpsTheme }) {
  return (
    <View
      class="absolute"
      style={{ insetL: props.left, insetT: props.top, width: props.width, height: 1, bgColor: props.theme.divider }}
    />
  );
}
