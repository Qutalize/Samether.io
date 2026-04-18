import Phaser from "phaser";

const SERIF = "'Times New Roman', 'Georgia', serif";

const ROUTES = [
  {
    name: "攻撃系",
    color: "#ff6666",
    glowColor: 0xaa3333,
    sharks: ["シュモクザメ", "イタチザメ", "アオザメ", "ホオジロザメ", "メガロドン"],
    desc: "速度と攻撃力に特化。燃費が悪く、上位種ほどエサを大量に必要とする。\nメガロドンは「血の知覚」で他サメの方向を常時感知できる。",
  },
  {
    name: "非攻撃系",
    color: "#66ccff",
    glowColor: 0x336699,
    sharks: ["ドチザメ", "ネムリブカ", "シロワニ", "ウバザメ", "ジンベエザメ"],
    desc: "耐久力と燃費に特化。安定したプレイスタイル。\nシロワニは1日サバ1匹で満足するほどの超燃費型。",
  },
  {
    name: "深海魚系",
    color: "#bb66ff",
    glowColor: 0x663399,
    sharks: ["ツラナガコビトザメ", "ノコギリザメ", "ラブカ", "ミツクリザメ", "ニシオンデンザメ"],
    desc: "序盤は弱いが最上位が非常に強力なロマン型。\nニシオンデンザメはエサ不要で自動成長、探索範囲最大。",
  },
];

const RULES = [
  "鼻（頭の先端）が相手の体節に当たると自分が死亡",
  "上位種でも鼻は弱点 ─ ジャイアントキリングが起こる",
  "死亡するとエサに変換され、マップに散らばる",
  "エサを食べて XP を獲得 → 閾値で進化",
  "ダッシュで CP を消費して一時的に加速",
];

export class GuideScreen extends Phaser.Scene {
  private backBtn!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "GuideScreen" });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#030a14");

    /* ── title ── */
    const title = this.add
      .text(width / 2, 40, "G U I D E", {
        fontFamily: SERIF,
        fontSize: "36px",
        color: "#88ccee",
        letterSpacing: 10,
      })
      .setOrigin(0.5);

    if (title.postFX) {
      title.postFX.addGlow(0x225588, 4, 0, false, 0.1, 10);
    }

    /* ── scrollable content container ── */
    let y = 90;

    /* ── evolution routes ── */
    this.add
      .text(width / 2, y, "─  進 化 系 統  ─", {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#aa8866",
        letterSpacing: 6,
      })
      .setOrigin(0.5);
    y += 40;

    for (const route of ROUTES) {
      /* route header */
      const header = this.add
        .text(width / 2, y, route.name, {
          fontFamily: SERIF,
          fontSize: "26px",
          color: route.color,
          letterSpacing: 6,
        })
        .setOrigin(0.5);

      if (header.postFX) {
        header.postFX.addGlow(route.glowColor, 5, 0, false, 0.1, 10);
      }
      y += 38;

      /* evolution chain */
      const chain = route.sharks.join("  →  ");
      this.add
        .text(width / 2, y, chain, {
          fontFamily: SERIF,
          fontSize: "17px",
          color: "#ddeeff",
          letterSpacing: 2,
        })
        .setOrigin(0.5);
      y += 30;

      /* description */
      this.add
        .text(width / 2, y, route.desc, {
          fontFamily: SERIF,
          fontSize: "17px",
          color: "#bbccdd",
          align: "center",
          lineSpacing: 8,
        })
        .setOrigin(0.5, 0);
      y += 70;
    }

    /* ── rules ── */
    y += 10;
    this.add
      .text(width / 2, y, "─  ル ー ル  ─", {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#aa8866",
        letterSpacing: 6,
      })
      .setOrigin(0.5);
    y += 35;

    for (const rule of RULES) {
      this.add
        .text(width / 2, y, `◆  ${rule}`, {
          fontFamily: SERIF,
          fontSize: "17px",
          color: "#bbccdd",
          letterSpacing: 2,
        })
        .setOrigin(0.5);
      y += 32;
    }

    /* ── back button ── */
    y += 20;
    this.backBtn = this.add
      .text(width / 2, y, "─  戻る  ─", {
        fontFamily: SERIF,
        fontSize: "20px",
        color: "#6688aa",
        letterSpacing: 6,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => {
        this.backBtn.setColor("#88bbdd");
        if (this.backBtn.postFX) { this.backBtn.postFX.clear(); this.backBtn.postFX.addGlow(0x446688, 6, 0, false, 0.1, 12); }
      })
      .on("pointerout", () => {
        this.backBtn.setColor("#6688aa");
        if (this.backBtn.postFX) { this.backBtn.postFX.clear(); this.backBtn.postFX.addGlow(0x446688, 3, 0, false, 0.1, 8); }
      })
      .on("pointerdown", () => this.scene.start("HomeScreen"));

    if (this.backBtn.postFX) {
      this.backBtn.postFX.addGlow(0x446688, 3, 0, false, 0.1, 8);
    }
  }
}
