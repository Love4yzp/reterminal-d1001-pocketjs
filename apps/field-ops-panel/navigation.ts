import { pick, type Language } from "./i18n";

export type Tab = "overview" | "control" | "alarms" | "system";

export const TABS: readonly { id: Tab; zh: string; en: string }[] = [
  { id: "overview", zh: "概览", en: "Overview" },
  { id: "control", zh: "控制", en: "Control" },
  { id: "alarms", zh: "告警", en: "Alarms" },
  { id: "system", zh: "系统", en: "System" },
];

export const INITIAL_TAB: Tab = "overview";

export function tabLabel(tab: { zh: string; en: string }, language: Language): string {
  return pick(language, tab.zh, tab.en);
}
