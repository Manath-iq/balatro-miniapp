# Последний трамвай / Last Tram

Покерный рогалик для Telegram Mini App: ночной неоновый трамвай, пассажиры-модификаторы, контролёры-боссы,
Мощность = Ток × Напряжение. Вертикальный экран, игра одним пальцем, ежедневный маршрут и лидерборд.

- Клиент: Vite + TypeScript + PixiJS, детерминированный движок в `src/engine` (общий с сервером).
- Сервер: один Cloudflare Worker (статика + `/api`) + D1; результаты проверяются реплеем лога ходов.
- План и исследование: [`docs/plan.md`](docs/plan.md), [`docs/research/`](docs/research).

## Разработка

```bash
npm install
npm run dev          # http://localhost:5173 (Worker + локальная D1)
npm run typecheck && npm run lint && npm test
npm run deploy       # vite build && wrangler deploy
```

Секреты задаются только через `npx wrangler secret put BOT_TOKEN` / `SEED_SECRET` и локально в `.dev.vars`
(в git не попадает; pre-commit хук блокирует токены ботов). После клона: `git config core.hooksPath .githooks`.
