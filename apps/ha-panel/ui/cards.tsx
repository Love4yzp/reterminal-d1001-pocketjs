import type { JSX } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatDate, formatTime, formatTimezone } from "../clock";
import type { SensorSample } from "../model";
import { theme } from "../theme";
import type { WeatherEntity } from "../weather";

interface CardProps {
  left: number;
  top: number;
  width: number;
  height: number;
  children: JSX.Element;
}

function Card(props: CardProps) {
  return (
    <View
      class="absolute"
      style={{
        insetL: props.left,
        insetT: props.top,
        width: props.width,
        height: props.height,
        radius: theme.cardRadius,
        bgColor: theme.card,
      }}
    >
      {props.children}
    </View>
  );
}

interface ClockCardProps {
  epoch: number | null;
  utcOffsetMinutes: number;
  synced: boolean;
  haConfigured: boolean;
  haConnected: boolean;
}

export function ClockCard(props: ClockCardProps) {
  return (
    <Card left={12} top={12} width={376} height={124}>
      <Text class="absolute left-[18] top-[12] text-xs" style={{ textColor: theme.secondaryText }}>{`时间 / ${formatTimezone(props.utcOffsetMinutes)}`}</Text>
      <Text class="absolute left-[230] top-[12] w-[128] text-right text-xs" style={{ textColor: props.haConfigured ? theme.brand : theme.secondaryText }}>
        {!props.haConfigured ? "HA 未连接" : props.haConnected ? "HA 已连接" : "HA 连接中"}
      </Text>
      <Text class="absolute left-[18] top-[32] w-[340] text-5xl font-bold" style={{ textColor: theme.text }}>
        {formatTime(props.epoch, props.utcOffsetMinutes)}
      </Text>
      <Text class="absolute left-[18] top-[99] text-xs" style={{ textColor: theme.secondaryText }}>
        {formatDate(props.epoch, props.utcOffsetMinutes)}
      </Text>
      <Text class="absolute left-[258] top-[99] text-xs" style={{ textColor: theme.secondaryText }}>
        {props.synced ? "RTC + SNTP" : "PCF8563 RTC"}
      </Text>
    </Card>
  );
}

export function WeatherCard(props: { weather: WeatherEntity }) {
  return (
    <Card left={12} top={146} width={376} height={100}>
      <Text class="absolute left-[18] top-[12] text-xs" style={{ textColor: theme.secondaryText }}>天气</Text>
      <Text class="absolute left-[18] top-[36] text-sm font-bold" style={{ textColor: theme.text }}>多云</Text>
      <Text class="absolute left-[218] top-[23] text-4xl font-bold" style={{ textColor: theme.text }}>
        {`${props.weather.attributes.temperature.toFixed(1)}°`}
      </Text>
      <Text class="absolute left-[18] top-[72] text-xs" style={{ textColor: theme.secondaryText }}>
        {`湿度 ${props.weather.attributes.humidity}% · 风速 ${props.weather.attributes.wind_speed} km/h`}
      </Text>
      <Text class="absolute left-[260] top-[76] text-2xs" style={{ textColor: theme.secondaryText }}>演示数据</Text>
    </Card>
  );
}

export function SensorsCard(props: { sample: SensorSample | null }) {
  const sample = props.sample;
  return (
    <Card left={12} top={494} width={376} height={144}>
      <Text class="absolute left-[18] top-[12] text-xs" style={{ textColor: theme.secondaryText }}>姿态 / IMU</Text>
      {sample ? (
        <>
          <Text class="absolute left-[18] top-[38] w-[340] text-sm" style={{ textColor: theme.text }}>
            {`ACC ${sample.acceleration.x.toFixed(1)}  ${sample.acceleration.y.toFixed(1)}  ${sample.acceleration.z.toFixed(1)} m/s²`}
          </Text>
          <Text class="absolute left-[18] top-[62] w-[340] text-sm" style={{ textColor: theme.text }}>
            {`GYR ${sample.angularRate.x.toFixed(1)}  ${sample.angularRate.y.toFixed(1)}  ${sample.angularRate.z.toFixed(1)} °/s`}
          </Text>
          <Text class="absolute left-[18] top-[89] text-sm font-bold" style={{ textColor: theme.text }}>
            {`芯片温度 ${sample.chipCelsius.toFixed(1)} °C`}
          </Text>
          <Text class="absolute left-[18] top-[117] text-2xs" style={{ textColor: theme.secondaryText }}>
            芯片温度，高于室温
          </Text>
        </>
      ) : (
        <>
          <Text class="absolute left-[18] top-[48] text-sm" style={{ textColor: theme.text }}>IMU 不可用</Text>
          <Text class="absolute left-[18] top-[98] text-2xs" style={{ textColor: theme.secondaryText }}>
            未确认环境光传感器，未显示
          </Text>
        </>
      )}
    </Card>
  );
}
