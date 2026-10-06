import { Parts, type RemoteAgent } from '@bike-ride/a2a';
import { LatLonSchema } from '@bike-ride/geometry';
import { Usage } from '@bike-ride/llm';
import { z } from 'zod';

// What we read from the Planner's artifacts: everything the outputs need.
const RouteReply = z.object({
  route: z.object({
    distanceKm: z.number(),
    ascentM: z.number(),
    surface: z.object({
      pavedKm: z.number(),
      unpavedKm: z.number(),
      unknownKm: z.number(),
    }),
    coords: z.array(LatLonSchema).min(2),
  }),
});
const StopsReply = z.object({
  stops: z.array(
    z.object({
      name: z.string(),
      category: z.enum(['cafe', 'shop', 'water']),
      lat: z.number(),
      lon: z.number(),
      km: z.number(),
    }),
  ),
});

export type RidePlan = {
  plan: string;
  route: z.infer<typeof RouteReply>['route'];
  gpx: string;
  stops: z.infer<typeof StopsReply>['stops'];
  usage: Usage;
};

export type AskUser = (question: string) => Promise<string>;

// The A2A client: talks only to the Planner. Needs `pnpm start` running.
export class A2ARidePlanner {
  private readonly planner: RemoteAgent;
  private readonly ask: AskUser;

  constructor(planner: RemoteAgent, ask: AskUser) {
    this.planner = planner;
    this.ask = ask;
  }

  async plan(request: string): Promise<RidePlan> {
    const onStatus = this.printStatus;
    let result = await this.planner.send([Parts.text(request)], { onStatus });
    // Each turn reports its own usage, questions included: add them all up.
    const usage = Usage.parse(result.metadata.usage);

    // Asking back: the Planner pauses its task with `input-required`; we answer
    // on the same task.
    while (result.isInputRequired) {
      const answer = await this.ask(result.statusText);
      const { taskId, contextId } = result;

      result = await this.planner.send([Parts.text(answer)], {
        taskId,
        contextId,
        onStatus,
      });
      usage.add(Usage.parse(result.metadata.usage));
    }

    if (!result.isCompleted) throw new Error(`Planner: ${result.statusText}`);

    return {
      plan: result.answer,
      route: result.dataAs('route', RouteReply).route,
      gpx: result.file('route') ?? '',
      stops: result.dataAs('stops', StopsReply).stops,
      usage,
    };
  }

  private printStatus(text: string): void {
    console.log(`  working: ${text}`);
  }
}
