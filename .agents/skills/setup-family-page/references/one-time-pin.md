# One-time PIN login

OTP lets an approved user sign in with a single-use code sent by email. It needs no Google account configuration. Explain this option before Google login, and have the user choose the exact allowed addresses.

Cloudflare's [One-time PIN instructions](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) describe enabling the login method. The setup script creates or updates an `onetimepin` provider and an email Allow policy; see the main skill for the setup procedure.

## Credentials and execution

Use [management-auth.md](management-auth.md) for management login and token input. Google variables are unnecessary.

The agent executes the reviewed command with `--auth otp` and checks non-secret results. The interactive wrapper reads credentials and applies the configuration in the same process; no environment transfer to the agent is needed.

## Browser verification

After HTTP verification succeeds, the user checks in a private browser window that:

- an allowed email receives a code and can open the page;
- an address outside the policy does not gain access;
- direct document and asset URLs also require Access.

Cloudflare sends codes only to allowed addresses, but displays an email-sent message even when the address is not allowed. Do not ask an outside-policy user to enter a code they will not receive. Check that the site stays inaccessible, and independently inspect the complete allow policy against the agreed addresses. Non-delivery alone does not prove correct authorization. Keep login codes and session tokens out of chat.
