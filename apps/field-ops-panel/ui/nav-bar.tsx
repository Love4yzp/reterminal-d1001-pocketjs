import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import type { Language } from "../i18n";
import { TABS, tabLabel, type Tab } from "../navigation";
import type { OpsTheme } from "../theme";
import type { IconName } from "./art";
import { Divider, Icon, Pressable } from "./primitives";

export function tabIcon(tab: Tab, active: boolean, unackedAlarms: number): IconName {
  if (tab === "alarms") {
    if (unackedAlarms > 0 && !active) return "alarm-alert";
    return active ? "alarm-text" : "alarm-secondary";
  }
  if (tab === "control") return active ? "control-text" : "control-secondary";
  if (tab === "system") return active ? "cog-text" : "cog-secondary";
  return active ? "home-text" : "home-secondary";
}

export function NavBar(props: {
  active: Tab;
  language: Language;
  unackedAlarms: number;
  theme: OpsTheme;
  onSelect(tab: Tab): void;
}) {
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 574, width: 400, height: 66, bgColor: props.theme.page }}>
      <Divider left={0} top={0} width={400} theme={props.theme} />
      <For each={TABS}>{(tab, index) => {
        const active = () => props.active === tab.id;
        return (
          <Pressable
            box={{ left: index() * 100, top: 2, width: 100, height: 62 }}
            onTap={() => props.onSelect(tab.id)}
          >
            {active() ? (
              <View
                class="absolute"
                style={{ insetL: 24, insetT: 4, width: 52, height: 28, radius: 14, bgColor: props.theme.accentChip }}
              />
            ) : null}
            <Icon name={tabIcon(tab.id, active(), props.unackedAlarms)} left={38} top={6} size={24} />
            {tab.id === "alarms" && props.unackedAlarms > 0 ? (
              <View
                class="absolute"
                style={{ insetL: 58, insetT: 4, width: 16, height: 16, radius: 8, bgColor: props.theme.critical }}
              >
                <Text
                  class="absolute text-2xs font-bold text-center"
                  style={{ insetL: 0, insetT: 1, width: 16, textColor: props.theme.white }}
                >
                  {props.unackedAlarms > 9 ? "9+" : String(props.unackedAlarms)}
                </Text>
              </View>
            ) : null}
            <Text
              class="absolute text-xs text-center"
              style={{
                insetL: 0,
                insetT: 36,
                width: 100,
                textColor: active() ? props.theme.accent : props.theme.secondaryText,
              }}
            >
              {tabLabel(tab, props.language)}
            </Text>
          </Pressable>
        );
      }}</For>
    </View>
  );
}
