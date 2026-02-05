#!/bin/bash
# Injects commenting standards into session context at startup

set -euo pipefail

# Read the standards file
STANDARDS_FILE="$CLAUDE_PROJECT_DIR/agent-os/standards/global/commenting.md"

if [ -f "$STANDARDS_FILE" ]; then
  CONTENT=$(cat "$STANDARDS_FILE")
else
  # Fallback if file not found
  CONTENT="## Commenting Standards
- Write self-documenting code through clear naming
- Comments explain WHY, never WHAT
- No changelog-style comments (e.g., 'Fix for X', 'Added because...')
- No commented-out code (use git history)
- JSDoc only for public APIs consumed externally"
fi

# Output as systemMessage for Claude's context
cat << EOF
{
  "continue": true,
  "systemMessage": "MANDATORY COMMENTING STANDARD (applies to ALL code you write):\n\n$CONTENT\n\nViolations will be blocked. Write self-documenting code."
}
EOF
