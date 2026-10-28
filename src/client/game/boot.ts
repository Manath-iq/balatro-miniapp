import { Game } from './app';
import { kioskScene, rewardScene } from './scenes/kiosk';
import { menuScene } from './scenes/menu';
import { resultScene } from './scenes/result';
import { routeScene } from './scenes/route';
import { stopScene } from './scenes/stop';
import { topScene } from './scenes/top';

export async function startGame(root: HTMLElement): Promise<Game> {
  const game = new Game(root);
  await game.start({
    menu: menuScene,
    route: routeScene,
    stop: stopScene,
    kiosk: kioskScene,
    reward: rewardScene,
    result: resultScene,
    top: topScene,
  });
  if (new URLSearchParams(location.search).get('screen') === 'top') {
    game.backTo = 'menu';
    game.show('top');
  }
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  return game;
}
