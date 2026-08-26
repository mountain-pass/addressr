import { describe, it, expect } from 'vitest';
import { parseHighlight } from './parseHighlight';

describe('parseHighlight', () => {
  it('parses a simple highlight', () => {
    expect(parseHighlight('123 <em>GEORGE</em> ST')).toEqual([
      { text: '123 ', highlighted: false },
      { text: 'GEORGE', highlighted: true },
      { text: ' ST', highlighted: false },
    ]);
  });

  it('parses multiple highlights', () => {
    expect(parseHighlight('<em>1</em> <em>GEORGE</em> ST')).toEqual([
      { text: '1', highlighted: true },
      { text: ' ', highlighted: false },
      { text: 'GEORGE', highlighted: true },
      { text: ' ST', highlighted: false },
    ]);
  });

  it('handles no highlights', () => {
    expect(parseHighlight('123 GEORGE ST')).toEqual([
      { text: '123 GEORGE ST', highlighted: false },
    ]);
  });

  it('handles XSS attempt as plain text', () => {
    const result = parseHighlight('<script>alert(1)</script><em>test</em>');
    // <script> tag should be treated as plain text, only <em> is parsed
    expect(result).toEqual([
      { text: '<script>alert(1)</script>', highlighted: false },
      { text: 'test', highlighted: true },
    ]);
  });

  it('handles empty string', () => {
    expect(parseHighlight('')).toEqual([]);
  });

  it('handles highlight at start and end', () => {
    expect(parseHighlight('<em>FULL</em>')).toEqual([
      { text: 'FULL', highlighted: true },
    ]);
  });
});
