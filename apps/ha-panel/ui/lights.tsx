import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { Focusable } from "@pocketjs/framework/components";
import { applyBrightness, argb, hsvToRgb } from "../color";
import type { LightId, PanelAction, PanelState } from "../model";
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
  const light = props.state.lights[props.lightId];
  const enabled = props.lightId !== "remote" || props.haLightEnabled;
  const color = applyBrightness(hsvToRgb(light.hue), light.on ? light.brightness : 0);
  return (
    <Focusable
      class={props.state.selected === props.lightId
        ? "absolute rounded-[10] border border-[#f4b856]"
        : "absolute rounded-[10] border border-[#30405a]"}
      style={{ insetL: 16 + props.index * 88, insetT: 38, width: 80, height: 48, bgColor: 0xff24334b }}
      onPress={enabled ? () => {
        props.onAction({ type: "select-light", lightId: props.lightId });
        props.onAction({ type: "toggle-light", lightId: props.lightId });
      } : undefined}
    >
      <View class="absolute left-[7] top-[8] w-[10] h-[10] rounded-[5]" style={{ bgColor: argb(color) }} />
      <Text class="absolute left-[23] top-[6] text-xs text-white">{props.name}</Text>
      <Text class="absolute left-[7] top-[27] text-2xs text-[#c5d0df]">
        {enabled ? (light.on ? "ON" : "OFF") : "未启用"}
      </Text>
    </Focusable>
  );
}

export function LightsCard(props: LightsCardProps) {
  const light = props.state.lights[props.state.selected];
  const color = argb(applyBrightness(hsvToRgb(light.hue), light.on ? light.brightness : 0));
  return (
    <View class="absolute left-[12] top-[256] w-[376] h-[228] rounded-[18] bg-[#172033]">
      <Text class="absolute left-[18] top-[12] text-xs text-[#9eabc0]">灯光</Text>
      <For each={TILES}>{(tile, index) => (
        <LightTile {...props} lightId={tile.id} name={tile.name} index={index()} />
      )}</For>
      <Text class="absolute left-[18] top-[96] text-2xs text-[#9eabc0]">亮度</Text>
      <Text class="absolute left-[310] top-[96] w-[48] text-right text-2xs text-[#f4f7fb]">
        {String(light.brightness)}
      </Text>
      <HorizontalSlider
        left={18}
        screenLeft={30}
        top={116}
        width={340}
        value={light.brightness}
        max={255}
        fillColor={color}
        onChange={brightness => props.onAction({ type: "set-brightness", lightId: props.state.selected, brightness })}
      />
      <For each={PRESET_HUES}>{(hue, index) => (
        <Focusable
          class="absolute rounded-[6] border border-[#30405a]"
          style={{ insetL: 18 + index() * 56, insetT: 148, width: 28, height: 24, bgColor: argb(hsvToRgb(hue)) }}
          onPress={() => props.onAction({ type: "set-hue", lightId: props.state.selected, hue })}
        />
      )}</For>
      <Text class="absolute left-[18] top-[180] text-2xs text-[#9eabc0]">色相</Text>
      <Text class="absolute left-[306] top-[180] w-[52] text-right text-2xs text-[#f4f7fb]">
        {`${light.hue}°`}
      </Text>
      <HorizontalSlider
        left={18}
        screenLeft={30}
        top={200}
        width={340}
        value={light.hue}
        max={359}
        fillColor={argb(hsvToRgb(light.hue))}
        colors={PRESET_HUES.map(hue => argb(hsvToRgb(hue)))}
        onChange={hue => props.onAction({ type: "set-hue", lightId: props.state.selected, hue })}
      />
    </View>
  );
}
