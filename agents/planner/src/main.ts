// Starts the Planner. This is the one place that wires up its team and plan
// writer.
import { AgentServer, RemoteAgent } from '@bike-ride/a2a';
import { MODELS } from '@bike-ride/llm';
import { ClaudePlanWriter } from './plan-writer.ts';
import { PlannerAgent, type Team } from './planner-agent.ts';

const team: Team = {
  router: new RemoteAgent('router'),
  weather: new RemoteAgent('weather'),
  guide: new RemoteAgent('guide'),
};

AgentServer.fromAgent(
  new PlannerAgent(team, new ClaudePlanWriter(MODELS.coordinator)),
).run();
