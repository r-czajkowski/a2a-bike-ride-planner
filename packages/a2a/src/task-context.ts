import { Role, TaskState, type Message, type Part } from '@a2a-js/sdk';
import { AgentEvent, type ExecutionEventBus } from '@a2a-js/sdk/server';
import type { z } from 'zod';
import { parseInput } from './invalid-input-error.ts';
import { Parts } from './parts.ts';

// One A2A task, as seen by the agent working on it. Each method publishes a
// protocol event: status updates (`working`, `input-required`, `completed`,
// `failed`) and artifacts.
export class TaskContext {
  readonly agent: string; // our name, for the console log
  readonly taskId: string;
  readonly contextId: string;
  // all user text in this task so far (request + answers to our questions)
  readonly text: string;
  // only the latest message, e.g. the answer to our question
  readonly lastText: string;
  // the latest DataPart the caller sent; untrusted until parsed
  readonly data: unknown;
  private readonly bus: ExecutionEventBus;

  constructor(
    agent: string,
    taskId: string,
    contextId: string,
    userMessages: Message[],
    bus: ExecutionEventBus,
  ) {
    this.agent = agent;
    this.taskId = taskId;
    this.contextId = contextId;
    this.bus = bus;
    this.text = userMessages
      .map((m) => Parts.textOf(m.parts))
      .filter(Boolean)
      .join('\n');
    this.lastText = Parts.textOf(userMessages.at(-1)?.parts);
    this.data = userMessages
      .map((m) => Parts.dataOf(m.parts))
      .findLast(Boolean);
  }

  // The request, validated: `{ text, data }` must match the agent's schema.
  // Invalid input throws, and the base class answers with `rejected`.
  parse<S extends z.ZodType>(schema: S): z.infer<S> {
    return parseInput('request', schema, { text: this.text, data: this.data });
  }

  working(text: string): void {
    this.status(TaskState.TASK_STATE_WORKING, text);
  }

  // Ask the caller a question. The answer arrives as a new message on the same
  // taskId. Metadata carries this turn's usage, like `complete()`.
  inputRequired(
    question: string,
    metadata: Record<string, unknown> = {},
  ): void {
    this.status(TaskState.TASK_STATE_INPUT_REQUIRED, question, metadata);
  }

  artifact(name: string, parts: Part[]): void {
    console.log(`[${this.agent}] artifact: ${name}`);
    const artifact = {
      artifactId: crypto.randomUUID(),
      name,
      description: '',
      parts,
      metadata: undefined,
      extensions: [],
    };

    this.bus.publish(
      AgentEvent.artifactUpdate({
        taskId: this.taskId,
        contextId: this.contextId,
        artifact,
        append: false,
        lastChunk: true,
        metadata: undefined,
      }),
    );
  }

  // The final answer as a text artifact, then `completed` with metadata (e.g.
  // usage).
  complete(text: string, metadata: Record<string, unknown> = {}): void {
    this.artifact('answer', [Parts.text(text)]);
    this.status(TaskState.TASK_STATE_COMPLETED, undefined, metadata);
  }

  // The caller's input was invalid.
  reject(reason: string): void {
    this.status(TaskState.TASK_STATE_REJECTED, reason);
  }

  // Something went wrong on our side.
  fail(error: unknown): void {
    this.status(
      TaskState.TASK_STATE_FAILED,
      `Error: ${(error as Error).message ?? error}`,
    );
  }

  private status(
    state: TaskState,
    text?: string,
    metadata?: Record<string, unknown>,
  ): void {
    // e.g. TASK_STATE_INPUT_REQUIRED -> input-required
    const label = TaskState[state]
      .replace('TASK_STATE_', '')
      .toLowerCase()
      .replace('_', '-');

    console.log(`[${this.agent}] ${label}${text ? `: ${text}` : ''}`);
    const message = text
      ? Parts.message(
          Role.ROLE_AGENT,
          [Parts.text(text)],
          this.taskId,
          this.contextId,
        )
      : undefined;

    this.bus.publish(
      AgentEvent.statusUpdate({
        taskId: this.taskId,
        contextId: this.contextId,
        metadata,
        status: { state, timestamp: new Date().toISOString(), message },
      }),
    );
  }
}
