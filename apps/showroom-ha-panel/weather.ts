import type { Weather } from "./model";

export type WeatherIcon =
  | "weather-sunny" | "weather-night" | "weather-partly" | "weather-cloudy"
  | "weather-rainy" | "weather-snowy" | "weather-storm";

// HA weather conditions: https://developers.home-assistant.io/docs/core/entity/weather/#recommended-values-for-state-and-condition
const CONDITIONS: Record<string, { label: string; icon: WeatherIcon }> = {
  "sunny": { label: "晴", icon: "weather-sunny" },
  "clear-night": { label: "晴", icon: "weather-night" },
  "partlycloudy": { label: "多云", icon: "weather-partly" },
  "cloudy": { label: "阴", icon: "weather-cloudy" },
  "fog": { label: "雾", icon: "weather-cloudy" },
  "windy": { label: "大风", icon: "weather-cloudy" },
  "windy-variant": { label: "大风", icon: "weather-cloudy" },
  "exceptional": { label: "异常天气", icon: "weather-cloudy" },
  "rainy": { label: "雨", icon: "weather-rainy" },
  "pouring": { label: "暴雨", icon: "weather-rainy" },
  "snowy": { label: "雪", icon: "weather-snowy" },
  "snowy-rainy": { label: "雨夹雪", icon: "weather-snowy" },
  "hail": { label: "冰雹", icon: "weather-snowy" },
  "lightning": { label: "雷电", icon: "weather-storm" },
  "lightning-rainy": { label: "雷阵雨", icon: "weather-storm" },
};

/**
 * Parse an HA state object (GET /api/states/<id>, or the same shape rendered
 * by the discovery template). Unknown, unavailable or malformed entities give
 * null so the home screen hides the weather instead of guessing.
 */
export function parseWeatherEntity(body: string): Weather | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const entity = value as { entity_id?: unknown; state?: unknown; attributes?: unknown };
  if (typeof entity.entity_id !== "string" || !entity.entity_id.startsWith("weather.")) return null;
  if (typeof entity.state !== "string" || !(entity.state in CONDITIONS)) return null;
  const attributes = (typeof entity.attributes === "object" && entity.attributes !== null
    ? entity.attributes
    : {}) as { temperature?: unknown; temperature_unit?: unknown };
  const temperature = typeof attributes.temperature === "number" && Number.isFinite(attributes.temperature)
    ? attributes.temperature
    : null;
  return {
    entityId: entity.entity_id,
    condition: entity.state,
    temperature,
    unit: typeof attributes.temperature_unit === "string" ? attributes.temperature_unit : "°C",
  };
}

export function weatherLabel(weather: Weather): string {
  return CONDITIONS[weather.condition]?.label ?? "";
}

export function weatherIcon(weather: Weather): WeatherIcon {
  return CONDITIONS[weather.condition]?.icon ?? "weather-cloudy";
}

/** "18°"; Fahrenheit keeps its unit letter so it is never mistaken for Celsius. */
export function weatherTemperature(weather: Weather): string {
  if (weather.temperature === null) return "";
  const degrees = `${Math.round(weather.temperature)}°`;
  return weather.unit === "°F" ? `${degrees}F` : degrees;
}

/** Every label the panel can draw, for the font subset. */
export const WEATHER_LABELS = [...new Set(Object.values(CONDITIONS).map(condition => condition.label))];
