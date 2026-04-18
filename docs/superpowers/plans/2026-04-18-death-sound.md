# Death Sound Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add death sound effect that plays synchronized with "YOU DIED" text fade-in animation.

**Architecture:** Extend DeathScreen to preload and play deathse.mp3 with 600ms delay matching the visual animation timing.

**Tech Stack:** Phaser 3 audio system, TypeScript

---

## File Structure

**Modified:**
- `client/src/ui/screens/DeathScreen.ts` - Add preload() method and death sound playback scheduling

**No new files needed** - This is a simple enhancement to existing DeathScreen scene.

---

## Task 1: Add Death Sound Effect to DeathScreen

**Files:**
- Modify: `client/src/ui/screens/DeathScreen.ts:11-25` (add property), `:16-18` (add preload method), `:26-31` (add sound scheduling)

- [ ] **Step 1: Add death sound property to DeathScreen class**

Add property after the existing class properties:

```typescript
export class DeathScreen extends Phaser.Scene {
  private score = 0;
  private stage = 0;
  private route: SharkRoute = "attack";
  private deathSound?: Phaser.Sound.BaseSound;

  constructor() {
    super({ key: "DeathScreen" });
  }
```

- [ ] **Step 2: Add preload method to load death sound**

Add method after constructor, before init():

```typescript
  constructor() {
    super({ key: "DeathScreen" });
  }

  preload(): void {
    this.load.audio("deathse", "deathse.mp3");
  }

  init(data: { score: number; stage: number; route?: SharkRoute }): void {
```

- [ ] **Step 3: Schedule death sound playback in create method**

Add sound scheduling code right after BGM stop logic (after line 31):

```typescript
  create(): void {
    /* Stop BGM */
    const gameScene = this.scene.get("GameScene") as GameScene;
    if (gameScene && gameScene.stopBgm) {
      gameScene.stopBgm();
    }

    /* Schedule death sound effect */
    if (this.sound && this.cache.audio.exists("deathse")) {
      this.time.delayedCall(600, () => {
        this.deathSound = this.sound.add("deathse", { loop: false, volume: 1.0 });
        if (this.deathSound) {
          this.deathSound.play();
        }
      });
    }

    const { width, height } = this.scale;
```

- [ ] **Step 4: Test death sound in browser**

Start dev server if not running:
```bash
cd client
npm run dev
```

Play the game until death occurs. Verify:
- Death sound plays at the moment "YOU DIED" text starts fading in
- Sound timing feels synchronized with visual
- No console errors related to audio

- [ ] **Step 5: Commit the implementation**

```bash
git add client/src/ui/screens/DeathScreen.ts
git commit -m "feat(audio): add death sound effect to DeathScreen

- Load deathse.mp3 in preload
- Play sound at 600ms delay (synced with YOU DIED text fade-in)
- Volume set to 1.0, no looping

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Play deathse.mp3 when DeathScreen is displayed - Task 1 Step 3
- ✅ Timing: 600ms delay matching text fade-in - Task 1 Step 3 (delayedCall with 600ms)
- ✅ No BGM interaction needed - Already handled, BGM stops before sound plays
- ✅ Audio file exists at client/public/deathse.mp3 - Verified in project exploration

**Placeholder check:**
- ✅ No TBD/TODO markers
- ✅ All code blocks complete with actual implementation
- ✅ File paths exact and specific
- ✅ Test steps have clear verification criteria

**Type consistency:**
- ✅ `deathSound` property type matches Phaser.Sound.BaseSound usage
- ✅ Audio key "deathse" consistent across preload and add calls
- ✅ Volume and loop settings explicit
