#!/usr/bin/env node
/**
 * Converts an OWM (Online Wardley Mapping) file to SVG and PNG.
 *
 * Usage: node owm-to-svg.mjs [input.owm] [output.svg]
 *
 * Defaults:
 *   input:  docs/wardley-map.owm
 *   output: docs/wardley-map.svg (+ .png via sips)
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const inputPath = resolve(process.argv[2] || 'docs/wardley-map.owm');
const outputSvg = resolve(process.argv[3] || inputPath.replace(/\.owm$/, '.svg'));
const outputPng = outputSvg.replace(/\.svg$/, '.png');

const raw = readFileSync(inputPath, 'utf8');
const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));

// Parse
let title = '';
const components = [];
const links = [];
const evolves = [];

for (const line of lines) {
  const titleMatch = line.match(/^title\s+(.+)/);
  if (titleMatch) { title = titleMatch[1]; continue; }

  const anchorMatch = line.match(/^anchor\s+(.+?)\s+\[([0-9.]+),\s*([0-9.]+)\]/);
  if (anchorMatch) {
    components.push({ name: anchorMatch[1], vis: parseFloat(anchorMatch[2]), evo: parseFloat(anchorMatch[3]), isAnchor: true });
    continue;
  }

  const compMatch = line.match(/^component\s+(.+?)\s+\[([0-9.]+),\s*([0-9.]+)\]/);
  if (compMatch) {
    components.push({ name: compMatch[1], vis: parseFloat(compMatch[2]), evo: parseFloat(compMatch[3]), isAnchor: false });
    continue;
  }

  const evolveMatch = line.match(/^evolve\s+(.+?)\s+([0-9.]+)/);
  if (evolveMatch) {
    evolves.push({ name: evolveMatch[1], targetEvo: parseFloat(evolveMatch[2]) });
    continue;
  }

  const linkMatch = line.match(/^(.+?)->(.+)/);
  if (linkMatch) {
    links.push({ from: linkMatch[1].trim(), to: linkMatch[2].trim() });
    continue;
  }
}

// Layout constants
const W = 1200;
const H = 800;
const PAD_LEFT = 80;
const PAD_RIGHT = 60;
const PAD_TOP = 60;
const PAD_BOTTOM = 80;
const CHART_W = W - PAD_LEFT - PAD_RIGHT;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

function evoToX(evo) { return PAD_LEFT + evo * CHART_W; }
function visToY(vis) { return PAD_TOP + (1 - vis) * CHART_H; }

// Build SVG
const svgParts = [];
svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
svgParts.push(`<defs>
  <marker id="evolve-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
    <polygon points="0,0 8,3 0,6" fill="#c44"/>
  </marker>
</defs>`);
svgParts.push(`<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .title { font-size: 20px; font-weight: 700; }
  .axis-label { font-size: 12px; fill: #666; }
  .phase-label { font-size: 11px; fill: #999; }
  .comp-label { font-size: 13px; fill: #222; }
  .anchor-label { font-size: 13px; fill: #222; font-weight: 600; }
  .evolve-label { font-size: 11px; fill: #c44; }
</style>`);

// Background
svgParts.push(`<rect width="${W}" height="${H}" fill="white"/>`);

// Title
svgParts.push(`<text x="${PAD_LEFT}" y="35" class="title">${title}</text>`);

// Axes
svgParts.push(`<line x1="${PAD_LEFT}" y1="${PAD_TOP}" x2="${PAD_LEFT}" y2="${H - PAD_BOTTOM}" stroke="#333" stroke-width="1.5"/>`);
svgParts.push(`<line x1="${PAD_LEFT}" y1="${H - PAD_BOTTOM}" x2="${W - PAD_RIGHT}" y2="${H - PAD_BOTTOM}" stroke="#333" stroke-width="1.5"/>`);

// Arrow on evolution axis
const arrowX = W - PAD_RIGHT;
const arrowY = H - PAD_BOTTOM;
svgParts.push(`<polygon points="${arrowX},${arrowY} ${arrowX - 8},${arrowY - 4} ${arrowX - 8},${arrowY + 4}" fill="#333"/>`);

// Axis titles
svgParts.push(`<text x="${PAD_LEFT - 10}" y="${PAD_TOP + CHART_H / 2}" class="axis-label" transform="rotate(-90 ${PAD_LEFT - 10} ${PAD_TOP + CHART_H / 2})" text-anchor="middle">Value Chain</text>`);
svgParts.push(`<text x="${PAD_LEFT + CHART_W / 2}" y="${H - 15}" class="axis-label" text-anchor="middle">Evolution</text>`);

// Phase dividers and labels
const phases = [
  { boundary: 0.17, label: 'Genesis' },
  { boundary: 0.37, label: 'Custom-Built' },
  { boundary: 0.63, label: 'Product' },
  { boundary: 1.0, label: 'Commodity' },
];

let prevBound = 0;
for (const phase of phases) {
  const midEvo = (prevBound + phase.boundary) / 2;
  svgParts.push(`<text x="${evoToX(midEvo)}" y="${H - PAD_BOTTOM + 25}" class="phase-label" text-anchor="middle">${phase.label}</text>`);
  if (phase.boundary < 1.0) {
    const dx = evoToX(phase.boundary);
    svgParts.push(`<line x1="${dx}" y1="${PAD_TOP}" x2="${dx}" y2="${H - PAD_BOTTOM}" stroke="#ddd" stroke-width="1" stroke-dasharray="4,4"/>`);
  }
  prevBound = phase.boundary;
}

// Links
const compMap = new Map(components.map((c) => [c.name, c]));
for (const link of links) {
  const from = compMap.get(link.from);
  const to = compMap.get(link.to);
  if (!from || !to) continue;
  svgParts.push(`<line x1="${evoToX(from.evo)}" y1="${visToY(from.vis)}" x2="${evoToX(to.evo)}" y2="${visToY(to.vis)}" stroke="#aaa" stroke-width="1.5"/>`);
}

// Evolution arrows
for (const ev of evolves) {
  const comp = compMap.get(ev.name);
  if (!comp) continue;
  const x1 = evoToX(comp.evo);
  const x2 = evoToX(ev.targetEvo);
  const y = visToY(comp.vis);
  svgParts.push(`<line x1="${x1 + 8}" y1="${y}" x2="${x2 - 2}" y2="${y}" stroke="#c44" stroke-width="2" stroke-dasharray="6,3" marker-end="url(#evolve-arrow)"/>`);
  svgParts.push(`<circle cx="${x2}" cy="${y}" r="5" fill="none" stroke="#c44" stroke-width="1.5" stroke-dasharray="3,2"/>`);
}

// Components
for (const comp of components) {
  const cx = evoToX(comp.evo);
  const cy = visToY(comp.vis);
  const r = comp.isAnchor ? 0 : 6;
  const labelClass = comp.isAnchor ? 'anchor-label' : 'comp-label';

  if (!comp.isAnchor) {
    svgParts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="#333" stroke-width="1.5"/>`);
  }
  svgParts.push(`<text x="${cx + 10}" y="${cy - 10}" class="${labelClass}">${comp.name}</text>`);
}

svgParts.push('</svg>');

const svg = svgParts.join('\n');
writeFileSync(outputSvg, svg);
console.log(`SVG: ${outputSvg}`);

// Convert to PNG via sips (macOS)
try {
  execSync(`sips -s format png "${outputSvg}" --out "${outputPng}" 2>/dev/null`);
  console.log(`PNG: ${outputPng}`);
} catch {
  console.log('PNG: skipped (sips not available, macOS only)');
}
