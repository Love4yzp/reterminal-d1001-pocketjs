import { For } from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { Text, View } from "@pocketjs/framework/solid/components";
import { abgr, hsvToRgb } from "../color";
import { brightnessFromPercent, COLOR_PRESETS, percentFromBrightness, swipeDirection } from "../dimmer";
import { sameFocus } from "../input";
import { lightInfo, lightStatusText, lightTone } from "../lights";
import {
  availableLights,
  isLightAvailable,
  type LightId,
  type PanelAction,
  type PanelState,
} from "../model";
import type { NavEvent } from "../navigation";
import { slidingWindow } from "../showroom";
import { theme } from "../theme";
import { VerticalSlider } from "./controls";
import { bulbIcon, Icon, Numerals, Pressable } from "./primitives";
import type { FocusProps } from "./showroom-cards";

interface DimmerProps extends FocusProps {
  state: PanelState;
  lightId: LightId;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
}

export function DimmerScreen(props: DimmerProps) {
  let surface: NodeMirror | undefined;
  const light = () => props.state.lights[props.lightId];
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const percent = () => percentFromBrightness(light().brightness);
  createGesture({
    region: { node: () => surface },
    axis: "x",
    onPanEnd: contact => {
      const direction = swipeDirection(contact.dx, contact.dy);
      if (direction !== 0)
        props.onNav({
          type: "cycle-light",
          direction,
          available: availableLights(props.state),
          order: props.state.lightOrder,
        });
    },
  });
  return (
    <View
      ref={node => { surface = node; }}
      class="absolute"
      style={{ insetL: 0, insetT: 0, width: 400, height: 640, bgColor: theme.page }}
    >
      <Pressable
        box={{ left: 0, top: 0, width: 238, height: 44 }}
        focused={sameFocus(props.focus, { kind: "back", id: "back" })}
        onTap={() => props.onNav({ type: "back" })}
      >
        <Icon name="back-text" left={16} top={8} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 10, width: 180, textColor: theme.text }}>
          {lightInfo(props.state, props.lightId).name}
        </Text>
      </Pressable>
      <Text class="absolute text-xs text-right" style={{ insetL: 260, insetT: 13, width: 124, textColor: theme.disabledText }}>
        {enabled() ? lightInfo(props.state, props.lightId).tag : lightStatusText(props.state, props.lightId)}
      </Text>
      <View class="absolute" style={{ insetL: 0, insetT: 44, width: 400, height: 64 }}>
        <For each={slidingWindow(props.state.lightOrder, props.lightId, 4)}>{(lightId, index) => {
          const selected = () => props.lightId === lightId;
          const available = () => isLightAvailable(props.state, lightId);
          return (
            <Pressable
              box={{ left: 16 + index() * 94, top: 0, width: 86, height: 64 }}
              focused={sameFocus(props.focus, { kind: "light", id: lightId })}
              style={{
                radius: 12,
                bgColor: selected() ? theme.secondaryBackground : theme.card,
                borderWidth: selected() ? 2 : 0,
                borderColor: theme.primary,
              }}
              onTap={() => {
                props.onFocus({ kind: "light", id: lightId });
                props.onNav({ type: "select-light", lightId, available: availableLights(props.state) });
              }}
            >
              <Icon name={bulbIcon(lightTone(props.state, lightId))} left={31} top={8} size={24} />
              <Text
                class="absolute text-2xs text-center"
                style={{
                  insetL: 0,
                  insetT: 39,
                  width: 86,
                  textColor: selected() ? theme.text : available() ? theme.secondaryText : theme.disabledText,
                }}
              >
                {lightInfo(props.state, lightId).chip}
              </Text>
            </Pressable>
          );
        }}</For>
      </View>
      <Numerals text={`${percent()}%`} size={44} left={200} top={130} center />
      <VerticalSlider
        left={134}
        top={188}
        screenTop={188}
        value={percent()}
        enabled={enabled()}
        onChange={value => props.onAction({
          type: "set-brightness",
          lightId: props.lightId,
          brightness: brightnessFromPercent(value),
        })}
      />
      <For each={COLOR_PRESETS}>{(preset, index) => {
        const left = index() < 2 ? 60 + index() * 56 : 240 + (index() - 2) * 56;
        return (
          <Pressable
            box={{ left, top: 478, width: 44, height: 44 }}
            style={{ radius: 22, bgColor: abgr(hsvToRgb(preset.hue, preset.saturation / 100)) }}
            onTap={() => props.onAction({
              type: "set-color",
              lightId: props.lightId,
              hue: preset.hue,
              saturation: preset.saturation,
            })}
          />
        );
      }}</For>
      <Pressable
        box={{ left: 172, top: 478, width: 56, height: 56 }}
        style={{ radius: 28, bgColor: light().on && enabled() ? theme.on : theme.secondaryBackground }}
        onTap={() => props.onAction({ type: "toggle-light", lightId: props.lightId })}
      >
        <Icon name={light().on && enabled() ? "power-page" : "power-secondary"} left={14} top={14} size={28} />
      </Pressable>
      <Text class="absolute text-2xs text-center" style={{ insetL: 20, insetT: 550, width: 360, textColor: theme.disabledText }}>
        上下拖动调亮度，左右滑动切换灯
      </Text>
    </View>
  );
}
