# Audio Improvements Design

**Date:** 2026-04-18  
**Status:** Approved  
**Scope:** Add level-up sound, adjust XP sound volume, rename audio files

## Overview

Improve the game's audio system with three enhancements:
1. Rename audio files to descriptive names following `sfx_<purpose>` convention
2. Add level-up sound effect that plays when player stages up
3. Increase XP gain sound volume from 0.5 to 1.0 for better audibility

## Requirements

### 1. Audio File Renaming
- `deathse.mp3` → `sfx_death.mp3`
- `maou_se_system22.mp3` → `sfx_xp_gain.mp3`
- `floraphonic-classic-game-action-positive-30-224562.mp3` → `sfx_levelup.mp3`
- `bgm.mp3` → unchanged

**Naming Convention:**
- BGM files: `bgm.mp3` (descriptive name)
- Sound effects: `sfx_<purpose>.mp3`

### 2. Level-Up Sound Effect
- Play `sfx_levelup.mp3` when player's stage increases
- Volume: 1.0 (clear and celebratory)
- Timing: Synchronized with camera flash effect
- Trigger: When `m.you.stage > this.myStage` (existing detection logic)

### 3. XP Gain Sound Volume Adjustment
- Change volume from 0.5 to 1.0
- Make XP gain more audible and satisfying

## Architecture

### Phase 1: Audio File Renaming

**Files to rename:**
- `client/public/deathse.mp3` → `client/public/sfx_death.mp3`
- `client/public/maou_se_system22.mp3` → `client/public/sfx_xp_gain.mp3`
- `client/public/floraphonic-classic-game-action-positive-30-224562.mp3` → `client/public/sfx_levelup.mp3`

**Code references to update:**
- `client/src/ui/screens/DeathScreen.ts`: "deathse" → "sfx_death"
- `client/src/game/scenes/GameScene.ts`: "xpse" → "sfx_xp_gain" (2 locations)

### Phase 2: Level-Up Sound Implementation

**File:** `client/src/game/scenes/GameScene.ts`

**Changes:**
1. In `preload()`: Load sfx_levelup.mp3
2. In `onState()`: Play sound when level-up detected (around line 511)

**Implementation details:**
- Detection: Existing logic `this.myStage !== -1 && m.you.stage > this.myStage`
- Play immediately after detection (before camera flash)
- Volume: 1.0
- No polyphonic needs (level-ups are infrequent)

### Phase 3: XP Sound Volume Adjustment

**File:** `client/src/game/scenes/GameScene.ts`

**Change:**
- In `onState()`: Update `this.sound.play("sfx_xp_gain", { volume: 0.5 })` to `{ volume: 1.0 }`

## Execution Flow

### Phase 1: Renaming
```
1. Rename audio files in public/
2. Update DeathScreen.ts audio reference
3. Update GameScene.ts audio references (preload + play)
4. Test: verify all sounds still work
5. Commit
```

### Phase 2: Level-Up Sound
```
GameScene.preload()
  - Load sfx_levelup.mp3
  ↓
GameScene.onState()
  - Detect: m.you.stage > this.myStage
  - Play sfx_levelup at volume 1.0
  - Camera flash (existing)
  - Evolution pulse animation (existing)
```

### Phase 3: Volume Adjustment
```
GameScene.onState()
  - XP increase detected
  - Play sfx_xp_gain at volume 1.0 (was 0.5)
```

## Level-Up Detection

**Current detection location:** `GameScene.onState()` around line 511

```typescript
if (this.myStage !== -1 && m.you.stage > this.myStage) {
  // Level-up detected
  this.cameras.main.flash(350, 255, 255, 255, false);
  const mySv = this.gameState.getSharks().get(this.myId);
  mySv?.playEvolutionPulse();
}
this.myStage = m.you.stage;
```

**Integration strategy:**
Add sound playback before camera flash to ensure audio triggers first.

## Testing Criteria

### Phase 1: Renaming
- Death screen plays death sound correctly
- XP gain plays XP sound correctly
- No 404 errors in browser console
- No broken audio references

### Phase 2: Level-Up Sound
- Sound plays when player stages up
- Timing synchronized with visual effects
- Volume is clear and celebratory (1.0)
- No sound on game start or other events

### Phase 3: Volume Adjustment
- XP gain sound is louder and more audible
- Multiple rapid XP gains still sound good
- Volume feels balanced with other effects

## File Reference Summary

**Audio files after renaming:**
- `public/bgm.mp3` (unchanged)
- `public/sfx_death.mp3` (renamed)
- `public/sfx_xp_gain.mp3` (renamed)
- `public/sfx_levelup.mp3` (renamed)

**Code files modified:**
- `client/src/game/scenes/GameScene.ts` (all phases)
- `client/src/ui/screens/DeathScreen.ts` (phase 1 only)
