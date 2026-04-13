package game

type SharkState struct {
	ID        string  `json:"id"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Angle     float64 `json:"angle"`
	Radius    float64 `json:"radius"`
	Score     int     `json:"score"`
	CP        float64 `json:"cp"`
	IsDashing bool    `json:"is_dashing"`
	IsBot     bool    `json:"-"`
}

type FoodState struct {
	ID string  `json:"id"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
}

type StateSnapshot struct {
	Sharks []SharkState `json:"sharks"`
	Foods  []FoodState  `json:"foods"`
}

type PlayerInput struct {
	PlayerID  string
	Angle     float64
	IsDashing bool
}

type DeathEvent struct {
	PlayerID   string
	FinalScore int
}
