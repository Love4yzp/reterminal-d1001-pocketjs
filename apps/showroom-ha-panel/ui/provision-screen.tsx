import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import type { NavEvent, ProvisionTopic } from "../navigation";
import { theme } from "../theme";
import { Icon, Pressable } from "./primitives";

const STEPS = [
  { title: "手机连接 Wi-Fi D1001-3F2A", detail: "热点名为占位，扫码功能尚未启用" },
  { title: "浏览器打开配置页", detail: "配置网页将在后续版本提供" },
  { title: "保存后设备自动连网", detail: "当前页面不会发起配网" },
] as const;

export function ProvisionScreen(props: { topic: ProvisionTopic; onNav(event: NavEvent): void }) {
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640, bgColor: theme.page }}>
      <Pressable box={{ left: 0, top: 0, width: 250, height: 52 }} onTap={() => props.onNav({ type: "back" })}>
        <Icon name="back-text" left={16} top={14} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 15, width: 180, textColor: theme.text }}>用手机配置</Text>
      </Pressable>
      <Text class="absolute text-sm" style={{ insetL: 20, insetT: 58, width: 360, height: 42, lineHeight: 21, textColor: theme.secondaryText }}>
        {props.topic === "wifi" ? "Wi-Fi 密码较长，请在手机上填写。\n扫码配置尚未启用，以下内容为占位。" : "HA 地址和令牌较长，请在手机上填写。\n扫码配置尚未启用，以下内容为占位。"}
      </Text>
      <View class="absolute" style={{ insetL: 86, insetT: 112, width: 228, height: 228, radius: 12, bgColor: theme.white }}>
        <Icon name="qr-placeholder" left={14} top={14} size={200} />
      </View>
      <Text class="absolute text-2xs text-center" style={{ insetL: 20, insetT: 346, width: 360, textColor: theme.disabledText }}>
        二维码与热点名均为占位，请勿扫码
      </Text>
      <For each={STEPS}>{(step, index) => (
        <View class="absolute" style={{ insetL: 24, insetT: 374 + index() * 58, width: 352, height: 52 }}>
          <View class="absolute" style={{ insetL: 0, insetT: 0, width: 24, height: 24, radius: 12, bgColor: theme.secondaryBackground }}>
            <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 5, width: 24, textColor: theme.primary }}>
              {String(index() + 1)}
            </Text>
          </View>
          <Text class="absolute text-sm" style={{ insetL: 36, insetT: 1, width: 310, textColor: theme.text }}>{step.title}</Text>
          <Text class="absolute text-2xs" style={{ insetL: 36, insetT: 25, width: 310, textColor: theme.secondaryText }}>{step.detail}</Text>
        </View>
      )}</For>
      <Pressable
        box={{ left: 20, top: 572, width: 360, height: 48 }}
        style={{ radius: 24, bgColor: theme.secondaryBackground }}
        onTap={() => props.onNav({ type: "back" })}
      >
        <Text class="absolute text-sm font-bold text-center" style={{ insetL: 0, insetT: 14, width: 360, textColor: theme.text }}>稍后设置</Text>
      </Pressable>
    </View>
  );
}
