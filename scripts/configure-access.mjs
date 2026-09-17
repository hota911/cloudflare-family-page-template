#!/usr/bin/env node

/**
 * Configure the login provider and email allow policy for a static family page.
 * Without --apply, print a plan without calling Cloudflare or requiring secrets.
 * With --apply, configure Access for an already deployed Worker.
 * Deployment is separate so rerunning setup never publishes local content.
 * Use verify.mjs and browser login checks to verify access after configuration.
 */

import { pathToFileURL } from "node:url";

const API_ROOT = "https://api.cloudflare.com/client/v4";
const VALID_AUTH = new Set(["google", "otp"]);

export function parseArguments(argv) {
  const raw = parseRawArguments(argv);
  return validateInput(raw);
}

export function buildPlan(input) {
  return [
    { action: "find-worker", detail: `Find the deployed Worker ${input.worker}.` },
    { action: "configure-idp", detail: `Configure the ${input.auth === "google" ? "Google" : "One-time PIN"} login method.` },
    { action: "configure-application", detail: "Protect production and preview deployments." },
    { action: "configure-policy", detail: `Allow ${input.emails.length} explicit email address(es).` },
    { action: "verify", detail: "Verify redirects before replacing the sample." },
  ];
}

export async function reconcileAccess(input, environment, transport = fetch) {
  const accountId = requireEnvironment(environment, "CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requireEnvironment(environment, "CLOUDFLARE_API_TOKEN");
  const request = createCloudflareRequest(accountId, apiToken, transport);

  const idpName = `${input.worker} ${input.auth === "google" ? "Google" : "One-time PIN"}`;
  const idpBody = identityProviderBody(input.auth, idpName, environment);

  // Search also returns partial name matches; Access needs the ID, not script_name.
  // https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/search/
  const workers = await listResources(request, `/workers/scripts-search?name=${encodeURIComponent(input.worker)}`);
  const worker = findResource(workers, (resource) => resource.script_name === input.worker, "Workers");
  if (!worker) throw new Error("Worker not found. Deploy the harmless sample with the selected Worker name first.");

  // Complete conflict checks before changing any account resource.
  const idps = await listResources(request, "/access/identity_providers");
  const existingIdp = findResource(
    idps,
    (resource) => resource.name === idpName && resource.type === idpBody.type,
    "identity providers",
  );

  const destination = {
    type: "worker",
    worker_id: worker.id,
  };
  const applicationName = `${input.worker} - Cloudflare Workers`;
  const applications = await listResources(request, "/access/apps");
  // Hostname/path applications take precedence over Worker applications.
  // Without a complete route inventory, require manual review rather than guess overlap.
  // https://developers.cloudflare.com/workers/configuration/cloudflare-access/#understand-access-hierarchy
  for (const application of applications) {
    if (!application.type || application.type === "self_hosted") {
      const destinations = application.destinations;
      if (application.domain || application.self_hosted_domains?.length ||
          !Array.isArray(destinations) || destinations.length === 0 ||
          destinations.some((item) => !["worker", "preview_worker", "all_workers", "all_preview_workers"].includes(item.type))) {
        throw new Error("Hostname/path or unrecognized Access application found; review all public URLs and their policies manually before setup. No resources were changed.");
      }
    }
  }
  const existingApplication = findResource(
    applications,
    (resource) => resource.name === applicationName || resource.destinations?.some(
      (candidate) => candidate.type === destination.type && candidate.worker_id === destination.worker_id,
    ),
    "Access applications",
  );
  if (existingApplication && (
    existingApplication.type !== "self_hosted" ||
    existingApplication.destinations?.length !== 1 ||
    existingApplication.destinations[0].type !== destination.type ||
    existingApplication.destinations[0].worker_id !== destination.worker_id
  )) {
    throw new Error("Existing Access application does not exclusively protect the selected Worker; refusing to replace its destinations.");
  }
  const policyName = `${input.worker} family members`;
  const policies = existingApplication
    ? await listResources(request, `/access/apps/${existingApplication.id}/policies`)
    : [];
  if (policies.some((policy) => policy.name !== policyName)) {
    throw new Error("Additional Access policies found; review them manually before running setup.");
  }
  const existingPolicy = findResource(policies, (resource) => resource.name === policyName, "Access policies");

  const identityProvider = await writeResource(request, "/access/identity_providers", existingIdp, idpBody);
  const applicationBody = {
    name: applicationName,
    type: "self_hosted",
    destinations: [destination],
    allowed_idps: [identityProvider.resource.id],
    auto_redirect_to_identity: true,
    session_duration: "720h",
  };
  const application = await writeResource(request, "/access/apps", existingApplication, applicationBody);
  const policyBody = {
    name: policyName,
    decision: "allow",
    include: input.emails.map((email) => ({ email: { email } })),
  };
  const policyBase = `/access/apps/${application.resource.id}/policies`;
  const policy = await writeResource(request, policyBase, existingPolicy, policyBody);

  return {
    identityProvider: identityProvider.action,
    application: application.action,
    policy: policy.action,
  };
}

function parseRawArguments(argv) {
  const raw = { worker: undefined, emails: [], auth: undefined, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--apply") {
      raw.apply = true;
      continue;
    }
    if (!["--worker", "--email", "--auth"].includes(option)) {
      throw new Error(`Unknown option: ${option}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${option}`);
    }
    index += 1;
    if (option === "--worker") raw.worker = value;
    if (option === "--email") raw.emails.push(value);
    if (option === "--auth") raw.auth = value;
  }
  return raw;
}

