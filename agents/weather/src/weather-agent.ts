import { A2AAgent, Parts, type TaskContext } from '@bike-ride/a2a';
import { LatLonSchema } from '@bike-ride/geometry';
import { today, type ToolLoop } from '@bike-ride/llm';
import { z } from 'zod';
import type { WeatherSession } from './tools.ts';

// What Weather accepts: the ride request as text, and the route as a DataPart.
// It declares only the route fields it reads. Agents agree on the JSON they
// send each other, not on a shared type.
const WeatherRequest = z.object({
  text: z.string(),
  data: z.object({
    route: z.object({ coords: z.array(LatLonSchema).min(2) }),
    bike: z.enum(['road', 'gravel', 'trekking']).default('road'),
  }),
});

// Weather: forecast and wind along the route. Plain TypeScript + Anthropic SDK,
// served over A2A.
export class WeatherAgent extends A2AAgent {
  // The system prompt. A getter, so the date in it is always today's.
  protected get systemPrompt(): string {
    return `You are a weather expert for cyclists.
Today is ${today()}.
Find the ride date and start hour in the request
(default: next Saturday, 9:00) and call windAnalysis.
Recommend the riding direction: headwind on the first half (fresh legs),
tailwind on the way home.
Answer in 3-4 sentences with numbers from the tool only.`;
  }

  readonly name = 'weather';
  protected readonly profile = {
    title: 'Weather',
    description:
      'Forecast for a bike route, including headwind along the route.',
    skill: {
      id: 'route-weather',
      name: 'Weather along a route',
      description:
        'Send the ride request as text ' +
        'and the route as a DataPart {route, bike}.',
      examples: ['Saturday 9:00, with the route attached as data'],
    },
  };
  private readonly loop: ToolLoop<WeatherSession>;

  // The loop (Claude + Weather's tools) is injected: see main.ts.
  constructor(loop: ToolLoop<WeatherSession>) {
    super();
    this.loop = loop;
  }

  protected async handle(task: TaskContext): Promise<void> {
    // The route arrives as a DataPart: structured data, not something the LLM
    // has to read. Invalid input is answered with `rejected`.
    const { text: request, data } = task.parse(WeatherRequest);
    const session: WeatherSession = { bike: data.bike, route: data.route };

    const { text, usage } = await this.loop.run({
      systemPrompt: this.systemPrompt,
      userPrompt: request,
      session,
      onToolCall: (name, input) =>
        task.working(`${name} ${JSON.stringify(input)}`),
    });

    task.artifact('weather', [Parts.data({ forecast: session.forecast })]);
    task.complete(text, { usage });
  }
}
