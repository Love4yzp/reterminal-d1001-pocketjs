import { Text, View } from "@pocketjs/framework/solid/components";
import { pick, type Language } from "../i18n";
import type { NetworkInfo } from "../native";
import type { NavEvent } from "../navigation";
import type { PanelState } from "../model";
import { formatSensorValue, sensorName, sensorStatusText, showroomSensor } from "../showroom";
import { theme } from "../theme";
import { Icon, Pressable } from "./primitives";
import { LoadingDots } from "./loading-dots";
import { EnvironmentWeather } from "./environment-weather";
import { StatusBar } from "./status-bar";

interface SensorsProps {
  state: PanelState;
  network: NetworkInfo;
  language: Language;
  page: number;
  onNav(event: NavEvent): void;
}

export function SensorsScreen(props: SensorsProps) {
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640 }}>
      <StatusBar network={props.network} state={props.state} language={props.language} />
      <Text class="absolute text-2xl font-bold" style={{ insetL: 20, insetT: 44, width: 260, textColor: theme.text }}>
        {pick(props.language, "环境", "Environment")}
      </Text>
      <Text class="absolute text-sm" style={{ insetL: 20, insetT: 86, width: 300, textColor: theme.secondaryText }}>
        {pick(props.language, "只读状态", "Read-only status")}
      </Text>
      <EnvironmentWeather state={props.state} language={props.language} box={{ left: 16, top: 118, width: 368, height: 140 }} />
    </View>
  );
}

export function SensorDetailScreen(props: {
  state: PanelState;
  sensorId: string;
  language: Language;
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
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 14, width: 182, textColor: theme.text }}>
          {sensorName(sensor(), props.language)}
        </Text>
      </Pressable>
      <Text class="absolute text-xs text-right" style={{ insetL: width() - 200, insetT: 18, width: 184, textColor: theme.disabledText }}>
        {pick(props.language, "Home Assistant · 只读", "Home Assistant · Read-only")}
      </Text>
      <View class="absolute" style={{ insetL: cardLeft(), insetT: 82, width: cardWidth(), height: 220, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm" style={{ insetL: 20, insetT: 20, width: cardWidth() - 40, textColor: theme.secondaryText }}>
          {sensorName(sensor(), props.language)}
        </Text>
        <Text class="absolute text-2xl font-bold" style={{ insetL: 20, insetT: 66, width: cardWidth() - 40, textColor: theme.text }}>
          {`${formatSensorValue(sensor(), reading())}${reading().value === null ? "" : ` ${sensor().unit}`}`}
        </Text>
        <Text class="absolute text-sm" style={{ insetL: 20, insetT: 126, width: cardWidth() - 40, textColor: reading().status === "live" ? theme.green : theme.secondaryText }}>
          {sensorStatusText(reading(), props.state.sensorErrors[props.sensorId], props.language)}
        </Text>
        <Text class="absolute text-xs" style={{ insetL: 20, insetT: 166, width: cardWidth() - 40, textColor: theme.disabledText }}>
          {pick(props.language, `显示键 ${sensor().key}`, `Key ${sensor().key}`)}
        </Text>
        {reading().value === null && reading().status === "pending" ? <LoadingDots centerX={44} centerY={82} /> : null}
      </View>
      <Text class="absolute text-xs text-center" style={{ insetL: cardLeft(), insetT: 324, width: cardWidth(), textColor: theme.disabledText }}>
        {pick(props.language, "只读，不可调节", "Read-only, not adjustable")}
      </Text>
    </View>
  );
}
