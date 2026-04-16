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
import { InputController } from "../input";
import { RadarRenderer } from "../hud/RadarRenderer";
import { XpBar } from "../hud/XpBar";
import { LeaderboardPanel } from "../hud/LeaderboardPanel";

/* ── constants ─────────────────────────────────────────────── */
const STAGE_ZOOMS = [1.0, 0.93, 0.88, 0.82, 0.76];

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
  private worldContainer!: Phaser.GameObjects.Container;
  private uiContainer!: Phaser.GameObjects.Container;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;

  /* background layers */
  private worldBorder!: Phaser.GameObjects.Graphics;
  // private oceanFloor!: Phaser.GameObjects.TileSprite;

  /* HUD components */
  private xpBar!: XpBar;
  private leaderboardPanel!: LeaderboardPanel;
  private radarRenderer!: RadarRenderer;

  /* atmosphere */
  private vignette!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { name: string; route: SharkRoute }): void {
    this.myName = data.name;
    this.myRoute = data.route;
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
    this.xpBar = new XpBar(this, this.uiContainer, this.myRoute);
    this.leaderboardPanel = new LeaderboardPanel(this, this.uiContainer);
    this.radarRenderer = new RadarRenderer(this, this.uiContainer);

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
    this.radarRenderer.tick(delta);

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
      this.resizeVignette(this.scale.width, this.scale.height, zoom);

      /* update radar blips */
      const mySv = this.sharks.get(this.myId);
      this.radarRenderer.setBlips(
        this.myId,
        m.you.x,
        m.you.y,
        mySv?.angle ?? 0,
        Array.from(this.sharks.entries()).map(([id, sv]) => ({ id, x: sv.x, y: sv.y })),
        Array.from(this.foods.values()).map((fv) => ({ x: fv.x, y: fv.y })),
      );

      /* XP bar */
      this.xpBar.update(m.you.xp, m.you.stage, this.myRoute);
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
    this.leaderboardPanel.setLeader(m.topName, m.topScore);
  }
}
