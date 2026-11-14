import { Text, View } from "@pocketjs/framework/solid/components";
import { languageLabel, pick, themeLabel } from "../i18n";
import { computeFreshness, type OpsState } from "../model";
import type { NetworkInfo } from "../native";
import type { OpsTheme } from "../theme";
import { Icon, Pressable } from "./primitives";

export function freshnessBadge(state: OpsState, theme: OpsTheme): {
  label: string;
  fg: number;
  bg: number;
} {
  const freshness = computeFreshness(state);
  if (freshness === "live") {
    return { label: pick(state.language, "实时同步", "LIVE"), fg: theme.ok, bg: theme.okChip };
  }
  if (freshness === "offline") {
    return { label: pick(state.language, "离线缓存", "CACHED"), fg: theme.warn, bg: theme.warnChip };
  }
  if (freshness === "stale") {
    return { label: pick(state.language, "数据过期", "STALE"), fg: theme.warn, bg: theme.warnChip };
  }
  if (state.configured) {
    return { label: pick(state.language, "连接中", "SYNCING"), fg: theme.accent, bg: theme.accentChip };
  }
  return { label: pick(state.language, "未配置", "UNSET"), fg: theme.secondaryText, bg: theme.cardElevated };
}

export function StatusBar(props: {
  width: number;
  state: OpsState;
  network: NetworkInfo;
  theme: OpsTheme;
  onLanguageToggle(): void;
  onCycleTheme(): void;
}) {
  const badge = () => freshnessBadge(props.state, props.theme);
  const langLeft = () => props.width - 102;
  const themeLeft = () => props.width - 54;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: props.width, height: 32, bgColor: props.theme.page }}>
      <Icon name="wifi-secondary" left={14} top={8} size={16} />
      <Text
        class="absolute text-2xs"
        style={{ insetL: 34, insetT: 9, width: Math.max(80, props.width - 280), textColor: props.theme.secondaryText }}
      >
        {props.network.ssid}
      </Text>
      <View
        class="absolute"
        style={{
          insetL: langLeft() - 92,
          insetT: 5,
          width: 84,
          height: 22,
          radius: 11,
          bgColor: badge().bg,
        }}
      >
        <Text
          class="absolute text-2xs font-bold text-center"
          style={{ insetL: 0, insetT: 4, width: 84, textColor: badge().fg }}
        >
          {badge().label}
        </Text>
      </View>
      <Pressable
        box={{ left: langLeft(), top: 4, width: 42, height: 24 }}
        style={{ radius: 12, bgColor: props.theme.cardElevated }}
        onTap={props.onLanguageToggle}
      >
        <Text
          class="absolute text-2xs font-bold text-center"
          style={{ insetL: 0, insetT: 5, width: 42, textColor: props.theme.text }}
        >
          {languageLabel(props.state.language)}
        </Text>
      </Pressable>
      <Pressable
        box={{ left: themeLeft(), top: 4, width: 42, height: 24 }}
        style={{ radius: 12, bgColor: props.theme.accentChip }}
        onTap={props.onCycleTheme}
      >
        <Text
          class="absolute text-2xs font-bold text-center"
          style={{ insetL: 0, insetT: 5, width: 42, textColor: props.theme.accent }}
        >
          {themeLabel(props.state.themeId, props.state.language).slice(0, 2)}
        </Text>
      </Pressable>
    </View>
  );
}
