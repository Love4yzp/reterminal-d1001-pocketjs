import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import type { PanelState } from "../model";
import type { Language } from "../i18n";
import { visibleTabs, tabLabel, type NavEvent, type Tab } from "../navigation";
import { theme } from "../theme";
import type { IconName } from "./art";
import { Divider, Icon, Pressable } from "./primitives";

export const NAV_TOP = 576;

const ICON: Record<Tab, { active: IconName; idle: IconName }> = {
  home: { active: "home-primary", idle: "home-secondary" },
  lights: { active: "bulb-primary", idle: "bulb-secondary" },
  sensors: { active: "weather-partly", idle: "weather-partly" },
  settings: { active: "cog-primary", idle: "cog-secondary" },
};

export function NavBar(props: { state: PanelState; active: Tab; language: Language; onNav(event: NavEvent): void }) {
  const tabs = () => visibleTabs(props.state);
  const column = () => 400 / tabs().length;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: NAV_TOP, width: 400, height: 64, bgColor: theme.page }}>
      <Divider left={0} top={0} width={400} />
      <For each={tabs()}>{(tab, index) => {
        const active = () => props.active === tab.id;
        return (
          <Pressable
            box={{ left: Math.round(index() * column()), top: 1, width: Math.round(column()), height: 63 }}
            onTap={() => props.onNav({ type: "tab", tab: tab.id })}
          >
            <Icon name={active() ? ICON[tab.id].active : ICON[tab.id].idle} left={Math.round(column() / 2) - 12} top={9} size={24} />
            <Text
              class="absolute text-2xs text-center"
              style={{ insetL: 0, insetT: 37, width: Math.round(column()), textColor: active() ? theme.primary : theme.secondaryText }}
            >
              {tabLabel(tab, props.language)}
            </Text>
          </Pressable>
        );
      }}</For>
    </View>
  );
}
