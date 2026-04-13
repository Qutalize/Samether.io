package game

import (
	"math"
	"math/rand"

	"github.com/google/uuid"
)

func (e *Engine) spawnBot() {
	id := "bot-" + uuid.New().String()
	e.sharks[id] = &SharkState{
		ID:     id,
		X:      rand.Float64() * MapWidth,
		Y:      rand.Float64() * MapHeight,
		Angle:  rand.Float64() * 2 * math.Pi,
		Radius: InitialRadius,
		CP:     MaxCP,
		IsBot:  true,
	}
}

func updateBotAI(shark *SharkState) {
	shark.Angle += (rand.Float64() - 0.5) * 0.3
	if !shark.IsDashing && shark.CP > 80 && rand.Float64() < 0.05 {
		shark.IsDashing = true
	} else if shark.IsDashing && shark.CP < 20 {
		shark.IsDashing = false
	}
}
