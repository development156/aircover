#!/usr/bin/env bash
#
# Capture everything about this Claude Code account that git does NOT already
# carry, into a tracked folder, so a different account can rebuild the setup.
#
# ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
# Most of the workflow already travels: .claude/commands (20), .claude/agents
# (26), .claude/skills (22), .githooks, .claude/settings.json and .mcp.json are
# all in git and arrive with a clone.
#
# Three things do not, and were about to be lost on an account switch:
#   * ~/.claude/rules/ecc/**   21 rule files, ZERO copies in the repo
#   * the plugin manifest      including a private marketplace, divas-personal
#   * ~/.claude/settings.json  personal harness settings
#
# ── WHAT IT REFUSES TO COPY ──────────────────────────────────────────────────
# Anything that looks like a credential. .env files are never touched — they are
# not in git by design and must move by hand. The exported settings file is
# stripped of any `env` block before being written, and the result is scanned;
# if a secret-shaped string survives, this script FAILS rather than committing it.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel) || exit 1
OUT="$ROOT/ops/account-transfer"
SRC="$HOME/.claude"

mkdir -p "$OUT/rules" "$OUT/plugins"

echo "  exporting account-scoped assets -> ops/account-transfer/"

# 1 · the ecc rules — the biggest gap
if [ -d "$SRC/rules" ]; then
  rm -rf "$OUT/rules" && mkdir -p "$OUT/rules"
  cp -r "$SRC/rules/." "$OUT/rules/" 2>/dev/null
  echo "    rules            $(find "$OUT/rules" -name '*.md' | wc -l) files"
fi

# 2 · the plugin + marketplace manifest (names only; no tokens live here)
for f in installed_plugins.json known_marketplaces.json; do
  [ -f "$SRC/plugins/$f" ] && cp "$SRC/plugins/$f" "$OUT/plugins/$f" && echo "    plugins/$f"
done

# 3 · personal settings, with any env block REMOVED
if [ -f "$SRC/settings.json" ]; then
  python3 - "$SRC/settings.json" "$OUT/settings.sanitised.json" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
removed = []
for k in ('env', 'apiKeyHelper', 'awsCredentialExport', 'otelHeadersHelper'):
    if k in d:
        d.pop(k); removed.append(k)
json.dump(d, open(dst, 'w'), indent=2)
print(f"    settings.sanitised.json  (removed: {', '.join(removed) or 'nothing'})")
PY
fi

# 4 · an inventory, so the import side can VERIFY rather than assume
python3 - "$OUT" "$ROOT" <<'PY'
import json, os, sys, subprocess
out, root = sys.argv[1], sys.argv[2]
def count(p, pat='*.md'):
    import fnmatch
    n = 0
    for dp, _, fs in os.walk(p):
        n += sum(1 for f in fs if fnmatch.fnmatch(f, pat))
    return n
inv = {
  'exportedAt': subprocess.run(['date','-u','+%Y-%m-%dT%H:%M:%SZ'],capture_output=True,text=True).stdout.strip(),
  'travelsWithGit': {
    'commands': len(os.listdir(os.path.join(root,'.claude/commands'))),
    'agents':   len(os.listdir(os.path.join(root,'.claude/agents'))),
    'skills':   len(os.listdir(os.path.join(root,'.claude/skills'))),
    'githooks': sorted(os.listdir(os.path.join(root,'.githooks'))),
  },
  'exportedHere': {
    'ruleFiles': count(os.path.join(out,'rules')),
    'hasPluginManifest': os.path.exists(os.path.join(out,'plugins/installed_plugins.json')),
    'hasMarketplaces':   os.path.exists(os.path.join(out,'plugins/known_marketplaces.json')),
    'hasSettings':       os.path.exists(os.path.join(out,'settings.sanitised.json')),
  },
  'neverExported': ['apps/web/.env', 'apps/web/.env.local', 'MCP OAuth tokens', 'GitHub bearer token'],
}
json.dump(inv, open(os.path.join(out,'INVENTORY.json'),'w'), indent=2)
print(f"    INVENTORY.json   rules={inv['exportedHere']['ruleFiles']} "
      f"commands={inv['travelsWithGit']['commands']} agents={inv['travelsWithGit']['agents']} "
      f"skills={inv['travelsWithGit']['skills']}")
PY

# 5 · REFUSE to hand over a secret. Scan what we just wrote.
HITS=$(grep -rIlE '(sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY|SUPABASE_SERVICE_ROLE|CLERK_SECRET|postgres(ql)?://[^ "]*:[^ "]*@)' "$OUT" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo
  echo "  REFUSED — a credential-shaped string is present in:" >&2
  echo "$HITS" | sed 's/^/    /' >&2
  echo "  Nothing was committed. Remove it and re-run." >&2
  exit 1
fi

echo "  clean: no credential-shaped strings in the export."

# 6 · REFUSE to report success on a bundle git will not carry.
#
# This repo ignores `*.md` REPO-WIDE (.gitignore line 51, from the 2026-08-05
# untracking). On the first run every one of the 21 rule files was silently
# swallowed: the script printed "rules 21 files", `git add` staged NOTHING, and
# the export would have arrived in the new account empty. A count of files on
# disk is not evidence that anything transfers.
UNTRACKABLE=0
while IFS= read -r f; do
  git check-ignore -q --no-index "$f" 2>/dev/null && UNTRACKABLE=$((UNTRACKABLE+1))
done < <(find "$OUT" -type f)

if [ "$UNTRACKABLE" -gt 0 ]; then
  echo >&2
  echo "  REFUSED — $UNTRACKABLE exported file(s) are IGNORED by .gitignore." >&2
  echo "  They exist on disk and git will not carry them, so the new account" >&2
  echo "  would receive an empty bundle. Add a negation, then re-run:" >&2
  echo >&2
  find "$OUT" -type f -print0 2>/dev/null | while IFS= read -r -d "" f; do
    git check-ignore -v --no-index "$f" 2>/dev/null | head -1 | sed "s|^|    |" >&2
  done | head -5
  exit 1
fi
echo "  carryable: all $(find "$OUT" -type f | wc -l) exported files are trackable by git."
