package ws

// --- Client → Server ---

type InboundEnvelope struct {
	Type string `json:"type"`
}

type JoinMsg struct {
	Type string `json:"type"` // "join"
	Name string `json:"name"`
}

type InputMsg struct {
	Type  string  `json:"type"` // "input"
	Angle float64 `json:"angle"`
	Dash  bool    `json:"dash"`
}

// --- Server → Client ---

type WelcomeMsg struct {
	Type     string  `json:"type"` // "welcome"
	PlayerID string  `json:"playerId"`
	WorldW   float64 `json:"worldW"`
	WorldH   float64 `json:"worldH"`
}

type StateSharkView struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Angle float64 `json:"angle"`
	Stage int     `json:"stage"`
}

type StateFoodView struct {
	ID    string  `json:"id"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	IsRed bool    `json:"isRed,omitempty"`
}

type StateYou struct {
	ID    string `json:"id"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	XP    int    `json:"xp"`
	Stage int    `json:"stage"`
}

type StateMsg struct {
	Type   string           `json:"type"` // "state"
	Tick   int64            `json:"tick"`
	You    StateYou         `json:"you"`
	Sharks []StateSharkView `json:"sharks"`
	Foods  []StateFoodView  `json:"foods"`
}

type DeathMsg struct {
	Type  string `json:"type"` // "death"
	Score int    `json:"score"`
	Stage int    `json:"stage"`
}

type LeaderboardMsg struct {
	Type     string `json:"type"` // "leaderboard"
	TopName  string `json:"topName"`
	TopScore int    `json:"topScore"`
}
