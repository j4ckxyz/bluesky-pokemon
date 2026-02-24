import { PokemonBlueskyBot } from "./src/bot";
import { loadConfig } from "./src/config";

function usage(): string {
  return [
    "Usage:",
    "  bun run index.ts           # run forever",
    "  bun run index.ts --once    # run one scheduling cycle",
  ].join("\n");
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const config = loadConfig();
  const bot = new PokemonBlueskyBot(config);

  const once = process.argv.includes("--once");
  if (once) {
    await bot.runOnce();
    return;
  }

  await bot.runForever();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
