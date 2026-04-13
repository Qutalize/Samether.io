// Mirrors server/internal/net/protocol.go

// Client → Server
export interface JoinMsg {
  type: "join";
  name: string;
}
export interface InputMsg {
  type: "input";
  angle: number;
  dash: boolean;
}
export type ClientMsg = JoinMsg | InputMsg;

// Server → Client
export interface WelcomeMsg {
  type: "welcome";
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
export interface StateMsg {
  type: "state";
  tick: number;
  you: StateYou;
  sharks: StateSharkView[];
  foods: StateFoodView[];
}
export interface DeathMsg {
  type: "death";
  score: number;
  stage: number;
}
export interface LeaderboardMsg {
  type: "leaderboard";
  topName: string;
  topScore: number;
}
export type ServerMsg = WelcomeMsg | StateMsg | DeathMsg | LeaderboardMsg;
