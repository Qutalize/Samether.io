package game

// CheckWallDeaths kills any shark whose head is outside the world rect.
// Returns IDs of newly dead sharks.
func (w *World) CheckWallDeaths() []string {
	var dead []string
	for id, s := range w.Sharks {
		if !s.Alive {
			continue
		}
		h := s.Head
		if h.X < 0 || h.X > WorldWidth || h.Y < 0 || h.Y > WorldHeight {
			s.Alive = false
			dead = append(dead, id)
		}
	}
	return dead
}

// CheckSharkCollisions kills any shark whose head (index 0 excluded from self)
// is within CollisionBodyRad of another shark's non-head segment.
// Returns IDs of newly dead sharks.
func (w *World) CheckSharkCollisions() []string {
	var dead []string
	for id, self := range w.Sharks {
		if !self.Alive {
			continue
		}
		headPos := self.Head
		for otherID, other := range w.Sharks {
			if otherID == id || !other.Alive {
				continue
			}

			// 深海種が画面下半分にいる場合は被ダメージ -15%（当たり判定縮小）
			effectiveRad := CollisionBodyRad * other.SizeScale()
			if self.Route == RouteDeepSea && self.Head.Y > DeepSeaDepthThreshold {
				effectiveRad *= (1.0 - DeepSeaDepthDmgReduction)
			}

			// Skip segment[0] of other (head-to-head is symmetric and unfair).
			for i := 1; i < len(other.Segments); i++ {
				if headPos.Dist(other.Segments[i]) <= effectiveRad {
					// 非攻撃種: 衝突時に逃走ボーナスを記録する。
					// 現状のゲームでは死亡は即時だが、将来HPシステムが導入された
					// 際に被ダメージ後の速度ブーストとして活用できる。
					if self.Route == RouteNonAttack {
						TriggerEscapeBoost(self, w.Tick)
					}
					self.Alive = false
					dead = append(dead, id)
					goto nextSelf
				}
			}
		}
	nextSelf:
	}
	return dead
}
