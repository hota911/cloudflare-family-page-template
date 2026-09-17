import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const args = ["scripts/configure-access-interactive.sh", "--worker", "family-docs", "--email", "alice@example.com", "--auth", "otp"];

test("missing arguments return the CLI validation error", () => {
  const result = spawnSync("bash", ["scripts/configure-access-interactive.sh"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required option: --worker/);
});

test("interactive wrapper dry-run needs neither credentials nor a terminal", () => {
  const result = spawnSync("bash", args, { encoding: "utf8", env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry-run only/);
  assert.doesNotMatch(result.stdout + result.stderr, /Access API token/);
});

test("interactive apply refuses a pipe before reading credentials or calling the API", () => {
  const result = spawnSync("bash", [...args, "--apply"], { encoding: "utf8", input: "not-a-real-token\n", env: { PATH: process.env.PATH } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs a terminal/);
  assert.doesNotMatch(result.stdout + result.stderr, /not-a-real-token/);
});

test("removed scope option stops before credential input", () => {
  const result = spawnSync("bash", [...args, "--scope", "preview", "--apply"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown option: --scope/);
  assert.doesNotMatch(result.stdout + result.stderr, /Access API token/);
});
