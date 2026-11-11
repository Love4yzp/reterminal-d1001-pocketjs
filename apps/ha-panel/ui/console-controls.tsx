import { Text } from "@pocketjs/framework/solid/components";
import { sameFocus } from "../input";
import { lightInfo, lightStatusText, lightTone } from "../lights";
import { availableLights, isLightAvailable, type LightId, type PanelAction, type PanelState } from "../model";
import { tileIntent, type NavEvent } from "../navigation";
import {
  actionStatusText,
  sensorStatusText,
  SHOWROOM,
  showroomAction,
  showroomTelemetry,
} from "../showroom";
import { agentText, armModeText, resultText, withFreshness } from "../telemetry";
import { theme } from "../theme";
import { BulbChip, Pressable, Switch, type Box } from "./primitives";
import type { FocusProps } from "./showroom-cards";

export interface ConsoleControlProps extends FocusProps {
  state: PanelState;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
}

export function MainLightControl(props: ConsoleControlProps & { lightId: LightId; box: Box }) {
  const light = () => props.state.lights[props.lightId]!;
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const powerTarget = () => ({ kind: "light" as const, id: props.lightId });
  const powerIntent = (gesture: "tap" | "long-press") => {
    props.onFocus(powerTarget());
    const next = tileIntent(gesture, props.lightId, availableLights(props.state));
    if (next.action) props.onAction(next.action);
    if (next.nav) props.onNav(next.nav);
  };
  return (
    <Pressable
      box={props.box}
      focused={sameFocus(props.focus, powerTarget())}
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

export function ActionButton(props: FocusProps & {
  state: PanelState;
  actionId: string;
  box: Box;
  configured: boolean;
  onHaAction(actionId: string, confirmed: boolean): void;
}) {
  const action = () => showroomAction(props.actionId)!;
  const enabled = () => props.configured && props.state.haConnected;
  const runStatus = () => props.state.actionRuns[props.actionId] ?? "idle";
  const status = () => !props.configured
    ? "未配置"
    : !props.state.haConnected
      ? "离线"
      : action().requiresHold && runStatus() === "idle"
        ? "长按确认"
        : actionStatusText(runStatus());
  const stop = () => props.actionId === "reachy-stop";
  const target = () => ({ kind: "action" as const, id: props.actionId });
  const background = () => stop() ? theme.dangerChip : runStatus() === "pending" ? theme.primaryChip : theme.secondaryBackground;
  return (
    <Pressable
      box={props.box}
      focused={sameFocus(props.focus, target())}
      style={{ radius: 10, bgColor: background() }}
      onTap={action().requiresHold ? undefined : () => {
        props.onFocus(target());
        if (enabled()) props.onHaAction(props.actionId, false);
      }}
      onLongPress={action().requiresHold ? () => {
        props.onFocus(target());
        if (enabled()) props.onHaAction(props.actionId, true);
      } : undefined}
    >
      <Text
        class="absolute text-xs font-bold text-center"
        style={{ insetL: 3, insetT: status() ? 5 : 14, width: props.box.width - 6, textColor: enabled() ? stop() ? theme.danger : theme.text : theme.disabledText }}
      >
        {stop() ? "停止 STOP" : action().name}
      </Text>
      {status() ? (
        <Text class="absolute text-2xs text-center" style={{ insetL: 3, insetT: 25, width: props.box.width - 6, textColor: runStatus() === "accepted" ? theme.green : theme.secondaryText }}>
          {status()}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function TelemetryPanel(props: FocusProps & {
  state: PanelState;
  box: Box;
  onNav(event: NavEvent): void;
}) {
  const agent = () => props.state.sensors["reachy-agent"]!;
  const result = () => props.state.sensors["reachy-result"]!;
  const arm = () => props.state.sensors["arm-mode"]!;
  const target = () => ({ kind: "arm" as const, id: "status" });
  const compact = props.box.width < 300;
  const agentLabel = () => withFreshness(agentText(agent()), agent(), props.state.sensorErrors["reachy-agent"]);
  const armLabel = () => withFreshness(armModeText(arm()), arm(), props.state.sensorErrors["arm-mode"]);
  return (
    <Pressable
      box={props.box}
      focused={sameFocus(props.focus, target())}
      style={{ radius: 12, bgColor: theme.card }}
      onTap={() => {
        props.onFocus(target());
        props.onNav({ type: "open-arm" });
      }}
    >
      {compact ? (
        <>
          <Text class="absolute text-2xs" style={{ insetL: 12, insetT: 8, width: props.box.width - 24, textColor: theme.text }}>
            {`Reachy ${agentLabel()}`}
          </Text>
          <Text class="absolute text-2xs" style={{ insetL: 12, insetT: 30, width: props.box.width - 24, textColor: theme.text }}>
            {`机械臂 ${armLabel()}`}
          </Text>
          <Text class="absolute text-2xs" style={{ insetL: 12, insetT: 52, width: 54, textColor: theme.secondaryText }}>
            {showroomTelemetry("reachy-result").name}
          </Text>
          <Text class="absolute text-xs" style={{ insetL: 72, insetT: 49, width: props.box.width - 84, textColor: theme.text }}>
            {resultText(result())}
          </Text>
          <Text class="absolute text-2xs" style={{ insetL: 12, insetT: 82, width: props.box.width - 100, textColor: theme.secondaryText }}>
            {`回执 ${sensorStatusText(result(), props.state.sensorErrors["reachy-result"])}`}
          </Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: props.box.width - 88, insetT: 82, width: 76, textColor: theme.primary }}>
            查看详情
          </Text>
        </>
      ) : (
        <>
          <Text class="absolute text-2xs" style={{ insetL: 12, insetT: 9, width: props.box.width / 2 - 18, textColor: theme.text }}>
            {`Reachy ${agentLabel()}`}
          </Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: props.box.width / 2, insetT: 9, width: props.box.width / 2 - 12, textColor: theme.text }}>
            {`${showroomTelemetry("arm-mode").name} ${armLabel()}`}
          </Text>
          <Text class="absolute text-2xs" style={{ insetL: 12, insetT: 33, width: 54, textColor: theme.secondaryText }}>
            {showroomTelemetry("reachy-result").name}
          </Text>
          <Text class="absolute text-xs" style={{ insetL: 72, insetT: 30, width: props.box.width - 84, textColor: theme.text }}>
            {resultText(result())}
          </Text>
          <Text class="absolute text-2xs" style={{ insetL: 12, insetT: 59, width: props.box.width - 100, textColor: theme.secondaryText }}>
            {`回执 ${sensorStatusText(result(), props.state.sensorErrors["reachy-result"])}`}
          </Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: props.box.width - 88, insetT: 59, width: 76, textColor: theme.primary }}>
            查看详情
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function homeActionIds(): readonly string[] {
  return SHOWROOM.home.actions;
}
