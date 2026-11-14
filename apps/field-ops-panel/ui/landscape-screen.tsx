import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { VirtualList } from "@pocketjs/framework/virtual-list";
import { formatClock, formatTime } from "../clock";
import { pick, themeLabel } from "../i18n";
import {
  canControl,
  clampSetpoint,
  computeFreshness,
  modeLabel,
  MODES,
  profileLabel,
  PROFILES,
  setpointTitle,
  setpointUnit,
  sortedAlarms,
  unackedAlarmsCount,
  type OpsState,
} from "../model";
import { canSwitchNetwork, formatRssi, requestNextPreset, type NetworkInfo } from "../native";
import { TABS, tabLabel, type Tab } from "../navigation";
import type { OpsMode, OpsProfileId } from "../protocol";
import { SCREEN_OFF_OPTIONS, screenOffLabel, type SettingsAction, type SettingsState } from "../settings";
import { THEME_ORDER, type OpsTheme, type ThemeId } from "../theme";
import { severityColors, severityLabel } from "./alarms-screen";
import { tabIcon } from "./nav-bar";
import { toneColor } from "./overview-screen";
import { BacklightBar, Divider, Icon, Numerals, Pressable } from "./primitives";
import { StatusBar } from "./status-bar";

interface LandscapeProps {
  tab: Tab;
  state: OpsState;
  settings: SettingsState;
  network: NetworkInfo;
  utcOffsetMinutes: number;
  firmwareVersion: string;
  gatewayUrl: string;
  theme: OpsTheme;
  onTab(tab: Tab): void;
  onRefresh(): void;
  onDraftMode(mode: OpsMode): void;
  onDraftTarget(targetKw: number): void;
  onCommit(): void;
  onAck(alarmId: string): void;
  onToggleMute(): void;
  onSelectTheme(themeId: ThemeId): void;
  onSelectProfile(profileId: OpsProfileId): void;
  onLanguageToggle(): void;
  onCycleTheme(): void;
  onSettings(action: SettingsAction): void;
  onRotate(landscape: boolean): void;
}

function compactProfileLabel(profileId: OpsProfileId, language: "zh" | "en"): string {
  if (profileId === "charger") return pick(language, "充电桩", "EVSE");
  if (profileId === "lorawan") return "LoRa";
  return pick(language, "储能柜", "ESS");
}

function LandscapeRail(props: LandscapeProps) {
  const unacked = () => unackedAlarmsCount(props.state.snapshot);
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 88, height: 400, bgColor: props.theme.page }}>
      <View class="absolute" style={{ insetL: 87, insetT: 0, width: 1, height: 400, bgColor: props.theme.divider }} />
      <Text
        class="absolute text-sm font-bold text-center"
        style={{ insetL: 0, insetT: 14, width: 87, textColor: props.theme.text }}
      >
        {formatClock(props.state.clockEpochSeconds, props.utcOffsetMinutes)}
      </Text>
      <For each={TABS}>{(tab, index) => {
        const active = () => props.tab === tab.id;
        return (
          <Pressable
            box={{ left: 0, top: 48 + index() * 82, width: 87, height: 74 }}
            muted={props.state.muted}
            onTap={() => props.onTab(tab.id)}
          >
            {active() ? (
              <View
                class="absolute"
                style={{ insetL: 16, insetT: 6, width: 55, height: 30, radius: 15, bgColor: props.theme.accentChip }}
              />
            ) : null}
            <Icon name={tabIcon(tab.id, active(), unacked())} left={32} top={9} size={24} />
            {tab.id === "alarms" && unacked() > 0 ? (
              <View
                class="absolute"
                style={{ insetL: 52, insetT: 6, width: 16, height: 16, radius: 8, bgColor: props.theme.critical }}
              >
                <Text
                  class="absolute text-2xs font-bold text-center"
                  style={{ insetL: 0, insetT: 1, width: 16, textColor: props.theme.white }}
                >
                  {unacked() > 9 ? "9+" : String(unacked())}
                </Text>
              </View>
            ) : null}
            <Text
              class="absolute text-xs text-center"
              style={{
                insetL: 0,
                insetT: 42,
                width: 87,
                textColor: active() ? props.theme.accent : props.theme.secondaryText,
              }}
            >
              {tabLabel(tab, props.state.language)}
            </Text>
          </Pressable>
        );
      }}</For>
    </View>
  );
}

