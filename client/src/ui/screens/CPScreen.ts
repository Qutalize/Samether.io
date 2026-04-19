import Phaser from "phaser";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { net } from "../../network/websocket";
import { loadCp, setCp } from "../../storage/cp";
import type { ServerMsg } from "../../network/protocol";

const SERIF = "'Times New Roman', 'Georgia', serif";

/** GPS送信間隔 (ms) — サーバーの5秒間隔フィルタに合わせる */
const UPDATE_INTERVAL_MS = 5_000;

type Phase = "idle" | "connecting" | "measuring" | "done";

export class CPScreen extends Phaser.Scene {
  private titleText!: Phaser.GameObjects.Text;
  private lineGfx!: Phaser.GameObjects.Graphics;
  private instructionText!: Phaser.GameObjects.Text;
  private backBtn!: Phaser.GameObjects.Text;
  private cpDisplayText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Text;
  private goalBtn!: Phaser.GameObjects.Text;
  private resizeHandler!: (size: Phaser.Structs.Size) => void;

  private phase: Phase = "idle";
  private watchId: number | null = null;
  private lastSendTime = 0;

  /** Bound handlers for cleanup */
  private msgHandler: ((msg: ServerMsg) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  /** 地図 */
  private map: maplibregl.Map | null = null;
  private trackCoords: [number, number][] = [];
  private userMarker: maplibregl.Marker | null = null;

  /** サーバーから受け取った最新値 */
  private estimatedDist = 0;
  private pointsRecorded = 0;

  constructor() {
    super({ key: "CPScreen" });
  }

  /* ------------------------------------------------------------------ */
  /*  Phaser lifecycle                                                   */
  /* ------------------------------------------------------------------ */

  create(): void {
    this.cameras.main.setBackgroundColor("#030a14");

    this.titleText = this.add.text(0, 0, "C P  獲 得", {
      fontFamily: SERIF,
      fontSize: "52px",
      color: "#88ccee",
      letterSpacing: 10,
    }).setOrigin(0.5);

    this.lineGfx = this.add.graphics();

    this.cpDisplayText = this.add.text(0, 0, `所持 CP: ${loadCp()}`, {
      fontFamily: SERIF,
      fontSize: "22px",
      color: "#6688aa",
    }).setOrigin(0.5);

    this.instructionText = this.add.text(
      0,
      0,
      "[ スタート ] を押して歩くと自動で CP が貯まります\n50m 移動ごとに 1 CP",
      {
        fontFamily: SERIF,
        fontSize: "15px",
        color: "#4a6a8a",
        align: "center",
        letterSpacing: 2,
      },
    ).setOrigin(0.5);

    this.statusText = this.add.text(0, 0, "待機中", {
      fontFamily: SERIF,
      fontSize: "22px",
      color: "#4a6a8a",
    }).setOrigin(0.5);

    this.distText = this.add.text(0, 0, "", {
      fontFamily: SERIF,
      fontSize: "18px",
      color: "#6688aa",
    }).setOrigin(0.5);

    this.startBtn = this.styledButton("─  スタート  ─", "28px", "#44ff88", "#88ffbb", 0x22aa55, 8);
    this.startBtn.on("pointerdown", () => this.handleStart());

    this.goalBtn = this.styledButton("─  ストップ  ─", "22px", "#555555", "#88aacc", 0x446688, 4);
    this.goalBtn.on("pointerdown", () => this.handleStop());

    this.backBtn = this.styledButton("─  ホームへ戻る  ─", "18px", "#6688aa", "#88bbdd", 0x446688, 4);
    this.backBtn.on("pointerdown", () => this.goHome());

    this.layout(this.scale.width, this.scale.height);

    this.resizeHandler = (size: Phaser.Structs.Size) => {
      this.layout(size.width, size.height);
    };
    this.scale.on("resize", this.resizeHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.resizeHandler);
      this.cleanup();
    });

    this.applyPhase();

