import type { LatLon } from '@bike-ride/geometry';
import type { Tool } from '@bike-ride/llm';
import { z } from 'zod';
import type { WeatherReport, WindAnalyzer } from './wind-analyzer.ts';

// What Weather reads from the route DataPart Router sends, plus what its tools
// produce.
export type WeatherSession = {
  bike: string;
  route?: { coords: LatLon[] };
  forecast?: WeatherReport;
};

const WindInput = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .describe('YYYY-MM-DD, at most 16 days ahead'),
  startHour: z.number().int().min(0).max(23),
});

export class WindAnalysisTool implements Tool<
  typeof WindInput,
  WeatherSession
> {
  readonly name = 'windAnalysis';
  readonly description =
    'Weather for the planned route on a date and start hour. Headwind is ' +
    'positive when the wind is in your face, for each half of the loop, ' +
    'ridden as planned or reversed.';
  readonly input = WindInput;
  private readonly analyzer: WindAnalyzer;

  constructor(analyzer: WindAnalyzer) {
    this.analyzer = analyzer;
  }

  async run(
    { date, startHour }: z.infer<typeof WindInput>,
    session: WeatherSession,
  ) {
    if (!session.route) throw new Error('No route yet');

    session.forecast = await this.analyzer.analyze(
      session.route.coords,
      session.bike,
      date,
      startHour,
    );

    return session.forecast;
  }
}
