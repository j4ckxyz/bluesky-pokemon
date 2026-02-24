import { BUTTON_COMMANDS, type ButtonCommand, type ParsedVote, type VoteResult } from "./types";

const TOKEN_TO_COMMAND: Record<string, ButtonCommand> = {
  a: "A",
  b: "B",
  u: "UP",
  d: "DOWN",
  l: "LEFT",
  r: "RIGHT",
  up: "UP",
  down: "DOWN",
  left: "LEFT",
  right: "RIGHT",
  north: "UP",
  south: "DOWN",
  west: "LEFT",
  east: "RIGHT",
  start: "START",
  select: "SELECT",
  confirm: "A",
  interact: "A",
  talk: "A",
  accept: "A",
  cancel: "B",
  back: "B",
  run: "B",
  menu: "START",
};

const PHRASE_TO_COMMAND: Record<string, ButtonCommand> = {
  "press a": "A",
  "hit a": "A",
  "tap a": "A",
  "press b": "B",
  "hit b": "B",
  "tap b": "B",
  "go up": "UP",
  "move up": "UP",
  "head up": "UP",
  "go down": "DOWN",
  "move down": "DOWN",
  "head down": "DOWN",
  "go left": "LEFT",
  "move left": "LEFT",
  "head left": "LEFT",
  "go right": "RIGHT",
  "move right": "RIGHT",
  "head right": "RIGHT",
  "go north": "UP",
  "go south": "DOWN",
  "go east": "RIGHT",
  "go west": "LEFT",
  "open menu": "START",
  "press start": "START",
  "press select": "SELECT",
  "back button": "B",
};

const BUTTON_ORDER: ButtonCommand[] = [...BUTTON_COMMANDS];

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s#]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function parseNaturalCommand(text: string): ButtonCommand | undefined {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return undefined;
  }

  for (let i = 0; i < tokens.length; i++) {
    const tri = [tokens[i], tokens[i + 1], tokens[i + 2]].filter(Boolean).join(" ");
    const bi = [tokens[i], tokens[i + 1]].filter(Boolean).join(" ");

    const triMatch = PHRASE_TO_COMMAND[tri];
    if (triMatch) {
      return triMatch;
    }

    const biMatch = PHRASE_TO_COMMAND[bi];
    if (biMatch) {
      return biMatch;
    }

    const token = tokens[i];
    if (!token) {
      continue;
    }

    const single = TOKEN_TO_COMMAND[token];
    if (single) {
      return single;
    }
  }

  return undefined;
}

export function commandLabel(command: ButtonCommand): string {
  switch (command) {
    case "UP":
      return "UP (U)";
    case "DOWN":
      return "DOWN (D)";
    case "LEFT":
      return "LEFT (L)";
    case "RIGHT":
      return "RIGHT (R)";
    default:
      return command;
  }
}

export function selectWinningVote(votes: ParsedVote[]): VoteResult | undefined {
  if (votes.length === 0) {
    return undefined;
  }

  const voteBreakdown = Object.fromEntries(BUTTON_COMMANDS.map((command) => [command, 0])) as Record<
    ButtonCommand,
    number
  >;

  for (const vote of votes) {
    voteBreakdown[vote.command] += 1;
  }

  const maxVotes = Math.max(...BUTTON_ORDER.map((command) => voteBreakdown[command]));
  if (!Number.isFinite(maxVotes) || maxVotes <= 0) {
    return undefined;
  }

  const tiedTop = BUTTON_ORDER.filter((command) => voteBreakdown[command] === maxVotes);
  const command = pickRandom(tiedTop);
  if (!command) {
    return undefined;
  }

  return {
    command,
    voteCount: voteBreakdown[command],
    voteBreakdown,
  };
}
