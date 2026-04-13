package game

import (
	"log"
	"math"
)

func (e *Engine) resolveCollisions() map[string]bool {
	sharks := make([]*SharkState, 0, len(e.sharks))
	for _, s := range e.sharks {
		sharks = append(sharks, s)
	}

	dead := make(map[string]bool)

	for i := 0; i < len(sharks); i++ {
		for j := i + 1; j < len(sharks); j++ {
			s1, s2 := sharks[i], sharks[j]
			if dead[s1.ID] || dead[s2.ID] {
				continue
			}

			s1Hit := noseHits(s1, s2)
			s2Hit := noseHits(s2, s1)

			switch {
			case s1Hit && s2Hit:
				dead[s1.ID] = true
				dead[s2.ID] = true
				e.spawnFoodAt(s1.X, s1.Y, int(s1.Radius/2))
				e.spawnFoodAt(s2.X, s2.Y, int(s2.Radius/2))
				log.Printf("[Game] Head-on collision! %s and %s died.", s1.ID, s2.ID)
			case s1Hit:
				dead[s1.ID] = true
				awardKill(s2)
				e.spawnFoodAt(s1.X, s1.Y, int(s1.Radius/2))
				log.Printf("[Game] %s hit %s and died.", s1.ID, s2.ID)
			case s2Hit:
				dead[s2.ID] = true
				awardKill(s1)
				e.spawnFoodAt(s2.X, s2.Y, int(s2.Radius/2))
				log.Printf("[Game] %s hit %s and died.", s2.ID, s1.ID)
			}
		}
	}

	return dead
}

func noseHits(attacker, target *SharkState) bool {
	noseX := attacker.X + math.Cos(attacker.Angle)*attacker.Radius
	noseY := attacker.Y + math.Sin(attacker.Angle)*attacker.Radius
	return math.Hypot(noseX-target.X, noseY-target.Y) < target.Radius
}

func awardKill(s *SharkState) {
	s.Score += KillScoreGain
	if s.Radius < MaxRadius {
		s.Radius += GrowthPerKill
	}
}
