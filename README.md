# Bluesky Pokemon Bot (Bun)

A production-oriented Bluesky bot for crowd-playing **Pokemon Red**.

It runs a Game Boy ROM headlessly, posts scene screenshots, reads natural-language replies as controls, and advances on a fixed schedule.

## Features

- Bun + TypeScript runtime.
- Supports official Bluesky service and third-party PDS (`BLUESKY_SERVICE_URL`).
- Natural language controls (`go left`, `press A`, `open menu`, etc.).
- One command chosen every turn from reply votes.
- One vote per account per turn (anti-spam hardening).
- New scene post every turn when valid replies exist.
- Reminder repost when no valid reply exists (non-spam default behavior).
- Old scene replies are closed once a new scene is posted.
- Screenshot embed with alt text and runtime stats.
- Hourly save writes + rolling backup retention.

## Turn logic

1. Wait 15 minutes (default).
2. Read direct replies on the latest scene post.
3. Parse valid controls from natural language.
4. Keep one vote per user.
5. Pick winning move by vote count (tie: earliest vote).
6. Advance emulator frames and post next screenshot scene.
7. If no valid vote, repost current scene as reminder.

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

4. Copy env file and set only required values:

```bash
cp .env.example .env
```

Required values:

- `BLUESKY_IDENTIFIER`
- `BLUESKY_APP_PASSWORD`

Use an app password from Bluesky settings, not your main account password.

5. Start the bot:

```bash
bun run start
```

Useful command:

```bash
bun run once
```

## Hosting options

### Docker Compose

1. Ensure `.env` is configured.
2. Ensure ROM exists at `./roms/pokemon-red.gb`.
3. Start:

```bash
docker compose up -d --build
```

Data persists in `./data` and ROM is mounted read-only from `./roms`.

### systemd (Linux / Raspberry Pi)

1. Install Bun for the service user.
2. Edit `deploy/systemd/bluesky-pokemon.service` and set `User`/`Group`, `WorkingDirectory`, and `ExecStart` to your host values.
3. Install service:

```bash
sudo cp deploy/systemd/bluesky-pokemon.service /etc/systemd/system/bluesky-pokemon.service
sudo systemctl daemon-reload
sudo systemctl enable --now bluesky-pokemon
```

4. Check logs:

```bash
journalctl -u bluesky-pokemon -f
```

## Configuration reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BLUESKY_IDENTIFIER` | Yes | - | Bluesky handle/email login. |
| `BLUESKY_APP_PASSWORD` | Yes | - | Bluesky app password. |
| `BLUESKY_SERVICE_URL` | No | `https://bsky.social` | Custom PDS endpoint. |
| `ROM_PATH` | No | `./roms/pokemon-red.gb` | ROM location. |
| `TURN_INTERVAL_MINUTES` | No | `15` | Time between turn checks. |
| `SAVE_INTERVAL_MINUTES` | No | `60` | Save write interval. |
| `SAVE_BACKUP_KEEP` | No | `168` | Number of backup saves to keep. `0` disables pruning. |
| `FRAMES_PER_TURN` | No | `120` | Frames advanced per selected move. |
| `BUTTON_HOLD_FRAMES` | No | `3` | Frames to hold chosen button. |
| `INITIAL_WARMUP_FRAMES` | No | `24` | Frames run before first scene post. |
| `POST_LANGS` | No | `en` | Post language tags (comma-separated). |
| `POST_HASHTAGS` | No | `PokemonRed,BlueskyPlaysPokemon,GameBoy` | Hashtags added to posts. |
| `REPOST_EVERY_TICK` | No | `false` | If `true`, repost reminder every empty cycle. |
| `DRY_RUN` | No | `false` | Runs without posting to Bluesky. |

## Bluesky behavior details

- Uses `RichText.detectFacets()` to generate correct facets for links/mentions/hashtags.
- Includes `tags` and hashtag text for discoverability.
- Uploads scene PNG as `app.bsky.embed.images` with alt text.
- Uses `app.bsky.feed.threadgate` with empty `allow` to close old scene replies.
- Pins a controls post on the account profile.

## GitHub/project readiness

- CI workflow runs TypeScript checks on push/PR: `.github/workflows/ci.yml`.
- Docker assets included: `Dockerfile`, `docker-compose.yml`, `.dockerignore`.
- ROM/save files are gitignored by default.

## Development

Run typecheck:

```bash
bun run typecheck
```

Entrypoint:

```bash
bun run index.ts --help
```

## Notes

- Use only ROMs you are legally allowed to host.
- Keep your app password private.
