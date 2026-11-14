const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const { ymd, parse, addD, uid, occ, isDone, chk, match, colorOf, nts } = Core;
const NATIVE = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
const TABS = { hoje: 'Hoje', semana: 'Semana', agenda: 'Agenda', kanban: 'Kanban', mais: 'Mais' };
const PAL = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#6c5ce7', '#e84393', '#8e6e53', '#636e72'];
const KINDS = [['noticia', 'Notícias'], ['reddit', 'Reddit'], ['youtube', 'Vídeos (YouTube)'], ['rss', 'Outros feeds']];
const REPS = [['', 'Não repete'], ['daily', 'Todo dia'], ['weekdays', 'Dias úteis'], ['weekly', 'Toda semana'], ['monthly', 'Todo mês']];
const ALARMS = [['', 'Sem alarme'], ['0', 'Na hora'], ['5', '5 min antes'], ['10', '10 min antes'], ['15', '15 min antes'], ['30', '30 min antes'], ['60', '1 hora antes'], ['1440', '1 dia antes']];
const fmt = (d, o) => d.toLocaleDateString('pt-BR', o);
let base = NATIVE ? (localStorage.getItem('base') || '') : '', pin = localStorage.getItem('pin') || '';
let D = null, tab = 'hoje', sub = '', off = false, conn = false, err = '', sheet = null, wk = new Date(), wd = (new Date().getDay() + 6) % 7, mo = new Date(), sel = ymd(new Date()), reorder = false, nv = 'todas', gq = '', sigN = '', open = {};

async function call(path, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'x-pin': pin, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
  if (r.status === 401) throw new Error('pin'); if (!r.ok) throw new Error('http'); return r.json();
}
async function load() {
  try { D = await call('/api/data'); off = false; localStorage.setItem('cache', JSON.stringify(D)); notifySchedule(); }
  catch (e) { if (e.message === 'pin') { pin = ''; localStorage.removeItem('pin'); err = 'PIN incorreto.'; } else { off = true; try { D = JSON.parse(localStorage.getItem('cache')); } catch {} } }
  render();
}
const toast = m => { const t = $('#ts'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2600); };
const guard = () => { if (off) { toast('Sem conexão com o PC.'); return true; } };
const col = i => colorOf(i, D.themeColors), itemsOn = ds => Core.itemsOn(D.items, ds, '');
const first = () => D.cols[0].id, byOrd = (a, b) => (a.ord || 0) - (b.ord || 0);
const sameDay = (ms, d) => ms && new Date(ms).toDateString() === d.toDateString();
const imgSrc = u => !u ? '' : u.startsWith('/img/') ? base + u : u;

const row = (i, ds) => { const dn = isDone(i, ds), [a, b] = chk(i), o = ds ? occ(i, ds) : null;
  return `<div class="it${dn ? ' dn' : ''}" style="--c:${col(i)}" data-a="edit" data-id="${i.id}" data-ds="${ds}"><button class="ck" data-a="tick" data-id="${i.id}" data-d="${ds}">${dn ? '✓' : ''}</button>${i.img ? `<img class="th" src="${esc(imgSrc(i.img))}" loading="lazy">` : ''}<div class="tx"><span>${i.time ? `<b>${esc(i.time)}</b> ` : ''}${esc(i.title)}${o && o.n > 1 ? ` <small>(${o.k + 1}/${o.n})</small>` : ''}</span><small>${esc(i.theme || '')}${i.prog ? ' · ' + esc(i.prog) : ''}${b ? ` · ☑ ${a}/${b}` : ''}${i.alarm !== '' && i.alarm != null ? ' · ⏰' : ''}</small></div></div>`; };
const nrow = n => `<div class="nw${n.seen ? '' : ' un'}"><button class="star${n.fav ? ' on' : ''}" data-a="fav" data-id="${n.id}">${n.fav ? '★' : '☆'}</button><a href="${esc(n.link)}" target="_blank" rel="noopener" data-a="seen" data-id="${n.id}"><b>${esc(n.title)}</b><br><small>${esc(n.topic)}${n.source ? ' · ' + esc(n.source) : ''}</small></a></div>`;
const dg = d => `<div class="dg"><small class="mut">${esc(d.topic)} · resumo</small><br>${esc(d.text)}</div>`;