function validateInput(raw) {
  if (!raw.worker) throw new Error("Missing required option: --worker");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(raw.worker)) {
    throw new Error("Worker name must use lowercase letters, numbers, and internal hyphens.");
  }
  if (raw.emails.length === 0) throw new Error("Provide at least one --email option.");
  const emails = [...new Set(raw.emails.map((email) => email.toLowerCase()))];
  for (const email of emails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }
  }
  if (!VALID_AUTH.has(raw.auth)) throw new Error("--auth must be google or otp.");
  return { worker: raw.worker, emails, auth: raw.auth, apply: raw.apply };
}

function identityProviderBody(auth, name, environment) {
  if (auth === "otp") return { name, type: "onetimepin", config: {} };
  return {
    name,
    type: "google",
    config: {
      client_id: requireEnvironment(environment, "GOOGLE_CLIENT_ID"),
      client_secret: requireEnvironment(environment, "GOOGLE_CLIENT_SECRET"),
    },
  };
}

function requireEnvironment(environment, name) {
  const value = environment[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createCloudflareRequest(accountId, apiToken, transport) {
  const base = `${API_ROOT}/accounts/${encodeURIComponent(accountId)}`;
  return async (path, method = "GET", body) => {
    const response = await transport(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Cloudflare API returned a non-JSON response with status ${response.status}.`);
    }
    if (!response.ok || payload.success !== true) {
      throw new Error(`Cloudflare API request failed with status ${response.status}.`);
    }
    return payload;
  };
}

async function listResources(request, path) {
  const resources = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await request(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(payload.result)) throw new Error("Cloudflare API returned an invalid resource list.");
    const info = payload.result_info;
    if (info?.page !== undefined && info.page !== page) {
      throw new Error("Cloudflare API returned an unexpected page; refusing to use an incomplete list.");
    }
    resources.push(...payload.result);
    if (info?.total_pages !== undefined) {
      if (page >= info.total_pages) return resources;
    } else if (payload.result.length < 100) {
      return resources;
    } else {
      throw new Error("Cloudflare API omitted pagination metadata for a full page; refusing to mutate.");
    }
  }
}

function findResource(resources, match, resourceName) {
  const matches = resources.filter(match);
  if (matches.length > 1) throw new Error(`Multiple ${resourceName} matched; refusing to mutate.`);
  return matches[0];
}

async function writeResource(request, path, existing, body) {
  const payload = existing
    ? await request(`${path}/${existing.id}`, "PUT", body)
    : await request(path, "POST", body);
  return { action: existing ? "updated" : "created", resource: payload.result };
}

function printHelp() {
  console.log(`Usage: node scripts/configure-access.mjs --worker NAME --email ADDRESS [--email ADDRESS] --auth google|otp [--apply]

Runs as a dry-run unless --apply is present. Secrets are read from environment variables.`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    printHelp();
    return;
  }
  const input = parseArguments(argv);
  const plan = buildPlan(input);
  console.table(plan);
  if (!input.apply) {
    console.log("Dry-run only. Re-run with --apply after reviewing this plan.");
    return;
  }

  const result = await reconcileAccess(input, process.env);
  console.table(result);
  console.log("Access is configured. Run npm run verify -- --url <deployed-url> before replacing public/.");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Setup failed.");
    process.exitCode = 1;
  });
}
