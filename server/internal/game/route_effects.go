package game

// ApplyRouteEffects はワールドの全サメにルート別特性エフェクトを適用する。
// hub.go の step() から毎ティック呼ぶ。
func (w *World) ApplyRouteEffects() {
	graceTicks := int64(AttackHungerGraceSec * float64(TickHz))
	intervalTicks := int64(AttackHungerIntervalSec * float64(TickHz))
	stealthTicks := int64(DeepSeaStealthSec * float64(TickHz))

	for _, s := range w.Sharks {
		if !s.Alive {
			continue
		}

		switch s.Route {
		case RouteAttack:
			w.applyHungerPenalty(s, graceTicks, intervalTicks)
		case RouteDeepSea:
			w.applyStealthCheck(s, stealthTicks)
		}
	}
}

// applyHungerPenalty は攻撃種のハンガーペナルティを適用する。
// 最後に餌を食べてから AttackHungerGraceSec 秒が経過すると、
// AttackHungerIntervalSec 秒ごとに XP が AttackHungerXPLossRate 失われる。
func (w *World) applyHungerPenalty(s *Shark, graceTicks, intervalTicks int64) {
	// 初期化: LastFoodTick が 0 の場合は現在 Tick をベースにする
	if s.LastFoodTick == 0 {
		s.LastFoodTick = w.Tick
		return
	}

	elapsed := w.Tick - s.LastFoodTick
	if elapsed <= graceTicks {
		// まだ猶予期間内 → ペナルティなし
		s.HungerNextPenaltyTick = 0
		return
	}

	// 初回ペナルティ Tick を設定
	if s.HungerNextPenaltyTick == 0 {
		s.HungerNextPenaltyTick = s.LastFoodTick + graceTicks + intervalTicks
	}

	if w.Tick < s.HungerNextPenaltyTick {
		return
	}

	// XP ペナルティ適用
	if s.XP > 0 {
		penalty := int(float64(s.XP) * AttackHungerXPLossRate)
		if penalty < 1 {
			penalty = 1
		}
		s.XP -= penalty
	}
	s.HungerNextPenaltyTick = w.Tick + intervalTicks
}

// applyStealthCheck は深海種の透明化（静止 DeepSeaStealthSec 秒で発動）を管理する。
func (w *World) applyStealthCheck(s *Shark, stealthTicks int64) {
	moved := s.Head.Dist(s.LastMoveCheckHead) > DeepSeaMoveThreshold
	s.LastMoveCheckHead = s.Head

	if moved {
		// 動いた → 透明化リセット
		s.StillSinceTick = w.Tick
		s.IsStealthy = false
		return
	}

	// 初回静止 Tick の初期化
	if s.StillSinceTick == 0 {
		s.StillSinceTick = w.Tick
	}

	if w.Tick-s.StillSinceTick >= stealthTicks {
		s.IsStealthy = true
	}
}

// TriggerEscapeBoost は非攻撃種の逃走ボーナスを発動させる。
// 衝突検出などで呼び出す。
func TriggerEscapeBoost(s *Shark, currentTick int64) {
	boostTicks := int64(NonAttackEscapeBoostSec * float64(TickHz))
	s.EscapeBoostUntilTick = currentTick + boostTicks
}
