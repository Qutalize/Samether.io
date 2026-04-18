# Death Sound Effect Design

**Date:** 2026-04-18  
**Status:** Approved  
**Scope:** Add death sound effect playback on DeathScreen

## Overview

Add death sound effect (`deathse.mp3`) that plays when the death screen appears. The sound should play at the moment the "YOU DIED" text begins its fade-in animation (600ms after screen creation), creating an audio-visual synchronization.

## Requirements

- Play `deathse.mp3` when DeathScreen is displayed
- Timing: Play at 600ms delay (when "YOU DIED" text starts fading in)
- No interaction with BGM needed (BGM already stops before sound plays)
- Audio file already exists at `client/public/deathse.mp3`

## Architecture

### Component: DeathScreen

**File:** `client/src/ui/screens/DeathScreen.ts`

**Changes:**

1. Add `preload()` method to load the death sound effect
2. In `create()`, schedule sound playback with 600ms delay using `this.time.delayedCall()`

**Implementation details:**

- Use Phaser's audio system: `this.load.audio()` and `this.sound.add()`
- Play sound as one-shot effect (no looping)
- Default volume: 1.0 (same as BGM)
- Sound plays once and is not stopped manually (death screen persists until user navigates away)

## Execution Flow

```
DeathScreen.init()
  ↓
DeathScreen.preload()
  - Load deathse.mp3
  ↓
DeathScreen.create()
  - Stop BGM (existing)
  - Schedule death sound at 600ms
  - Create visual elements (existing)
  ↓
[600ms delay]
  ↓
Death sound plays + "YOU DIED" text fades in
```

## Testing Criteria

- Death sound plays when death screen appears
- Sound timing matches "YOU DIED" text fade-in start
- No audio conflicts or overlaps
- Sound plays at appropriate volume level