function LandscapeOverview(props: LandscapeProps) {
  const snap = () => props.state.snapshot;
  const lang = () => props.state.language;
  const freshness = () => computeFreshness(props.state);
  const unacked = () => unackedAlarmsCount(snap());
  const unit = () => setpointUnit(props.state.profileId);

  const fillWidth = () => {
    const pct = snap()?.heroPercent ?? 0;
    return Math.max(8, Math.round((488 * pct) / 100));
  };

  return (
    <View class="absolute" style={{ insetL: 0, insetT: 34, width: 552, height: 366 }}>
      <Text class="absolute text-xl font-bold" style={{ insetL: 16, insetT: 4, width: 320, textColor: props.theme.text }}>
        {snap() ? pick(lang(), snap()!.siteNameZh, snap()!.siteNameEn) : pick(lang(), "等待接入现场设备", "Waiting for Device")}
      </Text>
      <Text class="absolute text-2xs text-right" style={{ insetL: 336, insetT: 8, width: 200, textColor: props.theme.secondaryText }}>
        {snap() ? `${snap()!.unitId} · ${profileLabel(snap()!.profileId, lang())}` : props.state.configError}
      </Text>

      <View
        class="absolute"
        style={{ insetL: 16, insetT: 38, width: 520, height: 110, radius: props.theme.cardRadius, bgColor: props.theme.card }}
      >
        {snap() ? (
          <>
            <Numerals text={`${snap()!.heroPercent}%`} size={44} left={16} top={14} />
            <Text class="absolute text-xs" style={{ insetL: 16, insetT: 58, width: 170, textColor: props.theme.secondaryText }}>
              {pick(lang(), snap()!.heroLabelZh, snap()!.heroLabelEn)}
            </Text>
            <Text class="absolute text-xl font-bold text-right" style={{ insetL: 240, insetT: 14, width: 264, textColor: props.theme.text }}>
              {`${snap()!.powerKw.toFixed(1)} ${unit()}`}
            </Text>
            <Text class="absolute text-xs text-right" style={{ insetL: 240, insetT: 48, width: 264, textColor: props.theme.secondaryText }}>
              {`${modeLabel(snap()!.mode, snap()!.profileId, lang())} · ${pick(lang(), "限值", "Cap")} ${snap()!.targetKw} ${unit()}`}
            </Text>
            <View class="absolute" style={{ insetL: 16, insetT: 84, width: 488, height: 10, radius: 5, bgColor: props.theme.cardElevated }}>
              <View
                class="absolute"
                style={{
                  insetL: 0,
                  insetT: 0,
                  width: fillWidth(),
                  height: 10,
                  radius: 5,
                  bgColor: unacked() > 0 ? props.theme.warn : freshness() === "live" ? props.theme.accent : props.theme.secondaryText,
                }}
              />
            </View>
          </>
        ) : (
          <Text class="absolute text-sm text-center" style={{ insetL: 20, insetT: 44, width: 480, textColor: props.theme.secondaryText }}>
            {pick(lang(), "暂无设备遥测快照", "No telemetry snapshot yet")}
          </Text>
        )}
      </View>

      {snap() ? (
        <For each={snap()!.kpis.slice(0, 4)}>{(kpi, index) => (
          <View
            class="absolute"
            style={{
              insetL: 16 + index() * 132,
              insetT: 160,
              width: 124,
              height: 106,
              radius: props.theme.tileRadius,
              bgColor: props.theme.card,
            }}
          >
            <View class="absolute" style={{ insetL: 10, insetT: 12, width: 32, height: 4, radius: 2, bgColor: toneColor(kpi.tone, props.theme) }} />
            <Text class="absolute text-xs" style={{ insetL: 10, insetT: 26, width: 104, textColor: props.theme.secondaryText }}>
              {pick(lang(), kpi.labelZh, kpi.labelEn)}
            </Text>
            <Text class="absolute text-xl font-bold" style={{ insetL: 10, insetT: 58, width: 104, textColor: props.theme.text }}>
              {`${kpi.value}${kpi.unit ? ` ${kpi.unit}` : ""}`}
            </Text>
          </View>
        )}</For>
      ) : null}

      <Pressable
        box={{ left: 16, top: 280, width: 274, height: 70 }}
        style={{ radius: props.theme.tileRadius, bgColor: unacked() > 0 ? props.theme.criticalChip : props.theme.card }}
        muted={props.state.muted}
        onTap={() => props.onTab(unacked() > 0 ? "alarms" : "system")}
      >
        <Text
          class="absolute text-sm font-bold"
          style={{ insetL: 14, insetT: 14, width: 246, textColor: unacked() > 0 ? props.theme.critical : props.theme.text }}
        >
          {unacked() > 0
            ? `${unacked()} ${pick(lang(), "条未确认告警", "Unacked Alarms")}`
            : freshness() === "live"
              ? pick(lang(), "通信正常 · 实时同步", "Online · Live Sync")
              : pick(lang(), "离线缓存 · 已锁定写入", "Cached Offline · Write Locked")}
        </Text>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 40, width: 246, textColor: props.theme.secondaryText }}>
          {`${pick(lang(), "同步", "Sync")}: ${formatTime(props.state.lastReceivedEpoch, props.utcOffsetMinutes)}`}
        </Text>
      </Pressable>

      <Pressable
        box={{ left: 302, top: 280, width: 110, height: 70 }}
        style={{ radius: props.theme.tileRadius, bgColor: props.theme.cardElevated }}
        muted={props.state.muted}
        onTap={props.onRefresh}
      >
        <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 26, width: 110, textColor: props.theme.text }}>
          {pick(lang(), "立即同步", "Sync Now")}
        </Text>
      </Pressable>
      <Pressable
        box={{ left: 424, top: 280, width: 112, height: 70 }}
        style={{ radius: props.theme.tileRadius, bgColor: props.theme.accent }}
        muted={props.state.muted}
        onTap={() => props.onTab("control")}
      >
        <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 26, width: 112, textColor: props.theme.page }}>
          {pick(lang(), "功率调节", "Setpoints")}
        </Text>
      </Pressable>
    </View>
  );
}

