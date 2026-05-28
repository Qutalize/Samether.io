import Phaser from "phaser";
import { net } from "../../network/websocket";
import { SharkRoute } from "../../network/protocol";
import { getTodayDistance, loadCp } from "../../storage/cp";
import { getSession, logout } from "../../storage/auth";
import { styledButton } from "../styledButton";

const SERIF = "'Times New Roman', 'Georgia', serif";

const DAILY_BONUS_TIERS = [
  { threshold: 4000, maxCp: 100, stage: 1 },
  { threshold: 3000, maxCp: 100, stage: 0 },
  { threshold: 2000, maxCp: 80, stage: 0 },
  { threshold: 1000, maxCp: 50, stage: 0 },
  { threshold: 500, maxCp: 30, stage: 0 },
  { threshold: 0, maxCp: 10, stage: 0 },
] as const;

function formatStartCp(maxCp: number): string {
  const start = maxCp / 2;
  return Number.isInteger(start) ? String(start) : start.toFixed(1);
}

function tierLabel(tier: (typeof DAILY_BONUS_TIERS)[number]): string {
  const start = formatStartCp(tier.maxCp);
  if (tier.stage === 1) {
    return `Stage 1 / MaxCP ${tier.maxCp} (開始 ${start})`;
  }
  return `MaxCP ${tier.maxCp} (開始 ${start})`;
}

function formatDailyDistanceText(meters: number): string {
  const dist = Math.round(meters);
  let tierIndex = DAILY_BONUS_TIERS.length - 1;
  for (let i = 0; i < DAILY_BONUS_TIERS.length; i++) {
    if (meters >= DAILY_BONUS_TIERS[i].threshold) {
      tierIndex = i;
      break;
    }
  }
  const current = DAILY_BONUS_TIERS[tierIndex];
  const next = tierIndex > 0 ? DAILY_BONUS_TIERS[tierIndex - 1] : null;
  const lines = [`本日の歩行距離: ${dist} m  (開始ボーナス: ${tierLabel(current)})`];
  if (next) {
    lines.push(`次のボーナス (${tierLabel(next)}) まで: ${Math.ceil(next.threshold - meters)} m`);
  } else {
    lines.push("最大ボーナス達成!");
  }
  return lines.join("\n");
}

export class HomeScreen extends Phaser.Scene {
  private playerName = "";
  private selectedRoute: SharkRoute = "attack";
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private lineGfx!: Phaser.GameObjects.Graphics;
  private cpText!: Phaser.GameObjects.Text;
  private dailyDistText!: Phaser.GameObjects.Text;
  private playBtn!: Phaser.GameObjects.Text;
  private cpBtn!: Phaser.GameObjects.Text;
  private guideBtn!: Phaser.GameObjects.Text;
  private logoutBtn!: Phaser.GameObjects.Text;
  private routeButtons: Phaser.GameObjects.Text[] = [];
  private resizeHandler!: (size: Phaser.Structs.Size) => void;

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

    this.cameras.main.setBackgroundColor("#030a14");

    this.titleText = this.add.text(0, 0, "S A M E T H E R . I O", {
      fontFamily: SERIF,
      fontSize: "52px",
      color: "#88ccee",
      letterSpacing: 10,
    }).setOrigin(0.5);

    this.subtitleText = this.add.text(0, 0, `ようこそ、${this.playerName}`, {
      fontFamily: SERIF,
      fontSize: "24px",
      color: "#88aacc",
      letterSpacing: 6,
    }).setOrigin(0.5);

    this.lineGfx = this.add.graphics();

    this.createRouteButtons();

    this.cpText = this.add.text(0, 0, `所持 CP: ${loadCp()}`, {
      fontFamily: SERIF,
      fontSize: "18px",
      color: "#6688aa",
    }).setOrigin(0.5);

    this.dailyDistText = this.add.text(0, 0, formatDailyDistanceText(getTodayDistance()), {
      fontFamily: SERIF,
      fontSize: "15px",
      color: "#557799",
      align: "center",
      lineSpacing: 4,
    }).setOrigin(0.5);

