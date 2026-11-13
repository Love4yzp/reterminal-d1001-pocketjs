import { describe, expect, test } from "bun:test";

import { parseWeatherEntity, weatherIcon, weatherLabel, weatherTemperature } from "./weather";

const entity = (state: string, attributes: object = { temperature: 18.4, temperature_unit: "°C" }) =>
  JSON.stringify({ entity_id: "weather.forecast_home", state, attributes });

describe("HA weather entity", () => {
  test("parses condition, temperature and unit", () => {
    const weather = parseWeatherEntity(entity("partlycloudy"))!;
    expect(weather).toEqual({ entityId: "weather.forecast_home", condition: "partlycloudy", temperature: 18.4, unit: "°C" });
    expect(weatherLabel(weather)).toBe("多云");
    expect(weatherLabel(weather, "en")).toBe("Partly cloudy");
    expect(weatherIcon(weather)).toBe("weather-partly");
    expect(weatherTemperature(weather)).toBe("18°");
  });

  test("returns null when there is no usable weather entity", () => {
    expect(parseWeatherEntity("null")).toBeNull();
    expect(parseWeatherEntity("")).toBeNull();
    expect(parseWeatherEntity(entity("unavailable"))).toBeNull();
    expect(parseWeatherEntity(entity("unknown"))).toBeNull();
    expect(parseWeatherEntity(JSON.stringify({ entity_id: "sensor.x", state: "sunny" }))).toBeNull();
  });

  test("keeps a missing temperature empty and marks Fahrenheit", () => {
    const noTemp = parseWeatherEntity(entity("rainy", {}))!;
    expect(noTemp.temperature).toBeNull();
    expect(weatherTemperature(noTemp)).toBe("");
    expect(weatherTemperature(parseWeatherEntity(entity("sunny", { temperature: 64.6, temperature_unit: "°F" }))!)).toBe("65°F");
  });

  test("maps night and storm conditions to their icons", () => {
    expect(weatherIcon(parseWeatherEntity(entity("clear-night"))!)).toBe("weather-night");
    expect(weatherIcon(parseWeatherEntity(entity("lightning-rainy"))!)).toBe("weather-storm");
  });
});
