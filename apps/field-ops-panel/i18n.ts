import type { ThemeId } from "./theme";

export type Language = "zh" | "en";

// Common server-originated telemetry & alarm CJK/symbol glossary so dynamic
// strings from ESS, EV Charger, and LoRaWAN gateways render without tofu boxes.
export const FIELD_OPS_FONT_GLOSSARY =
  "°℃微网储能柜电池电量直流母线最高芯温健康度模块并网组风道偏高单体压差峰谷计划已执行快充终端当前车辆输出电压电流枪头连接器温升偏快已充能量绝缘检测通过巡检网关在线节点率待处理触发超出电子围栏信道校准完成最低";

export function pick(language: Language, zh: string, en: string): string {
  return language === "en" ? en : zh;
}

export function toggleLanguage(language: Language): Language {
  return language === "zh" ? "en" : "zh";
}

export function languageLabel(language: Language): string {
  return language === "zh" ? "EN" : "中文";
}

export function themeLabel(id: ThemeId, language: Language, compact = false): string {
  if (id === "emerald") return pick(language, "储能绿", "Emerald");
  if (id === "amber") return compact ? pick(language, "琥珀", "Amber") : pick(language, "高对比琥珀", "Amber");
  return pick(language, "工业蓝", "Cobalt");
}
