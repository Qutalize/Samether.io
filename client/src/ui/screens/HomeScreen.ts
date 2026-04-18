import Phaser from "phaser";
import { net } from "../../network/websocket";
import { SharkRoute } from "../../network/protocol";
import { loadCp } from "../../storage/cp";
import { getSession, logout } from "../../storage/auth";

export class HomeScreen extends Phaser.Scene {
  private playerName = "";
  private selectedRoute: SharkRoute = "attack";

  constructor() {
    super({ key: "HomeScreen" });
  }

  create(): void {
    const session = getSession();
    if (!session) {
      this.scene.start("LoginScreen");
      return;
    }
    this.playerName = session;

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#001b44");

    this.add
      .text(width / 2, height * 0.12, "サメザリオ", {
        fontFamily: "system-ui",
        fontSize: "56px",
        color: "#88ccee",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.22, `ようこそ、${this.playerName}`, {
        fontFamily: "system-ui",
        fontSize: "22px",
        color: "#ddeeff",
      })
      .setOrigin(0.5);

    this.createRouteButtons(width / 2, height * 0.37);

    this.add
      .text(width / 2, height * 0.52, "[ Play ]", {
        fontFamily: "system-ui",
        fontSize: "32px",
        color: "#44ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.tryStart());

    this.add
      .text(width / 2, height * 0.64, "[ CP 獲得 ]", {
        fontFamily: "system-ui",
        fontSize: "22px",
        color: "#ffaa44",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("CPScreen"));

    this.add
      .text(width / 2, height * 0.73, `所持 CP: ${loadCp()}`, {
        fontFamily: "system-ui",
        fontSize: "18px",
        color: "#6688aa",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.85, "[ ログアウト ]", {
        fontFamily: "system-ui",
        fontSize: "18px",
        color: "#ff6666",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        logout();
        this.scene.start("LoginScreen");
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
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#113355",
        padding: { x: 10, y: 8 },
        align: "center",
      })
      .setResolution(window.devicePixelRatio || 1)
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
    try {
      if (!net.isOpen()) await net.connect();
      net.send({ type: "join", payload: { name: this.playerName, route: this.selectedRoute } });
      this.scene.start("GameScene", { name: this.playerName, route: this.selectedRoute });
    } catch (e) {
      console.error("connect failed", e);
    }
  }
}
