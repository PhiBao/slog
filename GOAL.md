# GOAL — Slog

**The goal:** Build and submit **Slog** — a daily game for Reddit's Game of the Day Hackathon (redditgameofday2026.devpost.com) — and win Best Daily Game ($15,000).

**One-sentence identity:** *Every day, all of Reddit steers one brave snail through the Undervault — one move each.*

**Hard deadline:** Tuesday, December 8, 2026, 6:00 PM Pacific (2026-12-09 02:00 UTC). Nothing exists after the deadline that wasn't submitted.

**What must be true at the deadline (definition of done):**
1. A live Devvit Web app, uploaded (private — NOT published), running a shared daily floor in a public test subreddit with <200 members, judges can click the demo post and play their move with zero friction.
2. A public repo with meaningful commit history, a submission-quality README, `.env.example`.
3. A ≤60s demo video link (optional but shipped).
4. The Devpost submission form fully completed (Reddit usernames, app page link, demo post link, ported-game question answered "No").
5. Honesty audit: every claim in README true; no mocked behavior presented as real.
6. Bonus paths: Devvit Helper participation in Discord/r/devvit; the official feedback survey submitted with real, actionable SDK feedback logged during the build.

**Checkpoints:**
- Walking skeleton live on a playtest subreddit: **Nov 27 EOD**
- Feature freeze: **Dec 3 EOD** (after this only fixes, polish, docs, video, submission)
- Submission complete (not started on the 8th): **Dec 7 EOD**

**Rules that can disqualify us (full quotes in `~/common/discovery/redditgameofday2026/01-rules-and-competition.md`):** must run on Devvit; do not publish the app; demo post in a public <200-member subreddit; README.md in app root; must be newly created or significantly updated during the window (ours is new); English only.

**Mode:** BUILD. The build package at `~/common/discovery/redditgameofday2026/build/` is the source of truth: BUILD.md → ARCHITECTURE.md → DECISIONS.md → DESIGN.md → TASKS.md. Follow `AGENTS.md` and `FOUNDER.md` completely. One task = one commit, in order, verified before moving on.

**When stuck:** after 3 genuine fix attempts on a failing verify command, stop and report the error, what was tried, and options. Never fake a sponsor/core capability. Never print or commit secrets.
