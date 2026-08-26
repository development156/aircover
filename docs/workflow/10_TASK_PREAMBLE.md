# 10 · The task preamble

**There is no preamble to paste any more. Use `/go`.**

```
/go rebuild the wallet top-up panel to the v5 tokens
```

`.claude/commands/go.md` carries all of it: which agent to reach for by name,
which skill to load **before** the work rather than after, what "done" means
here, what nobody may do in any lane, and how to write the report at the end.

The reporting half is also in `CLAUDE.md`, which loads automatically, so a
session that never types `/go` still knows to open with the answer and to end
with what it did **not** do.

## Why it moved

The pasted block was long enough that it trained sessions to skim it, and a
preamble nobody reads is worse than none — it looks like the rules are in force
while the session is working from habit. A command is read fresh, in full, every
time it is invoked.

## What is deliberately NOT in it

The traps. There are too many to carry in every prompt and they are
lane-specific. `05_TRAPS.md` holds them, and `/kickoff` tells the session to
read the ones its task will actually meet.
