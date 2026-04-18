import Phaser from "phaser";
import { HomeScreen } from "./ui/screens/HomeScreen";
import { CPScreen } from "./ui/screens/CPScreen";
import { GameScene } from "./game/scenes/GameScene";
import { DeathScreen } from "./ui/screens/DeathScreen";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#001b44",
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  scene: [HomeScreen, CPScreen, GameScene, DeathScreen],
};

new Phaser.Game(config);
