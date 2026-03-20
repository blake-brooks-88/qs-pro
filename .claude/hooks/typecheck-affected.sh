#!/bin/bash
# Runs TypeScript type-check on the affected workspace after Claude edits a file
# Runs as PostToolUse hook on Edit|Write|MultiEdit

set -euo pipefail

FILE_PATH=$(jq -r '.tool_input.file_path // ""' 2>/dev/null || echo "")

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Only check TypeScript files
if ! echo "$FILE_PATH" | grep -qE '\.tsx?$'; then
  exit 0
fi

# Determine which workspace the file belongs to
WORKSPACE=""
if echo "$FILE_PATH" | grep -q '/apps/api/'; then
  WORKSPACE="api"
elif echo "$FILE_PATH" | grep -q '/apps/web/'; then
  WORKSPACE="@qpp/web"
elif echo "$FILE_PATH" | grep -q '/apps/worker/'; then
  WORKSPACE="worker"
elif echo "$FILE_PATH" | grep -q '/packages/database/'; then
  WORKSPACE="@qpp/database"
elif echo "$FILE_PATH" | grep -q '/packages/shared-types/'; then
  WORKSPACE="@qpp/shared-types"
elif echo "$FILE_PATH" | grep -q '/packages/backend-shared/'; then
  WORKSPACE="@qpp/backend-shared"
elif echo "$FILE_PATH" | grep -q '/packages/schema-inferrer/'; then
  WORKSPACE="@qpp/schema-inferrer"
fi

if [[ -z "$WORKSPACE" ]]; then
  exit 0
fi

# Run tsc --noEmit on the affected workspace
OUTPUT=$(pnpm --filter "$WORKSPACE" exec tsc --noEmit 2>&1) || {
  ERROR_COUNT=$(echo "$OUTPUT" | grep -c "error TS" || true)
  # Show only the first 10 errors to keep output manageable
  ERRORS=$(echo "$OUTPUT" | grep "error TS" | head -10)
  echo "{\"systemMessage\": \"TypeScript check found $ERROR_COUNT error(s) in $WORKSPACE:\\n$ERRORS\"}" | jq -c .
  exit 0
}

exit 0
