import Phaser from "phaser";
import { net } from "../../network/websocket";
import type {
  ServerMsg,
  StatePayload,
  WelcomePayload,
  DeathPayload,
  LeaderboardPayload,
  SharkRoute,
} from "../../network/protocol";
import { Shark } from "../objects/Shark";
import { Food } from "../objects/Food";
import { OceanBackgroundShader } from "../objects/BackgroundShader";
import { SharkPipeline } from "../objects/SharkShader";
import { InputController } from "../input";
import { RadarRenderer } from "../hud/RadarRenderer";
import { XpBar } from "../hud/XpBar";
import { LeaderboardPanel } from "../hud/LeaderboardPanel";
import { GameState } from "../state/GameState";

/* ── constants ─────────────────────────────────────────────── */
const STAGE_ZOOMS = [1.0, 0.93, 0.88, 0.82, 0.76];

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
  private myRoute: SharkRoute = "attack";

  /* entity state manager */
  private gameState!: GameState;

  /* input */
  private input2!: InputController;

  /* layers */
  private bgContainer!: Phaser.GameObjects.Container;
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
  private bgShader!: Phaser.GameObjects.Shader;
  private vignetteOverlay!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { name: string; route: SharkRoute }): void {
    this.myName = data.name;
    this.myRoute = data.route;
  }

  preload(): void {
    this.load.image("shark", "shark.png");
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
    this.worldContainer = this.add.container(0, 0);
    this.uiContainer = this.add.container(0, 0).setDepth(1000);

    /* Background Shader */
    this.bgShader = this.add.shader("OceanBackground", this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height);
    this.bgShader.setScrollFactor(0);
    this.bgContainer.add(this.bgShader);

    /* world boundary */
    this.worldBorder = this.add.graphics().setDepth(0);
    this.drawWorldBorder();
    this.worldContainer.add(this.worldBorder);

    /* Vignette overlay – added first so it renders behind all UI elements */
    const vignetteKey = this.myRoute === "deep-sea" ? "vignette_deepsea" : "vignette_default";
    this.vignetteOverlay = this.add.image(this.scale.width / 2, this.scale.height / 2, vignetteKey);
    const maxDim = Math.max(this.scale.width, this.scale.height);
    this.vignetteOverlay.setDisplaySize(maxDim * 1.5, maxDim * 1.5);
    this.uiContainer.add(this.vignetteOverlay);

    /* input controller */
    this.input2 = new InputController(this);
    this.uiContainer.add(this.input2.getContainer());

    /* ── HUD ────────────────── */
    this.xpBar = new XpBar(this, this.uiContainer, this.myRoute);
    this.leaderboardPanel = new LeaderboardPanel(this, this.uiContainer);
    this.radarRenderer = new RadarRenderer(this, this.uiContainer);

    /* Camera setup: Main camera ignores UI, UI camera ignores World */
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);
    this.cameras.main.ignore(this.uiContainer);
    this.uiCamera.ignore(this.worldContainer);
    this.uiCamera.ignore(this.bgContainer);

    /* resize */
    this.scale.on("resize", (sz: Phaser.Structs.Size) => {
      this.uiCamera.setSize(sz.width, sz.height);
      if (this.bgShader) {
        this.bgShader.setSize(sz.width, sz.height);
        this.bgShader.setPosition(sz.width / 2, sz.height / 2);
      }
      if (this.vignetteOverlay) {
        this.vignetteOverlay.setPosition(sz.width / 2, sz.height / 2);
        const md = Math.max(sz.width, sz.height);
        this.vignetteOverlay.setDisplaySize(md * 1.5, md * 1.5);
      }
    });

    /* entity state manager – wires new Phaser objects into worldContainer */
    this.gameState = new GameState(
      this,
      this.myId,
      this.myRoute,
      (shark: Shark) => this.worldContainer.add(shark),
      (food: Food) => this.worldContainer.add(food),
    );

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
      this.bgShader.setScale(1 / cam.zoom);
      const centerX = cam.scrollX + (cam.width / 2) / cam.zoom;
      const centerY = cam.scrollY + (cam.height / 2) / cam.zoom;
      this.bgShader.setUniform('uScroll.value.x', centerX * 0.0005);
      this.bgShader.setUniform('uScroll.value.y', centerY * 0.0005);
    }

    /* animate food glow */
    for (const f of this.gameState.getFoods().values()) f.tickAnim(time);

    /* radar sweep rotation */
    this.radarRenderer.tick(delta);

    if (this.input2) {
      this.input2.update(delta);
    }
  }

  /* ════════════════════════════════════════════════════════ */
  /*  PROCEDURAL TEXTURES                                     */
  /* ════════════════════════════════════════════════════════ */
  private ensureTextures(): void {
    if (!this.textures.exists("ocean_floor")) this.genOceanFloor();
    this.createFoodTextures();
    this.createVignetteTexture("vignette_default", 0.05, 0.25);
    this.createVignetteTexture("vignette_deepsea", 0.15, 0.45);
  }

  private createVignetteTexture(key: string, innerRatio: number, outerRatio: number): void {
    if (this.textures.exists(key)) return;
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, size * innerRatio, cx, cy, size * outerRatio);
    grad.addColorStop(0, "rgba(0, 0, 0, 0)");
    grad.addColorStop(0.5, "rgba(0, 5, 15, 0.95)");
    grad.addColorStop(1, "rgba(0, 2, 5, 1)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    this.textures.addCanvas(key, canvas);
  }

  /**
   * 視界の広さを変更するメソッド。
   * 例: this.setVisionRange(0.15, 0.4, "vignette_deepsea")
   */
  public setVisionRange(innerRatio: number, outerRatio: number, textureKey = "vignette_default"): void {
    this.createVignetteTexture(textureKey, innerRatio, outerRatio);
    if (this.vignetteOverlay?.active) {
      this.vignetteOverlay.setTexture(textureKey);
    }
  }

  private createFoodTextures(): void {
    if (this.textures.exists("food_green")) return;

    const size = 16;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(85, 255, 170, 0.25)";
    ctx.beginPath(); ctx.arc(8, 8, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(85, 255, 170, 0.9)";
    ctx.beginPath(); ctx.arc(8, 8, 4, 0, Math.PI * 2); ctx.fill();
    this.textures.addCanvas("food_green", canvas);

    const canvasRed = document.createElement("canvas");
    canvasRed.width = size;
    canvasRed.height = size;
    const ctxRed = canvasRed.getContext("2d")!;
    ctxRed.clearRect(0, 0, size, size);
    ctxRed.fillStyle = "rgba(255, 85, 85, 0.25)";
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
      if (data[i + 3] > 0) {
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
  /*  WORLD BORDER                                            */
  /* ════════════════════════════════════════════════════════ */
  private drawWorldBorder(): void {
    this.worldBorder.clear();
    this.worldBorder.lineStyle(8, 0xff0000, 1.0);
    this.worldBorder.strokeRect(0, 0, this.worldW, this.worldH);
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
    this.gameState.setMyId(m.playerId);
    this.worldW = m.worldW;
    this.worldH = m.worldH;
    this.drawWorldBorder();
    // this.oceanFloor.setSize(this.worldW, this.worldH);
  }

  private onState(m: StatePayload): void {
    if (m.you && m.you.id) {
      this.myId = m.you.id;
      this.gameState.setMyId(m.you.id);
    }

    if (m.full) {
      this.gameState.applyFullState(m);
    } else {
      this.gameState.applyStateDelta(m);
    }

    if (m.you) {
      this.cameras.main.centerOn(m.you.x, m.you.y);
      const zoom = STAGE_ZOOMS[m.you.stage] ?? 1;
      this.cameras.main.setZoom(zoom);

      /* update radar blips */
      const sharks = this.gameState.getSharks();
      const foods = this.gameState.getFoods();
      const mySv = sharks.get(this.myId);
      this.radarRenderer.setBlips(
        this.myId,
        m.you.x,
        m.you.y,
        mySv?.angle ?? 0,
        Array.from(sharks.entries()).map(([id, sv]) => ({ id, x: sv.x, y: sv.y })),
        Array.from(foods.values()).map((fv) => ({ x: fv.x, y: fv.y })),
      );

      /* XP bar */
      this.xpBar.update(m.you.xp, m.you.stage, this.myRoute);
    }
  }

  private onDeath(m: DeathPayload): void {
    this.scene.start("DeathScreen", { score: m.score, stage: m.stage });
  }

  private onLeaderboard(m: LeaderboardPayload): void {
    this.leaderboardPanel.setLeader(m.topName, m.topScore);
  }
}
