import { describe, it, expect } from 'vitest';
import { renderTemplate, extractJson } from '../src/skills/SkillExecutor.js';

describe('renderTemplate', () => {
  it('substitutes simple placeholders', () => {
    expect(renderTemplate('Hello {{name}}', { name: 'Abhay' })).toBe('Hello Abhay');
  });

  it('resolves dot-notation keys from flattened inputs', () => {
    expect(renderTemplate('{{ticket.title}}', { 'ticket.title': 'Risk missing' })).toBe('Risk missing');
  });

  it('blanks unresolved placeholders instead of leaving literal braces', () => {
    expect(renderTemplate('a {{missing}} b', {})).toBe('a  b');
  });

  it('stringifies non-string values', () => {
    expect(renderTemplate('n={{n}}', { n: 42 })).toBe('n=42');
  });
});

describe('extractJson', () => {
  it('parses a fenced ```json block', () => {
    const text = 'Here is the result:\n```json\n{"error_code":"KE-001","confidence_score":90}\n```\ndone';
    expect(extractJson(text)).toEqual({ error_code: 'KE-001', confidence_score: 90 });
  });

  it('parses a bare JSON object', () => {
    expect(extractJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('returns null for malformed JSON', () => {
    expect(extractJson('```json\n{not valid}\n```')).toBeNull();
  });

  it('returns null when there is no object at all', () => {
    expect(extractJson('just some prose, no json here')).toBeNull();
  });

  it('returns null for a top-level array (skills expect an object)', () => {
    expect(extractJson('[1,2,3]')).toBeNull();
  });
});
