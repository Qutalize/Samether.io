// Mirrors server/internal/ws/message.go

export type SharkRoute = "attack" | "non-attack" | "deep-sea";

export type BaseMessage<T extends string, P> = {
  type: T;
  payload: P;
};

// Client → Server
export type JoinMsg = BaseMessage<"join", { 
  name: string; 
  route: SharkRoute; // TODO: Server-side support is pending. Currently ignored by the server.
}>;
export type InputMsg = BaseMessage<"input", { angle: number; dash: boolean; draw: boolean }>;
export type ClientMsg = JoinMsg | InputMsg;

// Server → Client payloads
export interface WelcomePayload {
  playerId: string;
  worldW: number;
  worldH: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface StateSharkView {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  stage: number;
  route?: SharkRoute; // TODO: Server-side support is pending. Not populated from the server; client uses fallback.
  territories?: Point[][];
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
