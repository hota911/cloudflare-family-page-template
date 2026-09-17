import assert from "node:assert/strict";
import { lstat, readFile, readlink } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

test("the sample HTML contains no known identifier patterns", async () => {
  const html = await readFile(new URL("public/index.html", root), "utf8");

  assert.doesNotMatch(html, /@gmail\.com|apps\.googleusercontent\.com|[0-9a-f]{32}/i);
});

test("Codex and Claude share canonical instructions through relative symlinks", async () => {
  const claudeInstructions = new URL("CLAUDE.md", root);
  const claudeSkill = new URL(".claude/skills/setup-family-page", root);

  assert.equal((await lstat(claudeInstructions)).isSymbolicLink(), true);
  assert.equal(await readlink(claudeInstructions), "AGENTS.md");
  assert.equal((await lstat(claudeSkill)).isSymbolicLink(), true);
  assert.equal(
    await readlink(claudeSkill),
    "../../.agents/skills/setup-family-page",
  );
});

test("the canonical setup skill routes each login method to its reference", async () => {
  const skill = await readFile(
    new URL(".agents/skills/setup-family-page/SKILL.md", root),
    "utf8",
  );

  assert.match(skill, /^---\nname: setup-family-page\n/m);
  assert.match(skill, /references\/google-login\.md/);
  assert.match(skill, /references\/one-time-pin\.md/);
});

test("the management reference used by the skill is included in the template", async () => {
  const reference = await readFile(new URL(".agents/skills/setup-family-page/references/management-auth.md", root), "utf8");
  assert.ok(reference.trim().length > 0);
});