function vHoje() {
  const now = new Date(), t = ymd(now), L = itemsOn(t), nw = D.news.filter(n => sameDay(n.found, now)).slice(0, 8);
  return `<p class="mut cap">${esc(fmt(now, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${L.filter(i => isDone(i, t)).length} de ${L.length} feitos</p>
  ${L.map(i => row(i, t)).join('') || '<p class="mut">Nada marcado para hoje.</p>'}<h2>Novidades de hoje</h2>${D.digests.filter(d => sameDay(Date.parse(d.date), now)).slice(0, 2).map(dg).join('')}${nw.map(nrow).join('') || '<p class="mut">Nenhuma novidade hoje.</p>'}`;
}
function weekDays() { const st = addD(wk, -((wk.getDay() + 6) % 7)); return [0, 1, 2, 3, 4, 5, 6].map(n => addD(st, n)); }
function vSemana() {
  const days = weekDays(), today = ymd(new Date()); let tot = 0, dn = 0;
  const panels = days.map(d => { const ds = ymd(d), L = itemsOn(ds), k = L.filter(i => isDone(i, ds)).length; tot += L.length; dn += k;
    return `<section class="wp"><h3 class="cap">${esc(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }))}${ds === today ? ' · hoje' : ''} <span class="mut">${L.length ? k + '/' + L.length : ''}</span></h3>${L.map(i => row(i, ds)).join('') || '<p class="mut">Livre</p>'}</section>`; }).join('');
  const late = D.items.filter(i => !Core.multi(i) && i.date && i.date < today && i.status !== 'done');
  return `<div class="bar"><button data-a="wnav" data-n="-1">‹</button><b>${esc(fmt(days[0], { day: 'numeric', month: 'short' }))} – ${esc(fmt(days[6], { day: 'numeric', month: 'short' }))} · ${dn}/${tot}</b><button data-a="wnav" data-n="1">›</button></div>
  <div class="dtabs">${days.map((d, n) => `<button class="${n === wd ? 'on' : ''}${ymd(d) === today ? ' td' : ''}" data-a="wday" data-n="${n}">${esc(fmt(d, { weekday: 'narrow' }))}<b>${d.getDate()}</b></button>`).join('')}</div>
  ${late.length ? `<details class="late"><summary>${late.length} atrasado${late.length > 1 ? 's' : ''}</summary>${late.map(i => row(i, i.date)).join('')}</details>` : ''}<div class="wk" id="wk">${panels}</div>`;
}
function vAgenda() {
  const f = new Date(mo.getFullYear(), mo.getMonth(), 1), st = addD(f, -((f.getDay() + 6) % 7)), today = ymd(new Date());
  return `<div class="bar"><button data-a="mnav" data-n="-1">‹</button><b class="cap">${esc(fmt(mo, { month: 'long', year: 'numeric' }))}</b><button data-a="mnav" data-n="1">›</button></div>
  <div class="mg">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(w => `<span class="wd">${w}</span>`).join('')}${Array.from({ length: 42 }, (_, n) => { const d = addD(st, n), ds = ymd(d), L = itemsOn(ds);
    return `<button class="dc${d.getMonth() !== mo.getMonth() ? ' off' : ''}${ds === today ? ' today' : ''}${ds === sel ? ' sel' : ''}" data-a="sel" data-d="${ds}">${d.getDate()}${L.length ? '<i></i>' : ''}</button>`; }).join('')}</div>
  <h2 class="cap">${esc(fmt(parse(sel), { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>${itemsOn(sel).map(i => row(i, sel)).join('') || '<p class="mut">Dia livre.</p>'}`;
}
function vKanban() {
  return `<div class="bar"><span class="mut">${reorder ? 'Use ▲ ▼ para reordenar' : 'Toque no item para mover de coluna'}</span><button class="${reorder ? 'pri' : ''}" data-a="reorder">${reorder ? 'Pronto' : 'Reordenar'}</button></div>
  <div class="ks">${D.cols.map(c => { const L = D.items.filter(i => (i.status || first()) === c.id).sort(byOrd);
    return `<section class="kc"><h3>${esc(c.name)} <span class="mut">${L.length}</span></h3>${L.map(i => `<div class="krow">${row(i, i.date || '')}${reorder ? `<span class="mv"><button data-a="mv" data-id="${i.id}" data-dir="-1">▲</button><button data-a="mv" data-id="${i.id}" data-dir="1">▼</button></span>` : ''}</div>`).join('') || '<small class="mut">Vazio</small>'}</section>`; }).join('')}</div>`;
}
function vMais() {
  if (sub === 'noticias') {
    const L = D.news.filter(n => nv === 'todas' || (nv === 'novas' ? !n.seen : n.fav));
    return `<div class="bar"><button data-a="sub" data-s="">‹ Voltar</button><div class="seg">${[['todas', 'Todas'], ['novas', 'Novas'], ['fav', '★']].map(([k, l]) => `<button class="${nv === k ? 'on' : ''}" data-a="nv" data-v="${k}">${l}</button>`).join('')}</div></div>
    ${D.digests.slice(0, 2).map(dg).join('')}${KINDS.map(([k, l]) => [l, L.filter(n => (n.kind || 'noticia') === k).slice(0, 40)]).filter(g => g[1].length).map(([l, a]) => `<h2>${l}</h2>${a.map(nrow).join('')}`).join('') || '<p class="mut">Sem notícias.</p>'}`;
  }
  if (sub === 'temas') {
    const list = Core.themes(D.items, D.themeColors), none = D.items.filter(i => !i.theme);
    const card = (t, L) => `<details ${open[t] ? 'open' : ''} data-th="${esc(t)}" class="thc" style="--c:${D.themeColors[t] || Core.themeHex(t)}"><summary><b>${esc(t || 'Sem tema')}</b> <span class="mut">${L.length}</span><br>${D.cols.map(c => `<span class="pill">${esc(c.name)} ${L.filter(i => (i.status || first()) === c.id).length}</span>`).join('')}</summary>${L.slice(0, 50).map(i => row(i, i.date || '')).join('')}</details>`;
    return `<div class="bar"><button data-a="sub" data-s="">‹ Voltar</button></div>${list.map(t => card(t, D.items.filter(i => i.theme === t))).join('')}${none.length ? card('', none) : ''}`;
  }
  if (sub === 'busca') return `<div class="bar"><button data-a="sub" data-s="">‹ Voltar</button></div><input id="gq" placeholder="Buscar atividades…" value="${esc(gq)}" autocomplete="off"><div id="res">${resHtml()}</div>`;
  return `<div class="menu"><button data-a="sub" data-s="noticias">Notícias${D.news.some(n => !n.seen) ? ` <i>${D.news.filter(n => !n.seen).length}</i>` : ''}</button><button data-a="sub" data-s="temas">Temas</button><button data-a="sub" data-s="busca">Buscar atividades</button><button data-a="gear">Conexão com o PC</button></div>
  <p class="mut">${NATIVE ? esc(base) : esc(location.origin)}${off ? ' · sem conexão' : ''}</p>`;
}
const resHtml = () => gq ? (D.items.filter(i => match(i, gq)).slice(0, 30).map(i => row(i, i.date || '')).join('') || '<p class="mut">Nada encontrado.</p>') : '';
function vConn() {
  return `<div class="cn"><p>${NATIVE ? 'Digite o endereço do seu PC e o PIN que aparecem em <b>Ajustes › Acesso pelo celular</b> no app do Windows.' : 'Digite o PIN que aparece em Ajustes, no app do Windows.'}</p>
  ${NATIVE ? `<label>Endereço do PC</label><input id="ad" inputmode="url" autocapitalize="off" placeholder="192.168.0.10:8787" value="${esc(base.replace(/^http:\/\//, ''))}">` : ''}
  <label>PIN</label><input id="pn" inputmode="numeric" maxlength="6" placeholder="6 dígitos" value="${esc(pin)}">${err ? `<p class="err">${esc(err)}</p>` : ''}
  <button class="pri" data-a="connect">Conectar</button>${base && pin ? '<button data-a="back">Voltar</button>' : ''}</div>`;
}
function vSheet() {
  const i = sheet, f = (k, l, t = 'text', x = '') => `<div><label>${l}</label><input type="${t}" data-f="${k}" value="${esc(i[k])}" ${x}></div>`, so = (arr, v) => arr.map(([k, l]) => `<option value="${k}"${String(v == null ? '' : v) === k ? ' selected' : ''}>${l}</option>`).join('');
  const mu = i.id && Core.multi(i) && sheet.ds;
  return `<div class="ov" data-a="shx"><div class="sh"><h3>${i.id ? 'Editar item' : 'Novo item'}</h3>${f('title', 'Título')}
  <div class="g2">${f('date', 'Data', 'date')}${f('time', 'Hora', 'time')}${f('days', 'Duração (dias)', 'number', 'min="1" max="365" inputmode="numeric"')}${f('theme', 'Tema')}
  <div><label>Repetir</label><select data-f="rep">${so(REPS, i.rep || '')}</select></div><div><label>Alarme</label><select data-f="alarm">${so(ALARMS, i.alarm)}</select></div></div>
  <label>Coluna do kanban</label><select data-f="status">${D.cols.map(c => `<option value="${c.id}"${(i.status || first()) === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
  <label>Cor</label><div class="sw">${PAL.map(c => `<button data-a="scolor" data-c="${c}" style="background:${c}"></button>`).join('')}<input type="color" data-cc="1" value="${col(i)}"><button class="sm" data-a="scolor" data-c="">Cor do tema</button></div>
  ${mu ? `<label>Conclusão</label><div class="cb"><button class="sm" data-a="sday">${isDone(i, sheet.ds) ? '✓ Feito neste dia · reabrir' : 'Concluir só neste dia'}</button><button class="sm" data-a="sall">Todos os dias</button><button class="sm" data-a="snone">Reabrir todos</button></div>` : ''}
  ${f('notes', 'Notas')}<label>Checklist</label>${(i.check || []).map(c => `<div class="cr"><input type="checkbox" data-a="cdone" data-cid="${c.id}"${c.done ? ' checked' : ''}><input class="ct" data-ct="${c.id}" value="${esc(c.t)}"><button class="sm" data-a="cmv" data-cid="${c.id}" data-d="-1">▲</button><button class="sm" data-a="cmv" data-cid="${c.id}" data-d="1">▼</button><button class="sm" data-a="cdel" data-cid="${c.id}">×</button></div>`).join('')}
  <div class="cr"><input id="cnew" placeholder="Novo item do checklist"><button data-a="cadd">+</button></div>
  <div class="act"><button class="pri" data-a="savei">Salvar</button><button data-a="shc">Cancelar</button>${i.id ? '<button data-a="dupi">Duplicar</button><button data-a="deli">Excluir</button>' : ''}</div></div></div>`;
}
function render() {
  if ((NATIVE && !base) || !pin || conn) { $('#hd').innerHTML = '<h1>Agenda</h1>'; $('#mn').innerHTML = vConn(); $('#tb').hidden = true; $('#sh').hidden = true; return; }
  const ae = document.activeElement, keep = ae && ae.id === 'gq' ? ae.selectionStart : null, sc = $('#sh .sh'), st = sc ? sc.scrollTop : 0;
  $('#hd').innerHTML = `<h1>${tab === 'mais' && sub ? { noticias: 'Notícias', temas: 'Temas', busca: 'Buscar' }[sub] : TABS[tab]}</h1><span class="mut">${off ? 'offline' : ''}</span>`;
  $('#tb').hidden = false; $('#tb').innerHTML = Object.entries(TABS).map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-t="${k}">${l}</button>`).join('');
  $('#mn').innerHTML = (off ? '<div class="off">Sem conexão com o PC. Mostrando os últimos dados salvos.</div>' : '') +
    (D ? { hoje: vHoje, semana: vSemana, agenda: vAgenda, kanban: vKanban, mais: vMais }[tab]() + (tab !== 'mais' ? `<button class="fab" data-a="new" data-d="${tab === 'agenda' ? sel : ymd(new Date())}">+</button>` : '') : '<p class="mut">Carregando…</p>');
  $('#sh').hidden = !sheet; $('#sh').innerHTML = sheet ? vSheet() : ''; const n = $('#sh .sh'); if (n) n.scrollTop = st;
  const w = $('#wk'); if (w) { w.scrollLeft = wd * w.clientWidth; w.onscroll = () => { const k = Math.round(w.scrollLeft / w.clientWidth); if (k !== wd) { wd = k; document.querySelectorAll('.dtabs button').forEach((b, j) => b.classList.toggle('on', j === k)); } }; }
  if (keep != null) { const e = $('#gq'); if (e) { e.focus(); try { e.setSelectionRange(keep, keep); } catch {} } }
}

