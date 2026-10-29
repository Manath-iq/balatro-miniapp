// Every translation key the client uses exists in both languages, and both languages have the same keys.
import { expect, test } from 'vitest';
import { keysOf } from '../../src/client/i18n';
import { pools } from '../../src/engine/content/registry';

test('translations are complete', () => {
  const ru = keysOf('ru');
  const en = keysOf('en');
  const used = new Set<string>();
  const sources = import.meta.glob<string>(['../../src/client/**/*.ts', '!../../src/client/i18n/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  for (const src of Object.values(sources))
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]!);
  for (const p of pools.passengers) for (const k of ['name', 'desc', 'flavor']) used.add(`p.${p.id}.${k}`);
  for (const p of pools.coupons) for (const k of ['name', 'desc']) used.add(`cp.${p.id}.${k}`);
  for (const p of pools.punches) for (const k of ['name', 'desc']) used.add(`pu.${p.id}.${k}`);
  for (const p of [...pools.lineBosses, ...pools.finalBosses])
    for (const k of ['name', 'desc', 'quote']) used.add(`in.${p.id}.${k}`);
  for (const p of pools.drivers) for (const k of ['name', 'desc']) used.add(`dr.${p.id}.${k}`);
  for (const p of pools.conditions) for (const k of ['name', 'desc']) used.add(`cd.${p.id}.${k}`);
  for (let h = 0; h < 11; h++) used.add(`hand.${h}`);
  expect([...used].filter((k) => !ru.has(k))).toEqual([]);
  expect([...used].filter((k) => !en.has(k))).toEqual([]);
  expect([...ru].filter((k) => !en.has(k))).toEqual([]);
  expect([...en].filter((k) => !ru.has(k))).toEqual([]);
});
