import type { HighlightSegment } from '../types';

/**
 * Safely parses highlight HTML from the addressr API into renderable segments.
 * Only recognises <em> tags (produced by Elasticsearch). All other HTML is
 * treated as plain text, preventing XSS.
 */
export function parseHighlight(html: string): HighlightSegment[] {
  if (!html) return [];

  const segments: HighlightSegment[] = [];
  const parts = html.split(/(<em>.*?<\/em>)/g);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<em>') && part.endsWith('</em>')) {
      segments.push({ text: part.slice(4, -5), highlighted: true });
    } else {
      segments.push({ text: part, highlighted: false });
    }
  }

  return segments;
}
