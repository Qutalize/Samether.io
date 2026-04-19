import Phaser from "phaser";
import type { HudComponent } from "./HudComponent";
import type { SharkRoute } from "../../network/protocol";

const STAGE_THRESHOLDS = [0, 10, 25, 50, 100];

const ROUTE_STAGE_NAMES: Record<SharkRoute, string[]> = {
  "attack": ["シュモクザメ", "イタチザメ", "アオザメ", "ホオジロザメ", "メガロドン"],
  "non-attack": ["ドチザメ", "ネムリブカ", "シロワニ", "ウバザメ", "ジンベエザメ"],
  "deep-sea": ["ツラナガコビトザメ", "ノコギリザメ", "ラブカ", "ミツクリザメ", "ニシオンデンザメ"],
  "human": ["人間", "人間", "人間", "人間", "人間"], // Humans don't evolve
};

export class XpBar implements HudComponent {
  private gfx: Phaser.GameObjects.Graphics;
  private scoreText: Phaser.GameObjects.Text;
  private stageText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    initialRoute: SharkRoute,
  ) {
    this.gfx = scene.add.graphics();
    container.add(this.gfx);

    this.scoreText = scene.add
      .text(22, 50, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#aabbcc",
      });
    container.add(this.scoreText);

    this.stageText = scene.add
      .text(22, 69, ROUTE_STAGE_NAMES[initialRoute][0], {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#88bbcc",
      });
    container.add(this.stageText);
  }

  update(xp: number, stage: number, route: SharkRoute): void {
    const isMax = stage >= STAGE_THRESHOLDS.length - 1;
    const threshold = isMax
      ? STAGE_THRESHOLDS[STAGE_THRESHOLDS.length - 1]
      : STAGE_THRESHOLDS[stage + 1];

    this.drawBar(xp, threshold);
    this.scoreText.setText(isMax ? "MAX LEVEL" : `${xp} / ${threshold} XP`);
    this.stageText.setText(
      ROUTE_STAGE_NAMES[route][
        Math.min(stage, ROUTE_STAGE_NAMES[route].length - 1)
      ],
    );
  }

  private drawBar(xp: number, threshold: number): void {
    const g = this.gfx;
    g.clear();

    const W = 310;
    const H = 30;
    const X = 16;
    const Y = 18;
    const R = 6;

    /* dark background */
    g.fillStyle(0x080808, 0.85);
    g.fillRoundedRect(X, Y, W, H, R);
    g.lineStyle(1.5, 0x223344, 0.6);
    g.strokeRoundedRect(X, Y, W, H, R);

    const ratio = Math.min(xp / threshold, 1.0);
    if (ratio <= 0) return;
    const fw = (W - 4) * ratio;

    /* red fill base */
    g.fillStyle(0xaa2020, 1);
    g.fillRoundedRect(X + 2, Y + 2, fw, H - 4, R - 1);
    /* brighter highlight top half */
    g.fillStyle(0xdd4444, 0.55);
    g.fillRoundedRect(X + 2, Y + 2, fw, (H - 4) * 0.45, R - 1);
    /* gloss line */
    g.fillStyle(0xff5555, 0.22);
    g.fillRect(X + 4, Y + 3, Math.max(fw - 4, 0), 2);
    /* leading edge glow */
    if (fw > 6) {
      g.fillStyle(0xff6666, 0.25);
      g.fillRect(X + 2 + fw - 3, Y + 4, 3, H - 8);
    }
  }

  resize(_sz: Phaser.Structs.Size): void {
    /* XP bar is anchored top-left; no resize adjustment needed */
  }

  destroy(): void {
    this.gfx.destroy();
    this.scoreText.destroy();
    this.stageText.destroy();
  }
}
