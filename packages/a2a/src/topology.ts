import { z } from 'zod';

// Where the agents live: each on its own port, with its Agent Card at the
// standard /.well-known/agent-card.json.

export const PORTS = {
  planner: 9100,
  router: 9101,
  weather: 9102,
  guide: 9103,
} as const;

export const AgentNameSchema = z.enum([
  'planner',
  'router',
  'weather',
  'guide',
]);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const agentUrl = (agent: AgentName) =>
  `http://localhost:${PORTS[agent]}/`;
