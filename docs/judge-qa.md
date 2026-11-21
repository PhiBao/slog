# Judge Q&A — Slog

Short, honest answers. Naming weaknesses builds trust; claiming none does not.

**What is it, in one sentence, and who is it for specifically?**
Every day, all of Reddit steers one brave snail through the Undervault — one move each. It is for the daily-ritual redditor who opens r/hotandcold, r/syllo or r/kraw every morning and argues the answer in the comments.

**What did you build during the hackathon, and what did you reuse?**
Everything game-specific was built Nov 21 – Dec 8, 2026: shared-state engine, deterministic floor generator, move rules, cron, triggers, canvas art, tests, README. I started from Reddit's official Devvit games template (React/Hono/tRPC/Vite/Vitest) and reused its build setup only. No prior game IP, no external game engine, no third-party art, no AI-generated imagery. AI coding agents wrote code and planning docs.

**How does it use Devvit, and why is each integration necessary?**
- Redis is the game: one shared board, one move budget per user (SETNX), optimistic commits, streaks, practice state. Without a shared server-side store the "one hero, a thousand minds" premise is impossible.
- Scheduler creates the new floor and arena post at 12:00 UTC and crawls Slog when idle — the daily loop needs automated content.
- Event triggers self-heal the arena post on install/upgrade and give commenters one live status reply each; they make the comment section functional rather than decorative.
- Reddit identity, posting, comments, flair and snoovatars supply attribution and status — the game cannot exist outside Reddit in this form.

**What breaks first at scale, or what is the biggest known weakness?**
Floor pacing depends on population: a very large subreddit would exhaust a floor too quickly, and a nearly empty one leans on Slog's idle crawl. The generator is deterministic and solvable, but floor size is currently tuned for a small/medium community. Mitigations: idle auto-advance, adaptive floor sizing is the first post-hackathon task, and Practice Tunnels guarantee a complete experience for any single visitor. Second weakness: flair and snoovatar extras depend on Reddit permissions and degrade gracefully to in-app chips.

**Why you?**
Solo builder with a Reddit + Devvit account and experience shipping agent-built products under hard time boxes. More importantly, the direction came from evidence: six prior Reddit hackathons, the actual daily-game subs, judge posts, and the organizer's own community-game guide. The design is deliberately a systems-and-charm problem (shared state + legible feel), which is where focused execution pays off.

**What happens after the hackathon?**
Keep the cron running on the private build while the judging window lasts. If players return, apply for Reddit Developer Funds / Featuring, add adaptive floor sizing, themed weekly events and mod-configurable settings. The game is designed to keep producing a shared daily moment with zero manual posting.

**Is it really running on Reddit?**
Yes — open [the arena post](https://www.reddit.com/r/slogslogslog_dev/comments/1y1qo2g/slog_floor_1_the_long_way_down/): the inline card shows live floor data, tapping opens the playable canvas game, moves are attributed by username in the log, and a daily post is created automatically. The app is uploaded privately (not published), per organizer instruction.

**Why no demo video?**
The event makes video optional. The live post is a stronger proof than a clip, and the 53-second captioned screencast is kept locally as a fallback recording for live judging.
