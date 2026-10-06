import {
  Role,
  TaskState,
  type AgentCard,
  type Artifact,
  type Part,
} from '@a2a-js/sdk';
import { ClientFactory, type Client } from '@a2a-js/sdk/client';
import type { z } from 'zod';
import { parseInput } from './invalid-input-error.ts';
import { Parts } from './parts.ts';
import { agentUrl, type AgentName } from './topology.ts';

export type SendOptions = {
  taskId?: string;
  contextId?: string;
  onStatus?: (text: string) => void;
};

// What came back from one call: the task's last state and everything it
// produced.
export class TaskResult {
  state = TaskState.TASK_STATE_SUBMITTED;
  taskId = '';
  contextId = '';
  statusText = ''; // e.g. the question for `input-required`
  artifacts: Artifact[] = [];
  metadata: Record<string, any> = {}; // from the final status, e.g. { usage }

  get isCompleted(): boolean {
    return this.state === TaskState.TASK_STATE_COMPLETED;
  }

  get isInputRequired(): boolean {
    return this.state === TaskState.TASK_STATE_INPUT_REQUIRED;
  }

  // Failed on their side, or rejected our input.
  get isFailed(): boolean {
    return (
      this.state === TaskState.TASK_STATE_FAILED ||
      this.state === TaskState.TASK_STATE_REJECTED
    );
  }

  get answer(): string {
    return Parts.textOf(this.artifact('answer')?.parts);
  }

  artifact(name: string): Artifact | undefined {
    return this.artifacts.find((a) => a.name === name);
  }

  // An artifact's DataPart, validated: other agents' output is untrusted too.
  dataAs<S extends z.ZodType>(artifactName: string, schema: S): z.infer<S> {
    const data = Parts.dataOf(this.artifact(artifactName)?.parts);

    return parseInput(`'${artifactName}' artifact`, schema, data);
  }

  file(artifactName: string): string | undefined {
    return Parts.fileOf(this.artifact(artifactName)?.parts);
  }
}

// Another agent, reached over A2A. Discovery happens on first use: fetch its
// Agent Card and build a client for the transport the card advertises.
export class RemoteAgent {
  readonly name: AgentName;
  private client?: Client;

  constructor(name: AgentName) {
    this.name = name;
  }

  async card(): Promise<AgentCard> {
    return (await this.connect()).getAgentCard();
  }

  // Send a message and follow the SSE stream until the task stops
  // (completed, failed or input-required).
  async send(parts: Part[], options: SendOptions = {}): Promise<TaskResult> {
    const client = await this.connect();
    const result = new TaskResult();
    const stream = client.sendMessageStream({
      tenant: '',
      configuration: undefined,
      metadata: {},
      message: Parts.message(
        Role.ROLE_USER,
        parts,
        options.taskId,
        options.contextId,
      ),
    });

    for await (const { payload } of stream) {
      if (payload?.$case === 'task') {
        result.taskId = payload.value.id;
        result.contextId = payload.value.contextId;
      } else if (
        payload?.$case === 'artifactUpdate' &&
        payload.value.artifact
      ) {
        result.artifacts.push(payload.value.artifact);
      } else if (payload?.$case === 'statusUpdate' && payload.value.status) {
        result.state = payload.value.status.state;
        result.statusText = Parts.textOf(payload.value.status.message?.parts);
        result.metadata = payload.value.metadata ?? result.metadata;
        if (result.state === TaskState.TASK_STATE_WORKING && result.statusText)
          options.onStatus?.(result.statusText);
      }
    }

    return result;
  }

  private async connect(): Promise<Client> {
    this.client ??= await new ClientFactory().createFromUrl(
      agentUrl(this.name),
    );

    return this.client;
  }
}
