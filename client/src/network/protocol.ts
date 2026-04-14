// Mirrors server/internal/ws/message.go

export type BaseMessage<T extends string, P> = {
  type: T;
  payload: P;
};

// Client → Server
export type JoinMsg = BaseMessage<"join", { name: string }>;
export type InputMsg = BaseMessage<"input", { angle: number; dash: boolean }>;
export type ClientMsg = JoinMsg | InputMsg;

// Server → Client payloads
export interface WelcomePayload {
  playerId: string;
  worldW: number;
  worldH: number;
}

export interface StateSharkView {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  stage: number;
}

export interface StateFoodView {
  id: string;
  x: number;
  y: number;
  isRed?: boolean;
}

export interface StateYou {
  id: string;
  x: number;
  y: number;
  xp: number;
  stage: number;
}

export interface StatePayload {
  tick: number;
  you: StateYou;
  full?: boolean;
  sharks?: StateSharkView[];
  foods?: StateFoodView[];
  addedSharks?: StateSharkView[];
  updatedSharks?: StateSharkView[];
  removedSharks?: string[];
  addedFoods?: StateFoodView[];
  updatedFoods?: StateFoodView[];
  removedFoods?: string[];
}

export interface DeathPayload {
  score: number;
  stage: number;
}

export interface LeaderboardPayload {
  topName: string;
  topScore: number;
}

// Server → Client messages
export type WelcomeMsg = BaseMessage<"welcome", WelcomePayload>;
export type StateMsg = BaseMessage<"state", StatePayload>;
export type DeathMsg = BaseMessage<"death", DeathPayload>;
export type LeaderboardMsg = BaseMessage<"leaderboard", LeaderboardPayload>;
export type ServerMsg = WelcomeMsg | StateMsg | DeathMsg | LeaderboardMsg;
