import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { timezoneLabel } from "../clock";
import { languageToggleLabel, pick, type Language } from "../i18n";
import { powerDetailLabel, type NetworkInfo, type PowerInfo } from "../native";
import type { NavEvent } from "../navigation";
import { screenOffLabel, SCREEN_OFF_OPTIONS, type SettingsAction, type SettingsState } from "../settings";
import { haStatus } from "../status";
import type { PanelState } from "../model";
import { theme } from "../theme";
import { BacklightSlider } from "./controls";
import { Divider, Icon, Pressable } from "./primitives";

interface SettingsProps {
  state: PanelState;
  settings: SettingsState;
  network: NetworkInfo;
  power: PowerInfo;
  language: Language;
  utcOffsetMinutes: number;
  firmwareVersion: string;
  onSettings(action: SettingsAction): void;
  onNav(event: NavEvent): void;
  onRotate(): void;
  onLanguageToggle(): void;
}

function SectionLabel(props: { top: number; children: string }) {
  return (
    <Text class="absolute text-xs" style={{ insetL: 20, insetT: props.top, width: 240, textColor: theme.secondaryText }}>
      {props.children}
    </Text>
  );
}

export function SettingsScreen(props: SettingsProps) {
  const ha = () => haStatus(props.state, props.language);
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640 }}>
      <Text class="absolute text-lg font-bold" style={{ insetL: 20, insetT: 14, width: 180, textColor: theme.text }}>
        {pick(props.language, "设置", "Settings")}
      </Text>
      <Pressable
        box={{ left: 214, top: 8, width: 78, height: 36 }}
        style={{ radius: 18, bgColor: theme.secondaryBackground }}
        onTap={props.onLanguageToggle}
      >
        <Text class="absolute text-xs text-center font-bold" style={{ insetL: 0, insetT: 11, width: 78, textColor: theme.text }}>
          {languageToggleLabel(props.language)}
        </Text>
      </Pressable>
      <Pressable
        box={{ left: 300, top: 8, width: 84, height: 36 }}
        style={{ radius: 18, bgColor: theme.secondaryBackground }}
        onTap={props.onRotate}
      >
        <Text class="absolute text-xs text-center font-bold" style={{ insetL: 0, insetT: 11, width: 84, textColor: theme.text }}>
          {pick(props.language, "横屏", "Landscape")}
        </Text>
      </Pressable>
      <SectionLabel top={48}>{pick(props.language, "屏幕", "Display")}</SectionLabel>
      <View class="absolute" style={{ insetL: 16, insetT: 74, width: 368, height: 160, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 18, width: 88, textColor: theme.text }}>
          {pick(props.language, "亮度", "Brightness")}
        </Text>
        {props.settings.backlight === null ? (
          <Text class="absolute text-xs text-right" style={{ insetL: 104, insetT: 20, width: 236, textColor: theme.disabledText }}>
            {pick(props.language, "不可用", "Unavailable")}
          </Text>
        ) : (
          <BacklightSlider
            left={100}
            top={11}
            screenLeft={116}
            width={238}
            value={props.settings.backlight}
            onChange={percent => props.onSettings({ type: "backlight", percent })}
          />
        )}
        <Divider left={14} top={52} width={340} />
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 70, width: 140, textColor: theme.text }}>
          {pick(props.language, "自动息屏", "Auto sleep")}
        </Text>
        <View class="absolute" style={{ insetL: 14, insetT: 104, width: 340, height: 42, radius: 10, bgColor: theme.secondaryBackground }}>
          <For each={SCREEN_OFF_OPTIONS}>{(option, index) => {
            const selected = () => props.settings.screenOffSeconds === option.seconds;
            return (
              <Pressable
                box={{ left: 3 + index() * 84, top: 3, width: 82, height: 36 }}
                style={{ radius: 8, bgColor: selected() ? theme.primary : theme.secondaryBackground }}
                onTap={() => props.onSettings({ type: "screen-off", seconds: option.seconds })}
              >
                <Text
                  class={selected() ? "absolute text-xs text-center font-bold" : "absolute text-xs text-center"}
                  style={{ insetL: 0, insetT: 10, width: 82, textColor: selected() ? theme.white : theme.secondaryText }}
                >
                  {screenOffLabel(option, props.language)}
                </Text>
              </Pressable>
            );
          }}</For>
        </View>
      </View>

      <SectionLabel top={244}>{pick(props.language, "连接", "Connection")}</SectionLabel>
      <View class="absolute" style={{ insetL: 16, insetT: 270, width: 368, height: 104, radius: 12, bgColor: theme.card }}>
        <Pressable box={{ left: 0, top: 0, width: 368, height: 52 }} onTap={() => props.onNav({ type: "open-provision", topic: "wifi" })}>
          <Icon name="wifi-secondary" left={14} top={16} size={20} />
          <Text class="absolute text-sm" style={{ insetL: 46, insetT: 17, width: 100, textColor: theme.text }}>Wi-Fi</Text>
          <Text class="absolute text-xs text-right" style={{ insetL: 150, insetT: 19, width: 174, textColor: theme.secondaryText }}>
            {props.network.ssid}
          </Text>
          <Icon name="chevron-secondary" left={338} top={18} size={16} />
        </Pressable>
        <Divider left={14} top={52} width={340} />
        <Pressable box={{ left: 0, top: 52, width: 368, height: 52 }} onTap={() => props.onNav({ type: "open-provision", topic: "ha" })}>
          <Icon name="home-secondary" left={12} top={14} size={24} />
          <Text class="absolute text-sm" style={{ insetL: 46, insetT: 17, width: 160, textColor: theme.text }}>Home Assistant</Text>
          <View
            class="absolute"
            style={{
              insetL: 238,
              insetT: 22,
              width: 8,
              height: 8,
              radius: 4,
              bgColor: ha().tone === "connected" ? theme.green : ha().tone === "offline" ? theme.on : theme.disabledText,
            }}
          />
          <Text class="absolute text-xs text-right" style={{ insetL: 252, insetT: 19, width: 76, textColor: theme.secondaryText }}>
            {ha().label}
          </Text>
          <Icon name="chevron-secondary" left={338} top={18} size={16} />
        </Pressable>
      </View>

      <SectionLabel top={380}>{pick(props.language, "电源", "Power")}</SectionLabel>
      <View class="absolute" style={{ insetL: 16, insetT: 402, width: 368, height: 46, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 15, width: 112, textColor: theme.text }}>
          {pick(props.language, "电源与电池", "Power & Battery")}
        </Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 128, insetT: 16, width: 226, textColor: props.power.available ? theme.secondaryText : theme.disabledText }}>
          {powerDetailLabel(props.power, props.language)}
        </Text>
      </View>

      <SectionLabel top={456}>{pick(props.language, "关于", "About")}</SectionLabel>
      <View class="absolute" style={{ insetL: 16, insetT: 478, width: 368, height: 84, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 12, width: 100, textColor: theme.text }}>
          {pick(props.language, "时区", "Time zone")}
        </Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 120, insetT: 14, width: 234, textColor: theme.secondaryText }}>
          {timezoneLabel(props.utcOffsetMinutes, props.language)}
        </Text>
        <Divider left={14} top={42} width={340} />
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 54, width: 100, textColor: theme.text }}>
          {pick(props.language, "设备地址", "Device address")}
        </Text>
        <Text class="absolute text-2xs text-right" style={{ insetL: 112, insetT: 55, width: 242, textColor: theme.secondaryText }}>
          {`${props.network.address}  ${pick(props.language, "固件", "Firmware")} ${props.firmwareVersion}`}
        </Text>
      </View>
    </View>
  );
}
