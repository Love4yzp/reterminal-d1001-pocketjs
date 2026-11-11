import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { timezoneLabel } from "../clock";
import type { NetworkInfo } from "../native";
import type { NavEvent } from "../navigation";
import { SCREEN_OFF_OPTIONS, type SettingsAction, type SettingsState } from "../settings";
import { haStatus } from "../status";
import type { PanelState } from "../model";
import { theme } from "../theme";
import { BacklightSlider } from "./controls";
import { Divider, Icon, Pressable } from "./primitives";

interface SettingsProps {
  state: PanelState;
  settings: SettingsState;
  network: NetworkInfo;
  utcOffsetMinutes: number;
  firmwareVersion: string;
  onSettings(action: SettingsAction): void;
  onNav(event: NavEvent): void;
  onRotate(): void;
}

function SectionLabel(props: { top: number; children: string }) {
  return (
    <Text class="absolute text-xs" style={{ insetL: 20, insetT: props.top, width: 200, textColor: theme.secondaryText }}>
      {props.children}
    </Text>
  );
}

export function SettingsScreen(props: SettingsProps) {
  const ha = () => haStatus(props.state);
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640 }}>
      <Text class="absolute text-lg font-bold" style={{ insetL: 20, insetT: 14, width: 200, textColor: theme.text }}>设置</Text>
      <Pressable
        box={{ left: 312, top: 12, width: 72, height: 28 }}
        style={{ radius: 14, bgColor: theme.secondaryBackground }}
        onTap={props.onRotate}
      >
        <Text class="absolute text-xs text-center font-bold" style={{ insetL: 0, insetT: 7, width: 72, textColor: theme.text }}>横屏</Text>
      </Pressable>
      <SectionLabel top={48}>屏幕</SectionLabel>
      <View class="absolute" style={{ insetL: 16, insetT: 74, width: 368, height: 160, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 18, width: 60, textColor: theme.text }}>亮度</Text>
        {props.settings.backlight === null ? (
          <Text class="absolute text-xs text-right" style={{ insetL: 90, insetT: 20, width: 250, textColor: theme.disabledText }}>不可用</Text>
        ) : (
          <BacklightSlider
            left={74}
            top={11}
            screenLeft={90}
            width={264}
            value={props.settings.backlight}
            onChange={percent => props.onSettings({ type: "backlight", percent })}
          />
        )}
        <Divider left={14} top={52} width={340} />
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 70, width: 120, textColor: theme.text }}>自动息屏</Text>
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
                  {option.label}
                </Text>
              </Pressable>
            );
          }}</For>
        </View>
      </View>

      <SectionLabel top={244}>连接</SectionLabel>
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
          <Text class="absolute text-sm" style={{ insetL: 46, insetT: 17, width: 130, textColor: theme.text }}>Home Assistant</Text>
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
          <Text class="absolute text-xs text-right" style={{ insetL: 252, insetT: 19, width: 72, textColor: theme.secondaryText }}>
            {ha().label}
          </Text>
          <Icon name="chevron-secondary" left={338} top={18} size={16} />
        </Pressable>
      </View>

      <SectionLabel top={384}>时间</SectionLabel>
      <View class="absolute" style={{ insetL: 16, insetT: 410, width: 368, height: 52, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 17, width: 90, textColor: theme.text }}>时区</Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 140, insetT: 19, width: 200, textColor: theme.secondaryText }}>
          {timezoneLabel(props.utcOffsetMinutes)}
        </Text>
      </View>

      <SectionLabel top={472}>关于</SectionLabel>
      <View class="absolute" style={{ insetL: 16, insetT: 498, width: 368, height: 52, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 17, width: 90, textColor: theme.text }}>设备地址</Text>
        <Text class="absolute text-2xs text-right" style={{ insetL: 112, insetT: 18, width: 228, textColor: theme.secondaryText }}>
          {`${props.network.address}  固件 ${props.firmwareVersion}`}
        </Text>
      </View>
    </View>
  );
}
