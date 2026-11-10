import { Text } from "@pocketjs/framework/solid/components";
import { percentFromBrightness } from "../dimmer";
import { sameFocus, type FocusTarget } from "../input";
import { lightInfo, lightStatusText, lightTone } from "../lights";
import { availableLights, isLightAvailable, type LightId, type PanelAction, type PanelState } from "../model";
import { tileIntent, type NavEvent } from "../navigation";
import {
  formatSensorValue,
  sceneStatusText,
  sensorStatusText,
  SHOWROOM,
  showroomScene,
  showroomSensor,
} from "../showroom";
import { theme } from "../theme";
import { BulbChip, Pressable, type Box } from "./primitives";

export interface FocusProps {
  focus: FocusTarget | null;
  onFocus(target: FocusTarget): void;
}

export function LightTile(props: FocusProps & {
  state: PanelState;
  lightId: LightId;
  box: Box;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
}) {
  const light = () => props.state.lights[props.lightId]!;
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const tone = () => lightTone(props.state, props.lightId);
  const target = () => ({ kind: "light" as const, id: props.lightId });
  const intent = (gesture: "tap" | "long-press") => {
    props.onFocus(target());
    const next = tileIntent(gesture, props.lightId, availableLights(props.state));
    if (next.action) props.onAction(next.action);
    if (next.nav) props.onNav(next.nav);
  };
  return (
    <Pressable
      box={props.box}
      focused={sameFocus(props.focus, target())}
      style={{ radius: 12, bgColor: enabled() && light().on ? theme.tileOn : theme.card }}
      onTap={() => intent("tap")}
      onLongPress={() => intent("long-press")}
    >
      <BulbChip tone={tone()} left={14} top={14} size={40} />
      <Text
        class="absolute text-sm font-bold"
        style={{ insetL: 14, insetT: 54, width: props.box.width - 28, textColor: enabled() ? theme.text : theme.secondaryText }}
      >
        {lightInfo(props.state, props.lightId).name}
      </Text>
      <Text
        class="absolute text-xs"
        style={{ insetL: 14, insetT: 75, width: props.box.width - 28, textColor: enabled() ? theme.secondaryText : theme.disabledText }}
      >
        {lightStatusText(props.state, props.lightId)}
      </Text>
      {enabled() && light().on ? (
        <Text class="absolute text-2xs text-right" style={{ insetL: 14, insetT: 96, width: props.box.width - 28, textColor: tone() === "cool" ? theme.primary : theme.on }}>
          {`${percentFromBrightness(light().brightness)}%`}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function SensorCard(props: FocusProps & {
  state: PanelState;
  sensorId: string;
  box: Box;
  compact?: boolean;
  onNav(event: NavEvent): void;
}) {
  const sensor = () => showroomSensor(props.sensorId)!;
  const reading = () => props.state.sensors[props.sensorId]!;
  const target = () => ({ kind: "sensor" as const, id: props.sensorId });
  const valueTop = () => props.compact ? 29 : 45;
  return (
    <Pressable
      box={props.box}
      focused={sameFocus(props.focus, target())}
      style={{ radius: 12, bgColor: theme.card }}
      onTap={() => {
        props.onFocus(target());
        props.onNav({ type: "open-sensor", sensorId: props.sensorId });
      }}
    >
      <Text class="absolute text-xs" style={{ insetL: 12, insetT: 10, width: props.box.width - 24, textColor: theme.secondaryText }}>
        {sensor().name}
      </Text>
      <Text class={props.compact ? "absolute text-lg font-bold" : "absolute text-2xl font-bold"} style={{ insetL: 12, insetT: valueTop(), width: props.box.width - 24, textColor: theme.text }}>
        {`${formatSensorValue(sensor(), reading())}${reading().value === null ? "" : ` ${sensor().unit}`}`}
      </Text>
      <Text class="absolute text-2xs" style={{ insetL: 12, insetT: props.box.height - 22, width: props.box.width - 24, textColor: reading().status === "live" ? theme.green : theme.disabledText }}>
        {sensorStatusText(reading(), props.state.sensorErrors[props.sensorId])}
      </Text>
    </Pressable>
  );
}

export function SceneButton(props: FocusProps & {
  state: PanelState;
  sceneId: string;
  box: Box;
  onScene(sceneId: string): void;
}) {
  const scene = () => showroomScene(props.sceneId)!;
  const target = () => ({ kind: "scene" as const, id: props.sceneId });
  const status = () => sceneStatusText(props.state.sceneRuns[props.sceneId] ?? "idle");
  return (
    <Pressable
      box={props.box}
      focused={sameFocus(props.focus, target())}
      style={{ radius: 12, bgColor: theme.card }}
      onTap={() => {
        props.onFocus(target());
        props.onScene(props.sceneId);
      }}
    >
      <Text
        class={status() ? "absolute text-xs text-center" : "absolute text-sm text-center"}
        style={{ insetL: 0, insetT: status() ? 7 : 15, width: props.box.width, textColor: theme.text }}
      >
        {scene().name}
      </Text>
      {status() ? (
        <Text class="absolute text-2xs text-center" style={{ insetL: 0, insetT: 27, width: props.box.width, textColor: status() === "完成" ? theme.green : theme.secondaryText }}>
          {status()}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Pager(props: {
  left: number;
  top: number;
  width: number;
  page: number;
  pageCount: number;
  target: "lights" | "sensors";
  onNav(event: NavEvent): void;
}) {
  if (props.pageCount <= 1) return null;
  return (
    <>
      <Pressable
        box={{ left: props.left, top: props.top, width: 104, height: 40 }}
        style={{ radius: 10, bgColor: props.page > 0 ? theme.secondaryBackground : theme.card }}
        onTap={() => props.onNav({ type: "page", target: props.target, direction: -1 })}
      >
        <Text class="absolute text-xs text-center" style={{ insetL: 0, insetT: 12, width: 104, textColor: props.page > 0 ? theme.text : theme.disabledText }}>上一页</Text>
      </Pressable>
      <Text class="absolute text-xs text-center" style={{ insetL: props.left + 112, insetT: props.top + 12, width: props.width - 224, textColor: theme.secondaryText }}>
        {`${props.page + 1} / ${props.pageCount}`}
      </Text>
      <Pressable
        box={{ left: props.left + props.width - 104, top: props.top, width: 104, height: 40 }}
        style={{ radius: 10, bgColor: props.page + 1 < props.pageCount ? theme.secondaryBackground : theme.card }}
        onTap={() => props.onNav({ type: "page", target: props.target, direction: 1 })}
      >
        <Text class="absolute text-xs text-center" style={{ insetL: 0, insetT: 12, width: 104, textColor: props.page + 1 < props.pageCount ? theme.text : theme.disabledText }}>下一页</Text>
      </Pressable>
    </>
  );
}