function LandscapeControl(props: LandscapeProps) {
  const snap = () => props.state.snapshot;
  const lang = () => props.state.language;
  const writable = () => canControl(props.state);
  const unit = () => setpointUnit(props.state.profileId);

  return (
    <View class="absolute" style={{ insetL: 0, insetT: 34, width: 552, height: 366 }}>
      <View class="absolute" style={{ insetL: 16, insetT: 8, width: 252, height: 224, radius: props.theme.cardRadius, bgColor: props.theme.card }}>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 12, width: 224, textColor: props.theme.secondaryText }}>
          {setpointTitle(props.state.profileId, lang())}
        </Text>
        <Text class="absolute text-xl font-bold" style={{ insetL: 14, insetT: 38, width: 224, textColor: props.theme.text }}>
          {`${props.state.draftTargetKw} ${unit()}`}
        </Text>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 76, width: 224, textColor: props.theme.secondaryText }}>
          {snap() ? `${pick(lang(), "回读值", "Readback")}: ${snap()!.targetKw} ${unit()}` : "--"}
        </Text>
        <For each={[-5, -1, 1, 5] as const}>{(delta, index) => {
          const col = index() % 2;
          const row = Math.floor(index() / 2);
          return (
            <Pressable
              box={{ left: 14 + col * 116, top: 110 + row * 52, width: 108, height: 42 }}
              style={{ radius: 8, bgColor: props.theme.cardElevated }}
              muted={props.state.muted}
              onTap={() => props.onDraftTarget(clampSetpoint(props.state.draftTargetKw + delta, snap()))}
            >
              <Text class="absolute text-sm font-bold text-center" style={{ insetL: 0, insetT: 12, width: 108, textColor: props.theme.text }}>
                {delta > 0 ? `+${delta}` : String(delta)}
              </Text>
            </Pressable>
          );
        }}</For>
      </View>

      <View class="absolute" style={{ insetL: 280, insetT: 8, width: 256, height: 224, radius: props.theme.cardRadius, bgColor: props.theme.card }}>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 12, width: 228, textColor: props.theme.secondaryText }}>
          {pick(lang(), "运行模式", "Operating Mode")}
        </Text>
        <For each={MODES}>{(mode, index) => {
          const selected = () => props.state.draftMode === mode;
          return (
            <Pressable
              box={{ left: 14, top: 38 + index() * 44, width: 228, height: 36 }}
              style={{ radius: 8, bgColor: selected() ? props.theme.accent : props.theme.cardElevated }}
              muted={props.state.muted}
              onTap={() => props.onDraftMode(mode)}
            >
              <Text
                class="absolute text-xs font-bold text-center"
                style={{ insetL: 0, insetT: 10, width: 228, textColor: selected() ? props.theme.page : props.theme.text }}
              >
                {modeLabel(mode, props.state.profileId, lang())}
              </Text>
            </Pressable>
          );
        }}</For>
      </View>

      <Pressable
        box={{ left: 16, top: 246, width: 252, height: 104 }}
        style={{ radius: props.theme.tileRadius, bgColor: writable() ? props.theme.accent : props.theme.cardElevated }}
        muted={props.state.muted}
        onTap={props.onCommit}
      >
        <Text
          class="absolute text-sm font-bold text-center"
          style={{ insetL: 12, insetT: 42, width: 228, textColor: writable() ? props.theme.page : props.theme.disabledText }}
        >
          {writable() ? pick(lang(), "下发设定并回读", "Commit & Verify") : pick(lang(), "离线 · 锁定写入", "Offline · Locked")}
        </Text>
      </Pressable>

      <View
        class="absolute"
        style={{
          insetL: 280,
          insetT: 246,
          width: 256,
          height: 104,
          radius: props.theme.cardRadius,
          bgColor: props.state.receipt ? (props.state.receipt.ok ? props.theme.okChip : props.theme.criticalChip) : props.theme.card,
        }}
      >
        <Text class="absolute text-sm font-bold" style={{ insetL: 14, insetT: 16, width: 228, textColor: props.theme.text }}>
          {props.state.pendingCommand
            ? pick(lang(), "等待设备回执...", "Waiting readback...")
            : props.state.receipt
              ? (props.state.receipt.ok ? pick(lang(), "已生效 · 回读一致", "Confirmed") : pick(lang(), "下发失败", "Failed"))
              : pick(lang(), "设备回读状态", "Device Readback")}
        </Text>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 46, width: 228, textColor: props.theme.secondaryText }}>
          {props.state.receipt?.message ?? (snap() ? `Rev ${snap()!.revision} · ${snap()!.targetKw} ${unit()}` : "--")}
        </Text>
      </View>
    </View>
  );
}

