#!/usr/bin/env bash
set -euo pipefail

: "${GOTIFY_URL:?Set GOTIFY_URL to your server URL}"
: "${GOTIFY_APP_TOKEN:?Set GOTIFY_APP_TOKEN to an application token}"

base_url="${GOTIFY_URL%/}"

curl --fail-with-body --silent --show-error \
  --request POST "${base_url}/message" \
  --header "X-Gotify-Key: ${GOTIFY_APP_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data-binary @examples/message.json
