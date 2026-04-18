# XP Gain Sound Effect Design

**Date:** 2026-04-18  
**Status:** Approved  
**Scope:** Add sound effect when player gains XP

## Overview

Add XP gain sound effect (`maou_se_system22.mp3`) that plays whenever the player's XP increases. The sound should support polyphonic playback, allowing multiple instances to play simultaneously when XP is gained rapidly in succession.

## Requirements

- Play `maou_se_system22.mp3` when XP increases
- Volume: 0.5 (moderate, less prominent than BGM)
- Polyphonic playback: Multiple instances can overlap without cutting each other off
- Detect XP changes automatically in the game state update loop
- Audio file already exists at `client/public/maou_se_system22.mp3`

## Architecture

### Component: GameScene

**File:** `client/src/game/scenes/GameScene.ts`

**Changes:**

1. Add XP tracking property to detect changes
2. In `preload()`, load the XP sound effect
3. In `onState()`, detect XP increases and play sound

**Implementation details:**

- Track previous XP value in a class property (`private prevXp = 0`)
- In `onState()`, compare `m.you.xp` with `prevXp`
- If XP increased, play sound with `this.sound.play("xpse", { volume: 0.5 })`
- Update `prevXp` to current value
- Phaser's `sound.play()` automatically creates new instances, enabling polyphonic playback

## Execution Flow

```
GameScene.preload()
  - Load maou_se_system22.mp3
  ↓
GameScene.onState() [called every server update]
  - Check if m.you.xp > prevXp
  - If yes: play XP sound
  - Update prevXp = m.you.xp
  ↓
[Rapid XP gains]
  - Each onState() call plays a new sound instance
  - Multiple sounds overlap naturally (polyphonic)
```

## XP Change Detection

**Current XP update location:** `onState()` method around line 534

```typescript
/* XP bar */
this.xpBar.update(m.you.xp, m.you.stage, this.myRoute);
```

**Detection strategy:**
- Store previous XP in `prevXp` property
- Before calling `xpBar.update()`, check if `m.you.xp > this.prevXp`
- If true, XP increased → play sound
- Update `prevXp` after check

## Polyphonic Playback

Phaser's audio system naturally supports polyphonic playback:
- `this.sound.play()` creates a new sound instance each time
- Multiple instances play simultaneously without interference
- No need to manage sound instance lifecycle manually
- Each instance automatically cleans up when finished

## Testing Criteria

- XP sound plays when player gains XP (eating food, absorbing territory)
- Sound volume is moderate (0.5)
- Rapid XP gains trigger multiple overlapping sounds (not cut off)
- No audio conflicts with BGM or death sound
- Sound does not play on initial welcome message (prevXp starts at 0)