function LandscapeAlarms(props: LandscapeProps) {
  const alarms = () => sortedAlarms(props.state.snapshot?.alarms ?? []);
  const unacked = () => unackedAlarmsCount(props.state.snapshot);
  const lang = () => props.state.language;
  const writable = () => canControl(props.state);

  return (
    <View class="absolute" style={{ insetL: 0, insetT: 34, width: 552, height: 366 }}>
      <Text class="absolute text-sm font-bold" style={{ insetL: 16, insetT: 6, width: 220, textColor: props.theme.text }}>
        {`${pick(lang(), "告警与事件", "Alarms")} (${unacked()})`}
      </Text>
      <Pressable
        box={{ left: 422, top: 4, width: 114, height: 28 }}
        style={{ radius: 14, bgColor: props.theme.cardElevated }}
        muted={props.state.muted}
        onTap={props.onToggleMute}
      >
        <Text class="absolute text-2xs font-bold text-center" style={{ insetL: 0, insetT: 7, width: 114, textColor: props.theme.text }}>
          {props.state.muted ? pick(lang(), "告警音: 静音", "Audio: Muted") : pick(lang(), "告警音: 开启", "Audio: On")}
        </Text>
      </Pressable>
      <View class="absolute overflow-hidden" style={{ insetL: 0, insetT: 38, width: 552, height: 328 }}>
        <VirtualList
          count={alarms().length}
          rowHeight={76}
          height={328}
          overscan={76}
          focusRows={false}
          style={{ width: 552 }}
          renderRow={(index) => {
            const alarm = alarms()[index];
            if (!alarm) return <View class="w-full h-full" />;
            const colors = severityColors(alarm, props.theme);
            return (
              <View class="relative" style={{ width: 552, height: 76, bgColor: index % 2 === 0 ? props.theme.page : props.theme.card }}>
                <View class="absolute" style={{ insetL: 16, insetT: 20, width: 56, height: 26, radius: 6, bgColor: colors.bg }}>
                  <Text class="absolute text-2xs font-bold text-center" style={{ insetL: 0, insetT: 5, width: 56, textColor: colors.fg }}>
                    {severityLabel(alarm.severity, props.state)}
                  </Text>
                </View>
                <Text class="absolute text-sm font-bold" style={{ insetL: 84, insetT: 14, width: 356, textColor: props.theme.text }}>
                  {pick(lang(), alarm.titleZh, alarm.titleEn)}
                </Text>
                <Text class="absolute text-2xs" style={{ insetL: 84, insetT: 42, width: 356, textColor: props.theme.secondaryText }}>
                  {`${alarm.source} · ${formatTime(alarm.epoch, props.utcOffsetMinutes)}`}
                </Text>
                <View
                  class="absolute"
                  style={{
                    insetL: 452,
                    insetT: 20,
                    width: 84,
                    height: 36,
                    radius: 8,
                    bgColor: alarm.acked || !writable() ? props.theme.cardElevated : props.theme.accent,
                  }}
                >
                  <Text
                    class="absolute text-xs font-bold text-center"
                    style={{
                      insetL: 0,
                      insetT: 10,
                      width: 84,
                      textColor: alarm.acked || !writable() ? props.theme.disabledText : props.theme.page,
                    }}
                  >
                    {alarm.acked ? pick(lang(), "已确认", "Acked") : pick(lang(), "确认", "ACK")}
                  </Text>
                </View>
                <Divider left={16} top={75} width={520} theme={props.theme} />
              </View>
            );
          }}
          onRowPress={(index) => {
            const alarm = alarms()[index];
            if (alarm && !alarm.acked) props.onAck(alarm.id);
          }}
        />
      </View>
    </View>
  );
}

