package game

import "time"

const (
	MaxCP          = 100.0
	BaseSpeed      = 3.0
	DashMultiplier = 2.5
	DashCPCost     = 1.5
	CPRegenRate    = 0.2

	InitialRadius = 15.0
	MaxRadius     = 150.0
	GrowthPerFood = 1.5
	GrowthPerKill = 5.0
	KillScoreGain = 5

	FoodCount = 40
	BotCount  = 4

	MapWidth  = 800.0
	MapHeight = 800.0

	TickRate  = 20
	TickDelta = time.Second / TickRate
)
