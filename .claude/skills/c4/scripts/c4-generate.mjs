#!/usr/bin/env node

/**
 * c4-generate.mjs — Regenerate C4 architecture diagrams from source code.
 * Portable, self-contained (no npm deps). Run via: node c4-generate.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { detectSourceRoot, buildModel, toC3Mermaid, toC4Mermaid, toJson } from "./c4-lib.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "docs", "architecture", "generated");
const OUT_JSON = path.join(OUT_DIR, "components.json");
const OUT_MERMAID = path.join(OUT_DIR, "components.mmd");
const C4_MODEL = path.join(ROOT, "docs", "architecture", "C4_MODEL.md");

const C3_START = "<!-- c3:generated:start -->";
const C3_END = "<!-- c3:generated:end -->";
const C4_START = "<!-- c4:generated:start -->";
const C4_END = "<!-- c4:generated:end -->";

const C4_SCAFFOLD = `# C4 Architecture Model

This repo uses a hybrid C4 approach:
- C1/C2 are curated for intent and business context.
- C3/C4 are generated from code to reduce drift.

## C3: Component View (Generated)

${C3_START}

${C3_END}

## C4: Code View (Generated)

File-level dependency diagrams per component. Dashed arrows indicate cross-component imports. Grey nodes are external files.

${C4_START}

${C4_END}

Regenerate: \`/c4\`
Check freshness: \`/c4-check\`
`;

function inlineGenerated(startMarker, endMarker, content) {
  if (!fs.existsSync(C4_MODEL)) return;
  const doc = fs.readFileSync(C4_MODEL, "utf8");
  const startIdx = doc.indexOf(startMarker);
  const endIdx = doc.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) return;

  const before = doc.slice(0, startIdx + startMarker.length);
  const after = doc.slice(endIdx);
  const updated = `${before}\n\n${content}\n\n${after}`;
  fs.writeFileSync(C4_MODEL, updated);
}

function main() {
  const srcRoot = detectSourceRoot(ROOT);
  const model = buildModel(srcRoot);
  const json = toJson(model);
  const c3Mermaid = toC3Mermaid(model);
  const c4Mermaid = toC4Mermaid(model);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Create scaffold if C4_MODEL.md doesn't exist
  if (!fs.existsSync(C4_MODEL)) {
    fs.mkdirSync(path.dirname(C4_MODEL), { recursive: true });
    fs.writeFileSync(C4_MODEL, C4_SCAFFOLD);
  }

  fs.writeFileSync(OUT_JSON, json);
  fs.writeFileSync(OUT_MERMAID, c3Mermaid);
  inlineGenerated(C3_START, C3_END, `\`\`\`mermaid\n${c3Mermaid.trimEnd()}\n\`\`\``);
  inlineGenerated(C4_START, C4_END, c4Mermaid);

  console.log("PASS: C4 artifacts generated:");
  console.log(`- ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`- ${path.relative(ROOT, OUT_MERMAID)}`);
  console.log(`- ${path.relative(ROOT, C4_MODEL)} (C3 + C4 sections updated)`);
}

main();
