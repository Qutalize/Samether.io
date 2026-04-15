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
  SharkRoute,
} from "../../network/protocol";
import { Shark } from "../objects/Shark";
import { Food } from "../objects/Food";
import { OceanBackgroundShader } from "../objects/BackgroundShader";
import { SharkPipeline } from "../objects/SharkShader";
import { InputController } from "../input";

/* ── constants ─────────────────────────────────────────────── */
const STAGE_THRESHOLDS = [0, 10, 25, 50, 100];
const STAGE_ZOOMS = [1.0, 0.93, 0.88, 0.82, 0.76];

const ROUTE_STAGE_NAMES: Record<SharkRoute, string[]> = {
  "attack": ["シュモクザメ", "イタチザメ", "アオザメ", "ホオジロザメ", "メガロドン"],
  "non-attack": ["ドチザメ", "ネムリブカ", "シロワニ", "ウバザメ", "ジンベエザメ"],
  "deep-sea": ["ツラナガコビトザメ", "ノコギリザメ", "ラブカ", "ミツクリザメ", "ニシオンデンザメ"]
};

const RADAR_R = 90;
const RADAR_RANGE = 1400;
const RADAR_M = 28;
const TAU = Math.PI * 2;

/* seeded hash for ocean floor noise */
function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

// Dummy route generator based on string hash
function getDummyRoute(id: string): SharkRoute {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i) | 0;
  }
  const routes: SharkRoute[] = ["attack", "non-attack", "deep-sea"];
  return routes[Math.abs(h) % routes.length];
}

