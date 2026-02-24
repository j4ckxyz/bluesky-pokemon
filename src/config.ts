import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ quiet: true });

const DEFAULT_LANGS = ["en"];
const DEFAULT_BASE_HASHTAGS = ["BlueskyPlaysGameBoy", "GameBoy"];

export interface AppConfig {
  identifier: string;
  appPassword: string;
  serviceUrl: string;
  gameTitle: string;
  romPath: string;
  saveBasename: string;
  savePath: string;
  statePath: string;
  latestFramePath: string;
  saveBackupDir: string;
  saveBackupKeep: number;
  pollIntervalMs: number;
  maxTurnMs: number;
  idleAutoSkipMs: number;
  minTurnMs: number;
  settleAfterFirstReplyMs: number;
  saveIntervalMs: number;
  framesPerTurn: number;
  buttonHoldFrames: number;
  initialWarmupFrames: number;
  autoSkipStaticScreens: boolean;
  autoSkipMaxFrames: number;
  autoSkipStepFrames: number;
  autoSkipPostCooldownMs: number;
  langs: string[];
  hashtags: string[];
  repostEveryTick: boolean;
  dryRun: boolean;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveInt(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInt(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (["1", "true", "yes", "y", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(value)) {
    return false;
  }

  throw new Error(`${name} must be true/false`);
}

function parseList(name: string, fallback: string[]): string[] {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
}

function slugToTag(input: string): string {
  return input.replace(/[^a-z0-9]/gi, "");
}

function defaultHashtagsForGame(gameTitle: string): string[] {
  const gameTag = slugToTag(gameTitle);
  const tags = gameTag ? [gameTag, ...DEFAULT_BASE_HASHTAGS] : DEFAULT_BASE_HASHTAGS;
  return Array.from(new Set(tags));
}

function normalizeHashtags(tags: string[], gameTitle: string): string[] {
  const cleaned = tags
    .map((tag) => tag.replace(/^#+/, "").trim())
    .filter((tag) => tag.length > 0);

  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : defaultHashtagsForGame(gameTitle);
}

export function loadConfig(): AppConfig {
  const cwd = process.cwd();
  const dataDir = path.resolve(cwd, process.env.DATA_DIR?.trim() || "./data");
  const dryRun = parseBoolean("DRY_RUN", false);
  const gameTitle = process.env.GAME_TITLE?.trim() || "Pokemon Red";

  const romPath = path.resolve(cwd, process.env.ROM_PATH?.trim() || "./roms/pokemon-red.gb");
  const saveBasename = process.env.SAVE_BASENAME?.trim() || path.parse(romPath).name || "gameboy";
  const savePath = path.resolve(cwd, process.env.SAVE_PATH?.trim() || `${dataDir}/${saveBasename}.sav`);
  const statePath = path.resolve(cwd, process.env.STATE_PATH?.trim() || `${dataDir}/bot-state.json`);
  const latestFramePath = path.resolve(
    cwd,
    process.env.LATEST_FRAME_PATH?.trim() || `${dataDir}/latest-scene.png`,
  );
  const saveBackupDir = path.resolve(cwd, process.env.SAVE_BACKUP_DIR?.trim() || `${dataDir}/save-backups`);

  const pollIntervalSeconds = parsePositiveInt("POLL_INTERVAL_SECONDS", 20);
  const maxTurnMinutes = parsePositiveInt("MAX_TURN_MINUTES", parsePositiveInt("TURN_INTERVAL_MINUTES", 15));
  const idleAutoSkipSeconds = parsePositiveInt("IDLE_AUTO_SKIP_SECONDS", 45);
  const minTurnSeconds = parsePositiveInt("MIN_TURN_SECONDS", 30);
  const settleAfterFirstReplySeconds = parsePositiveInt("SETTLE_AFTER_FIRST_REPLY_SECONDS", 20);
  const saveIntervalMinutes = parsePositiveInt("SAVE_INTERVAL_MINUTES", 60);
  const saveBackupKeep = parseNonNegativeInt("SAVE_BACKUP_KEEP", 168);
  const framesPerTurn = parsePositiveInt("FRAMES_PER_TURN", 120);
  const buttonHoldFrames = parsePositiveInt("BUTTON_HOLD_FRAMES", 3);
  const initialWarmupFrames = parsePositiveInt("INITIAL_WARMUP_FRAMES", 24);
  const autoSkipStaticScreens = parseBoolean("AUTO_SKIP_STATIC_SCREENS", true);
  const autoSkipMaxFrames = parsePositiveInt("AUTO_SKIP_MAX_FRAMES", 900);
  const autoSkipStepFrames = parsePositiveInt("AUTO_SKIP_STEP_FRAMES", 120);
  const autoSkipPostCooldownSeconds = parsePositiveInt("AUTO_SKIP_POST_COOLDOWN_SECONDS", 180);

  if (buttonHoldFrames > framesPerTurn) {
    throw new Error("BUTTON_HOLD_FRAMES cannot be greater than FRAMES_PER_TURN");
  }

  if (minTurnSeconds > maxTurnMinutes * 60) {
    throw new Error("MIN_TURN_SECONDS cannot be greater than MAX_TURN_MINUTES * 60");
  }

  return {
    identifier: dryRun ? process.env.BLUESKY_IDENTIFIER?.trim() || "dry-run.local" : required("BLUESKY_IDENTIFIER"),
    appPassword: dryRun
      ? process.env.BLUESKY_APP_PASSWORD?.trim() || "dry-run-password"
      : required("BLUESKY_APP_PASSWORD"),
    serviceUrl: process.env.BLUESKY_SERVICE_URL?.trim() || "https://bsky.social",
    gameTitle,
    romPath,
    saveBasename,
    savePath,
    statePath,
    latestFramePath,
    saveBackupDir,
    saveBackupKeep,
    pollIntervalMs: pollIntervalSeconds * 1000,
    maxTurnMs: maxTurnMinutes * 60_000,
    idleAutoSkipMs: idleAutoSkipSeconds * 1000,
    minTurnMs: minTurnSeconds * 1000,
    settleAfterFirstReplyMs: settleAfterFirstReplySeconds * 1000,
    saveIntervalMs: saveIntervalMinutes * 60_000,
    framesPerTurn,
    buttonHoldFrames,
    initialWarmupFrames,
    autoSkipStaticScreens,
    autoSkipMaxFrames,
    autoSkipStepFrames,
    autoSkipPostCooldownMs: autoSkipPostCooldownSeconds * 1000,
    langs: parseList("POST_LANGS", DEFAULT_LANGS),
    hashtags: normalizeHashtags(parseList("POST_HASHTAGS", []), gameTitle),
    repostEveryTick: parseBoolean("REPOST_EVERY_TICK", false),
    dryRun,
  };
}
