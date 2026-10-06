import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// A tool the model can call. One zod schema does two jobs: it becomes the JSON
// Schema Claude sees, and it validates the input Claude sends before `run`.
//
// Tools keep no per-task state, so they can be created once and injected.
// Whatever one task needs (the route, results for the artifacts) lives in the
// `session` passed to each call.
export interface Tool<Input extends z.ZodObject = z.ZodObject, Session = any> {
  readonly name: string;
  readonly description: string;
  readonly input: Input;
  run(input: z.infer<Input>, session: Session): Promise<unknown>;
}

// What the Messages API expects in `tools`.
export function toolDefinition(tool: Tool): Anthropic.Tool {
  // Claude does not need the `$schema` URL.
  const { $schema: _url, ...schema } = z.toJSONSchema(tool.input);

  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema as Anthropic.Tool.InputSchema,
  };
}
