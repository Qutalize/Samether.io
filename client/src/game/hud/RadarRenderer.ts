import Phaser from "phaser";
import type { HudComponent } from "./HudComponent";
import type { SharkRoute } from "../../network/protocol";

const RADAR_R = 90;
const RADAR_RANGE = 1400;
const RADAR_M = 28;
const TAU = Math.PI * 2;

export interface RadarBlip {
  id: string;
  x: number;
  y: number;
}

export interface RadarFood {
  x: number;
  y: number;
  isRed?: boolean;
}

export class RadarRenderer implements HudComponent {
  private gfx: Phaser.GameObjects.Graphics;
  private scaleManager: Phaser.Scale.ScaleManager;
  private myRoute: SharkRoute;

  private sweep = 0;
  private myId = "";
  private myX = 0;
  private myY = 0;
  private myAngle = 0;
  private sharks: RadarBlip[] = [];
  private foods: RadarFood[] = [];

  constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container, myRoute: SharkRoute) {
    this.myRoute = myRoute;
    this.scaleManager = scene.scale;
    this.gfx = scene.add.graphics();
    container.add(this.gfx);
    scene.scale.on("resize", (sz: Phaser.Structs.Size) => this.resize(sz));
  }

  setBlips(
    myId: string,
    myX: number,
    myY: number,
    myAngle: number,
    sharks: RadarBlip[],
    foods: RadarFood[],
  ): void {
    this.myId = myId;
    this.myX = myX;
    this.myY = myY;
    this.myAngle = myAngle;
    this.sharks = sharks;
    this.foods = foods;
  }

  tick(delta: number): void {
    this.sweep = (this.sweep + delta * 0.0008) % TAU;
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const cx = RADAR_M + RADAR_R;
    const cy = this.scaleManager.height - RADAR_M - RADAR_R;
    const r = RADAR_R;

    /* dark circle background */
    g.fillStyle(0x040e18, 0.85);
    g.fillCircle(cx, cy, r);

    /* sonar sweep trail (fading pie sector) */
    const steps = 16;
    const arc = Math.PI * 0.4;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const a0 = this.sweep - (arc * (i + 1)) / steps;
      const a1 = this.sweep - (arc * i) / steps;
      g.fillStyle(0x22aacc, 0.1 * (1 - t));
      g.slice(cx, cy, r - 1, a0, a1, false);
      g.fillPath();
    }

    /* sweep line */
    g.lineStyle(1.5, 0x44ddff, 0.35);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(
      cx + Math.cos(this.sweep) * (r - 2),
      cy + Math.sin(this.sweep) * (r - 2),
    );
    g.strokePath();

    /* concentric grid rings */
    g.lineStyle(0.5, 0x1a4060, 0.5);
    g.strokeCircle(cx, cy, r * 0.33);
    g.strokeCircle(cx, cy, r * 0.66);

    /* crosshair lines */
    g.lineStyle(0.5, 0x1a4060, 0.4);
    g.beginPath();
    g.moveTo(cx - r, cy);
    g.lineTo(cx + r, cy);
    g.moveTo(cx, cy - r);
    g.lineTo(cx, cy + r);
    g.strokePath();

    /* outer ring */
    g.lineStyle(2, 0x2288aa, 0.85);
    g.strokeCircle(cx, cy, r);

    const s = r / RADAR_RANGE;

    /* ルート別の食べ物・敵表示 */
    for (const f of this.foods) {
      const dx = (f.x - this.myX) * s;
      const dy = (f.y - this.myY) * s;
      if (dx * dx + dy * dy >= (r - 2) * (r - 2)) continue;

      if (this.myRoute === "attack") {
        // 攻撃種: 赤い餌（死体）は明るく、通常餌は薄く
        if (f.isRed) {
          g.fillStyle(0xff4444, 0.85);
          g.fillCircle(cx + dx, cy + dy, 2.5);
        } else {
          g.fillStyle(0x44ee88, 0.25);
          g.fillCircle(cx + dx, cy + dy, 1.5);
        }
      } else if (this.myRoute === "non-attack") {
        // 非攻撃種: 通常餌（緑）のみ明るく、赤い餌は薄く
        if (!f.isRed) {
          g.fillStyle(0x44ee88, 0.85);
          g.fillCircle(cx + dx, cy + dy, 2.5);
        } else {
          g.fillStyle(0xff4444, 0.20);
          g.fillCircle(cx + dx, cy + dy, 1.5);
        }
      } else {
        // 深海種: 全種類の餌を薄く表示
        g.fillStyle(f.isRed ? 0xff8888 : 0x44ee88, 0.25);
        g.fillCircle(cx + dx, cy + dy, 1.5);
      }
    }

    /* 敵サメブリップ */
    for (const sh of this.sharks) {
      if (sh.id === this.myId) continue;
      const dx = (sh.x - this.myX) * s;
      const dy = (sh.y - this.myY) * s;
      const d2 = dx * dx + dy * dy;
      if (d2 >= (r - 4) * (r - 4)) continue;

      // 攻撃種: 敵を明るく表示 / 非攻撃・深海種: 薄く表示
      const alpha = this.myRoute === "attack" ? 0.85 : 0.35;
      const glowAlpha = this.myRoute === "attack" ? 0.25 : 0.10;
      g.fillStyle(0xff4444, glowAlpha);
      g.fillCircle(cx + dx, cy + dy, 5);
      g.fillStyle(0xff4444, alpha);
      g.fillCircle(cx + dx, cy + dy, 2.5);
    }

    /* player direction arrow (center) */
    const a = this.myAngle;
    const al = 10;
    const aw = 6;
    const tipX = cx + Math.cos(a) * al;
    const tipY = cy + Math.sin(a) * al;
    const ba = a + Math.PI;
    const lx = cx + Math.cos(ba + 0.5) * aw;
    const ly = cy + Math.sin(ba + 0.5) * aw;
    const rx = cx + Math.cos(ba - 0.5) * aw;
    const ry = cy + Math.sin(ba - 0.5) * aw;

    /* arrow glow */
    g.fillStyle(0x44ddff, 0.12);
    g.fillTriangle(
      cx + Math.cos(a) * (al + 4),
      cy + Math.sin(a) * (al + 4),
      cx + Math.cos(ba + 0.55) * (aw + 3),
      cy + Math.sin(ba + 0.55) * (aw + 3),
      cx + Math.cos(ba - 0.55) * (aw + 3),
      cy + Math.sin(ba - 0.55) * (aw + 3),
    );
    /* arrow body */
    g.fillStyle(0x44ddff, 0.9);
    g.fillTriangle(tipX, tipY, lx, ly, rx, ry);
  }

  resize(_sz: Phaser.Structs.Size): void {
    /* Radar position is recalculated from scaleManager.height each draw */
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
