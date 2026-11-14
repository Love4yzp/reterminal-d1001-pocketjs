import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { pick, themeLabel } from "../i18n";
import { profileLabel, PROFILES, type OpsState } from "../model";
import { canSwitchNetwork, formatRssi, requestNextPreset, type NetworkInfo } from "../native";
import type { OpsProfileId } from "../protocol";
import { SCREEN_OFF_OPTIONS, screenOffLabel, type SettingsAction, type SettingsState } from "../settings";
import { THEME_ORDER, type OpsTheme, type ThemeId } from "../theme";
import { BacklightBar, Pressable } from "./primitives";

export function SystemScreen(props: {
  state: OpsState;
  settings: SettingsState;
  network: NetworkInfo;
  firmwareVersion: string;
  gatewayUrl: string;
  theme: OpsTheme;
  onSelectTheme(themeId: ThemeId): void;
  onSelectProfile(profileId: OpsProfileId): void;
  onLanguageToggle(): void;
  onSettings(action: SettingsAction): void;
  onRotate(landscape: boolean): void;
}) {
  const lang = () => props.state.language;
  const presetSupported = canSwitchNetwork();

  return (
    <View class="absolute" style={{ insetL: 0, insetT: 32, width: 400, height: 540 }}>
      <Text
        class="absolute text-xl font-bold"
        style={{ insetL: 16, insetT: 8, width: 260, textColor: props.theme.text }}
      >
        {pick(lang(), "系统与现场配置", "System & Provisioning")}
      </Text>

      <View
        class="absolute"
        style={{ insetL: 16, insetT: 40, width: 368, height: 80, radius: props.theme.cardRadius, bgColor: props.theme.card }}
      >
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 10, width: 260, textColor: props.theme.secondaryText }}>
          {pick(lang(), "界面主题（秒级热切换）", "HMI Theme (Live Swap)")}
        </Text>
        <For each={THEME_ORDER}>{(id, index) => {
          const active = () => props.state.themeId === id;
          return (
            <Pressable
              box={{ left: 14 + index() * 116, top: 36, width: 108, height: 34 }}
              style={{
                radius: 8,
                bgColor: active() ? props.theme.accent : props.theme.cardElevated,
              }}
              muted={props.state.muted}
              onTap={() => props.onSelectTheme(id)}
            >
              <Text
                class="absolute text-xs font-bold text-center"
                style={{ insetL: 0, insetT: 9, width: 108, textColor: active() ? props.theme.page : props.theme.text }}
              >
                {themeLabel(id, lang())}
              </Text>
            </Pressable>
          );
        }}</For>
      </View>

      <View
        class="absolute"
        style={{ insetL: 16, insetT: 128, width: 368, height: 80, radius: props.theme.cardRadius, bgColor: props.theme.card }}
      >
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 10, width: 260, textColor: props.theme.secondaryText }}>
          {pick(lang(), "行业配置模板", "Device Profile Template")}
        </Text>
        <For each={PROFILES}>{(profile, index) => {
          const active = () => props.state.profileId === profile;
          return (
            <Pressable
              box={{ left: 14 + index() * 116, top: 36, width: 108, height: 34 }}
              style={{
                radius: 8,
                bgColor: active() ? props.theme.accent : props.theme.cardElevated,
              }}
              muted={props.state.muted}
              onTap={() => props.onSelectProfile(profile)}
            >
              <Text
                class="absolute text-xs font-bold text-center"
                style={{ insetL: 0, insetT: 9, width: 108, textColor: active() ? props.theme.page : props.theme.text }}
              >
                {profileLabel(profile, lang())}
              </Text>
            </Pressable>
          );
        }}</For>
      </View>

      <View
        class="absolute"
        style={{ insetL: 16, insetT: 216, width: 368, height: 132, radius: props.theme.cardRadius, bgColor: props.theme.card }}
      >
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 10, width: 160, textColor: props.theme.secondaryText }}>
          {pick(lang(), "背光与熄屏", "Display & Timeout")}
        </Text>
        <Text class="absolute text-xs font-bold text-right" style={{ insetL: 240, insetT: 10, width: 114, textColor: props.theme.text }}>
          {props.settings.backlight === null ? "--" : `${props.settings.backlight}%`}
        </Text>
        <BacklightBar
          box={{ left: 14, top: 38, width: 340, height: 22 }}
          percent={props.settings.backlight}
          theme={props.theme}
          onChange={(percent) => props.onSettings({ type: "backlight", percent })}
        />
        <For each={SCREEN_OFF_OPTIONS}>{(option, index) => {
          const active = () => props.settings.screenOffSeconds === option.seconds;
          return (
            <Pressable
              box={{ left: 14 + index() * 87, top: 78, width: 79, height: 36 }}
              style={{
                radius: 8,
                bgColor: active() ? props.theme.accent : props.theme.cardElevated,
              }}
              muted={props.state.muted}
              onTap={() => props.onSettings({ type: "screen-off", seconds: option.seconds })}
            >
              <Text
                class="absolute text-xs font-bold text-center"
                style={{ insetL: 0, insetT: 10, width: 79, textColor: active() ? props.theme.page : props.theme.text }}
              >
                {screenOffLabel(option, lang())}
              </Text>
            </Pressable>
          );
        }}</For>
      </View>

      <View
        class="absolute"
        style={{ insetL: 16, insetT: 356, width: 368, height: 176, radius: props.theme.cardRadius, bgColor: props.theme.card }}
      >
        <Text class="absolute text-xs font-bold" style={{ insetL: 14, insetT: 12, width: 220, textColor: props.theme.text }}>
          {`Wi-Fi: ${props.network.ssid}`}
        </Text>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 34, width: 230, textColor: props.theme.secondaryText }}>
          {`${props.network.address} · ${formatRssi(props.network.rssi, lang())}`}
        </Text>
        {presetSupported ? (
          <Pressable
            box={{ left: 264, top: 14, width: 90, height: 32 }}
            style={{ radius: 8, bgColor: props.theme.cardElevated }}
            muted={props.state.muted}
            onTap={() => requestNextPreset()}
          >
            <Text class="absolute text-2xs font-bold text-center" style={{ insetL: 0, insetT: 9, width: 90, textColor: props.theme.text }}>
              {pick(lang(), "切换网络", "Switch AP")}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          box={{ left: 14, top: 68, width: 164, height: 42 }}
          style={{ radius: 8, bgColor: props.theme.cardElevated }}
          muted={props.state.muted}
          onTap={props.onLanguageToggle}
        >
          <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 13, width: 164, textColor: props.theme.text }}>
            {pick(lang(), "语言: 中文 / EN", "Language: EN / 中文")}
          </Text>
        </Pressable>
        <Pressable
          box={{ left: 190, top: 68, width: 164, height: 42 }}
          style={{ radius: 8, bgColor: props.theme.accent }}
          muted={props.state.muted}
          onTap={() => props.onRotate(true)}
        >
          <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 13, width: 164, textColor: props.theme.page }}>
            {pick(lang(), "切换横屏模式", "Switch Landscape")}
          </Text>
        </Pressable>

        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 124, width: 340, textColor: props.theme.secondaryText }}>
          {`${pick(lang(), "网关", "GW")}: ${props.gatewayUrl || pick(lang(), "未配置", "Unset")}`}
        </Text>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 146, width: 340, textColor: props.theme.disabledText }}>
          {`${pick(lang(), "固件", "FW")}: ${props.firmwareVersion}`}
        </Text>
      </View>
    </View>
  );
}
