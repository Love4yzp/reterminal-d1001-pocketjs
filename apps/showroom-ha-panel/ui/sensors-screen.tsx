import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import type { NetworkInfo } from "../native";
import type { NavEvent } from "../navigation";
import type { PanelState } from "../model";
import { formatSensorValue, pageWindow, sensorStatusText, showroomSensor } from "../showroom";
import { theme } from "../theme";
import { Icon, Pressable } from "./primitives";
import { Pager, SensorCard } from "./showroom-cards";
import { StatusBar } from "./status-bar";

interface SensorsProps {
  state: PanelState;
  network: NetworkInfo;
  page: number;
  onNav(event: NavEvent): void;
}

export function SensorsScreen(props: SensorsProps) {
  const window = () => pageWindow(props.state.sensorOrder, props.page, 4);
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640 }}>
      <StatusBar network={props.network} state={props.state} />
      <Text class="absolute text-2xl font-bold" style={{ insetL: 20, insetT: 44, width: 200, textColor: theme.text }}>环境</Text>
      <Text class="absolute text-sm" style={{ insetL: 20, insetT: 86, width: 300, textColor: theme.secondaryText }}>只读状态</Text>
      <For each={window().items}>{(sensorId, index) => (
        <SensorCard
          state={props.state}
          sensorId={sensorId}
          box={{ left: 16 + (index() % 2) * 190, top: 118 + Math.floor(index() / 2) * 158, width: 178, height: 140 }}
          onNav={props.onNav}
        />
      )}</For>
      <Pager left={16} top={446} width={368} page={window().page} pageCount={window().pageCount} target="sensors" onNav={props.onNav} />
    </View>
  );
}

export function SensorDetailScreen(props: {
  state: PanelState;
  sensorId: string;
  landscape?: boolean;
  onNav(event: NavEvent): void;
}) {
  const sensor = () => showroomSensor(props.sensorId)!;
  const reading = () => props.state.sensors[props.sensorId]!;
  const width = () => props.landscape ? 640 : 400;
  const cardWidth = () => props.landscape ? 520 : 368;
  const cardLeft = () => props.landscape ? 88 : 16;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: width(), height: props.landscape ? 400 : 640, bgColor: theme.page }}>
      <Pressable
        box={{ left: 0, top: 0, width: 238, height: 52 }}
        onTap={() => props.onNav({ type: "back" })}
      >
        <Icon name="back-text" left={16} top={12} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 14, width: 180, textColor: theme.text }}>{sensor().name}</Text>
      </Pressable>
      <Text class="absolute text-xs text-right" style={{ insetL: width() - 190, insetT: 18, width: 174, textColor: theme.disabledText }}>Home Assistant · 只读</Text>
      <View class="absolute" style={{ insetL: cardLeft(), insetT: 82, width: cardWidth(), height: 220, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm" style={{ insetL: 20, insetT: 20, width: cardWidth() - 40, textColor: theme.secondaryText }}>{sensor().name}</Text>
        <Text class="absolute text-2xl font-bold" style={{ insetL: 20, insetT: 66, width: cardWidth() - 40, textColor: theme.text }}>
          {`${formatSensorValue(sensor(), reading())}${reading().value === null ? "" : ` ${sensor().unit}`}`}
        </Text>
        <Text class="absolute text-sm" style={{ insetL: 20, insetT: 126, width: cardWidth() - 40, textColor: reading().status === "live" ? theme.green : theme.secondaryText }}>
          {sensorStatusText(reading(), props.state.sensorErrors[props.sensorId])}
        </Text>
        <Text class="absolute text-xs" style={{ insetL: 20, insetT: 166, width: cardWidth() - 40, textColor: theme.disabledText }}>
          {reading().status === "pending" ? "等待接口数据" : `显示键 ${sensor().key}`}
        </Text>
      </View>
      <Text class="absolute text-xs text-center" style={{ insetL: cardLeft(), insetT: 324, width: cardWidth(), textColor: theme.disabledText }}>
        只读，不可调节
      </Text>
    </View>
  );
}
