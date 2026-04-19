package game

import (
	"math"
	"testing"
)

func TestAttackRouteSpeedBonus(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 100, Y: 100})
	s.Route = RouteAttack
	s.Angle = 0

	dt := 1.0 / float64(TickHz)
	s.Move(dt, false)

	expected := 100 + BaseSpeed*(1+AttackSpeedBonus)*dt
	if math.Abs(s.Head.X-expected) > 0.001 {
		t.Fatalf("attack head X = %v, want %v", s.Head.X, expected)
	}
}

func TestDeepSeaLowStageSpeedPenalty(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 100, Y: 100})
	s.Route = RouteDeepSea
	s.Stage = 1 // レベル1–2: 速度 -20%
	s.Angle = 0

	dt := 1.0 / float64(TickHz)
	s.Move(dt, false)

	expected := 100 + BaseSpeed*DeepSeaLowStageSpeedMult*dt
	if math.Abs(s.Head.X-expected) > 0.001 {
		t.Fatalf("deep-sea low stage head X = %v, want %v", s.Head.X, expected)
	}
}

func TestDeepSeaHighStageNoSpeedPenalty(t *testing.T) {
	s := NewShark("p1", "alice", Vec{X: 100, Y: 100})
	s.Route = RouteDeepSea
	s.Stage = 2 // レベル3以降: 速度ペナルティなし
	s.Angle = 0

	dt := 1.0 / float64(TickHz)
	s.Move(dt, false)

	expected := 100 + BaseSpeed*dt
	if math.Abs(s.Head.X-expected) > 0.001 {
		t.Fatalf("deep-sea high stage head X = %v, want %v", s.Head.X, expected)
	}
}

func TestDeepSeaDepthSpeedBonus(t *testing.T) {
	// 画面下半分（Y > WorldHeight/2）で速度 +10%
	s := NewShark("p1", "alice", Vec{X: 100, Y: WorldHeight*0.75})
	s.Route = RouteDeepSea
	s.Stage = 2 // ペナルティなし
	s.Angle = 0

	dt := 1.0 / float64(TickHz)
	s.Move(dt, false)

	expected := 100 + BaseSpeed*(1+DeepSeaDepthSpeedBonus)*dt
	if math.Abs(s.Head.X-expected) > 0.001 {
		t.Fatalf("deep-sea depth bonus head X = %v, want %v", s.Head.X, expected)
	}
}

func TestHungerPenaltyApplied(t *testing.T) {
	w := NewWorld()
	s := NewShark("p1", "alice", Vec{X: 100, Y: 100})
	s.Route = RouteAttack
	s.XP = 100
	w.Sharks[s.ID] = s
	w.Tick = 1

	graceTicks := int64(AttackHungerGraceSec * float64(TickHz))
	intervalTicks := int64(AttackHungerIntervalSec * float64(TickHz))

	// 猶予期間内 → ペナルティなし
	s.LastFoodTick = 1
	w.Tick = graceTicks
	w.ApplyRouteEffects()
	if s.XP != 100 {
		t.Fatalf("XP should not decrease during grace period, got %d", s.XP)
	}

	// 猶予期間後のインターバル経過 → ペナルティ適用
	w.Tick = 1 + graceTicks + intervalTicks
	w.ApplyRouteEffects()
	if s.XP >= 100 {
		t.Fatalf("XP should decrease after hunger penalty, got %d", s.XP)
	}
}

func TestDeepSeaStealthAfterStillness(t *testing.T) {
	w := NewWorld()
	s := NewShark("p1", "alice", Vec{X: 100, Y: 100})
	s.Route = RouteDeepSea
	w.Sharks[s.ID] = s
	w.Tick = 1
	s.LastMoveCheckHead = s.Head
	s.StillSinceTick = 1

	stealthTicks := int64(DeepSeaStealthSec * float64(TickHz))

	// まだ透明化しない
	w.Tick = stealthTicks - 1
	w.ApplyRouteEffects()
	if s.IsStealthy {
		t.Fatalf("shark should not be stealthy before stealth threshold")
	}

	// 透明化
	w.Tick = 1 + stealthTicks
	w.ApplyRouteEffects()
	if !s.IsStealthy {
		t.Fatalf("shark should be stealthy after %v seconds of stillness", DeepSeaStealthSec)
	}
}

func TestDeepSeaStealthResetOnMove(t *testing.T) {
	w := NewWorld()
	s := NewShark("p1", "alice", Vec{X: 100, Y: 100})
	s.Route = RouteDeepSea
	s.IsStealthy = true
	s.StillSinceTick = 1
	w.Sharks[s.ID] = s
	w.Tick = 1000

	// 大きく移動した場合、透明化がリセットされる
	s.Head = Vec{X: 200, Y: 200}
	w.ApplyRouteEffects()
	if s.IsStealthy {
		t.Fatalf("shark should not be stealthy after moving")
	}
}
