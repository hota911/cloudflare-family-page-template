#!/usr/bin/env bash
# Read credentials without echoing or saving them, then run Access setup in this process.
# The dry-run validates arguments before any credential prompt; --apply stays explicit.
set +x
set -euo pipefail
cd -- "$(dirname -- "$0")/.."

plan_args=()
apply=false
google=false
help=false
for argument in "$@"; do
  case "$argument" in
    --apply) apply=true ;;
    --help) help=true; plan_args+=("$argument") ;;
    *) plan_args+=("$argument") ;;
  esac
done
# Bash 3.2 treats an empty array as unset under nounset.
node scripts/configure-access.mjs ${plan_args[@]+"${plan_args[@]}"} < /dev/null
if ! "$apply" || "$help"; then exit 0; fi
if [[ ! -t 0 ]]; then
  printf '%s\n' 'Credential input needs a terminal the user can type into. No settings changed.' >&2
  exit 1
fi
terminal_settings=$(stty -g)
trap 'stty "$terminal_settings"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
stty -echo
args=("$@")
for ((index=0; index<$#; index++)); do
  if [[ "${args[index]}" == '--auth' ]]; then
    google=false
    if [[ "${args[index+1]:-}" == 'google' ]]; then google=true; fi
  fi
done

read -r -s -p 'Cloudflare account ID: ' CLOUDFLARE_ACCOUNT_ID
printf '\n'
read -r -s -p 'Access API token (hidden): ' CLOUDFLARE_API_TOKEN
printf '\n'
export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN
if "$google"; then
  read -r -s -p 'Google client ID: ' GOOGLE_CLIENT_ID
  printf '\n'
  read -r -s -p 'Google client secret (hidden): ' GOOGLE_CLIENT_SECRET
  printf '\n'
  export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
fi
stty "$terminal_settings"
trap - EXIT INT TERM
exec node scripts/configure-access.mjs "$@"
