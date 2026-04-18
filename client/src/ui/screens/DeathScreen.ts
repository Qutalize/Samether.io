import Phaser from "phaser";
import type { SharkRoute } from "../../network/protocol";
import type { GameScene } from "../../game/scenes/GameScene";

const ROUTE_STAGE_NAMES: Record<SharkRoute, string[]> = {
  "attack": ["シュモクザメ", "イタチザメ", "アオザメ", "ホオジロザメ", "メガロドン"],
  "non-attack": ["ドチザメ", "ネムリブカ", "シロワニ", "ウバザメ", "ジンベエザメ"],
  "deep-sea": ["ツラナガコビトザメ", "ノコギリザメ", "ラブカ", "ミツクリザメ", "ニシオンデンザメ"],
};

export class DeathScreen extends Phaser.Scene {
  private score = 0;
  private stage = 0;
  private route: SharkRoute = "attack";
  private deathSound?: Phaser.Sound.BaseSound;

  constructor() {
    super({ key: "DeathScreen" });
  }

  preload(): void {
    this.load.audio("deathse", "deathse.mp3");
  }

  init(data: { score: number; stage: number; route?: SharkRoute }): void {
    this.score = data.score;
    this.stage = data.stage;
    this.route = data.route ?? "attack";
  }

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

    /* ── black overlay with fade-in ── */
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 1);
    overlay.fillRect(0, 0, width, height);
    overlay.setAlpha(0);
    this.tweens.add({
      targets: overlay,
      alpha: 0.85,
      duration: 1200,
      ease: "Power2",
    });

    /* ── horizontal accent lines (Elden Ring style) ── */
    const lineTop = this.add.graphics();
    const lineBot = this.add.graphics();
    const lineY1 = height * 0.42;
    const lineY2 = height * 0.58;
    const lineW = width * 0.6;
    const lineX = (width - lineW) / 2;

    lineTop.lineStyle(1, 0x8b0000, 0.6);
    lineTop.beginPath();
    lineTop.moveTo(lineX, lineY1);
    lineTop.lineTo(lineX + lineW, lineY1);
    lineTop.strokePath();
    lineTop.setAlpha(0);

    lineBot.lineStyle(1, 0x8b0000, 0.6);
    lineBot.beginPath();
    lineBot.moveTo(lineX, lineY2);
    lineBot.lineTo(lineX + lineW, lineY2);
    lineBot.strokePath();
    lineBot.setAlpha(0);

    this.tweens.add({
      targets: [lineTop, lineBot],
      alpha: 1,
      duration: 800,
      delay: 1000,
      ease: "Power1",
    });

    /* ── YOU DIED main text ── */
    const diedText = this.add
      .text(width / 2, height * 0.5, "Y O U   D I E D", {
        fontFamily: "'Times New Roman', 'Georgia', serif",
        fontSize: "80px",
        fontStyle: "400",
        color: "#c41e1e",
        letterSpacing: 12,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    if (diedText.postFX) {
      diedText.postFX.addGlow(0x8b0000, 8, 0, false, 0.1, 16);
    }

    this.tweens.add({
      targets: diedText,
      alpha: 1,
      duration: 2000,
      delay: 600,
      ease: "Power2",
    });

    /* ── score / stage info (fade in after main text) ── */
    const stageIndex = Math.max(0, this.stage - 1);
    const names = ROUTE_STAGE_NAMES[this.route];
    const stageName = names[Math.min(stageIndex, names.length - 1)];

    const infoText = this.add
      .text(
        width / 2,
        height * 0.65,
        `${stageName}  ─  Score ${this.score}`,
        {
          fontFamily: "'Times New Roman', 'Georgia', serif",
          fontSize: "22px",
          color: "#aa8866",
          letterSpacing: 4,
        },
      )
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: infoText,
      alpha: 1,
      duration: 1200,
      delay: 2400,
      ease: "Power1",
    });

    /* ── return button (appears last, subtle) ── */
    const returnBtn = this.add
      .text(width / 2, height * 0.82, "ホームへ戻る", {
        fontFamily: "'Times New Roman', 'Georgia', serif",
        fontSize: "20px",
        color: "#665544",
        letterSpacing: 6,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => returnBtn.setColor("#ccaa88"))
      .on("pointerout", () => returnBtn.setColor("#665544"))
      .on("pointerdown", () => this.scene.start("HomeScreen"));

    this.tweens.add({
      targets: returnBtn,
      alpha: 1,
      duration: 800,
      delay: 3200,
      ease: "Power1",
    });
  }
}
