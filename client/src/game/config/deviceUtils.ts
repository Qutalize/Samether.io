export function isTouchDevice(scene: Phaser.Scene): boolean {
  const nav = globalThis.navigator;
  return !scene.sys.game.device.os.desktop || (nav?.maxTouchPoints ?? 0) > 0;
}
