#!/usr/bin/env node
const fs = require("node:fs");
const uiPath = "packages/bridge-plugin/src/ui-entry.ts";
const content = fs.readFileSync(uiPath, "utf8");

const match = content.match(/const TIER_1_RULES = `([\s\S]*?)`;/);
if (!match) {
  console.error("FAIL: TIER_1_RULES not found in ui-entry.ts");
  process.exit(1);
}
const rules = match[1];
const words = rules.trim().split(/\s+/).length;
const tokens = Math.ceil(words / 0.75);

console.log(`Tier 1 rules: ${words} words ≈ ${tokens} tokens`);
if (tokens > 160) {
  console.error(`FAIL: Tier 1 rules exceed 160-token budget`);
  process.exit(1);
}
