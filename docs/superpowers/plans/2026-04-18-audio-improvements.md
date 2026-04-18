# Audio Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename audio files for clarity, add level-up sound, and increase XP gain sound volume.

**Architecture:** Three-phase approach: (1) rename audio files and update code references, (2) add level-up sound effect, (3) adjust XP sound volume. Each phase is independent and testable.

**Tech Stack:** Phaser 3 audio system, TypeScript, Git

---

## File Structure

**Audio files to rename:**
- `client/public/deathse.mp3` → `client/public/sfx_death.mp3`
- `client/public/maou_se_system22.mp3` → `client/public/sfx_xp_gain.mp3`
- `client/public/floraphonic-classic-game-action-positive-30-224562.mp3` → `client/public/sfx_levelup.mp3`

**Code files to modify:**
- `client/src/game/scenes/GameScene.ts` - Update audio references, add level-up sound, adjust volume
- `client/src/ui/screens/DeathScreen.ts` - Update death sound reference

**No new files needed** - This is an enhancement to existing audio system.

---

## Task 1: Rename Audio Files and Update References

**Files:**
- Rename: `client/public/deathse.mp3` → `client/public/sfx_death.mp3`
- Rename: `client/public/maou_se_system22.mp3` → `client/public/sfx_xp_gain.mp3`
- Rename: `client/public/floraphonic-classic-game-action-positive-30-224562.mp3` → `client/public/sfx_levelup.mp3`
- Modify: `client/src/ui/screens/DeathScreen.ts:23,27`
- Modify: `client/src/game/scenes/GameScene.ts:101,540`

- [ ] **Step 1: Rename audio files**

```bash
cd client/public
mv deathse.mp3 sfx_death.mp3
mv maou_se_system22.mp3 sfx_xp_gain.mp3
mv "floraphonic-classic-game-action-positive-30-224562.mp3" sfx_levelup.mp3
```

- [ ] **Step 2: Update DeathScreen.ts audio reference**

Change line 23 from:
```typescript
  preload(): void {
    this.load.audio("deathse", "deathse.mp3");
  }
```

To:
```typescript
  preload(): void {
    this.load.audio("sfx_death", "sfx_death.mp3");
  }
```

And change line 27-30 from:
```typescript
    /* Schedule death sound effect */
    if (this.sound && this.cache.audio.exists("deathse")) {
      this.time.delayedCall(600, () => {
        this.deathSound = this.sound.add("deathse", { loop: false, volume: 1.0 });
```

To:
```typescript
    /* Schedule death sound effect */
    if (this.sound && this.cache.audio.exists("sfx_death")) {
      this.time.delayedCall(600, () => {
        this.deathSound = this.sound.add("sfx_death", { loop: false, volume: 1.0 });
```

- [ ] **Step 3: Update GameScene.ts audio references**

Change line 101 in preload from:
```typescript
    this.load.audio("xpse", "maou_se_system22.mp3");
```

To:
```typescript
    this.load.audio("sfx_xp_gain", "sfx_xp_gain.mp3");
```

And change line 540 in onState from:
```typescript
        if (this.sound && this.cache.audio.exists("xpse")) {
          this.sound.play("xpse", { volume: 0.5 });
```

To:
```typescript
        if (this.sound && this.cache.audio.exists("sfx_xp_gain")) {
          this.sound.play("sfx_xp_gain", { volume: 0.5 });
```

- [ ] **Step 4: Test renamed audio files**

```bash
npm run build
```

Start dev server and test:
- Death screen plays death sound
- XP gain plays XP sound
- No 404 errors in console for audio files

Expected: All sounds work correctly with new names

- [ ] **Step 5: Commit the renaming**

