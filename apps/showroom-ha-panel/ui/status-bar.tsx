import { Text, View } from "@pocketjs/framework/solid/components";
import type { NetworkInfo } from "../native";
import { haStatus } from "../status";
import type { PanelState } from "../model";
import { theme } from "../theme";
import { Icon } from "./primitives";

/** Top strip on the home and lights tabs: Wi-Fi on the left, HA on the right. */
export function StatusBar(props: { network: NetworkInfo; state: PanelState }) {
  const ha = () => haStatus(props.state);
  const dot = () => ha().tone === "connected" ? theme.green : ha().tone === "offline" ? theme.on : theme.disabledText;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 28 }}>
      <Icon name={props.network.connected ? "wifi-text" : "wifi-secondary"} left={14} top={4} size={20} />
      <Text
        class="absolute text-xs"
        style={{ insetL: 38, insetT: 6, width: 170, textColor: props.network.connected ? theme.text : theme.secondaryText }}
      >
        {props.network.ssid}
      </Text>
      <View class="absolute" style={{ insetL: 236, insetT: 11, width: 8, height: 8, radius: 4, bgColor: dot() }} />
      <Text class="absolute text-xs" style={{ insetL: 250, insetT: 6, width: 140, textColor: theme.secondaryText }}>
        {`Home Assistant ${ha().label}`}
      </Text>
    </View>
  );
}
