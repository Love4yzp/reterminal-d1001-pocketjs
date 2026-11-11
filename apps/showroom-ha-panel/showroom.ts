export type LightSource = "virtual" | "onboard" | "ha";
export type SensorStatus = "pending" | "live" | "mock" | "offline" | "stale" | "unavailable";

export interface ShowroomLight {
  key: string;
  name: string;
  chip: string;
  source: LightSource;
  entityId?: string;
  /** Compatibility slot for CONFIG_D1001_HA_LIGHT_ENTITY. */
  legacy?: boolean;
  staleAfterSeconds?: number;
  initial: { on: boolean; brightness: number; hue: number; saturation: number; colorTempKelvin?: number };
}

export interface ShowroomSensor {
  key: string;
  name: string;
  entityId: string;
  unit: string;
  decimals: number;
  staleAfterSeconds: number;
  /** Telemetry stays on the console instead of the environment list. */
  kind?: "telemetry";
}

export interface ShowroomAction {
  key: string;
  name: string;
  group: "reachy" | "arm";
  /** Public example only; production commands require the local entityMap override. */
  entityId?: string;
}

export interface ShowroomConfig {
  version: 1;
  id: string;
  home: {
    lights: readonly string[];
    sensors: readonly string[];
    actions: readonly string[];
  };
  lights: readonly ShowroomLight[];
  sensors: readonly ShowroomSensor[];
  actions: readonly ShowroomAction[];
}

export interface SensorReading {
  value: number | string | null;
  status: SensorStatus;
  updatedAt: number | null;
}

export type ActionRunStatus = "idle" | "pending" | "accepted" | "failed";

export interface ShowroomEntityMap {
  version: 1;
  lights: Record<string, string>;
  sensors: Record<string, string>;
  actions: Record<string, string>;
  weather?: string;
}

export const SHOWROOM: ShowroomConfig = {
  version: 1,
  id: "example-showroom",
  home: {
    lights: ["remote"],
    sensors: ["temperature", "humidity"],
    actions: [
      "reachy-intro-retail",
      "reachy-intro-space",
      "reachy-intro-emergency",
      "reachy-wake",
      "reachy-lang-toggle",
      "reachy-stop",
    ],
  },
  lights: [
    {
      key: "desk", name: "书桌灯", chip: "书桌灯", source: "virtual",
      initial: { on: true, brightness: 180, hue: 36, saturation: 70 },
    },
    {
      key: "shelf", name: "书架灯", chip: "书架灯", source: "virtual",
      initial: { on: false, brightness: 160, hue: 37, saturation: 12 },
    },
    {
      key: "onboard", name: "板载 RGB", chip: "板载", source: "onboard",
      initial: { on: false, brightness: 128, hue: 199, saturation: 68 },
    },
    {
      key: "remote", name: "展厅主灯", chip: "主灯", source: "ha", legacy: true,
      initial: { on: false, brightness: 128, hue: 36, saturation: 70 },
    },
  ],
  sensors: [
    {
      key: "temperature", name: "温度", entityId: "sensor.example_temperature",
      unit: "°C", decimals: 1, staleAfterSeconds: 90,
    },
    {
      key: "humidity", name: "湿度", entityId: "sensor.example_humidity",
      unit: "%", decimals: 0, staleAfterSeconds: 90,
    },
    {
      key: "reachy-agent", name: "Reachy agent", entityId: "sensor.example_reachy_agent",
      unit: "", decimals: 0, staleAfterSeconds: 90, kind: "telemetry",
    },
    {
      key: "reachy-result", name: "最近回执", entityId: "sensor.example_reachy_result",
      unit: "", decimals: 0, staleAfterSeconds: 300, kind: "telemetry",
    },
    {
      key: "arm-mode", name: "机械臂模式", entityId: "sensor.example_arm_mode",
      unit: "", decimals: 0, staleAfterSeconds: 90, kind: "telemetry",
    },
  ],
  actions: [
    {
      key: "reachy-intro-retail", name: "零售讲解", group: "reachy",
      entityId: "input_button.example_reachy_intro_retail",
    },
    {
      key: "reachy-intro-space", name: "空间讲解", group: "reachy",
      entityId: "input_button.example_reachy_intro_space",
    },
    {
      key: "reachy-intro-emergency", name: "救灾讲解", group: "reachy",
      entityId: "input_button.example_reachy_intro_emergency",
    },
    { key: "reachy-stop", name: "停止", group: "reachy", entityId: "input_button.example_reachy_stop" },
    { key: "reachy-wake", name: "唤醒", group: "reachy", entityId: "input_button.example_reachy_wake" },
    {
      key: "reachy-lang-toggle", name: "中英切换", group: "reachy",
      entityId: "input_button.example_reachy_lang_toggle",
    },
    { key: "arm-gravity", name: "重力补偿", group: "arm" },
    { key: "arm-playback", name: "动作回放", group: "arm" },
  ],
};

