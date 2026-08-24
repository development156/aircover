# Handoffs

One file per role per day, written by `/handoff` and read by `/kickoff`.

    <role>-<YYYY-MM-DD>.md      role is: advisor | design | research

This is the durable channel between the three roles. Live messaging between
sessions exists — `ListAgents` and `SendMessage` reach peer sessions on the
same account — but it dies with the session. **If it is not in git, it did not
happen.**

The required sections are listed in `.claude/commands/handoff.md`. Two of them
are where the value hides and both are easy to skip: **shared surfaces
touched**, and **every guard written with the mutation that proved it**.

---

**Why this lives under `docs/` and not `ops/state/`.** `.gitignore:51` is
`*.md`, and the only negations are `!/docs/**/*.md`, `!/.claude/**/*.md` and a
short named list. A handoff written to `ops/state/handoffs/` is **silently
ignored** — `git status --ignored` reports it `!!` and a plain `git add` takes
nothing. Measured 24 August 2026, before the first handoff was ever written.
