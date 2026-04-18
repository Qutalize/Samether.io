# BGM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add background music that plays on game start and stops on death

**Architecture:** Use Phaser Sound Manager to load and play BGM. GameScene loads the audio asset in preload(), starts playback in create(), and exposes a public stopBgm() method. DeathScreen calls this method to stop the music when the player dies.

**Tech Stack:** Phaser 3 Sound Manager, TypeScript

---

## File Structure

**Modified Files:**
- `client/src/game/scenes/GameScene.ts` - Add BGM property, loading, playback, and stop method
- `client/src/ui/screens/DeathScreen.ts` - Call BGM stop on death screen creation

**Asset File:**
- `client/public/bgm.mp3` - User will add this manually (implementation gracefully handles missing file)

---

### Task 1: Add BGM Property to GameScene

**Files:**
- Modify: `client/src/game/scenes/GameScene.ts:38-78`

- [ ] **Step 1: Add BGM property declaration**

Add after line 77 (after `vignetteOverlay` property):

```typescript
  /* atmosphere */
  private bgShader!: Phaser.GameObjects.Shader;
  private vignetteOverlay!: Phaser.GameObjects.Image;

  /* audio */
  private bgm?: Phaser.Sound.BaseSound;
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd client && npm run dev`
Expected: No TypeScript errors, dev server starts successfully

- [ ] **Step 3: Commit**

```bash
git add client/src/game/scenes/GameScene.ts
git commit -m "feat(audio): add BGM property to GameScene

Add private bgm property to store background music instance.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Load BGM Asset in Preload

**Files:**
- Modify: `client/src/game/scenes/GameScene.ts:88-99`

- [ ] **Step 1: Add audio loading to preload method**

Add after line 95 (after shark_greenland image load):

```typescript
  preload(): void {
    this.load.image("shark",           "shark.png");
    this.load.image("shark_mako",      "shark_mako.png");
    this.load.image("shark_sandtiger", "shark_sandtiger.png");
    this.load.image("shark_frilled",   "shark_frilled.png");
    this.load.image("shark_megalodon", "shark_megalodon.png");
    this.load.image("shark_whale",     "shark_whale.png");
    this.load.image("shark_greenland", "shark_greenland.png");
    this.load.audio("bgm", "bgm.mp3");
    if (!this.cache.shader.has("OceanBackground")) {
      this.cache.shader.add("OceanBackground", OceanBackgroundShader);
    }
  }
```

- [ ] **Step 2: Test without bgm.mp3 file**

Run: `cd client && npm run dev`
Open browser at `http://localhost:5173`
Log in and click PLAY button
Expected: Game starts normally, console shows warning about missing bgm.mp3 (this is expected behavior)

- [ ] **Step 3: Commit**

```bash
git add client/src/game/scenes/GameScene.ts
git commit -m "feat(audio): load BGM asset in GameScene preload

Add audio loading for bgm.mp3. Game continues if file is missing.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Start BGM Playback in Create

**Files:**
- Modify: `client/src/game/scenes/GameScene.ts:104-188`

- [ ] **Step 1: Add BGM playback after network setup**

Add after line 187 (after the time.addEvent setup for sendInput):

```typescript
    /* network */
    net.onMessage((m) => this.handleServer(m));
    this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => this.sendInput(),
    });

    /* audio */
    this.bgm = this.sound.add("bgm", { loop: true, volume: 1.0 });
    this.bgm.play();
  }
```

- [ ] **Step 2: Create placeholder BGM file for testing**

```bash
cd client/public
# Create a 1-second silent mp3 for testing (requires ffmpeg)
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 -acodec libmp3lame bgm.mp3 2>/dev/null || echo "Skip if ffmpeg not available - test with real BGM file"
```

- [ ] **Step 3: Test BGM playback**

Run: `cd client && npm run dev`
Open browser at `http://localhost:5173`
Log in and click PLAY button
Expected: Game starts, no errors, BGM starts playing (silent if using placeholder)

- [ ] **Step 4: Remove placeholder BGM file**

```bash
cd client/public
rm -f bgm.mp3
```

- [ ] **Step 5: Commit**

```bash
git add client/src/game/scenes/GameScene.ts
git commit -m "feat(audio): start BGM playback on game start

Initialize and play BGM with loop enabled when GameScene loads.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Add Stop Method to GameScene

**Files:**
- Modify: `client/src/game/scenes/GameScene.ts` (add public method near end of class)

- [ ] **Step 1: Find appropriate location for public method**

Run: `grep -n "public setVisionRange" client/src/game/scenes/GameScene.ts`
Expected: Shows line number of existing public method (around line 248)

- [ ] **Step 2: Add stopBgm public method**

Add after the setVisionRange method (or at end of class before closing brace):

```typescript
  /**
   * Stop background music.
   * Called by DeathScreen when player dies.
   */
  public stopBgm(): void {
    if (this.bgm && this.bgm.isPlaying) {
      this.bgm.stop();
    }
  }
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd client && npm run dev`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add client/src/game/scenes/GameScene.ts
git commit -m "feat(audio): add stopBgm public method to GameScene

Add method to stop BGM, checks if sound exists and is playing.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 5: Stop BGM on Death Screen

**Files:**
- Modify: `client/src/ui/screens/DeathScreen.ts:25-38`
- Reference: `client/src/game/scenes/GameScene.ts` (for type import)

- [ ] **Step 1: Import GameScene type**

Add after line 2 (after SharkRoute import):

```typescript
import Phaser from "phaser";
import type { SharkRoute } from "../../network/protocol";
import type { GameScene } from "../../game/scenes/GameScene";
```

- [ ] **Step 2: Add BGM stop in create method**

Add after line 25 (at the beginning of create method):

```typescript
  create(): void {
    /* Stop BGM */
    const gameScene = this.scene.get("GameScene") as GameScene;
    if (gameScene && gameScene.stopBgm) {
      gameScene.stopBgm();
    }

    const { width, height } = this.scale;
```

- [ ] **Step 3: Test complete flow without bgm.mp3**

Run: `cd client && npm run dev`
Open browser at `http://localhost:5173`
Log in, click PLAY, wait to die or let another player kill you
Expected: Death screen appears with no errors (no BGM playing since file missing)

- [ ] **Step 4: Test complete flow with bgm.mp3 (if available)**

If you have a real bgm.mp3 file:
```bash
cp /path/to/your/bgm.mp3 client/public/bgm.mp3
cd client && npm run dev
```
Open browser, log in, click PLAY
Expected: BGM starts playing when game starts
Die in game
Expected: BGM stops, death screen appears

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/screens/DeathScreen.ts
git commit -m "feat(audio): stop BGM on death screen

Call GameScene.stopBgm() when DeathScreen is created.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Testing Checklist

After completing all tasks, verify:

1. **Without bgm.mp3:**
   - Game starts normally
   - No runtime errors
   - Console shows asset load warning (expected)

2. **With bgm.mp3:**
   - BGM starts when GameScene loads
   - BGM loops continuously during gameplay
   - BGM stops when DeathScreen appears
   - No audio overlap or glitches

3. **TypeScript:**
   - No compilation errors
   - All types properly imported

## User Instructions

After implementation is complete, add your BGM file:

```bash
cp your-music.mp3 client/public/bgm.mp3
```

The file should be:
- Format: MP3
- Suitable for looping (clean loop points)
- Reasonable file size for web delivery
