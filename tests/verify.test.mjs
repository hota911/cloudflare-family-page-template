import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyAccess } from "../scripts/verify.mjs";

test("rejects paths that resolve to a different site before requesting them", async () => {
  await assert.rejects(
    verifyAccess("https://family-docs.example.workers.dev", ["//other.example/styles.css"], () => {
      assert.fail("Must not request another site");
    }),
    /must stay on the requested site/,
  );
  await assert.rejects(
    verifyAccess("https://family-docs.example.workers.dev", ["/\\other.example/styles.css"], () => {
      assert.fail("Must not request another site");
    }),
    /must stay on the requested site/,
  );
});

test("accepts Cloudflare Access redirects for every requested asset", async () => {
  const statuses = [302, 307];
  const checks = await verifyAccess(
    "https://family-docs.example.workers.dev",
    ["/", "/styles.css"],
    async () => new Response(null, {
      status: statuses.shift(),
      headers: { location: "https://team.cloudflareaccess.com/cdn-cgi/access/login" },
    }),
  );

  assert.deepEqual(checks, [
    { path: "/", ok: true, status: 302, locationHost: "team.cloudflareaccess.com" },
    { path: "/styles.css", ok: true, status: 307, locationHost: "team.cloudflareaccess.com" },
  ]);
});
test("rejects public responses, missing locations, and unrelated redirect hosts", async () => {
  const responses = [
    new Response("public", { status: 200 }),
    new Response(null, { status: 302 }),
    new Response(null, { status: 302, headers: { location: "https://example.com/login" } }),
  ];

  const checks = await verifyAccess(
    "https://family-docs.example.workers.dev",
    ["/", "/styles.css", "/private/report.html"],
    async () => responses.shift(),
  );

  assert.deepEqual(checks.map((check) => check.ok), [false, false, false]);
});

test("records network failures without skipping later paths", async () => {
  let calls = 0;
  const checks = await verifyAccess(
    "https://family-docs.example.workers.dev",
    ["/", "/styles.css"],
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("connection refused");
      return new Response(null, {
        status: 302,
        headers: { location: "https://team.cloudflareaccess.com/cdn-cgi/access/login" },
      });
    },
  );

  assert.deepEqual(checks, [
    { path: "/", ok: false, error: "request failed" },
    { path: "/styles.css", ok: true, status: 302, locationHost: "team.cloudflareaccess.com" },
  ]);
});
