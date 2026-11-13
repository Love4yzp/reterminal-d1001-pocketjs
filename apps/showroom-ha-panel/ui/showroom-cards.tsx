import { Text } from "@pocketjs/framework/solid/components";
import { pick, type Language } from "../i18n";
import type { PanelState } from "../model";
import type { NavEvent } from "../navigation";
import { formatSensorValue, sensorName, sensorStatusText, showroomSensor } from "../showroom";
import { theme } from "../theme";
import { Pressable, type Box } from "./primitives";
import { LoadingDots } from "./loading-dots";

export function SensorCard(props: {
  state: PanelState;
  language: Language;
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
        {sensorName(sensor(), props.language)}
      </Text>
      <Text class={props.compact ? "absolute text-lg font-bold" : "absolute text-2xl font-bold"} style={{ insetL: 12, insetT: valueTop(), width: props.box.width - 24, textColor: theme.text }}>
        {`${formatSensorValue(sensor(), reading())}${reading().value === null ? "" : ` ${sensor().unit}`}`}
      </Text>
      {reading().value === null ? <LoadingDots centerX={36} centerY={valueTop() + 14} /> : null}
      <Text class="absolute text-2xs" style={{ insetL: 12, insetT: props.box.height - 22, width: props.box.width - 24, textColor: reading().status === "live" ? theme.green : theme.disabledText }}>
        {sensorStatusText(reading(), props.state.sensorErrors[props.sensorId], props.language)}
      </Text>
    </Pressable>
  );
}

export function Pager(props: {
  left: number;
  top: number;
  width: number;
  language: Language;
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
        <Text class="absolute text-xs text-center" style={{ insetL: 0, insetT: 12, width: 104, textColor: props.page > 0 ? theme.text : theme.disabledText }}>
          {pick(props.language, "上一页", "Prev")}
        </Text>
      </Pressable>
      <Text class="absolute text-xs text-center" style={{ insetL: props.left + 112, insetT: props.top + 12, width: props.width - 224, textColor: theme.secondaryText }}>
        {`${props.page + 1} / ${props.pageCount}`}
      </Text>
      <Pressable
        box={{ left: props.left + props.width - 104, top: props.top, width: 104, height: 40 }}
        style={{ radius: 10, bgColor: props.page + 1 < props.pageCount ? theme.secondaryBackground : theme.card }}
        onTap={() => props.onNav({ type: "page", target: props.target, direction: 1 })}
      >
        <Text class="absolute text-xs text-center" style={{ insetL: 0, insetT: 12, width: 104, textColor: props.page + 1 < props.pageCount ? theme.text : theme.disabledText }}>
          {pick(props.language, "下一页", "Next")}
        </Text>
      </Pressable>
    </>
  );
}