/** Non-secret example bindings used by host preview and the local mock. */
export const SHOWROOM_ENTITY_MAP_EXAMPLE: ShowroomEntityMap = {
  version: 1,
  lights: { remote: "light.yeelink_cn_975205352_bslamp2_s_2_light" },
  sensors: {
    temperature: "sensor.example_temperature",
    humidity: "sensor.example_humidity",
    "reachy-agent": "sensor.example_reachy_agent",
    "reachy-result": "sensor.example_reachy_result",
    "arm-mode": "sensor.example_arm_mode",
  },
  actions: Object.fromEntries(SHOWROOM.actions.flatMap(action =>
    action.group === "reachy" && action.entityId ? [[action.key, action.entityId]] : [])),
  weather: "weather.example_home",
};

export const SHOWROOM_LIGHT_IDS: readonly string[] = SHOWROOM.lights.map(light => light.key);
export const SHOWROOM_SENSOR_IDS: readonly string[] = SHOWROOM.sensors.map(sensor => sensor.key);

function validKey(key: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(key);
}

export function validateShowroomConfig(config: ShowroomConfig): string[] {
  const errors: string[] = [];
  if (config.version !== 1) errors.push("unsupported version");
  if (!validKey(config.id)) errors.push("invalid showroom id");

  const entries = [
    ...config.lights.map(light => ({ key: light.key, path: `lights.${light.key}` })),
    ...config.sensors.map(sensor => ({ key: sensor.key, path: `sensors.${sensor.key}` })),
    ...config.actions.map(action => ({ key: action.key, path: `actions.${action.key}` })),
  ];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!validKey(entry.key)) errors.push(`invalid key ${entry.path}`);
    if (seen.has(entry.key)) errors.push(`duplicate key ${entry.key}`);
    seen.add(entry.key);
  }

  const lights = new Set(config.lights.map(light => light.key));
  const sensors = new Set(config.sensors.map(sensor => sensor.key));
  const actions = new Set(config.actions.map(action => action.key));
  const checkReferences = (kind: "lights" | "sensors" | "actions", keys: readonly string[], known: Set<string>, max: number) => {
    if (keys.length > max) errors.push(`home.${kind} exceeds ${max} entries`);
    if (new Set(keys).size !== keys.length) errors.push(`home.${kind} duplicate key`);
    for (const key of keys) if (!known.has(key)) errors.push(`home.${kind} unknown key ${key}`);
  };
  checkReferences("lights", config.home.lights, lights, 1);
  checkReferences("sensors", config.home.sensors, sensors, 2);
  checkReferences("actions", config.home.actions, actions, 6);

  if (config.lights.filter(light => light.legacy).length > 1) errors.push("multiple legacy HA lights");
  if (config.lights.filter(light => light.source === "onboard").length > 1)
    errors.push("multiple onboard RGB lights");
  for (const light of config.lights) {
    if (light.legacy && light.source !== "ha") errors.push(`lights.${light.key} legacy source must be ha`);
    if (light.source === "ha" && !light.legacy && !light.entityId)
      errors.push(`lights.${light.key} missing entityId`);
    if (light.staleAfterSeconds !== undefined &&
        (!Number.isFinite(light.staleAfterSeconds) || light.staleAfterSeconds < 10))
      errors.push(`lights.${light.key} invalid staleAfterSeconds`);
    const initial = light.initial;
    if (typeof initial.on !== "boolean" ||
        !Number.isFinite(initial.brightness) || initial.brightness < 0 || initial.brightness > 255 ||
        !Number.isFinite(initial.hue) || initial.hue < 0 || initial.hue > 359 ||
        !Number.isFinite(initial.saturation) || initial.saturation < 0 || initial.saturation > 100 ||
        (initial.colorTempKelvin !== undefined &&
          (!Number.isFinite(initial.colorTempKelvin) || initial.colorTempKelvin <= 0)))
      errors.push(`lights.${light.key} invalid initial state`);
  }
  for (const sensor of config.sensors) {
    if (!Number.isInteger(sensor.decimals) || sensor.decimals < 0 || sensor.decimals > 2)
      errors.push(`sensors.${sensor.key} invalid decimals`);
    if (!Number.isFinite(sensor.staleAfterSeconds) || sensor.staleAfterSeconds < 10)
      errors.push(`sensors.${sensor.key} invalid staleAfterSeconds`);
  }
  for (const action of config.actions) {
    const domain = action.group === "arm" ? /^(?:script\.keymesh_dispatch|input_button\.[a-z0-9_]+)$/ : /^input_button\.[a-z0-9_]+$/;
    if (action.entityId !== undefined && !domain.test(action.entityId))
      errors.push(`actions.${action.key} invalid ${action.group === "arm" ? "script" : "input_button"} entityId`);
  }
  return errors;
}

