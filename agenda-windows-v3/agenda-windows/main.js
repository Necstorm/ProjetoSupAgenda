const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Tray, Menu, nativeImage, screen } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { pathToFileURL } = require('url');
const Core = require('./mobile/core.js'), mobile = require('./server');
if (!app.requestSingleInstanceLock()) app.quit();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AgendaPessoal';
const DEF = { items: [], topics: [], news: [], digests: [], lastCheck: '', lastTopic: {}, win: null,
  settings: { theme: 'auto', hour: 8, model: 'qwen2.5:7b', ollama: true, autostart: false, remind: true, mobile: true, pin: '',
    sound: true, volume: 0.6, tone: 'sino', zoom: 1, autozoom: true, cellH: 130, colW: 150, mcols: [1, 1, 1, 1, 1, 1, 1],
    themeColors: {}, rawgKey: '', tmdbKey: '',
    cols: [{ id: 'todo', name: 'A fazer' }, { id: 'doing', name: 'Fazendo' }, { id: 'done', name: 'Feito' }] } };
let win, tray, quitting = false, checking = false, srv = null, db = structuredClone(DEF);

const userDir = () => app.getPath('userData'), imgDir = () => path.join(userDir(), 'imgs');
const FILE = () => path.join(userDir(), 'dados.json');
const merge = d => ({ ...DEF, ...d, settings: { ...DEF.settings, ...(d.settings || {}) } });
const load = () => { try { db = merge(JSON.parse(fs.readFileSync(FILE(), 'utf8'))); } catch {} };
const save = () => { try { fs.writeFileSync(FILE(), JSON.stringify(db)); } catch {} };
const ensurePin = () => { if (!/^\d{6}$/.test(db.settings.pin || '')) db.settings.pin = String(crypto.randomInt(100000, 1000000)); };
const push = () => win && !win.isDestroyed() && win.webContents.send('db', db);
const show = () => { if (!win) return; win.show(); if (win.isMinimized()) win.restore(); win.focus(); };
const focused = () => win && win.isVisible() && win.isFocused();

// ---------- Backup diário automático ----------
function autoBackup() {
  try {
    const dir = path.join(userDir(), 'backups'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `dados-${Core.ymd(new Date())}.json`); if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(db));
    fs.readdirSync(dir).filter(x => x.startsWith('dados-')).sort().slice(0, -14).forEach(x => fs.unlinkSync(path.join(dir, x)));
  } catch {}
}

