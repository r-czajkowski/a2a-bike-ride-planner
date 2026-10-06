import {
  A2AAgent,
  Parts,
  type RemoteAgent,
  type TaskContext,
  type TaskResult,
} from '@bike-ride/a2a';
import { Usage } from '@bike-ride/llm';
import { z } from 'zod';
import type { PlanWriter } from './plan-writer.ts';

// The specialists the Planner coordinates. It only knows them as A2A endpoints.
export type Team = {
  router: RemoteAgent;
  weather: RemoteAgent;
  guide: RemoteAgent;
};

// What the Planner accepts: a ride request in plain text.
const PlannerRequest = z.object({
  text: z
    .string()
    .trim()
    .min(5, 'Describe the ride, e.g. "50 km loop from Białystok"'),
});

// What the Planner reads from the specialists' artifacts. Loose objects keep
// the fields it doesn't read (e.g. the route's coords), so it can pass the
// route on to Weather and Guide unchanged.
const RouteReply = z.looseObject({
  route: z.looseObject({
    distanceKm: z.number(),
    ascentM: z.number(),
    surface: z.record(z.string(), z.number()),
  }),
});
const WeatherReply = z.object({ forecast: z.record(z.string(), z.unknown()) });
const StopsReply = z.object({
  stops: z.array(
    z.looseObject({ name: z.string(), category: z.string(), km: z.number() }),
  ),
});

// Planner: the coordinator. Plain TypeScript, talks to the specialists only
// over A2A.
export class PlannerAgent extends A2AAgent {
  readonly name = 'planner';
  protected readonly profile = {
    title: 'Planner',
    description:
      'Plans a bike ride by coordinating Router, Weather and Guide agents ' +
      'over A2A.',
    skill: {
      id: 'plan-ride',
      name: 'Plan a bike ride',
      description:
        'Returns a Markdown plan plus the route, weather and stops artifacts.',
      examples: [
        '50 km loop from Białystok on Saturday, start 9:00, road bike, ' +
          'coffee halfway',
      ],
    },
  };
  private readonly team: Team;
  private readonly writer: PlanWriter;
  // Our taskId -> Router's waiting task. Two different tasks: ours with the
  // user, Router's with us.
  private readonly waitingForAnswer = new Map<
    string,
    { taskId: string; contextId: string }
  >();
  private discovered = false;

  constructor(team: Team, writer: PlanWriter) {
    super();
    this.team = team;
    this.writer = writer;
  }

  // One turn: route (or a question from Router), then weather and stops in
  // parallel, then the plan. An answer to Router's question starts a new turn
  // on the same task.
  protected async handle(task: TaskContext): Promise<void> {
    await this.discover();

    const { text: request } = task.parse(PlannerRequest);
    const route = await this.getRoute(task, request);

    // Router asked something: remember its waiting task and pass the question
    // on, with what it cost. Each turn reports its own usage; the caller adds
    // the turns up.
    if (route.isInputRequired) {
      this.waitingForAnswer.set(task.taskId, {
        taskId: route.taskId,
        contextId: route.contextId,
      });

      return task.inputRequired(route.statusText, {
        usage: Usage.parse(route.metadata.usage),
      });
    }

    // The route goes to Weather and Guide as a DataPart, both at once.
    const routeData = Parts.data(route.dataAs('route', RouteReply));
    const [weather, stops] = await Promise.all([
      this.call(task, this.team.weather, [Parts.text(request), routeData]),
      this.call(task, this.team.guide, [Parts.text(request), routeData]),
    ]);
    const { plan, usage } = await this.writePlan(
      request,
      route,
      weather,
      stops,
    );

    // Pass the specialists' artifacts through (the client needs route, GPX and
    // stops), then complete with all agents' usage in this turn.
    for (const result of [route, weather, stops]) {
      for (const artifact of result.artifacts)
        if (artifact.name !== 'answer')
          task.artifact(artifact.name, artifact.parts);
      usage.add(Usage.parse(result.metadata.usage));
    }

    task.complete(plan, { usage });
  }

  // Discovery: read each specialist's Agent Card before the first call.
  private async discover(): Promise<void> {
    if (this.discovered) return;

    for (const remote of Object.values(this.team)) {
      const card = await remote.card();
      const skills = card.skills.map((skill) => skill.name).join(', ');

      console.log(`[planner] discovered ${card.name}: ${skills}`);
    }

    this.discovered = true;
  }

  // A new request, or the user's answer forwarded to Router's waiting task
  // (same taskId).
  private async getRoute(task: TaskContext, request: string) {
    const waiting = this.waitingForAnswer.get(task.taskId);

    this.waitingForAnswer.delete(task.taskId);

    return waiting
      ? this.call(task, this.team.router, [Parts.text(task.lastText)], waiting)
      : this.call(task, this.team.router, [Parts.text(request)]);
  }

  private async writePlan(
    request: string,
    routeResult: TaskResult,
    weather: TaskResult,
    stops: TaskResult,
  ) {
    const { route } = routeResult.dataAs('route', RouteReply);

    return this.writer.write({
      request,
      route: {
        summary: routeResult.answer,
        distanceKm: route.distanceKm,
        ascentM: route.ascentM,
        surface: route.surface,
      },
      weather: {
        summary: weather.answer,
        ...weather.dataAs('weather', WeatherReply),
      },
      stops: {
        summary: stops.answer,
        ...stops.dataAs('stops', StopsReply),
      },
    });
  }

  // One A2A call. The specialist's `working` updates are forwarded to our own
  // caller.
  private async call(
    task: TaskContext,
    remote: RemoteAgent,
    parts: Parameters<RemoteAgent['send']>[0],
    ids = {},
  ) {
    const result = await remote.send(parts, {
      ...ids,
      onStatus: (text) => task.working(`${remote.name}: ${text}`),
    });

    if (result.isFailed)
      throw new Error(`${remote.name} failed: ${result.statusText}`);

    return result;
  }
}
