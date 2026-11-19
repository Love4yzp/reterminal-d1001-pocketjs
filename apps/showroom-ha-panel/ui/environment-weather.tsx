import { Text, View } from "@pocketjs/framework/solid/components";
import type { Language } from "../i18n";
import type { PanelState } from "../model";
import { theme } from "../theme";
import { weatherIcon, weatherLabel, weatherTemperature } from "../weather";
import { Icon, type Box } from "./primitives";

export function EnvironmentWeather(props: { state: PanelState; language: Language; box: Box }) {
  const weather = () => props.state.haConnected ? props.state.weather : null;
  return weather() ? (
    <View class="absolute" style={{ insetL: props.box.left, insetT: props.box.top, width: props.box.width, height: props.box.height, radius: 12, bgColor: theme.card }}>
      <Icon name={weatherIcon(weather()!)} left={20} top={20} size={48} />
      <Text class="absolute text-lg font-bold" style={{ insetL: 88, insetT: 20, width: props.box.width - 108, textColor: theme.text }}>
        {weatherTemperature(weather()!)}
      </Text>
      <Text class="absolute text-sm" style={{ insetL: 88, insetT: 60, width: props.box.width - 108, textColor: theme.secondaryText }}>
        {weatherLabel(weather()!, props.language)}
      </Text>
    </View>
  ) : null;
}
