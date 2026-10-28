// Telegram bot webhook: /start, /play and /help answer with a short story, the rules and a Play button.

interface TgMessage {
  chat: { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' };
  from?: { language_code?: string };
  text?: string;
}

const TEXT = {
  ru: {
    hello: `<b>🚋 Последний трамвай</b>

Полночь. Город спит, фонари мигают, по стеклу течёт дождь. А ты — водитель последнего рейса, и тебе надо довезти трамвай до Депо к рассвету.

<b>Как играть</b>
🃏 На каждой остановке собирай покерные руки: пару, стрит, флеш…
⚡ <b>Мощность = Ток × Напряжение</b>. Набери цель остановки, пока не кончились ходы.
👵 Сажай в салон пассажиров: бабка с семечками, Генерал, Электрик и ещё двадцать чудиков усиливают руки.
🔋 Копи искры и включай <b>Форсаж</b>, но не доведи шкалу до <b>Пробоя</b>.
🕵️ В конце каждой линии ждёт контролёр со своими правилами.

🏆 Каждый день — общий <b>Маршрут дня</b> для всех и топ игроков.

Жми «Играть» 👇`,
    group: `<b>🚋 Последний трамвай</b> — покерный рогалик в ночном трамвае. Кто доедет до Депо дальше всех? 🏆`,
    play: '🚋 Играть',
    top: '🏆 Топ игроков',
    open: '🚋 Открыть игру',
  },
  en: {
    hello: `<b>🚋 Last Tram</b>

Midnight. The city sleeps, streetlights flicker, rain runs down the glass. You drive the very last tram, and you must bring it to the Depot by dawn.

<b>How to play</b>
🃏 At every stop, build poker hands: a pair, a straight, a flush…
⚡ <b>Power = Current × Voltage</b>. Reach the stop target before you run out of hands.
👵 Seat passengers in your cabin: the seed granny, the General, the Electrician and twenty more oddballs power up your hands.
🔋 Build up sparks and fire <b>Overdrive</b>, but don't let the gauge hit a <b>Blowout</b>.
🕵️ An inspector with his own rules waits at the end of every line.

🏆 A shared <b>Daily Route</b> every day, with a leaderboard.

Tap “Play” 👇`,
    group: `<b>🚋 Last Tram</b> — a poker roguelite on a night tram. Who rides furthest to the Depot? 🏆`,
    play: '🚋 Play',
    top: '🏆 Leaderboard',
    open: '🚋 Open the game',
  },
} as const;

async function call(env: Env, method: string, body: unknown): Promise<void> {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error(method, r.status, await r.text());
}

export async function telegramWebhook(req: Request, env: Env): Promise<Response> {
  if (!env.WEBHOOK_SECRET || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const update = (await req.json().catch(() => null)) as { message?: TgMessage } | null;
  const msg = update?.message;
  const cmd = msg?.text?.split(/[\s@]/)[0];
  if (!msg || (cmd !== '/start' && cmd !== '/play' && cmd !== '/help')) return new Response('ok');

  const t = msg.from?.language_code?.startsWith('ru') !== false ? TEXT.ru : TEXT.en;
  const app = new URL('/', req.url).toString();
  if (msg.chat.type === 'private') {
    await call(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: t.hello,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [{ text: t.play, web_app: { url: app } }],
          [{ text: t.top, web_app: { url: `${app}?screen=top` } }],
        ],
      },
    });
  } else {
    // Web App buttons only work in private chats; in groups link to the bot instead.
    await call(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: t.group,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: t.open, url: `https://t.me/${env.BOT_USERNAME}?start=play` }]],
      },
    });
  }
  return new Response('ok');
}
