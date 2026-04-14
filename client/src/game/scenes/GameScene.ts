import Phaser from "phaser";
import { net } from "../../network/websocket";
import type {
  ServerMsg,
  StatePayload,
  WelcomePayload,
  DeathPayload,
  LeaderboardPayload,
  StateSharkView,
  StateFoodView,
} from "../../network/protocol";
import { Shark } from "../objects/Shark";
import { Food } from "../objects/Food";
import { InputController } from "../input";

/* ── constants ─────────────────────────────────────────────── */
const STAGE_THRESHOLDS = [0, 10, 25, 50, 100];
const STAGE_ZOOMS = [1.0, 0.93, 0.88, 0.82, 0.76];
const STAGE_NAMES = [
  "シュモクザメ",
  "イタチザメ",
  "アオザメ",
  "ホオジロザメ",
  "メガロドン",
];

const RADAR_R = 90;
const RADAR_RANGE = 1400;
const RADAR_M = 28;
const TAU = Math.PI * 2;

/* seeded hash for ocean floor noise */
function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

/* ═══════════════════════════════════════════════════════════ */
export class GameScene extends Phaser.Scene {
  /* world */
  private worldW = 4000;
  private worldH = 4000;
  private myId = "";
  private myName = "";

  /* entities */
  private sharks = new Map<string, Shark>();
  private foods = new Map<string, Food>();

  /* input */
  private input2!: InputController;

  /* mock CP */
  private mockCp = 100;
  private mockCpMax = 100;
  private cpRecoverRate = 10; // per second (slower recovery)
  private cpConsumeRate = 50; // per second

  /* layers */
  private worldContainer!: Phaser.GameObjects.Container;
  private uiContainer!: Phaser.GameObjects.Container;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;

  /* background layers */
  private worldBorder!: Phaser.GameObjects.Graphics;
  // private oceanFloor!: Phaser.GameObjects.TileSprite;

  /* HUD */
  private xpGfx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private leaderGfx!: Phaser.GameObjects.Graphics;
  private leaderText!: Phaser.GameObjects.Text;

  /* radar */
  private radarGfx!: Phaser.GameObjects.Graphics;
  private radarSweep = 0;
  private lastMyX = 0;
  private lastMyY = 0;
  private lastMyAngle = 0;
  private cachedSharks: { id: string; x: number; y: number }[] = [];
  private cachedFoods: { x: number; y: number }[] = [];

