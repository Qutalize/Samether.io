import Phaser from "phaser";
import maplibregl from "maplibre-gl";
import { net } from "../../network/websocket";
import { loadCp } from "../../storage/cp";
import type { ServerMsg } from "../../network/protocol";

const SERIF = "'Times New Roman', 'Georgia', serif";

/** GPS送信間隔 (ms) — サーバーの5秒間隔フィルタに合わせる */
const UPDATE_INTERVAL_MS = 5_000;

type Phase = "idle" | "connecting" | "measuring" | "done";

export class CPScreen extends Phaser.Scene {
  private cpDisplayText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Text;
  private stopBtn!: Phaser.GameObjects.Text;

  private phase: Phase = "idle";
  private watchId: number | null = null;
  private lastSendTime = 0;

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
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#030a14");

    /* ── title ── */
    const title = this.add
      .text(width / 2, height * 0.54, "C P  獲 得", {
        fontFamily: SERIF,
        fontSize: "52px",
        color: "#88ccee",
        letterSpacing: 10,
      })
      .setOrigin(0.5);

    if (title.postFX) {
      title.postFX.addGlow(0x225588, 6, 0, false, 0.1, 12);
    }

    /* ── accent line ── */
    const lineW = width * 0.45;
    const lineX = (width - lineW) / 2;
    const lineGfx = this.add.graphics();
    lineGfx.lineStyle(1, 0x225588, 0.4);
    lineGfx.beginPath();
    lineGfx.moveTo(lineX, height * 0.60);
    lineGfx.lineTo(lineX + lineW, height * 0.60);
    lineGfx.strokePath();

    /* ── CP display ── */
    this.cpDisplayText = this.add
      .text(width / 2, height * 0.64, `所持 CP: ${loadCp()}`, {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#6688aa",
      })
      .setOrigin(0.5);

    /* ── instructions ── */
    this.add
      .text(
        width / 2,
        height * 0.70,
        "[ スタート ] を押して歩くと自動で CP が貯まります",
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
      .text(width / 2, height * 0.76, "待機中", {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#4a6a8a",
      })
      .setOrigin(0.5);

    /* ── distance display ── */
    this.distText = this.add
      .text(width / 2, height * 0.81, "", {
        fontFamily: SERIF,
        fontSize: "18px",
        color: "#6688aa",
      })
      .setOrigin(0.5);

    /* ── start button ── */
    this.startBtn = this.add
      .text(width / 2, height * 0.88, "─  スタート  ─", {
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

    /* ── stop button ── */
    this.stopBtn = this.add
      .text(width / 2, height * 0.88, "[ ストップ ]", {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#555555",
        letterSpacing: 4,
      })
      .setOrigin(0.5)
      .on("pointerdown", () => this.handleStop());

    /* ── back button ── */
    this.add
      .text(width / 2, height * 0.95, "[ ホームへ戻る ]", {
        fontFamily: SERIF,
        fontSize: "18px",
        color: "#6688aa",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.goHome());

    this.applyPhase();

    /* WebSocket メッセージハンドラを登録 */
    net.onMessage((msg: ServerMsg) => this.handleServerMsg(msg));
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
      if (!net.isOpen()) await net.connect();
      // cp_start はサーバーが cp_started で応答する
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
    this.initMap();

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

    const container = document.getElementById("cp-map");
    if (!container) return;
    container.style.display = "block";

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

    // AWS Location Service の地図スタイルURLを取得
    let style: string | maplibregl.StyleSpecification =
      `https://demotiles.maplibre.org/style.json`; // fallback

    try {
      const res = await fetch("/api/map-key");
      if (res.ok) {
        const data: { mapName: string; region: string; apiKey: string } = await res.json();
        if (data.apiKey && data.mapName && data.region) {
          style = `https://maps.geo.${data.region}.amazonaws.com/maps/v0/maps/${data.mapName}/style-descriptor?key=${data.apiKey}`;
        }
      }
    } catch {
      // fallback
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
    const container = document.getElementById("cp-map");
    if (container) container.style.display = "none";

    if (this.userMarker) {
      this.userMarker.remove();
      this.userMarker = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Cleanup                                                           */
  /* ------------------------------------------------------------------ */

  private cleanup(): void {
    this.stopWatching();
    this.destroyMap();
    // 計測中に離脱した場合、サーバー側で自動終了される
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
        setEnabled(this.stopBtn, false, "#ffaa44");
        this.startBtn.setVisible(true);
        this.stopBtn.setVisible(false);
        break;
      case "connecting":
        setEnabled(this.startBtn, false, "#44ff88");
        setEnabled(this.stopBtn, false, "#ffaa44");
        this.startBtn.setVisible(true);
        this.stopBtn.setVisible(false);
        break;
      case "measuring":
        this.startBtn.setVisible(false);
        this.stopBtn.setVisible(true);
        setEnabled(this.startBtn, false, "#44ff88");
        setEnabled(this.stopBtn, true, "#ffaa44");
        break;
    }
  }

  private setStatus(msg: string, color: string): void {
    this.statusText.setText(msg).setColor(color);
  }
}
