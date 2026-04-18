import Phaser from "phaser";
import { addCp, loadCp } from "../../storage/cp";

const METERS_PER_CP = 50;
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
    this.cameras.main.setBackgroundColor("#001b44");

    this.add
      .text(width / 2, height * 0.15, "CP 獲得", {
        fontFamily: "system-ui",
        fontSize: "48px",
        color: "#88ccee",
      })
      .setOrigin(0.5);

    this.cpDisplayText = this.add
      .text(width / 2, height * 0.27, `所持 CP: ${loadCp()}`, {
        fontFamily: "system-ui",
        fontSize: "24px",
        color: "#ddeeff",
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        height * 0.37,
        `スタート地点で [ スタート ]、目的地で [ ゴール ] を押してください\n移動距離 ${METERS_PER_CP} m につき 1 CP (1 回最大 ${MAX_EARN_PER_SESSION} CP)`,
        {
          fontFamily: "system-ui",
          fontSize: "15px",
          color: "#6688aa",
          align: "center",
        },
      )
      .setOrigin(0.5);

    this.statusText = this.add
      .text(width / 2, height * 0.5, "待機中", {
        fontFamily: "system-ui",
        fontSize: "22px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5);

    this.startBtn = this.add
      .text(width / 2, height * 0.62, "[ スタート ]", {
        fontFamily: "system-ui",
        fontSize: "32px",
        color: "#44ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.handleStart());

    this.goalBtn = this.add
      .text(width / 2, height * 0.73, "[ ゴール ]", {
        fontFamily: "system-ui",
        fontSize: "32px",
        color: "#555555",
      })
      .setOrigin(0.5)
      .on("pointerdown", () => this.handleGoal());

    this.add
      .text(width / 2, height * 0.87, "[ ホームへ戻る ]", {
        fontFamily: "system-ui",
        fontSize: "22px",
        color: "#6688aa",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("HomeScreen"));

    this.applyPhase();
  }

  private handleStart(): void {
    if (this.phase !== "idle") return;
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
