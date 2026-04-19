#!/usr/bin/env node
const fs = require("node:fs");
const skillPath = "packages/claude-plugin/skills/pluginos-figma/SKILL.md";
const content = fs.readFileSync(skillPath, "utf8");

const forbidden = [/design-superpowers/i, /ds-make/i, /ds-manage/i, /ds-consumer/i];
const markers = /\b(TODO|FIXME|XXX)\b/;

let failed = false;
for (const re of forbidden) {
  if (re.test(content)) {
    console.error(`FAIL: skill references forbidden plugin pattern: ${re}`);
    failed = true;
  }
}
if (markers.test(content)) {
  console.error(`FAIL: skill contains TODO/FIXME/XXX markers`);
  failed = true;
}
if (failed) process.exit(1);
console.log("Skill hygiene OK");
