// Which Claude model each role uses, and what it costs.

export const MODELS = {
  coordinator: process.env.MODEL_COORDINATOR ?? 'claude-sonnet-5-5',
  specialist: process.env.MODEL_SPECIALIST ?? 'claude-haiku-4-5',
};

// USD per 1M tokens. Verify before publishing:
// https://docs.claude.com/en/docs/about-claude/pricing
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

// Agents need today's date to understand "on Saturday".
export const today = () => {
  const d = new Date();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });

  return `${d.toISOString().slice(0, 10)} (${weekday})`;
};
