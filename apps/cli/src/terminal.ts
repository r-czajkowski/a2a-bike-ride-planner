import { createInterface } from 'node:readline/promises';
import { z } from 'zod';
import type { A2ARidePlanner, RidePlan } from './a2a-ride-planner.ts';

// The ride request from the command line, e.g. `pnpm plan "50 km loop ..."`.
export function requestFromArgs(): string {
  const schema = z
    .string()
    .trim()
    .min(5, 'Describe the ride, e.g. pnpm plan "50 km loop from Białystok"');
  const result = schema.safeParse(process.argv.slice(2).join(' '));

  if (!result.success) {
    console.error(z.prettifyError(result.error));
    process.exit(1);
  }

  return result.data;
}

export async function askInTerminal(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} `);

  rl.close();

  return answer;
}

export async function timed(
  planner: A2ARidePlanner,
  request: string,
): Promise<{ ride: RidePlan; seconds: number }> {
  const started = Date.now();
  const ride = await planner.plan(request);

  return { ride, seconds: (Date.now() - started) / 1000 };
}

export function printSummary({
  ride,
  seconds,
}: {
  ride: RidePlan;
  seconds: number;
}): void {
  console.log(`\n${ride.plan}\n`);
  console.log(
    `Time ${seconds.toFixed(1)} s,`,
    `${ride.usage.llmCalls} LLM calls,`,
    `$${ride.usage.costUsd.toFixed(4)}`,
  );
}
