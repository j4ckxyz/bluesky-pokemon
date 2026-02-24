# Bluesky Game Boy Bot (Bun)

A production-oriented Bluesky bot for crowd-playing **any `.gb` game**.

Pokemon Red is the default setup, but you can point it at another ROM and set `GAME_TITLE`.

## Features

- Bun + TypeScript runtime.
- Supports official Bluesky service and third-party PDS (`BLUESKY_SERVICE_URL`).
- Works with any Game Boy ROM (`.gb`) supported by the emulator.
- Natural language controls (`go left`, `press A`, `open menu`, etc.).
- One vote per account per turn (anti-spam hardening).
- Most-voted move wins; ties are randomized.
- Near-real-time turns: resolves shortly after replies arrive.
- Reminder repost when no valid reply arrives by max turn timeout.
- Old scene replies are closed once a new scene is posted.
- Each new scene quotes the previous scene post, creating a visible progress chain.
- Screenshot embeds include alt text and runtime stats.
- Hourly save writes + rolling backup retention.

## Real-time turn model (recommended `.env.example` preset)

1. Poll for replies every `5s`.
2. Keep one vote per user.
3. Wait at least `8s` from scene post (`MIN_TURN_SECONDS`).
4. After first valid reply, wait `6s` more for additional votes (`SETTLE_AFTER_FIRST_REPLY_SECONDS`).
5. Resolve winner and post next scene.
6. If no valid reply by `2m` (`MAX_TURN_MINUTES`), repost a reminder.
7. If there are no valid replies, the bot does not advance gameplay on its own.

This keeps gameplay much faster than fixed 15-minute turns while still letting multiple people vote.

## Quick start (minimal config)

1. Install Bun (v1.2+).
2. Clone this repo and install deps:

```bash
bun install
```

3. Put your ROM at:

```bash
roms/pokemon-red.gb
```

4. Copy env file and set required values:

```bash
cp .env.example .env
```

Required values:

- `BLUESKY_IDENTIFIER`
- `BLUESKY_APP_PASSWORD`

Use an app password from Bluesky settings, not your main account password.

5. Start:

```bash
bun run start
```

Useful command:

```bash
bun run once
```

## Using a different game

1. Put your ROM anywhere, for example: `roms/tetris.gb`
2. In `.env`, set:

```env
ROM_PATH=./roms/tetris.gb
GAME_TITLE=Tetris
```

Optional:

```env
SAVE_BASENAME=tetris
POST_HASHTAGS=Tetris,BlueskyPlaysGameBoy,GameBoy
```

## Hosting options

### Docker Compose

```bash
docker compose up -d --build
```

- Reads config from `.env`
- Persists runtime data in `./data`
- Mounts ROM directory from `./roms` (read-only)

### systemd (Linux / Raspberry Pi)

1. Edit `deploy/systemd/bluesky-pokemon.service`:
- Set `User` / `Group`
- Set `WorkingDirectory`
- Set `ExecStart` Bun path

2. Install and run:

```bash
sudo cp deploy/systemd/bluesky-pokemon.service /etc/systemd/system/bluesky-pokemon.service
sudo systemctl daemon-reload
sudo systemctl enable --now bluesky-pokemon
```

3. Logs:

```bash
journalctl -u bluesky-pokemon -f
```

## Configuration reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BLUESKY_IDENTIFIER` | Yes | - | Bluesky handle/email login. |
| `BLUESKY_APP_PASSWORD` | Yes | - | Bluesky app password. |
| `BLUESKY_SERVICE_URL` | No | `https://bsky.social` | Custom PDS endpoint. |
| `GAME_TITLE` | No | `Pokemon Red` | Game title shown in posts. |
| `ROM_PATH` | No | `./roms/pokemon-red.gb` | ROM location. |
| `SAVE_BASENAME` | No | ROM filename | Save/backup file prefix. |
| `POLL_INTERVAL_SECONDS` | No | `20` | Reply polling interval. |
| `MIN_TURN_SECONDS` | No | `30` | Minimum wait after scene post before resolving. |
| `SETTLE_AFTER_FIRST_REPLY_SECONDS` | No | `20` | Vote collection window after first valid reply. |
| `MAX_TURN_MINUTES` | No | `15` | Max wait before reminder repost. |
| `SAVE_INTERVAL_MINUTES` | No | `60` | Save write interval. |
| `SAVE_BACKUP_KEEP` | No | `168` | Number of backup saves to keep. `0` disables pruning. |
| `FRAMES_PER_TURN` | No | `120` | Frames advanced per selected move. |
| `BUTTON_HOLD_FRAMES` | No | `3` | Frames to hold chosen button. |
| `INITIAL_WARMUP_FRAMES` | No | `24` | Frames run before first scene post. |
| `POST_LANGS` | No | `en` | Post language tags (comma-separated). |
| `POST_HASHTAGS` | No | Derived from game title + generic tags | Hidden Bluesky `tags` added to posts for discoverability. |
| `REPOST_EVERY_TICK` | No | `false` | If `true`, repost reminder every poll cycle once max wait is exceeded. |
| `DRY_RUN` | No | `false` | Runs without posting to Bluesky. |

## Bluesky behavior details

- Uses `RichText.detectFacets()` for proper facets (links/mentions/hashtags in text).
- Adds `.env` `POST_HASHTAGS` as Bluesky `tags` by default (hidden/outline hashtags, no visible hashtag line).
- Uploads scene PNG as `app.bsky.embed.images` with alt text.
- Advances gameplay only when at least one valid human reply vote is present.
- Uses `app.bsky.feed.threadgate` with empty `allow` to close old scene replies.
- Pins a controls post on the account profile.

## GitHub/project readiness

- CI typecheck workflow: `.github/workflows/ci.yml`.
- Docker assets: `Dockerfile`, `docker-compose.yml`, `.dockerignore`.
- ROM/save files are gitignored by default.
- Recommended pinned-post copy: `docs/PINNED_POST_TEMPLATE.md`.

## Development

```bash
bun run typecheck
bun run index.ts --help
```

## Notes

- Use only ROMs you are legally allowed to host.
- Keep app passwords private.
