import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../src/utils/similarity.js';

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it('is scale-invariant', () => {
    expect(cosineSimilarity([1, 1], [3, 3])).toBeCloseTo(1, 6);
  });

  it('handles a zero vector without NaN', () => {
    const s = cosineSimilarity([0, 0], [1, 1]);
    expect(Number.isNaN(s)).toBe(false);
  });
});
