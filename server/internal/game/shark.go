package game

import "math"

// Route identifiers shared with the client (see client/src/network/protocol.ts).
const (
	RouteAttack    = "attack"
	RouteNonAttack = "non-attack"
	RouteDeepSea   = "deep-sea"
)

// NormalizeRoute returns a valid route, falling back to RouteAttack for
// unknown or empty inputs.
func NormalizeRoute(r string) string {
	switch r {
	case RouteAttack, RouteNonAttack, RouteDeepSea:
		return r
	default:
		return RouteAttack
	}
}

type Shark struct {
	ID                 string
	Name               string
	Route              string
	Head               Vec
	Angle              float64 // radians
	TargetAngle        float64 // target turning angle
	Segments           []Vec   // including head at index 0
	Trail              []Vec   // head trajectory for territory formation
	TrailActive        bool    // whether current input hold is creating trail points
	Territories        [][]Vec // closed polygons formed when trail self-intersects
	XP                 int
	Stage              int // zero-based index into Stages
	DashUntilTick      int64
	Alive              bool
	IsBot              bool
	TargetFoodID       string
	AbandonedFoodID    string
	AbandonedUntilTick int64
	Trait              Trait // 特性（nil = DefaultTrait）

	// ルート別特性フィールド
	CurrentTick           int64 // 現在Tick（Moveから参照するためhubがセット）
	LastFoodTick          int64 // 最後に餌を食べたTick（攻撃種ハンガーペナルティ用）
	HungerNextPenaltyTick int64 // 次のXPペナルティ適用Tick
	LastMoveCheckHead     Vec   // 前回静止チェック時の位置（深海種透明化用）
	StillSinceTick        int64 // 静止開始Tick（深海種透明化用）
	IsStealthy            bool  // 透明状態（深海種）
	EscapeBoostUntilTick  int64 // 逃走ボーナス終了Tick（非攻撃種）
	DashCooldownUntilTick int64 // ダッシュクールダウン終了Tick
}

func NewShark(id, name string, spawn Vec) *Shark {
	s := &Shark{
		ID:          id,
		Name:        name,
		Route:       RouteAttack,
		Head:        spawn,
		Angle:       0,
		TargetAngle: 0,
		XP:          0,
		Stage:       0,
		Alive:       true,
		Trail:       []Vec{spawn},
		LastFoodTick:      0,
		StillSinceTick:    0,
		LastMoveCheckHead: spawn,
	}
	s.Segments = make([]Vec, Stages[0].SegmentCount)
	for i := range s.Segments {
		s.Segments[i] = Vec{X: spawn.X - float64(i)*SegmentSpacing, Y: spawn.Y}
	}
	return s
}

// SizeScale returns the current visual/collision size multiplier.
func (s *Shark) SizeScale() float64 {
	return Stages[s.Stage].SizeScale
}

// RouteSpeedMult returns the effective speed multiplier for this shark
// based on its route, stage and current position.
func (s *Shark) RouteSpeedMult() float64 {
	mult := 1.0
	switch s.Route {
	case RouteAttack:
		mult += AttackSpeedBonus
	case RouteNonAttack:
		// 逃走ボーナス中は速度 +30%
		if s.CurrentTick > 0 && s.CurrentTick <= s.EscapeBoostUntilTick {
			mult += NonAttackEscapeSpeedBonus
		}
	case RouteDeepSea:
		// レベル1–2（Stage 0–1）は速度 -20%
		if s.Stage <= 1 {
			mult *= DeepSeaLowStageSpeedMult
		}
		// 深度ボーナス: 画面下半分（Y > WorldHeight/2）で速度 +10%
		if s.Head.Y > DeepSeaDepthThreshold {
			mult += DeepSeaDepthSpeedBonus
		}
	}
	return mult
}

// Move advances the shark by one tick.
// dt is seconds. dash doubles the distance for this tick.
func (s *Shark) Move(dt float64, dash bool) {
	// 1. Smooth turning
	diff := s.TargetAngle - s.Angle
	for diff > math.Pi {
		diff -= 2 * math.Pi
	}
	for diff < -math.Pi {
		diff += 2 * math.Pi
	}

	// Turn speed decreases as size increases, but use sqrt to keep large sharks maneuverable
	turnSpeed := BaseTurnSpeed / math.Sqrt(s.SizeScale())
	turnStep := turnSpeed * dt

	if diff > turnStep {
		s.Angle += turnStep
	} else if diff < -turnStep {
		s.Angle -= turnStep
	} else {
		s.Angle = s.TargetAngle
	}

	// Normalize angle
	for s.Angle > math.Pi {
		s.Angle -= 2 * math.Pi
	}
	for s.Angle < -math.Pi {
		s.Angle += 2 * math.Pi
	}

	// 2. Move forward
	speed := BaseSpeed * s.RouteSpeedMult()
	if dash {
		speed *= DashMultiplier
	}
	dx := math.Cos(s.Angle) * speed * dt
	dy := math.Sin(s.Angle) * speed * dt

	newHead := Vec{X: s.Head.X + dx, Y: s.Head.Y + dy}
	oldHead := s.Head
	s.Head = newHead
	s.Segments[0] = newHead

	spacing := SegmentSpacing // No multiplication by s.SizeScale() to match client visuals
	for i := 1; i < len(s.Segments); i++ {
		prev := s.Segments[i-1]
		cur := s.Segments[i]
		d := cur.Dist(prev)
		if d < 1e-6 {
			continue
		}
		// Pull segment i toward prev so it sits `spacing` behind.
		t := (d - spacing) / d
		s.Segments[i] = Vec{
			X: cur.X + (prev.X-cur.X)*t,
			Y: cur.Y + (prev.Y-cur.Y)*t,
		}
	}

	if s.TrailActive {
		s.recordTrailPoint(oldHead, newHead)
	}
}

// UpdateStage promotes the shark to the highest stage its XP allows and
// extends the segments array, keeping existing segment positions.
// Safe to call every tick — does nothing if stage is unchanged.
func (s *Shark) UpdateStage() {
	newStage := StageFromXP(s.XP)
	if newStage == s.Stage {
		return
	}
	s.Stage = newStage
	wantCount := Stages[newStage].SegmentCount
	if len(s.Segments) >= wantCount {
		return
	}
	// Append new segments behind the current tail, in the opposite direction
	// of the shark's heading so they fall in naturally.
	tail := s.Segments[len(s.Segments)-1]
	spacing := SegmentSpacing
	for i := len(s.Segments); i < wantCount; i++ {
		tail = Vec{
			X: tail.X - math.Cos(s.Angle)*spacing,
			Y: tail.Y - math.Sin(s.Angle)*spacing,
		}
		s.Segments = append(s.Segments, tail)
	}
}
