// Starts the Router agent. This is the one place that picks the data
// providers and wires up the agent.
import { AgentServer } from '@bike-ride/a2a';
import { ClaudeToolLoop, MODELS } from '@bike-ride/llm';
import { BRouterRoutePlanner } from './brouter-route-planner.ts';
import { NominatimGeocoder } from './nominatim-geocoder.ts';
import { RouterAgent } from './router-agent.ts';
import { GeocodeTool, PlanRouteTool } from './tools.ts';

const loop = new ClaudeToolLoop({
  model: MODELS.specialist,
  tools: [
    new GeocodeTool(new NominatimGeocoder()),
    new PlanRouteTool(new BRouterRoutePlanner()),
  ],
});

AgentServer.fromAgent(new RouterAgent(loop)).run();
