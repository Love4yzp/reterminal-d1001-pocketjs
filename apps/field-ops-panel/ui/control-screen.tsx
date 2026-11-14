import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatTime } from "../clock";
import { pick } from "../i18n";
import {
  canControl,
  clampSetpoint,
  computeFreshness,
  modeLabel,
  MODES,
  setpointTitle,
  setpointUnit,
  type OpsState,
} from "../model";
import type { OpsMode } from "../protocol";
import type { OpsTheme } from "../theme";
import { Pressable } from "./primitives";

export function ControlScreen(props: {
  state: OpsState;
  utcOffsetMinutes: number;
  theme: OpsTheme;
  onDraftMode(mode: OpsMode): void;
  onDraftTarget(targetKw: number): void;
  onCommit(): void;
}) {
  const snap = () => props.state.snapshot;
  const lang = () => props.state.language;
  const writable = () => canControl(props.state);
  const unit = () => setpointUnit(props.state.profileId);

  const gaugeFill = () => {
    const min = snap()?.minKw ?? 5;
    const max = snap()?.maxKw ?? 60;
    const span = Math.max(1, max - min);
    const ratio = Math.max(0, Math.min(1, (props.state.draftTargetKw - min) / span));
    return Math.max(8, Math.round(336 * ratio));
  };

  const receiptStyle = () => {
    if (props.state.pendingCommand) return { fg: props.theme.accent, bg: props.theme.accentChip };
    if (props.state.receipt) {
      return props.state.receipt.ok
        ? { fg: props.theme.ok, bg: props.theme.okChip }
        : { fg: props.theme.critical, bg: props.theme.criticalChip };
    }
    return { fg: props.theme.secondaryText, bg: props.theme.card };
  };

  const receiptHeadline = () => {
    if (props.state.pendingCommand) {
      return pick(lang(), "正在下发并等待设备回读...", "Sending & waiting for readback...");
    }
    if (props.state.receipt) {
      return props.state.receipt.ok
        ? pick(lang(), "已生效 · 回读校验一致", "Confirmed · Readback Matched")
        : pick(lang(), "下发失败 · 未变更设定", "Failed · Setpoint Unchanged");
    }
    if (!writable()) {
      return computeFreshness(props.state) === "live"
        ? pick(lang(), "控制就绪", "Ready")
        : pick(lang(), "安全联锁 · 离线禁止写操作", "Safety Interlock · Offline Locked");
    }
    return pick(lang(), "回读状态 · 与设备同步", "Readback · In Sync with Device");
  };

  const receiptDetail = () => {
    if (props.state.pendingCommand) {
      return `${pick(lang(), props.state.pendingCommand.labelZh, props.state.pendingCommand.labelEn)} (#${props.state.pendingCommand.commandId})`;
    }
    if (props.state.receipt) return props.state.receipt.message;
    const s = snap();
    if (!s) return pick(lang(), "等待首次设备遥测快照", "Waiting for initial device snapshot");
    return `Rev ${s.revision} · ${modeLabel(s.mode, s.profileId, lang())} · ${s.targetKw} ${unit()} · ${formatTime(props.state.lastReceivedEpoch, props.utcOffsetMinutes)}`;
  };

  const steppers = [-5, -1, 1, 5] as const;

  return (
    <View class="absolute" style={{ insetL: 0, insetT: 32, width: 400, height: 540 }}>
      <Text
        class="absolute text-xl font-bold"
        style={{ insetL: 16, insetT: 8, width: 220, textColor: props.theme.text }}
      >
        {pick(lang(), "运行控制与设定", "Control & Setpoint")}
      </Text>
      <View
        class="absolute"
        style={{
          insetL: 244,
          insetT: 8,
          width: 140,
          height: 24,
          radius: 12,
          bgColor: writable() ? props.theme.okChip : props.theme.warnChip,
        }}
      >
        <Text
          class="absolute text-2xs font-bold text-center"
          style={{
            insetL: 0,
            insetT: 5,
            width: 140,
            textColor: writable() ? props.theme.ok : props.theme.warn,
          }}
        >
          {writable() ? pick(lang(), "允许远程下发", "Write Unlocked") : pick(lang(), "写操作已锁定", "Write Locked")}
        </Text>
      </View>

      <View
        class="absolute"
        style={{ insetL: 16, insetT: 40, width: 368, height: 128, radius: props.theme.cardRadius, bgColor: props.theme.card }}
      >
        <Text class="absolute text-xs" style={{ insetL: 16, insetT: 12, width: 160, textColor: props.theme.secondaryText }}>
          {pick(lang(), "运行模式", "Operating Mode")}
        </Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 176, insetT: 12, width: 176, textColor: props.theme.secondaryText }}>
          {snap() ? `${pick(lang(), "当前", "Active")}: ${modeLabel(snap()!.mode, snap()!.profileId, lang())}` : "--"}
        </Text>
        <For each={MODES}>{(mode, index) => {
          const col = index() % 2;
          const row = Math.floor(index() / 2);
          const selected = () => props.state.draftMode === mode;
          return (
            <Pressable
              box={{ left: 16 + col * 174, top: 38 + row * 42, width: 162, height: 34 }}
              style={{
                radius: 8,
                bgColor: selected() ? props.theme.accent : props.theme.cardElevated,
              }}
              muted={props.state.muted}
              onTap={() => props.onDraftMode(mode)}
            >
              <Text
                class="absolute text-xs font-bold text-center"
                style={{
                  insetL: 0,
                  insetT: 9,
                  width: 162,
                  textColor: selected() ? props.theme.page : props.theme.text,
                }}
              >
                {modeLabel(mode, props.state.profileId, lang())}
              </Text>
            </Pressable>
          );
        }}</For>
      </View>

      <View
        class="absolute"
        style={{ insetL: 16, insetT: 178, width: 368, height: 158, radius: props.theme.cardRadius, bgColor: props.theme.card }}
      >
        <Text class="absolute text-xs" style={{ insetL: 16, insetT: 12, width: 180, textColor: props.theme.secondaryText }}>
          {setpointTitle(props.state.profileId, lang())}
        </Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 196, insetT: 12, width: 156, textColor: props.theme.secondaryText }}>
          {snap() ? `${pick(lang(), "回读", "Read")}: ${snap()!.targetKw} ${unit()}` : "--"}
        </Text>
        <Text class="absolute text-xl font-bold" style={{ insetL: 16, insetT: 38, width: 200, textColor: props.theme.text }}>
          {`${props.state.draftTargetKw} ${unit()}`}
        </Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 220, insetT: 48, width: 132, textColor: props.theme.secondaryText }}>
          {`${snap()?.minKw ?? 5}–${snap()?.maxKw ?? 60} ${unit()}`}
        </Text>
        <View
          class="absolute"
          style={{ insetL: 16, insetT: 78, width: 336, height: 10, radius: 5, bgColor: props.theme.cardElevated }}
        >
          <View
            class="absolute"
            style={{ insetL: 0, insetT: 0, width: gaugeFill(), height: 10, radius: 5, bgColor: props.theme.accent }}
          />
        </View>
        <For each={steppers}>{(delta, index) => (
          <Pressable
            box={{ left: 16 + index() * 86, top: 102, width: 78, height: 42 }}
            style={{ radius: 8, bgColor: props.theme.cardElevated }}
            muted={props.state.muted}
            onTap={() => props.onDraftTarget(clampSetpoint(props.state.draftTargetKw + delta, snap()))}
          >
            <Text
              class="absolute text-sm font-bold text-center"
              style={{ insetL: 0, insetT: 12, width: 78, textColor: props.theme.text }}
            >
              {delta > 0 ? `+${delta}` : String(delta)}
            </Text>
          </Pressable>
        )}</For>
      </View>

      <Pressable
        box={{ left: 16, top: 348, width: 368, height: 48 }}
        style={{
          radius: props.theme.tileRadius,
          bgColor: writable() ? props.theme.accent : props.theme.cardElevated,
        }}
        muted={props.state.muted}
        onTap={props.onCommit}
      >
        <Text
          class="absolute text-sm font-bold text-center"
          style={{
            insetL: 0,
            insetT: 14,
            width: 368,
            textColor: writable() ? props.theme.page : props.theme.disabledText,
          }}
        >
          {props.state.pendingCommand
            ? pick(lang(), "正在等待设备回执...", "Waiting for Device Receipt...")
            : writable()
              ? pick(lang(), "下发设定并回读确认", "Commit & Verify Readback")
              : pick(lang(), "离线 / 过期状态 · 已锁定写操作", "Offline / Stale · Write Locked")}
        </Text>
      </Pressable>

      <View
        class="absolute"
        style={{
          insetL: 16,
          insetT: 408,
          width: 368,
          height: 118,
          radius: props.theme.cardRadius,
          bgColor: receiptStyle().bg,
        }}
      >
        <Text
          class="absolute text-sm font-bold"
          style={{ insetL: 16, insetT: 16, width: 336, textColor: receiptStyle().fg }}
        >
          {receiptHeadline()}
        </Text>
        <Text
          class="absolute text-xs"
          style={{ insetL: 16, insetT: 46, width: 336, height: 56, textColor: props.theme.text }}
        >
          {receiptDetail()}
        </Text>
      </View>
    </View>
  );
}
