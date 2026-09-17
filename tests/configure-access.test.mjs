import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPlan,
  parseArguments,
  reconcileAccess,
} from "../scripts/configure-access.mjs";

const input = {
  worker: "family-docs",
  emails: ["alice@example.com", "bob@example.com"],
  auth: "google",
  apply: true,
};

test("parses a Google setup with repeated normalized emails", () => {
  assert.deepEqual(
    parseArguments([
      "--worker",
      "family-docs",
      "--email",
      "Alice@Example.com",
      "--email",
      "bob@example.com",
      "--auth",
      "google",
      "--apply",
    ]),
    input,
  );
});

test("parses OTP setup without applying changes", () => {
  assert.deepEqual(
    parseArguments([
      "--worker",
      "family-preview",
      "--email",
      "reader@example.com",
      "--auth",
      "otp",
    ]),
    {
      worker: "family-preview",
      emails: ["reader@example.com"],
      auth: "otp",
      apply: false,
    },
  );
});

test("rejects unknown arguments and malformed email addresses", () => {
  assert.throws(() => parseArguments(["--wat"]), /Unknown option: --wat/);
  assert.throws(
    () =>
      parseArguments([
        "--worker",
        "family-docs",
        "--email",
        "not-an-email",
        "--auth",
        "otp",
      ]),
    /Invalid email address/,
  );
});

test("builds a dry-run plan without environment secrets", () => {
  const plan = buildPlan({ ...input, apply: false });
  const rendered = JSON.stringify(plan);

  assert.deepEqual(
    plan.map((step) => step.action),
    ["find-worker", "configure-idp", "configure-application", "configure-policy", "verify"],
  );
  assert.doesNotMatch(rendered, /token|client_secret|api key/i);
});

test("creates missing Google, Worker application, and email policy resources", async () => {
  const requests = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([]),
    apiResponse([]),
    apiResponse({ id: "idp-created" }),
    apiResponse({ id: "app-created" }),
    apiResponse({ id: "policy-created" }),
  ];
  const transport = async (url, options = {}) => {
    requests.push({ url, ...options });
    return responses.shift();
  };

  const result = await reconcileAccess(input, environment(), transport);

  assert.deepEqual(result, {
    identityProvider: "created",
    application: "created",
    policy: "created",
  });
  assert.deepEqual(requests.map((request) => request.method ?? "GET"), [
    "GET",
    "GET",
    "GET",
    "POST",
    "POST",
    "POST",
  ]);
  assert.deepEqual(JSON.parse(requests[4].body).destinations, [
    { type: "worker", worker_id: "worker-id" },
  ]);
  assert.deepEqual(JSON.parse(requests[5].body).include, [
    { email: { email: "alice@example.com" } },
    { email: { email: "bob@example.com" } },
  ]);
});

test("updates resources resolved by stable identifiers", async () => {
  const requests = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([{ id: "idp-1", name: "family-docs Google", type: "google" }]),
    apiResponse([
      {
        id: "app-1",
        name: "family-docs - Cloudflare Workers",
        type: "self_hosted",
        destinations: [{ type: "worker", worker_id: "worker-id" }],
      },
    ]),
    apiResponse([{ id: "policy-1", name: "family-docs family members" }]),
    apiResponse({ id: "idp-1" }),
    apiResponse({ id: "app-1" }),
    apiResponse({ id: "policy-1" }),
  ];
  const transport = async (url, options = {}) => {
    requests.push({ url, ...options });
    return responses.shift();
  };

  const result = await reconcileAccess(input, environment(), transport);

  assert.deepEqual(result, {
    identityProvider: "updated",
    application: "updated",
    policy: "updated",
  });
  assert.deepEqual(requests.map((request) => request.method ?? "GET"), [
    "GET",
    "GET",
    "GET",
    "GET",
    "PUT",
    "PUT",
    "PUT",
  ]);
  assert.match(requests[4].url, /identity_providers\/idp-1$/);
  assert.match(requests[5].url, /access\/apps\/app-1$/);
  assert.match(requests[6].url, /access\/apps\/app-1\/policies\/policy-1$/);
});

