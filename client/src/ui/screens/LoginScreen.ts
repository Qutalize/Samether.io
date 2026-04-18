import Phaser from "phaser";
import { login, register, getSession } from "../../storage/auth";
import { OceanBackgroundShader } from "../../game/objects/BackgroundShader";

export class LoginScreen extends Phaser.Scene {
  private nameInput!: HTMLInputElement;
  private passwordInput!: HTMLInputElement;
  private errorText!: Phaser.GameObjects.Text;
  private bgShader!: Phaser.GameObjects.Shader;

  constructor() {
    super({ key: "LoginScreen" });
  }

  preload(): void {
    this.load.image("shark", "shark.png");
    if (!this.cache.shader.has("OceanBackground")) {
      this.cache.shader.add("OceanBackground", OceanBackgroundShader);
    }
  }

  create(): void {
    const session = getSession();
    if (session) {
      this.scene.start("HomeScreen");
      return;
    }

    const { width, height } = this.scale;

    /* ── animated ocean background ── */
    this.bgShader = this.add.shader(
      "OceanBackground",
      width / 2,
      height / 2,
      width,
      height,
    );

    /* ── dark overlay panel ── */
    const panelW = Math.min(420, width * 0.88);
    const panelH = height * 0.72;
    const panelX = width / 2;
    const panelY = height * 0.52;

    const panel = this.add.graphics();
    panel.fillStyle(0x001020, 0.75);
    panel.fillRoundedRect(
      panelX - panelW / 2,
      panelY - panelH / 2,
      panelW,
      panelH,
      16,
    );
    panel.lineStyle(1, 0x335577, 0.5);
    panel.strokeRoundedRect(
      panelX - panelW / 2,
      panelY - panelH / 2,
      panelW,
      panelH,
      16,
    );

    /* ── shark logo ── */
    const logo = this.add
      .image(width / 2, height * 0.21, "shark")
      .setOrigin(0.5);
    const logoScale = Math.min(100 / logo.width, 80 / logo.height);
    logo.setScale(logoScale).setAlpha(0.85).setTint(0x88ccee);

    /* ── title ── */
    this.add
      .text(width / 2, height * 0.3, "サメザリオ", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "48px",
        color: "#a0ddff",
      })
      .setOrigin(0.5)
      .setStroke("#0a3055", 6);

    this.add
      .text(width / 2, height * 0.37, "Sign in to dive", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#557799",
        letterSpacing: 4,
      })
      .setOrigin(0.5);

    /* ── inputs ── */
    this.nameInput = this.createInput("login-name", "名前", "46%", 16);
    this.passwordInput = this.createInput(
      "login-password",
      "パスワード",
      "54%",
      32,
      true,
    );

    /* ── error text ── */
    this.errorText = this.add
      .text(width / 2, height * 0.6, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#ff6666",
        align: "center",
      })
      .setOrigin(0.5);

    /* ── buttons ── */
    this.createButton(
      width / 2,
      height * 0.67,
      "ログイン",
      panelW * 0.7,
      44,
      0x1a6040,
      "#44ffaa",
      () => this.handleLogin(),
    );

    this.createButton(
      width / 2,
      height * 0.755,
      "新規登録",
      panelW * 0.7,
      44,
      0x2a4060,
      "#88bbdd",
      () => this.handleRegister(),
    );

    /* ── focus & keyboard ── */
    this.nameInput.focus();
    this.passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleLogin();
    });

    /* ── resize handler ── */
    this.scale.on("resize", (sz: Phaser.Structs.Size) => {
      if (this.bgShader) {
        this.bgShader.setSize(sz.width, sz.height);
        this.bgShader.setPosition(sz.width / 2, sz.height / 2);
      }
    });

    /* ── cleanup ── */
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nameInput.remove();
      this.passwordInput.remove();
    });
  }

  /* ── HTML input helper ── */
  private createInput(
    id: string,
    placeholder: string,
    top: string,
    maxLength: number,
    isPassword = false,
  ): HTMLInputElement {
    const existing = document.getElementById(id) as HTMLInputElement | null;
    if (existing) existing.remove();

    const input = document.createElement("input");
    input.id = id;
    input.type = isPassword ? "password" : "text";
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    Object.assign(input.style, {
      position: "absolute",
      left: "50%",
      top,
      transform: "translate(-50%, -50%)",
      fontSize: "18px",
      padding: "12px 20px",
      borderRadius: "8px",
      border: "1px solid #335577",
      background: "rgba(0, 20, 50, 0.85)",
      color: "#ddeeff",
      outline: "none",
      width: "260px",
      textAlign: "center",
      boxShadow: "0 0 12px rgba(68, 170, 255, 0.08), inset 0 1px 4px rgba(0,0,0,0.3)",
      transition: "border-color 0.2s, box-shadow 0.2s",
    } as CSSStyleDeclaration);

    input.addEventListener("focus", () => {
      input.style.borderColor = "#44aaff";
      input.style.boxShadow =
        "0 0 16px rgba(68, 170, 255, 0.2), inset 0 1px 4px rgba(0,0,0,0.3)";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "#335577";
      input.style.boxShadow =
        "0 0 12px rgba(68, 170, 255, 0.08), inset 0 1px 4px rgba(0,0,0,0.3)";
    });

    document.body.appendChild(input);
    return input;
  }

  /* ── canvas button helper ── */
  private createButton(
    x: number,
    y: number,
    label: string,
    w: number,
    h: number,
    bgColor: number,
    textColor: string,
    onClick: () => void,
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 0.9);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    bg.lineStyle(1, 0x44aaff, 0.15);
    bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);

    const txt = this.add
      .text(x, y, label, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        fontStyle: "bold",
        color: textColor,
      })
      .setOrigin(0.5);

    const hitArea = new Phaser.Geom.Rectangle(
      x - w / 2,
      y - h / 2,
      w,
      h,
    );
    const hitZone = this.add
      .zone(x, y, w, h)
      .setInteractive({ hitArea, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true })
      .on("pointerover", () => {
        bg.clear();
        bg.fillStyle(bgColor, 1.0);
        bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
        bg.lineStyle(1, 0x66ccff, 0.4);
        bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
        txt.setScale(1.03);
      })
      .on("pointerout", () => {
        bg.clear();
        bg.fillStyle(bgColor, 0.9);
        bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
        bg.lineStyle(1, 0x44aaff, 0.15);
        bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
        txt.setScale(1.0);
      })
      .on("pointerdown", onClick);
  }

  /* ── auth handlers ── */
  private async handleLogin(): Promise<void> {
    const name = this.nameInput.value.trim();
    const password = this.passwordInput.value;
    const result = await login(name, password);
    if (result.ok) {
      this.scene.start("HomeScreen");
    } else {
      this.errorText.setText(result.error ?? "ログインに失敗しました");
    }
  }

  private async handleRegister(): Promise<void> {
    const name = this.nameInput.value.trim();
    const password = this.passwordInput.value;
    const result = await register(name, password);
    if (result.ok) {
      this.scene.start("HomeScreen");
    } else {
      this.errorText.setText(result.error ?? "登録に失敗しました");
    }
  }
}
