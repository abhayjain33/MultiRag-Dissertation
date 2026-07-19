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

// Cap how long we'll honor a provider-supplied retry hint (seconds). A daily
// token cap can report tens of minutes — no point blocking an investigation
// that long; fail fast instead so the caller can surface it.
const MAX_RETRY_WAIT_MS = 60_000;

/** Returns true if the error looks like an HTTP 429 / rate-limit error. */
export function isRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return m.includes('429') || m.includes('rate limit') || m.includes('rate_limit');
  }
  return false;
}

/**
 * Extract a wait hint (ms) from a rate-limit error: the `retry-after` header
 * (seconds) or a "try again in Xs / Xm Ys" phrase in the message. Returns
 * undefined if no hint is present.
 */
export function retryAfterMs(err: unknown): number | undefined {
  const headers = (err as { headers?: Record<string, string> } | null)?.headers;
  const ra = headers?.['retry-after'];
  if (ra && !Number.isNaN(Number(ra))) return Number(ra) * 1000;

  const msg = err instanceof Error ? err.message : String(err ?? '');
  // e.g. "Please try again in 4h3m27.648s" or "try again in 1m26.4s" or "in 12.5s"
  const m = /try again in\s+(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i.exec(msg);
  if (m) {
    const h = Number(m[1] ?? 0), min = Number(m[2] ?? 0), s = Number(m[3] ?? 0);
    return Math.round((h * 3600 + min * 60 + s) * 1000);
  }
  return undefined;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === maxAttempts - 1) throw err;

      // Prefer the provider's own hint; if it exceeds our cap, give up now so
      // the error (e.g. daily token cap) is surfaced instead of hanging.
      const hint = retryAfterMs(err);
      if (hint !== undefined && hint > MAX_RETRY_WAIT_MS) throw err;
      const delayMs = hint ?? baseDelayMs * Math.pow(2, attempt);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
