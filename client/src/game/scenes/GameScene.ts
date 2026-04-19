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
import { TerritoryManager } from "../territory/TerritoryManager";
import { SuctionEffect } from "../effects/SuctionEffect";
import { getRouteColor } from "../config/RouteColors";

/* ── constants ─────────────────────────────────────────────── */
const STAGE_ZOOMS = [1.0, 0.92, 0.84, 0.76, 0.68];

const ENABLE_TRAIL_ON_HOLD = true;
const TRAIL_POINT_SPACING = 12;
const TRAIL_MAX_POINTS = 120;

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
  private myStage = -1;

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

  /* territory system */
  private territoryManager!: TerritoryManager;

  private trailGraphics!: Phaser.GameObjects.Graphics;
  private pointerTrail: Phaser.Math.Vector2[] = [];
  private _radarSharkBuf: { id: string; x: number; y: number }[] = [];
  private _radarFoodBuf: { x: number; y: number }[] = [];


  /* special effects */
  private suctionEffect!: SuctionEffect;
  private isWhaleShark = false; // 自分がジンベエザメか

  /* atmosphere */
  private bgShader!: Phaser.GameObjects.Shader;
  private vignetteOverlay!: Phaser.GameObjects.Image;

  /* audio */
  private bgm?: Phaser.Sound.BaseSound;
  private prevXp = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { name: string; route: SharkRoute }): void {
    this.myName = data.name;
    this.myRoute = data.route;
  }

  preload(): void {
    this.load.image("shark",           "images/shark.png");
    this.load.image("shark_mako",      "images/shark_mako.png");
    this.load.image("shark_sandtiger", "images/shark_sandtiger.png");
    this.load.image("shark_frilled",   "images/shark_frilled.png");
    this.load.image("shark_megalodon", "images/shark_megalodon.png");
    this.load.image("shark_whale",     "images/shark_whale.png");
    this.load.image("shark_greenland", "images/shark_greenland.png");
    this.load.image("diver",           "images/diver.png");
    this.load.audio("bgm", "audio/bgm.mp3");
    this.load.audio("sfx_xp_gain", "audio/sfx_xp_gain.mp3");
    this.load.audio("sfx_levelup", "audio/sfx_levelup.mp3");
    this.load.audio("human_scream", "audio/human_scream.mp3");
    if (!this.cache.shader.has("OceanBackground")) {
      this.cache.shader.add("OceanBackground", OceanBackgroundShader);
    }
  }

  /* ════════════════════════════════════════════════════════ */
  /*  CREATE                                                  */
  /* ════════════════════════════════════════════════════════ */
  create(): void {
    // Register custom shader pipeline for Phaser 3.80
    const renderer = this.renderer as any;
    if (renderer.pipelines && !renderer.pipelines.get("SharkShader")) {
      const pipelineInstance = new SharkPipeline(this.game);
      renderer.pipelines.add("SharkShader", pipelineInstance);
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
    this.bgShader.setUniform('uScroll.value', { x: 0, y: 0 });
    this.bgContainer.add(this.bgShader);

    /* world boundary */
    this.worldBorder = this.add.graphics().setDepth(0);
    this.drawWorldBorder();
    this.worldContainer.add(this.worldBorder);

    this.trailGraphics = this.add.graphics().setDepth(-1);
    this.worldContainer.add(this.trailGraphics);


    /* special effects */
    this.suctionEffect = new SuctionEffect(this);

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

    /* ── Territory System ────────────────── */
    this.territoryManager = new TerritoryManager(this, this.myRoute);
    // Will be initialized with player ID and level in onWelcome

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

    /* audio */
    if (this.sound && this.cache.audio.exists("bgm")) {
      this.bgm = this.sound.add("bgm", { loop: true, volume: 1.0 });
      if (this.bgm) {
        this.bgm.play();
      }
    }
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

    /* animate food glow (only visible foods) */
    const cam = this.cameras.main;
    const cullL = cam.scrollX - 50;
    const cullR = cam.scrollX + cam.width / cam.zoom + 50;
    const cullT = cam.scrollY - 50;
    const cullB = cam.scrollY + cam.height / cam.zoom + 50;
    for (const f of this.gameState.getFoods().values()) {
      if (f.x >= cullL && f.x <= cullR && f.y >= cullT && f.y <= cullB) {
        f.tickAnim(time);
      }
    }


    /* radar sweep rotation */
    this.radarRenderer.tick(delta);

    if (this.input2) {
      this.input2.update(delta);
    }

    /* update territory rendering */
    if (this.territoryManager) {
      this.territoryManager.update();

      // Check if player is in danger
      const self = this.gameState.getSharks().get(this.myId);
      if (self) {
        this.territoryManager.checkDanger(self.x, self.y);
      }
    }

    this.updateTrail();
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

  /**
   * Stop background music.
   * Called by DeathScreen when player dies.
   */
  public stopBgm(): void {
    if (this.bgm && this.bgm.isPlaying) {
      this.bgm.stop();
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
    const SHARK_DEFS: Array<{ srcKey: string; outKey: string }> = [
      { srcKey: "shark",           outKey: "shark_stage01" },
      { srcKey: "shark_mako",      outKey: "shark_stage2_attack" },
      { srcKey: "shark_sandtiger", outKey: "shark_stage2_nonatk" },
      { srcKey: "shark_frilled",   outKey: "shark_stage2_deep" },
      { srcKey: "shark_megalodon", outKey: "shark_stage4_attack" },
      { srcKey: "shark_whale",     outKey: "shark_stage4_nonatk" },
      { srcKey: "shark_greenland", outKey: "shark_stage4_deep" },
    ];

    for (const { srcKey, outKey } of SHARK_DEFS) {
      if (this.textures.exists(outKey)) continue;
      const srcFrame = this.textures.get(srcKey).get();
      const srcWidth = srcFrame.width;
      const srcHeight = srcFrame.height;
      if (!srcWidth || !srcHeight) continue;

      const canvas = document.createElement("canvas");
      canvas.width = 130;
      canvas.height = 71;
      const ctx = canvas.getContext("2d")!;
      
      // Calculate aspect-fit scaling to normalize different image sizes into 130x71
      const scale = Math.min(130 / srcWidth, 71 / srcHeight);
      const dw = srcWidth * scale;
      const dh = srcHeight * scale;
      const dx = (130 - dw) / 2;
      const dy = (71 - dh) / 2;

      ctx.drawImage(srcFrame.source.image as HTMLImageElement, dx, dy, dw, dh);
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
      this.textures.addCanvas(outKey, canvas);
    }
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
  /*  TRAIL                                                   */
  /* ════════════════════════════════════════════════════════ */
  private updateTrail(): void {
    if (!ENABLE_TRAIL_ON_HOLD || !this.input.activePointer.isDown) {
      this.clearTrail();
      return;
    }

    const self = this.gameState.getSharks().get(this.myId);
    if (!self) {
      this.clearTrail();
      return;
    }

    const position = new Phaser.Math.Vector2(self.x, self.y);
    const last = this.pointerTrail[this.pointerTrail.length - 1];
    if (!last || Phaser.Math.Distance.BetweenPoints(last, position) >= TRAIL_POINT_SPACING) {
      this.pointerTrail.push(position.clone());
      if (this.pointerTrail.length > TRAIL_MAX_POINTS) {
        this.pointerTrail.shift();
      }
    }

    this.renderTrail(self);
  }

  private renderTrail(self: Shark): void {
    this.trailGraphics.clear();
    if (this.pointerTrail.length < 2) {
      return;
    }

    const routeColor = getRouteColor(this.myRoute);

    this.trailGraphics.lineStyle(4, routeColor, 0.6);
    this.trailGraphics.beginPath();
    this.trailGraphics.moveTo(this.pointerTrail[0].x, this.pointerTrail[0].y);
    for (let i = 1; i < this.pointerTrail.length; i++) {
      this.trailGraphics.lineTo(this.pointerTrail[i].x, this.pointerTrail[i].y);
    }
    this.trailGraphics.strokePath();
  }

  private clearTrail(): void {
    if (this.pointerTrail.length === 0) {
      return;
    }
    this.pointerTrail.length = 0;
    this.trailGraphics.clear();
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
    const draw = this.input.activePointer.isDown;
    net.send({ type: "input", payload: { angle, dash, draw } });
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
      default:
        // Forward territory-related messages to TerritoryManager
        if (this.territoryManager) {
          this.territoryManager.handleMessage(m);
        }
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

    // Initialize territory manager with player info
    if (this.territoryManager) {
      this.territoryManager.init(m.playerId, 0); // Level 0 at start, will be updated
    }
  }

  private onState(m: StatePayload): void {
    if (m.you && m.you.id) {
      this.myId = m.you.id;
      this.gameState.setMyId(m.you.id);
    }

    // Stage 4 Non-Attack になったらジンベエザメフラグを立てる
    if (m.you) {
      const newIsWhaleShark = m.you.stage === 4 && this.myRoute === "non-attack";
      const becameWhaleShark = !this.isWhaleShark && newIsWhaleShark;
      this.isWhaleShark = newIsWhaleShark;

      // ジンベエザメになった場合、餌消失を検出してエフェクト表示
      if (this.isWhaleShark && m.foods) {
        this.updateFoodWithEffect(m.foods);
      }
    }

    if (m.full) {
      this.gameState.applyFullState(m);
    } else {
      this.gameState.applyStateDelta(m);
    }

    if (m.you) {
      const previousStage = this.myStage;

      if (previousStage !== -1 && m.you.stage > previousStage) {
        if (this.sound && this.cache.audio.exists("sfx_levelup")) {
          this.sound.play("sfx_levelup", { volume: 1.0 });
        }
        this.cameras.main.flash(350, 255, 255, 255, false);
        const mySv = this.gameState.getSharks().get(this.myId);
        mySv?.playEvolutionPulse();
      }

      this.cameras.main.centerOn(m.you.x, m.you.y);
      const zoom = STAGE_ZOOMS[m.you.stage] ?? 1;
      if (this.cameras.main.zoom !== zoom) {
        this.cameras.main.setZoom(zoom);
      }

      /* update radar blips */
      const sharks = this.gameState.getSharks();

      // Find self in server data for angle
      let myAngle = 0;
      const allSharks = m.full ? m.sharks : m.updatedSharks;
      const mySelf = allSharks?.find(s => s.id === this.myId);
      if (mySelf) {
        myAngle = mySelf.angle;
      }

      this.radarRenderer.setBlips(
        this.myId,
        m.you.x,
        m.you.y,
        myAngle,
        this.myRoute,
        this.myRoute === "attack"
          ? Array.from(sharks.entries()).map(([id, sv]) => ({ id, x: sv.x, y: sv.y }))
          : [],
        Array.from(this.gameState.getFoods().values()).map((fv) => ({ x: fv.x, y: fv.y, isRed: fv.isRed })),
      );

      /* XP bar */
      if (m.you.xp > this.prevXp) {
        if (this.sound && this.cache.audio.exists("sfx_xp_gain")) {
          this.sound.play("sfx_xp_gain", { volume: 1.0 });
        }
        this.prevXp = m.you.xp;
      }
      this.xpBar.update(m.you.xp, m.you.stage, this.myRoute);

      /* Update territory manager and GameState when level changes */
      if (m.you.stage !== previousStage) {
        const newTerritoryLevel = m.you.stage + 1; // territory levels are 1-based (stage+1)
        if (this.territoryManager) {
          this.territoryManager.handleMessage({
            type: 'my_evolution',
            payload: {
              newLevel: newTerritoryLevel,
              recalculateTerritories: previousStage !== -1,
            },
          });
        }
        this.gameState.setMyLevel(m.you.stage);
        this.myStage = m.you.stage;
      }
    }
  }

  // 餌の更新時にエフェクトを表示（ジンベエザメ専用）
  private updateFoodWithEffect(foods: Array<{ id: string; x: number; y: number; isRed?: boolean }>): void {
    const newFoodIds = new Set(foods.map((f) => f.id));
    const prevFoodIds = new Set(this.gameState.getFoods().keys());

    // 消えた餌のIDを検出
    const removedIds = [...prevFoodIds].filter((id) => !newFoodIds.has(id));

    // 消えた餌に対してエフェクトを表示
    for (const id of removedIds) {
      const food = this.gameState.getFoods().get(id);
      if (food) {
        const myShark = this.gameState.getSharks().get(this.myId);
        if (myShark) {
          this.suctionEffect.playAt(food.x, food.y, myShark.x, myShark.y);
        }
      }
    }
  }

  private onDeath(m: DeathPayload): void {
    // Play scream sound for human mode
    if (this.myRoute === "human") {
      this.sound.play("human_scream", { volume: 0.8 });
    }
    this.scene.start("DeathScreen", { score: m.score, stage: m.stage, route: this.myRoute });
  }

  private onLeaderboard(m: LeaderboardPayload): void {
    this.leaderboardPanel.setLeader(m.topName, m.topScore);
  }
}
