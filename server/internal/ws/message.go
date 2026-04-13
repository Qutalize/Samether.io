package ws

import "encoding/json"

type BaseMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type TouchInputPayload struct {
	Angle     float64 `json:"angle"`
	IsDashing bool    `json:"is_dashing"`
}

type WelcomePayload struct {
	PlayerID string `json:"player_id"`
}

type DeathPayload struct {
	FinalScore int `json:"final_score"`
}

func toRawJSON(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
