# Slog

> **Every day, all of Reddit steers one brave snail through the Undervault — one move each.**

Slog is a daily game for Reddit, built with Devvit Web for
[Reddit's Game of the Day Hackathon](https://redditgameofday2026.devpost.com).

One shared cavern floor is posted every day at 12:00 UTC. Every player gets **one move**
on the shared hero, Sir Slog; every move is logged by username, and the comment section
is the war room. Training Tunnels offer unlimited solo practice.

## Development

Requires Node 24 (`.nvmrc`; the Devvit backend itself targets Node 22 serverless) and a
Reddit + Devvit account.

```bash
npm install
npx devvit login      # browser auth; token stored at ~/.devvit/token
npm run dev           # playtest against your test subreddit
npm run test          # types + lint + unit tests + build
npm run deploy        # devvit upload (private build — do NOT publish during the event)
```

> Local note: this machine's WSL resolver poisons `www.reddit.com`, so every `devvit`
> command here runs with `NODE_OPTIONS=--require tools/dns-preload.cjs` (already wired
> into the npm scripts). The preload resolves Reddit hosts via public DNS.

## Status

Built from Reddit's official Devvit games template during the hackathon window
(Nov 21 – Dec 8, 2026). This README becomes submission-quality before the deadline.
