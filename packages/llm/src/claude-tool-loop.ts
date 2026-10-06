import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { toolDefinition, type Tool } from './tool.ts';
import { Usage } from './usage.ts';

export type ToolLoopOptions<Session> = {
  model: string;
  tools: Tool<z.ZodObject, Session>[];
};
export type OnToolCall = (name: string, input: unknown) => void;

export type ToolLoopRequest<Session> = {
  // Who the agent is and how it should work. Sent as the Messages API `system`
  // parameter, separate from the user's request.
  systemPrompt: string;
  userPrompt: string; // the user's request
  session: Session; // handed to every tool call
  onToolCall?: OnToolCall; // e.g. to send an A2A `working` status update
};
export type ToolLoopResult = { text: string; usage: Usage };

// What an agent needs from its LLM loop. Agents depend on this interface, so a
// test can inject a fake instead of calling Claude.
export interface ToolLoop<Session> {
  run(request: ToolLoopRequest<Session>): Promise<ToolLoopResult>;
}

// The agent loop, the core of every LLM agent:
//   1. Send Claude the conversation and the list of tools.
//   2. Claude either answers with text (done), or asks for tool calls.
//   3. Run those tools, add the results to the conversation, go to 1.
// Claude decides which tools to call and when to stop; we only execute.
export class ClaudeToolLoop<Session> implements ToolLoop<Session> {
  private static client = new Anthropic();
  private readonly options: ToolLoopOptions<Session>;
  private readonly definitions: Anthropic.Tool[];

  constructor(options: ToolLoopOptions<Session>) {
    this.options = options;
    this.definitions = options.tools.map(toolDefinition);
  }

  async run({
    systemPrompt,
    userPrompt,
    session,
    onToolCall,
  }: ToolLoopRequest<Session>): Promise<ToolLoopResult> {
    const { model } = this.options;
    const usage = new Usage();
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userPrompt },
    ];

    while (true) {
      // 1. Claude sees the whole conversation so far, plus the tools.
      const response = await ClaudeToolLoop.client.messages.create({
        model,
        max_tokens: 16000,
        system: systemPrompt,
        tools: this.definitions,
        messages,
      });

      usage.add(
        Usage.ofCall(
          model,
          response.usage.input_tokens,
          response.usage.output_tokens,
        ),
      );
      messages.push({ role: 'assistant', content: response.content });

      // 2. No tool calls: this is the final answer.
      if (response.stop_reason !== 'tool_use') {
        // The reply is a list of blocks; keep the text ones.
        const text = response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('');

        return { text: text.trim(), usage };
      }

      // 3. Claude asked for tools, e.g. { name: 'geocode', input: {...} }.
      // Run each one and send all results back in one message.
      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const call of response.content) {
        if (call.type !== 'tool_use') continue;

        onToolCall?.(call.name, call.input);
        results.push(await this.runTool(call, session));
      }

      messages.push({ role: 'user', content: results });
      // ...and loop: Claude now reads the results and decides the next step.
    }
  }

  // Run one tool call. Errors go back to Claude as a result, not as an
  // exception, so Claude can see what went wrong and try again.
  private async runTool(
    call: Anthropic.ToolUseBlock,
    session: Session,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const tool = this.options.tools.find((t) => t.name === call.name);

    try {
      if (!tool) throw new Error(`Unknown tool: ${call.name}`);

      // The model's input is untrusted: validate it. On failure the model gets
      // the readable error back and can fix its call.
      const input = tool.input.safeParse(call.input);

      if (!input.success) throw new Error(z.prettifyError(input.error));

      const output = await tool.run(input.data, session);

      return {
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(output),
      };
    } catch (err) {
      return {
        type: 'tool_result',
        tool_use_id: call.id,
        content: String(err),
        is_error: true,
      };
    }
  }
}
