import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { TABS, type NavEvent, type Tab } from "../navigation";
import { theme } from "../theme";
import type { IconName } from "./art";
import { Divider, Icon, Pressable } from "./primitives";

export const NAV_TOP = 576;
const COLUMN = 400 / TABS.length;

const ICON: Record<Tab, { active: IconName; idle: IconName }> = {
  home: { active: "home-primary", idle: "home-secondary" },
  lights: { active: "bulb-primary", idle: "bulb-secondary" },
  settings: { active: "cog-primary", idle: "cog-secondary" },
};

export function NavBar(props: { active: Tab; onNav(event: NavEvent): void }) {
  return (
    <View class="absolute" style={{ insetL: 0, insetT: NAV_TOP, width: 400, height: 64, bgColor: theme.page }}>
      <Divider left={0} top={0} width={400} />
      <For each={TABS}>{(tab, index) => {
        const active = () => props.active === tab.id;
        return (
          <Pressable
            box={{ left: Math.round(index() * COLUMN), top: 1, width: Math.round(COLUMN), height: 63 }}
            onTap={() => props.onNav({ type: "tab", tab: tab.id })}
          >
            <Icon name={active() ? ICON[tab.id].active : ICON[tab.id].idle} left={Math.round(COLUMN / 2) - 12} top={9} size={24} />
            <Text
              class="absolute text-2xs text-center"
              style={{ insetL: 0, insetT: 37, width: Math.round(COLUMN), textColor: active() ? theme.primary : theme.secondaryText }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      }}</For>
    </View>
  );
}
