import express from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express';
import type { A2AAgent } from './a2a-agent.ts';
import { agentUrl, PORTS } from './topology.ts';

// Serves one agent over HTTP: the Agent Card at the well-known path and the
// JSON-RPC endpoint.
export class AgentServer {
  private readonly agent: A2AAgent;

  private constructor(agent: A2AAgent) {
    this.agent = agent;
  }

  static fromAgent(agent: A2AAgent): AgentServer {
    return new AgentServer(agent);
  }

  // Start serving: the Agent Card at the well-known path, JSON-RPC for
  // everything else.
  run(): void {
    const { name, card } = this.agent;
    const requestHandler = new DefaultRequestHandler(
      card,
      new InMemoryTaskStore(),
      this.agent,
    );
    const app = express();

    app.use(
      `/${AGENT_CARD_PATH}`,
      agentCardHandler({ agentCardProvider: requestHandler }),
    );
    app.use(
      jsonRpcHandler({
        requestHandler,
        userBuilder: UserBuilder.noAuthentication,
      }),
    );
    const cardUrl = `${agentUrl(name)}${AGENT_CARD_PATH}`;

    app.listen(PORTS[name], () =>
      console.log(`[${name}] listening on :${PORTS[name]}, card at ${cardUrl}`),
    );
  }
}
