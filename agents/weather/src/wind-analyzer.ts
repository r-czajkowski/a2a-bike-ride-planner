import {
  bearing,
  distanceKm,
  rad,
  round,
  type LatLon,
} from '@bike-ride/geometry';
import type { HourlyForecast, WeatherProvider } from './providers.ts';

// Positive = wind in your face, averaged over each half of the loop.
export type Headwind = { firstHalfKmh: number; secondHalfKmh: number };

export type WeatherReport = {
  date: string;
  startHour: number;
  endHour: number;
  temperatureC: { min: number; max: number };
  maxRainChancePct: number;
  windKmh: number;
  headwindAsPlanned: Headwind;
  headwindReversed: Headwind;
};

type Segment = { km: number; bearing: number };

// Turns a forecast into what a cyclist cares about. Knows nothing about the
// forecast source.
export class WindAnalyzer {
  // Used to estimate when the rider reaches each part of the route.
  static readonly AVG_SPEED_KMH: Record<string, number> = {
    road: 25,
    gravel: 20,
    trekking: 18,
  };
  private readonly provider: WeatherProvider;

  constructor(provider: WeatherProvider) {
    this.provider = provider;
  }

  async analyze(
    coords: LatLon[],
    bike: string,
    date: string,
    startHour: number,
  ): Promise<WeatherReport> {
    // One forecast point (route middle) is good enough for a ride of a few
    // hours.
    const [lat, lon] = coords[Math.floor(coords.length / 2)];
    const forecast = await this.provider.hourly(lat, lon, date);
    const speedKmh = WindAnalyzer.AVG_SPEED_KMH[bike] ?? 20;

    const segments = coords.slice(1).map((p, i) => ({
      km: distanceKm(coords[i], p),
      bearing: bearing(coords[i], p),
    }));
    const totalKm = segments.reduce((sum, s) => sum + s.km, 0);
    const endHour = Math.min(23, Math.ceil(startHour + totalKm / speedKmh));
    const during = (values: number[]) => values.slice(startHour, endHour + 1);

    return {
      date,
      startHour,
      endHour,
      temperatureC: {
        min: Math.min(...during(forecast.temperatureC)),
        max: Math.max(...during(forecast.temperatureC)),
      },
      maxRainChancePct: Math.max(...during(forecast.rainChancePct)),
      windKmh: round(average(during(forecast.windSpeedKmh))),
      headwindAsPlanned: this.headwind(
        segments,
        forecast,
        startHour,
        speedKmh,
        false,
      ),
      headwindReversed: this.headwind(
        segments,
        forecast,
        startHour,
        speedKmh,
        true,
      ),
    };
  }

  // Positive = wind in your face, using the forecast hour when the rider passes
  // each segment. On a closed loop a steady wind averages out to ~0, so we
  // report each half separately.
  private headwind(
    segments: Segment[],
    f: HourlyForecast,
    startHour: number,
    speedKmh: number,
    reversed: boolean,
  ): Headwind {
    const totalKm = segments.reduce((sum, s) => sum + s.km, 0);
    const sums = [0, 0];
    let doneKm = 0;

    for (const s of reversed ? segments.toReversed() : segments) {
      const hour = Math.min(23, Math.floor(startHour + doneKm / speedKmh));
      const direction = reversed ? s.bearing + 180 : s.bearing;

      sums[doneKm < totalKm / 2 ? 0 : 1] +=
        s.km *
        f.windSpeedKmh[hour] *
        Math.cos(rad(f.windFromDeg[hour] - direction));
      doneKm += s.km;
    }

    return {
      firstHalfKmh: round(sums[0] / (totalKm / 2)),
      secondHalfKmh: round(sums[1] / (totalKm / 2)),
    };
  }
}

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