/* ═══════════════════════════════════════════════════════════ */
export class GameScene extends Phaser.Scene {
  /* world */
  private worldW = 4000;
  private worldH = 4000;
  private myId = "";
  private myName = "";
  private myRoute: SharkRoute = "attack";

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
  private bgContainer!: Phaser.GameObjects.Container;
  private worldContainer!: Phaser.GameObjects.Container;
  private uiContainer!: Phaser.GameObjects.Container;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  
  private vignetteOverlay!: Phaser.GameObjects.Image;

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
  private bgShader!: Phaser.GameObjects.Shader;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { name: string; route: SharkRoute }): void {
    this.myName = data.name;
    this.myRoute = data.route;
  }

  preload(): void {
    this.load.image("shark", "shark.png");
    // Register the shader with the Cache
    if (!this.cache.shader.has("OceanBackground")) {
      this.cache.shader.add("OceanBackground", OceanBackgroundShader);
    }
  }

  /* ════════════════════════════════════════════════════════ */
  /*  CREATE                                                  */
  /* ════════════════════════════════════════════════════════ */
  create(): void {
    const renderer = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (renderer.pipelines) {
      renderer.pipelines.addPostPipeline("SharkShader", SharkPipeline);
    }
    
    this.cameras.main.setBackgroundColor("#001b44");
    this.ensureTextures();
    this.createSharkTexture();

    /* Layers setup */
    this.bgContainer = this.add.container(0, 0).setDepth(-1000);
    this.worldContainer = this.add.container(0, 0).setDepth(0);
    this.uiContainer = this.add.container(0, 0).setDepth(1000);

    /* Vignette overlay (in UI container, behind HUD) */
    this.vignetteOverlay = this.add.image(this.scale.width / 2, this.scale.height / 2, "vignette_default");
    // Ensure it covers the whole screen even on ultrawide
    const maxDim = Math.max(this.scale.width, this.scale.height);
    this.vignetteOverlay.setDisplaySize(maxDim * 1.5, maxDim * 1.5);
    this.vignetteOverlay.setDepth(-1); // Behind UI elements
    this.uiContainer.add(this.vignetteOverlay);

    /* Background Shader */
    this.bgShader = this.add.shader("OceanBackground", this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height);
    this.bgShader.setScrollFactor(0);
    this.bgContainer.add(this.bgShader);

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

    this.stageText = this.add.text(22, 70, ROUTE_STAGE_NAMES[this.myRoute][0], {
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


    /* Camera setup: Main camera ignores UI, UI camera ignores World */
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);
    this.cameras.main.ignore(this.uiContainer);
    this.uiCamera.ignore(this.worldContainer);
    this.uiCamera.ignore(this.bgContainer);

    /* resize */
    this.scale.on("resize", (sz: Phaser.Structs.Size) => {
      this.leaderText.setX(sz.width / 2);
      this.drawLeaderPanel();
      
      this.uiCamera.setSize(sz.width, sz.height);
      if (this.bgShader) {
        this.bgShader.setSize(sz.width, sz.height);
        this.bgShader.setPosition(sz.width / 2, sz.height / 2);
      }
      if (this.vignetteOverlay) {
        this.vignetteOverlay.setPosition(sz.width / 2, sz.height / 2);
        const maxDim = Math.max(sz.width, sz.height);
        this.vignetteOverlay.setDisplaySize(maxDim * 1.5, maxDim * 1.5);
      }
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
    if (this.bgShader) {
      const cam = this.cameras.main;
      // Keep background quad at full screen size regardless of zoom
      this.bgShader.setScale(1 / cam.zoom);
      
      // Use camera center for parallax instead of scrollX/Y.
      // This ensures the background pattern doesn't scale or jump when zooming.
      const centerX = cam.scrollX + (cam.width / 2) / cam.zoom;
      const centerY = cam.scrollY + (cam.height / 2) / cam.zoom;

      this.bgShader.setUniform('uScroll.value.x', centerX * 0.0005);
      this.bgShader.setUniform('uScroll.value.y', centerY * 0.0005);
    }

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
  
  /**
   * 視界の広さを変更するメソッド
   * 将来、サメのタイプ（深海魚など）によって呼び出してください。
   * 例: this.setVisionRange(0.15, 0.4, "vignette_deepsea")
   */
  public setVisionRange(innerRatio: number, outerRatio: number, textureKey = "vignette_default"): void {
    if (!this.textures.exists(textureKey)) {
      const size = 1024;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      
      const cx = size / 2;
      const cy = size / 2;
      const rInner = size * innerRatio;
      const rOuter = size * outerRatio;
      
      const grad = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
      grad.addColorStop(0, "rgba(0, 0, 0, 0)");
      grad.addColorStop(0.5, "rgba(0, 5, 15, 0.95)");
      grad.addColorStop(1, "rgba(0, 2, 5, 1)");
      
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      
      this.textures.addCanvas(textureKey, canvas);
    }
    
    // 既存のオーバーレイがあればテクスチャを差し替える
    if (this.vignetteOverlay) {
      this.vignetteOverlay.setTexture(textureKey);
    }
  }

  private ensureTextures(): void {
    this.createFoodTextures();
    // デフォルトの狭い視界を生成
    this.setVisionRange(0.05, 0.25, "vignette_default");
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
    // わかりやすい赤色に変更し、太さも4->8に強化
    this.worldBorder.lineStyle(8, 0xff0000, 1.0);
    this.worldBorder.strokeRect(0, 0, this.worldW, this.worldH);
    
    // 内側に少しグロー効果（細い線）を追加してより目立たせる
    this.worldBorder.lineStyle(2, 0xff5555, 0.5);
    this.worldBorder.strokeRect(4, 4, this.worldW - 8, this.worldH - 8);
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
  }

  private onState(m: StatePayload): void {
    // 確実に自分自身のIDを更新・保持する
    if (m.you && m.you.id) {
      this.myId = m.you.id;
    }

    if (m.full) {
      this.applyFullState(m);
    } else {
      this.applyStateDelta(m);
    }

    if (m.you) {
      this.cameras.main.centerOn(m.you.x, m.you.y);
      const zoom = STAGE_ZOOMS[m.you.stage] ?? 1;
      this.cameras.main.setZoom(zoom);

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
        ROUTE_STAGE_NAMES[this.myRoute][Math.min(m.you.stage, ROUTE_STAGE_NAMES[this.myRoute].length - 1)],
      );
    }
  }

  private applyFullState(m: StatePayload): void {
    const seen = new Set<string>();
    for (const v of m.sharks ?? []) {
      seen.add(v.id);
      let s = this.sharks.get(v.id);
      const isSelf = v.id === this.myId;
      if (!s) {
        s = new Shark(this, v.x, v.y, isSelf);
        this.sharks.set(v.id, s);
        this.worldContainer.add(s);
      }
      // 強制的に自分のサメには自分が選択したルートを適用する
      const route = isSelf ? this.myRoute : (v.route ?? getDummyRoute(v.id));
      s.updateFromState(v.x, v.y, v.angle, v.stage, this.time.now, route, v.name);
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
    const isSelf = v.id === this.myId;
    if (!s) {
      s = new Shark(this, v.x, v.y, isSelf);
      this.sharks.set(v.id, s);
      this.worldContainer.add(s);
    }
    // 強制的に自分のサメには自分が選択したルートを適用する
    const route = isSelf ? this.myRoute : (v.route ?? getDummyRoute(v.id));
    s.updateFromState(v.x, v.y, v.angle, v.stage, this.time.now, route, v.name);
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
