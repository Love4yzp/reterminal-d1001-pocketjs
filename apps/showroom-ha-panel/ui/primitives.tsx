import { For, type JSX } from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import { Image, View } from "@pocketjs/framework/solid/components";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import type { LightTone } from "../lights";
import { theme } from "../theme";
import { emitUiFeedback } from "../ui-sound";
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

/** Width of `text` drawn in the baked display numerals. */
export function numeralsWidth(text: string, size: NumeralSize): number {
  let width = 0;
  for (const character of text) width += NUMERALS[size].glyphs[character as NumeralGlyph]?.width ?? 0;
  return width;
}

/**
 * Large digits from InterDisplay-Bold SVGs: the device's glyph atlases only
 * carry the small UI sizes, so the clock and the dimmer percent are images.
 * `left` is the left edge, or the center when `center` is set.
 */
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

/**
 * A touch target. Uses the gesture recognizer rather than Focusable so a
 * tap and a long-press can share one node, and so nested targets resolve by
 * registration order (children register after their parents and win).
 */
export function Pressable(props: {
  box: Box;
  /** Extra movement allowed before a tap becomes a scroll. */
  tapSlop?: number;
  style?: Record<string, number>;
  onTap?: () => void;
  onLongPress?: () => void;
  children?: JSX.Element;
}) {
  let node: NodeMirror | undefined;
  createGesture({
    region: { node: () => node },
    tapSlop: props.tapSlop ?? 20,
    onTap: () => {
      if (!props.onTap) return;
      emitUiFeedback("tap");
      props.onTap();
    },
    onLongPress: () => {
      if (!props.onLongPress) return;
      emitUiFeedback("tap");
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

/** 48×28 toggle from the lights list. */
export function Switch(props: { on: boolean; enabled: boolean; left: number; top: number }) {
  const track = () => !props.enabled ? theme.secondaryBackground : props.on ? theme.primary : theme.secondaryBackground;
  return (
    <View class="absolute" style={{ insetL: props.left, insetT: props.top, width: 48, height: 28, radius: 14, bgColor: track() }}>
      <View
        class="absolute"
        style={{
          insetL: props.on && props.enabled ? 23 : 3,
          insetT: 3,
          width: 22,
          height: 22,
          radius: 11,
          bgColor: props.enabled ? (props.on ? theme.white : theme.secondaryText) : theme.disabledText,
        }}
      />
    </View>
  );
}

const TONE_ICON: Record<LightTone, IconName> = {
  on: "bulb-on",
  cool: "bulb-primary",
  off: "bulb-secondary",
  unavailable: "bulb-dim",
};

const TONE_CHIP: Record<LightTone, number> = {
  on: theme.onChip,
  cool: theme.primaryChip,
  off: theme.secondaryBackground,
  unavailable: theme.secondaryBackground,
};

/** Round chip with a bulb, tinted by the light's tone. */
export function BulbChip(props: { tone: LightTone; left: number; top: number; size: number }) {
  return (
    <View
      class="absolute"
      style={{ insetL: props.left, insetT: props.top, width: props.size, height: props.size, radius: props.size / 2, bgColor: TONE_CHIP[props.tone] }}
    >
      <Icon name={TONE_ICON[props.tone]} left={(props.size - 24) / 2} top={(props.size - 24) / 2} size={24} />
    </View>
  );
}

export function bulbIcon(tone: LightTone): IconName {
  return TONE_ICON[tone];
}

export function Divider(props: { left: number; top: number; width: number }) {
  return <View class="absolute" style={{ insetL: props.left, insetT: props.top, width: props.width, height: 1, bgColor: theme.divider }} />;
}
