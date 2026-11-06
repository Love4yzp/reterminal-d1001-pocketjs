export interface WeatherEntity {
  entity_id: "weather.demo";
  state: string;
  attributes: {
    temperature: number;
    humidity: number;
    pressure: number;
    wind_speed: number;
    wind_bearing: number;
    friendly_name: string;
  };
}

export const DEMO_WEATHER: WeatherEntity = {
  entity_id: "weather.demo",
  state: "partly-cloudy",
  attributes: {
    temperature: 22.5,
    humidity: 58,
    pressure: 1013,
    wind_speed: 8,
    wind_bearing: 120,
    friendly_name: "Demo weather",
  },
};
