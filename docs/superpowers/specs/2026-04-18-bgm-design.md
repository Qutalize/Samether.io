# BGM Implementation Design

## Overview

Add background music (BGM) functionality to Samezario game. BGM will start playing when the user presses the PLAY button and stop when the player dies.

## Requirements

- BGM file: `client/public/bgm.mp3` (user will add later)
- Start trigger: PLAY button press in HomeScreen
- Stop trigger: Game over (DeathScreen)
- Loop: Continuous loop during gameplay
- Volume control: Not required (fixed default volume)

## Architecture

### Component Responsibilities

**GameScene**
- Load BGM file via Phaser asset loader
- Start BGM playback on scene creation
- Provide public method to stop BGM
- Store BGM instance as class property

**DeathScreen**
- Stop BGM on scene creation
- Access GameScene instance to call stop method

**Phaser Sound Manager**
- Handle loop playback automatically
- Manage audio lifecycle and browser compatibility

### Data Flow

```
HomeScreen: PLAY button click
    ↓
GameScene.init()
    ↓
GameScene.preload() → load bgm.mp3
    ↓
GameScene.create() → sound.add('bgm', {loop: true}).play()
    ↓
[Gameplay continues with BGM looping]
    ↓
Player dies → DeathScreen.create()
    ↓
GameScene.stopBgm() → bgm.stop()
```

## Implementation Details

### File Changes

**client/public/bgm.mp3**
- User will add this file manually
- No changes required in code if file is missing (Phaser handles gracefully)

**client/src/game/scenes/GameScene.ts**

1. Add property:
```typescript
private bgm?: Phaser.Sound.BaseSound;
```

2. Update preload() method:
```typescript
preload(): void {
  // ... existing asset loads
  this.load.audio('bgm', 'bgm.mp3');
}
```

3. Update create() method (after network listener setup):
```typescript
// Start BGM
this.bgm = this.sound.add('bgm', { loop: true, volume: 1.0 });
this.bgm.play();
```

4. Add public method:
```typescript
public stopBgm(): void {
  if (this.bgm && this.bgm.isPlaying) {
    this.bgm.stop();
  }
}
```

**client/src/ui/screens/DeathScreen.ts**

1. Update create() method (at the beginning):
```typescript
create(): void {
  // Stop BGM
  const gameScene = this.scene.get('GameScene') as GameScene;
  gameScene.stopBgm();
  
  // ... existing death screen UI code
}
```

### Error Handling

- If `bgm.mp3` is missing, Phaser logs a warning but continues execution
- Game remains playable without audio
- No try-catch blocks needed (Phaser handles internally)

### Browser Compatibility

- Phaser Sound Manager abstracts Web Audio API and HTML5 Audio
- Autoplay policy: BGM starts on user interaction (PLAY button), compliant with browser policies
- MP3 format supported across all modern browsers

## Testing Checklist

1. Without bgm.mp3 file:
   - Game starts normally
   - No runtime errors
   - Console shows asset load warning (expected)

2. With bgm.mp3 file:
   - BGM starts when entering GameScene
   - BGM loops continuously during gameplay
   - BGM stops when player dies
   - No audio glitches or overlaps

## Future Enhancements (Out of Scope)

- Volume slider control
- Mute/unmute button
- Multiple BGM tracks for different game states
- Sound effect management system
- BGM fade in/out transitions
