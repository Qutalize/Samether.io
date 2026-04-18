import Phaser from "phaser";
import { login, register, getSession } from "../../storage/auth";

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
    this.cameras.main.setBackgroundColor("#001b44");

    this.add
      .text(width / 2, height * 0.12, "サメザリオ", {
        fontFamily: "system-ui",
        fontSize: "56px",
        color: "#88ccee",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.23, "ログイン", {
        fontFamily: "system-ui",
        fontSize: "28px",
        color: "#ddeeff",
      })
      .setOrigin(0.5);

    this.nameInput = this.createInput("login-name", "名前を入力", "35%", 16);
    this.passwordInput = this.createInput("login-password", "パスワード", "45%", 32, true);

    this.errorText = this.add
      .text(width / 2, height * 0.53, "", {
        fontFamily: "system-ui",
        fontSize: "16px",
        color: "#ff6666",
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.62, "[ ログイン ]", {
        fontFamily: "system-ui",
        fontSize: "32px",
        color: "#44ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.handleLogin());

    this.add
      .text(width / 2, height * 0.73, "[ 新規登録 ]", {
        fontFamily: "system-ui",
        fontSize: "28px",
        color: "#ffaa44",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.handleRegister());

    this.nameInput.focus();

    this.passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleLogin();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nameInput.remove();
      this.passwordInput.remove();
    });
  }

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
      fontSize: "20px",
      padding: "10px 16px",
      borderRadius: "6px",
      border: "1px solid #446688",
      background: "#002b5c",
      color: "#ddeeff",
      outline: "none",
      width: "240px",
      textAlign: "center",
    } as CSSStyleDeclaration);
    document.body.appendChild(input);
    return input;
  }

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
