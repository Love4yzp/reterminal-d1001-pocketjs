import type { JSX } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatDate, formatTime } from "../clock";
import type { SensorSample } from "../model";
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
      class="absolute rounded-[18] bg-[#172033]"
      style={{ insetL: props.left, insetT: props.top, width: props.width, height: props.height }}
    >
      {props.children}
    </View>
  );
}

interface ClockCardProps {
  epoch: number | null;
  synced: boolean;
  haConfigured: boolean;
  haConnected: boolean;
}

export function ClockCard(props: ClockCardProps) {
  return (
    <Card left={12} top={12} width={376} height={124}>
      <Text class="absolute left-[18] top-[12] text-xs text-[#9eabc0]">时间 / UTC</Text>
      <Text class="absolute left-[230] top-[12] w-[128] text-right text-xs text-[#4fd1c5]">
        {!props.haConfigured ? "HA 未连接" : props.haConnected ? "HA 已连接" : "HA 连接中"}
      </Text>
      <Text class="absolute left-[18] top-[32] w-[340] text-5xl font-bold text-[#f4f7fb]">
        {formatTime(props.epoch)}
      </Text>
      <Text class="absolute left-[18] top-[99] text-xs text-[#9eabc0]">
        {formatDate(props.epoch)}
      </Text>
      <Text class="absolute left-[258] top-[99] text-xs text-[#9eabc0]">
        {props.synced ? "RTC + SNTP" : "PCF8563 RTC"}
      </Text>
    </Card>
  );
}

export function WeatherCard(props: { weather: WeatherEntity }) {
  return (
    <Card left={12} top={146} width={376} height={100}>
      <Text class="absolute left-[18] top-[12] text-xs text-[#9eabc0]">天气</Text>
      <Text class="absolute left-[18] top-[36] text-xl font-bold text-[#f4f7fb]">多云</Text>
      <Text class="absolute left-[218] top-[23] text-4xl font-bold text-[#f4b856]">
        {`${props.weather.attributes.temperature.toFixed(1)}°`}
      </Text>
      <Text class="absolute left-[18] top-[72] text-xs text-[#9eabc0]">
        {`湿度 ${props.weather.attributes.humidity}% · 风速 ${props.weather.attributes.wind_speed} km/h`}
      </Text>
      <Text class="absolute left-[260] top-[76] text-2xs text-[#9eabc0]">演示数据</Text>
    </Card>
  );
}

export function SensorsCard(props: { sample: SensorSample | null }) {
  const sample = props.sample;
  return (
    <Card left={12} top={494} width={376} height={144}>
      <Text class="absolute left-[18] top-[12] text-xs text-[#9eabc0]">姿态 / IMU</Text>
      {sample ? (
        <>
          <Text class="absolute left-[18] top-[38] w-[340] text-sm text-[#f4f7fb]">
            {`ACC ${sample.acceleration.x.toFixed(1)}  ${sample.acceleration.y.toFixed(1)}  ${sample.acceleration.z.toFixed(1)} m/s²`}
          </Text>
          <Text class="absolute left-[18] top-[62] w-[340] text-sm text-[#f4f7fb]">
            {`GYR ${sample.angularRate.x.toFixed(1)}  ${sample.angularRate.y.toFixed(1)}  ${sample.angularRate.z.toFixed(1)} °/s`}
          </Text>
          <Text class="absolute left-[18] top-[89] text-sm font-bold text-[#f4b856]">
            {`芯片温度 ${sample.chipCelsius.toFixed(1)} °C`}
          </Text>
          <Text class="absolute left-[18] top-[117] text-2xs text-[#9eabc0]">
            芯片温度，高于室温
          </Text>
        </>
      ) : (
        <>
          <Text class="absolute left-[18] top-[48] text-lg text-[#f4b856]">IMU 不可用</Text>
          <Text class="absolute left-[18] top-[98] text-2xs text-[#9eabc0]">
            未确认环境光传感器，未显示
          </Text>
        </>
      )}
    </Card>
  );
}
