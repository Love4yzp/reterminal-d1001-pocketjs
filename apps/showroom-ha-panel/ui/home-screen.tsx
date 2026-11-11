import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatChineseDate, formatClock } from "../clock";
import type { PanelAction, PanelState } from "../model";
import type { NetworkInfo } from "../native";
import type { NavEvent } from "../navigation";
import { SHOWROOM } from "../showroom";
import { theme } from "../theme";
import { weatherIcon, weatherLabel, weatherTemperature } from "../weather";
import { ActionButton, MainLightControl } from "./console-controls";
import { HomeArmActions } from "./home-arm-actions";
import { Icon, Numerals } from "./primitives";
import { SensorCard } from "./showroom-cards";
import { StatusBar } from "./status-bar";

interface HomeProps {
  state: PanelState;
  network: NetworkInfo;
  utcOffsetMinutes: number;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
  onHaAction(actionId: string, confirmed: boolean): void;
  actionConfigured(actionId: string): boolean;
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
        <View class="absolute" style={{ insetL: 310, insetT: 36, width: 70, height: 66 }}>
          <Icon name={weatherIcon(weather()!)} left={0} top={0} size={28} />
          <Text class="absolute text-2xs text-right" style={{ insetL: 32, insetT: 8, width: 38, textColor: theme.secondaryText }}>
            {weatherLabel(weather()!)}
          </Text>
          <Text class="absolute text-2xl font-bold text-right" style={{ insetL: 0, insetT: 34, width: 70, textColor: theme.text }}>
            {weatherTemperature(weather()!)}
          </Text>
        </View>
      ) : null}
      <MainLightControl
        {...props}
        lightId={SHOWROOM.home.lights[0]!}
        box={{ left: 16, top: 110, width: 368, height: 78 }}
      />
      <For each={SHOWROOM.home.sensors}>{(sensorId, index) => (
        <SensorCard
          state={props.state}
          sensorId={sensorId}
          box={{ left: 16 + index() * 190, top: 198, width: 178, height: 66 }}
          compact
          onNav={props.onNav}
        />
      )}</For>
      <Text class="absolute text-sm font-bold" style={{ insetL: 16, insetT: 274, width: 190, textColor: theme.text }}>Reachy 快捷操作</Text>
      <Text class="absolute text-2xs text-right" style={{ insetL: 224, insetT: 278, width: 160, textColor: theme.secondaryText }}>由 HA 执行</Text>
      <For each={SHOWROOM.home.actions}>{(actionId, index) => (
        <ActionButton
          state={props.state}
          actionId={actionId}
          box={{ left: 16 + (index() % 3) * 126, top: 300 + Math.floor(index() / 3) * 52, width: 118, height: 44 }}
          configured={props.actionConfigured(actionId)}
          onHaAction={props.onHaAction}
        />
      )}</For>
      <HomeArmActions
        state={props.state}
        box={{ left: 16, top: 406, width: 368, height: 92 }}
        actionConfigured={props.actionConfigured}
        onHaAction={props.onHaAction}
      />
    </View>
  );
}
