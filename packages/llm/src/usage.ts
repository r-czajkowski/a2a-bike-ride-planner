import { z } from 'zod';
import { PRICES } from './models.ts';

export const UsageSchema = z.object({
  llmCalls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
});
export type UsageData = z.infer<typeof UsageSchema>;

// Tokens and cost of LLM calls. Travels between agents as plain JSON in task
// metadata.
export class Usage implements UsageData {
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;

  constructor(data: Partial<UsageData> = {}) {
    this.llmCalls = data.llmCalls ?? 0;
    this.inputTokens = data.inputTokens ?? 0;
    this.outputTokens = data.outputTokens ?? 0;
    this.costUsd = data.costUsd ?? 0;
  }

  // Usage another agent reported in its task metadata. Missing = no usage.
  static parse(json: unknown): Usage {
    return new Usage(UsageSchema.optional().parse(json));
  }

  static ofCall(model: string, inputTokens: number, outputTokens: number) {
    const price = PRICES[model] ?? { input: 0, output: 0 };
    const costUsd =
      (inputTokens * price.input + outputTokens * price.output) / 1_000_000;

    return new Usage({ llmCalls: 1, inputTokens, outputTokens, costUsd });
  }

  add(other: UsageData): this {
    this.llmCalls += other.llmCalls;
    this.inputTokens += other.inputTokens;
    this.outputTokens += other.outputTokens;
    this.costUsd += other.costUsd;

    return this;
  }
}
