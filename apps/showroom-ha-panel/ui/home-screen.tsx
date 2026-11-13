import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatClock, formatLocalizedDate } from "../clock";
import { PORTRAIT_HOME, portraitActionBox, portraitSensorBox } from "../home-layout";
import { languageToggleLabel, pick, type Language } from "../i18n";
import type { PanelAction, PanelState } from "../model";
import type { NetworkInfo } from "../native";
import type { NavEvent } from "../navigation";
import { SHOWROOM } from "../showroom";
import { theme } from "../theme";
import { weatherIcon, weatherLabel, weatherTemperature } from "../weather";
import { ActionButton, MainLightControl } from "./console-controls";
import { HomeArmActions } from "./home-arm-actions";
import { Icon, Numerals, Pressable } from "./primitives";
import { SensorCard } from "./showroom-cards";
import { StatusBar } from "./status-bar";

interface HomeProps {
  state: PanelState;
  network: NetworkInfo;
  language: Language;
  utcOffsetMinutes: number;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
  onHaAction(actionId: string, confirmed: boolean): void;
  onLanguageToggle(): void;
  actionConfigured(actionId: string): boolean;
}

export function HomeScreen(props: HomeProps) {
  const weather = () => props.state.haConnected ? props.state.weather : null;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: PORTRAIT_HOME.width, height: PORTRAIT_HOME.height }}>
      <StatusBar network={props.network} state={props.state} language={props.language} />
      {props.state.clockEpochSeconds === null ? (
        <Text class="absolute text-2xl font-bold" style={{ insetL: 20, insetT: 44, width: 220, textColor: theme.text }}>--:--</Text>
      ) : (
        <Numerals text={formatClock(props.state.clockEpochSeconds, props.utcOffsetMinutes)} size={56} left={20} top={PORTRAIT_HOME.clockTop} />
      )}
      <Text class="absolute text-sm" style={{ insetL: 20, insetT: PORTRAIT_HOME.dateTop, width: 176, textColor: theme.secondaryText }}>
        {formatLocalizedDate(props.state.clockEpochSeconds, props.utcOffsetMinutes, props.language)}
      </Text>
      <Pressable
        box={PORTRAIT_HOME.language}
        style={{ radius: 17, bgColor: theme.secondaryBackground }}
        onTap={props.onLanguageToggle}
      >
        <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 9, width: PORTRAIT_HOME.language.width, textColor: theme.text }}>
          {languageToggleLabel(props.language)}
        </Text>
      </Pressable>
      {weather() ? (
        <View class="absolute" style={{ insetL: PORTRAIT_HOME.weather.left, insetT: PORTRAIT_HOME.weather.top, width: PORTRAIT_HOME.weather.width, height: PORTRAIT_HOME.weather.height }}>
          <Icon name={weatherIcon(weather()!)} left={0} top={4} size={30} />
          <Text class="absolute text-2xs text-right" style={{ insetL: 34, insetT: 2, width: PORTRAIT_HOME.weather.width - 34, textColor: theme.secondaryText }}>
            {weatherLabel(weather()!, props.language)}
          </Text>
          <Text class="absolute text-2xl font-bold text-right" style={{ insetL: 0, insetT: 30, width: PORTRAIT_HOME.weather.width, textColor: theme.text }}>
            {weatherTemperature(weather()!)}
          </Text>
        </View>
      ) : null}
      <For each={SHOWROOM.home.sensors}>{(sensorId, index) => (
        <SensorCard
          state={props.state}
          language={props.language}
          sensorId={sensorId}
          box={portraitSensorBox(index())}
          compact
          onNav={props.onNav}
        />
      )}</For>
      <MainLightControl
        {...props}
        lightId={SHOWROOM.home.lights[0]!}
        box={PORTRAIT_HOME.mainLight}
      />
      <Text class="absolute text-sm font-bold" style={{ insetL: 16, insetT: PORTRAIT_HOME.quickTitleTop, width: 220, textColor: theme.text }}>
        {pick(props.language, "快捷指令", "Quick Actions")}
      </Text>
      <Text class="absolute text-2xs text-right" style={{ insetL: 236, insetT: PORTRAIT_HOME.quickTitleTop + 3, width: 148, textColor: theme.secondaryText }}>
        {pick(props.language, "由 HA 执行", "Runs on HA")}
      </Text>
      <For each={SHOWROOM.home.actions}>{(actionId, index) => (
        <ActionButton
          state={props.state}
          language={props.language}
          actionId={actionId}
          box={portraitActionBox(index())}
          configured={props.actionConfigured(actionId)}
          onHaAction={props.onHaAction}
        />
      )}</For>
      <HomeArmActions
        state={props.state}
        language={props.language}
        box={PORTRAIT_HOME.armActions}
        actionConfigured={props.actionConfigured}
        onHaAction={props.onHaAction}
      />
    </View>
  );
}
