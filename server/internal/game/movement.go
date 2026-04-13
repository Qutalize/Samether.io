package game

import "math"

func (e *Engine) moveShark(shark *SharkState) {
	speed := BaseSpeed
	if shark.IsDashing && shark.CP > 0 {
		speed *= DashMultiplier
		shark.CP -= DashCPCost
		if shark.CP < 0 {
			shark.CP = 0
		}
	} else if shark.CP < MaxCP {
		shark.CP += CPRegenRate
	}

	nextX := shark.X + math.Cos(shark.Angle)*speed
	nextY := shark.Y + math.Sin(shark.Angle)*speed

	if nextX < shark.Radius {
		nextX = shark.Radius
		if shark.IsBot {
			shark.Angle = math.Pi - shark.Angle
		}
	} else if nextX > MapWidth-shark.Radius {
		nextX = MapWidth - shark.Radius
		if shark.IsBot {
			shark.Angle = math.Pi - shark.Angle
		}
	}

	if nextY < shark.Radius {
		nextY = shark.Radius
		if shark.IsBot {
			shark.Angle = -shark.Angle
		}
	} else if nextY > MapHeight-shark.Radius {
		nextY = MapHeight - shark.Radius
		if shark.IsBot {
			shark.Angle = -shark.Angle
		}
	}

	shark.X = nextX
	shark.Y = nextY
}
