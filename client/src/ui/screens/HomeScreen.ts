import Phaser from "phaser";
import { net } from "../../network/websocket";
import { SharkRoute } from "../../network/protocol";
import { loadCp } from "../../storage/cp";
import { getSession, logout } from "../../storage/auth";

const SERIF = "'Times New Roman', 'Georgia', serif";

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
    this.cameras.main.setBackgroundColor("#030a14");

    /* ── title ── */
    const title = this.add
      .text(width / 2, height * 0.22, "S A M E T H E R . I O", {
        fontFamily: SERIF,
        fontSize: "52px",
        color: "#88ccee",
        letterSpacing: 10,
      })
      .setOrigin(0.5);

    if (title.postFX) {
      title.postFX.addGlow(0x225588, 6, 0, false, 0.1, 12);
    }

    /* ── subtitle ── */
    this.add
      .text(width / 2, height * 0.30, `ようこそ、${this.playerName}`, {
        fontFamily: SERIF,
        fontSize: "16px",
        color: "#4a6a8a",
        letterSpacing: 6,
      })
      .setOrigin(0.5);

    /* ── accent lines ── */
    const lineW = width * 0.45;
    const lineX = (width - lineW) / 2;
    const lineGfx = this.add.graphics();
    lineGfx.lineStyle(1, 0x225588, 0.4);
    lineGfx.beginPath();
    lineGfx.moveTo(lineX, height * 0.34);
    lineGfx.lineTo(lineX + lineW, height * 0.34);
    lineGfx.strokePath();

    /* ── route selection ── */
    this.createRouteButtons(width / 2, height * 0.48);

    /* ── CP display ── */
    this.add
      .text(width / 2, height * 0.62, `所持 CP: ${loadCp()}`, {
        fontFamily: SERIF,
        fontSize: "18px",
        color: "#6688aa",
      })
      .setOrigin(0.5);

    /* ── play button ── */
    const playBtn = this.add
      .text(width / 2, height * 0.70, "─  P L A Y  ─", {
        fontFamily: SERIF,
        fontSize: "28px",
        color: "#44ff88",
        letterSpacing: 8,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => playBtn.setColor("#88ffbb"))
      .on("pointerout", () => playBtn.setColor("#44ff88"))
      .on("pointerdown", () => this.tryStart());

    if (playBtn.postFX) {
      playBtn.postFX.addGlow(0x22aa55, 4, 0, false, 0.1, 8);
    }

    this.input.keyboard?.on("keydown-ENTER", () => this.tryStart());

    /* ── CP earn button ── */
    this.add
      .text(width / 2, height * 0.80, "[ CP 獲得 ]", {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#ffaa44",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("CPScreen"));

    /* ── logout button ── */
    this.add
      .text(width / 2, height * 0.88, "[ ログアウト ]", {
        fontFamily: SERIF,
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
    const spacing = 160;
    const routes: { id: SharkRoute; label: string; color: string }[] = [
      { id: "attack", label: "攻撃系\n(シュモクザメ)", color: "#ff6666" },
      { id: "non-attack", label: "非攻撃系\n(ドチザメ)", color: "#66ccff" },
      { id: "deep-sea", label: "深海魚系\n(コビトザメ)", color: "#bb66ff" },
    ];

    const buttons: Phaser.GameObjects.Text[] = [];

    routes.forEach((route, index) => {
      const x = centerX + (index - 1) * spacing;
      const btn = this.add.text(x, y, route.label, {
        fontFamily: SERIF,
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#0a1a2a",
        padding: { x: 12, y: 10 },
        align: "center",
        letterSpacing: 2,
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
        backgroundColor: isSelected ? "#152535" : "#0a1a2a",
        color: isSelected ? routes[index].color : "#667788",
      });
      if (isSelected) {
        btn.setStroke(routes[index].color, 1);
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
