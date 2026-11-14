// Lógica compartilhada (desktop, servidor e celular)
(function (g) {
  const p2 = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-'); return new Date(+y, m - 1, +d); };
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const hsl2hex = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
  const themeHex = t => { if (!t) return '#8890a0'; let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 360; return hsl2hex(h, 50, 52); };
  const colorOf = (i, tc) => i.color || (tc || {})[i.theme] || themeHex(i.theme);
  const multi = i => !!i.rep || (+i.days || 1) > 1;
  const starts = (i, ds) => {
    if (!i.date) return false; if (i.date === ds) return true; if (!i.rep || i.date > ds) return false;
    const a = parse(i.date), b = parse(ds);
    if (i.rep === 'daily') return true;
    if (i.rep === 'weekdays') return b.getDay() > 0 && b.getDay() < 6;
    if (i.rep === 'weekly') return a.getDay() === b.getDay();
    if (i.rep === 'monthly') return a.getDate() === b.getDate();
    return false;
  };
  // ocorrência que cobre o dia ds: { k: índice do dia (0..n-1), n: duração, start }
  const occ = (i, ds) => { const n = Math.max(1, +i.days || 1); for (let k = 0; k < n; k++) { const s = ymd(addD(parse(ds), -k)); if (starts(i, s)) return { k, n, start: s }; } return null; };
  const covers = (i, ds) => !!occ(i, ds);
  const isDone = (i, ds) => multi(i) ? ((i.doneOn || []).includes(ds) || (!!i.doneAll && !(i.undoneOn || []).includes(ds))) : i.status === 'done';
  const toggleDay = (i, ds, first) => {
    if (!multi(i)) { i.status = i.status === 'done' ? first : 'done'; return; }
    i.doneOn = i.doneOn || []; i.undoneOn = i.undoneOn || [];
    if (isDone(i, ds)) { i.doneOn = i.doneOn.filter(d => d !== ds); if (i.doneAll) i.undoneOn.push(ds); }
    else { i.doneOn.push(ds); i.undoneOn = i.undoneOn.filter(d => d !== ds); }
  };
  const setAll = (i, on, first) => { if (!multi(i)) { i.status = on ? 'done' : first; return; } i.doneAll = !!on; i.doneOn = []; i.undoneOn = []; };
  const chk = i => { const c = i.check || []; return [c.filter(x => x.done).length, c.length]; };
  const match = (i, q) => { if (!q) return true; q = q.toLowerCase(); return [i.title, i.theme, i.notes, i.prog, ...(i.check || []).map(c => c.t)].some(s => s && String(s).toLowerCase().includes(q)); };
  const itemsOn = (items, ds, q) => items.filter(i => covers(i, ds) && match(i, q)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const clone = (it, first) => { const n = JSON.parse(JSON.stringify(it)); n.id = uid(); n.doneOn = []; n.undoneOn = []; n.doneAll = false;
    if (n.status === 'done') n.status = first; n.check = (n.check || []).map(c => ({ ...c, id: uid() })); return n; };
  const themes = (items, tc) => [...new Set([...items.map(i => i.theme).filter(Boolean), ...Object.keys(tc || {})])].sort((a, b) => a.localeCompare(b, 'pt'));
  const nts = n => Date.parse(n.date) || n.found || 0;
  const api = { p2, ymd, parse, addD, uid, themeHex, colorOf, multi, starts, occ, covers, isDone, toggleDay, setAll, chk, match, itemsOn, clone, themes, nts };
  g.Core = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
