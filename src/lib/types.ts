export type Phase = "lobby" | "playing" | "judging" | "roundEnd" | "gameOver";

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  submitted: boolean;
  roomWins: number;
}

export interface Submission {
  id: string;
  cards: string[];
  playerName: string | null;
}

export interface HistoryEntry {
  round: number;
  black: string;
  cards: string[];
  winnerName: string;
  czarName: string;
}

export interface GameState {
  code: string;
  phase: Phase;
  round: number;
  settings: { pointsToWin: number; handSize: number };
  minPlayers: number;
  hostId: string | null;
  czarId: string | null;
  me: { id: string; name: string } | null;
  players: PlayerView[];
  czarQueue: string[];
  blackCard: { text: string; pick: number } | null;
  hand: { id: number; text: string }[];
  mySubmission: string[] | null;
  submissionsCount: number;
  submissions: Submission[];
  lastRound: { winnerId: string; winnerName: string; submissionId: string } | null;
  nextRoundAt: number | null;
  history: HistoryEntry[];
  aborted: boolean;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };
