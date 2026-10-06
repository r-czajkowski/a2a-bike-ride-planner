import {
  USER_AGENT,
  type HourlyForecast,
  type WeatherProvider,
} from './providers.ts';

// Open-Meteo (open-meteo.com). Free, no key, forecasts up to 16 days ahead.
export class OpenMeteoProvider implements WeatherProvider {
  async hourly(
    lat: number,
    lon: number,
    date: string,
  ): Promise<HourlyForecast> {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: [
        'temperature_2m',
        'precipitation_probability',
        'wind_speed_10m',
        'wind_direction_10m',
      ].join(','),
      start_date: date,
      end_date: date,
      timezone: 'Europe/Warsaw',
      wind_speed_unit: 'kmh',
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    const data = (await res.json()) as any;

    if (data.error)
      throw new Error(
        `Open-Meteo: ${data.reason} (forecast covers only the next 16 days)`,
      );

    return {
      temperatureC: data.hourly.temperature_2m,
      rainChancePct: data.hourly.precipitation_probability,
      windSpeedKmh: data.hourly.wind_speed_10m,
      windFromDeg: data.hourly.wind_direction_10m,
    };
  }
}
