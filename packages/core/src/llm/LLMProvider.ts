import type { Message, Tool, ChatOptions, LLMChunk } from '../types.js';

export interface LLMProvider {
  chat(
    messages: Message[],
    tools?: Tool[],
    options?: ChatOptions,
  ): AsyncGenerator<LLMChunk>;

  embed(texts: string[]): Promise<number[][]>;
}

export function resolveEnvVar(value: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name: string) => {
    const resolved = process.env[name];
    if (!resolved) throw new Error(`Environment variable ${name} is not set`);
    return resolved;
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes('429') || err.message.toLowerCase().includes('rate limit'));

      if (!isRateLimit || attempt === maxAttempts - 1) throw err;

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
