import Phaser from "phaser";
import { net } from "../../network/websocket";

export class HomeScreen extends Phaser.Scene {
  private inputEl!: HTMLInputElement;
  private pendingName = "";

  constructor() {
    super({ key: "HomeScreen" });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#001b44");

    this.add
      .text(width / 2, height * 0.3, "サメザリオ", {
        fontFamily: "system-ui",
        fontSize: "56px",
        color: "#88ccee",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.42, "Slither.io-style shark PoC", {
        fontFamily: "system-ui",
        fontSize: "18px",
        color: "#6688aa",
      })
      .setOrigin(0.5);

    // Name input: overlay a real HTML input.
    const existing = document.getElementById("name-input") as HTMLInputElement | null;
    if (existing) existing.remove();
    const input = document.createElement("input");
    input.id = "name-input";
    input.type = "text";
    input.placeholder = "名前を入力";
    input.maxLength = 16;
    Object.assign(input.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      fontSize: "20px",
      padding: "10px 16px",
      borderRadius: "6px",
      border: "1px solid #446688",
      background: "#002b5c",
      color: "#ddeeff",
      outline: "none",
      width: "240px",
      textAlign: "center",
    } as CSSStyleDeclaration);
    document.body.appendChild(input);
    input.focus();
    this.inputEl = input;

    const playBtn = this.add
      .text(width / 2, height * 0.62, "[ Play ]", {
        fontFamily: "system-ui",
        fontSize: "32px",
        color: "#44ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.tryStart());

    this.input.keyboard?.on("keydown-ENTER", () => this.tryStart());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      input.remove();
    });
  }

  private async tryStart(): Promise<void> {
    const name = this.inputEl.value.trim() || "unknown";
    this.pendingName = name;
    try {
      if (!net.isOpen()) await net.connect();
      net.send({ type: "join", payload: { name } });
      this.scene.start("GameScene", { name });
    } catch (e) {
      console.error("connect failed", e);
    }
  }
}
