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
			// Skip segment[0] of other (head-to-head is symmetric and unfair).
			for i := 1; i < len(other.Segments); i++ {
				if headPos.Dist(other.Segments[i]) <= CollisionBodyRad*other.SizeScale() {
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
