package game

// ルート別パラメーター定数
// 各値は下記の定数を変更することで調整可能。

const (
	// ─── 攻撃種（アグレッシブ）────────────────────────────────

	// 基礎速度 +15%
	AttackSpeedBonus = 0.15
	// ダッシュクールダウン短縮係数（0.70 = -30%）
	AttackDashCooldownMult = 0.70
	// CP消費率係数（1.20 = +20%）
	AttackCPRateMult = 1.20
	// ハンガーペナルティ開始までの秒数（餌を食べない時間）
	AttackHungerGraceSec = 30.0
	// ハンガーペナルティ適用間隔（秒）
	AttackHungerIntervalSec = 10.0
	// ハンガーペナルティで失うXPの割合
	AttackHungerXPLossRate = 0.10

	// ─── 非攻撃種（バランス型）───────────────────────────────

	// CP消費率係数（0.70 = -30%）
	NonAttackCPRateMult = 0.70
	// 逃走ボーナス持続秒数（被ダメージ後の速度ブースト）
	NonAttackEscapeBoostSec = 5.0
	// 逃走ボーナス速度倍率 +30%
	NonAttackEscapeSpeedBonus = 0.30

	// ─── 深海種（テクニカル）─────────────────────────────────

	// 視界拡張係数（1.40 = +40%）
	DeepSeaVisionMult = 1.40
	// レベル1–2（Stage 0–1）の速度ペナルティ係数（0.80 = -20%）
	DeepSeaLowStageSpeedMult = 0.80
	// 深度ボーナスが有効になるY座標の閾値（WorldHeight の下半分）
	// World座標系で Y が大きいほど「下」なのでWorldHeight/2 を使用
	DeepSeaDepthThreshold = WorldHeight / 2
	// 深度ボーナス速度 +10%
	DeepSeaDepthSpeedBonus = 0.10
	// 深度ボーナス被ダメージ軽減（当たり判定縮小率）
	DeepSeaDepthDmgReduction = 0.15
	// 透明化までの静止秒数
	DeepSeaStealthSec = 10.0
	// 「静止」と見なす1tick当たりの最大移動距離
	DeepSeaMoveThreshold = 1.0
)
