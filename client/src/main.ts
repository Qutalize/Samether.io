import Phaser from "phaser";
import { LoginScreen } from "./ui/screens/LoginScreen";
import { HomeScreen } from "./ui/screens/HomeScreen";
import { CPScreen } from "./ui/screens/CPScreen";
import { GameScene } from "./game/scenes/GameScene";
import { DeathScreen } from "./ui/screens/DeathScreen";

declare global {
  interface Window {
    __sametherDebug?: (msg: string) => void;
  }
}

const isMobileDevice = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
const debug = (msg: string) => window.__sametherDebug?.(msg);

const config: Phaser.Types.Core.GameConfig = {
  type: isMobileDevice ? Phaser.CANVAS : Phaser.AUTO,
  parent: "game",
  backgroundColor: "#001b44",
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  scene: [LoginScreen, HomeScreen, CPScreen, GameScene, DeathScreen],
};

debug(`phaser config renderer=${isMobileDevice ? "CANVAS" : "AUTO"}`);
const game = new Phaser.Game(config);

game.events.once(Phaser.Core.Events.READY, () => {
  debug(`ready renderer=${game.renderer.type} size=${game.scale.width}x${game.scale.height}`);
  setTimeout(() => game.scale.refresh(), 100);
});

game.events.on(Phaser.Core.Events.BLUR, () => debug("game blur"));
game.events.on(Phaser.Core.Events.FOCUS, () => debug("game focus"));