export function assertShowroomConfig(config: ShowroomConfig): void {
  const errors = validateShowroomConfig(config);
  if (errors.length > 0) throw new Error(`Invalid showroom config: ${errors.join("; ")}`);
}

function bindingObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

export function parseShowroomEntityMap(text: string, config: ShowroomConfig = SHOWROOM): ShowroomEntityMap | undefined {
  if (text.trim().length === 0) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error("entityMap must be valid JSON");
  }
  const value = bindingObject(raw, "entityMap");
  if (value.version !== 1) throw new Error("entityMap unsupported version");
  for (const key of Object.keys(value))
    if (!["version", "lights", "sensors", "actions", "weather"].includes(key))
      throw new Error(`entityMap unknown field ${key}`);

  const result: ShowroomEntityMap = { version: 1, lights: {}, sensors: {}, actions: {} };
  const readEntries = (
    field: "lights" | "sensors" | "actions",
    allowed: ReadonlyMap<string, RegExp>,
  ) => {
    const group = bindingObject(value[field] ?? {}, `entityMap.${field}`);
    for (const [key, entity] of Object.entries(group)) {
      const domain = allowed.get(key);
      if (!domain) throw new Error(`entityMap.${field} unknown key ${key}`);
      if (typeof entity !== "string" || !domain.test(entity))
        throw new Error(`entityMap.${field}.${key} invalid entityId`);
      result[field][key] = entity;
    }
  };
  readEntries("lights", new Map(config.lights.filter(light => light.source === "ha").map(light => [
    light.key, /^(light|edidt)\.[a-z0-9_]+$/,
  ])));
  readEntries("sensors", new Map(config.sensors.map(sensor => [sensor.key, /^sensor\.[a-z0-9_]+$/])));
  readEntries("actions", new Map(config.actions.map(action => [
    action.key,
    action.group === "arm" ? /^(?:script\.keymesh_dispatch|input_button\.[a-z0-9_]+)$/ : /^input_button\.[a-z0-9_]+$/,
  ])));
  if (value.weather !== undefined) {
    if (typeof value.weather !== "string" || !/^weather\.[a-z0-9_]+$/.test(value.weather))
      throw new Error("entityMap.weather invalid entityId");
    result.weather = value.weather;
  }
  if (Object.keys(result.lights).length + Object.keys(result.sensors).length +
      Object.keys(result.actions).length + (result.weather ? 1 : 0) === 0)
    throw new Error("entityMap must contain at least one entity");
  return result;
}

export function showroomSensor(key: string, config: ShowroomConfig = SHOWROOM): ShowroomSensor | undefined {
  return config.sensors.find(sensor => sensor.key === key);
}

export function showroomAction(key: string, config: ShowroomConfig = SHOWROOM): ShowroomAction | undefined {
  return config.actions.find(action => action.key === key);
}

export function showroomTelemetry(key: string): ShowroomSensor {
  const sensor = configSensor(key);
  if (!sensor || sensor.kind !== "telemetry") throw new Error(`unknown telemetry sensor ${key}`);
  return sensor;
}

function configSensor(key: string): ShowroomSensor | undefined {
  return SHOWROOM.sensors.find(sensor => sensor.key === key);
}

export function pageWindow<T>(items: readonly T[], requestedPage: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pageCount - 1, Math.max(0, Math.floor(requestedPage)));
  return { items: items.slice(page * size, (page + 1) * size), page, pageCount };
}

export function slidingWindow<T>(items: readonly T[], selected: T, size: number): T[] {
  const length = Math.max(0, Math.floor(size));
  if (items.length <= length) return items.slice();
  if (length === 0) return [];
  const selectedIndex = items.indexOf(selected);
  if (selectedIndex < 0) return items.slice(0, length);
  const start = Math.min(items.length - length, Math.max(0, selectedIndex - Math.floor(length / 2)));
  return items.slice(start, start + length);
}

export function formatSensorValue(sensor: ShowroomSensor, reading: SensorReading): string {
  if (reading.value === null) return "--";
  if (typeof reading.value === "number")
    return Number.isFinite(reading.value) ? reading.value.toFixed(sensor.decimals) : "--";
  return reading.value;
}

export function sensorStatusText(reading: SensorReading, error = ""): string {
  if (reading.status === "stale") return "过期";
  if (error) return "更新失败";
  switch (reading.status) {
    case "pending": return "待接入";
    case "mock": return "示例";
    case "offline": return "离线";
    case "unavailable": return "不可用";
    case "live": return "在线";
  }
}

export function actionStatusText(status: ActionRunStatus): string {
  switch (status) {
    case "pending": return "发送中";
    case "accepted": return "已受理";
    case "failed": return "未完成";
    case "idle": return "";
  }
}
