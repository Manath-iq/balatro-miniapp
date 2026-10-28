// Portraits generated with ChatGPT and sliced by scripts/art/slice_portraits.py (40×40 art px).
import { Assets, type Texture } from 'pixi.js';

const urls = import.meta.glob<string>('../art/portraits/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const textures = new Map<string, Texture>();

export async function loadArt(): Promise<void> {
  await Promise.all(
    Object.entries(urls).map(async ([path, url]) => {
      const id = path.slice(path.lastIndexOf('/') + 1, -4);
      const tex = await Assets.load<Texture>(url);
      tex.source.scaleMode = 'nearest';
      textures.set(id, tex);
    }),
  );
}

export const portrait = (id: string): Texture | undefined => textures.get(id);
export const PORTRAIT = 40;
