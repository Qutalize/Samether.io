import Phaser from "phaser";
import { addCp, loadCp } from "../../storage/cp";

const SERIF = "'Times New Roman', 'Georgia', serif";

const METERS_PER_CP = 1;
const MAX_EARN_PER_SESSION = 100;
const GEO_TIMEOUT_MS = 10000;

type Phase = "idle" | "measuring" | "finalizing" | "done";

export class CPScreen extends Phaser.Scene {
  private cpDisplayText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Text;
  private goalBtn!: Phaser.GameObjects.Text;

  private startCoords: { lat: number; lon: number } | null = null;
  private phase: Phase = "idle";

  constructor() {
    super({ key: "CPScreen" });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#030a14");

    /* ── title ── */
    const title = this.add
      .text(width / 2, height * 0.12, "C P  獲 得", {
        fontFamily: SERIF,
        fontSize: "52px",
        color: "#88ccee",
        letterSpacing: 10,
      })
      .setOrigin(0.5);

    if (title.postFX) {
      title.postFX.addGlow(0x225588, 6, 0, false, 0.1, 12);
    }

    /* ── accent lines ── */
    const lineW = width * 0.45;
    const lineX = (width - lineW) / 2;
    const lineGfx = this.add.graphics();
    lineGfx.lineStyle(1, 0x225588, 0.4);
    lineGfx.beginPath();
    lineGfx.moveTo(lineX, height * 0.19);
    lineGfx.lineTo(lineX + lineW, height * 0.19);
    lineGfx.strokePath();

    /* ── CP display ── */
    this.cpDisplayText = this.add
      .text(width / 2, height * 0.25, `所持 CP: ${loadCp()}`, {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#6688aa",
      })
      .setOrigin(0.5);

    /* ── instructions ── */
    this.add
      .text(
        width / 2,
        height * 0.35,
        `スタート地点で [ スタート ]、目的地で [ ゴール ] を押してください\n移動距離 ${METERS_PER_CP} m につき 1 CP (1 回最大 ${MAX_EARN_PER_SESSION} CP)`,
        {
          fontFamily: SERIF,
          fontSize: "15px",
          color: "#4a6a8a",
          align: "center",
          letterSpacing: 2,
        },
      )
      .setOrigin(0.5);

    /* ── status ── */
    this.statusText = this.add
      .text(width / 2, height * 0.48, "待機中", {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#4a6a8a",
      })
      .setOrigin(0.5);

    /* ── start button ── */
    this.startBtn = this.add
      .text(width / 2, height * 0.60, "─  スタート  ─", {
        fontFamily: SERIF,
        fontSize: "28px",
        color: "#44ff88",
        letterSpacing: 8,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.handleStart());

    if (this.startBtn.postFX) {
      this.startBtn.postFX.addGlow(0x22aa55, 4, 0, false, 0.1, 8);
    }

    /* ── goal button ── */
    this.goalBtn = this.add
      .text(width / 2, height * 0.72, "[ ゴール ]", {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#555555",
        letterSpacing: 4,
      })
      .setOrigin(0.5)
      .on("pointerdown", () => this.handleGoal());

    /* ── back button ── */
    this.add
      .text(width / 2, height * 0.87, "[ ホームへ戻る ]", {
        fontFamily: SERIF,
        fontSize: "18px",
        color: "#6688aa",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("HomeScreen"));

    this.applyPhase();
  }

  private handleStart(): void {
    if (this.phase !== "idle" && this.phase !== "done") return;
    if (!navigator.geolocation) {
      this.setStatus("位置情報が利用できません", "#ff6666");
      return;
    }

    this.phase = "measuring";
    this.applyPhase();
    this.setStatus("現在地を取得中...", "#ffdd44");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.startCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        this.setStatus("計測中... 目的地へ移動して [ ゴール ] を押してください", "#44ff88");
      },
      (err) => {
        this.phase = "idle";
        this.applyPhase();
        this.setStatus(`位置情報エラー: ${err.message}`, "#ff6666");
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS },
    );
  }

  private handleGoal(): void {
    if (this.phase !== "measuring" || !this.startCoords) return;

    this.phase = "finalizing";
    this.applyPhase();
    this.setStatus("終了地点を取得中...", "#ffdd44");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = this.haversineMeters(
          this.startCoords!.lat,
          this.startCoords!.lon,
          pos.coords.latitude,
          pos.coords.longitude,
        );
        const earned = Math.min(
          Math.floor(dist / METERS_PER_CP),
          MAX_EARN_PER_SESSION,
        );
        const newTotal = earned > 0 ? addCp(earned) : loadCp();
        this.cpDisplayText.setText(`所持 CP: ${newTotal}`);
        this.setStatus(
          `距離: ${Math.round(dist)} m  /  +${earned} CP\n合計 ${newTotal} CP`,
          "#44ff88",
        );
        this.startCoords = null;
        this.phase = "done";
        this.applyPhase();
      },
      (err) => {
        this.phase = "measuring";
        this.applyPhase();
        this.setStatus(`位置情報エラー: ${err.message}`, "#ff6666");
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS },
    );
  }

  /** UI state derived from phase. Buttons' enable/disable live here only. */
  private applyPhase(): void {
    const setEnabled = (btn: Phaser.GameObjects.Text, enabled: boolean, activeColor: string) => {
      if (enabled) {
        btn.setInteractive({ useHandCursor: true }).setColor(activeColor);
      } else {
        btn.disableInteractive().setColor("#555555");
      }
    };

    switch (this.phase) {
      case "idle":
        setEnabled(this.startBtn, true, "#44ff88");
        setEnabled(this.goalBtn, false, "#ffaa44");
        break;
      case "measuring":
        setEnabled(this.startBtn, false, "#44ff88");
        setEnabled(this.goalBtn, true, "#ffaa44");
        break;
      case "finalizing":
        setEnabled(this.startBtn, false, "#44ff88");
        setEnabled(this.goalBtn, false, "#ffaa44");
        break;
      case "done":
        setEnabled(this.startBtn, true, "#44ff88");
        setEnabled(this.goalBtn, false, "#ffaa44");
        break;
    }
  }

  private setStatus(msg: string, color: string): void {
    this.statusText.setText(msg).setColor(color);
  }

  private haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
