// M0 diagnostics screen: proves Telegram integration, insets, auth and the API end to end.
// Replaced by the Pixi game boot in M2.
import './base.css';
import palette from '../../assets/palette.json';
import {
  can,
  initDataRaw,
  insets,
  inTelegram,
  isMobile,
  lang,
  onInsetsChanged,
  perfClass,
  ready,
  setupTelegram,
  tg,
} from './platform/tg';

const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

const setup = setupTelegram(palette.colors.night1);
const app = document.getElementById('app')!;

app.innerHTML = `
  <style>
    .diag { box-sizing: border-box; height: 100%; overflow-y: auto; touch-action: pan-y;
      padding: calc(var(--inset-top) + 16px) 16px calc(var(--inset-bottom) + 16px); }
    .diag h1 { margin: 0 0 4px; font-size: 22px; color: var(--amber); letter-spacing: 1px; }
    .diag .sub { color: var(--volt); margin-bottom: 16px; font-size: 13px; }
    .diag table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .diag td { padding: 6px 4px; border-bottom: 1px solid var(--panel); vertical-align: top; word-break: break-all; }
    .diag td:first-child { color: var(--dim); width: 42%; }
    .ok { color: var(--go); } .bad { color: var(--blow); }
  </style>
  <div class="diag">
    <h1>ПОСЛЕДНИЙ ТРАМВАЙ</h1>
    <div class="sub">диагностика · M0</div>
    <table id="rows"></table>
  </div>`;

const rows = document.getElementById('rows')!;
const set = (key: string, value: string, cls = ''): void => {
  let row = rows.querySelector<HTMLTableRowElement>(`tr[data-k="${key}"]`);
  if (!row) {
    row = document.createElement('tr');
    row.dataset.k = key;
    row.innerHTML = `<td>${key}</td><td></td>`;
    rows.append(row);
  }
  const cell = row.cells[1]!;
  cell.textContent = value;
  cell.className = cls;
};

const flag = (b: boolean): [string, string] => (b ? ['да', 'ok'] : ['нет', 'bad']);

function renderStatic(): void {
  set('в Telegram', ...flag(inTelegram));
  set('платформа', tg?.platform ?? 'browser');
  set('Bot API', tg?.version ?? '—');
  set('мобильный', isMobile() ? 'да' : 'нет');
  set('класс устройства', perfClass());
  set('язык', lang());
  set('fullscreen', setup.fullscreen, setup.fullscreen === 'on' ? 'ok' : '');
  set('ориентация закреплена', ...flag(setup.orientationLocked));
  set('свайп-закрытие выкл.', ...flag(setup.swipesDisabled));
  set('8.0 API', ...flag(can('8.0')));
  set(
    'игрок',
    tg?.initDataUnsafe?.user ? `${tg.initDataUnsafe.user.first_name} (${tg.initDataUnsafe.user.id})` : '—',
  );
}

function renderLayout(): void {
  const i = insets();
  set('инсеты (верх/низ)', `${i.top} / ${i.bottom} px`);
  set('экран (CSS px)', `${window.innerWidth} × ${window.innerHeight} @${window.devicePixelRatio}x`);
  set('stable height', `${tg?.viewportStableHeight ?? window.innerHeight} px`);
}

async function probeApi(): Promise<void> {
  try {
    const h = (await (await fetch(`${API}/api/health`)).json()) as {
      ok: boolean;
      db: boolean;
      botToken: boolean;
    };
    set('API /health', h.ok ? 'ok' : 'error', h.ok ? 'ok' : 'bad');
    set('D1', ...flag(h.db));
    set('BOT_TOKEN на сервере', ...flag(h.botToken));
  } catch (e) {
    set('API /health', String(e), 'bad');
  }
  if (!initDataRaw()) {
    set('авторизация', 'нет initData (открыто не из Telegram)');
    return;
  }
  try {
    const r = await fetch(`${API}/api/whoami`, { headers: { Authorization: `tma ${initDataRaw()}` } });
    const body = (await r.json()) as { user?: { id: number; first_name: string }; error?: string };
    if (r.ok && body.user) set('авторизация', `ok · ${body.user.first_name} #${body.user.id}`, 'ok');
    else set('авторизация', `${r.status} ${body.error ?? ''}`, 'bad');
  } catch (e) {
    set('авторизация', String(e), 'bad');
  }
}

renderStatic();
renderLayout();
onInsetsChanged(renderLayout);
window.addEventListener('resize', renderLayout);
requestAnimationFrame(() => ready());
void probeApi();
