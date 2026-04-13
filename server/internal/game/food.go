package game

import (
	"math"
	"math/rand"

	"github.com/google/uuid"
)

func (e *Engine) spawnFood() {
	id := uuid.New().String()
	e.foods[id] = &FoodState{
		ID: id,
		X:  rand.Float64() * MapWidth,
		Y:  rand.Float64() * MapHeight,
	}
}

func (e *Engine) spawnFoodAt(x, y float64, amount int) {
	for i := 0; i < amount; i++ {
		id := uuid.New().String()
		offsetX := (rand.Float64() - 0.5) * 80.0
		offsetY := (rand.Float64() - 0.5) * 80.0

		newX := math.Max(0, math.Min(MapWidth, x+offsetX))
		newY := math.Max(0, math.Min(MapHeight, y+offsetY))

		e.foods[id] = &FoodState{
			ID: id,
			X:  newX,
			Y:  newY,
		}
	}
}

func (e *Engine) consumeFoodFor(shark *SharkState) {
	for id, food := range e.foods {
		dx := shark.X - food.X
		dy := shark.Y - food.Y
		dist := math.Sqrt(dx*dx + dy*dy)

		if dist < shark.Radius {
			shark.Score++
			if shark.Radius < MaxRadius {
				shark.Radius += GrowthPerFood
			}
			delete(e.foods, id)
			e.spawnFood()
		}
	}
}
