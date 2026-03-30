#!/usr/bin/env node

/**
 * c4-check.mjs — Check whether C4 architecture diagrams are up to date.
 * Portable, self-contained (no npm deps). Run via: node c4-check.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { detectSourceRoot, buildModel, toJson } from "../../c4/scripts/c4-lib.mjs";

const ROOT = process.cwd();
const COMPONENTS_FILE = path.join(ROOT, "docs", "architecture", "generated", "components.json");
const POLICY_FILE = path.join(ROOT, "governance", "architecture-conformance-policy.json");

function main() {
  const srcRoot = detectSourceRoot(ROOT);
  const model = buildModel(srcRoot);
  const freshJson = toJson(model);
  const failures = [];

  // 1. Compare JSON against existing components.json
  if (!fs.existsSync(COMPONENTS_FILE)) {
    failures.push("missing generated architecture model: docs/architecture/generated/components.json");
  } else {
    const existingJson = fs.readFileSync(COMPONENTS_FILE, "utf8");
    if (existingJson !== freshJson) {
      failures.push("C4 model is stale — run /c4 to regenerate");
    }
  }

  // 2. Conformance policy check (if policy file exists)
  if (fs.existsSync(POLICY_FILE)) {
    const policy = JSON.parse(fs.readFileSync(POLICY_FILE, "utf8"));
    const components = new Map();
    for (const component of model.components) {
      components.set(component.id, new Set(component.depends_on || []));
    }

    for (const id of policy.required_components || []) {
      if (!components.has(id)) {
        failures.push(`missing required component: ${id}`);
      }
    }

    for (const rule of policy.forbidden_dependencies || []) {
      const deps = components.get(rule.from);
      if (!deps) {
        failures.push(`forbidden dependency rule references unknown component: ${rule.from}`);
        continue;
      }
      if (deps.has(rule.to)) {
        failures.push(
          `forbidden dependency: ${rule.from} -> ${rule.to}${rule.reason ? ` (${rule.reason})` : ""}`
        );
      }
    }

    for (const rule of policy.required_dependencies || []) {
      const deps = components.get(rule.from);
      if (!deps) {
        failures.push(`required dependency rule references unknown component: ${rule.from}`);
        continue;
      }
      if (!deps.has(rule.to)) {
        failures.push(
          `missing required dependency: ${rule.from} -> ${rule.to}${rule.reason ? ` (${rule.reason})` : ""}`
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error("FAIL: C4 architecture check:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("PASS: C4 architecture diagrams are up to date.");
}

main();
