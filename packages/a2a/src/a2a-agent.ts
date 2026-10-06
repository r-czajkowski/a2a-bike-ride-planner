import {
  A2A_PROTOCOL_VERSION,
  Role,
  TaskState,
  type AgentCard,
} from '@a2a-js/sdk';
import {
  AgentEvent,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
} from '@a2a-js/sdk/server';
import { InvalidInputError } from './invalid-input-error.ts';
import { Parts } from './parts.ts';
import { TaskContext } from './task-context.ts';
import { agentUrl, type AgentName } from './topology.ts';

export type AgentProfile = {
  title: string;
  description: string;
  skill: { id: string; name: string; description: string; examples: string[] };
};

// Base class for every agent in the demo. It implements the SDK's
// AgentExecutor: it handles the protocol (task events, history, errors) and
// calls `handle()`, which each agent implements.
export abstract class A2AAgent implements AgentExecutor {
  abstract readonly name: AgentName;
  protected abstract readonly profile: AgentProfile;

  // The agent's business logic for one task.
  protected abstract handle(task: TaskContext): Promise<void>;

  // The Agent Card is how other agents discover us, at
  // /.well-known/agent-card.json.
  get card(): AgentCard {
    const { title, description, skill } = this.profile;

    return {
      name: title,
      description,
      version: '1.0.0',
      supportedInterfaces: [
        {
          url: agentUrl(this.name),
          protocolBinding: 'JSONRPC',
          tenant: '',
          protocolVersion: A2A_PROTOCOL_VERSION,
        },
      ],
      provider: undefined,
      capabilities: {
        streaming: true,
        pushNotifications: false,
        extensions: [],
        extendedAgentCard: false,
      },
      securitySchemes: {},
      securityRequirements: [],
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['text/plain', 'application/json'],
      skills: [
        {
          ...skill,
          tags: [],
          inputModes: [],
          outputModes: [],
          securityRequirements: [],
        },
      ],
      signatures: [],
    };
  }

  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = ctx;

    // Every turn must start with a Task event: `submitted` for a new task, or
    // the existing one when this message answers our `input-required` question.
    bus.publish(
      AgentEvent.task(
        ctx.task ?? {
          id: taskId,
          contextId,
          artifacts: [],
          history: [userMessage],
          metadata: undefined,
          status: {
            state: TaskState.TASK_STATE_SUBMITTED,
            timestamp: new Date().toISOString(),
            message: undefined,
          },
        },
      ),
    );

    // The user's messages in this task, oldest first. The new message may
    // already be in the stored history; add it only if it isn't.
    const history = ctx.task?.history ?? [];
    const all = history.some((m) => m.messageId === userMessage.messageId)
      ? history
      : [...history, userMessage];
    const userMessages = all.filter((m) => m.role === Role.ROLE_USER);

    const task = new TaskContext(
      this.name,
      taskId,
      contextId,
      userMessages,
      bus,
    );
    const data = Parts.dataOf(userMessage.parts) ? ' + data' : '';

    console.log(
      `[${this.name}] ← task ${taskId.slice(0, 8)} ` +
        `${JSON.stringify(Parts.textOf(userMessage.parts))}${data}`,
    );

    try {
      await this.handle(task);
    } catch (err) {
      if (err instanceof InvalidInputError) return task.reject(err.message);

      console.error(`[${this.name}]`, err);
      task.fail(err);
    }
  }

  async cancelTask(): Promise<void> {
    // Not supported in this demo.
  }
}
