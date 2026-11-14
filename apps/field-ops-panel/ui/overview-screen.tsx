import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatClock, formatTime } from "../clock";
import { pick } from "../i18n";
import {
  computeFreshness,
  modeLabel,
  profileLabel,
  setpointUnit,
  unackedAlarmsCount,
  type OpsState,
} from "../model";
import type { Tab } from "../navigation";
import type { Severity } from "../protocol";
import type { OpsTheme } from "../theme";
import { Numerals, Pressable } from "./primitives";

export function toneColor(tone: Severity, theme: OpsTheme): number {
  if (tone === "critical") return theme.critical;
  if (tone === "warn") return theme.warn;
  if (tone === "ok") return theme.ok;
  return theme.accent;
}

export function OverviewScreen(props: {
  state: OpsState;
  utcOffsetMinutes: number;
  theme: OpsTheme;
  onRefresh(): void;
  onTab(tab: Tab): void;
}) {
  const snap = () => props.state.snapshot;
  const lang = () => props.state.language;
  const freshness = () => computeFreshness(props.state);
  const unacked = () => unackedAlarmsCount(snap());
  const firstUnacked = () => snap()?.alarms.find(a => !a.acked) ?? null;

  const heroTitle = () => {
    const s = snap();
    if (!s) return pick(lang(), "等待接入现场设备", "Waiting for Device");
    return pick(lang(), s.siteNameZh, s.siteNameEn);
  };

  const heroSubtitle = () => {
    const s = snap();
    if (!s) {
      return props.state.configError
        ? props.state.configError
        : pick(lang(), "请配置 ops-config.json 或启动模拟网关", "Provision ops-config.json or start mock gateway");
    }
    return `${s.unitId} · ${profileLabel(s.profileId, lang())} · ${modeLabel(s.mode, s.profileId, lang())}`;
  };

  const fillWidth = () => {
    const pct = snap()?.heroPercent ?? 0;
    return Math.max(8, Math.round((336 * pct) / 100));
  };

  const heroTone = () => {
    if (unacked() > 0) return props.theme.warn;
    return freshness() === "live" ? props.theme.accent : props.theme.secondaryText;
  };

  return (
    <View class="absolute" style={{ insetL: 0, insetT: 32, width: 400, height: 540 }}>
      <Text
        class="absolute text-xl font-bold"
        style={{ insetL: 16, insetT: 8, width: 268, textColor: props.theme.text }}
      >
        {heroTitle()}
      </Text>
      <Text
        class="absolute text-2xs"
        style={{ insetL: 16, insetT: 34, width: 268, textColor: props.theme.secondaryText }}
      >
        {heroSubtitle()}
      </Text>
      <Text
        class="absolute text-xl font-bold text-right"
        style={{ insetL: 288, insetT: 10, width: 96, textColor: props.theme.text }}
      >
        {formatClock(props.state.clockEpochSeconds, props.utcOffsetMinutes)}
      </Text>

      <View
        class="absolute"
        style={{ insetL: 16, insetT: 64, width: 368, height: 124, radius: props.theme.cardRadius, bgColor: props.theme.card }}
      >
        {snap() ? (
          <>
            <Numerals text={`${snap()!.heroPercent}%`} size={44} left={16} top={14} />
            <Text
              class="absolute text-xs"
              style={{ insetL: 16, insetT: 58, width: 170, textColor: props.theme.secondaryText }}
            >
              {pick(lang(), snap()!.heroLabelZh, snap()!.heroLabelEn)}
            </Text>
            <Text
              class="absolute text-xl font-bold text-right"
              style={{ insetL: 196, insetT: 16, width: 156, textColor: props.theme.text }}
            >
              {`${snap()!.powerKw.toFixed(1)} ${setpointUnit(snap()!.profileId)}`}
            </Text>
            <Text
              class="absolute text-xs text-right"
              style={{ insetL: 196, insetT: 52, width: 156, textColor: props.theme.secondaryText }}
            >
              {`${pick(lang(), "设定限值", "Cap")}: ${snap()!.targetKw} ${setpointUnit(snap()!.profileId)}`}
            </Text>
            <View
              class="absolute"
              style={{ insetL: 16, insetT: 92, width: 336, height: 12, radius: 6, bgColor: props.theme.cardElevated }}
            >
              <View
                class="absolute"
                style={{ insetL: 0, insetT: 0, width: fillWidth(), height: 12, radius: 6, bgColor: heroTone() }}
              />
            </View>
          </>
        ) : (
          <Text
            class="absolute text-sm text-center"
            style={{ insetL: 20, insetT: 50, width: 328, textColor: props.theme.secondaryText }}
          >
            {pick(lang(), "暂无设备遥测快照 · 请检查网络连接或配置", "No telemetry snapshot yet · Check network or config")}
          </Text>
        )}
      </View>

      {snap() ? (
        <For each={snap()!.kpis.slice(0, 4)}>{(kpi, index) => {
          const col = index() % 2;
          const row = Math.floor(index() / 2);
          const left = 16 + col * 190;
          const top = 200 + row * 98;
          return (
            <View
              class="absolute"
              style={{ insetL: left, insetT: top, width: 178, height: 88, radius: props.theme.tileRadius, bgColor: props.theme.card }}
            >
              <View
                class="absolute"
                style={{ insetL: 10, insetT: 18, width: 4, height: 52, radius: 2, bgColor: toneColor(kpi.tone, props.theme) }}
              />
              <Text
                class="absolute text-xs"
                style={{ insetL: 24, insetT: 16, width: 142, textColor: props.theme.secondaryText }}
              >
                {pick(lang(), kpi.labelZh, kpi.labelEn)}
              </Text>
              <Text
                class="absolute text-xl font-bold"
                style={{ insetL: 24, insetT: 44, width: 142, textColor: props.theme.text }}
              >
                {`${kpi.value}${kpi.unit ? ` ${kpi.unit}` : ""}`}
              </Text>
            </View>
          );
        }}</For>
      ) : null}

      <Pressable
        box={{ left: 16, top: 400, width: 368, height: 64 }}
        style={{
          radius: props.theme.tileRadius,
          bgColor: unacked() > 0 ? props.theme.criticalChip : props.theme.card,
        }}
        onTap={() => props.onTab(unacked() > 0 ? "alarms" : "system")}
      >
        <Text
          class="absolute text-sm font-bold"
          style={{
            insetL: 16,
            insetT: 12,
            width: 280,
            textColor: unacked() > 0 ? props.theme.critical : props.theme.text,
          }}
        >
          {unacked() > 0
            ? `${unacked()} ${pick(lang(), "条未确认告警", "Unacked Alarms")}`
            : freshness() === "live"
              ? pick(lang(), "系统运行正常 · 通信在线", "System Nominal · Online")
              : pick(lang(), "离线保留缓存 · 远程写操作已锁定", "Cached Offline · Remote Write Locked")}
        </Text>
        <Text
          class="absolute text-xs"
          style={{ insetL: 16, insetT: 36, width: 300, textColor: props.theme.secondaryText }}
        >
          {firstUnacked()
            ? `${pick(lang(), firstUnacked()!.titleZh, firstUnacked()!.titleEn)} (${firstUnacked()!.source})`
            : `${pick(lang(), "上次同步", "Last sync")}: ${formatTime(props.state.lastReceivedEpoch, props.utcOffsetMinutes)}`}
        </Text>
        <Text
          class="absolute text-sm font-bold text-right"
          style={{ insetL: 318, insetT: 22, width: 36, textColor: props.theme.secondaryText }}
        >
          {">"}
        </Text>
      </Pressable>

      <Pressable
        box={{ left: 16, top: 476, width: 178, height: 54 }}
        style={{ radius: props.theme.tileRadius, bgColor: props.theme.cardElevated }}
        onTap={props.onRefresh}
      >
        <Text
          class="absolute text-sm font-bold text-center"
          style={{ insetL: 0, insetT: 17, width: 178, textColor: props.theme.text }}
        >
          {pick(lang(), "立即同步", "Sync Now")}
        </Text>
      </Pressable>
      <Pressable
        box={{ left: 206, top: 476, width: 178, height: 54 }}
        style={{ radius: props.theme.tileRadius, bgColor: props.theme.accent }}
        onTap={() => props.onTab("control")}
      >
        <Text
          class="absolute text-sm font-bold text-center"
          style={{ insetL: 0, insetT: 17, width: 178, textColor: props.theme.page }}
        >
          {pick(lang(), "功率调节", "Setpoints")}
        </Text>
      </Pressable>
    </View>
  );
}
