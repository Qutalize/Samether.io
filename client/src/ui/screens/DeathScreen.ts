import Phaser from "phaser";

export class DeathScreen extends Phaser.Scene {
  private score = 0;
  private stage = 0;

  constructor() {
    super({ key: "DeathScreen" });
  }

  init(data: { score: number; stage: number }): void {
    this.score = data.score;
    this.stage = data.stage;
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#001b44");

    this.add
      .text(width / 2, height * 0.3, "You Died", {
        fontFamily: "system-ui",
        fontSize: "72px",
        color: "#ff6666",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.45, `最終スコア: ${this.score}`, {
        fontFamily: "system-ui",
        fontSize: "28px",
        color: "#ddeeff",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.52, `到達段階: ${this.stage}/5`, {
        fontFamily: "system-ui",
        fontSize: "24px",
        color: "#ddeeff",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.7, "[ ホームへ戻る ]", {
        fontFamily: "system-ui",
        fontSize: "28px",
        color: "#44ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("HomeScreen"));
  }
}
