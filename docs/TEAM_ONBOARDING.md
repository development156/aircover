# Fixing bugs with Claude — team guide

This guide is for teammates who don't code. You'll use **Claude Code on the web** to fix bugs in the SAHODA app. Claude does the programming; you point it at the bug and check the result. Nothing gets installed on your computer, and as long as you never press "Merge", nothing you do here can break the live product.

## One-time setup (about 10 minutes)

1. **Get a Claude account with a paid plan.** Go to [claude.ai](https://claude.ai), sign up with your work email, and subscribe to the Pro plan (or ask the team lead if there's a team plan to join).
2. **Get access to our code on GitHub.** GitHub is the website where our code lives, in a project folder called a **repository** — ours is named `sahodalabs`. If you don't have a GitHub account, create one at [github.com](https://github.com). Then ask the dev team to invite your GitHub username to the `sahodalabs` repository.
3. **Connect the two.** Go to [claude.ai/code](https://claude.ai/code), sign in with your Claude account, and follow the prompts to connect GitHub. When it asks which repository, choose `sahodalabs`.

That's it — you never need to download or install anything.

## Fixing a bug, start to finish

### 1. Pick your bug

Bugs are tracked as **issues** — numbered reports you can see at [github.com/development156/sahodalabs/issues](https://github.com/development156/sahodalabs/issues). Only work on an issue that has been assigned to you. Note its number (for example, issue **#12**).

### 2. Tell Claude to fix it

1. Open [claude.ai/code](https://claude.ai/code) and start a new session in the `sahodalabs` repository.
2. Type `/fix 12` (using your issue's number) and press Enter.

Claude will now, on its own: read the bug report, find the cause, write an automatic check that proves the bug exists, fix it, verify the fix, have its work reviewed, and then propose the change as a **pull request** — a bundle of changes waiting for a human to approve. It explains each step in plain language as it goes; you can just watch. If it asks permission for a step, read what it says and approve it if it matches what you asked for.

### 3. Messages that look scary but are normal

- **"…tests skipped"** — expected. Some automatic checks need a database password that cloud sessions deliberately don't have. Those checks skip here and run on the developers' own machines instead.
- **"I can't run the app in this environment"** — also expected. You'll see the fix with your own eyes in the next step instead.

### 4. Look at the preview

When the pull request is ready, Claude gives you its link. On that page, a bot called **Vercel** posts a comment containing a **Preview** link — a private, temporary copy of the app that includes your fix. Open it, go to the screen described in the bug report, and confirm the bug is gone. (The preview can take a few minutes to build — if it says "Building", wait and refresh.)

Some bugs live behind the scenes (scheduled jobs, billing math) and have no screen to check. If that's yours, skip this step — the automatic check Claude wrote is the proof, and the reviewing developer will confirm it.

### 5. What "done" looks like

You're done when all of these are true:

- A pull request exists and mentions your issue number.
- Claude reported that its checks passed before opening it.
- If the bug was visible on a screen: the Vercel preview shows it fixed.
- You've posted the pull request link in the team channel and asked for a review.

**Do not press "Merge".** A developer reviews and merges it — that's the safety net. Once they merge, the fix goes live.

## When you're stuck

| What happened | What to do |
| --- | --- |
| Claude says it can't reproduce the bug | The bug report needs more detail. Add exact click-by-click steps and a screenshot to the issue, then start a fresh session and run `/fix` again. |
| Claude says the fix needs a "schema change" or "shared contract" change | That's the process working, not a failure. Claude stops on purpose and writes down what's needed. Post the pull request link in the team channel and hand it to a developer. |
| The session seems stuck or keeps repeating itself | Tell Claude: "Stop and summarize where you are." If it's still stuck, close the session and post in the team channel. If Claude had already opened the pull request, that work is safe on GitHub; if not, the next session starts fresh — nothing is damaged either way. |
| The preview shows an error, or the bug is still there | Write what you see as a comment on the pull request (screenshots help), and post in the team channel. |
| Anything else confusing | Screenshot it and ask in the team channel. There are no stupid questions here. |

Two things to never do, no matter what: **never merge your own pull request**, and **never edit files directly on GitHub**. Everything else is safe to try.
