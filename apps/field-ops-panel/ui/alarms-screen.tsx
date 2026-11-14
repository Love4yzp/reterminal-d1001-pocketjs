import { Text, View } from "@pocketjs/framework/solid/components";
import { VirtualList } from "@pocketjs/framework/virtual-list";
import { formatTime } from "../clock";
import { pick } from "../i18n";
import { canControl, sortedAlarms, unackedAlarmsCount, type OpsState } from "../model";
import type { AlarmSeverity, OpsAlarm } from "../protocol";
import type { OpsTheme } from "../theme";
import { Pressable } from "./primitives";

export function severityLabel(severity: AlarmSeverity, state: OpsState): string {
  if (severity === "critical") return pick(state.language, "严重", "CRIT");
  if (severity === "warn") return pick(state.language, "警告", "WARN");
  return pick(state.language, "提示", "INFO");
}

export function severityColors(alarm: OpsAlarm, theme: OpsTheme): { fg: number; bg: number } {
  if (alarm.acked) return { fg: theme.secondaryText, bg: theme.cardElevated };
  if (alarm.severity === "critical") return { fg: theme.critical, bg: theme.criticalChip };
  if (alarm.severity === "warn") return { fg: theme.warn, bg: theme.warnChip };
  return { fg: theme.accent, bg: theme.accentChip };
}

export function AlarmsScreen(props: {
  state: OpsState;
  utcOffsetMinutes: number;
  theme: OpsTheme;
  onAck(alarmId: string): void;
  onToggleMute(): void;
}) {
  const alarms = () => sortedAlarms(props.state.snapshot?.alarms ?? []);
  const unacked = () => unackedAlarmsCount(props.state.snapshot);
  const lang = () => props.state.language;
  const writable = () => canControl(props.state);

  return (
    <View class="absolute" style={{ insetL: 0, insetT: 32, width: 400, height: 540 }}>
      <Text
        class="absolute text-xl font-bold"
        style={{ insetL: 16, insetT: 8, width: 170, textColor: props.theme.text }}
      >
        {pick(lang(), "告警与事件", "Alarms & Events")}
      </Text>
      <View
        class="absolute"
        style={{
          insetL: 192,
          insetT: 8,
          width: 78,
          height: 26,
          radius: 13,
          bgColor: unacked() > 0 ? props.theme.criticalChip : props.theme.okChip,
        }}
      >
        <Text
          class="absolute text-2xs font-bold text-center"
          style={{
            insetL: 0,
            insetT: 5,
            width: 78,
            textColor: unacked() > 0 ? props.theme.critical : props.theme.ok,
          }}
        >
          {`${unacked()} ${pick(lang(), "未确认", "Open")}`}
        </Text>
      </View>
      <Pressable
        box={{ left: 278, top: 6, width: 106, height: 28 }}
        style={{ radius: 14, bgColor: props.theme.cardElevated }}
        muted={props.state.muted}
        onTap={props.onToggleMute}
      >
        <Text
          class="absolute text-2xs font-bold text-center"
          style={{ insetL: 0, insetT: 7, width: 106, textColor: props.theme.text }}
        >
          {props.state.muted ? pick(lang(), "告警音: 静音", "Audio: Muted") : pick(lang(), "告警音: 开启", "Audio: On")}
        </Text>
      </Pressable>

      <View
        class="absolute overflow-hidden"
        style={{ insetL: 0, insetT: 46, width: 400, height: 490, bgColor: props.theme.page }}
      >
        {alarms().length === 0 ? (
          <Text
            class="absolute text-sm text-center"
            style={{ insetL: 24, insetT: 180, width: 352, textColor: props.theme.secondaryText }}
          >
            {pick(lang(), "当前无告警记录", "No alarm records")}
          </Text>
        ) : (
          <VirtualList
            count={alarms().length}
            rowHeight={86}
            height={490}
            overscan={86}
            focusRows={false}
            style={{ width: 400 }}
            renderRow={(index) => {
              const alarm = alarms()[index];
              if (!alarm) return <View class="w-full h-full" />;
              const colors = severityColors(alarm, props.theme);
              return (
                <View
                  class="relative"
                  style={{
                    width: 400,
                    height: 86,
                    bgColor: index % 2 === 0 ? props.theme.page : props.theme.card,
                  }}
                >
                  <View
                    class="absolute"
                    style={{ insetL: 16, insetT: 14, width: 54, height: 24, radius: 6, bgColor: colors.bg }}
                  >
                    <Text
                      class="absolute text-2xs font-bold text-center"
                      style={{ insetL: 0, insetT: 4, width: 54, textColor: colors.fg }}
                    >
                      {severityLabel(alarm.severity, props.state)}
                    </Text>
                  </View>
                  <Text
                    class="absolute text-sm font-bold"
                    style={{ insetL: 80, insetT: 14, width: 224, textColor: props.theme.text }}
                  >
                    {pick(lang(), alarm.titleZh, alarm.titleEn)}
                  </Text>
                  <Text
                    class="absolute text-2xs"
                    style={{ insetL: 80, insetT: 44, width: 224, textColor: props.theme.secondaryText }}
                  >
                    {`${alarm.source} · ${formatTime(alarm.epoch, props.utcOffsetMinutes)}`}
                  </Text>
                  <View
                    class="absolute"
                    style={{
                      insetL: 312,
                      insetT: 24,
                      width: 72,
                      height: 36,
                      radius: 8,
                      bgColor: alarm.acked
                        ? props.theme.cardElevated
                        : writable()
                          ? props.theme.accent
                          : props.theme.cardElevated,
                    }}
                  >
                    <Text
                      class="absolute text-xs font-bold text-center"
                      style={{
                        insetL: 0,
                        insetT: 10,
                        width: 72,
                        textColor: alarm.acked
                          ? props.theme.disabledText
                          : writable()
                            ? props.theme.page
                            : props.theme.disabledText,
                      }}
                    >
                      {alarm.acked ? pick(lang(), "已确认", "Acked") : pick(lang(), "确认", "ACK")}
                    </Text>
                  </View>
                  <View
                    class="absolute"
                    style={{ insetL: 16, insetT: 85, width: 368, height: 1, bgColor: props.theme.divider }}
                  />
                </View>
              );
            }}
            onRowPress={(index) => {
              const alarm = alarms()[index];
              if (alarm && !alarm.acked) props.onAck(alarm.id);
            }}
          />
        )}
      </View>
    </View>
  );
}
