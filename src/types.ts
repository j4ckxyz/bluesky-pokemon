export const BUTTON_COMMANDS = [
  "A",
  "B",
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "SELECT",
  "START",
] as const;

export type ButtonCommand = (typeof BUTTON_COMMANDS)[number];

export interface PostRef {
  uri: string;
  cid: string;
}

export interface BotState {
  version: 1;
  startedAt: string;
  totalFrames: number;
  totalTurns: number;
  lastCommand?: ButtonCommand;
  controlsPost?: PostRef;
  latestScene?: PostRef;
  activeReminderRepostUri?: string;
  lastSaveAt?: string;
  lastTickAt?: string;
}

export interface ParsedVote {
  command: ButtonCommand;
  replyUri: string;
  authorDid: string;
  text: string;
  createdAt: string;
}

export interface VoteResult {
  command: ButtonCommand;
  voteCount: number;
  voteBreakdown: Record<ButtonCommand, number>;
}

export interface IncomingReply {
  uri: string;
  cid: string;
  authorDid: string;
  text: string;
  createdAt: string;
}
