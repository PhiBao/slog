# Slog

> **Every day, all of Reddit steers one brave snail through the Undervault — one move each.**

Slog is a daily game for Reddit, built with [Devvit Web](https://developers.reddit.com) for
Reddit's Game of the Day Hackathon (redditgameofday2026.devpost.com).

- One shared board per day, posted at 12:00 UTC.
- Each player gets **one move** on the shared hero, Sir Slog.
- Every move is logged by username; the comment section is the war room.
- Training Tunnels: unlimited solo practice floors.

*(This README grows with the build; the submission-quality version lands before the deadline.)*

## Status

In active development during the hackathon window (Nov 21 – Dec 8, 2026).

## Development

Requires a Reddit + Devvit account and Node 22.

```bash
npm install
npx devvit login      # browser auth, token stored at ~/.devvit/token
npm run dev           # playtest against your subreddit
npm run build
npm test
```
