import Phaser from "phaser";
import { LoginScreen } from "./ui/screens/LoginScreen";
import { HomeScreen } from "./ui/screens/HomeScreen";
import { CPScreen } from "./ui/screens/CPScreen";
import { GameScene } from "./game/scenes/GameScene";
import { DeathScreen } from "./ui/screens/DeathScreen";
import { GuideScreen } from "./ui/screens/GuideScreen";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#001b44",
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  scene: [LoginScreen, HomeScreen, CPScreen, GuideScreen, GameScene, DeathScreen],
};

const game = new Phaser.Game(config);

game.events.once(Phaser.Core.Events.READY, () => {
  setTimeout(() => game.scale.refresh(), 100);
});
