// Starts the Guide agent. This is the one place that picks the POI provider
// and wires up the agent.
import { AgentServer } from '@bike-ride/a2a';
import { ClaudeToolLoop, MODELS } from '@bike-ride/llm';
import { GuideAgent } from './guide-agent.ts';
import { OverpassPoiProvider } from './overpass-poi-provider.ts';
import { StopFinder } from './stop-finder.ts';
import { FindStopsTool } from './tools.ts';

const loop = new ClaudeToolLoop({
  model: MODELS.specialist,
  tools: [new FindStopsTool(new StopFinder(new OverpassPoiProvider()))],
});

AgentServer.fromAgent(new GuideAgent(loop)).run();
