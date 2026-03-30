/**
 * c4-lib.mjs — Portable C4 model builder (pure Node.js, no npm deps).
 * Shared by c4-generate.mjs and c4-check.mjs.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Source root detection
// ---------------------------------------------------------------------------

export function detectSourceRoot(projectRoot) {
  // 1. Try tsconfig.json
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    try {
      const raw = fs.readFileSync(tsconfigPath, "utf8");
      // Strip single-line comments for lenient JSON parse
      const stripped = raw.replace(/\/\/.*$/gm, "");
      const tsconfig = JSON.parse(stripped);
      const rootDir = tsconfig?.compilerOptions?.rootDir;
      if (rootDir) {
        const candidate = path.resolve(projectRoot, rootDir);
        if (fs.existsSync(candidate)) return candidate;
      }
      const includes = tsconfig?.include;
      if (Array.isArray(includes) && includes.length > 0) {
        // Strip glob suffixes like /**/*
        const first = includes[0].replace(/\/\*.*$/, "");
        const candidate = path.resolve(projectRoot, first);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {
      // Fall through to probing
    }
  }

  // 2. Probe common directories
  for (const probe of ["app/src", "src", "lib"]) {
    const candidate = path.join(projectRoot, probe);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 3. Fall back to project root
  const fallback = projectRoot;

  // 4. Verify .ts files exist somewhere
  if (!hasFilesWithExtension(fallback, ".ts")) {
    for (const [ext, lang] of [[".py", "Python"], [".go", "Go"], [".rs", "Rust"], [".java", "Java"]]) {
      if (hasFilesWithExtension(fallback, ext)) {
        throw new Error(`C4 generation does not yet support ${lang} projects`);
      }
    }
    throw new Error("No TypeScript source files found");
  }

  return fallback;
}

function hasFilesWithExtension(dir, ext) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (hasFilesWithExtension(full, ext)) return true;
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        return true;
      }
    }
  } catch {
    // Directory not readable
  }
  return false;
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
    out.push(full);
  }
}

// ---------------------------------------------------------------------------
// Import parsing & resolution
// ---------------------------------------------------------------------------

function parseImports(text) {
  const specs = [];
  const importRe = /import\s+[^"']*?["']([^"']+)["']/g;
  const dynamicRe = /import\(\s*["']([^"']+)["']\s*\)/g;
  const requireRe = /require\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = importRe.exec(text)) !== null) specs.push(match[1]);
  while ((match = dynamicRe.exec(text)) !== null) specs.push(match[1]);
  while ((match = requireRe.exec(text)) !== null) specs.push(match[1]);
  return specs;
}

function resolveImport(fromFile, spec, srcRoot) {
  if (!spec.startsWith(".")) return null;
  const stripped = spec.replace(/\.js$/, "");
  const base = path.resolve(path.dirname(fromFile), stripped);
  const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Model building
// ---------------------------------------------------------------------------

function relToSrc(absPath, srcRoot) {
  return path.relative(srcRoot, absPath).split(path.sep).join("/");
}

function componentIdForRel(rel) {
  const [first] = rel.split("/");
  if (!first || !rel.includes("/")) return "app";
  return first;
}

export function buildModel(srcRoot) {
  const files = [];
  walk(srcRoot, files);

  const componentFiles = new Map();
  const dependencies = new Map();
  const fileDeps = [];

  for (const absFile of files) {
    const fromRel = relToSrc(absFile, srcRoot);
    const fromComp = componentIdForRel(fromRel);

    if (!componentFiles.has(fromComp)) componentFiles.set(fromComp, new Set());
    componentFiles.get(fromComp).add(fromRel);

    if (!dependencies.has(fromComp)) dependencies.set(fromComp, new Set());

    const text = fs.readFileSync(absFile, "utf8");
    const specs = parseImports(text);
    for (const spec of specs) {
      const resolved = resolveImport(absFile, spec, srcRoot);
      if (!resolved) continue;
      const toRel = relToSrc(resolved, srcRoot);
      const toComp = componentIdForRel(toRel);
      fileDeps.push({ from: fromRel, to: toRel });
      if (toComp !== fromComp) dependencies.get(fromComp).add(toComp);
    }
  }

  const components = [...componentFiles.keys()]
    .sort()
    .map((id) => ({
      id,
      name: id === "app" ? "app-entry" : id,
      kind: "generated",
      files: [...(componentFiles.get(id) || [])].sort(),
      depends_on: [...(dependencies.get(id) || [])].sort(),
    }));

  return {
    generator_version: "1",
    source_root: path.relative(process.cwd(), srcRoot).split(path.sep).join("/") || ".",
    components,
    fileDeps,
  };
}

// ---------------------------------------------------------------------------
// Mermaid generation
// ---------------------------------------------------------------------------

export function toC3Mermaid(model) {
  const lines = ["flowchart LR"];
  for (const component of model.components) {
    lines.push(`  ${component.id}["${component.name}"]`);
  }
  for (const component of model.components) {
    for (const to of component.depends_on) {
      lines.push(`  ${component.id} --> ${to}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function fileNodeId(relPath) {
  return relPath.replace(/[/.\\-]/g, "_").replace(/\.ts$/, "");
}

function fileLabel(relPath) {
  return path.basename(relPath, ".ts");
}

export function toC4Mermaid(model) {
  const sections = [];

  for (const component of model.components) {
    const lines = ["flowchart LR"];
    const fileSet = new Set(component.files);

    for (const file of component.files) {
      lines.push(`  ${fileNodeId(file)}["${fileLabel(file)}"]`);
    }

    const externalNodes = new Set();
    const edges = new Set();

    for (const dep of model.fileDeps) {
      if (!fileSet.has(dep.from)) continue;
      const edgeKey = `${dep.from}|${dep.to}`;
      if (edges.has(edgeKey)) continue;
      edges.add(edgeKey);

      if (fileSet.has(dep.to)) {
        lines.push(`  ${fileNodeId(dep.from)} --> ${fileNodeId(dep.to)}`);
      } else {
        const toCompId = componentIdForRel(dep.to);
        const toComp = toCompId === "app" ? "app-entry" : toCompId;
        const extId = fileNodeId(dep.to);
        if (!externalNodes.has(dep.to)) {
          externalNodes.add(dep.to);
          lines.push(`  ${extId}["${toComp}/${fileLabel(dep.to)}"]:::ext`);
        }
        lines.push(`  ${fileNodeId(dep.from)} -.-> ${extId}`);
      }
    }

    if (externalNodes.size > 0) {
      lines.push(`  classDef ext fill:#f0f0f0,stroke:#999,stroke-dasharray:5 5`);
    }

    lines.push("");
    sections.push(`### ${component.name}\n\n\`\`\`mermaid\n${lines.join("\n")}\n\`\`\``);
  }

  return sections.join("\n\n");
}

export function toJson(model) {
  return `${JSON.stringify(model, null, 2)}\n`;
}
