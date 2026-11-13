import { createSignal } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { pick, type Language } from "../i18n";
import type { PanelState } from "../model";
import type { NetworkInfo } from "../native";
import { canSwitchNetwork, formatRssi, requestNextPreset } from "../native";
import type { NavEvent, ProvisionTopic } from "../navigation";
import { haStatus } from "../status";
import { theme } from "../theme";
import { Icon, Pressable } from "./primitives";

type SwitchResult = "idle" | "requested" | "none";

export function ProvisionScreen(props: {
  topic: ProvisionTopic;
  network: NetworkInfo;
  state: PanelState;
  language: Language;
  onNav(event: NavEvent): void;
}) {
  const [switched, setSwitched] = createSignal<SwitchResult>("idle");
  const ha = () => haStatus(props.state, props.language);
  const haTone = () => ha().tone === "connected" ? theme.green : ha().tone === "offline" ? theme.on : theme.disabledText;
  const switchNetwork = () => setSwitched(requestNextPreset() ? "requested" : "none");
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640, bgColor: theme.page }}>
      <Pressable box={{ left: 0, top: 0, width: 250, height: 52 }} onTap={() => props.onNav({ type: "back" })}>
        <Icon name="back-text" left={16} top={14} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 15, width: 184, textColor: theme.text }}>
          {pick(props.language, "连接状态", "Connection")}
        </Text>
      </Pressable>
      <Text class="absolute text-xs" style={{ insetL: 20, insetT: 58, width: 360, textColor: theme.secondaryText }}>
        {props.topic === "wifi"
          ? pick(props.language, "设备当前的 Wi-Fi 与 Home Assistant 连接。", "This device's Wi-Fi and Home Assistant connection.")
          : pick(props.language, "Home Assistant 连接与设备当前的 Wi-Fi。", "Home Assistant connection and this device's Wi-Fi.")}
      </Text>

      <View class="absolute" style={{ insetL: 20, insetT: 88, width: 360, height: 168, radius: 12, bgColor: theme.card }}>
        <View class="absolute" style={{ insetL: 16, insetT: 20, width: 10, height: 10, radius: 5, bgColor: props.network.connected ? theme.green : theme.disabledText }} />
        <Text class="absolute text-sm font-bold" style={{ insetL: 36, insetT: 15, width: 120, textColor: theme.text }}>Wi-Fi</Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 224, insetT: 17, width: 120, textColor: theme.secondaryText }}>
          {props.network.connected ? pick(props.language, "已连接", "Connected") : pick(props.language, "未连接", "Not connected")}
        </Text>
        <View class="absolute" style={{ insetL: 16, insetT: 52, width: 328, height: 1, bgColor: theme.divider }} />
        <Text class="absolute text-xs" style={{ insetL: 16, insetT: 66, width: 110, textColor: theme.secondaryText }}>
          {pick(props.language, "当前网络", "Network")}
        </Text>
        <Text class="absolute text-sm text-right" style={{ insetL: 140, insetT: 64, width: 204, textColor: theme.text }}>{props.network.ssid}</Text>
        <Text class="absolute text-xs" style={{ insetL: 16, insetT: 100, width: 110, textColor: theme.secondaryText }}>
          {pick(props.language, "IP 地址", "IP address")}
        </Text>
        <Text class="absolute text-sm text-right" style={{ insetL: 140, insetT: 98, width: 204, textColor: theme.text }}>{props.network.address}</Text>
        <Text class="absolute text-xs" style={{ insetL: 16, insetT: 134, width: 110, textColor: theme.secondaryText }}>
          {pick(props.language, "信号强度", "Signal")}
        </Text>
        <Text class="absolute text-sm text-right" style={{ insetL: 140, insetT: 132, width: 204, textColor: theme.text }}>
          {formatRssi(props.network.rssi, props.language)}
        </Text>
      </View>

      <View class="absolute" style={{ insetL: 20, insetT: 272, width: 360, height: 112, radius: 12, bgColor: theme.card }}>
        <View class="absolute" style={{ insetL: 16, insetT: 20, width: 10, height: 10, radius: 5, bgColor: haTone() }} />
        <Text class="absolute text-sm font-bold" style={{ insetL: 36, insetT: 15, width: 180, textColor: theme.text }}>Home Assistant</Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 224, insetT: 17, width: 120, textColor: theme.secondaryText }}>{ha().label}</Text>
        <View class="absolute" style={{ insetL: 16, insetT: 52, width: 328, height: 1, bgColor: theme.divider }} />
        <Text class="absolute text-xs" style={{ insetL: 16, insetT: 66, width: 110, textColor: theme.secondaryText }}>
          {pick(props.language, "连接状态", "Status")}
        </Text>
        <Text class="absolute text-sm text-right" style={{ insetL: 140, insetT: 64, width: 204, textColor: theme.text }}>{ha().label}</Text>
        <Text class="absolute text-2xs" style={{ insetL: 16, insetT: 92, width: 328, textColor: theme.disabledText }}>
          {pick(props.language, "地址与令牌由技术人员写入设备。", "Technicians write the address and token.")}
        </Text>
      </View>

      {canSwitchNetwork() ? (
        <>
          <Pressable
            box={{ left: 20, top: 412, width: 360, height: 48 }}
            style={{ radius: 24, bgColor: theme.primary }}
            onTap={switchNetwork}
          >
            <Text class="absolute text-sm font-bold text-center" style={{ insetL: 0, insetT: 14, width: 360, textColor: theme.white }}>
              {pick(props.language, "切换网络", "Next network")}
            </Text>
          </Pressable>
          <Text class="absolute text-2xs text-center" style={{ insetL: 20, insetT: 470, width: 360, textColor: theme.secondaryText }}>
            {switched() === "requested"
              ? pick(props.language, "已请求切换，等待新网络。", "Switch requested; waiting for the new network.")
              : switched() === "none"
                ? pick(props.language, "没有其他已配置的预设网络。", "No other preset network is configured.")
                : pick(props.language, "设备将按预设顺序尝试下一个网络。", "The device tries the next network in the preset order.")}
          </Text>
        </>
      ) : (
        <Text class="absolute text-sm" style={{ insetL: 20, insetT: 428, width: 360, height: 48, lineHeight: 24, textColor: theme.secondaryText }}>
          {pick(props.language, "网络由技术人员在设备上预设，展台现场无需配置。", "Technicians preset the network; no booth setup is needed.")}
        </Text>
      )}

      <Pressable
        box={{ left: 20, top: 572, width: 360, height: 48 }}
        style={{ radius: 24, bgColor: theme.secondaryBackground }}
        onTap={() => props.onNav({ type: "back" })}
      >
        <Text class="absolute text-sm font-bold text-center" style={{ insetL: 0, insetT: 14, width: 360, textColor: theme.text }}>
          {pick(props.language, "返回", "Back")}
        </Text>
      </Pressable>
    </View>
  );
}
