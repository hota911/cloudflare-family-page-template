#!/usr/bin/env node

/**
 * Check that unauthenticated requests to selected paths redirect to Access.
 * Run independently after each deployment; exit nonzero if any check fails.
 * This does not verify who can log in. Check allowed and denied users in a browser.
 */

import { pathToFileURL } from "node:url";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function verifyAccess(baseUrl, paths = ["/", "/styles.css"], transport = fetch) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:") throw new Error("Verification URL must use HTTPS.");

  const checks = [];
  for (const path of paths) {
    if (!path.startsWith("/")) throw new Error(`Verification path must start with /: ${path}`);
    const target = new URL(path, base);
    if (target.origin !== base.origin) throw new Error("Verification paths must stay on the requested site.");
    try {
      const response = await transport(target, { redirect: "manual" });
      const location = response.headers.get("location");
      const locationHost = location ? new URL(location, base).hostname : undefined;
      checks.push({
        path,
        ok: REDIRECT_STATUSES.has(response.status) && locationHost?.endsWith(".cloudflareaccess.com") === true,
        status: response.status,
        ...(locationHost ? { locationHost } : {}),
      });
    } catch {
      checks.push({ path, ok: false, error: "request failed" });
    }
  }
  return checks;
}

function parseArguments(argv) {
  let url;
  const paths = [];
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!["--url", "--path"].includes(option)) throw new Error(`Unknown option: ${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}`);
    index += 1;
    if (option === "--url") url = value;
    if (option === "--path") paths.push(value);
  }
  if (!url) throw new Error("Missing required option: --url");
  return { url, paths: paths.length === 0 ? ["/", "/styles.css"] : paths };
}

async function main() {
  const { url, paths } = parseArguments(process.argv.slice(2));
  const checks = await verifyAccess(url, paths);
  console.table(checks);
  if (checks.some((check) => !check.ok)) {
    throw new Error("Access verification failed. Do not replace the sample content.");
  }
  console.log("All checked paths redirect to Cloudflare Access.");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Verification failed.");
    process.exitCode = 1;
  });
}
