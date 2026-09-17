# Google login

The user chooses Google login and the allowed email addresses. The agent prepares the steps and commands; the user operates Google Cloud Console and enters credentials. Do not ask the user to send credential values, screenshots containing them, or Console access to the agent.

## Prepare the OAuth client

The agent should explain these operations using Cloudflare's [Google identity provider integration](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/). The user performs them:

1. Create or select a Google Cloud project for the site.
2. Configure the OAuth consent screen.
3. Create an OAuth 2.0 client with application type **Web application**.
4. Add `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback` as an Authorized redirect URI. Read the actual team domain from Cloudflare Zero Trust; do not guess it.
5. Enter the client ID and client secret through the non-echoing input described in [management-auth.md](management-auth.md).

The interactive wrapper supplies `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` to the setup process. Do not put values in files, command arguments, Git, or chat. No environment transfer to the agent is needed.

## Run and check setup

The agent runs the dry-run with `--auth google` and the selected addresses, reviews its non-secret output, and executes the apply command within the user's authorization. Follow the management reference if the user cannot directly enter credentials into the agent's execution terminal.

After HTTP verification succeeds, the user checks in a private browser window that:

- the Google account whose email is in the policy can open the page;
- an account outside the policy cannot open the page;
- direct document and asset URLs also require Access.

The user reports the outcomes, not OAuth credentials or browser session tokens.
