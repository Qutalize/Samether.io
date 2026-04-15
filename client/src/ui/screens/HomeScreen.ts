import Phaser from "phaser";
import { net } from "../../network/websocket";
import { SharkRoute } from "../../network/protocol";

export class HomeScreen extends Phaser.Scene {
  private inputEl!: HTMLInputElement;
  private pendingName = "";
  private selectedRoute: SharkRoute = "attack"; // Default route

  constructor() {
    super({ key: "HomeScreen" });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#001b44");

    this.add
      .text(width / 2, height * 0.25, "サメザリオ", {
        fontFamily: "system-ui",
        fontSize: "56px",
        color: "#88ccee",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.35, "Slither.io-style shark PoC", {
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
      top: "45%",
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

    // Route selection UI
    this.createRouteButtons(width / 2, height * 0.58);

    const playBtn = this.add
      .text(width / 2, height * 0.72, "[ Play ]", {
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

  private createRouteButtons(centerX: number, y: number) {
    const spacing = 140;
    const routes: { id: SharkRoute; label: string; color: string }[] = [
      { id: "attack", label: "攻撃系\n(シュモクザメ)", color: "#ff6666" },
      { id: "non-attack", label: "非攻撃系\n(ドチザメ)", color: "#66ccff" },
      { id: "deep-sea", label: "深海魚系\n(コビトザメ)", color: "#bb66ff" },
    ];

    const buttons: Phaser.GameObjects.Text[] = [];

    routes.forEach((route, index) => {
      const x = centerX + (index - 1) * spacing;
      const btn = this.add.text(x, y, route.label, {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#113355",
        padding: { x: 10, y: 8 },
        align: "center",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.selectedRoute = route.id;
        this.updateButtonStyles(buttons, routes);
      });
      buttons.push(btn);
    });

    this.updateButtonStyles(buttons, routes);
  }

  private updateButtonStyles(buttons: Phaser.GameObjects.Text[], routes: {id: SharkRoute, color: string}[]) {
    buttons.forEach((btn, index) => {
      const isSelected = this.selectedRoute === routes[index].id;
      btn.setStyle({
        backgroundColor: isSelected ? "#335577" : "#113355",
        color: isSelected ? routes[index].color : "#aaaaaa",
      });
      if (isSelected) {
        btn.setStroke(routes[index].color, 2);
      } else {
        btn.setStroke("#000000", 0);
      }
    });
  }

  private async tryStart(): Promise<void> {
    const name = this.inputEl.value.trim() || "unknown";
    this.pendingName = name;
    try {
      if (!net.isOpen()) await net.connect();
      net.send({ type: "join", payload: { name, route: this.selectedRoute } });
      this.scene.start("GameScene", { name, route: this.selectedRoute });
    } catch (e) {
      console.error("connect failed", e);
    }
  }
}
