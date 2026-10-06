import { z } from 'zod';

// The caller sent something we can't work with. Agents answer it with the A2A
// `rejected` state (the caller's fault), not `failed` (our fault).
export class InvalidInputError extends Error {
  static fromZod(what: string, error: z.ZodError): InvalidInputError {
    return new InvalidInputError(`Invalid ${what}:\n${z.prettifyError(error)}`);
  }
}

// Validate `value` against `schema`, or throw an InvalidInputError.
export function parseInput<S extends z.ZodType>(
  what: string,
  schema: S,
  value: unknown,
): z.infer<S> {
  const result = schema.safeParse(value);

  if (!result.success) throw InvalidInputError.fromZod(what, result.error);

  return result.data;
}
