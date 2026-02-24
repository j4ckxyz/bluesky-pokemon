import { mkdir } from "node:fs/promises";
import path from "node:path";
import { BlueskyService } from "./bluesky";
import type { AppConfig } from "./config";
import { commandLabel, parseNaturalCommand, selectWinningVote } from "./controls";
import { GameboyRunner } from "./gameboy-runner";
import { createDefaultState, loadState, saveState } from "./state-store";
import { BUTTON_COMMANDS, type BotState, type ButtonCommand, type ParsedVote, type VoteResult } from "./types";

const FPS_ESTIMATE = 60;

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatDurationFromFrames(frames: number): string {
  return formatDurationMs((frames / FPS_ESTIMATE) * 1000);
}

function formatVotes(voteResult: VoteResult): string {
  const labels: Record<ButtonCommand, string> = {
    A: "A",
    B: "B",
    UP: "U",
    DOWN: "D",
    LEFT: "L",
    RIGHT: "R",
    SELECT: "SELECT",
    START: "START",
  };

  return BUTTON_COMMANDS.filter((command) => voteResult.voteBreakdown[command] > 0)
    .sort((left, right) => voteResult.voteBreakdown[right] - voteResult.voteBreakdown[left])
    .slice(0, 4)
    .map((command) => `${labels[command]} ${voteResult.voteBreakdown[command]}`)
    .join(", ");
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function safeDateMs(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function dedupeVotesByAuthor(votes: ParsedVote[]): ParsedVote[] {
  const byAuthor = new Map<string, ParsedVote>();
  const sorted = [...votes].sort((left, right) => safeDateMs(left.createdAt) - safeDateMs(right.createdAt));

  for (const vote of sorted) {
    if (!byAuthor.has(vote.authorDid)) {
      byAuthor.set(vote.authorDid, vote);
    }
  }

  return Array.from(byAuthor.values());
}

export class PokemonBlueskyBot {
  private readonly emulator: GameboyRunner;
  private readonly bluesky: BlueskyService;
  private state: BotState = createDefaultState();
  private initialized = false;
  private createdInitialSceneOnInit = false;
  private tickInFlight = false;

  constructor(private readonly config: AppConfig) {
    this.emulator = new GameboyRunner(this.config.romPath);
    this.bluesky = new BlueskyService({
      identifier: this.config.identifier,
      appPassword: this.config.appPassword,
      serviceUrl: this.config.serviceUrl,
      langs: this.config.langs,
      dryRun: this.config.dryRun,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.ensureDirectories();
    this.state = await loadState(this.config.statePath);

    await this.bluesky.login();
    await this.emulator.initialize(this.config.savePath);

    await this.ensureControlsPostPinned();
    await saveState(this.config.statePath, this.state);

    if (!this.state.latestScene) {
      await this.postInitialScene();
      this.createdInitialSceneOnInit = true;
      await saveState(this.config.statePath, this.state);
    }

    this.initialized = true;
    this.log(`Initialized. Current turn ${this.state.totalTurns}, frames ${this.state.totalFrames}.`);
  }

  async runOnce(): Promise<void> {
    await this.initialize();

    if (this.createdInitialSceneOnInit) {
      this.log("Initial scene posted. Waiting for replies before advancing.");
      return;
    }

    await this.runCycle("manual");
  }

  async runForever(): Promise<void> {
    await this.initialize();

    while (true) {
      const waitMs = this.msUntilNextTick();
      if (waitMs > 0) {
        this.log(`Next tick in ${(waitMs / 1000).toFixed(0)}s.`);
      }
      await Bun.sleep(waitMs);
      try {
        await this.runCycle("scheduled");
      } catch {
        await Bun.sleep(Math.min(this.config.turnIntervalMs, 30_000));
      }
    }
  }

  private async runCycle(reason: "scheduled" | "manual"): Promise<void> {
    if (this.tickInFlight) {
      this.log("Skipping tick because a prior cycle is still running.");
      return;
    }

    this.tickInFlight = true;
    try {
      await this.maybeSaveGame();

      const latestScene = this.state.latestScene;
      if (!latestScene) {
        await this.postInitialScene();
        await saveState(this.config.statePath, this.state);
        return;
      }

      const replies = await this.bluesky.getDirectReplies(latestScene.uri);
      const parsedVotes: ParsedVote[] = [];

      for (const reply of replies) {
        if (reply.authorDid === this.bluesky.did) {
          continue;
        }

        const command = parseNaturalCommand(reply.text);
        if (!command) {
          continue;
        }

        parsedVotes.push({
          command,
          replyUri: reply.uri,
          authorDid: reply.authorDid,
          text: reply.text,
          createdAt: reply.createdAt,
        });
      }

      const dedupedVotes = dedupeVotesByAuthor(parsedVotes);
      const winningVote = selectWinningVote(dedupedVotes);
      if (!winningVote) {
        await this.handleNoVoteReminder();
        this.state.lastTickAt = new Date().toISOString();
        await saveState(this.config.statePath, this.state);

        if (reason === "scheduled") {
          this.log("No valid control replies this tick. Scene not advanced.");
        }
        return;
      }

      await this.clearReminderRepost();

      const framesAdvanced = this.emulator.pressAndAdvance(
        winningVote.command,
        this.config.framesPerTurn,
        this.config.buttonHoldFrames,
      );
      this.state.totalFrames += framesAdvanced;
      this.state.totalTurns += 1;
      this.state.lastCommand = winningVote.command;

      const sceneText = this.buildSceneText(winningVote);
      const altText = this.buildAltText(winningVote.command);
      const image = this.emulator.capturePng();
      await Bun.write(this.config.latestFramePath, image);

      const previousScene = this.state.latestScene;
      const nextScene = await this.bluesky.postScene({
        text: sceneText,
        imagePng: image,
        alt: altText,
      });

      this.state.latestScene = nextScene;
      this.state.lastTickAt = new Date().toISOString();

      if (previousScene) {
        await this.closeRepliesSafely(previousScene.uri);
      }

      await this.maybeSaveGame();
      await saveState(this.config.statePath, this.state);

      this.log(
        `Advanced turn ${this.state.totalTurns} using ${winningVote.command} with ${winningVote.voteCount} ${pluralize(
          winningVote.voteCount,
          "vote",
          "votes",
        )}.`,
      );
    } catch (error) {
      this.log(`Tick failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      this.tickInFlight = false;
    }
  }

  private async handleNoVoteReminder(): Promise<void> {
    const latestScene = this.state.latestScene;
    if (!latestScene) {
      return;
    }

    if (!this.config.repostEveryTick && this.state.activeReminderRepostUri) {
      return;
    }

    if (this.state.activeReminderRepostUri) {
      await this.clearReminderRepost();
    }

    try {
      this.state.activeReminderRepostUri = await this.bluesky.createRepost(latestScene);
      this.log("No valid move. Reposted the current scene as a reminder.");
    } catch (error) {
      this.log(`Reminder repost failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async clearReminderRepost(): Promise<void> {
    const reminderUri = this.state.activeReminderRepostUri;
    if (!reminderUri) {
      return;
    }

    try {
      await this.bluesky.deleteRepost(reminderUri);
    } catch (error) {
      this.log(`Failed to delete old reminder repost: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.state.activeReminderRepostUri = undefined;
    }
  }

  private async ensureControlsPostPinned(): Promise<void> {
    if (!this.state.controlsPost) {
      const controlsText = this.buildControlsText();
      const controlsPost = await this.bluesky.postText({ text: controlsText });
      this.state.controlsPost = controlsPost;
      this.log("Posted controls reference post.");
    }

    try {
      await this.bluesky.pinPost(this.state.controlsPost);
    } catch (error) {
      this.log(
        `Failed to pin existing controls post, creating a new one: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      const controlsPost = await this.bluesky.postText({ text: this.buildControlsText() });
      this.state.controlsPost = controlsPost;
      await this.bluesky.pinPost(controlsPost);
    }
  }

  private async postInitialScene(): Promise<void> {
    const warmedFrames = this.emulator.advanceFrames(this.config.initialWarmupFrames);
    this.state.totalFrames += warmedFrames;

    const image = this.emulator.capturePng();
    await Bun.write(this.config.latestFramePath, image);

    const post = await this.bluesky.postScene({
      text: this.buildInitialSceneText(),
      imagePng: image,
      alt: this.buildAltText(undefined),
    });

    this.state.latestScene = post;
    this.state.lastTickAt = new Date().toISOString();
  }

  private buildControlsText(): string {
    const lines = [
      "Pokemon Red crowd controls:",
      "A=confirm/interact B=cancel/back",
      "U/D/L/R=move (say: go left)",
      "START=menu SELECT=select",
      "Reply naturally to scene posts. One move is chosen every 15 minutes.",
      this.hashtagLine(),
    ];

    return lines.join("\n");
  }

  private buildInitialSceneText(): string {
    const lines = [
      "Pokemon Red is live.",
      `Frames: ${this.state.totalFrames.toLocaleString()} | Emulated: ${formatDurationFromFrames(this.state.totalFrames)}`,
      "Reply with the next move in plain language (for example: go right, press A, open menu). Controls are pinned.",
      this.hashtagLine(),
    ];

    return lines.join("\n");
  }

  private buildSceneText(voteResult: VoteResult): string {
    const now = Date.now();
    const uptimeMs = now - safeDateMs(this.state.startedAt);
    const lines = [
      `Turn ${this.state.totalTurns} | Chosen move: ${commandLabel(voteResult.command)} (${voteResult.voteCount} ${pluralize(voteResult.voteCount, "vote", "votes")})`,
      `Frames: ${this.state.totalFrames.toLocaleString()} | Emulated: ${formatDurationFromFrames(this.state.totalFrames)} | Uptime: ${formatDurationMs(uptimeMs)}`,
      `Vote split: ${formatVotes(voteResult)}`,
      "Reply with the next move in natural language (example: go up, press A, back button). Controls are pinned.",
      this.hashtagLine(),
    ];

    return lines.join("\n");
  }

  private buildAltText(lastCommand: ButtonCommand | undefined): string {
    const moveText = lastCommand ? commandLabel(lastCommand) : "no move chosen yet";
    return [
      "Pokemon Red gameplay screenshot.",
      `Turn ${this.state.totalTurns}.`,
      `Frame ${this.state.totalFrames.toLocaleString()} (${formatDurationFromFrames(this.state.totalFrames)} emulated).`,
      `Most recent chosen control: ${moveText}.`,
      "Players should reply with the next move.",
    ].join(" ");
  }

  private hashtagLine(): string {
    return this.config.hashtags.map((tag) => `#${tag}`).join(" ");
  }

  private msUntilNextTick(now = Date.now()): number {
    const lastTickAtMs = safeDateMs(this.state.lastTickAt);
    const nextTickMs = (lastTickAtMs || now) + this.config.turnIntervalMs;
    return Math.max(0, nextTickMs - now);
  }

  private async maybeSaveGame(): Promise<void> {
    const nowMs = Date.now();
    const lastSaveMs = safeDateMs(this.state.lastSaveAt);

    if (lastSaveMs > 0 && nowMs - lastSaveMs < this.config.saveIntervalMs) {
      return;
    }

    await this.emulator.writeSave(this.config.savePath, this.config.saveBackupDir, this.config.saveBackupKeep);
    this.state.lastSaveAt = new Date(nowMs).toISOString();
    this.log("Saved battery-backed save data.");
  }

  private async closeRepliesSafely(postUri: string): Promise<void> {
    try {
      await this.bluesky.closeReplies(postUri);
    } catch (error) {
      this.log(`Failed to close replies on prior scene: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async ensureDirectories(): Promise<void> {
    await Promise.all([
      mkdir(path.dirname(this.config.savePath), { recursive: true }),
      mkdir(path.dirname(this.config.statePath), { recursive: true }),
      mkdir(path.dirname(this.config.latestFramePath), { recursive: true }),
      mkdir(this.config.saveBackupDir, { recursive: true }),
    ]);
  }

  private log(message: string): void {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
}
