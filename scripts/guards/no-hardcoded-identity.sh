#!/usr/bin/env bash
# Block commits that hardcode the agency name, agent email, or fixed identity
# strings. Use getAgencyConfig() from src/lib/utils/agency-config.ts instead.
#
# Suppress per-line with a trailing `// HARDCODED-OK: <reason>` comment when
# the literal really is correct (rare — typically only in agency-config.ts
# itself, in seed scripts, or in env-var fallbacks).

set -e

# Only check staged TS/TSX files. Untracked files and existing-but-unstaged
# changes are ignored — this is a commit guard, not a workspace linter.
files=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx|js|jsx)$' || true)

if [ -z "$files" ]; then
  exit 0
fi

# Allowlist:
#   - agency-config.ts is the source of truth for these strings
#   - test files can use literal fixtures
#   - lines containing process.env.X ?? are env fallbacks (legitimate defaults)
#   - lines containing `HARDCODED-OK` are explicit opt-outs
PATTERN='"Saunders & Co"|"Saunders and Co"|"Jasper Bailey"|jasperdouglasbailey@gmail\.com|@saundersandco\.com\.au'

violations=$(grep -nHE "$PATTERN" $files 2>/dev/null \
  | grep -vE 'agency-config\.ts|\.test\.(ts|tsx|js|jsx)|process\.env\.|HARDCODED-OK|^\s*\*|^\s*//|^\s*/\*' \
  || true)

if [ -n "$violations" ]; then
  echo ""
  echo "ERROR: hardcoded agency identity in staged files."
  echo "Use getAgencyConfig() from src/lib/utils/agency-config.ts instead."
  echo "If the literal is really correct, append: // HARDCODED-OK: <reason>"
  echo ""
  echo "$violations"
  echo ""
  exit 1
fi

exit 0
