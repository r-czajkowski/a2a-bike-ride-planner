import { A2AAgent, Parts, type TaskContext } from '@bike-ride/a2a';
import { today, type ToolLoop } from '@bike-ride/llm';
import { z } from 'zod';
import type { RouteSession } from './tools.ts';

// What Router accepts: a ride request in plain text.
const RouterRequest = z.object({
  text: z
    .string()
    .trim()
    .min(5, 'Describe the ride, e.g. "50 km loop from Białystok"'),
});

// Router: plans the bike route. Plain TypeScript + Anthropic SDK, served over
// A2A.
export class RouterAgent extends A2AAgent {
  // The system prompt. A getter, so the date in it is always today's.
  protected get systemPrompt(): string {
    return `You plan bike loops in Poland. Today is ${today()}.
You need the start, the distance and the bike type (road, gravel or
trekking). If any of them is missing or unclear, don't guess: reply with only
one short question that covers everything missing.
Otherwise geocode the start exactly as the rider gave it (street or address
too, not just the town), then call planRoute once.
Then describe the route in 3-4 sentences: which side of the start it goes,
km, ascent, surface. Don't name towns along the way: the tool doesn't return
them.`;
  }

  readonly name = 'router';
  protected readonly profile = {
    title: 'Router',
    description: 'Plans bike loops in Poland using OpenStreetMap data.',
    skill: {
      id: 'plan-route',
      name: 'Plan a bike route',
      description:
        'Returns the route as a DataPart and a GPX file. ' +
        'Asks back if the distance or bike type is missing.',
      examples: ['50 km loop from Białystok, road bike'],
    },
  };
  private readonly loop: ToolLoop<RouteSession>;

  // The loop (Claude + Router's tools) is injected: see main.ts.
  constructor(loop: ToolLoop<RouteSession>) {
    super();
    this.loop = loop;
  }

  protected async handle(task: TaskContext): Promise<void> {
    // task.text holds the request plus any answers to our earlier questions.
    const { text: request } = task.parse(RouterRequest);
    const session: RouteSession = {};
    const { text, usage } = await this.loop.run({
      systemPrompt: this.systemPrompt,
      userPrompt: request,
      session,
      onToolCall: (name, input) =>
        task.working(`${name} ${JSON.stringify(input)}`),
    });

    // Asking back: no route means the model replied with a question instead.
    // The caller answers on the same taskId.
    if (!session.route || !session.gpx)
      return task.inputRequired(text, { usage });

    // The route travels as data (DataPart + GPX file), not as LLM tokens.
    task.artifact('route', [
      Parts.data({ route: session.route, bike: session.bike }),
      Parts.file('route.gpx', 'application/gpx+xml', session.gpx),
    ]);
    task.complete(text, { usage });
  }
}
