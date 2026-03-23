#!/bin/bash
# Auto-formats files after Claude edits them using Prettier
# Runs as PostToolUse hook on Edit|Write|MultiEdit

set -euo pipefail

FILE_PATH=$(jq -r '.tool_input.file_path // ""' 2>/dev/null || echo "")

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Only format TypeScript, JavaScript, JSON, CSS, and HTML files
if ! echo "$FILE_PATH" | grep -qE '\.(ts|tsx|js|jsx|json|css|scss|html)$'; then
  exit 0
fi

# Skip files outside the project
if [[ "$FILE_PATH" != *"qs-pro"* ]]; then
  exit 0
fi

# Skip node_modules, dist, build directories
if echo "$FILE_PATH" | grep -qE '(node_modules|dist|build|\.next)/'; then
  exit 0
fi

# Run Prettier on the file (suppress errors - formatting is best-effort)
npx prettier --write "$FILE_PATH" > /dev/null 2>&1 || true

exit 0
