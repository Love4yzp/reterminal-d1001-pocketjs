import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { lightInfo, lightStatusText, lightTone } from "../lights";
import { availableLights, isLightAvailable, type LightId, type PanelAction, type PanelState } from "../model";
import type { NetworkInfo } from "../native";
import { rowIntent, type NavEvent } from "../navigation";
import { pageWindow } from "../showroom";
import { theme } from "../theme";
import { BulbChip, Divider, Icon, Pressable, Switch } from "./primitives";
import { Pager } from "./showroom-cards";
import { StatusBar } from "./status-bar";

interface LightsProps {
  state: PanelState;
  network: NetworkInfo;
  page: number;
  onAction(action: PanelAction): void;
  onNav(event: NavEvent): void;
}

function LightRow(props: LightsProps & { lightId: LightId; index: number }) {
  const light = () => props.state.lights[props.lightId]!;
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const intent = (target: "row" | "switch") => {
    const next = rowIntent(target, props.lightId, availableLights(props.state));
    if (next.action) props.onAction(next.action);
    if (next.nav) props.onNav(next.nav);
  };
  return (
    <Pressable
      box={{ left: 0, top: 4 + props.index * 76, width: 368, height: 76 }}
      onTap={() => intent("row")}
    >
      {props.index > 0 ? <Divider left={14} top={0} width={340} /> : null}
      <BulbChip tone={lightTone(props.state, props.lightId)} left={14} top={18} size={40} />
      <Text
        class="absolute text-sm font-bold"
        style={{ insetL: 68, insetT: 15, width: 164, textColor: enabled() ? theme.text : theme.secondaryText }}
      >
        {lightInfo(props.state, props.lightId).name}
      </Text>
      <Text
        class="absolute text-xs"
        style={{ insetL: 68, insetT: 39, width: 164, textColor: enabled() ? theme.secondaryText : theme.disabledText }}
      >
        {lightStatusText(props.state, props.lightId)}
      </Text>
      <Pressable box={{ left: 238, top: 14, width: 68, height: 48 }} onTap={() => intent("switch")}>
        <Switch on={light().on} enabled={enabled()} left={12} top={10} />
      </Pressable>
      <Icon name={enabled() ? "chevron-secondary" : "chevron-page"} left={326} top={30} size={16} />
    </Pressable>
  );
}

export function LightsScreen(props: LightsProps) {
  const window = () => pageWindow(props.state.lightOrder, props.page, 4);
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640 }}>
      <StatusBar network={props.network} state={props.state} />
      <Text class="absolute text-2xl font-bold" style={{ insetL: 20, insetT: 44, width: 200, textColor: theme.text }}>灯光</Text>
      <Text class="absolute text-sm" style={{ insetL: 20, insetT: 86, width: 240, textColor: theme.secondaryText }}>
        {`${availableLights(props.state).length} / ${props.state.lightOrder.length} 盏可用`}
      </Text>
      <View class="absolute" style={{ insetL: 16, insetT: 118, width: 368, height: 312, radius: 12, bgColor: theme.card }}>
        <For each={window().items}>{(lightId, index) => (
          <LightRow {...props} lightId={lightId} index={index()} />
        )}</For>
      </View>
      <Pager left={16} top={446} width={368} page={window().page} pageCount={window().pageCount} target="lights" onNav={props.onNav} />
      <Text class="absolute text-xs text-center" style={{ insetL: 16, insetT: 522, width: 368, textColor: theme.secondaryText }}>
        点击灯名调节亮度，点击开关切换电源
      </Text>
    </View>
  );
}
