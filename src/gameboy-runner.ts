import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import Gameboy from "serverboy";
import type { ButtonCommand } from "./types";

const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 144;

interface ServerboyInstance {
  loadRom(rom: Buffer | Uint8Array, saveData?: number[]): boolean;
  doFrame(): number[] | Uint8Array;
  pressKey(key: string): void;
  getScreen(): number[] | Uint8Array;
  getSaveData(): number[] | Uint8Array;
}

function timestampForFilename(now = new Date()): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

export class GameboyRunner {
  private readonly gameboy: ServerboyInstance;

  constructor(private readonly romPath: string) {
    this.gameboy = new (Gameboy as new () => ServerboyInstance)();
  }

  async initialize(savePath: string): Promise<void> {
    const romFile = Bun.file(this.romPath);
    if (!(await romFile.exists())) {
      throw new Error(`ROM file not found: ${this.romPath}`);
    }

    const romBytes = await romFile.bytes();
    if (romBytes.length === 0) {
      throw new Error(`ROM file is empty or unreadable: ${this.romPath}`);
    }

    const saveFile = Bun.file(savePath);
    const saveData = (await saveFile.exists()) ? Array.from(await saveFile.bytes()) : undefined;

    const loaded = this.gameboy.loadRom(Buffer.from(romBytes), saveData);
    if (!loaded) {
      throw new Error("Unable to load ROM into emulator");
    }
  }

  advanceFrames(frameCount: number): number {
    let advanced = 0;
    for (let i = 0; i < frameCount; i++) {
      this.gameboy.doFrame();
      advanced += 1;
    }
    return advanced;
  }

  pressAndAdvance(command: ButtonCommand, frameCount: number, holdFrames: number): number {
    let advanced = 0;

    for (let i = 0; i < frameCount; i++) {
      if (i < holdFrames) {
        this.gameboy.pressKey(command);
      }
      this.gameboy.doFrame();
      advanced += 1;
    }

    return advanced;
  }

  capturePng(): Uint8Array {
    const screen = this.gameboy.getScreen();
    if (!screen || screen.length === 0) {
      throw new Error("Emulator returned an empty screen buffer");
    }

    const expectedBytes = SCREEN_WIDTH * SCREEN_HEIGHT * 4;
    if (screen.length < expectedBytes) {
      throw new Error(`Screen buffer is too small: ${screen.length} bytes`);
    }

    const png = new PNG({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
    for (let i = 0; i < expectedBytes; i++) {
      png.data[i] = screen[i] ?? 0;
    }

    const encoded = PNG.sync.write(png);
    return new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  }

  async writeSave(savePath: string, backupDir: string, keepCount: number): Promise<void> {
    const saveData = this.gameboy.getSaveData();
    const bytes = Uint8Array.from(saveData);

    await mkdir(path.dirname(savePath), { recursive: true });
    await Bun.write(savePath, bytes);

    await mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `pokemon-red-${timestampForFilename()}.sav`);
    await Bun.write(backupPath, bytes);

    if (keepCount <= 0) {
      return;
    }

    const entries = await readdir(backupDir);
    const backups = entries
      .filter((name) => name.startsWith("pokemon-red-") && name.endsWith(".sav"))
      .sort((left, right) => right.localeCompare(left));

    const staleBackups = backups.slice(keepCount);
    for (const stale of staleBackups) {
      await rm(path.join(backupDir, stale), { force: true });
    }
  }
}
