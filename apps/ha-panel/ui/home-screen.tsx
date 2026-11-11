import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatChineseDate, formatClock } from "../clock";
import { percentFromBrightness } from "../dimmer";
import { LIGHT_INFO, lightStatusText, lightTone } from "../lights";
import {
  availableLights,
  isLightAvailable,
  LIGHT_IDS,
  type LightId,
  type PanelAction,
  type PanelState,
} from "../model";
import type { NetworkInfo } from "../native";
import { tileIntent, type NavEvent } from "../navigation";
import { SCENES, sceneAction } from "../scenes";
import { theme } from "../theme";
import { weatherIcon, weatherLabel, weatherTemperature } from "../weather";
import { BulbChip, Icon, Numerals, Pressable } from "./primitives";
import { StatusBar } from "./status-bar";

interface HomeProps {
  state: PanelState;
  network: NetworkInfo;
  utcOffsetMinutes: number;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
}

function LightTile(props: HomeProps & { lightId: LightId; index: number }) {
  const light = () => props.state.lights[props.lightId];
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const tone = () => lightTone(props.state, props.lightId);
  const left = 16 + (props.index % 2) * 190;
  const top = 130 + Math.floor(props.index / 2) * 128;
  const intent = (gesture: "tap" | "long-press") => {
    const next = tileIntent(gesture, props.lightId, availableLights(props.state));
    if (next.action) props.onAction(next.action);
    if (next.nav) props.onNav(next.nav);
  };
  return (
    <Pressable
      box={{ left, top, width: 178, height: 116 }}
      style={{ radius: 12, bgColor: enabled() && light().on ? theme.tileOn : theme.card }}
      onTap={() => intent("tap")}
      onLongPress={() => intent("long-press")}
    >
      <BulbChip tone={tone()} left={14} top={14} size={40} />
      <Text
        class="absolute text-sm font-bold"
        style={{ insetL: 14, insetT: 54, width: 150, textColor: enabled() ? theme.text : theme.secondaryText }}
      >
        {LIGHT_INFO[props.lightId].name}
      </Text>
      <Text
        class="absolute text-xs"
        style={{ insetL: 14, insetT: 75, width: 150, textColor: enabled() ? theme.secondaryText : theme.disabledText }}
      >
        {lightStatusText(props.state, props.lightId)}
      </Text>
      {enabled() && light().on ? (
        <View class="absolute" style={{ insetL: 14, insetT: 99, width: 150, height: 4, radius: 2, bgColor: theme.secondaryBackground }}>
          <View
            class="absolute"
            style={{
              insetL: 0,
              insetT: 0,
              width: Math.round(150 * percentFromBrightness(light().brightness) / 100),
              height: 4,
              radius: 2,
              bgColor: tone() === "cool" ? theme.primary : theme.on,
            }}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

export function HomeScreen(props: HomeProps) {
  const weather = () => props.state.haConnected ? props.state.weather : null;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640 }}>
      <StatusBar network={props.network} state={props.state} />
      {props.state.clockEpochSeconds === null ? (
        <Text class="absolute text-2xl font-bold" style={{ insetL: 20, insetT: 48, width: 220, textColor: theme.text }}>--:--</Text>
      ) : (
        <Numerals text={formatClock(props.state.clockEpochSeconds, props.utcOffsetMinutes)} size={56} left={20} top={38} />
      )}
      <Text class="absolute text-sm" style={{ insetL: 20, insetT: 96, width: 220, textColor: theme.secondaryText }}>
        {formatChineseDate(props.state.clockEpochSeconds, props.utcOffsetMinutes)}
      </Text>
      {weather() ? (
        <View class="absolute" style={{ insetL: 310, insetT: 36, width: 70, height: 86 }}>
          <Icon name={weatherIcon(weather()!)} left={15} top={0} size={40} />
          <Text class="absolute text-2xl font-bold text-right" style={{ insetL: 0, insetT: 46, width: 70, textColor: theme.text }}>
            {weatherTemperature(weather()!)}
          </Text>
          <Text class="absolute text-xs text-right" style={{ insetL: 0, insetT: 76, width: 70, textColor: theme.secondaryText }}>
            {weatherLabel(weather()!)}
          </Text>
        </View>
      ) : null}
      <For each={LIGHT_IDS}>{(lightId, index) => (
        <LightTile {...props} lightId={lightId} index={index()} />
      )}</For>
      <Text class="absolute text-xs" style={{ insetL: 16, insetT: 390, width: 100, textColor: theme.secondaryText }}>场景</Text>
      <For each={SCENES}>{(scene, index) => {
        const left = 16 + Math.round(index() * 376 / 3);
        const nextLeft = 16 + Math.round((index() + 1) * 376 / 3);
        return (
          <Pressable
            box={{ left, top: 413, width: nextLeft - left - 8, height: 48 }}
            style={{ radius: 12, bgColor: theme.card }}
            onTap={() => props.onAction(sceneAction(props.state, scene.id))}
          >
            <Text class="absolute text-sm text-center" style={{ insetL: 0, insetT: 15, width: nextLeft - left - 8, textColor: theme.text }}>
              {scene.label}
            </Text>
          </Pressable>
        );
      }}</For>
    </View>
  );
}
