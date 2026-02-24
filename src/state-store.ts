import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { BotState } from "./types";

export function createDefaultState(now = new Date()): BotState {
  return {
    version: 1,
    startedAt: now.toISOString(),
    totalFrames: 0,
    totalTurns: 0,
  };
}

export async function loadState(statePath: string): Promise<BotState> {
  const file = Bun.file(statePath);
  if (!(await file.exists())) {
    return createDefaultState();
  }

  try {
    const parsed = JSON.parse(await file.text()) as Partial<BotState>;

    if (parsed.version !== 1) {
      return createDefaultState();
    }

    return {
      ...createDefaultState(),
      ...parsed,
      version: 1,
      totalFrames: Number.isFinite(parsed.totalFrames) ? Math.max(0, parsed.totalFrames ?? 0) : 0,
      totalTurns: Number.isFinite(parsed.totalTurns) ? Math.max(0, parsed.totalTurns ?? 0) : 0,
    };
  } catch {
    return createDefaultState();
  }
}

export async function saveState(statePath: string, state: BotState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await Bun.write(statePath, `${JSON.stringify(state, null, 2)}\n`);
}
