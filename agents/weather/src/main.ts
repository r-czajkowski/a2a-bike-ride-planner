// Starts the Weather agent. This is the one place that picks the forecast
// provider and wires up the agent.
import { AgentServer } from '@bike-ride/a2a';
import { ClaudeToolLoop, MODELS } from '@bike-ride/llm';
import { OpenMeteoProvider } from './open-meteo-provider.ts';
import { WindAnalysisTool } from './tools.ts';
import { WeatherAgent } from './weather-agent.ts';
import { WindAnalyzer } from './wind-analyzer.ts';

const loop = new ClaudeToolLoop({
  model: MODELS.specialist,
  tools: [new WindAnalysisTool(new WindAnalyzer(new OpenMeteoProvider()))],
});

AgentServer.fromAgent(new WeatherAgent(loop)).run();