    /* WebSocket ハンドラを登録（シーン終了時に解除） */
    this.msgHandler = (msg: ServerMsg) => this.handleServerMsg(msg);
    this.closeHandler = () => this.handleDisconnect();
    net.onMessage(this.msgHandler);
    net.onClose(this.closeHandler);

    /* 画面表示時にサーバーから最新CP残高を取得 */
    if (net.isOpen()) {
      net.send({ type: "cp_balance", payload: {} });
    }
  }

  private styledButton(
    label: string, fontSize: string, color: string, hoverColor: string, glowColor: number, letterSpacing: number,
  ): Phaser.GameObjects.Text {
    const btn = this.add.text(0, 0, label, {
      fontFamily: SERIF,
      fontSize,
      color,
      letterSpacing,
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => {
        btn.setColor(hoverColor);
        if (btn.postFX) { btn.postFX.clear(); btn.postFX.addGlow(glowColor, 6, 0, false, 0.1, 12); }
      })
      .on("pointerout", () => {
        btn.setColor(color);
        if (btn.postFX) { btn.postFX.clear(); btn.postFX.addGlow(glowColor, 3, 0, false, 0.1, 8); }
      });

    if (btn.postFX) {
      btn.postFX.addGlow(glowColor, 3, 0, false, 0.1, 8);
    }
    return btn;
  }

  private layout(width: number, height: number): void {
    this.titleText.setPosition(width / 2, height * 0.05);

    const lineW = width * 0.45;
    const lineX = (width - lineW) / 2;
    const lineY = height * 0.09;
    this.lineGfx.clear();
    this.lineGfx.lineStyle(1, 0x225588, 0.4);
    this.lineGfx.beginPath();
    this.lineGfx.moveTo(lineX, lineY);
    this.lineGfx.lineTo(lineX + lineW, lineY);
    this.lineGfx.strokePath();

    this.cpDisplayText.setPosition(width / 2, height * 0.13);
    this.instructionText.setPosition(width / 2, height * 0.63);
    this.statusText.setPosition(width / 2, height * 0.70);
    this.distText.setPosition(width / 2, height * 0.76);
    this.startBtn.setPosition(width / 2, height * 0.83);
    this.goalBtn.setPosition(width / 2, height * 0.83);
    this.backBtn.setPosition(width / 2, height * 0.93);
  }

  /* ------------------------------------------------------------------ */
  /*  Navigation                                                        */
  /* ------------------------------------------------------------------ */

  private goHome(): void {
    this.cleanup();
    this.scene.start("HomeScreen");
  }

  /* ------------------------------------------------------------------ */
  /*  Server message handler                                            */
  /* ------------------------------------------------------------------ */

  private handleServerMsg(msg: ServerMsg): void {
    switch (msg.type) {
      case "cp_started":
        this.phase = "measuring";
        this.applyPhase();
        this.setStatus("計測中... 歩いてください", "#44ff88");
        this.startWatching();
        break;

      case "cp_progress": {
        const p = msg.payload;
        this.estimatedDist = p.estimatedDist;
        this.pointsRecorded = p.pointsRecorded;
        this.distText.setText(
          `距離: ${Math.round(this.estimatedDist)} m  (${this.pointsRecorded} 点記録)`,
        );
        break;
      }

      case "cp_result": {
        const r = msg.payload;
        this.phase = "done";
        this.applyPhase();
        this.stopWatching();
        this.setStatus(
          `距離: ${Math.round(r.distance)} m  /  +${r.earned} CP\n合計 ${r.total} CP`,
          "#44ff88",
        );
        this.distText.setText("");
        setCp(r.total);
        this.cpDisplayText.setText(`所持 CP: ${r.total}`);
        // 軌跡をまとめて描画
        if (r.positions && r.positions.length > 0) {
          this.trackCoords = r.positions.map((p) => [p.lon, p.lat] as [number, number]);
          this.drawTrack();
        }
        break;
      }

      case "cp_error": {
        const e = msg.payload;
        this.setStatus(`エラー: ${e.message}`, "#ff6666");
        if (this.phase === "connecting") {
          this.phase = "idle";
          this.applyPhase();
        }
        break;
      }

      case "cp_balance_result":
        setCp(msg.payload.total);
        this.cpDisplayText.setText(`所持 CP: ${msg.payload.total}`);
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Start / Stop                                                      */
  /* ------------------------------------------------------------------ */

  private async handleStart(): Promise<void> {
    if (this.phase !== "idle" && this.phase !== "done") return;
    if (!navigator.geolocation) {
      this.setStatus("位置情報が利用できません", "#ff6666");
      return;
    }

    this.phase = "connecting";
    this.applyPhase();
    this.setStatus("接続中...", "#ffdd44");
    this.estimatedDist = 0;
    this.pointsRecorded = 0;
    this.trackCoords = [];
    this.distText.setText("");

    try {
      if (!net.isOpen()) {
        await net.connect();
      }
      // サーバーは join で playerID を割り当てるため、CP操作前に必ず join を送る
      // waitFor を send の前に登録し、welcome を確実にキャッチする
      const welcomePromise = net.waitFor("welcome", 10_000);
      net.send({ type: "join", payload: { name: "__cp__walker", route: "attack" } });
      await welcomePromise;
      net.send({ type: "cp_start", payload: {} });
    } catch {
      this.phase = "idle";
      this.applyPhase();
      this.setStatus("サーバー接続に失敗しました", "#ff6666");
    }
  }

  private handleStop(): void {
    if (this.phase !== "measuring") return;
    this.setStatus("結果を計算中...", "#ffdd44");
    this.stopWatching();
    net.send({ type: "cp_stop", payload: {} });
  }

  /* ------------------------------------------------------------------ */
  /*  GPS watch                                                         */
  /* ------------------------------------------------------------------ */

  private startWatching(): void {
    this.stopWatching();
    this.lastSendTime = 0;
    this.initMap().catch(() => { /* map init failure is non-fatal */ });

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => this.setStatus(`GPS エラー: ${err.message}`, "#ff6666"),
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  }

  private stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private onPosition(pos: GeolocationPosition): void {
    const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;

    // 地図の現在地マーカーを更新
    this.updateMapPosition(lon, lat);

    // スロットル: UPDATE_INTERVAL_MS 以内なら送信しない
    const now = Date.now();
    if (now - this.lastSendTime < UPDATE_INTERVAL_MS) return;
    this.lastSendTime = now;

    // サーバーに送信（精度フィルタはサーバー側で行う）
    net.send({ type: "cp_update", payload: { lat, lon, acc } });

    // 軌跡にローカルでも追加（リアルタイム描画用）
    this.trackCoords.push([lon, lat]);
    this.drawTrack();
  }

  /* ------------------------------------------------------------------ */
  /*  Map (MapLibre GL JS)                                              */
  /* ------------------------------------------------------------------ */

  private async initMap(): Promise<void> {
    this.destroyMap();

    const container = document.createElement("div");
    container.id = "cp-map";
    container.style.cssText =
      "position:fixed;top:18%;left:20%;width:60%;height:40%;z-index:10;border-radius:8px;border:1px solid #225588;filter:brightness(2.0);";
    document.body.appendChild(container);

    // まず現在地を1回取得してから地図を初期化する
    const startPos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
      });
    }).catch(() => null);

    const center: [number, number] = startPos
      ? [startPos.coords.longitude, startPos.coords.latitude]
      : [139.7671, 35.6812]; // fallback: 東京駅

    // AWS Location Service Maps API v2 でスタイルを取得、失敗時は OSM フォールバック
    const osmFallback: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    };

    let style: string | maplibregl.StyleSpecification = osmFallback;

    try {
      const res = await fetch("/api/map-key");
      if (res.ok) {
        const data: { region: string; apiKey: string } = await res.json();
        if (data.apiKey && data.region) {
          // Maps API v2: /v2/styles/{StyleName}/descriptor
          const awsUrl = `https://maps.geo.${data.region}.amazonaws.com/v2/styles/Standard/descriptor?color-scheme=Dark&language=ja&key=${data.apiKey}`;
          const check = await fetch(awsUrl);
          if (check.ok) {
            style = awsUrl;
          }
        }
      }
    } catch {
      // fallback to OSM
    }

    this.map = new maplibregl.Map({
      container,
      style,
      center,
      zoom: 16,
      attributionControl: false,
    });

    this.map.addControl(new maplibregl.NavigationControl(), "top-right");

    // 現在地マーカー
    const el = document.createElement("div");
    el.style.width = "16px";
    el.style.height = "16px";
    el.style.borderRadius = "50%";
    el.style.background = "#44ff88";
    el.style.border = "3px solid #fff";
    el.style.boxShadow = "0 0 8px rgba(68,255,136,0.6)";
    this.userMarker = new maplibregl.Marker({ element: el })
      .setLngLat(center)
      .addTo(this.map);

    // 地図読み込み後に軌跡ソースを追加
    this.map.on("load", () => {
      if (!this.map) return;
      this.map.addSource("track", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} },
      });
      this.map.addLayer({
        id: "track-line",
        type: "line",
        source: "track",
        paint: {
          "line-color": "#44ff88",
          "line-width": 4,
          "line-opacity": 0.8,
        },
      });
    });
  }

  private updateMapPosition(lon: number, lat: number): void {
    if (this.userMarker) {
      this.userMarker.setLngLat([lon, lat]);
    }
    if (this.map) {
      this.map.easeTo({ center: [lon, lat], duration: 500 });
    }
  }

  private drawTrack(): void {
    if (!this.map) return;
    const source = this.map.getSource("track") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: this.trackCoords },
        properties: {},
      });
    }
  }

  private destroyMap(): void {
    if (this.userMarker) {
      this.userMarker.remove();
      this.userMarker = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    const container = document.getElementById("cp-map");
    if (container) container.remove();
  }

  /* ------------------------------------------------------------------ */
  /*  Disconnect handler                                                */
  /* ------------------------------------------------------------------ */

  private handleDisconnect(): void {
    if (this.phase === "measuring" || this.phase === "connecting") {
      this.phase = "idle";
      this.applyPhase();
      this.stopWatching();
      this.setStatus("サーバーとの接続が切れました", "#ff6666");
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Cleanup                                                           */
  /* ------------------------------------------------------------------ */

  private cleanup(): void {
    this.stopWatching();
    this.destroyMap();
    if (this.msgHandler) {
      net.offMessage(this.msgHandler);
      this.msgHandler = null;
    }
    if (this.closeHandler) {
      net.offClose(this.closeHandler);
      this.closeHandler = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  UI helpers                                                        */
  /* ------------------------------------------------------------------ */

  private applyPhase(): void {
    const setEnabled = (
      btn: Phaser.GameObjects.Text,
      enabled: boolean,
      activeColor: string,
    ) => {
      if (enabled) {
        btn.setInteractive({ useHandCursor: true }).setColor(activeColor);
      } else {
        btn.disableInteractive().setColor("#555555");
      }
    };

    switch (this.phase) {
      case "idle":
      case "done":
        setEnabled(this.startBtn, true, "#44ff88");
        setEnabled(this.goalBtn, false, "#ffaa44");
        this.startBtn.setVisible(true);
        this.goalBtn.setVisible(false);
        break;
      case "connecting":
        setEnabled(this.startBtn, false, "#44ff88");
        setEnabled(this.goalBtn, false, "#ffaa44");
        this.startBtn.setVisible(true);
        this.goalBtn.setVisible(false);
        break;
      case "measuring":
        this.startBtn.setVisible(false);
        this.goalBtn.setVisible(true);
        setEnabled(this.startBtn, false, "#44ff88");
        setEnabled(this.goalBtn, true, "#ffaa44");
        break;
    }
  }

  private setStatus(msg: string, color: string): void {
    this.statusText.setText(msg).setColor(color);
  }
}
