import { Text } from "@pocketjs/framework/solid/components";
import { lightInfo, lightStatusText, lightTone } from "../lights";
import { availableLights, isLightAvailable, type LightId, type PanelAction, type PanelState } from "../model";
import { tileIntent, type NavEvent } from "../navigation";
import { actionStatusText, SHOWROOM, showroomAction } from "../showroom";
import { theme } from "../theme";
import { BulbChip, Pressable, Switch, type Box } from "./primitives";

export interface ConsoleControlProps {
  state: PanelState;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
}

export function MainLightControl(props: ConsoleControlProps & { lightId: LightId; box: Box }) {
  const light = () => props.state.lights[props.lightId]!;
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const powerIntent = (gesture: "tap" | "long-press") => {
    const next = tileIntent(gesture, props.lightId, availableLights(props.state));
    if (next.action) props.onAction(next.action);
    if (next.nav) props.onNav(next.nav);
  };
  return (
    <Pressable
      box={props.box}
      style={{ radius: 12, bgColor: theme.card }}
      onTap={() => powerIntent("tap")}
      onLongPress={() => powerIntent("long-press")}
    >
      <BulbChip tone={lightTone(props.state, props.lightId)} left={12} top={10} size={36} />
      <Text class="absolute text-sm font-bold" style={{ insetL: 58, insetT: 10, width: props.box.width - 126, textColor: theme.text }}>
        {lightInfo(props.state, props.lightId).name}
      </Text>
      <Text class="absolute text-2xs" style={{ insetL: 58, insetT: 31, width: props.box.width - 126, textColor: enabled() ? theme.secondaryText : theme.disabledText }}>
        {props.state.lightPending[props.lightId] ? "更新中" : lightStatusText(props.state, props.lightId)}
      </Text>
      <Switch on={light().on} enabled={enabled()} left={props.box.width - 60} top={15} />
      <Text class="absolute text-2xs" style={{ insetL: 58, insetT: 50, width: props.box.width - 72, textColor: enabled() ? theme.secondaryText : theme.disabledText }}>
        点击开关，长按调光
      </Text>
    </Pressable>
  );
}

export function ActionButton(props: {
  state: PanelState;
  actionId: string;
  box: Box;
  configured: boolean;
  onHaAction(actionId: string, confirmed: boolean): void;
}) {
  const action = () => showroomAction(props.actionId)!;
  const runStatus = () => props.state.actionRuns[props.actionId] ?? "idle";
  const enabled = () => props.configured && props.state.haConnected &&
    (action().group !== "arm" || runStatus() === "idle");
  const status = () => !props.configured
    ? "未配置"
    : !props.state.haConnected
      ? "离线"
      : action().group === "arm" && runStatus() === "accepted"
        ? "已发送"
        : actionStatusText(runStatus());
  const stop = () => props.actionId === "reachy-stop";
  const background = () => stop() ? theme.dangerChip : runStatus() === "pending" ? theme.primaryChip : theme.secondaryBackground;
  const contentOffset = () => Math.max(0, (props.box.height - 52) / 2);
  return (
    <Pressable
      box={props.box}
      style={{ radius: 10, bgColor: background() }}
      onTap={() => {
        if (enabled()) props.onHaAction(props.actionId, action().group === "arm");
      }}
      onLongPress={action().group === "arm" ? () => {
        if (enabled()) props.onHaAction(props.actionId, true);
      } : undefined}
    >
      <Text
        class="absolute text-xs font-bold text-center"
        style={{ insetL: 3, insetT: (status() ? 5 : 14) + contentOffset(), width: props.box.width - 6, textColor: enabled() ? stop() ? theme.danger : theme.text : theme.disabledText }}
      >
        {stop() ? "停止 STOP" : action().name}
      </Text>
      {status() ? (
        <Text class="absolute text-2xs text-center" style={{ insetL: 3, insetT: 25 + contentOffset(), width: props.box.width - 6, textColor: runStatus() === "accepted" ? theme.green : theme.secondaryText }}>
          {status()}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ArmControlCard(props: {
  box: Box;
  onNav(event: NavEvent): void;
}) {
  const compact = props.box.height < 120;
  return (
    <Pressable
      box={props.box}
      style={{ radius: 12, bgColor: theme.card }}
      onTap={() => props.onNav({ type: "open-arm" })}
    >
      <Text class="absolute text-sm font-bold" style={{ insetL: 12, insetT: compact ? 12 : 14, width: props.box.width - (compact ? 112 : 24), textColor: theme.text }}>
        机械臂操作
      </Text>
      {compact ? (
        <>
          <Text class="absolute text-xs" style={{ insetL: 12, insetT: 48, width: props.box.width - 24, textColor: theme.text }}>
            重力补偿 / 动作回放
          </Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: props.box.width - 88, insetT: 16, width: 76, textColor: theme.primary }}>
            点击操作
          </Text>
        </>
      ) : (
        <>
          <Text class="absolute text-xs" style={{ insetL: 12, insetT: 58, width: props.box.width - 24, textColor: theme.text }}>
            重力补偿
          </Text>
          <Text class="absolute text-xs" style={{ insetL: 12, insetT: 88, width: props.box.width - 24, textColor: theme.text }}>
            动作回放
          </Text>
          <Text class="absolute text-2xs" style={{ insetL: 12, insetT: props.box.height - 36, width: props.box.width - 24, textColor: theme.primary }}>
            点击操作
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function homeActionIds(): readonly string[] {
  return SHOWROOM.home.actions;
}
