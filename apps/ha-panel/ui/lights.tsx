import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { Focusable } from "@pocketjs/framework/components";
import { abgr, hsvToRgb } from "../color";
import type { LightId, PanelAction, PanelState } from "../model";
import { theme } from "../theme";
import { HorizontalSlider } from "./controls";

const TILES: readonly { id: LightId; name: string }[] = [
  { id: "desk", name: "Desk" },
  { id: "shelf", name: "Shelf" },
  { id: "onboard", name: "RGB" },
  { id: "remote", name: "HA" },
];
const PRESET_HUES = [0, 32, 120, 180, 210, 300] as const;

interface LightsCardProps {
  state: PanelState;
  haLightEnabled: boolean;
  onAction(action: PanelAction): void;
}

function LightTile(props: LightsCardProps & { lightId: LightId; name: string; index: number }) {
  const light = () => props.state.lights[props.lightId];
  const enabled = props.lightId !== "remote" || props.haLightEnabled;
  return (
    <Focusable
      class="absolute"
      style={{
        insetL: 16 + props.index * 88,
        insetT: 38,
        width: 80,
        height: 48,
        bgColor: theme.card,
        radius: theme.tileRadius,
        borderWidth: 1,
        borderColor: props.state.selected === props.lightId ? theme.primary : theme.divider,
      }}
      onPress={enabled ? () => {
        props.onAction({ type: "select-light", lightId: props.lightId });
        props.onAction({ type: "toggle-light", lightId: props.lightId });
      } : undefined}
    >
      <View class="absolute left-[7] top-[8] w-[10] h-[10] rounded-[5]" style={{ bgColor: light().on && enabled ? abgr(hsvToRgb(light().hue)) : theme.disabledText }} />
      <Text class="absolute left-[23] top-[6] text-xs" style={{ textColor: enabled ? theme.text : theme.disabledText }}>{props.name}</Text>
      <Text class="absolute left-[7] top-[27] text-2xs" style={{ textColor: light().on && enabled ? theme.lightActive : theme.secondaryText }}>
        {enabled ? (light().on ? "ON" : "OFF") : "未启用"}
      </Text>
    </Focusable>
  );
}

export function LightsCard(props: LightsCardProps) {
  const light = () => props.state.lights[props.state.selected];
  return (
    <View class="absolute left-[12] top-[256] w-[376] h-[228]" style={{ radius: theme.cardRadius, bgColor: theme.card }}>
      <Text class="absolute left-[18] top-[12] text-xs" style={{ textColor: theme.secondaryText }}>灯光</Text>
      <For each={TILES}>{(tile, index) => (
        <LightTile {...props} lightId={tile.id} name={tile.name} index={index()} />
      )}</For>
      <Text class="absolute left-[18] top-[96] text-2xs" style={{ textColor: theme.secondaryText }}>亮度</Text>
      <Text class="absolute left-[310] top-[96] w-[48] text-right text-2xs" style={{ textColor: theme.text }}>
        {String(light().brightness)}
      </Text>
      <HorizontalSlider
        left={18}
        screenLeft={30}
        top={116}
        width={340}
        value={light().brightness}
        max={255}
        onChange={brightness => props.onAction({ type: "set-brightness", lightId: props.state.selected, brightness })}
      />
      <For each={PRESET_HUES}>{(hue, index) => (
        <Focusable
          class="absolute rounded-[6]"
          style={{ insetL: 18 + index() * 56, insetT: 148, width: 28, height: 24, bgColor: abgr(hsvToRgb(hue)), borderWidth: 1, borderColor: theme.divider }}
          onPress={() => props.onAction({ type: "set-hue", lightId: props.state.selected, hue })}
        />
      )}</For>
      <Text class="absolute left-[18] top-[180] text-2xs" style={{ textColor: theme.secondaryText }}>色相</Text>
      <Text class="absolute left-[306] top-[180] w-[52] text-right text-2xs" style={{ textColor: theme.text }}>
        {`${light().hue}°`}
      </Text>
      <HorizontalSlider
        left={18}
        screenLeft={30}
        top={200}
        width={340}
        value={light().hue}
        max={359}
        colors={PRESET_HUES.map(hue => abgr(hsvToRgb(hue)))}
        onChange={hue => props.onAction({ type: "set-hue", lightId: props.state.selected, hue })}
      />
    </View>
  );
}