  /* atmosphere */
  private vignette!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { name: string }): void {
    this.myName = data.name;
  }

  preload(): void {
    this.load.image("shark", "shark.png");
  }

  /* ════════════════════════════════════════════════════════ */
  /*  CREATE                                                  */
  /* ════════════════════════════════════════════════════════ */
  create(): void {
    this.cameras.main.setBackgroundColor("#001b44");
    this.ensureTextures();
    this.createSharkTexture();

    /* Layers setup */
    this.worldContainer = this.add.container(0, 0);
    this.uiContainer = this.add.container(0, 0).setDepth(1000);

    /* world boundary */
    this.worldBorder = this.add.graphics().setDepth(0);
    this.drawWorldBorder();
    this.worldContainer.add(this.worldBorder);

    /* input controller */
    this.input2 = new InputController(this);
    this.uiContainer.add(this.input2.getContainer());

    /* ── HUD ────────────────── */
    this.xpGfx = this.add.graphics();
    this.uiContainer.add(this.xpGfx);

    this.scoreText = this.add.text(22, 50, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#aabbcc",
    });
    this.uiContainer.add(this.scoreText);

    this.stageText = this.add.text(22, 70, STAGE_NAMES[0], {
      fontFamily: "system-ui, sans-serif",
      fontSize: "11px",
      color: "#556677",
    });
    this.uiContainer.add(this.stageText);

    /* leader panel */
    this.leaderGfx = this.add.graphics();
    this.uiContainer.add(this.leaderGfx);

    this.leaderText = this.add.text(this.scale.width / 2, 16, "👑 Top Predator: ---", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "17px",
      fontStyle: "bold",
      color: "#ffffff",
    }).setOrigin(0.5, 0);
    this.uiContainer.add(this.leaderText);
    this.drawLeaderPanel();

    /* radar */
    this.radarGfx = this.add.graphics();
    this.uiContainer.add(this.radarGfx);

    /* vignette */
    this.createVignette();
    this.uiContainer.add(this.vignette);

    /* Camera setup: Main camera ignores UI, UI camera ignores World */
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);
    this.cameras.main.ignore(this.uiContainer);
    this.uiCamera.ignore(this.worldContainer);

    /* resize */
    this.scale.on("resize", (sz: Phaser.Structs.Size) => {
      this.leaderText.setX(sz.width / 2);
      this.drawLeaderPanel();
      this.resizeVignette(sz.width, sz.height, 1.0);
      this.uiCamera.setSize(sz.width, sz.height);
    });

    /* network */
    net.onMessage((m) => this.handleServer(m));
    this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => this.sendInput(),
    });
  }

  /* ════════════════════════════════════════════════════════ */
  /*  UPDATE (every frame)                                    */
  /* ════════════════════════════════════════════════════════ */
  update(time: number, delta: number): void {
    /* animate food glow */
    for (const f of this.foods.values()) f.tickAnim(time);

    /* radar sweep rotation */
    this.radarSweep = (this.radarSweep + delta * 0.0008) % TAU;
    this.drawRadar();

    /* mock CP update */
    if (this.input2) {
      const isDashing = this.input2.isDashDown();
      if (isDashing && this.mockCp > 0) {
        this.mockCp -= this.cpConsumeRate * (delta / 1000);
        if (this.mockCp < 0) this.mockCp = 0;
      } else if (!isDashing && this.mockCp < this.mockCpMax) {
        this.mockCp += this.cpRecoverRate * (delta / 1000);
        if (this.mockCp > this.mockCpMax) this.mockCp = this.mockCpMax;
      }
      this.input2.updateCP(this.mockCp / this.mockCpMax);
    }
  }

  /* ════════════════════════════════════════════════════════ */
  /*  PROCEDURAL TEXTURES                                     */
  /* ════════════════════════════════════════════════════════ */
  private ensureTextures(): void {
    if (!this.textures.exists("ocean_floor")) this.genOceanFloor();
    this.createFoodTextures();
  }

  private createFoodTextures(): void {
    if (this.textures.exists("food_green")) return;
    
    // Draw green food to canvas
    const size = 16;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    
    // Green
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(85, 255, 170, 0.25)"; // 0x55ffaa
    ctx.beginPath(); ctx.arc(8, 8, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(85, 255, 170, 0.9)";
    ctx.beginPath(); ctx.arc(8, 8, 4, 0, Math.PI * 2); ctx.fill();
    this.textures.addCanvas("food_green", canvas);

    // Red
    const canvasRed = document.createElement("canvas");
    canvasRed.width = size;
    canvasRed.height = size;
    const ctxRed = canvasRed.getContext("2d")!;
    ctxRed.clearRect(0, 0, size, size);
    ctxRed.fillStyle = "rgba(255, 85, 85, 0.25)"; // 0xff5555
    ctxRed.beginPath(); ctxRed.arc(8, 8, 8, 0, Math.PI * 2); ctxRed.fill();
    ctxRed.fillStyle = "rgba(255, 85, 85, 0.9)";
    ctxRed.beginPath(); ctxRed.arc(8, 8, 4, 0, Math.PI * 2); ctxRed.fill();
    this.textures.addCanvas("food_red", canvasRed);
  }

  private createSharkTexture(): void {
    if (this.textures.exists("shark_small")) return;
    const src = this.textures.get("shark").getSourceImage() as HTMLImageElement;
    if (!src) return;
    const canvas = document.createElement("canvas");
    canvas.width = 130;
    canvas.height = 71;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(src, 0, 0, 130, 71);
    
    const imgData = ctx.getImageData(0, 0, 130, 71);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) { // If not fully transparent
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    this.textures.addCanvas("shark_small", canvas);
  }

  /** Subtle dark ocean floor with low-frequency noise */
  private genOceanFloor(): void {
    const S = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(S, S);
    const d = img.data;

    const f = (n: number) => (n * TAU) / S;

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n =
          Math.sin(x * f(2)) * Math.cos(y * f(3)) * 0.3 +
          Math.sin(x * f(1) + y * f(2)) * 0.2 +
          hash(x * 137 + y * 311) * 0.12;
        const base = 16 + n * 8;

        const i = (y * S + x) * 4;
        d[i] = base * 0.2;
        d[i + 1] = base * 0.5;
        d[i + 2] = base;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.textures.addCanvas("ocean_floor", canvas);
  }

  /* ════════════════════════════════════════════════════════ */
  /*  VIGNETTE                                                */
  /* ════════════════════════════════════════════════════════ */
  private createVignette(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    if (!this.textures.exists("vignette")) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext("2d")!;
      const g = ctx.createRadialGradient(256, 256, 80, 256, 256, 362);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.6, "rgba(0,0,0,0)");
      g.addColorStop(0.85, "rgba(0,0,0,0.3)");
      g.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
      this.textures.addCanvas("vignette", canvas);
    }

    this.vignette = this.add.image(w / 2, h / 2, "vignette");
    this.vignette.setScrollFactor(0).setDepth(999);
    this.resizeVignette(w, h, 1.0);
  }

  private resizeVignette(w: number, h: number, zoom: number): void {
    if (!this.vignette) return;
    this.vignette.setPosition(w / 2, h / 2);
    this.vignette.setDisplaySize(w / zoom, h / zoom);
  }

  /* ════════════════════════════════════════════════════════ */
  /*  HUD                                                     */
  /* ════════════════════════════════════════════════════════ */
  private drawLeaderPanel(): void {
    const g = this.leaderGfx;
    g.clear();
    const pw = 290;
    const ph = 34;
    const px = this.scale.width / 2 - pw / 2;
    const py = 10;
    g.fillStyle(0x061520, 0.8);
    g.fillRoundedRect(px, py, pw, ph, 17);
    g.lineStyle(1.5, 0x225588, 0.6);
    g.strokeRoundedRect(px, py, pw, ph, 17);
  }

  private drawXPBar(xp: number, threshold: number): void {
    const g = this.xpGfx;
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

  /* ════════════════════════════════════════════════════════ */
  /*  RADAR (sonar)                                           */
  /* ════════════════════════════════════════════════════════ */
  private drawRadar(): void {
    const g = this.radarGfx;
    g.clear();

    const cx = RADAR_M + RADAR_R;
    const cy = this.scale.height - RADAR_M - RADAR_R;
    const r = RADAR_R;

    /* dark circle background */
    g.fillStyle(0x040e18, 0.85);
    g.fillCircle(cx, cy, r);

    /* sonar sweep trail (fading pie sector) */
    const steps = 16;
    const arc = Math.PI * 0.4;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const a0 = this.radarSweep - arc * (i + 1) / steps;
      const a1 = this.radarSweep - arc * i / steps;
      g.fillStyle(0x22aacc, 0.1 * (1 - t));
      g.slice(cx, cy, r - 1, a0, a1, false);
      g.fillPath();
    }

    /* sweep line */
    g.lineStyle(1.5, 0x44ddff, 0.35);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(
      cx + Math.cos(this.radarSweep) * (r - 2),
      cy + Math.sin(this.radarSweep) * (r - 2),
    );
    g.strokePath();

    /* concentric grid rings */
    g.lineStyle(0.5, 0x1a4060, 0.5);
    g.strokeCircle(cx, cy, r * 0.33);
    g.strokeCircle(cx, cy, r * 0.66);

    /* crosshair lines */
    g.lineStyle(0.5, 0x1a4060, 0.4);
    g.beginPath();
    g.moveTo(cx - r, cy);
    g.lineTo(cx + r, cy);
    g.moveTo(cx, cy - r);
    g.lineTo(cx, cy + r);
    g.strokePath();

    /* outer ring */
    g.lineStyle(2, 0x2288aa, 0.85);
    g.strokeCircle(cx, cy, r);

    const s = r / RADAR_RANGE;

    /* food dots (tiny green) */
    g.fillStyle(0x44ee88, 0.65);
    for (const f of this.cachedFoods) {
      const dx = (f.x - this.lastMyX) * s;
      const dy = (f.y - this.lastMyY) * s;
      if (dx * dx + dy * dy < (r - 2) * (r - 2)) {
        g.fillCircle(cx + dx, cy + dy, 1.5);
      }
    }

    /* shark blips (red with glow) */
    for (const sh of this.cachedSharks) {
      if (sh.id === this.myId) continue;
      const dx = (sh.x - this.lastMyX) * s;
      const dy = (sh.y - this.lastMyY) * s;
      const d2 = dx * dx + dy * dy;
      if (d2 < (r - 4) * (r - 4)) {
        g.fillStyle(0xff4444, 0.2);
        g.fillCircle(cx + dx, cy + dy, 5);
        g.fillStyle(0xff4444, 0.8);
        g.fillCircle(cx + dx, cy + dy, 2.5);
      }
    }

    /* player direction arrow (center) */
    const a = this.lastMyAngle;
    const al = 10;
    const aw = 6;
    const tipX = cx + Math.cos(a) * al;
    const tipY = cy + Math.sin(a) * al;
    const ba = a + Math.PI;
    const lx = cx + Math.cos(ba + 0.5) * aw;
    const ly = cy + Math.sin(ba + 0.5) * aw;
    const rx = cx + Math.cos(ba - 0.5) * aw;
    const ry = cy + Math.sin(ba - 0.5) * aw;

    /* arrow glow */
    g.fillStyle(0x44ddff, 0.12);
    g.fillTriangle(
      cx + Math.cos(a) * (al + 4),
      cy + Math.sin(a) * (al + 4),
      cx + Math.cos(ba + 0.55) * (aw + 3),
      cy + Math.sin(ba + 0.55) * (aw + 3),
      cx + Math.cos(ba - 0.55) * (aw + 3),
      cy + Math.sin(ba - 0.55) * (aw + 3),
    );
    /* arrow body */
    g.fillStyle(0x44ddff, 0.9);
    g.fillTriangle(tipX, tipY, lx, ly, rx, ry);
  }

  /* ════════════════════════════════════════════════════════ */
  /*  WORLD BORDER                                            */
  /* ════════════════════════════════════════════════════════ */
  private drawWorldBorder(): void {
    this.worldBorder.clear();
    this.worldBorder.lineStyle(4, 0x0a3050, 0.8);
    this.worldBorder.strokeRect(0, 0, this.worldW, this.worldH);
  }

  /* ════════════════════════════════════════════════════════ */
  /*  NETWORK                                                 */
  /* ════════════════════════════════════════════════════════ */
  private sendInput(): void {
    if (!net.isOpen()) return;
    const angle = this.input2.pointerAngle();
    const dash = this.input2.isDashDown();
    net.send({ type: "input", payload: { angle, dash } });
  }

  private handleServer(m: ServerMsg): void {
    switch (m.type) {
      case "welcome":
        this.onWelcome(m.payload);
        break;
      case "state":
        this.onState(m.payload);
        break;
      case "death":
        this.onDeath(m.payload);
        break;
      case "leaderboard":
        this.onLeaderboard(m.payload);
        break;
    }
  }

  private onWelcome(m: WelcomePayload): void {
    this.myId = m.playerId;
    this.worldW = m.worldW;
    this.worldH = m.worldH;
    this.drawWorldBorder();
    // this.oceanFloor.setSize(this.worldW, this.worldH);
  }

  private onState(m: StatePayload): void {
    if (m.full) {
      this.applyFullState(m);
    } else {
      this.applyStateDelta(m);
    }

    if (m.you) {
      this.cameras.main.centerOn(m.you.x, m.you.y);
      const zoom = STAGE_ZOOMS[m.you.stage] ?? 1;
      this.cameras.main.setZoom(zoom);
      this.resizeVignette(this.scale.width, this.scale.height, zoom);

      /* cache for radar (drawn per-frame in update) */
      this.lastMyX = m.you.x;
      this.lastMyY = m.you.y;
      const mySv = this.sharks.get(this.myId);
      if (mySv) this.lastMyAngle = mySv.angle;
      this.cachedSharks = Array.from(this.sharks.entries()).map(([id, sv]) => ({
        id,
        x: sv.x,
        y: sv.y,
      }));
      this.cachedFoods = Array.from(this.foods.values()).map((fv) => ({ x: fv.x, y: fv.y }));

      /* XP bar */
      const isMax = m.you.stage >= STAGE_THRESHOLDS.length - 1;
      const threshold = isMax
        ? STAGE_THRESHOLDS[STAGE_THRESHOLDS.length - 1]
        : STAGE_THRESHOLDS[m.you.stage + 1];
      this.drawXPBar(m.you.xp, threshold);
      this.scoreText.setText(
        isMax ? "MAX LEVEL" : `${m.you.xp} / ${threshold} XP`,
      );
      this.stageText.setText(
        STAGE_NAMES[Math.min(m.you.stage, STAGE_NAMES.length - 1)],
      );
    }
  }

  private applyFullState(m: StatePayload): void {
    const seen = new Set<string>();
    for (const v of m.sharks ?? []) {
      seen.add(v.id);
      let s = this.sharks.get(v.id);
      if (!s) {
        s = new Shark(this, v.x, v.y, v.id === this.myId);
        this.sharks.set(v.id, s);
        this.worldContainer.add(s);
      }
      s.updateFromState(v.x, v.y, v.angle, v.stage, this.time.now, v.name);
    }
    for (const [id, s] of this.sharks) {
      if (!seen.has(id)) {
        s.destroy();
        this.sharks.delete(id);
      }
    }

    const seenF = new Set<string>();
    for (const f of m.foods ?? []) {
      seenF.add(f.id);
      if (!this.foods.has(f.id)) {
        const foodObj = new Food(this, f.x, f.y, f.isRed);
        this.foods.set(f.id, foodObj);
        this.worldContainer.add(foodObj);
      }
    }
    for (const [id, f] of this.foods) {
      if (!seenF.has(id)) {
        f.destroy();
        this.foods.delete(id);
      }
    }
  }

  private applyStateDelta(m: StatePayload): void {
    for (const v of m.addedSharks ?? []) {
      this.upsertShark(v);
    }
    for (const v of m.updatedSharks ?? []) {
      this.upsertShark(v);
    }
    for (const id of m.removedSharks ?? []) {
      this.removeShark(id);
    }

    for (const f of m.addedFoods ?? []) {
      this.upsertFood(f);
    }
    for (const f of m.updatedFoods ?? []) {
      this.upsertFood(f);
    }
    for (const id of m.removedFoods ?? []) {
      this.removeFood(id);
    }
  }

  private upsertShark(v: StateSharkView): void {
    let s = this.sharks.get(v.id);
    if (!s) {
      s = new Shark(this, v.x, v.y, v.id === this.myId);
      this.sharks.set(v.id, s);
      this.worldContainer.add(s);
    }
    s.updateFromState(v.x, v.y, v.angle, v.stage, this.time.now, v.name);
  }

  private removeShark(id: string): void {
    const s = this.sharks.get(id);
    if (!s) return;
    s.destroy();
    this.sharks.delete(id);
  }

  private upsertFood(v: StateFoodView): void {
    let f = this.foods.get(v.id);
    if (!f) {
      f = new Food(this, v.x, v.y, v.isRed);
      this.foods.set(v.id, f);
      this.worldContainer.add(f);
    }
    f.setPosition(v.x, v.y);
  }

  private removeFood(id: string): void {
    const f = this.foods.get(id);
    if (!f) return;
    f.destroy();
    this.foods.delete(id);
  }

  private onDeath(m: DeathPayload): void {
    this.scene.start("DeathScreen", { score: m.score, stage: m.stage });
  }

  private onLeaderboard(m: LeaderboardPayload): void {
    this.leaderText.setText(
      `👑 Top Predator: ${m.topName} (${m.topScore})`,
    );
  }
}
