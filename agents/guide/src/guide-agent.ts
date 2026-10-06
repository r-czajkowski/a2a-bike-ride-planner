import { A2AAgent, Parts, type TaskContext } from '@bike-ride/a2a';
import { LatLonSchema } from '@bike-ride/geometry';
import type { ToolLoop } from '@bike-ride/llm';
import { z } from 'zod';
import type { GuideSession } from './tools.ts';

// What Guide accepts: the ride request as text, and the route as a DataPart.
const GuideRequest = z.object({
  text: z.string(),
  data: z.object({
    route: z.object({ coords: z.array(LatLonSchema).min(2) }),
  }),
});

// Guide: stops along the route. Plain TypeScript + Anthropic SDK, served over
// A2A.
export class GuideAgent extends A2AAgent {
  // The system prompt.
  protected get systemPrompt(): string {
    return `You are a local guide for cyclists.
Call findStops, then recommend 2-3 stops spread along the route
(a cafe near halfway if the rider wants coffee).
For each stop give the name, type and km.
Answer in 3-4 sentences, using only stops returned by the tool.`;
  }

  readonly name = 'guide';
  protected readonly profile = {
    title: 'Guide',
    description: 'Finds cafes, shops and drinking water along a bike route.',
    skill: {
      id: 'route-stops',
      name: 'Stops along a route',
      description:
        'Send the ride request as text and the route as a DataPart {route}.',
      examples: ['Coffee halfway, with the route attached as data'],
    },
  };
  private readonly loop: ToolLoop<GuideSession>;

  // The loop (Claude + Guide's tools) is injected: see main.ts.
  constructor(loop: ToolLoop<GuideSession>) {
    super();
    this.loop = loop;
  }

  protected async handle(task: TaskContext): Promise<void> {
    const { text: request, data } = task.parse(GuideRequest);
    const session: GuideSession = { route: data.route };

    const { text, usage } = await this.loop.run({
      systemPrompt: this.systemPrompt,
      userPrompt: request,
      session,
      onToolCall: (name) => task.working(name),
    });

    task.artifact('stops', [Parts.data({ stops: session.stops ?? [] })]);
    task.complete(text, { usage });
  }
}
