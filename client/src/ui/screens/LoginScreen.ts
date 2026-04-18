import Phaser from "phaser";
import { login, register, getSession } from "../../storage/auth";

const SERIF = "'Times New Roman', 'Georgia', serif";

export class LoginScreen extends Phaser.Scene {
  private nameInput!: HTMLInputElement;
  private passwordInput!: HTMLInputElement;
  private errorText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "LoginScreen" });
  }

  create(): void {
    const session = getSession();
    if (session) {
      this.scene.start("HomeScreen");
      return;
    }

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#030a14");

    /* ── title ── */
    const title = this.add
      .text(width / 2, height * 0.18, "S A M E T H E R . I O", {
        fontFamily: SERIF,
        fontSize: "52px",
        color: "#88ccee",
        letterSpacing: 10,
      })
      .setOrigin(0.5);

    if (title.postFX) {
      title.postFX.addGlow(0x225588, 6, 0, false, 0.1, 12);
    }

    /* ── subtitle ── */
    this.add
      .text(width / 2, height * 0.26, "Sign in to dive", {
        fontFamily: SERIF,
        fontSize: "16px",
        color: "#4a6a8a",
        letterSpacing: 6,
      })
      .setOrigin(0.5);

    /* ── accent lines ── */
    const lineW = width * 0.45;
    const lineX = (width - lineW) / 2;
    const lineGfx = this.add.graphics();
    lineGfx.lineStyle(1, 0x225588, 0.4);
    lineGfx.beginPath();
    lineGfx.moveTo(lineX, height * 0.30);
    lineGfx.lineTo(lineX + lineW, height * 0.30);
    lineGfx.strokePath();

    /* ── inputs ── */
    this.nameInput = this.createInput("login-name", "名前", "38%", 16);
    this.passwordInput = this.createInput(
      "login-password",
      "パスワード",
      "46%",
      32,
      true,
    );

    /* ── error text ── */
    this.errorText = this.add
      .text(width / 2, height * 0.54, "", {
        fontFamily: SERIF,
        fontSize: "14px",
        color: "#ff6666",
        align: "center",
      })
      .setOrigin(0.5);

    /* ── login button ── */
    const loginBtn = this.add
      .text(width / 2, height * 0.62, "─  ログイン  ─", {
        fontFamily: SERIF,
        fontSize: "28px",
        color: "#44ff88",
        letterSpacing: 8,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => loginBtn.setColor("#88ffbb"))
      .on("pointerout", () => loginBtn.setColor("#44ff88"))
      .on("pointerdown", () => this.handleLogin());

    if (loginBtn.postFX) {
      loginBtn.postFX.addGlow(0x22aa55, 4, 0, false, 0.1, 8);
    }

    /* ── register button ── */
    this.add
      .text(width / 2, height * 0.72, "[ 新規登録 ]", {
        fontFamily: SERIF,
        fontSize: "22px",
        color: "#ffaa44",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.handleRegister());

    /* ── focus & keyboard ── */
    this.nameInput.focus();
    this.passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleLogin();
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
      fontFamily: "'Times New Roman', 'Georgia', serif",
      fontSize: "18px",
      padding: "12px 20px",
      borderRadius: "4px",
      border: "1px solid #225588",
      background: "rgba(3, 10, 20, 0.9)",
      color: "#88ccee",
      outline: "none",
      width: "260px",
      textAlign: "center",
      boxShadow: "0 0 12px rgba(34, 85, 136, 0.15)",
      transition: "border-color 0.2s, box-shadow 0.2s",
      letterSpacing: "2px",
    } as CSSStyleDeclaration);

    input.addEventListener("focus", () => {
      input.style.borderColor = "#44aaff";
      input.style.boxShadow = "0 0 16px rgba(34, 85, 136, 0.3)";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "#225588";
      input.style.boxShadow = "0 0 12px rgba(34, 85, 136, 0.15)";
    });

    document.body.appendChild(input);
    return input;
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
