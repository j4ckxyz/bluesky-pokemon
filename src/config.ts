import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ quiet: true });

const DEFAULT_HASHTAGS = ["PokemonRed", "BlueskyPlaysPokemon", "GameBoy"];
const DEFAULT_LANGS = ["en"];

export interface AppConfig {
  identifier: string;
  appPassword: string;
  serviceUrl: string;
  romPath: string;
  savePath: string;
  statePath: string;
  latestFramePath: string;
  saveBackupDir: string;
  saveBackupKeep: number;
  turnIntervalMs: number;
  saveIntervalMs: number;
  framesPerTurn: number;
  buttonHoldFrames: number;
  initialWarmupFrames: number;
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

function normalizeHashtags(tags: string[]): string[] {
  const cleaned = tags
    .map((tag) => tag.replace(/^#+/, "").trim())
    .filter((tag) => tag.length > 0);

  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : [...DEFAULT_HASHTAGS];
}

export function loadConfig(): AppConfig {
  const cwd = process.cwd();
  const dataDir = path.resolve(cwd, process.env.DATA_DIR?.trim() || "./data");
  const dryRun = parseBoolean("DRY_RUN", false);

  const romPath = path.resolve(cwd, process.env.ROM_PATH?.trim() || "./roms/pokemon-red.gb");
  const savePath = path.resolve(cwd, process.env.SAVE_PATH?.trim() || `${dataDir}/pokemon-red.sav`);
  const statePath = path.resolve(cwd, process.env.STATE_PATH?.trim() || `${dataDir}/bot-state.json`);
  const latestFramePath = path.resolve(
    cwd,
    process.env.LATEST_FRAME_PATH?.trim() || `${dataDir}/latest-scene.png`,
  );
  const saveBackupDir = path.resolve(cwd, process.env.SAVE_BACKUP_DIR?.trim() || `${dataDir}/save-backups`);

  const turnIntervalMinutes = parsePositiveInt("TURN_INTERVAL_MINUTES", 15);
  const saveIntervalMinutes = parsePositiveInt("SAVE_INTERVAL_MINUTES", 60);
  const saveBackupKeep = parseNonNegativeInt("SAVE_BACKUP_KEEP", 168);
  const framesPerTurn = parsePositiveInt("FRAMES_PER_TURN", 120);
  const buttonHoldFrames = parsePositiveInt("BUTTON_HOLD_FRAMES", 3);
  const initialWarmupFrames = parsePositiveInt("INITIAL_WARMUP_FRAMES", 24);

  if (buttonHoldFrames > framesPerTurn) {
    throw new Error("BUTTON_HOLD_FRAMES cannot be greater than FRAMES_PER_TURN");
  }

  return {
    identifier: dryRun ? process.env.BLUESKY_IDENTIFIER?.trim() || "dry-run.local" : required("BLUESKY_IDENTIFIER"),
    appPassword: dryRun ? process.env.BLUESKY_APP_PASSWORD?.trim() || "dry-run-password" : required("BLUESKY_APP_PASSWORD"),
    serviceUrl: process.env.BLUESKY_SERVICE_URL?.trim() || "https://bsky.social",
    romPath,
    savePath,
    statePath,
    latestFramePath,
    saveBackupDir,
    saveBackupKeep,
    turnIntervalMs: turnIntervalMinutes * 60_000,
    saveIntervalMs: saveIntervalMinutes * 60_000,
    framesPerTurn,
    buttonHoldFrames,
    initialWarmupFrames,
    langs: parseList("POST_LANGS", DEFAULT_LANGS),
    hashtags: normalizeHashtags(parseList("POST_HASHTAGS", DEFAULT_HASHTAGS)),
    repostEveryTick: parseBoolean("REPOST_EVERY_TICK", false),
    dryRun,
  };
}
