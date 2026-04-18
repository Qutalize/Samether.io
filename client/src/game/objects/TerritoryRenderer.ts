import Phaser from "phaser";
import { SharkRoute } from "../../network/protocol";

export const TERRITORY_RENDERING_ENABLED = true;

const ROUTE_HIGHLIGHT_COLORS: Record<SharkRoute, number> = {
  attack: 0xff6666,
  "non-attack": 0x66ccff,
  "deep-sea": 0xbb66ff,
};

export class TerritoryRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private enabled = TERRITORY_RENDERING_ENABLED;

  constructor(scene: Phaser.Scene, depth = -2) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(depth);
    this.graphics.setVisible(this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.graphics.setVisible(enabled);
    if (!enabled) {
      this.graphics.clear();
    }
  }

  render(territories: Array<Array<{ x: number; y: number }>>, route: SharkRoute): void {
    this.graphics.clear();
    if (!this.enabled || territories.length === 0) {
      return;
    }

    const baseColor = ROUTE_HIGHLIGHT_COLORS[route] ?? 0x66ccff;
    this.graphics.lineStyle(2, baseColor, 0.35);
    this.graphics.fillStyle(baseColor, 0.08);

    for (const poly of territories) {
      if (poly.length < 3) {
        continue;
      }
      this.graphics.beginPath();
      this.graphics.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) {
        this.graphics.lineTo(poly[i].x, poly[i].y);
      }
      this.graphics.closePath();
      this.graphics.fillPath();
      this.graphics.strokePath();
    }
  }

  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
