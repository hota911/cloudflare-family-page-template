---
name: setup-family-page
description: Set up, resume, update, and verify this private family site through a conversation, executing authorized deployment and Cloudflare Access configuration.
---

# Setup Family Page

## Conversation and scope

Execute the setup, not just a list of commands or a referral to README. Ask for missing information at the step that needs it, explain the result, and continue within existing authorization. Use the user's language.

Start with the site's purpose, allowed email addresses, and login method. Explain emailed one-time codes first; Google needs additional preparation. Propose a site identifier based on the purpose rather than asking an unexplained “Worker name”. Explain that it identifies the site in Cloudflare, forms part of its URL, and is separate from the displayed page title. Use lowercase letters, numbers, and internal hyphens; confirm the proposal before deployment.

Determine whether the request is a new site, a resumed setup, an Access update, a content update, or verification only. Use existing conversation and configuration before asking again. Keep the selected account, site name and actual deployed URL in conversation; do not write personal identifiers into tracked files. Always protect both production and preview deployments.

Read `docs/design.md` before changing setup behavior. Setup does not authorize Git pushes, PRs, repository publication, or uploading private material. Do not bundle those actions with an ordinary site update.

Keep the approved target, allowed addresses, scope, execution method and actions in conversation. Once the user approves the concrete plan, continue its steps without repeated conversational approval requests for each command or Save/Apply button. Ask again only for a changed target, expanded impact, a change of execution method, or a genuinely missing decision. Environment/tool approval prompts still apply; do not bypass them. If the user stops Cloudflare operations, stop browser inspection and mutation as well as related commands; do not clean up or roll back without authorization.
If the prohibition is specifically limited to dashboard page operations, stop browser tools; previously authorized HTTP/API verification may continue. Do not use another tool to carry out a change the user has asked to stop. If the scope of the stop instruction is unclear, pause related external work and clarify.

## Preparation and management authentication

Check Node.js 22 or later and npm, run `npm ci` if dependencies are absent, and run `npm test`. Do not install host-wide tools without authorization.

Read [management-auth.md](references/management-auth.md). Distinguish authentication for managing Cloudflare from how family members log in. Guide account and Zero Trust setup one action at a time, checking current official instructions before giving dashboard paths. Execute available commands; the user handles account login, consent and secret input.

Use [one-time-pin.md](references/one-time-pin.md) or [google-login.md](references/google-login.md) for the selected login method. Never ask for secrets, login codes or session tokens in chat, inspect their values, or print the process environment.

## Plan, execute and resume

1. Run `npm run configure-access -- --worker <name> --email <address> --auth otp` as a dry-run. For Google use `--auth google`; repeat `--email` for each allowed address. Show the selected site name, account, allowed addresses, login method, and that both production and previews will be protected. The dry-run validates local arguments only, not credentials or remote state.
2. For a new site, follow the management reference's existing-site check in the selected account before any deployment. Confirm absence of the exact name; on a match or an uncertain result, stop rather than overwrite. Inspect `public/` for harmless sample content. Present the concrete create/configure/deploy/verify plan and use existing authorization; ask only for actions not already authorized. Then deploy through the OAuth command in the management reference and retain the actual output URL. For an existing site, inspect its current configuration and skip sample deployment. Never overwrite it simply to resume setup.
3. For automated Access configuration, execute the reviewed command using `npm run configure-access:interactive -- <reviewed arguments> --apply` in a terminal where the user can directly enter credentials without echo. If credentials are already securely available to the execution process, use `npm run configure-access -- <reviewed arguments> --apply`. Follow the management reference when direct user input is unavailable.
4. Read the result before continuing. On failure, report what completed and what remains unknown. Inspect remote state before retrying; do not redeploy, remove conflicting policies, weaken protection, or switch configuration methods to bypass an error. If the user previously configured Access manually, follow the manual-update guidance in the management reference.
5. Verify the actual deployed URL with `npm run verify -- --url <url> --path / --path /styles.css`, including directly reachable HTML, scripts, images and documents and relevant actual preview URLs. Do not guess URLs. Distinguish a network execution failure from a returned unprotected response; use the environment's approved network path before judging the deployment.
6. Inspect the configured application's destinations, allowed login providers and complete policies through the approved execution method. Also inspect higher-priority hostname/path applications for every public URL (workers.dev, previews, custom domains and routes), including individual document paths. Their policies can override Worker protection. The setup script conservatively stops if any hostname/path application exists in the account, even for unrelated sites, because it does not resolve route overlap. Do not delete existing applications or bypass this check to make setup succeed; offer manual configuration and verification instead. Browser inspection also needs permission to use the dashboard; API setup does not imply it. Compare the exact allowed addresses with the agreed list. Do not print secrets or infer the allowlist from HTTP redirects. If inspection is unavailable, explain what remains unverified and ask how the user wants to proceed, without switching methods on their behalf.
7. Guide private-browser checks using the selected login reference. Ask for separate outcomes for the allowed address and the outside-policy check. Wait before declaring completion; code delivery failure alone is not evidence that the policy is correct.
8. Report the site URL, protection scope, completed checks and anything unverified.

For an authorized content update, inspect the files and confirm the target site, verify existing protection before uploading private material, deploy to that same site, and repeat HTTP and browser verification including the new paths. For an allowlist update, show the complete desired list because it replaces the existing list; skip deployment. For verification only, make no configuration changes.
