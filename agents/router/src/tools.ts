import type { Tool } from '@bike-ride/llm';
import { z } from 'zod';
import type { Bike } from './bike.ts';
import type { Geocoder, Route, RoutePlanner } from './providers.ts';

// What the tools produced during one task. Big data stays here, never in the
// LLM conversation.
export type RouteSession = { bike?: Bike; route?: Route; gpx?: string };

const GeocodeInput = z.object({
  query: z
    .string()
    .min(2)
    .describe(
      'The place exactly as the rider gave it, with street or address if ' +
        'given, e.g. "Lipowa, Białystok"',
    ),
});

export class GeocodeTool implements Tool<typeof GeocodeInput, RouteSession> {
  readonly name = 'geocode';
  readonly description =
    'Find a place in Poland. Returns up to 3 candidates with coordinates.';
  readonly input = GeocodeInput;
  private readonly geocoder: Geocoder;

  constructor(geocoder: Geocoder) {
    this.geocoder = geocoder;
  }

  run({ query }: z.infer<typeof GeocodeInput>) {
    return this.geocoder.geocode(query);
  }
}

const PlanRouteInput = z.object({
  start: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    })
    .describe('The geocoded start'),
  distanceKm: z.number().min(5).max(200).describe('The requested length'),
  bike: z.enum(['road', 'gravel', 'trekking']),
});

export class PlanRouteTool implements Tool<
  typeof PlanRouteInput,
  RouteSession
> {
  readonly name = 'planRoute';
  readonly description =
    'Plan a bike loop of about distanceKm from the start and back. ' +
    'Returns distance, ascent and surface.';
  readonly input = PlanRouteInput;
  private readonly planner: RoutePlanner;

  constructor(planner: RoutePlanner) {
    this.planner = planner;
  }

  async run(
    { start, distanceKm: targetKm, bike }: z.infer<typeof PlanRouteInput>,
    session: RouteSession,
  ) {
    const planned = await this.planner.planLoop(
      [start.lat, start.lon],
      targetKm,
      bike,
    );

    // Last call wins: this becomes the route artifact. The model only sees a
    // summary.
    session.bike = bike;
    session.route = planned.route;
    session.gpx = planned.gpx;
    const { distanceKm, ascentM, surface } = planned.route;

    return { distanceKm, ascentM, surface };
  }
}
