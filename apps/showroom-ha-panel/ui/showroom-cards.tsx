import { Text } from "@pocketjs/framework/solid/components";
import type { PanelState } from "../model";
import type { NavEvent } from "../navigation";
import { formatSensorValue, sensorStatusText, showroomSensor } from "../showroom";
import { theme } from "../theme";
import { Pressable, type Box } from "./primitives";

export function SensorCard(props: {
  state: PanelState;
  sensorId: string;
  box: Box;
  compact?: boolean;
  onNav(event: NavEvent): void;
}) {
  const sensor = () => showroomSensor(props.sensorId)!;
  const reading = () => props.state.sensors[props.sensorId]!;
  const valueTop = () => props.compact ? 26 : 45;
  return (
    <Pressable
      box={props.box}
      style={{ radius: 12, bgColor: theme.card }}
      onTap={() => props.onNav({ type: "open-sensor", sensorId: props.sensorId })}
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
