// Identifies us to the data sources: the OpenStreetMap services ask every
// client to send a User-Agent.
export const USER_AGENT = 'bike-ride-weather/1.0.0';

// Hourly values for one day, local time: index 0 = 00:00, index 23 = 23:00.
export type HourlyForecast = {
  temperatureC: number[];
  rainChancePct: number[];
  windSpeedKmh: number[];
  windFromDeg: number[]; // where the wind comes FROM
};

// The data source Weather depends on. To use another forecast service,
// implement this.
export interface WeatherProvider {
  // Hourly forecast for one day (YYYY-MM-DD) at one point, local time.
  hourly(lat: number, lon: number, date: string): Promise<HourlyForecast>;
}
