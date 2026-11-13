import { Text, View } from "@pocketjs/framework/solid/components";
import { PORTRAIT_HOME } from "../home-layout";
import type { Language } from "../i18n";
import type { NetworkInfo } from "../native";
import { haStatus } from "../status";
import type { PanelState } from "../model";
import { theme } from "../theme";
import { Icon } from "./primitives";
import { LoadingDots } from "./loading-dots";

/** Top strip on the home and lights tabs: Wi-Fi on the left, HA on the right. */
export function StatusBar(props: { network: NetworkInfo; state: PanelState; language: Language }) {
  const ha = () => haStatus(props.state, props.language);
  const dot = () => ha().tone === "connected" ? theme.green : ha().tone === "offline" ? theme.on : theme.disabledText;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: PORTRAIT_HOME.width, height: PORTRAIT_HOME.statusBarHeight }}>
      <Icon name={props.network.connected ? "wifi-text" : "wifi-secondary"} left={14} top={4} size={20} />
      <Text
        class="absolute text-xs"
        style={{ insetL: 38, insetT: 6, width: 170, textColor: props.network.connected ? theme.text : theme.secondaryText }}
      >
        {props.network.ssid}
      </Text>
      <View class="absolute" style={{ insetL: 226, insetT: 11, width: 8, height: 8, radius: 4, bgColor: dot() }} />
      <Text class="absolute text-2xs" style={{ insetL: 240, insetT: 8, width: 150, textColor: theme.secondaryText }}>
        {ha().tone === "connected" ? `Home Assistant ${ha().label}` : "Home Assistant"}
      </Text>
      {ha().tone === "connected" ? null : <LoadingDots centerX={372} centerY={14} />}
    </View>
  );
}