// ---------- Notificações locais no celular (somente app Android) ----------
async function notifySchedule() {
  const LN = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications; if (!LN || !D) return;
  try {
    const out = [], now = Date.now(); let n = 1;
    for (let k = 0; k < 8; k++) { const ds = ymd(addD(new Date(), k)); for (const i of D.items) {
      if (!i.time || !Core.starts(i, ds) || isDone(i, ds)) continue; const at = new Date(ds + 'T' + i.time).getTime() - (i.alarm === '' || i.alarm == null ? 0 : +i.alarm * 60000); if (at <= now) continue;
      out.push({ id: n++, title: i.title, body: (i.theme ? i.theme + ' · ' : '') + i.time, schedule: { at: new Date(at), allowWhileIdle: true }, extra: { id: i.id, date: ds } }); } }
    const sig = JSON.stringify(out.map(o => [o.title, +o.schedule.at])); if (sig === sigN) return; sigN = sig;
    const p = await LN.requestPermissions(); if (p.display !== 'granted') return;
    const pend = await LN.getPending(); if (pend.notifications.length) await LN.cancel({ notifications: pend.notifications });
    if (out.length) await LN.schedule({ notifications: out.slice(0, 60) });
  } catch {}
}
(function () { const LN = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications; if (LN) try { LN.addListener('localNotificationActionPerformed', ev => { const x = (ev.notification || {}).extra || {}; const i = D && D.items.find(y => y.id === x.id); if (i) { tab = 'hoje'; sheet = { ...JSON.parse(JSON.stringify(i)), ds: x.date }; render(); } }); } catch {} })();

