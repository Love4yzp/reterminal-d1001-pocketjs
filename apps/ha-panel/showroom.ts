export type LightSource = "virtual" | "onboard" | "ha";
export type SensorStatus = "pending" | "live" | "mock" | "offline" | "stale" | "unavailable";

export interface ShowroomLight {
  key: string;
  name: string;
  chip: string;
  source: LightSource;
  entityId?: string;
  /** The existing worker can control only this legacy single-HA-light slot. */
  legacy?: boolean;
  initial: { on: boolean; brightness: number; hue: number; saturation: number };
}

export interface ShowroomSensor {
  key: string;
  name: string;
  entityId: string;
  unit: string;
  decimals: number;
  staleAfterSeconds: number;
}

export interface ShowroomLightChange {
  on?: boolean;
  brightness?: number;
  hue?: number;
  saturation?: number;
}

export type ShowroomScene =
  | { key: string; name: string; kind: "local"; changes: Record<string, ShowroomLightChange> }
  | { key: string; name: string; kind: "ha"; entityId: string };

export interface ShowroomConfig {
  version: 1;
  id: string;
  home: {
    lights: readonly string[];
    sensors: readonly string[];
    scenes: readonly string[];
  };
  lights: readonly ShowroomLight[];
  sensors: readonly ShowroomSensor[];
  scenes: readonly ShowroomScene[];
}

export interface SensorReading {
  value: number | string | null;
  status: SensorStatus;
  updatedAt: number | null;
}

export type SceneRunStatus = "idle" | "applied" | "partial" | "failed" | "unsupported";

export const SHOWROOM: ShowroomConfig = {
  version: 1,
  id: "example-showroom",
  home: {
    lights: ["desk", "shelf", "onboard", "remote"],
    sensors: ["temperature", "humidity"],
    scenes: ["all-off", "night", "reading"],
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
      key: "remote", name: "客厅灯", chip: "客厅", source: "ha", legacy: true,
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
  ],
  scenes: [
    {
      key: "all-off", name: "全部关闭", kind: "local",
      changes: {
        desk: { on: false }, shelf: { on: false }, onboard: { on: false }, remote: { on: false },
      },
    },
    {
      key: "night", name: "夜间模式", kind: "local",
      changes: {
        desk: { on: false },
        shelf: { on: true, brightness: 26, hue: 30, saturation: 85 },
        onboard: { on: true, brightness: 26, hue: 30, saturation: 85 },
        remote: { on: true, brightness: 26, hue: 30, saturation: 85 },
      },
    },
    {
      key: "reading", name: "阅读", kind: "local",
      changes: {
        desk: { on: true, brightness: 255, hue: 37, saturation: 12 },
        shelf: { on: true, brightness: 153, hue: 37, saturation: 12 },
        onboard: { on: false },
        remote: { on: true, brightness: 204, hue: 37, saturation: 12 },
      },
    },
  ],
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
    ...config.scenes.map(scene => ({ key: scene.key, path: `scenes.${scene.key}` })),
  ];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!validKey(entry.key)) errors.push(`invalid key ${entry.path}`);
    if (seen.has(entry.key)) errors.push(`duplicate key ${entry.key}`);
    seen.add(entry.key);
  }

  const lights = new Set(config.lights.map(light => light.key));
  const sensors = new Set(config.sensors.map(sensor => sensor.key));
  const scenes = new Set(config.scenes.map(scene => scene.key));
  const checkReferences = (kind: "lights" | "sensors" | "scenes", keys: readonly string[], known: Set<string>, max: number) => {
    if (keys.length > max) errors.push(`home.${kind} exceeds ${max} entries`);
    if (new Set(keys).size !== keys.length) errors.push(`home.${kind} duplicate key`);
    for (const key of keys) if (!known.has(key)) errors.push(`home.${kind} unknown key ${key}`);
  };
  checkReferences("lights", config.home.lights, lights, 4);
  checkReferences("sensors", config.home.sensors, sensors, 2);
  checkReferences("scenes", config.home.scenes, scenes, 3);

  if (config.lights.filter(light => light.legacy).length > 1) errors.push("multiple legacy HA lights");
  if (config.lights.filter(light => light.source === "onboard").length > 1)
    errors.push("multiple onboard RGB lights");
  for (const light of config.lights) {
    if (light.legacy && light.source !== "ha") errors.push(`lights.${light.key} legacy source must be ha`);
    if (light.source === "ha" && !light.legacy && !light.entityId)
      errors.push(`lights.${light.key} missing entityId`);
    const initial = light.initial;
    if (typeof initial.on !== "boolean" ||
        !Number.isFinite(initial.brightness) || initial.brightness < 0 || initial.brightness > 255 ||
        !Number.isFinite(initial.hue) || initial.hue < 0 || initial.hue > 359 ||
        !Number.isFinite(initial.saturation) || initial.saturation < 0 || initial.saturation > 100)
      errors.push(`lights.${light.key} invalid initial state`);
  }
  for (const sensor of config.sensors) {
    if (!Number.isInteger(sensor.decimals) || sensor.decimals < 0 || sensor.decimals > 2)
      errors.push(`sensors.${sensor.key} invalid decimals`);
    if (!Number.isFinite(sensor.staleAfterSeconds) || sensor.staleAfterSeconds < 10)
      errors.push(`sensors.${sensor.key} invalid staleAfterSeconds`);
  }
  for (const scene of config.scenes) {
    if (scene.kind !== "local") continue;
    for (const key of Object.keys(scene.changes))
      if (!lights.has(key)) errors.push(`scenes.${scene.key} unknown key ${key}`);
  }
  return errors;
}

export function assertShowroomConfig(config: ShowroomConfig): void {
  const errors = validateShowroomConfig(config);
  if (errors.length > 0) throw new Error(`Invalid showroom config: ${errors.join("; ")}`);
}

export function showroomSensor(key: string, config: ShowroomConfig = SHOWROOM): ShowroomSensor | undefined {
  return config.sensors.find(sensor => sensor.key === key);
}

export function showroomScene(key: string, config: ShowroomConfig = SHOWROOM): ShowroomScene | undefined {
  return config.scenes.find(scene => scene.key === key);
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

export function sensorStatusText(reading: SensorReading): string {
  switch (reading.status) {
    case "pending": return "待接入";
    case "mock": return "示例";
    case "offline": return "离线";
    case "stale": return "过期";
    case "unavailable": return "不可用";
    case "live": return "在线";
  }
}

export function sceneStatusText(status: SceneRunStatus): string {
  switch (status) {
    case "applied": return "完成";
    case "partial": return "部分完成";
    case "failed": return "未完成";
    case "unsupported": return "待接入";
    case "idle": return "";
  }
}
