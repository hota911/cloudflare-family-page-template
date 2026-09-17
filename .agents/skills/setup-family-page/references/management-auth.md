# Management authentication

Use browser OAuth for deployment and a separate API token for this template's Access script. Do not assume a successful Wrangler login authorizes Access API writes.

## Deployment

Check the installed Wrangler's `login --help` and `login --scopes-list` before selecting options. See [Wrangler authentication](https://developers.cloudflare.com/workers/wrangler/commands/general/#login).

Use the repository's Wrangler, not a global install. For OAuth commands, remove API-token and API-key overrides from the child environment so a read-only Access token does not override OAuth:

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_API_KEY -u CLOUDFLARE_EMAIL -u CF_API_TOKEN -u CF_API_KEY -u CF_EMAIL CLOUDFLARE_AUTH_USE_KEYRING=true npx --no-install wrangler whoami
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_API_KEY -u CLOUDFLARE_EMAIL -u CF_API_TOKEN -u CF_API_KEY -u CF_EMAIL CLOUDFLARE_AUTH_USE_KEYRING=true npx --no-install wrangler login --use-keyring
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_API_KEY -u CLOUDFLARE_EMAIL -u CF_API_TOKEN -u CF_API_KEY -u CF_EMAIL CLOUDFLARE_AUTH_USE_KEYRING=true npm run deploy -- --name <name>
```

Run `whoami` first and inspect the result before deciding whether login is needed; the commands above are alternatives for successive conditions, not an unconditional batch. Reuse valid existing OAuth authentication. An unavailable keyring or a network error is not evidence that login has expired. If new login or a storage change is necessary, explain why before proceeding. Confirm the intended account; if multiple accounts are available, select the intended account through the command environment, without committing its ID. The user approves the browser flow; never read Wrangler's stored credentials or run `wrangler auth token` into tool output.
Check that whoami reports OAuth before deployment. Wrangler also loads project environment files; if it still reports API-token authentication, resolve that source without printing its values before continuing. The excluded legacy names are listed in the [environment variable reference](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/#deprecated-global-variables).

Keyring mode can require OS support on Linux/WSL. The environment override makes an unavailable keyring fail instead of falling back to plaintext. Explain the requirement and obtain authorization before installing OS packages or changing credential storage. Where a local callback cannot work, use `login --device --use-keyring` if supported. Do not silently fall back to plaintext.

## Access automation

Guide the user to create a token limited to the intended account with:

- Workers Scripts: Read
- Access: Apps and Policies Write
- Access: Organizations, Identity Providers, and Groups Write

This script searches Workers and changes Access; it does not need Workers Scripts: Write. Never use a Global API key. Use the [current permission reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) when explaining the dashboard labels.

Prepare all non-secret arguments and run the dry-run before starting credential input. If the reviewed plan is already authorized, proceed without asking for approval again:

```bash
npm run configure-access:interactive -- --worker <name> --email <address> --auth otp --apply
```

The wrapper validates arguments before prompting. The user enters the account ID and token directly into its non-echoing terminal input. Google additionally prompts for the client ID and secret. Values exist only in the child environment for the setup command and are not saved. Never type the values for the user through an agent tool or enable shell tracing.

Before asking the user to create a token, establish where they can enter it. An agent PTY is usable only if the user can actually type into it without sending input through chat. Merely starting a tool with `tty: true` does not provide a user input surface. If a supported user-facing terminal is available, offer to prepare it in this repository with the complete command; the user types secrets directly, never through agent tool calls.

If direct input is unavailable, explain that limitation and ask whether the user wants help opening a local terminal, dashboard instructions they perform themselves, or agent-operated dashboard controls. “Can I do it in this screen?” or “A separate terminal is difficult” is not a choice of dashboard controls. Do not open, inspect, or manipulate dashboard pages until the user explicitly chooses agent-operated controls. Keep browser OAuth login consent separate from permission to operate dashboard settings.

For local terminal input, give the exact repository directory and this single prepared command. It both reads credentials and runs configuration, so no environment inheritance or agent restart is needed. Resume verification from the non-secret result without redeploying. Do not claim that this fallback is fully automated. Reuse an already confirmed account ID when explaining where to find it; otherwise give the current official lookup instructions rather than guessing a dashboard URL structure.

## Existing-site check

Before deploying a new site, inspect the exact Worker name in the confirmed account through an authorized read-only API or CLI operation. Retrieve the installed command's help and current official behavior rather than guessing an endpoint. Do not extract or print an OAuth token to make this check.

A successful lookup is an existing site, even if it has no deployments. Stop and offer a different name or an explicitly reviewed existing-site update. An empty deployment list does not establish that the Worker is absent. Network errors, denied access, and generic HTTP errors are inconclusive; resolve them or report the blocker. Proceed only on a response specifically establishing Worker absence, or a complete Worker listing with no exact match. For a list, include all pages. Record the selected account and result in conversation and keep the deployment targeted to that account. Do not claim that the local Access dry-run performs this check.

## Dashboard configuration

Offer this path when the user prefers not to create a token or automated execution is unavailable, but wait for their choice. Establish whether they want instructions for their own actions or authorize the agent to operate the dashboard. If dashboard access is prohibited, do not open or inspect pages even for verification. Read [Protect one Worker](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-one-worker) and [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/) before giving current UI instructions.

Guide one screen at a time: prepare OTP (or Google), create an Allow policy with the exact email addresses in Zero Trust, then select that existing policy in the Worker's Access settings and protect all traffic. Do not say that the Worker screen creates the policy. Confirm the selected login provider and inspect the resulting application and policies before verification.

Keep subsequent updates on the chosen path. Do not run `configure-access --apply` over dashboard-managed settings without inspecting all existing policies and presenting the proposed migration for approval. The script may stop on foreign policies; matching names alone do not prove that a manual configuration is safe to overwrite.
