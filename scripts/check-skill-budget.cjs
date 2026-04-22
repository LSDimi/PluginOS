#!/usr/bin/env node
const fs = require("node:fs");
const skillPath = "packages/claude-plugin/skills/pluginos-figma/SKILL.md";
const content = fs.readFileSync(skillPath, "utf8");
const words = content.trim().split(/\s+/).length;
const estimatedTokens = Math.ceil(words / 0.75);

console.log(`SKILL.md: ${words} words ≈ ${estimatedTokens} tokens`);
if (estimatedTokens > 1150) {
  console.error(`FAIL: skill exceeds 1150-token budget`);
  process.exit(1);
}
if (estimatedTokens > 1000) {
  console.warn(`WARN: skill is close to budget (${estimatedTokens}/1150)`);
}
