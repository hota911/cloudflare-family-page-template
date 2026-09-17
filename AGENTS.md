# Repository Instructions

This repository contains a private static family site served by Cloudflare Workers Static Assets and protected by Cloudflare Access.

## Working context

- Use `.agents/skills/setup-family-page` when configuring or verifying deployment.
- Guide setup through conversation and execute authorized steps; do not send the user away to follow README. Explain the site identifier before using the term Worker name.
- Read `docs/design.md` before changing setup behavior. Keep historical implementation plans out of the template.
- Keep the harmless sample in `public/` until HTTP verification and the user's browser checks pass.
- Run `npm test` and `npm run verify -- --url <deployed-url>` before placing private material in `public/`.
- Report setup failures and known limitations; passing unit tests does not establish that Access is configured.
- Keep README focused on what a person needs to use the site, explain OTP before Google, and keep maintenance rationale in the design document.
- In Japanese README text, prefer concise noun endings for descriptions and lists. Use complete sentences where they make an action or condition clearer.
- Generate the general `.gitignore` rules with gitignore.io and add Cloudflare-specific exclusions.

## Security

- Never commit API tokens, OAuth secrets, Cloudflare account IDs, personal email addresses, or private family documents.
- Use browser OAuth for deployment and a separate, account-scoped token for Access automation. The interactive setup command reads credentials without echo and passes them to its child process; no cross-terminal environment transfer is needed. Do not inspect, print, or ask for credential values in chat.
- Dry-run is the default. Present concrete changes and obtain authorization only for actions not already authorized in the current session. Authorization for a reviewed create/configure/deploy/verify plan covers those steps; do not ask again at each command or Save/Apply button. Respect tool permission prompts and ask again if the target, scope, or impact changes. Git pushes and repository publication remain separate actions.
- Before a new deployment, verify that the exact site name is absent in the selected account. A local dry-run, an empty deployment list, or a generic request failure does not establish absence; require a Worker-specific not-found response or a complete Worker listing without an exact match. Stop on uncertain results; never overwrite an existing site as part of new-site setup.
- Keep the user's chosen interaction method. Difficulty entering credentials is not permission to switch to dashboard control. Ask whether the user wants terminal input assistance, dashboard instructions, or agent-operated dashboard controls before changing methods; a prohibition on Cloudflare page operations also applies to inspection through browser tools.
- Keep this repository private unless a full file and Git-history review finds no private identifiers and the user explicitly approves publication.

## Compatibility

- Support Node.js 22 or later on macOS, Linux, and WSL.
- Maintain `.agents/skills/setup-family-page` as the shared skill. Preserve the Claude symlink instead of duplicating its content.
