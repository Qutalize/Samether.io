import Phaser from "phaser";
import { SharkRoute } from "../../network/protocol";

/* ── colours tuned to look like semi-transparent grey
      silhouettes against the dark ocean ──────────────────── */
const BODY_COLORS = [0x708898, 0x668090, 0x5c7488, 0x526880, 0x485c78];
const SIZE_SCALES = [1.3, 1.45, 1.6, 1.8, 2.05];

const ROUTE_GLOW_COLORS: Record<SharkRoute, number> = {
  "attack": 0xff6666,     // UIと同じ赤
  "non-attack": 0x66ccff, // UIと同じ青
  "deep-sea": 0xbb66ff    // UIと同じ紫
};

function resolveSharkTextureKey(stage: number, route: SharkRoute): string {
  if (stage <= 1) return "shark_stage01";
  if (stage <= 3) {
    if (route === "attack")     return "shark_stage2_attack";
    if (route === "non-attack") return "shark_stage2_nonatk";
    return "shark_stage2_deep";
  }
  if (route === "attack")     return "shark_stage4_attack";
  if (route === "non-attack") return "shark_stage4_nonatk";
  return "shark_stage4_deep";
}

const SEGMENT_COUNT = 24;
const BASE_SPACING = 5.5;

export class Shark extends Phaser.GameObjects.Container {
  private rope: Phaser.GameObjects.Rope;
  private nameText: Phaser.GameObjects.Text;

  private stage = 0;
  private route: SharkRoute = "attack";
  private isSelf: boolean;
  private sharkName = "";

  /* backbone simulation */
  private spine: Phaser.Math.Vector2[] = [];
  private targetX = 0;
  private targetY = 0;
  private targetAngle = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, isSelf: boolean) {
    super(scene, x, y);
    this.isSelf = isSelf;
    this.targetX = x;
    this.targetY = y;

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      this.spine.push(new Phaser.Math.Vector2(x, y));
    }

    // Initialize with a straight line, will be updated immediately
    const initialPts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) {
        initialPts.push(new Phaser.Math.Vector2(i * BASE_SPACING, 0));
    }

    // horizontal = true maps texture width along the points
    this.rope = scene.add.rope(0, 0, "shark_stage01", undefined, initialPts, true);
    this.add(this.rope);

    this.nameText = scene.add
      .text(0, -50, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.add(this.nameText);

    this.updateColors();

    scene.add.existing(this as any);
  }

  private updateColors() {
    if (!this.rope) return;
    const texKey = resolveSharkTextureKey(this.stage, this.route);
    if (this.rope.texture.key !== texKey) {
      this.rope.setTexture(texKey);
    }
    // 1. Base tint (grey silhouette)
    const color = BODY_COLORS[this.stage] ?? BODY_COLORS[0];
    const tint = this.isSelf ? color : 0x5a7a8e;
    this.rope.setColors(tint);

    // 2. Route specific glow using Phaser's standard postFX
    if (this.rope.postFX) {
      this.rope.postFX.clear();
      // Increase padding to ensure the outer glow doesn't get clipped by the bounds
      this.rope.postFX.setPadding(32);
      const glowColor = ROUTE_GLOW_COLORS[this.route];
      // addGlow(color, outerStrength, innerStrength, knockout, threshold, distance)
      this.rope.postFX.addGlow(glowColor, 4, 0, false, 0.1, 10);
    }
  }

  /* slow powerful tail undulation */
  private waveAt(p: number, t: number, i: number): number {
    if (p < 0.4) return 0;
    const f = (p - 0.4) / 0.6;
    return Math.sin(t * 0.0035 - i * 0.25) * f * f * 10;
  }

  updateFromState(
    x: number,
    y: number,
    angle: number,
    stage: number,
    t: number,
    route: SharkRoute,
    name?: string,
  ): void {
    this.targetX = x;
    this.targetY = y;
    this.targetAngle = angle;

    if (name) {
      this.sharkName = name;
      this.nameText.setText(name);
    }

    let changedAppearance = false;
    if (stage !== this.stage) {
      this.stage = stage;
      this.setScale(SIZE_SCALES[stage] ?? 1);
      changedAppearance = true;
    }
    
    if (route !== this.route) {
      this.route = route;
      changedAppearance = true;
    }

    if (changedAppearance) {
      this.updateColors();
    }

    /* rigid head segments (hardly bend) */
    this.spine[0].set(x, y);
    for (let i = 1; i < 4; i++) {
      this.spine[i].set(
        this.spine[i - 1].x - Math.cos(angle) * BASE_SPACING,
        this.spine[i - 1].y - Math.sin(angle) * BASE_SPACING,
      );
    }

    /* trailing segments follow like a rope */
    for (let i = 4; i < SEGMENT_COUNT; i++) {
      const prev = this.spine[i - 1];
      const curr = this.spine[i];
      const dist = Phaser.Math.Distance.BetweenPoints(prev, curr);
      if (dist > BASE_SPACING) {
        const a = Phaser.Math.Angle.BetweenPoints(curr, prev);
        curr.x = prev.x - Math.cos(a) * BASE_SPACING;
        curr.y = prev.y - Math.sin(a) * BASE_SPACING;
      }
    }

    /* compute display points (spine + wave offset) */
    const pts: Phaser.Math.Vector2[] = [];

    // Our image is facing RIGHT. Tail is at left (x=0), Head is at right (x=width).
    // Rope with horizontal=true maps texture x=0 to pts[0], and x=width to pts[length-1].
    // So pts[0] MUST be the TAIL, and pts[23] MUST be the HEAD.
    // spine[0] is HEAD. spine[23] is TAIL.
    for (let i = SEGMENT_COUNT - 1; i >= 0; i--) {
      const sp = this.spine[i];
      let sa = this.targetAngle;
      if (i > 0) {
        sa = Phaser.Math.Angle.BetweenPoints(this.spine[i], this.spine[i - 1]);
      }

      const prog = i / (SEGMENT_COUNT - 1);
      const wave = this.waveAt(prog, t, i);
      const norm = sa + Math.PI / 2;

      // Convert to local coordinates within the container
      const lx = sp.x + Math.cos(norm) * wave - this.targetX;
      const ly = sp.y + Math.sin(norm) * wave - this.targetY;
      
      pts.push(new Phaser.Math.Vector2(lx, ly));
    }

    this.rope.setPoints(pts);

    this.setPosition(this.targetX, this.targetY);
  }

  playEvolutionPulse(): void {
    const baseScale = SIZE_SCALES[this.stage] ?? 1;
    this.scene.tweens.add({
      targets: this,
      scaleX: baseScale * 1.35,
      scaleY: baseScale * 1.35,
      duration: 200,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.setScale(baseScale);
      },
    });
  }
}
