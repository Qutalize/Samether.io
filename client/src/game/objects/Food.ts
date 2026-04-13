import Phaser from "phaser";

// A Food is a lightweight Sprite instead of a Graphics object.
// This significantly reduces draw calls.
export class Food extends Phaser.GameObjects.Sprite {
  private t0: number;
  public isRed: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, isRed = false) {
    const textureKey = isRed ? "food_red" : "food_green";
    super(scene, x, y, textureKey);
    this.t0 = scene.time.now;
    this.isRed = isRed;
    scene.add.existing(this);
  }

  tickAnim(now: number): void {
    const phase = ((now - this.t0) / 400) % (Math.PI * 2);
    // Scale pulsates between ~0.8 and 1.2
    const scale = 1.0 + Math.sin(phase) * 0.2;
    this.setScale(scale);
  }
}
