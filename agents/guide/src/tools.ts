import type { LatLon } from '@bike-ride/geometry';
import type { Tool } from '@bike-ride/llm';
import { z } from 'zod';
import type { Stop, StopFinder } from './stop-finder.ts';

// What Guide reads from the route DataPart Router sends, plus what its tools
// produce.
export type GuideSession = { route?: { coords: LatLon[] }; stops?: Stop[] };

const FindStopsInput = z.object({});

export class FindStopsTool implements Tool<
  typeof FindStopsInput,
  GuideSession
> {
  readonly name = 'findStops';
  readonly description =
    'Cafes, shops and drinking water along the planned route, ' +
    'with the km where each one is.';
  readonly input = FindStopsInput;
  private readonly finder: StopFinder;

  constructor(finder: StopFinder) {
    this.finder = finder;
  }

  async run(_input: z.infer<typeof FindStopsInput>, session: GuideSession) {
    if (!session.route) throw new Error('No route yet');

    session.stops = await this.finder.find(session.route.coords);

    return session.stops;
  }
}