function LandscapeSystem(props: LandscapeProps) {
  const lang = () => props.state.language;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 34, width: 552, height: 366 }}>
      <View class="absolute" style={{ insetL: 16, insetT: 8, width: 254, height: 170, radius: props.theme.cardRadius, bgColor: props.theme.card }}>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 10, width: 226, textColor: props.theme.secondaryText }}>
          {pick(lang(), "主题与行业模板", "Theme & Profile")}
        </Text>
        <For each={THEME_ORDER}>{(id, index) => {
          const active = () => props.state.themeId === id;
          return (
            <Pressable
              box={{ left: 14 + index() * 78, top: 36, width: 72, height: 34 }}
              style={{ radius: 8, bgColor: active() ? props.theme.accent : props.theme.cardElevated }}
              muted={props.state.muted}
              onTap={() => props.onSelectTheme(id)}
            >
              <Text class="absolute text-2xs font-bold text-center" style={{ insetL: 0, insetT: 10, width: 72, textColor: active() ? props.theme.page : props.theme.text }}>
                {themeLabel(id, lang(), true)}
              </Text>
            </Pressable>
          );
        }}</For>
        <For each={PROFILES}>{(profile, index) => {
          const active = () => props.state.profileId === profile;
          return (
            <Pressable
              box={{ left: 14 + index() * 78, top: 82, width: 72, height: 36 }}
              style={{ radius: 8, bgColor: active() ? props.theme.accent : props.theme.cardElevated }}
              muted={props.state.muted}
              onTap={() => props.onSelectProfile(profile)}
            >
              <Text class="absolute text-2xs font-bold text-center" style={{ insetL: 0, insetT: 11, width: 72, textColor: active() ? props.theme.page : props.theme.text }}>
                {compactProfileLabel(profile, lang())}
              </Text>
            </Pressable>
          );
        }}</For>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 132, width: 226, textColor: props.theme.secondaryText }}>
          {`${pick(lang(), "网关", "GW")}: ${props.gatewayUrl || "--"}`}
        </Text>
      </View>

      <View class="absolute" style={{ insetL: 282, insetT: 8, width: 254, height: 170, radius: props.theme.cardRadius, bgColor: props.theme.card }}>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 10, width: 150, textColor: props.theme.secondaryText }}>
          {pick(lang(), "背光与熄屏", "Backlight & Timeout")}
        </Text>
        <Text class="absolute text-xs font-bold text-right" style={{ insetL: 170, insetT: 10, width: 70, textColor: props.theme.text }}>
          {props.settings.backlight === null ? "--" : `${props.settings.backlight}%`}
        </Text>
        <BacklightBar
          box={{ left: 14, top: 38, width: 226, height: 22 }}
          percent={props.settings.backlight}
          theme={props.theme}
          onChange={(percent) => props.onSettings({ type: "backlight", percent })}
        />
        <For each={SCREEN_OFF_OPTIONS}>{(option, index) => {
          const active = () => props.settings.screenOffSeconds === option.seconds;
          return (
            <Pressable
              box={{ left: 14 + index() * 58, top: 76, width: 52, height: 34 }}
              style={{ radius: 8, bgColor: active() ? props.theme.accent : props.theme.cardElevated }}
              muted={props.state.muted}
              onTap={() => props.onSettings({ type: "screen-off", seconds: option.seconds })}
            >
              <Text class="absolute text-2xs font-bold text-center" style={{ insetL: 0, insetT: 10, width: 52, textColor: active() ? props.theme.page : props.theme.text }}>
                {screenOffLabel(option, lang())}
              </Text>
            </Pressable>
          );
        }}</For>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 132, width: 226, textColor: props.theme.secondaryText }}>
          {`Wi-Fi: ${props.network.ssid} (${formatRssi(props.network.rssi, lang())})`}
        </Text>
      </View>

      <View class="absolute" style={{ insetL: 16, insetT: 192, width: 520, height: 158, radius: props.theme.cardRadius, bgColor: props.theme.card }}>
        <Text class="absolute text-xs" style={{ insetL: 16, insetT: 16, width: 320, textColor: props.theme.text }}>
          {`IP: ${props.network.address} · FW: ${props.firmwareVersion}`}
        </Text>
        {canSwitchNetwork() ? (
          <Pressable
            box={{ left: 16, top: 52, width: 150, height: 44 }}
            style={{ radius: 8, bgColor: props.theme.cardElevated }}
            muted={props.state.muted}
            onTap={() => requestNextPreset()}
          >
            <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 14, width: 150, textColor: props.theme.text }}>
              {pick(lang(), "切换预设网络", "Next Wi-Fi")}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          box={{ left: 184, top: 52, width: 150, height: 44 }}
          style={{ radius: 8, bgColor: props.theme.cardElevated }}
          muted={props.state.muted}
          onTap={props.onLanguageToggle}
        >
          <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 14, width: 150, textColor: props.theme.text }}>
            {pick(lang(), "语言: 中文 / EN", "Language: EN / 中文")}
          </Text>
        </Pressable>
        <Pressable
          box={{ left: 352, top: 52, width: 152, height: 44 }}
          style={{ radius: 8, bgColor: props.theme.accent }}
          muted={props.state.muted}
          onTap={() => props.onRotate(false)}
        >
          <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 14, width: 152, textColor: props.theme.page }}>
            {pick(lang(), "返回竖屏", "Return Portrait")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function LandscapeScreen(props: LandscapeProps) {
  return (
    <View class="relative overflow-hidden" style={{ width: 640, height: 400, bgColor: props.theme.page }}>
      <LandscapeRail {...props} />
      <View class="absolute" style={{ insetL: 88, insetT: 0, width: 552, height: 400 }}>
        <StatusBar
          width={552}
          state={props.state}
          network={props.network}
          theme={props.theme}
          onLanguageToggle={props.onLanguageToggle}
          onCycleTheme={props.onCycleTheme}
        />
        {props.tab === "control" ? <LandscapeControl {...props} />
          : props.tab === "alarms" ? <LandscapeAlarms {...props} />
            : props.tab === "system" ? <LandscapeSystem {...props} />
              : <LandscapeOverview {...props} />}
      </View>
    </View>
  );
}