    this.playBtn = styledButton(this,"─  P L A Y  ─", "28px", "#44ff88", "#88ffbb", 0x22aa55, 8);
    this.playBtn.on("pointerdown", () => this.tryStart());

    this.input.keyboard?.on("keydown-ENTER", () => this.tryStart());

    this.cpBtn = styledButton(this,"─  C P 獲 得  ─", "22px", "#ffaa44", "#ffcc88", 0xaa7722, 6);
    this.cpBtn.on("pointerdown", () => this.scene.start("CPScreen"));

    this.guideBtn = styledButton(this,"─  ガイド  ─", "20px", "#6688aa", "#88bbdd", 0x446688, 6);
    this.guideBtn.on("pointerdown", () => this.scene.start("GuideScreen"));

    this.logoutBtn = styledButton(this,"─  ログアウト  ─", "18px", "#884444", "#ff6666", 0x882222, 4);
    this.logoutBtn.on("pointerdown", () => {
      logout();
      this.scene.start("LoginScreen");
    });

    this.layout(this.scale.width, this.scale.height);

    this.resizeHandler = (size: Phaser.Structs.Size) => {
      this.layout(size.width, size.height);
    };
    this.scale.on("resize", this.resizeHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.resizeHandler);
    });
  }

  private layout(width: number, height: number): void {
    this.titleText.setPosition(width / 2, height * 0.22);
    this.subtitleText.setPosition(width / 2, height * 0.30);

    const lineW = width * 0.45;
    const lineX = (width - lineW) / 2;
    const lineY = height * 0.34;
    this.lineGfx.clear();
    this.lineGfx.lineStyle(1, 0x225588, 0.4);
    this.lineGfx.beginPath();
    this.lineGfx.moveTo(lineX, lineY);
    this.lineGfx.lineTo(lineX + lineW, lineY);
    this.lineGfx.strokePath();

    this.layoutRouteButtons(width / 2, height * 0.46);
    this.cpText.setPosition(width / 2, height * 0.56).setText(`所持 CP: ${loadCp()}`);
    this.dailyDistText
      .setPosition(width / 2, height * 0.62)
      .setText(formatDailyDistanceText(getTodayDistance()));
    this.playBtn.setPosition(width / 2, height * 0.69);
    this.cpBtn.setPosition(width / 2, height * 0.76);
    this.guideBtn.setPosition(width / 2, height * 0.83);
    this.logoutBtn.setPosition(width / 2, height * 0.90);
  }

  private createRouteButtons(): void {
    const routes: { id: SharkRoute; label: string; color: string }[] = [
      { id: "attack", label: "攻撃系\n(シュモクザメ)", color: "#ff6666" },
      { id: "non-attack", label: "非攻撃系\n(ドチザメ)", color: "#66ccff" },
      { id: "deep-sea", label: "深海魚系\n(コビトザメ)", color: "#bb66ff" },
      { id: "human", label: "？", color: "#ffcc88" },
    ];

    this.routeButtons = routes.map((route) =>
      this.add.text(0, 0, route.label, {
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
          this.updateButtonStyles(this.routeButtons, routes);
        }),
    );

    this.updateButtonStyles(this.routeButtons, routes);
  }

  private layoutRouteButtons(centerX: number, y: number): void {
    const spacing = Math.min(140, this.scale.width * 0.24);
    this.routeButtons.forEach((btn, index) => {
      btn.setPosition(centerX + (index - 1.5) * spacing, y);
    });
  }

  private updateButtonStyles(buttons: Phaser.GameObjects.Text[], routes: { id: SharkRoute; color: string }[]): void {
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
      net.send({
        type: "join",
        payload: {
          name: this.playerName,
          route: this.selectedRoute,
          dailyDistance: getTodayDistance(),
        },
      });
      this.scene.start("GameScene", { name: this.playerName, route: this.selectedRoute });
    } catch (e) {
      console.error("connect failed", e);
    }
  }
}