```bash
git add client/public/sfx_death.mp3 client/public/sfx_xp_gain.mp3 client/public/sfx_levelup.mp3
git rm client/public/deathse.mp3 client/public/maou_se_system22.mp3 "client/public/floraphonic-classic-game-action-positive-30-224562.mp3"
git add client/src/ui/screens/DeathScreen.ts client/src/game/scenes/GameScene.ts
git commit -m "refactor(audio): rename audio files to descriptive names

- deathse.mp3 → sfx_death.mp3
- maou_se_system22.mp3 → sfx_xp_gain.mp3
- floraphonic-classic-game-action-positive-30-224562.mp3 → sfx_levelup.mp3
- Update all code references to use new names

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add Level-Up Sound Effect

**Files:**
- Modify: `client/src/game/scenes/GameScene.ts:101` (add preload), `:511-515` (add sound playback)

- [ ] **Step 1: Load level-up sound in preload method**

Add after the sfx_xp_gain load (around line 102):

```typescript
    this.load.audio("bgm", "bgm.mp3");
    this.load.audio("sfx_xp_gain", "sfx_xp_gain.mp3");
    this.load.audio("sfx_levelup", "sfx_levelup.mp3");
    if (!this.cache.shader.has("OceanBackground")) {
```

- [ ] **Step 2: Add level-up sound playback in onState method**

Change lines 511-515 from:
```typescript
      if (this.myStage !== -1 && m.you.stage > this.myStage) {
        this.cameras.main.flash(350, 255, 255, 255, false);
        const mySv = this.gameState.getSharks().get(this.myId);
        mySv?.playEvolutionPulse();
      }
```

To:
```typescript
      if (this.myStage !== -1 && m.you.stage > this.myStage) {
        if (this.sound && this.cache.audio.exists("sfx_levelup")) {
          this.sound.play("sfx_levelup", { volume: 1.0 });
        }
        this.cameras.main.flash(350, 255, 255, 255, false);
        const mySv = this.gameState.getSharks().get(this.myId);
        mySv?.playEvolutionPulse();
      }
```

- [ ] **Step 3: Test level-up sound**

```bash
npm run build
```

Start dev server and play until level-up:
- Level-up sound plays when stage increases
- Sound is clear and celebratory (volume 1.0)
- Timing synchronized with camera flash
- No console errors

Expected: Level-up sound plays correctly

- [ ] **Step 4: Commit the level-up sound**

```bash
git add client/src/game/scenes/GameScene.ts
git commit -m "feat(audio): add level-up sound effect

- Load sfx_levelup.mp3 in preload
- Play sound at volume 1.0 when player stages up
- Synchronized with camera flash and evolution pulse

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Increase XP Gain Sound Volume

**Files:**
- Modify: `client/src/game/scenes/GameScene.ts:540`

- [ ] **Step 1: Update XP sound volume to 1.0**

Change line 540 from:
```typescript
          this.sound.play("sfx_xp_gain", { volume: 0.5 });
```

To:
```typescript
          this.sound.play("sfx_xp_gain", { volume: 1.0 });
```

- [ ] **Step 2: Test XP sound volume**

```bash
npm run build
```

Start dev server and gain XP by eating food:
- XP sound is louder and more audible
- Multiple rapid XP gains sound good (polyphonic)
- Volume balanced with other effects

Expected: XP sound is clear at volume 1.0

- [ ] **Step 3: Commit the volume change**

```bash
git add client/src/game/scenes/GameScene.ts
git commit -m "feat(audio): increase XP gain sound volume to 1.0

- Change volume from 0.5 to 1.0 for better audibility
- Makes XP gain more satisfying and noticeable

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Rename deathse.mp3 → sfx_death.mp3 - Task 1 Steps 1-2
- ✅ Rename maou_se_system22.mp3 → sfx_xp_gain.mp3 - Task 1 Steps 1,3
- ✅ Rename floraphonic...mp3 → sfx_levelup.mp3 - Task 1 Step 1
- ✅ Update DeathScreen references - Task 1 Step 2
- ✅ Update GameScene references - Task 1 Step 3
- ✅ Add level-up sound preload - Task 2 Step 1
- ✅ Add level-up sound playback - Task 2 Step 2
- ✅ Increase XP sound volume to 1.0 - Task 3 Step 1

**Placeholder check:**
- ✅ No TBD/TODO markers
- ✅ All code blocks complete with actual implementation
- ✅ File paths exact and specific
- ✅ Test steps have clear verification criteria

**Type consistency:**
- ✅ Audio keys consistent: "sfx_death", "sfx_xp_gain", "sfx_levelup"
- ✅ Volume values consistent: 1.0 for all effects
- ✅ File naming convention consistent: sfx_<purpose>.mp3