test("fails before mutation when a stable identifier is duplicated", async () => {
  const duplicateIdps = [
    { id: "idp-1", name: "family-docs Google", type: "google" },
    { id: "idp-2", name: "family-docs Google", type: "google" },
  ];
  let calls = 0;
  const responses = [apiResponse([{ id: "worker-id", script_name: "family-docs" }]), apiResponse(duplicateIdps)];

  await assert.rejects(
    reconcileAccess(input, environment(), async () => {
      calls += 1;
      return responses.shift();
    }),
    /Multiple identity providers matched/,
  );
  assert.equal(calls, 2);
});

test("reports Cloudflare API failures without exposing the token", async () => {
  await assert.rejects(
    reconcileAccess(input, environment(), async () =>
      apiResponse(null, { success: false, status: 403 }),
    ),
    (error) => {
      assert.match(error.message, /Cloudflare API request failed with status 403/);
      assert.doesNotMatch(error.message, /super-secret-token/);
      return true;
    },
  );
});

test("rejects missing Google credentials before any API request", async () => {
  let calls = 0;
  await assert.rejects(reconcileAccess(input, { ...environment(), GOOGLE_CLIENT_SECRET: "" }, async () => {
    calls += 1;
    throw new Error("unexpected request");
  }), /Missing required environment variable: GOOGLE_CLIENT_SECRET/);
  assert.equal(calls, 0);
});

test("requires an exact Worker name before changing Access", async () => {
  const requests = [];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    requests.push(options.method);
    return apiResponse([{ id: "other-worker", script_name: "family-docs-backup" }]);
  }), /Worker not found/);
  assert.deepEqual(requests, ["GET"]);
});

test("rejects duplicate exact Worker matches before changing Access", async () => {
  const requests = [];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    requests.push(options.method);
    return apiResponse([
      { id: "worker-1", script_name: "family-docs" },
      { id: "worker-2", script_name: "family-docs" },
    ]);
  }), /Multiple Workers matched/);
  assert.deepEqual(requests, ["GET"]);
});

test("resolves a Worker on a later search page and protects production and previews", async () => {
  const requests = [];
  const responses = [
    apiResponse([{ id: "other-worker", script_name: "family-docs-backup" }], { resultInfo: { page: 1, total_pages: 2 } }),
    apiResponse([{ id: "worker-id", script_name: "family-docs" }], { resultInfo: { page: 2, total_pages: 2 } }),
    apiResponse([]),
    apiResponse([]),
    apiResponse({ id: "idp-created" }),
    apiResponse({ id: "app-created" }),
    apiResponse({ id: "policy-created" }),
  ];
  await reconcileAccess({ ...input, auth: "otp" }, {
    CLOUDFLARE_ACCOUNT_ID: "account-id", CLOUDFLARE_API_TOKEN: "token",
  }, async (url, options) => {
    requests.push({ url, ...options });
    return responses.shift();
  });
  assert.match(requests[0].url, /scripts-search\?name=family-docs&per_page=100&page=1$/);
  assert.match(requests[1].url, /page=2$/);
  assert.deepEqual(JSON.parse(requests[5].body).destinations, [{ type: "worker", worker_id: "worker-id" }]);
});

test("refuses an additional Allow policy before updating any resource", async () => {
  const methods = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([{ id: "idp-1", name: "family-docs Google", type: "google" }]),
    apiResponse([{ id: "app-1", type: "self_hosted", name: "renamed", destinations: [{ type: "worker", worker_id: "worker-id" }] }]),
    apiResponse([{ id: "policy-1", name: "Other readers", decision: "allow" }]),
  ];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    methods.push(options.method);
    return responses.shift();
  }), /Additional Access policies/);
  assert.deepEqual(methods, ["GET", "GET", "GET", "GET"]);
});

test("finds an additional Bypass policy on a later page before any mutation", async () => {
  const requests = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([]),
    apiResponse([], { resultInfo: { page: 1, total_pages: 2 } }),
    apiResponse([{ id: "app-1", type: "self_hosted", name: "family-docs - Cloudflare Workers", destinations: [{ type: "worker", worker_id: "worker-id" }] }], { resultInfo: { page: 2, total_pages: 2 } }),
    apiResponse([{ id: "policy-1", name: "family-docs family members", decision: "allow" }], { resultInfo: { page: 1, total_pages: 2 } }),
    apiResponse([{ id: "policy-2", name: "Public bypass", decision: "bypass" }], { resultInfo: { page: 2, total_pages: 2 } }),
  ];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    requests.push({ url, ...options });
    return responses.shift();
  }), /Additional Access policies/);
  assert.deepEqual(requests.map((request) => request.method), ["GET", "GET", "GET", "GET", "GET", "GET"]);
  assert.match(requests[3].url, /access\/apps\?per_page=100&page=2$/);
  assert.match(requests[5].url, /policies\?per_page=100&page=2$/);
});