// ---------- Notícias (RSS gratuito, várias fontes) ----------
const dec = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
const tag = (x, t) => { const m = x.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>')); return m ? dec(m[1]) : ''; };
const strip = h => dec(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const words = s => (s || '').split(/[,\s]+/).filter(Boolean);
const get = (u, o = {}) => fetch(u, { headers: { 'User-Agent': UA, ...(o.h || {}) }, method: o.m, body: o.b, signal: AbortSignal.timeout(o.t || 15000) });

async function getFeed(url) {
  const xml = await (await get(url, { h: { Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' }, t: 20000 })).text();
  return [...xml.matchAll(/<(item|entry)[\s>]([\s\S]*?)<\/\1>/g)].slice(0, 15).map(m => { const x = m[2];
    return { title: strip(tag(x, 'title')), source: tag(x, 'source') || tag(x, 'name'), date: tag(x, 'pubDate') || tag(x, 'published') || tag(x, 'updated'),
      snippet: strip(tag(x, 'description') || tag(x, 'media:description') || tag(x, 'summary') || tag(x, 'content')).slice(0, 400),
      link: tag(x, 'link') || (x.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '' }; });
}
async function ytFeed(line) {
  let m = line.match(/channel_id=(UC[\w-]{22})/) || line.match(/channel\/(UC[\w-]{22})/);
  if (!m) { try { const h = await (await get(/^https?:/.test(line) ? line : 'https://' + line)).text(); m = h.match(/"channelId":"(UC[\w-]{22})"/) || h.match(/channel_id=(UC[\w-]{22})/); } catch {} }
  return m ? `https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}` : '';
}
async function topicFeeds(t) {
  const out = [], base = [t.name, t.include].filter(Boolean).join(' ');
  const q = base + words(t.exclude).map(w => ' -' + w).join('');
  const loc = t.lang === 'en' ? 'hl=en-US&gl=US&ceid=US:en' : 'hl=pt-BR&gl=BR&ceid=BR:pt-419';
  if (/^https?:\/\//.test(t.name)) out.push({ kind: 'rss', url: t.name });
  else {
    if (t.google !== false) out.push({ kind: 'noticia', url: `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${loc}` });
    if (t.reddit) out.push({ kind: 'reddit', url: `https://www.reddit.com/search.rss?q=${encodeURIComponent(base)}&sort=new` });
  }
  for (const line of (t.extra || '').split(/\n+/).map(s => s.trim()).filter(Boolean)) {
    if (/^\/?r\/\w+/i.test(line)) out.push({ kind: 'reddit', url: `https://www.reddit.com/${line.replace(/^\/+/, '')}/new/.rss` });
    else if (/youtube\.com|youtu\.be/.test(line)) { const u = await ytFeed(line); if (u) out.push({ kind: 'youtube', url: u }); }
    else if (/^https?:/.test(line)) out.push({ kind: 'rss', url: line });
  }
  return out;
}
async function articleText(link) { // melhora o resumo lendo o texto da matéria (quando o link abre direto)
  try {
    const r = await get(link, { t: 10000 }); if (/news\.google\./.test(r.url)) return '';
    const h = (await r.text()).slice(0, 400000), og = (h.match(/<meta[^>]+(?:og:description|name="description")[^>]+content="([^"]+)"/i) || [])[1] || '';
    const ps = [...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => strip(m[1])).filter(x => x.length > 60).join(' ');
    return (strip(og) + ' ' + ps).slice(0, 1200);
  } catch { return ''; }
}
async function summarize(topic, items) {
  const lines = [];
  for (const it of items.slice(0, 8)) { const txt = (await articleText(it.link)) || it.snippet || ''; lines.push(`- [${it.kind}] ${it.title}${txt ? ' — ' + txt.slice(0, 500) : ''}`); }
  const prompt = `Você resume notícias em português do Brasil. Escreva de 3 a 5 frases curtas dizendo o que há de novo sobre "${topic}", juntando os itens do mesmo assunto. Use SOMENTE as informações abaixo e não invente nada.\n\n${lines.join('\n')}`;
  const r = await fetch('http://127.0.0.1:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: db.settings.model, stream: false, prompt, options: { num_ctx: 6144 } }), signal: AbortSignal.timeout(300000) });
  return ((await r.json()).response || '').trim();
}

async function check(manual, only) {
  if (checking) return 0;
  checking = true; let fresh = 0; const per = {};
  for (const t of db.topics.filter(t => !only || only.includes(t.id))) {
    db.lastTopic[t.id] = Date.now();
    let feeds = []; try { feeds = await topicFeeds(t); } catch {}
    for (const f of feeds) {
      try {
        for (const it of await getFeed(f.url)) {
          if (!it.link || !it.title || db.news.some(n => n.link === it.link)) continue;
          if (words(t.exclude).some(w => it.title.toLowerCase().includes(w.toLowerCase()))) continue;
          db.news.unshift({ id: Date.now() + Math.random(), topicId: t.id, topic: t.name, kind: f.kind, ...it, seen: false, fav: false, found: Date.now() });
          (per[t.name] = per[t.name] || { imm: t.priority === 'imediato', items: [] }).items.push({ ...it, kind: f.kind }); fresh++;
        }
      } catch {}
    }
  }
  db.news = db.news.filter((n, i) => n.fav || i < 800);
  if (!only || manual) db.lastCheck = new Date().toISOString();
  save(); checking = false; push();
  for (const [t, v] of Object.entries(per)) if (v.imm && !focused()) notify(`${t}: ${v.items[0].title}`, v.items.length > 1 ? `+${v.items.length - 1} novidades` : '');
  const agg = Object.entries(per).filter(([, v]) => !v.imm);
  if (agg.length && !only && !focused()) notify('Agenda', `${agg.reduce((a, [, v]) => a + v.items.length, 0)} novidades em ${agg.length} tema${agg.length > 1 ? 's' : ''}`);
  if (fresh && db.settings.ollama) (async () => {
    for (const [t, v] of Object.entries(per)) { try { const text = await summarize(t, v.items); if (text) db.digests.unshift({ date: new Date().toISOString(), topic: t, text }); } catch {} }
    db.digests = db.digests.slice(0, 40); save(); push();
  })();
  return fresh;
}
function notify(title, body) { const n = new Notification({ title, body }); n.on('click', () => { show(); win.webContents.send('goto', 'noticias'); }); n.show(); }
const dailyDue = () => { const n = new Date(), l = db.lastCheck ? new Date(db.lastCheck) : null; return db.topics.length && n.getHours() >= db.settings.hour && (!l || l.toDateString() !== n.toDateString()); };
const tick = () => {
  if (dailyDue()) return check(false);
  const imm = db.topics.filter(t => t.priority === 'imediato' && Date.now() - (db.lastTopic[t.id] || 0) > 3600000).map(t => t.id);
  if (imm.length) check(false, imm);
};

// ---------- Alarmes e lembretes ----------
const fired = new Set(); let snoozes = [];
const openItem = (id, date) => { show(); win.webContents.send('open-item', { id, date }); };
function fire(i, ds, sound) {
  if (!focused()) { const n = new Notification({ title: i.title || 'Agenda', body: (i.theme ? i.theme + ' · ' : '') + (i.time || ''), silent: true }); n.on('click', () => openItem(i.id, ds)); n.show(); }
  if (sound && win && !win.isDestroyed()) win.webContents.send('alarm', { id: i.id, date: ds, title: i.title, theme: i.theme, time: i.time });
}
setInterval(() => {
  const now = Date.now();
  for (const i of db.items) {
    if (!i.time) continue; const has = i.alarm !== '' && i.alarm != null; if (!has && !db.settings.remind) continue;
    for (let k = 0; k <= 1; k++) {
      const ds = Core.ymd(Core.addD(new Date(), k)); if (!Core.starts(i, ds) || Core.isDone(i, ds)) continue;
      const at = new Date(ds + 'T' + i.time).getTime() - (has ? +i.alarm * 60000 : 0), key = i.id + ds + i.alarm;
      if (now >= at && now < at + 90000 && !fired.has(key)) { fired.add(key); fire(i, ds, has); }
    }
  }
  const due = snoozes.filter(s => s.at <= now); snoozes = snoozes.filter(s => s.at > now);
  for (const s of due) { const i = db.items.find(x => x.id === s.id); if (i) fire(i, s.date, true); }
}, 15000);

// ---------- Janela, zoom e posição ----------
function applyZoom() {
  if (!win || win.isDestroyed()) return; const s = db.settings; let f = s.zoom || 1;
  if (s.autozoom) f *= Math.min(1.4, Math.max(0.85, screen.getDisplayMatching(win.getBounds()).workAreaSize.width / 1920));
  win.webContents.setZoomFactor(Math.min(2, Math.max(0.5, f)));
}
let zt; const later = () => { clearTimeout(zt); zt = setTimeout(() => { applyZoom(); if (win && !win.isMinimized() && win.isVisible()) { db.win = win.getBounds(); save(); } }, 400); };
function createWindow() {
  const b = db.win, ok = b && screen.getAllDisplays().some(d => b.x >= d.bounds.x - 50 && b.x < d.bounds.x + d.bounds.width - 100 && b.y >= d.bounds.y - 50 && b.y < d.bounds.y + d.bounds.height - 100);
  win = new BrowserWindow({ width: ok ? b.width : 1280, height: ok ? b.height : 820, ...(ok ? { x: b.x, y: b.y } : {}), minWidth: 720, minHeight: 500, show: !process.argv.includes('--hidden'),
    icon: path.join(__dirname, 'assets/icon.png'), backgroundColor: '#f6f7f9',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  win.loadFile('index.html'); win.webContents.on('did-finish-load', applyZoom);
  win.on('moved', later); win.on('resized', later); win.on('maximize', later); win.on('unmaximize', later);
  win.on('close', e => { if (!quitting) { e.preventDefault(); db.win = win.getBounds(); save(); win.hide(); } });
}
const startSrv = () => { if (!srv && db.settings.mobile) { try { srv = mobile({ get: () => db, save, push, imgDir: imgDir() }); } catch { srv = null; } } };
const stopSrv = () => { if (srv) { srv.close(); if (srv.closeAllConnections) srv.closeAllConnections(); srv = null; } };

app.on('second-instance', show);
app.on('before-quit', () => { quitting = true; });
app.whenReady().then(() => {
  load(); ensurePin(); save(); autoBackup(); startSrv(); Menu.setApplicationMenu(null); createWindow();
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets/icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Agenda');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Abrir', click: show }, { label: 'Verificar notícias agora', click: () => check(true) }, { label: 'Sair', click: () => { quitting = true; app.quit(); } }]));
  tray.on('click', show);
  setTimeout(tick, 8000); setInterval(tick, 10 * 60 * 1000); setInterval(autoBackup, 6 * 3600 * 1000);
});

// ---------- IPC ----------
ipcMain.handle('load', () => db);
ipcMain.handle('save', (_, d) => {
  db.items = d.items; db.topics = d.topics; db.settings = { ...db.settings, ...d.settings, pin: db.settings.pin };
  db.news = db.news.filter(n => n.fav || db.topics.some(t => t.id === n.topicId));
  app.setLoginItemSettings({ openAtLogin: !!db.settings.autostart, path: process.execPath, args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'] });
  db.settings.mobile ? startSrv() : stopSrv(); applyZoom(); save(); return true;
});
ipcMain.handle('check', async () => { await check(true); return db; });
ipcMain.handle('seen', (_, id) => { db.news.forEach(n => { if (id === 'all' || n.id === id) n.seen = true; }); save(); return db.news; });
ipcMain.handle('fav', (_, id) => { db.news.forEach(n => { if (n.id === id) n.fav = !n.fav; }); save(); return db.news; });
ipcMain.handle('snooze', (_, s) => { snoozes.push({ id: s.id, date: s.date, at: Date.now() + s.min * 60000 }); return true; });
ipcMain.handle('open', (_, u) => { if (/^https?:\/\//.test(u)) shell.openExternal(u); });
ipcMain.handle('openbackups', () => shell.openPath(path.join(userDir(), 'backups')));

// Pesquisa de imagens (várias fontes)
const J = async (u, o) => (await get(u, o)).json();
const SRC = {
  async anilist(q) { const j = await J('https://graphql.anilist.co', { m: 'POST', h: { 'Content-Type': 'application/json' }, b: JSON.stringify({ query: 'query($q:String){Page(perPage:10){media(search:$q,sort:SEARCH_MATCH){title{romaji english} coverImage{extraLarge large}}}}', variables: { q } }) });
    return (((j.data || {}).Page || {}).media || []).map(m => ({ url: m.coverImage.extraLarge || m.coverImage.large, thumb: m.coverImage.large, title: m.title.english || m.title.romaji, src: 'AniList' })); },
  async steam(q) { const j = await J(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=portuguese&cc=br`);
    return (j.items || []).slice(0, 10).map(x => { const u = `https://cdn.cloudflare.steamstatic.com/steam/apps/${x.id}/header.jpg`; return { url: u, thumb: u, title: x.name, src: 'Steam' }; }); },
  async rawg(q) { if (!db.settings.rawgKey) return []; const j = await J(`https://api.rawg.io/api/games?search=${encodeURIComponent(q)}&page_size=10&key=${db.settings.rawgKey}`);
    return (j.results || []).filter(x => x.background_image).map(x => ({ url: x.background_image, thumb: x.background_image, title: x.name, src: 'RAWG' })); },
  async tmdb(q) { if (!db.settings.tmdbKey) return []; const j = await J(`https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(q)}&language=pt-BR&api_key=${db.settings.tmdbKey}`);
    return (j.results || []).filter(x => x.poster_path).slice(0, 10).map(x => ({ url: 'https://image.tmdb.org/t/p/w500' + x.poster_path, thumb: 'https://image.tmdb.org/t/p/w342' + x.poster_path, title: x.title || x.name, src: 'TMDB' })); },
  async openverse(q) { const j = await J(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=14&mature=false`);
    return (j.results || []).map(r => ({ url: r.thumbnail || r.url, thumb: r.thumbnail || r.url, title: r.title || '', src: 'Openverse' })); },
  async commons(q) { const j = await J(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json`);
    return Object.values((j.query || {}).pages || {}).filter(p => p.imageinfo && p.imageinfo[0].thumburl).map(p => ({ url: p.imageinfo[0].thumburl, thumb: p.imageinfo[0].thumburl, title: p.title.replace(/^File:/, ''), src: 'Commons' })); },
  async wikipedia(q) { const out = []; for (const l of ['pt', 'en']) { try { const j = await J(`https://${l}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=8&prop=pageimages&piprop=thumbnail&pithumbsize=500&format=json`);
    for (const p of Object.values((j.query || {}).pages || {})) if (p.thumbnail) out.push({ url: p.thumbnail.source, thumb: p.thumbnail.source, title: p.title, src: 'Wikipedia' }); } catch {} } return out; }
};
const MODES = { all: ['steam', 'anilist', 'tmdb', 'rawg', 'wikipedia', 'openverse', 'commons'], games: ['steam', 'rawg', 'wikipedia'], anime: ['anilist', 'wikipedia'], movies: ['tmdb', 'wikipedia', 'openverse'], web: ['openverse', 'commons', 'wikipedia'] };
ipcMain.handle('img', async (_, q, mode) => {
  const res = await Promise.allSettled((MODES[mode] || MODES.all).map(k => SRC[k](q))), lists = res.map(r => r.status === 'fulfilled' ? r.value : []), out = [], seen = new Set();
  for (let n = 0; n < 14; n++) for (const L of lists) { const x = L[n]; if (x && x.url && !seen.has(x.url)) { seen.add(x.url); out.push(x); } }
  return out.slice(0, 40);
});
ipcMain.handle('imgsave', async (_, url) => {
  if (!/^https?:\/\//.test(url)) return url;
  try {
    const r = await get(url, { t: 20000 }), ct = (r.headers.get('content-type') || '').split(';')[0], buf = Buffer.from(await r.arrayBuffer());
    if (!/^image\//.test(ct) || buf.length > 8e6) return url;
    fs.mkdirSync(imgDir(), { recursive: true });
    const f = path.join(imgDir(), crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + ({ 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[ct] || '.jpg'));
    fs.writeFileSync(f, buf); return pathToFileURL(f).href;
  } catch { return url; }
});
ipcMain.handle('imgfile', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }], properties: ['openFile'] });
  if (r.canceled) return '';
  try { fs.mkdirSync(imgDir(), { recursive: true }); const ext = path.extname(r.filePaths[0]).toLowerCase() || '.jpg', buf = fs.readFileSync(r.filePaths[0]);
    const f = path.join(imgDir(), crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + ext); fs.writeFileSync(f, buf); return pathToFileURL(f).href; } catch { return pathToFileURL(r.filePaths[0]).href; }
});

// Exportar / importar / calendário .ics
ipcMain.handle('export', async () => { const r = await dialog.showSaveDialog(win, { defaultPath: 'agenda-backup.json' }); if (r.canceled) return false; fs.writeFileSync(r.filePath, JSON.stringify(db, null, 1)); return true; });
ipcMain.handle('import', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Backup', extensions: ['json'] }], properties: ['openFile'] }); if (r.canceled) return db;
  try { db = merge(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'))); ensurePin(); save(); } catch {} return db;
});
ipcMain.handle('ics', async () => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'agenda.ics', filters: [{ name: 'Calendário', extensions: ['ics'] }] }); if (r.canceled) return false;
  const esc = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n'), d8 = s => s.replace(/-/g, ''), stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda//PT', 'CALSCALE:GREGORIAN'];
  for (const i of db.items) {
    if (!i.date) continue; const n = Math.max(1, +i.days || 1);
    L.push('BEGIN:VEVENT', `UID:${i.id}@agenda`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(i.title)}`);
    if (i.time && n === 1) { const e = new Date(i.date + 'T' + i.time); e.setHours(e.getHours() + 1); L.push(`DTSTART:${d8(i.date)}T${i.time.replace(':', '')}00`, `DTEND:${d8(Core.ymd(e))}T${String(e.getHours()).padStart(2, '0')}${String(e.getMinutes()).padStart(2, '0')}00`); }
    else L.push(`DTSTART;VALUE=DATE:${d8(i.date)}`, `DTEND;VALUE=DATE:${d8(Core.ymd(Core.addD(Core.parse(i.date), n)))}`);
    const rr = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY' }[i.rep]; if (rr) L.push('RRULE:' + rr);
    const desc = [i.theme && 'Tema: ' + i.theme, i.notes, ...(i.check || []).map(c => (c.done ? '[x] ' : '[ ] ') + c.t)].filter(Boolean).join('\n'); if (desc) L.push('DESCRIPTION:' + esc(desc));
    if (i.time && i.alarm !== '' && i.alarm != null) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(i.title), `TRIGGER:-PT${+i.alarm}M`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR'); fs.writeFileSync(r.filePath, L.join('\r\n')); return true;
});
ipcMain.handle('ollama', async () => { try { const j = await (await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(4000) })).json(); return { ok: true, models: (j.models || []).map(m => m.name) }; } catch { return { ok: false }; } });
ipcMain.handle('net', async () => {
  const port = srv && srv.listening ? srv.address().port : 0, addrs = [];
  if (port) for (const [name, L] of Object.entries(os.networkInterfaces())) for (const a of L || []) {
    if ((a.family !== 'IPv4' && a.family !== 4) || a.internal) continue;
    const ts = /tailscale/i.test(name) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address);
    if (!ts && !/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a.address)) continue;
    const url = `http://${a.address}:${port}`; let qr = ''; try { qr = await require('qrcode').toDataURL(url, { margin: 1, width: 150 }); } catch {}
    addrs.push({ label: ts ? 'Tailscale (fora de casa)' : 'Wi-Fi de casa', url, qr });
  }
  return { on: !!port, port, pin: db.settings.pin, addrs };
});
ipcMain.handle('newpin', () => { db.settings.pin = ''; ensurePin(); save(); return db.settings.pin; });
