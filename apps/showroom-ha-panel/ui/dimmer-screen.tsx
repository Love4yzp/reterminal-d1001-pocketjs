import { Text, View } from "@pocketjs/framework/solid/components";
import { brightnessFromPercent, percentFromBrightness, type DimmerMode } from "../dimmer";
import { lightColor, lightInfo, lightStatusText } from "../lights";
import {
  isLightAvailable,
  type LightId,
  type PanelAction,
  type PanelState,
} from "../model";
import type { NavEvent } from "../navigation";
import { theme } from "../theme";
import { ColorWheel, ModeButton, VerticalSlider } from "./controls";
import { Icon, Numerals, Pressable } from "./primitives";

interface DimmerProps {
  state: PanelState;
  lightId: LightId;
  mode: DimmerMode;
  onMode(mode: DimmerMode): void;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
}

export function DimmerScreen(props: DimmerProps) {
  const light = () => props.state.lights[props.lightId]!;
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const percent = () => percentFromBrightness(light().brightness);
  const back = () => {
    if (props.mode === "color") props.onMode("brightness");
    else props.onNav({ type: "back" });
  };
  const toggleColor = () => {
    if (enabled()) props.onMode(props.mode === "brightness" ? "color" : "brightness");
  };
  const setBrightness = (value: number) => props.onAction({
    type: "set-brightness",
    lightId: props.lightId,
    brightness: brightnessFromPercent(value),
  });
  const setColor = (hue: number, saturation: number) => props.onAction({
    type: "set-color",
    lightId: props.lightId,
    hue,
    saturation,
  });
  return (
    <View
      class="absolute"
      style={{ insetL: 0, insetT: 0, width: 400, height: 640, bgColor: theme.page }}
    >
      <Pressable
        box={{ left: 0, top: 0, width: 240, height: 52 }}
        onTap={back}
      >
        <Icon name="back-text" left={16} top={14} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 15, width: 182, textColor: theme.text }}>
          {lightInfo(props.state, props.lightId).name}
        </Text>
      </Pressable>
      <Text class="absolute text-xs text-right" style={{ insetL: 240, insetT: 19, width: 144, textColor: enabled() ? theme.secondaryText : theme.disabledText }}>
        {lightStatusText(props.state, props.lightId)}
      </Text>

      <Numerals text={`${percent()}%`} size={56} left={200} top={74} center />
      {props.mode === "brightness" ? (
        <>
          <VerticalSlider
            left={132}
            top={142}
            screenTop={142}
            width={136}
            height={306}
            value={percent()}
            color={lightColor(light())}
            on={light().on}
            enabled={enabled()}
            onChange={setBrightness}
          />
          <Text class="absolute text-2xs text-center" style={{ insetL: 20, insetT: 456, width: 360, textColor: theme.disabledText }}>上下拖动调亮度</Text>
        </>
      ) : (
        <>
          <ColorWheel
            left={72}
            top={132}
            size={256}
            hue={light().hue}
            saturation={light().saturation}
            enabled={enabled()}
            onChange={setColor}
          />
          <Text class="absolute text-2xs text-center" style={{ insetL: 20, insetT: 396, width: 360, textColor: theme.disabledText }}>拖动色盘选颜色</Text>
        </>
      )}

      <ModeButton
        left={122}
        top={492}
        size={56}
        icon={light().on ? "power-page" : "power-secondary"}
        label={light().on ? "关灯" : "开灯"}
        background={light().on ? theme.on : theme.secondaryBackground}
        labelColor={light().on ? theme.on : theme.secondaryText}
        enabled={enabled()}
        onTap={() => { if (enabled()) props.onAction({ type: "toggle-light", lightId: props.lightId }); }}
      />
      <ModeButton
        left={222}
        top={492}
        size={56}
        icon={props.mode === "brightness" ? "color-primary" : "bulb-primary"}
        label={props.mode === "brightness" ? "颜色" : "亮度"}
        background={props.mode === "brightness" ? theme.secondaryBackground : theme.primaryChip}
        labelColor={props.mode === "brightness" ? theme.secondaryText : theme.primary}
        enabled={enabled()}
        onTap={toggleColor}
      />
    </View>
  );
}
