import { Text } from "@pocketjs/framework/solid/components";
import { actionButtonEnabled, actionButtonVisual } from "../action-button-state";
import { pick, type Language } from "../i18n";
import { lightInfo, lightStatusText, lightTone } from "../lights";
import { availableLights, isLightAvailable, type LightId, type PanelAction, type PanelState } from "../model";
import { tileIntent, type NavEvent } from "../navigation";
import { actionButtonLabel, SHOWROOM, showroomAction } from "../showroom";
import { theme } from "../theme";
import { BulbChip, Pressable, Switch, type Box } from "./primitives";
import { LoadingDots } from "./loading-dots";

export interface ConsoleControlProps {
  state: PanelState;
  language: Language;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
}

export function MainLightControl(props: ConsoleControlProps & { lightId: LightId; box: Box }) {
  const light = () => props.state.lights[props.lightId]!;
  const info = () => lightInfo(props.state, props.lightId, props.language);
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const status = () => props.state.lightPending[props.lightId]
    ? pick(props.language, "更新中", "Updating")
    : lightStatusText(props.state, props.lightId, props.language);
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
        {info().name}
      </Text>
      <Text class="absolute text-2xs" style={{ insetL: 58, insetT: 31, width: props.box.width - 126, textColor: enabled() ? theme.secondaryText : theme.disabledText }}>
        {status()}
      </Text>
      {status() ? null : <LoadingDots centerX={82} centerY={38} />}
      <Switch on={light().on} enabled={enabled()} left={props.box.width - 60} top={15} />
      <Text class="absolute text-2xs" style={{ insetL: 58, insetT: 50, width: props.box.width - 72, textColor: enabled() ? theme.secondaryText : theme.disabledText }}>
        {pick(props.language, "点击开关，长按调光", "Tap switch · Hold to dim")}
      </Text>
    </Pressable>
  );
}

export function ActionButton(props: {
  state: PanelState;
  language: Language;
  actionId: string;
  box: Box;
  configured: boolean;
  onHaAction(actionId: string, confirmed: boolean): void;
}) {
  const action = () => showroomAction(props.actionId)!;
  const runStatus = () => props.state.actionRuns[props.actionId] ?? "idle";
  const enabled = () => actionButtonEnabled(action().group, runStatus(), props.configured, props.state.haConnected);
  const ready = () => props.configured && props.state.haConnected;
  const stop = () => props.actionId === "reachy-stop";
  const visual = () => actionButtonVisual(runStatus(), stop(), ready());
  const large = () => props.box.height >= 80;
  const labelTop = () => Math.round((props.box.height - (large() ? 19 : 15)) / 2);
  return (
    <Pressable
      box={props.box}
      style={{ radius: 10, bgColor: visual().background }}
      onTap={() => {
        if (enabled()) props.onHaAction(props.actionId, action().group === "arm");
      }}
      onLongPress={action().group === "arm" ? () => {
        if (enabled()) props.onHaAction(props.actionId, true);
      } : undefined}
    >
      {ready() ? (
        <Text
          class={large() ? "absolute text-sm font-bold text-center" : "absolute text-xs font-bold text-center"}
          style={{ insetL: 3, insetT: labelTop(), width: props.box.width - 6, textColor: visual().text }}
        >
          {actionButtonLabel(action(), props.language)}
        </Text>
      ) : <LoadingDots centerX={props.box.width / 2} centerY={props.box.height / 2} />}
    </Pressable>
  );
}

export function homeActionIds(): readonly string[] {
  return SHOWROOM.home.actions;
}
