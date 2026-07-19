import { describe, it, expect } from 'vitest';
import { withRetry, isRateLimitError, retryAfterMs } from '../src/llm/LLMProvider.js';

describe('isRateLimitError', () => {
  it('detects status 429', () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });
  it('detects "429" / "rate limit" in the message', () => {
    expect(isRateLimitError(new Error('Request failed with 429'))).toBe(true);
    expect(isRateLimitError(new Error('Rate limit reached'))).toBe(true);
  });
  it('returns false for unrelated errors', () => {
    expect(isRateLimitError(new Error('connection refused'))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe('retryAfterMs', () => {
  it('reads the retry-after header (seconds -> ms)', () => {
    expect(retryAfterMs({ headers: { 'retry-after': '2' } })).toBe(2000);
  });
  it('parses "try again in Xs"', () => {
    expect(retryAfterMs(new Error('Please try again in 12.5s'))).toBe(12500);
  });
  it('parses hours/minutes/seconds', () => {
    // 4h 3m 27.648s
    expect(retryAfterMs(new Error('try again in 4h3m27.648s'))).toBe(14607648);
  });
  it('returns undefined when there is no hint', () => {
    expect(retryAfterMs(new Error('boom'))).toBeUndefined();
  });
});

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return 'ok'; });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on rate-limit errors then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('429 rate limit');
      return 'done';
    }, 5, 1);
    expect(result).toBe('done');
    expect(calls).toBe(3);
  });

  it('fails fast on non-rate-limit errors', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error('bad request'); }, 5, 1))
      .rejects.toThrow('bad request');
    expect(calls).toBe(1);
  });

  it('gives up immediately when the hint exceeds the max wait (e.g. daily cap)', async () => {
    let calls = 0;
    await expect(withRetry(async () => {
      calls++;
      throw new Error('tokens per day (TPD) limit — try again in 4h3m27.648s');
    }, 5, 1)).rejects.toThrow('tokens per day');
    expect(calls).toBe(1);
  });
});
