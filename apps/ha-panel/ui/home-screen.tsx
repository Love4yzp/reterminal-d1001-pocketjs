import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatChineseDate, formatClock } from "../clock";
import type { PanelAction, PanelState } from "../model";
import type { NetworkInfo } from "../native";
import type { NavEvent } from "../navigation";
import { SHOWROOM } from "../showroom";
import { theme } from "../theme";
import { weatherIcon, weatherLabel, weatherTemperature } from "../weather";
import { Icon, Numerals } from "./primitives";
import { LightTile, SceneButton, SensorCard, type FocusProps } from "./showroom-cards";
import { StatusBar } from "./status-bar";

interface HomeProps extends FocusProps {
  state: PanelState;
  network: NetworkInfo;
  utcOffsetMinutes: number;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
  onScene(sceneId: string): void;
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
      <For each={SHOWROOM.home.lights}>{(lightId, index) => (
        <LightTile
          state={props.state}
          lightId={lightId}
          box={{ left: 16 + (index() % 2) * 190, top: 130 + Math.floor(index() / 2) * 128, width: 178, height: 116 }}
          focus={props.focus}
          onFocus={props.onFocus}
          onAction={props.onAction}
          onNav={props.onNav}
        />
      )}</For>
      <Text class="absolute text-xs" style={{ insetL: 16, insetT: 390, width: 100, textColor: theme.secondaryText }}>场景</Text>
      <For each={SHOWROOM.home.scenes}>{(sceneId, index) => {
        const left = 16 + Math.round(index() * 376 / 3);
        const nextLeft = 16 + Math.round((index() + 1) * 376 / 3);
        return (
          <SceneButton
            state={props.state}
            sceneId={sceneId}
            box={{ left, top: 413, width: nextLeft - left - 8, height: 48 }}
            focus={props.focus}
            onFocus={props.onFocus}
            onScene={props.onScene}
          />
        );
      }}</For>
      <For each={SHOWROOM.home.sensors}>{(sensorId, index) => (
        <SensorCard
          state={props.state}
          sensorId={sensorId}
          box={{ left: 16 + index() * 190, top: 480, width: 178, height: 82 }}
          compact
          focus={props.focus}
          onFocus={props.onFocus}
          onNav={props.onNav}
        />
      )}</For>
    </View>
  );
}