test("rejects an unpageable full search result without making changes", async () => {
  const methods = [];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    methods.push(options.method);
    return apiResponse(Array(100).fill({ id: "partial", script_name: "family-docs-backup" }));
  }), /omitted pagination metadata/);
  assert.deepEqual(methods, ["GET"]);
});

test("refuses a same-name application belonging to another Worker without mutation", async () => {
  const methods = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([]),
    apiResponse([{ id: "app-other", type: "self_hosted", name: "family-docs - Cloudflare Workers", destinations: [{ type: "worker", worker_id: "other-worker" }] }]),
  ];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    methods.push(options.method);
    return responses.shift();
  }), /does not exclusively protect/);
  assert.deepEqual(methods, ["GET", "GET", "GET"]);
});

test("refuses to remove other destinations from an existing Worker application", async () => {
  const methods = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([]),
    apiResponse([{ id: "app-shared", type: "self_hosted", name: "shared", destinations: [
      { type: "worker", worker_id: "worker-id" },
      { type: "worker", worker_id: "other-worker" },
    ] }]),
  ];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    methods.push(options.method);
    return responses.shift();
  }), /does not exclusively protect/);
  assert.deepEqual(methods, ["GET", "GET", "GET"]);
});

test("refuses a higher-priority hostname/path application found on a later page", async () => {
  const methods = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([]),
    apiResponse([], { resultInfo: { page: 1, total_pages: 2 } }),
    apiResponse([{ id: "public-reports", type: "self_hosted", destinations: [{ type: "public", uri: "docs.example.com/reports" }], policies: [{ decision: "bypass" }] }], { resultInfo: { page: 2, total_pages: 2 } }),
  ];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    methods.push(options.method);
    return responses.shift();
  }), /Hostname\/path or unrecognized/);
  assert.deepEqual(methods, ["GET", "GET", "GET", "GET"]);
});

test("refuses a legacy domain application without mutating account resources", async () => {
  const methods = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([]),
    apiResponse([{ id: "legacy", type: "self_hosted", domain: "docs.example.com/reports" }]),
  ];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    methods.push(options.method);
    return responses.shift();
  }), /Hostname\/path or unrecognized/);
  assert.deepEqual(methods, ["GET", "GET", "GET"]);
});

test("refuses an application whose destinations cannot be established", async () => {
  const methods = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([]),
    apiResponse([{ id: "unknown", type: "self_hosted", destinations: [] }]),
  ];
  await assert.rejects(reconcileAccess(input, environment(), async (url, options) => {
    methods.push(options.method);
    return responses.shift();
  }), /Hostname\/path or unrecognized/);
  assert.deepEqual(methods, ["GET", "GET", "GET"]);
});

test("reuses an identity provider on a later page instead of creating another", async () => {
  const requests = [];
  const responses = [
    apiResponse([{ id: "worker-id", script_name: "family-docs" }]),
    apiResponse([], { resultInfo: { page: 1, total_pages: 2 } }),
    apiResponse([{ id: "idp-existing", name: "family-docs Google", type: "google" }], { resultInfo: { page: 2, total_pages: 2 } }),
    apiResponse([]),
    apiResponse({ id: "idp-existing" }),
    apiResponse({ id: "app-created" }),
    apiResponse({ id: "policy-created" }),
  ];
  const result = await reconcileAccess(input, environment(), async (url, options) => {
    requests.push({ url, ...options });
    return responses.shift();
  });
  assert.equal(result.identityProvider, "updated");
  assert.match(requests[2].url, /identity_providers\?per_page=100&page=2$/);
  assert.equal(requests[4].method, "PUT");
  assert.match(requests[4].url, /identity_providers\/idp-existing$/);
});

function environment() {
  return {
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_API_TOKEN: "super-secret-token",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
  };
}

function apiResponse(result, { success = true, status = 200, resultInfo } = {}) {
  return new Response(JSON.stringify({ success, result, result_info: resultInfo, errors: [] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
