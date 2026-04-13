import Phaser from "phaser";

export class InputController {
  private scene: Phaser.Scene;
  private dashBtn!: Phaser.GameObjects.Container;
  private dashPressed = false;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  
  private bgCircle!: Phaser.GameObjects.Arc;
  private outerRing!: Phaser.GameObjects.Arc;
  private labelText!: Phaser.GameObjects.Text;
  private cpGfx!: Phaser.GameObjects.Graphics;
  private isCpEmpty = false;
  private isExhausted = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (this.scene.input.keyboard) {
      this.spaceKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }
    this.buildDashButton();
  }

  private buildDashButton(): void {
    const { width, height } = this.scene.scale;
    const c = this.scene.add.container(width - 76, height - 76);
    c.setScrollFactor(0);
    c.setDepth(1000);

    /* outer glow ring */
    const glow = this.scene.add.circle(0, 0, 58, 0x1a3848, 0.12);

    /* thick outer ring (metallic) */
    this.outerRing = this.scene.add.circle(0, 0, 54, 0x15242e, 0.55);
    this.outerRing.setStrokeStyle(5, 0x8aaaba, 0.85);

    /* inner circle */
    this.bgCircle = this.scene.add.circle(0, 0, 44, 0x0c1a24, 0.85);
    this.bgCircle.setStrokeStyle(1.5, 0x3a5868, 0.45);

    /* CP Gauge */
    this.cpGfx = this.scene.add.graphics();

    /* text label */
    this.labelText = this.scene.add.text(0, 0, "DASH\n[SPACE]", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#99bbcc",
      align: "center",
    });
    this.labelText.setOrigin(0.5);

    c.add([glow, this.outerRing, this.bgCircle, this.cpGfx, this.labelText]);
    c.setSize(104, 104);
    c.setInteractive(
      new Phaser.Geom.Circle(0, 0, 54),
      Phaser.Geom.Circle.Contains,
    );

    c.on("pointerdown", () => {
      this.dashPressed = true;
      this.updateVisualState();
    });
    const resetStyle = () => {
      this.dashPressed = false;
      this.updateVisualState();
    };
    c.on("pointerup", resetStyle);
    c.on("pointerout", resetStyle);

    this.scene.scale.on("resize", (size: Phaser.Structs.Size) => {
      c.setPosition(size.width - 76, size.height - 76);
    });

    this.dashBtn = c;
    this.updateCP(1.0);
  }

  private updateVisualState(): void {
    const inputActive = this.isDashInputActive();
    const active = inputActive && !this.isExhausted && !this.isCpEmpty;

    if (active) {
      this.bgCircle.setFillStyle(0x1a3848, 0.95);
      this.outerRing.setStrokeStyle(5, 0x88bbcc, 1);
      this.labelText.setColor("#cceeff");
    } else if (this.isCpEmpty || this.isExhausted) {
      this.bgCircle.setFillStyle(0x050a0e, 0.85);
      this.outerRing.setStrokeStyle(5, 0x4a5a6a, 0.85);
      this.labelText.setColor("#556677");
    } else {
      this.bgCircle.setFillStyle(0x0c1a24, 0.85);
      this.outerRing.setStrokeStyle(5, 0x8aaaba, 0.85);
      this.labelText.setColor("#99bbcc");
    }
  }

  private isDashInputActive(): boolean {
    return this.dashPressed || (this.spaceKey && this.spaceKey.isDown);
  }

  /** Returns the visual dash button container so it can be added to the UI layer */
  getContainer(): Phaser.GameObjects.Container {
    return this.dashBtn;
  }

  /** Angle (radians) from screen centre to pointer. */
  pointerAngle(): number {
    const p = this.scene.input.activePointer;
    const cx = this.scene.scale.width / 2;
    const cy = this.scene.scale.height / 2;
    return Math.atan2(p.y - cy, p.x - cx);
  }

  /** Returns true if dash is requested and CP is available. */
  isDashDown(): boolean {
    const inputActive = this.isDashInputActive();
    
    // Require releasing the input to clear the exhausted state
    if (!inputActive) {
      this.isExhausted = false;
    }
    
    // Trigger exhaustion when CP runs completely empty
    if (this.isCpEmpty) {
      this.isExhausted = true;
    }

    const effectivelyDashing = inputActive && !this.isExhausted && !this.isCpEmpty;
    this.updateVisualState();
    return effectivelyDashing;
  }

  /** Update the CP gauge rendering. */
  updateCP(ratio: number): void {
    ratio = Math.max(0, Math.min(1, ratio));
    this.isCpEmpty = ratio <= 0;
    this.updateVisualState();

    this.cpGfx.clear();
    if (ratio <= 0) return;

    const r = 54;
    const originAngle = Math.PI / 2; // Bottom
    const span = Math.PI * ratio;

    this.cpGfx.lineStyle(5, 0x44ddff, 1);
    
    // Draw right arc (from bottom upwards to the right side of the screen)
    this.cpGfx.beginPath();
    this.cpGfx.arc(0, 0, r, originAngle, originAngle - span, true);
    this.cpGfx.strokePath();

    // Draw left arc
    this.cpGfx.beginPath();
    this.cpGfx.arc(0, 0, r, originAngle, originAngle + span, false);
    this.cpGfx.strokePath();
  }
}