// ---------- Ações ----------
const blank = d => ({ id: null, title: '', theme: '', date: d || '', time: '', days: 1, status: D.cols[0].id, rep: '', alarm: '', notes: '', color: '', check: [], ds: d });
const act = {
  tab: d => { tab = d.t; sub = ''; render(); }, sub: d => { sub = d.s; gq = ''; render(); }, nv: d => { nv = d.v; render(); }, reorder: () => { reorder = !reorder; render(); },
  gear: () => { conn = true; err = ''; render(); }, back: () => { conn = false; render(); },
  connect: async () => {
    if (NATIVE) { let a = $('#ad').value.trim().replace(/\/+$/, ''); if (!a) { err = 'Digite o endereço do PC.'; return render(); } if (!/^https?:\/\//.test(a)) a = 'http://' + a; base = a; }
    pin = $('#pn').value.trim(); err = ''; conn = true; $('#mn').innerHTML = '<p class="mut">Conectando…</p>';
    try { D = await call('/api/data'); off = false; conn = false; if (NATIVE) localStorage.setItem('base', base); localStorage.setItem('pin', pin); localStorage.setItem('cache', JSON.stringify(D)); notifySchedule(); }
    catch (e) { err = e.message === 'pin' ? 'PIN incorreto.' : 'Não consegui falar com o PC. Veja se o app do Windows está aberto, se o endereço está certo e se o celular está na mesma rede (ou com o Tailscale ligado).'; }
    render();
  },
  wnav: d => { wk = addD(wk, 7 * +d.n); render(); }, wday: d => { wd = +d.n; const w = $('#wk'); if (w) w.scrollTo({ left: wd * w.clientWidth, behavior: 'smooth' }); document.querySelectorAll('.dtabs button').forEach((b, j) => b.classList.toggle('on', j === wd)); },
  mnav: d => { mo = new Date(mo.getFullYear(), mo.getMonth() + +d.n, 1); render(); }, sel: d => { sel = d.d; render(); },
  tick: async (d, e) => { e.stopPropagation(); if (guard()) return; try { await call('/api/tick', { id: d.id, date: d.d }); await load(); } catch { toast('Não foi possível atualizar.'); } },
  mv: async d => { if (guard()) return; try { await call('/api/reorder', { id: d.id, dir: +d.dir }); await load(); } catch {} },
  fav: async d => { if (guard()) return; try { await call('/api/fav', { id: d.id }); await load(); } catch {} },
  seen: d => { if (!off) call('/api/seen', { id: d.id }).then(load).catch(() => {}); },
  new: d => { sheet = blank(d.d); render(); },
  edit: d => { const i = D.items.find(x => x.id === d.id); if (i) { sheet = { ...JSON.parse(JSON.stringify(i)), ds: d.ds }; render(); } },
  shx: (d, e, el) => { if (e.target === el) { sheet = null; render(); } }, shc: () => { sheet = null; render(); },
  scolor: d => { sheet.color = d.c; render(); },
  sday: async () => { if (guard()) return; await call('/api/tick', { id: sheet.id, date: sheet.ds }); const i = (await call('/api/data')).items.find(x => x.id === sheet.id); Object.assign(sheet, { doneOn: i.doneOn, undoneOn: i.undoneOn, doneAll: i.doneAll }); load(); },
  sall: async () => { if (guard()) return; await call('/api/tick', { id: sheet.id, mode: 'all' }); sheet = null; await load(); toast('Todos os dias concluídos.'); },
  snone: async () => { if (guard()) return; await call('/api/tick', { id: sheet.id, mode: 'none' }); sheet = null; await load(); toast('Reaberto.'); },
  cadd: () => { const t = $('#cnew').value.trim(); if (!t) return; (sheet.check = sheet.check || []).push({ id: uid(), t, done: false }); render(); },
  cdone: d => { const c = sheet.check.find(x => x.id === d.cid); c.done = !c.done; },
  cdel: d => { sheet.check = sheet.check.filter(x => x.id !== d.cid); render(); },
  cmv: d => { const L = sheet.check, k = L.findIndex(x => x.id === d.cid), j = k + +d.d; if (j >= 0 && j < L.length) { L.splice(j, 0, L.splice(k, 1)[0]); render(); } },
  savei: async () => { if (!sheet.title.trim()) return toast('Dê um título ao item.'); if (guard()) return; try { await call('/api/item', sheet); sheet = null; await load(); } catch { toast('Não foi possível salvar.'); } },
  dupi: async () => { if (guard()) return; await call('/api/dup', { id: sheet.id }); sheet = null; await load(); toast('Item duplicado.'); },
  deli: async () => { if (guard()) return; if (!confirm('Excluir este item?')) return; try { await call('/api/del', { id: sheet.id }); sheet = null; await load(); } catch { toast('Não foi possível excluir.'); } }
};
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el && act[el.dataset.a]) act[el.dataset.a](el.dataset, e, el); });
document.addEventListener('input', e => { const t = e.target, d = t.dataset;
  if (d.f && sheet) sheet[d.f] = t.value; else if (d.ct && sheet) { const c = sheet.check.find(x => x.id === d.ct); if (c) c.t = t.value; }
  else if (t.id === 'gq') { gq = t.value; $('#res').innerHTML = resHtml(); } });
document.addEventListener('change', e => { if (e.target.dataset.cc && sheet) { sheet.color = e.target.value; render(); } });
document.addEventListener('toggle', e => { const t = e.target.dataset && e.target.dataset.th; if (t != null) open[t] = e.target.open; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'cnew') act.cadd(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && pin && !sheet && !conn) load(); });
setInterval(() => { if (pin && !sheet && !conn && !document.hidden && !(tab === 'mais' && sub === 'busca')) load(); }, 60000);
if ((NATIVE ? base : true) && pin) { try { D = JSON.parse(localStorage.getItem('cache')); } catch {} render(); load(); } else render();
