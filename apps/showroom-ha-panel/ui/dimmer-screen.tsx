import { Text, View } from "@pocketjs/framework/solid/components";
import { brightnessFromPercent, percentFromBrightness } from "../dimmer";
import { lightInfo, lightStatusText } from "../lights";
import {
  isLightAvailable,
  type LightId,
  type PanelAction,
  type PanelState,
} from "../model";
import type { NavEvent } from "../navigation";
import { theme } from "../theme";
import { ColorSlider, VerticalSlider } from "./controls";
import { Icon, Numerals, Pressable } from "./primitives";

interface DimmerProps {
  state: PanelState;
  lightId: LightId;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
}

export function DimmerScreen(props: DimmerProps) {
  const light = () => props.state.lights[props.lightId];
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const percent = () => percentFromBrightness(light().brightness);
  return (
    <View
      class="absolute"
      style={{ insetL: 0, insetT: 0, width: 400, height: 640, bgColor: theme.page }}
    >
      <Pressable
        box={{ left: 0, top: 0, width: 238, height: 44 }}
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
      <Pressable
        box={{ left: 300, top: 294, width: 56, height: 56 }}
        style={{ radius: 28, bgColor: light().on && enabled() ? theme.on : theme.secondaryBackground }}
        onTap={() => props.onAction({ type: "toggle-light", lightId: props.lightId })}
      >
        <Icon name={light().on && enabled() ? "power-page" : "power-secondary"} left={14} top={14} size={28} />
      </Pressable>
      <ColorSlider
        kind="hue" label="色相" left={24} top={476} labelWidth={60} width={292}
        hue={light().hue} saturation={light().saturation} enabled={enabled()}
        onChange={(hue, saturation) => props.onAction({ type: "set-color", lightId: props.lightId, hue, saturation })}
      />
      <ColorSlider
        kind="saturation" label="饱和度" left={24} top={528} labelWidth={60} width={292}
        hue={light().hue} saturation={light().saturation} enabled={enabled()}
        onChange={(hue, saturation) => props.onAction({ type: "set-color", lightId: props.lightId, hue, saturation })}
      />
      <Text class="absolute text-2xs text-center" style={{ insetL: 20, insetT: 590, width: 360, textColor: theme.disabledText }}>
        上下拖动调亮度
      </Text>
    </View>
  );
}
