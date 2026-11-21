# Slog

> **Every day, all of Reddit steers one brave snail through the Undervault — one move each.**

- **Live game:** [open the arena post](https://www.reddit.com/r/slogslogslog_dev/comments/1y1qo2g/slog_floor_1_the_long_way_down/) (u/slogslogslog, r/slogslogslog_dev)
- **Devvit app listing:** https://developers.reddit.com/apps/slogslogslog
- **Demo video:** not submitted (the event makes video optional); the live demo post is the primary artifact. A local fallback recording of the flow is kept at `docs/demo.mp4`.
- **Public repo:** https://github.com/PhiBao/slog

## Try it in 60 seconds

1. Open the [demo post](https://www.reddit.com/r/slogslogslog_dev/comments/1y1qo2g/slog_floor_1_the_long_way_down/) and tap **Spend today's move**.
2. Press a direction (or **Shell**) in the expanded game. **That move is shared with everyone**: your username enters the move log and Slog actually moves on the board every other visitor sees.
3. Tap **Training Tunnels** for unlimited solo floors — the full game with zero stakes, including a personal-best score.

**Proof:** your move appears in the log with your username; poll the post again after 30 seconds and you will see other players' moves; a new arena post is created automatically every day at 12:00 UTC; past floors are listed under **Past floors** in the game.

---

## Product

**What it is.** Slog is a daily community dungeon. One shared snail, one shared board, one move per person per day. Everyone steers the same hero, so the whole subreddit is playing one continuous run that resets at noon UTC.

**Who it is for.** Daily-puzzle players who want more than a private score: people who read the comments of r/hotandcold, r/syllo and r/kraw to argue the answer with strangers. The initial user is the lurker who opens one daily post every morning and stays for the debate.

**The problem.** Daily games on Reddit are overwhelmingly solo puzzles with a personal leaderboard. The comment section — Reddit's best feature — is decoration, not gameplay. Players improvise community play in comments instead (thousands of replies per day in the big daily-game subs), but nothing connects those conversations to the game state.

**Value proposition.** Make the argument *mechanical*: every move by every player changes the same board, is attributed by username, and is visible to the next person. You get the intimacy of a solo puzzle with the stakes of a shared world. The game is legible in 15 seconds: one board, four arrows, one move.

**Why now.** Devvit Web gives a Reddit post a real webview with typed server endpoints, Redis, cron, and event triggers — enough to run a shared-state game asynchronously without building a backend. The platform's own community-game guide prescribes exactly this shape (bite-sized, scheduled content, asynchronous, scales from 1 to 1000 players).

**Key insight.** The scarce resource in a daily game is not puzzle content — it is *shared attention*. Give each person exactly one move and the move becomes a social act: people argue about it in the comments, watch what the hive did, and return tomorrow to do it again.

**Wedge.** Every existing daily game either gives you a private run (Wordle-style) or a catalog of user levels (Honk/kraw). Slog gives you a **single shared run** — one hero, one board, thousands of daily co-drivers. That is the thing only a Reddit-native platform can deliver well.

## How to play (plain language)

- Each day a new floor opens at 12:00 UTC. Every visitor sees the same cavern and the same snail.
- You get **one move on the shared hero** per day. Choose ← ↑ ↓ →, or **Shell** to rest and heal one heart (3 hearts total).
- Grey-white **salt crystals** hurt — one heart each. Lose all three and Slog retreats into his shell for the day.
- The glowing **burrow** is the exit. When someone reaches it, the whole community clears the floor.
- Your move is logged with your username. If nobody moves for 30 minutes, Slog slowly crawls on his own — but he never walks into salt and never lands the final step; humans finish the floor.
- **Training Tunnels** are private practice floors: unlimited moves, same rules, personal bests tracked. They never affect the shared run.
- Consecutive days with a move build a streak (one free skip per rolling 7 floors). Your streak can appear as subreddit flair.

## User experience

- **First action:** tap the call-to-action in the inline feed card; the game opens in expanded mode.
- **Activation moment:** your first directional tap. The hero slides one tile, your name appears in the move log, the controls dim with a friendly "Your move is spent — you're in today's log" state.
- **Primary workflow:** shared board → one move → recent-moves log → comment-section strategy → next-day return.
- **Interaction model:** four large touch targets + Shell; 30-second polling brings in other players' moves without a reload.
- **Emotional payoff:** the shared drama of strangers steering one small snail, salt incidents attributed by name, and a communal clear card.
- **Retention loop:** daily floor reset, streaks with a grace skip, archive of past floors, and the accumulated history of the community's run.
- **Sharing loop:** the arena post is a fresh, screenshot-friendly shareable surface every day; end cards ask players to gloat or mourn in the comments.
- **Memorable element:** *the hero you are steering may have been moved by someone else ten seconds ago.*

## Innovation

Before this, a Reddit game could give you a private score or a library of user-made levels. It could not give you a **single authoritative board controlled asynchronously by an entire community with one move each** without a separate backend, account system, and hosting. Devvit's Redis, cron, event triggers and authenticated server endpoints make it possible inside an interactive post, with no external services, no sign-up, and no downloaded app.

This is not "AI-powered": the floor generator is deterministic seeded code (tested across 500 seeds for a guaranteed salt-free route), and every rule is enforced server-side. The novelty is the interaction model and the shared state, not a model call.

## Hackathon relevance

**Track:** Best Daily Game ($15,000). No ported-IP claim — Slog was built from zero during the hackathon window.

**Devvit integration map — what each capability actually does in the product** (not a shallow call per feature):

| Devvit capability | Job in Slog | Where to look |
|---|---|---|
| Webview post entrypoints | `splash.html` inline feed card (fast, live floor status); `game.html` expanded playable board | `src/client/splash.tsx`, `src/client/game.tsx`, `devvit.json` |
| Redis | Shared floor state, per-user daily move budget (SETNX), optimistic WATCH commits, streaks, practice tunnels, arena-post ids, avatar cache, rate limits | `src/server/core/state.ts` (`applySharedMove`, `commitFloorUpdate`, `trySpendMove`) |
| Scheduler / cron | New floor and fresh arena post at 12:00 UTC; idle-crawl tick every 10 min | `devvit.json` `scheduler`, `src/server/core/daily.ts`, `src/server/routes/scheduler.ts` |
| Event triggers | `onAppInstall`/`onAppUpgrade` self-heal today's arena post; `onCommentCreate` war-room bot gives each commenter one live status reply per floor | `src/server/routes/triggers.ts` |
| Reddit API identity | Server resolves the username for move attribution and streaks — the client never asserts identity | `src/server/trpc.ts` (`reddit.getCurrentUsername()`) |
| Reddit API posting | App account submits the daily titled arena post; replies to comments as `APP` | `src/server/core/daily.ts`, `src/server/routes/triggers.ts` |
| User flair | Streak badge (🐌🔥N) set on a user's first daily move, best-effort | `src/server/core/moves.ts` (`applyIdentityExtras`) |
| Snoovatars | Avatar URL fetched once and cached; rendered next to usernames in the move log | `src/server/core/moves.ts`, `src/client/game.tsx` (`LogView`) |

**Judging criteria mapping:**

- **Delightful UX** — warm, intentionally designed pixel-archaeology look; time-to-fun under 15 seconds; contextual hints only; mobile-sized touch targets; reduced-motion support.
- **Polish** — launch-quality states (loading, error + retry, first move, move spent, salt hit, floor cleared, floor failed, empty log, archive); Devvit Rules compliant; README and play instructions in the app root; app left private (uploaded, not published) per organizer instruction.
- **Reddit-y** — the comment section is mechanically connected to play (war-room bot), moves carry usernames, the whole subreddit shares one run, streaks/flair/snoovatars reward participation. It does not depend on jokes about Snoo, karma or subreddits as a subject.
- **Daily Content** — a deterministic new floor and a fresh arena post every day at 12:00 UTC; permanent archive; streaks; a fresh shared moment each day.

## Provenance

Built from scratch during the Nov 11 – Dec 8, 2026 submission window, starting from Reddit's official Devvit Web games template (React 19, Hono, tRPC, Vite, Tailwind, Vitest). All game code, art (canvas-drawn), and documentation were created during the hackathon. AI coding agents were used for planning, code, tests, and this README; the discovery notes and build package are preserved at `~/common/discovery/redditgameofday2026/` but are not required for the submission. No third-party game IP, no external API keys, no AI model calls at runtime.

## Architecture

```
Reddit post (webview: splash inline / game expanded)
   │  typed tRPC calls over /api/trpc
   ▼
Devvit Node server (Hono + tRPC, serverless per request)
   ├─ shared-floor rules & move validation (pure, tested)
   ├─ optimistic Redis commits + per-user move budgets
   ├─ cron: daily floor + arena post; idle crawl
   └─ triggers: install/upgrade roll; comment war-room reply
   │
   ▼
Redis (shared state) + Reddit API (identity, posts, comments, flair, snoovatars)
```

No separate backend, database, or hosting is used — the required infrastructure is entirely Devvit's. All persistent data is in Redis because webview `localStorage` is wiped on every app version update. The client is untrusted: state and identity are recomputed on the server for every action.

## Running

Prerequisites: Node 24 (`.nvmrc`), a Reddit account that can install Devvit apps.

```bash
npm install
npx devvit login
npm run dev        # playtest (watch mode) against r/slogslogslog_dev
npm test           # types + lint + 35 unit tests + production build
npm run deploy     # npm test + `devvit upload` (PRIVATE build only)
```

> **Do not run `devvit publish` during the event** — the organizers explicitly ask entrants to leave their app unpublished. The `publish` npm script was removed to make an accidental publish impossible.

On this particular WSL machine the system DNS poisons `www.reddit.com`, so the repo ships `tools/dns-preload.cjs` (public-DNS resolver) and all devvit npm scripts set `NODE_OPTIONS=--require .../dns-preload.cjs`. It contains no secrets and is harmless on a normal network.

## Demo

- **Live demo:** [arena post](https://www.reddit.com/r/slogslogslog_dev/comments/1y1qo2g/slog_floor_1_the_long_way_down/) in the public 1-member r/slogslogslog_dev (well under the 200-member judging limit).
- **Flow:** open post → tap "Spend today's move" → press a direction → name appears in log → open Training Tunnels → clear a practice floor → Past floors.
- **Required setup:** a Reddit account. No wallet, no API key, no local installation.
- **Judge should try first:** make one shared move and refresh the post 30 seconds later to see another player's move in the log.

## Verification

| Claim | Artifact / how to verify |
|---|---|
| Shared state is real | Two accounts see the same board; each move is attributed in the post's log; Redis keys in `src/server/core/state.ts` |
| Daily content is automated | Cron config in `devvit.json` and the dated daily posts in r/slogslogslog_dev; archive view in the game |
| One move per person is enforced | Server-side SETNX budget + tests (`tests: moves, state, edge`); a second tap shows a friendly spent state |
| Solvable daily floors | 500-seed BFS solvability test in `src/shared/floor.test.ts` |
| Concurrent moves don't get lost | TTL mutex + WATCH commits, tested with two simultaneous moves in `src/server/core/edge.test.ts` |
| No mocked core behavior | Every claim above runs on the real post. The only seeded content is the deterministic floor generator (a rule, not a fixture). |
| Tests | `npm test` — 35 passing tests, 0 type errors, 0 lint errors |

## Security and reliability

- Move rules, budgets, rate limits and identity are enforced **server-side only**; the client renders state and sends an action enum (zod-validated).
- Redis WATCH transactions plus a short-TTL serialized turn prevent lost updates under concurrent moves; an illegal move refunds the budget.
- Per-user rate limits (15 shared moves/min; 120 practice moves/10min), one war-room reply per user per floor, 60 replies/floor cap. No voting/karma manipulation anywhere.
- Snoovatar URLs are https-validated before caching; no external requests from the webview (CSP); no runtime secrets or keys.
- Failure states: Redis/render errors retry, closed floors reject politely, day rollover mid-session applies to the new floor, offline clients show a Retry state.
- **Known weakness honestly stated:** Slog's daily schedules and Redis are managed by Devvit; if the platform's cron slips, the on-demand `ensureCurrentFloor` path still keeps state consistent, but the dated post may appear late. Flair and snoovatar extras are best-effort and degrade to in-app chips if Reddit denies the permission.

## Limitations and roadmap

- No real-time multiplayer (the platform does not support WebSockets); play is deliberately asynchronous.
- The daily floor is tuned for a small-to-medium subreddit; a very large one would need adaptive floor sizing.
- Snoovatar rendering depends on users having an avatar set.
- After the hackathon: adaptive difficulty, themed weekly events, mod-configurable floor settings, and the Reddit Developer Funds/Featuring path if the community keeps playing.
