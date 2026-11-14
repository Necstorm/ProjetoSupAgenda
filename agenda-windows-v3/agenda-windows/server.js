// Servidor local para o celular (HTTP + API protegida por PIN)
const http = require('http'), fs = require('fs'), path = require('path');
const Core = require('./mobile/core.js');
const ROOT = path.join(__dirname, 'mobile') + path.sep;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.json': 'application/json' };
const s = (v, n) => String(v == null ? '' : v).slice(0, n);

module.exports = function start(ctx, port = 8787) {
  const fails = {};
  const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const body = req => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 200000) { req.destroy(); no(); } }); req.on('end', () => ok(b)); req.on('error', no); });
  const imgUrl = u => { if (!u || !u.startsWith('file:')) return u || ''; try { return '/img/' + path.basename(decodeURIComponent(new URL(u).pathname)); } catch { return ''; } };

  function clean(b, old, cols) {
    const it = { ...(old || { img: '', ord: Date.now(), doneOn: [], undoneOn: [], doneAll: false }),
      id: old ? old.id : Core.uid(), title: s(b.title, 200).trim(), theme: s(b.theme, 60).trim(),
      date: /^\d{4}-\d\d-\d\d$/.test(b.date) ? b.date : '', time: /^\d\d:\d\d$/.test(b.time) ? b.time : '',
      status: cols.some(c => c.id === b.status) ? b.status : cols[0].id,
      rep: ['daily', 'weekdays', 'weekly', 'monthly'].includes(b.rep) ? b.rep : '', prog: s(b.prog, 40), notes: s(b.notes, 2000),
      days: Math.min(365, Math.max(1, parseInt(b.days) || 1)), color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '',
      alarm: b.alarm === '' || b.alarm == null || isNaN(+b.alarm) ? '' : String(Math.min(10080, Math.max(0, +b.alarm))),
      check: (Array.isArray(b.check) ? b.check : []).slice(0, 200).map(c => ({ id: s(c.id, 20) || Core.uid(), t: s(c.t, 200), done: !!c.done })).filter(c => c.t.trim()) };
    return it;
  }

  async function api(req, res, p) {
    const db = ctx.get(), ip = req.socket.remoteAddress, f = fails[ip] || { n: 0, t: 0 };
    if (Date.now() - f.t > 600000) f.n = 0;
    if (f.n >= 8) return json(res, 429, { error: 'bloqueado' });
    if (req.headers['x-pin'] !== db.settings.pin) { f.n++; f.t = Date.now(); fails[ip] = f; return json(res, 401, { error: 'pin' }); }
    fails[ip] = { n: 0, t: 0 };
    let b = {};
    if (req.method === 'POST') { try { b = JSON.parse(await body(req)); } catch { return json(res, 400, { error: 'corpo' }); } }
    const cols = db.settings.cols, first = cols[0].id;
    if (p === '/api/data') {
      return json(res, 200, { items: db.items.map(i => ({ ...i, img: imgUrl(i.img) })), cols, themeColors: db.settings.themeColors || {},
        digests: db.digests.slice(0, 8), news: [...db.news].sort((a, c) => Core.nts(c) - Core.nts(a)).slice(0, 120) });
    }
    if (p === '/api/item') {
      const old = b.id ? db.items.find(i => i.id === b.id) : null;
      const it = clean(b, old, cols); if (!it.title) return json(res, 400, { error: 'titulo' });
      if (old) db.items[db.items.indexOf(old)] = it; else db.items.push(it);
    } else if (p === '/api/dup') {
      const i = db.items.find(x => x.id === b.id); if (!i) return json(res, 404, {});
      const n = Core.clone(i, first); n.ord = Date.now(); db.items.push(n);
    } else if (p === '/api/tick') {
      const i = db.items.find(x => x.id === b.id); if (!i) return json(res, 404, {});
      if (b.mode === 'all') Core.setAll(i, true, first); else if (b.mode === 'none') Core.setAll(i, false, first); else Core.toggleDay(i, s(b.date, 10), first);
    } else if (p === '/api/check') {
      const i = db.items.find(x => x.id === b.id), c = i && (i.check || []).find(x => x.id === b.cid); if (!c) return json(res, 404, {}); c.done = !c.done;
    } else if (p === '/api/reorder') {
      const i = db.items.find(x => x.id === b.id); if (!i) return json(res, 404, {});
      const L = db.items.filter(x => (x.status || first) === (i.status || first)).sort((a, c) => (a.ord || 0) - (c.ord || 0)), k = L.indexOf(i), j = k + (b.dir < 0 ? -1 : 1);
      if (j >= 0 && j < L.length) { L.splice(j, 0, L.splice(k, 1)[0]); L.forEach((x, n) => { x.ord = n * 10; }); }
    } else if (p === '/api/del') {
      db.items = db.items.filter(x => x.id !== b.id);
    } else if (p === '/api/seen') {
      db.news.forEach(n => { if (String(n.id) === String(b.id)) n.seen = true; });
    } else if (p === '/api/fav') {
      db.news.forEach(n => { if (String(n.id) === String(b.id)) n.fav = !n.fav; });
    } else return json(res, 404, {});
    ctx.save(); ctx.push(); json(res, 200, { ok: true });
  }

  const srv = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'x-pin, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) return api(req, res, u.pathname).catch(() => json(res, 500, {}));
    let f;
    if (u.pathname.startsWith('/img/') && ctx.imgDir) { const dir = ctx.imgDir + path.sep; f = path.normalize(path.join(dir, path.basename(u.pathname))); if (!f.startsWith(dir)) f = ''; }
    else { f = path.normalize(path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname)); if (!f.startsWith(ROOT)) f = ''; }
    if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  let p = port;
  srv.on('error', e => { if (e.code === 'EADDRINUSE' && p < port + 5) { p++; srv.listen(p, '0.0.0.0'); } });
  srv.listen(p, '0.0.0.0');
  return srv;
};
