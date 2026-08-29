#!/usr/bin/env bash
#
# Rebuild a Claude Code account's personal setup from ops/account-transfer/.
# Run this ONCE in a fresh account, after cloning the repo.
#
# What it restores: the ecc rule files, and your sanitised personal settings.
# What it CANNOT restore, and tells you about instead: MCP authorisations,
# installed plugins, and the .env files. Those are per-account by design.
#
# It never overwrites without saying so, and it backs up anything it replaces.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel) || exit 1
IN="$ROOT/ops/account-transfer"
DEST="$HOME/.claude"

[ -d "$IN" ] || { echo "  no ops/account-transfer/ — nothing to import" >&2; exit 1; }
mkdir -p "$DEST"

STAMP=$(date -u +%Y%m%d-%H%M%S)

# 1 · rules
if [ -d "$IN/rules" ]; then
  if [ -d "$DEST/rules" ]; then
    cp -r "$DEST/rules" "$DEST/rules.backup-$STAMP"
    echo "  existing rules backed up -> ~/.claude/rules.backup-$STAMP"
  fi
  mkdir -p "$DEST/rules"
  cp -r "$IN/rules/." "$DEST/rules/"
  echo "  rules restored: $(find "$DEST/rules" -name '*.md' | wc -l) files"
fi

# 2 · personal settings — MERGED, never clobbered, because the new account may
#     already carry values (theme, model) you set while signing in.
if [ -f "$IN/settings.sanitised.json" ]; then
  python3 - "$IN/settings.sanitised.json" "$DEST/settings.json" <<'PY'
import json, os, sys, shutil, datetime
src, dst = sys.argv[1], sys.argv[2]
incoming = json.load(open(src))
existing = {}
if os.path.exists(dst):
    shutil.copy(dst, dst + '.backup-' + datetime.datetime.utcnow().strftime('%Y%m%d-%H%M%S'))
    try: existing = json.load(open(dst))
    except Exception: existing = {}
merged = {**incoming, **existing}          # anything already set locally WINS
json.dump(merged, open(dst, 'w'), indent=2)
print(f"  settings merged ({len(incoming)} incoming keys; existing values kept where they clashed)")
PY
fi

# 3 · what a script cannot do for you
echo
echo "  STILL MANUAL — nothing above covers these:"
echo
echo "    1. git config core.hooksPath .githooks"
echo "       Without it the QA guard AND karunesh's push block are both OFF."
echo
echo "    2. Restore apps/web/.env and apps/web/.env.local by hand."
echo "       They are not in git and never will be."
echo
echo "    3. Re-authorise MCP servers with /mcp  (GitHub needs a pasted token;"
echo "       Vercel, Supabase, Sentry, Resend are OAuth pop-ups)."
echo
if [ -f "$IN/plugins/installed_plugins.json" ]; then
  echo "    4. Re-install these plugins (they are per-account):"
  python3 - "$IN/plugins/installed_plugins.json" "$IN/plugins/known_marketplaces.json" <<'PY'
import json, sys, os
try:
    p = json.load(open(sys.argv[1]))
    items = p.get('plugins', p)
    names = sorted(items) if isinstance(items, dict) else [str(x) for x in items]
    print('       plugins:', ', '.join(names[:14]) + (' …' if len(names) > 14 else ''))
except Exception as e:
    print('       (could not read plugin list:', e, ')')
try:
    if os.path.exists(sys.argv[2]):
        m = json.load(open(sys.argv[2]))
        print('       marketplaces:', ', '.join(sorted(m)) if isinstance(m, dict) else m)
except Exception:
    pass
PY
fi
echo
echo "  Then prove it:  bash scripts/account-verify.sh"
