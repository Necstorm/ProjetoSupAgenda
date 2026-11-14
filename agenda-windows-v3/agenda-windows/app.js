const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const { ymd, parse, addD, uid, occ, isDone, chk, match, colorOf, themeHex, nts } = Core;
const TABS = [['hoje', 'Hoje'], ['semana', 'Semana'], ['agenda', 'Agenda'], ['kanban', 'Kanban'], ['temas', 'Temas'], ['noticias', 'Notícias'], ['ajustes', 'Ajustes']];
const PAL = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#6c5ce7', '#e84393', '#8e6e53', '#636e72'];
const KINDS = [['noticia', 'Notícias'], ['reddit', 'Reddit'], ['youtube', 'Vídeos (YouTube)'], ['rss', 'Outros feeds']];
const REPS = [['', 'Não repete'], ['daily', 'Todo dia'], ['weekdays', 'Dias úteis'], ['weekly', 'Toda semana'], ['monthly', 'Todo mês']];
const ALARMS = [['', 'Sem alarme'], ['0', 'Na hora'], ['5', '5 min antes'], ['10', '10 min antes'], ['15', '15 min antes'], ['30', '30 min antes'], ['60', '1 hora antes'], ['1440', '1 dia antes']];
let S, tab = 'hoje', view = 'mes', cur = new Date(), wk = new Date(), net = null, kf = '', kq = {}, gq = '', nf = '', nv = 'todas', modal = null, busy = false,
  omsg = '', models = [], sel = new Set(), clip = null, hov = null, hovDay = null, ctxIds = [], tx = {}, cclip = [], alarmQ = [], mdTarget = null, dnd = null, sndT = null, actx = null;

const fmt = (d, o) => d.toLocaleDateString('pt-BR', o);
const first = () => S.settings.cols[0].id;
const persist = () => api.save({ items: S.items, topics: S.topics, settings: S.settings });
const col = i => colorOf(i, S.settings.themeColors);
const itemsOn = ds => Core.itemsOn(S.items, ds, gq);
const unread = () => S.news.filter(n => !n.seen).length;
const sameDay = (ms, d) => ms && new Date(ms).toDateString() === d.toDateString();
const colName = id => (S.settings.cols.find(c => c.id === id) || {}).name || '';
const toast = m => { const t = $('#ts'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2600); };
const themeList = () => Core.themes(S.items, S.settings.themeColors);
const cutCls = i => clip && clip.mode === 'cut' && clip.ids.has(i.id) ? ' cut' : '';
const byOrd = (a, b) => (a.ord || 0) - (b.ord || 0);

const chip = (i, ds) => { const dn = isDone(i, ds), [a, b] = chk(i), o = ds ? occ(i, ds) : null;
  return `<div class="it${dn ? ' done' : ''}${sel.has(i.id) ? ' sel' : ''}${cutCls(i)}" style="--c:${col(i)}" draggable="true" data-idrag data-a="edit" data-id="${i.id}" data-ds="${ds}"><button class="ck" data-a="tick" data-id="${i.id}" data-ds="${ds}" title="Concluir só este dia">${dn ? '✓' : ''}</button><span class="tt">${i.time ? `<b>${esc(i.time)}</b> ` : ''}${esc(i.title)}${o && o.n > 1 ? ` <small>(${o.k + 1}/${o.n})</small>` : ''}</span>${b ? `<small>☑${a}/${b}</small>` : ''}${i.alarm !== '' && i.alarm != null ? '<small>⏰</small>' : ''}</div>`; };
const newsRow = n => `<div class="nw${n.seen ? '' : ' un'}"><button class="star${n.fav ? ' on' : ''}" data-a="fav" data-id="${n.id}" title="Ler depois">${n.fav ? '★' : '☆'}</button><div class="tx" data-a="read" data-id="${n.id}"><b>${esc(n.title)}</b><br><small>${esc(n.topic)}${n.source ? ' · ' + esc(n.source) : ''}${n.date && !isNaN(Date.parse(n.date)) ? ' · ' + esc(fmt(new Date(n.date), { day: 'numeric', month: 'short' })) : ''}</small>${n.snippet && n.kind && n.kind !== 'noticia' ? `<div class="sn">${esc(n.snippet.slice(0, 140))}</div>` : ''}</div></div>`;
const digest = d => `<div class="dg"><small>${esc(d.topic)} · resumo local</small><br>${esc(d.text)}</div>`;

// ---------- Hoje ----------
function vHoje() {
  const now = new Date(), t = ymd(now), L = itemsOn(t);
  const nw = S.news.filter(n => sameDay(n.found, now)).sort((x, y) => nts(y) - nts(x)).slice(0, 8);
  const dg = S.digests.filter(d => sameDay(Date.parse(d.date), now)).slice(0, 2);
  return `<h1>${esc(fmt(now, { weekday: 'long', day: 'numeric', month: 'long' }))}</h1>
  <div class="bar" data-day="${t}"><span class="mut">${L.filter(i => isDone(i, t)).length} de ${L.length} feitos</span><span class="sp"></span><button class="pri" data-a="new" data-date="${t}">+ Novo item</button></div>
  <div data-day="${t}" style="min-height:60px">${L.map(i => chip(i, t)).join('') || '<p class="mut">Nada marcado para hoje.</p>'}</div>
  <h2>Novidades de hoje<span>${nw.length}</span></h2>${dg.map(digest).join('')}${nw.map(newsRow).join('') || '<p class="mut">Nenhuma novidade encontrada hoje.</p>'}`;
}

// ---------- Semana (horizontal) ----------
function weekGrid(st, today) {
  let tot = 0, dn = 0;
  const h = [0, 1, 2, 3, 4, 5, 6].map(n => { const d = addD(st, n), ds = ymd(d), L = itemsOn(ds), k = L.filter(i => isDone(i, ds)).length; tot += L.length; dn += k;
    return `<div class="wcol${ds === today ? ' today' : ''}" data-day="${ds}"><h3 data-a="goday" data-date="${ds}"><span class="wd2">${esc(fmt(d, { weekday: 'short' }))}</span><span class="wn">${d.getDate()}</span><span class="sp"></span><button class="lnk" data-a="new" data-date="${ds}" title="Novo item">+</button></h3>${L.map(i => chip(i, ds)).join('') || '<p class="mut" style="margin:4px 0">Livre</p>'}</div>`; }).join('');
  return { html: `<div class="wk">${h}</div>`, tot, dn };
}
function vSemana() {
  const st = addD(wk, -((wk.getDay() + 6) % 7)), today = ymd(new Date()), w = weekGrid(st, today);
  const late = S.items.filter(i => !Core.multi(i) && i.date && i.date < today && i.status !== 'done' && match(i, gq));
  return `<div class="bar"><button data-a="wnav" data-n="-1">‹</button><button data-a="wtoday">Esta semana</button><button data-a="wnav" data-n="1">›</button><b>Semana de ${esc(fmt(st, { day: 'numeric', month: 'long' }))}</b><span class="sp"></span><span class="mut">${w.dn} de ${w.tot} feitos</span>${sizeCtl()}</div>
  <div class="prog"><i style="width:${w.tot ? Math.round(w.dn / w.tot * 100) : 0}%"></i></div>
  ${late.length ? `<details class="late"><summary>${late.length} atrasado${late.length > 1 ? 's' : ''}</summary>${late.map(i => chip(i, i.date)).join('')}</details>` : ''}${w.html}`;
}
const sizeCtl = () => `<label>Altura<input type="range" min="70" max="420" step="10" data-live="cellH" value="${S.settings.cellH}"></label><label>Largura<input type="range" min="90" max="400" step="10" data-live="colW" value="${S.settings.colW}"></label>`;

// ---------- Agenda (dia, semana e mês) ----------
function vAgenda() {
  const st = addD(cur, -((cur.getDay() + 6) % 7)), today = ymd(new Date());
  const lbl = view === 'mes' ? fmt(cur, { month: 'long', year: 'numeric' }) : view === 'dia' ? fmt(cur, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Semana de ' + fmt(st, { day: 'numeric', month: 'short' });
  let body;
  if (view === 'dia') {
    const ds = ymd(cur), L = itemsOn(ds);
    body = `<div data-day="${ds}" style="max-width:760px;min-height:120px">${L.map(i => chip(i, ds)).join('') || '<p class="mut">Dia livre.</p>'}<button class="lnk" data-a="new" data-date="${ds}">+ Novo item</button></div>`;
  } else if (view === 'semana') body = weekGrid(st, today).html;
  else {
    const f = new Date(cur.getFullYear(), cur.getMonth(), 1), ms = addD(f, -((f.getDay() + 6) % 7)), mc = S.settings.mcols, cap = Math.max(2, Math.floor((S.settings.cellH - 28) / 26));
    body = `<div class="mwrap"><div class="month" style="grid-template-columns:${mc.map(x => x + 'fr').join(' ')}">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((w, i) => `<div class="wd">${w}${i < 6 ? `<i class="rz" data-rz="${i}" title="Arraste para ajustar a largura"></i>` : ''}</div>`).join('')}${Array.from({ length: 42 }, (_, n) => { const d = addD(ms, n), ds = ymd(d), L = itemsOn(ds);
      return `<div class="cell${d.getMonth() !== cur.getMonth() ? ' off' : ''}${ds === today ? ' today' : ''}" data-day="${ds}" data-a="new" data-date="${ds}"><b data-a="goday" data-date="${ds}">${d.getDate()}</b>${L.slice(0, cap).map(i => chip(i, ds)).join('')}${L.length > cap ? `<small class="mut" data-a="goday" data-date="${ds}">+${L.length - cap} mais</small>` : ''}</div>`; }).join('')}</div></div>`;
  }
  return `<div class="bar"><div class="seg">${[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-a="view" data-v="${k}">${l}</button>`).join('')}</div>
  <button data-a="nav" data-n="-1">‹</button><button data-a="hoje">Hoje</button><button data-a="nav" data-n="1">›</button><b style="text-transform:capitalize">${esc(lbl)}</b><span class="sp"></span>${view !== 'dia' ? sizeCtl() : ''}
  <button class="pri" data-a="new" data-date="${ymd(cur)}">+ Novo item</button></div>${body}`;
}

// ---------- Kanban ----------
const card = i => { const [a, b] = chk(i);
  return `<div class="kc${sel.has(i.id) ? ' sel' : ''}${cutCls(i)}" style="--c:${col(i)}" draggable="true" data-drag data-a="edit" data-id="${i.id}" data-ds="${i.date || ''}">${i.img ? `<img src="${esc(i.img)}" draggable="false">` : ''}<div>${esc(i.title)}</div><small>${i.theme ? esc(i.theme) : ''}${i.date ? ' · ' + esc(fmt(parse(i.date), { day: 'numeric', month: 'short' })) : ''}${+i.days > 1 ? ' · ' + i.days + 'd' : ''}${i.prog ? ' · ' + esc(i.prog) : ''}${b ? ` · ☑ ${a}/${b}` : ''}</small>${b ? `<div class="mini"><i style="width:${a / b * 100}%"></i></div>` : ''}</div>`; };
function vKanban() {
  const cols = S.settings.cols, base = S.items.filter(i => (!kf || i.theme === kf) && match(i, gq));
  return `<div class="bar"><select data-c="kf"><option value="">Todos os temas</option>${themeList().map(t => `<option${t === kf ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
  <input id="ncol" placeholder="Nova coluna" style="width:150px"><button data-a="addcol">Adicionar coluna</button><span class="sp"></span><button class="pri" data-a="new" data-status="${cols[0].id}">+ Novo item</button></div>
  <div class="kan">${cols.map(c => { const cs = base.filter(i => (i.status || cols[0].id) === c.id && match(i, kq[c.id])).sort(byOrd);
    return `<div class="col" data-col="${c.id}"><h3>${esc(c.name)}<span>${cs.length}</span><span class="sp"></span>${c.id[0] === 'c' ? `<button data-a="delcol" data-id="${c.id}" title="Remover coluna">×</button>` : ''}<button data-a="new" data-status="${c.id}" title="Novo item">+</button></h3>
    <input class="qf" id="kq-${c.id}" data-kq="${c.id}" placeholder="Filtrar esta coluna…" value="${esc(kq[c.id] || '')}">${cs.map(card).join('')}</div>`; }).join('')}</div>`;
}

// ---------- Temas ----------
function vTemas() {
  const cols = S.settings.cols, tc = S.settings.themeColors, none = S.items.filter(i => !i.theme);
  const tcard = (t, L, real) => { const c = real ? (tc[t] || themeHex(t)) : '#8890a0';
    return `<div class="tc" style="--c:${c}"><div class="top">${real ? `<input type="color" data-thc="${esc(t)}" value="${c}" title="Cor do tema">` : ''}<input type="text" ${real ? `data-rn="${esc(t)}"` : 'disabled'} value="${esc(real ? t : 'Sem tema')}"><b>${L.length}</b></div>
    <div class="cnt">${cols.map(x => `<span class="pill">${esc(x.name)} ${L.filter(i => (i.status || first()) === x.id).length}</span>`).join('')}</div>
    <div class="acts"><button class="sm" data-a="thsel" data-t="${esc(t)}">Selecionar todos</button>${real ? `<button class="sm" data-a="thforce" data-t="${esc(t)}" title="Remove as cores individuais e usa a cor do tema">Aplicar cor a todos</button><button class="sm" data-a="thdel" data-t="${esc(t)}">${tx.del === t ? 'Confirmar exclusão?' : 'Excluir tema'}</button>` : ''}</div>
    <details data-thd="${esc(t)}"${tx[t] ? ' open' : ''}><summary>${L.length} atividade${L.length === 1 ? '' : 's'}</summary>${L.slice(0, 80).map(i => chip(i, i.date || '')).join('') || '<p class="mut">Vazio</p>'}${L.length > 80 ? `<small class="mut">+${L.length - 80} não exibidas</small>` : ''}</details></div>`; };
  return `<h1>Temas</h1><div class="bar"><input id="nth" placeholder="Novo tema" style="width:200px"><input type="color" id="nthc" value="#3498db"><button class="pri" data-a="thnew">Criar tema</button><span class="mut">Cada tema agrupa atividades. Clique em "Selecionar todos" para editar cor ou tema em conjunto.</span></div>
  <div class="themes">${themeList().map(t => tcard(t, S.items.filter(i => i.theme === t), true)).join('')}${none.length ? tcard('', none, false) : ''}</div>
  <h2>Temas de notícias monitorados</h2>${S.topics.map(t => `<span class="chip" data-a="edtopic" data-id="${t.id}">${esc(t.name)} <span class="mut">${S.news.filter(n => n.topicId === t.id).length} notícias</span></span>`).join('') || '<p class="mut">Nenhum tema de notícias.</p>'}`;
}

// ---------- Notícias ----------
function vNews() {
  const L = S.news.filter(n => (!nf || n.topicId === nf) && (nv === 'todas' || (nv === 'novas' ? !n.seen : n.fav)));
  const groups = KINDS.map(([k, l]) => [l, L.filter(n => (n.kind || 'noticia') === k).sort((a, b) => nts(b) - nts(a)).slice(0, 60)]).filter(g => g[1].length);
  return `<div class="bar"><button class="pri" data-a="check"${busy ? ' disabled' : ''}>${busy ? 'Verificando…' : 'Verificar agora'}</button><button data-a="allseen">Marcar tudo como lido</button>
  <div class="seg">${[['todas', 'Todas'], ['novas', 'Não lidas'], ['fav', '★ Ler depois']].map(([k, l]) => `<button class="${nv === k ? 'on' : ''}" data-a="nview" data-v="${k}">${l}</button>`).join('')}</div><span class="sp"></span>
  <span class="mut">${S.lastCheck ? 'Última checagem: ' + esc(new Date(S.lastCheck).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })) : 'Ainda não verificado'}</span><button class="pri" data-a="newtopic">+ Novo tema</button></div>
  <div>${S.topics.map(t => `<span class="chip${nf === t.id ? ' on' : ''}" data-a="nf" data-id="${t.id}">${esc(t.name.length > 40 ? t.name.slice(0, 40) + '…' : t.name)}${t.priority === 'imediato' ? ' 🔔' : ''}<u data-a="edtopic" data-id="${t.id}" title="Editar tema">✎</u><u data-a="deltopic" data-id="${t.id}" title="Remover tema">×</u></span>`).join('') || '<span class="mut">Nenhum tema ainda. Clique em "+ Novo tema".</span>'}</div>
  ${S.digests.slice(0, 3).map(digest).join('')}${groups.map(([l, arr]) => `<div class="kind">${l}</div>${arr.map(newsRow).join('')}`).join('') || '<p class="mut">Sem notícias nesta visão.</p>'}`;
}

// ---------- Ajustes ----------
function vSet() {
  const s = S.settings, row = (t, sub, ctl) => `<div class="row"><div>${t}${sub ? `<br><small class="mut">${sub}</small>` : ''}</div><div>${ctl}</div></div>`;
  const opt = (arr, v) => arr.map(([k, l]) => `<option value="${k}"${String(v) === k ? ' selected' : ''}>${l}</option>`).join('');
  const addrs = net && net.on ? net.addrs.map(x => `<div class="addr">${x.qr ? `<img src="${x.qr}" width="110" height="110">` : ''}<div><b>${esc(x.label)}</b><br><code>${esc(x.url)}</code></div></div>`).join('') : '';
  return `<h1>Ajustes</h1>
  ${row('Aparência', '', `<select data-s="theme">${opt([['auto', 'Automática'], ['light', 'Clara'], ['dark', 'Escura']], s.theme)}</select>`)}
  ${row('Tamanho da interface', 'Ajusta sozinho para cada monitor. Também: Ctrl + roda do mouse, ou Ctrl + / Ctrl -.', `<label><input type="checkbox" data-s="autozoom"${s.autozoom ? ' checked' : ''}> automático</label><input type="range" min="0.6" max="1.6" step="0.05" data-s="zoom" value="${s.zoom}"><span>${Math.round(s.zoom * 100)}%</span>`)}
  ${row('Sons e alarmes', 'Itens com alarme tocam este som e abrem um aviso na tela.', `<input type="checkbox" data-s="sound"${s.sound ? ' checked' : ''}><select data-s="tone">${opt([['sino', 'Sino'], ['bip', 'Bip'], ['suave', 'Suave']], s.tone)}</select><input type="range" min="0.1" max="1" step="0.05" data-s="volume" value="${s.volume}"><button data-a="sndtest">Testar</button>`)}
  ${row('Lembrete no horário dos itens', 'Notificação silenciosa na hora marcada (itens sem alarme).', `<input type="checkbox" data-s="remind"${s.remind ? ' checked' : ''}>`)}
  ${row('Checar notícias todo dia a partir das', 'Se o PC estiver desligado, a checagem acontece quando ele ligar. Temas com 🔔 são checados a cada hora.', `<input type="number" min="0" max="23" data-s="hour" value="${s.hour}">h`)}
  ${row('Abrir com o Windows, na bandeja', 'Necessário para notícias, alarmes e celular sem abrir o app.', `<input type="checkbox" data-s="autostart"${s.autostart ? ' checked' : ''}>`)}
  ${row('Resumos com Ollama', `Gratuito e local. Rode <code>ollama pull ${esc(s.model)}</code>. ${esc(omsg)}`, `<input type="checkbox" data-s="ollama"${s.ollama ? ' checked' : ''}>${models.length ? `<select data-s="model">${models.map(m => `<option${m === s.model ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>` : `<input data-s="model" value="${esc(s.model)}" style="width:150px">`}<button data-a="otest">Testar</button>`)}
  ${row('Capas de jogos e filmes', 'Opcional e gratuito: chave do RAWG (rawg.io/apidocs) e do TMDB (themoviedb.org). Steam e AniList funcionam sem chave.', `<input data-s="rawgKey" placeholder="Chave RAWG" value="${esc(s.rawgKey)}" style="width:150px"><input data-s="tmdbKey" placeholder="Chave TMDB" value="${esc(s.tmdbKey)}" style="width:150px">`)}
  ${row('Acesso pelo celular', 'No celular, abra o endereço no navegador ou use o app Android. Fora de casa: instale o Tailscale (grátis) nos dois aparelhos e use o endereço "Tailscale".', `<input type="checkbox" data-s="mobile"${s.mobile ? ' checked' : ''}>`)}
  ${s.mobile ? `${row(`PIN do celular: <b>${esc(net ? net.pin : s.pin)}</b>`, '', '<button data-a="newpin">Gerar novo PIN</button>')}${addrs || '<p class="mut">Nenhum endereço de rede encontrado. Conecte-se ao Wi-Fi.</p>'}` : ''}
  ${row('Dados', 'Backup automático diário (14 dias guardados). Seus dados ficam só neste computador.', '<button data-a="exp">Exportar backup</button><button data-a="imp">Importar</button><button data-a="ics">Exportar .ics (Google Agenda)</button><button data-a="bkp">Abrir pasta de backups</button>')}`;
}

// ---------- Janelas (item e tema de notícias) ----------
const hint = '<span class="hint">Clique fora mais uma vez para fechar (sem salvar)</span>';
function vModal() {
  if (modal.kind === 'topic') {
    const t = modal.t, f = (k, l, ph = '') => `<label>${l}</label><input data-t="${k}" value="${esc(t[k])}" placeholder="${ph}">`, ck = (k, l) => `<label style="display:flex;gap:8px;align-items:center;color:var(--fg)"><input type="checkbox" data-tc="${k}"${t[k] ? ' checked' : ''}> ${l}</label>`;
    return `<div class="ov" data-a="close"><div class="md sm2"><h3 style="font-size:16px">${t.id ? 'Editar tema de notícias' : 'Novo tema de notícias'}</h3>${f('name', 'Tema ou endereço de um feed RSS', 'Ex.: Minecraft Java multiplayer')}${f('include', 'Palavras extras (opcional)')}${f('exclude', 'Excluir palavras (opcional)')}
    <div class="g2"><div><label>Idioma</label><select data-t="lang"><option value="pt"${t.lang !== 'en' ? ' selected' : ''}>Português</option><option value="en"${t.lang === 'en' ? ' selected' : ''}>English</option></select></div>
    <div><label>Prioridade</label><select data-t="priority"><option value="resumo"${t.priority !== 'imediato' ? ' selected' : ''}>Só no resumo do dia</option><option value="imediato"${t.priority === 'imediato' ? ' selected' : ''}>Avisar na hora (🔔)</option></select></div></div>
    <label>Fontes</label>${ck('google', 'Google News')}${ck('reddit', 'Reddit (busca pelo tema)')}
    <label>Outras fontes, uma por linha: r/subreddit, canal do YouTube ou endereço de RSS</label><textarea rows="3" data-t="extra">${esc(t.extra)}</textarea>
    <div class="act"><button class="pri" data-a="savetopic">Salvar</button><button data-a="close2">Cancelar</button><span class="err">${esc(modal.msg || '')}</span>${hint}</div></div></div>`;
  }
  const i = modal.it, [ca, cb] = chk(i), f = (k, l, type = 'text', x = '') => `<div><label>${l}</label><input type="${type}" data-f="${k}" value="${esc(i[k])}" ${x}></div>`, so = (arr, v) => arr.map(([k, l]) => `<option value="${k}"${String(v == null ? '' : v) === k ? ' selected' : ''}>${l}</option>`).join('');
  const multi = i.id && Core.multi(i) && modal.ds;
  return `<div class="ov" data-a="close"><div class="md"><h3 style="font-size:16px;display:flex;gap:8px"><span class="dot" style="background:${col(i)};margin-top:6px"></span>${i.id ? 'Editar item' : 'Novo item'}</h3>
  <label>Título</label><input data-f="title" value="${esc(i.title)}" placeholder="Ex.: Jogar Darksiders 2" id="mt">
  <div class="g2">${f('theme', 'Tema', 'text', 'list="thl2" placeholder="Jogo, Anime, Estudo…"')}${f('prog', 'Progresso', 'text', 'placeholder="Ex.: ep 120/500"')}</div>
  <div class="g2">${f('date', 'Data de início', 'date')}${f('time', 'Hora', 'time')}${f('days', 'Duração (dias)', 'number', 'min="1" max="365"')}
  <div><label>Repetir</label><select data-f="rep">${so(REPS, i.rep || '')}</select></div>
  <div><label>Alarme ${i.time ? '' : '(defina a hora)'}</label><select data-f="alarm">${so(ALARMS, i.alarm)}</select></div>
  <div><label>Coluna do kanban</label><select data-f="status">${S.settings.cols.map(c => `<option value="${c.id}"${(i.status || first()) === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div></div>
  <datalist id="thl2">${themeList().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
  <label>Cor</label><div class="swatches">${PAL.map(c => `<button data-a="mcolor" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')}<input type="color" data-cc="modal" value="${col(i)}"><button class="sm" data-a="mcolor" data-c="">Usar cor do tema</button></div>
  ${multi ? `<label>Conclusão (item com repetição ou vários dias)</label><div class="cbar"><button class="sm" data-a="mdday">${isDone(i, modal.ds) ? '✓ Feito em ' + esc(fmt(parse(modal.ds), { day: 'numeric', month: 'short' })) + ' · reabrir' : 'Concluir só em ' + esc(fmt(parse(modal.ds), { day: 'numeric', month: 'short' }))}</button><button class="sm" data-a="mdall">Concluir todos os dias</button><button class="sm" data-a="mdnone">Reabrir todos</button></div>` : ''}
  <label>Notas</label><textarea rows="2" data-f="notes">${esc(i.notes)}</textarea>
  <label>Checklist ${cb ? `(${ca}/${cb})` : ''}</label>${(i.check || []).map(c => `<div class="cr"><input type="checkbox" data-a="cdone" data-cid="${c.id}"${c.done ? ' checked' : ''}><input class="ct" data-ct="${c.id}" value="${esc(c.t)}"><button class="sm" data-a="cmv" data-cid="${c.id}" data-d="-1" title="Subir">▲</button><button class="sm" data-a="cmv" data-cid="${c.id}" data-d="1" title="Descer">▼</button><input type="checkbox" title="Selecionar para copiar ou recortar" data-a="csel" data-cid="${c.id}"${modal.csel.has(c.id) ? ' checked' : ''}><button class="sm" data-a="cdel" data-cid="${c.id}" title="Remover">×</button></div>`).join('')}
  <div class="cr"><input id="cnew" placeholder="Novo item do checklist (Enter para adicionar)"><button data-a="cadd">Adicionar</button></div>
  <div class="cbar"><button class="sm" data-a="ccopy">Copiar selecionados</button><button class="sm" data-a="ccut">Recortar selecionados</button><button class="sm" data-a="ccopyall">Copiar tudo</button><button class="sm" data-a="cpaste"${cclip.length ? '' : ' disabled'}>Colar (${cclip.length})</button><button class="sm" data-a="callon">Marcar todos</button><button class="sm" data-a="calloff">Desmarcar todos</button></div>
  <label>Imagem</label><div class="isr"><input id="iq" data-q="iq" placeholder="Pesquisar imagem, como no Google Imagens (ex.: Darksiders 2 capa)" value="${esc(modal.iq)}"><select data-q="im">${so([['all', 'Tudo'], ['games', 'Jogos'], ['anime', 'Anime/Mangá'], ['movies', 'Filmes/Séries'], ['web', 'Web']], modal.im)}</select><button class="pri" data-a="imgs">Buscar</button></div>
  <div class="img">${i.img ? `<img src="${esc(i.img)}">` : '<div class="ph">Sem imagem</div>'}<div class="isr" style="flex:1"><input id="iu" placeholder="Ou cole o endereço de uma imagem (https://…)"><button data-a="imgu">Usar</button><button data-a="imgf">Do computador</button>${i.img ? '<button data-a="imgx">Remover</button>' : ''}</div></div>
  ${modal.res ? `<div class="grid">${modal.res.map((r, n) => `<figure data-a="pick" data-n="${n}" title="${esc(r.title)}"><img src="${esc(r.thumb)}" loading="lazy"><figcaption>${esc(r.src)} · ${esc(r.title)}</figcaption></figure>`).join('') || '<span class="mut">Nada encontrado. Tente outro termo ou outra categoria.</span>'}</div>` : ''}
  <div class="act"><button class="pri" data-a="saveit">Salvar</button><button data-a="close2">Cancelar</button><span class="err">${esc(modal.msg || '')}</span>${hint}<span class="sp"></span>${i.id ? '<button data-a="mdup">Duplicar</button><button data-a="mcopy">Copiar</button><button data-a="delit">Excluir</button>' : ''}</div></div></div>`;
}
const blank = d => ({ id: null, title: '', theme: '', date: d || '', time: '', days: 1, status: first(), rep: '', alarm: '', prog: '', notes: '', img: '', color: '', check: [], ord: Date.now(), doneOn: [], undoneOn: [], doneAll: false });
const openModal = (it, ds) => { modal = { kind: 'item', it: JSON.parse(JSON.stringify(it)), ds: ds || it.date || '', res: null, msg: '', csel: new Set(), outs: 0, iq: it.title || '', im: 'all' }; render(); setTimeout(() => { const e = $('#mt'); if (e && !it.id) e.focus(); }, 30); };

// ---------- Desenho principal ----------
function renderSel() {
  const b = $('#selbar'); b.hidden = !sel.size; if (!sel.size) return;
  b.innerHTML = `<b>${sel.size} selecionado${sel.size > 1 ? 's' : ''}</b><span class="swatches">${PAL.map(c => `<button data-a="tcolor" data-c="${c}" style="background:${c}"></button>`).join('')}</span><input type="color" data-cc="targets" value="#3498db" title="Outra cor">
  <input type="text" id="sbt" placeholder="Tema…" list="thl3"><datalist id="thl3">${themeList().map(t => `<option value="${esc(t)}">`).join('')}</datalist><button data-a="sbtheme">Aplicar tema</button><button data-a="sbcopy">Copiar</button><button data-a="sbcut">Recortar</button><button data-a="sbdup">Duplicar</button><button data-a="sbdel">Excluir</button><button data-a="sbclear">✕</button>`;
}
function render() {
  const ae = document.activeElement, keep = ae && ae.id && $('#main').contains(ae) ? { id: ae.id, s: ae.selectionStart } : null, sc = $('#modal .md'), st = sc ? sc.scrollTop : 0;
  const th = S.settings.theme; document.body.dataset.theme = th === 'auto' ? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light') : th;
  $('#nav').innerHTML = TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-t="${k}">${l}${k === 'noticias' && unread() ? `<i>${unread()}</i>` : ''}</button>`).join('');
  const m = $('#main'); m.style.setProperty('--cellh', S.settings.cellH + 'px'); m.style.setProperty('--colw', S.settings.colW + 'px');
  m.innerHTML = { hoje: vHoje, semana: vSemana, agenda: vAgenda, kanban: vKanban, temas: vTemas, noticias: vNews, ajustes: vSet }[tab]();
  $('#modal').hidden = !modal; $('#modal').innerHTML = modal ? vModal() : ''; const n = $('#modal .md'); if (n) n.scrollTop = st;
  if (keep) { const e = document.getElementById(keep.id); if (e) { e.focus(); try { e.setSelectionRange(keep.s, keep.s); } catch {} } }
  renderSel(); renderAlarm();
}

// ---------- Sons e alarmes ----------
function beep(tone, vol) {
  actx = actx || new AudioContext(); actx.resume(); let t = actx.currentTime;
  for (const [f, d] of { bip: [[880, .15], [880, .15], [880, .3]], sino: [[660, .5], [880, .7]], suave: [[523, .25], [659, .25], [784, .45]] }[tone] || []) {
    const o = actx.createOscillator(), g = actx.createGain(); o.type = tone === 'sino' ? 'triangle' : 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + .05); t += d + .08;
  }
}
const stopSnd = () => { clearInterval(sndT); sndT = null; };
function playAlarm() { if (!S.settings.sound) return; stopSnd(); let n = 0; const go = () => { beep(S.settings.tone, S.settings.volume); if (++n >= 12) stopSnd(); }; go(); sndT = setInterval(go, 3500); }
function renderAlarm() {
  $('#alarm').innerHTML = alarmQ.map((a, n) => `<div class="al"><b>⏰ ${esc(a.title)}</b><div class="mut">${esc(a.theme || '')} ${esc(a.time || '')}</div><div class="act"><button class="pri" data-a="alopen" data-n="${n}">Abrir</button><button data-a="alsnz" data-n="${n}" data-min="5">+5 min</button><button data-a="alsnz" data-n="${n}" data-min="15">+15 min</button><button data-a="aldone" data-n="${n}">Concluir</button><button data-a="aldis" data-n="${n}">Dispensar</button></div></div>`).join('');
  if (!alarmQ.length) stopSnd();
}
const dropAlarm = n => { alarmQ.splice(n, 1); renderAlarm(); };

// ---------- Copiar, recortar, colar, mover ----------
const find = id => S.items.find(x => x.id === id);
const targets = () => sel.size ? [...sel] : ctxIds;
function place(its, mode, ds, status) {
  const dates = its.map(i => i.date).filter(Boolean).sort(), delta = ds && dates[0] ? Math.round((parse(ds) - parse(dates[0])) / 864e5) : 0, out = [];
  its.forEach((it, n) => { const date = ds ? (it.date ? ymd(addD(parse(it.date), delta)) : ds) : it.date;
    if (mode === 'move') { const r = find(it.id); if (r) { r.date = date; if (status) r.status = status; out.push(r); } }
    else { const c = Core.clone(it, first()); c.date = date; if (status) c.status = status; c.ord = Date.now() + n; S.items.push(c); out.push(c); } });
  persist(); return out;
}
function copyItems(ids, mode) { const its = ids.map(find).filter(Boolean); if (!its.length) return; clip = { mode, items: JSON.parse(JSON.stringify(its)), ids: new Set(ids) }; toast((mode === 'cut' ? 'Recortado' : 'Copiado') + ': ' + its.length + ' item(ns). Clique com o botão direito em um dia ou coluna para colar.'); render(); }
function paste(ds, status) {
  if (!clip) return toast('Nada copiado ainda.');
  place(clip.items, clip.mode === 'cut' ? 'move' : 'copy', ds, status); const n = clip.items.length; if (clip.mode === 'cut') clip = null; sel.clear(); render(); toast(n + ' item(ns) colado(s).');
}
function recolor(ids, c) { ids.forEach(id => { const i = find(id); if (i) i.color = c; }); persist(); render(); }
function delItems(ids) { if (!ids.length || !confirm(`Excluir ${ids.length} item(ns)?`)) return; S.items = S.items.filter(i => !ids.includes(i.id)); sel.clear(); persist(); render(); }
function tickItem(id, ds) { const i = find(id); if (!i) return; Core.toggleDay(i, ds, first()); persist(); render(); }

// ---------- Menu de contexto ----------
function showCtx(x, y, html) {
  const m = $('#ctx'); m.innerHTML = html; m.hidden = false; m.style.left = '0px'; m.style.top = '0px';
  m.style.left = Math.max(4, Math.min(x, innerWidth - m.offsetWidth - 6)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - m.offsetHeight - 6)) + 'px';
}
const hideCtx = () => { $('#ctx').hidden = true; };
document.addEventListener('contextmenu', e => {
  const it = e.target.closest('[data-id][data-ds]'), day = e.target.closest('[data-day]'), colEl = e.target.closest('[data-col]');
  if (it && it.dataset.idrag !== undefined || it && it.dataset.drag !== undefined) {
    e.preventDefault(); const id = it.dataset.id, ds = it.dataset.ds; if (!sel.has(id)) { sel.clear(); renderSel(); } ctxIds = [id]; const n = targets().length, i = find(id), mu = Core.multi(i);
    showCtx(e.clientX, e.clientY, `<button data-a="edit" data-id="${id}" data-ds="${ds}">Editar</button><button data-a="tick" data-id="${id}" data-ds="${ds}">${isDone(i, ds) ? 'Reabrir' : 'Concluir'} ${mu ? 'só este dia' : ''}</button>
    ${mu ? `<button data-a="cm_all" data-id="${id}">Concluir todos os dias</button><button data-a="cm_none" data-id="${id}">Reabrir todos os dias</button>` : ''}<hr>
    <button data-a="cm_dup">Duplicar${n > 1 ? ' (' + n + ')' : ''}</button><button data-a="cm_copy">Copiar${n > 1 ? ' (' + n + ')' : ''}</button><button data-a="cm_cut">Recortar${n > 1 ? ' (' + n + ')' : ''}</button><hr>
    <div class="swatches">${PAL.map(c => `<button data-a="tcolor" data-c="${c}" style="background:${c}"></button>`).join('')}<input type="color" data-cc="targets" value="${col(i)}"></div><button data-a="tcolor" data-c="">Usar cor do tema</button><hr><button data-a="cm_del">Excluir${n > 1 ? ' (' + n + ')' : ''}</button>`);
  } else if (colEl) {
    e.preventDefault(); showCtx(e.clientX, e.clientY, `<button data-a="new" data-status="${colEl.dataset.col}">Novo item aqui</button><button data-a="cm_paste" data-st="${colEl.dataset.col}"${clip ? '' : ' disabled'}>Colar aqui${clip ? ' (' + clip.items.length + ')' : ''}</button>`);
  } else if (day) {
    e.preventDefault(); hovDay = day.dataset.day; showCtx(e.clientX, e.clientY, `<button data-a="new" data-date="${day.dataset.day}">Novo item neste dia</button><button data-a="cm_paste" data-ds="${day.dataset.day}"${clip ? '' : ' disabled'}>Colar aqui${clip ? ' (' + clip.items.length + ')' : ''}</button>`);
  }
});

// ---------- Ações ----------
const closeModal = () => { modal = null; render(); };
const act = {
  tab: async d => { tab = d.t; if (tab === 'ajustes') net = await api.net(); render(); },
  view: d => { view = d.v; render(); },
  nav: d => { const n = +d.n; cur = view === 'mes' ? new Date(cur.getFullYear(), cur.getMonth() + n, 1) : addD(cur, n * (view === 'semana' ? 7 : 1)); render(); },
  hoje: () => { cur = new Date(); render(); },
  wnav: d => { wk = addD(wk, 7 * +d.n); render(); }, wtoday: () => { wk = new Date(); render(); },
  goday: (d, e) => { e.stopPropagation(); cur = parse(d.date); view = 'dia'; tab = 'agenda'; render(); },
  new: d => { hideCtx(); const it = blank(d.date); if (d.status) it.status = d.status; openModal(it, d.date); },
  edit: d => { hideCtx(); const i = find(d.id); if (i) openModal(i, d.ds); },
  tick: (d, e) => { e.stopPropagation(); hideCtx(); tickItem(d.id, d.ds); },
  close: (d, e, el) => { if (mdTarget !== el || e.target !== el) return; modal.outs = (modal.outs || 0) + 1; if (modal.outs >= 2) closeModal(); else { const h = $('.hint'); if (h) h.style.display = 'inline-block'; } },
  close2: closeModal,
  // item
  mcolor: d => { modal.it.color = d.c; render(); },
  saveit: () => { const i = modal.it; if (!i.title.trim()) { modal.msg = 'Dê um título ao item.'; return render(); }
    i.title = i.title.trim(); i.theme = (i.theme || '').trim(); i.days = Math.min(365, Math.max(1, parseInt(i.days) || 1)); i.status = i.status || first(); i.check = (i.check || []).filter(c => c.t.trim());
    const k = S.items.findIndex(x => x.id === i.id); if (k >= 0) S.items[k] = i; else { i.id = uid(); S.items.push(i); } modal = null; persist(); render(); },
  delit: () => { if (!confirm('Excluir este item?')) return; S.items = S.items.filter(x => x.id !== modal.it.id); modal = null; persist(); render(); },
  mdup: () => { const c = Core.clone(modal.it, first()); c.ord = Date.now(); S.items.push(c); modal = null; persist(); render(); toast('Item duplicado.'); },
  mcopy: () => { const i = modal.it; clip = { mode: 'copy', items: [JSON.parse(JSON.stringify(i))], ids: new Set([i.id]) }; toast('Copiado. Clique com o botão direito em um dia para colar.'); },
  mdday: () => { Core.toggleDay(modal.it, modal.ds, first()); render(); }, mdall: () => { Core.setAll(modal.it, true, first()); render(); }, mdnone: () => { Core.setAll(modal.it, false, first()); render(); },
  // checklist
  cadd: () => { const e = $('#cnew'), t = e.value.trim(); if (!t) return; (modal.it.check = modal.it.check || []).push({ id: uid(), t, done: false }); render(); setTimeout(() => { const n = $('#cnew'); if (n) n.focus(); }, 10); },
  cdone: d => { const c = modal.it.check.find(x => x.id === d.cid); c.done = !c.done; render(); },
  cdel: d => { modal.it.check = modal.it.check.filter(x => x.id !== d.cid); modal.csel.delete(d.cid); render(); },
  cmv: d => { const L = modal.it.check, k = L.findIndex(x => x.id === d.cid), j = k + +d.d; if (j >= 0 && j < L.length) { L.splice(j, 0, L.splice(k, 1)[0]); render(); } },
  csel: d => { modal.csel.has(d.cid) ? modal.csel.delete(d.cid) : modal.csel.add(d.cid); },
  ccopy: () => { cclip = modal.it.check.filter(c => modal.csel.has(c.id)).map(c => ({ t: c.t, done: c.done })); toast(cclip.length + ' item(ns) do checklist copiado(s).'); render(); },
  ccut: () => { cclip = modal.it.check.filter(c => modal.csel.has(c.id)).map(c => ({ t: c.t, done: c.done })); modal.it.check = modal.it.check.filter(c => !modal.csel.has(c.id)); modal.csel.clear(); toast(cclip.length + ' recortado(s). Abra outro item e clique em Colar.'); render(); },
  ccopyall: () => { cclip = (modal.it.check || []).map(c => ({ t: c.t, done: c.done })); toast('Checklist inteiro copiado.'); render(); },
  cpaste: () => { (modal.it.check = modal.it.check || []).push(...cclip.map(c => ({ id: uid(), t: c.t, done: c.done }))); render(); },
  callon: () => { (modal.it.check || []).forEach(c => { c.done = true; }); render(); }, calloff: () => { (modal.it.check || []).forEach(c => { c.done = false; }); render(); },
  // imagens
  imgs: async () => { const q = ($('#iq').value || modal.iq || '').trim() || modal.it.title; if (!q) { modal.msg = 'Escreva o que buscar.'; return render(); }
    modal.iq = q; modal.res = []; modal.msg = 'Buscando…'; render(); modal.res = await api.imgSearch(q, modal.im); modal.msg = ''; render(); },
  pick: async d => { const r = modal.res[+d.n]; modal.msg = 'Baixando imagem…'; render(); modal.it.img = await api.imgSave(r.url); modal.res = null; modal.msg = ''; render(); },
  imgu: async () => { const u = $('#iu').value.trim(); if (!/^https?:\/\//.test(u)) { modal.msg = 'Cole um endereço que comece com https://'; return render(); } modal.it.img = await api.imgSave(u); modal.msg = ''; render(); },
  imgf: async () => { const u = await api.imgFile(); if (u) { modal.it.img = u; modal.res = null; render(); } },
  imgx: () => { modal.it.img = ''; render(); },
  // menu de contexto e seleção
  cm_all: d => { hideCtx(); const i = find(d.id); Core.setAll(i, true, first()); persist(); render(); },
  cm_none: d => { hideCtx(); const i = find(d.id); Core.setAll(i, false, first()); persist(); render(); },
  cm_dup: () => { hideCtx(); const ids = targets(); place(ids.map(find).filter(Boolean), 'copy', null); sel.clear(); render(); toast('Duplicado.'); },
  cm_copy: () => { hideCtx(); copyItems(targets(), 'copy'); }, cm_cut: () => { hideCtx(); copyItems(targets(), 'cut'); },
  cm_del: () => { hideCtx(); delItems(targets()); },
  cm_paste: d => { hideCtx(); paste(d.ds || null, d.st || null); },
  tcolor: d => { hideCtx(); recolor(targets(), d.c); },
  sbtheme: () => { const t = $('#sbt').value.trim(); [...sel].forEach(id => { const i = find(id); if (i) i.theme = t; }); persist(); render(); },
  sbcopy: () => copyItems([...sel], 'copy'), sbcut: () => copyItems([...sel], 'cut'), sbdup: () => { place([...sel].map(find).filter(Boolean), 'copy', null); sel.clear(); render(); },
  sbdel: () => delItems([...sel]), sbclear: () => { sel.clear(); render(); },
  // temas
  thnew: () => { const n = $('#nth').value.trim(); if (!n) return; S.settings.themeColors[n] = $('#nthc').value; persist(); render(); },
  thsel: d => { S.items.filter(i => (i.theme || '') === d.t).forEach(i => sel.add(i.id)); render(); toast('Selecionados. Use a barra no rodapé para mudar a cor ou o tema de todos.'); },
  thforce: d => { S.items.forEach(i => { if (i.theme === d.t) i.color = ''; }); persist(); render(); toast('Todas as atividades do tema usam a cor do tema.'); },
  thdel: d => { if (tx.del !== d.t) { tx.del = d.t; return render(); } tx.del = null; S.items.forEach(i => { if (i.theme === d.t) i.theme = ''; }); delete S.settings.themeColors[d.t]; persist(); render(); },
  // kanban
  addcol: () => { const v = $('#ncol').value.trim(); if (!v) return; const c = S.settings.cols; c.splice(c.length - 1, 0, { id: 'c' + uid(), name: v }); persist(); render(); },
  delcol: d => { const c = S.settings.cols; S.items.forEach(i => { if (i.status === d.id) i.status = c[0].id; }); S.settings.cols = c.filter(x => x.id !== d.id); persist(); render(); },
  // notícias
  newtopic: () => { modal = { kind: 'topic', t: { id: null, name: '', include: '', exclude: '', lang: 'pt', priority: 'resumo', google: true, reddit: false, extra: '' }, msg: '', outs: 0 }; render(); },
  edtopic: (d, e) => { e.stopPropagation(); modal = { kind: 'topic', t: { google: true, reddit: false, extra: '', priority: 'resumo', ...S.topics.find(t => t.id === d.id) }, msg: '', outs: 0 }; render(); },
  savetopic: () => { const t = modal.t; if (!t.name.trim()) { modal.msg = 'Escreva o tema.'; return render(); } t.name = t.name.trim();
    const k = S.topics.findIndex(x => x.id === t.id); if (k >= 0) S.topics[k] = t; else { t.id = uid(); S.topics.push(t); } modal = null; persist(); render(); },
  deltopic: (d, e) => { e.stopPropagation(); if (!confirm('Remover este tema? As notícias não favoritadas dele serão apagadas.')) return; S.topics = S.topics.filter(t => t.id !== d.id); if (nf === d.id) nf = ''; persist(); S.news = S.news.filter(n => n.fav || S.topics.some(t => t.id === n.topicId)); render(); },
  nf: d => { nf = nf === d.id ? '' : d.id; render(); }, nview: d => { nv = d.v; render(); },
  check: async () => { busy = true; render(); S = await api.check(); busy = false; render(); },
  read: async d => { const n = S.news.find(x => String(x.id) === d.id); if (!n) return; api.open(n.link); n.seen = true; S.news = await api.seen(n.id); render(); },
  fav: async d => { S.news = await api.fav(+d.id); render(); },
  allseen: async () => { S.news = await api.seen('all'); render(); },
  // ajustes
  otest: async () => { omsg = 'Testando…'; render(); const r = await api.ollama(); models = r.ok ? r.models : []; omsg = r.ok ? (models.length ? 'Ollama ativo.' : 'Ollama ativo, sem modelos instalados.') : 'Ollama não encontrado. Abra o Ollama e tente de novo.'; render(); },
  sndtest: () => beep(S.settings.tone, S.settings.volume),
  newpin: async () => { await api.newpin(); net = await api.net(); S.settings.pin = net.pin; render(); },
  exp: () => api.exportar(), imp: async () => { S = await api.importar(); render(); }, ics: async () => { if (await api.ics()) toast('Arquivo .ics salvo.'); }, bkp: () => api.openBackups(),
  // busca
  gqclear: () => { gq = ''; $('#gq').value = ''; $('#gqx').hidden = true; $('#sres').hidden = true; render(); },
  sopen: d => { $('#sres').hidden = true; const i = find(d.id); if (i) { if (i.date) { cur = parse(i.date); } openModal(i, i.date); } },
  // alarmes
  alopen: d => { const a = alarmQ[+d.n]; dropAlarm(+d.n); openItemById(a.id, a.date); },
  alsnz: d => { const a = alarmQ[+d.n]; api.snooze({ id: a.id, date: a.date, min: +d.min }); dropAlarm(+d.n); toast('Soneca de ' + d.min + ' min.'); },
  aldone: d => { const a = alarmQ[+d.n]; const i = find(a.id); if (i && !isDone(i, a.date)) tickItem(a.id, a.date); dropAlarm(+d.n); },
  aldis: d => dropAlarm(+d.n)
};
function openItemById(id, date) { const i = find(id); if (!i) return; tab = 'agenda'; view = 'dia'; cur = parse(date || i.date || ymd(new Date())); openModal(i, date); }

// ---------- Eventos ----------
const toggleSel = id => { sel.has(id) ? sel.delete(id) : sel.add(id); render(); };
document.addEventListener('mousedown', e => { mdTarget = e.target; if (modal && e.target.closest('.md')) { modal.outs = 0; const h = $('.hint'); if (h) h.style.display = 'none'; } });
document.addEventListener('click', e => {
  if (!e.target.closest('#ctx')) hideCtx(); if (!e.target.closest('.sb')) $('#sres').hidden = true;
  const itEl = e.target.closest('[data-id][data-ds]'); if (itEl && (e.ctrlKey || e.metaKey) && !e.target.closest('input') && itEl.dataset.a === 'edit') { e.preventDefault(); toggleSel(itEl.dataset.id); return; }
  const el = e.target.closest('[data-a]'); if (el && act[el.dataset.a]) act[el.dataset.a](el.dataset, e, el);
});
document.addEventListener('input', e => { const t = e.target, d = t.dataset;
  if (d.f && modal) modal.it[d.f] = t.value; else if (d.ct && modal) { const c = modal.it.check.find(x => x.id === d.ct); if (c) c.t = t.value; }
  else if (d.t && modal) modal.t[d.t] = t.value; else if (d.tc && modal) modal.t[d.tc] = t.checked; else if (d.q && modal) modal[d.q] = t.value;
  else if (d.kq) { kq[d.kq] = t.value; render(); }
  else if (d.live) { S.settings[d.live] = +t.value; $('#main').style.setProperty(d.live === 'cellH' ? '--cellh' : '--colw', t.value + 'px'); }
  else if (t.id === 'gq') { gq = t.value; $('#gqx').hidden = !gq; renderSearch(); render(); } });
document.addEventListener('change', e => { const t = e.target, d = t.dataset;
  if (d.c === 'kf') { kf = t.value; render(); }
  else if (d.live) { persist(); render(); }
  else if (d.cc) { const c = t.value; if (d.cc === 'modal') { modal.it.color = c; render(); } else recolor(targets(), c); }
  else if (d.thc) { S.settings.themeColors[d.thc] = t.value; persist(); render(); }
  else if (d.rn) { const n = t.value.trim(); if (n && n !== d.rn) { S.items.forEach(i => { if (i.theme === d.rn) i.theme = n; }); const tc = S.settings.themeColors; if (tc[d.rn]) { tc[n] = tc[n] || tc[d.rn]; delete tc[d.rn]; } persist(); render(); } }
  else if (d.s) { const k = d.s; S.settings[k] = t.type === 'checkbox' ? t.checked : (t.type === 'number' || t.type === 'range') ? Math.min(+t.max || 99, Math.max(+t.min || 0, +t.value || 0)) : t.value; persist(); render(); } });
document.addEventListener('toggle', e => { const t = e.target.dataset && e.target.dataset.thd; if (t != null) tx[t] = e.target.open; }, true);
document.addEventListener('mouseover', e => { const i = e.target.closest && e.target.closest('[data-id][data-ds]'), d = e.target.closest && e.target.closest('[data-day]'); hov = i ? i.dataset.id : null; if (d) hovDay = d.dataset.day; });
const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#gq').focus(); return; }
  if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); return zoomBy(.1); } if (ctrl && e.key === '-') { e.preventDefault(); return zoomBy(-.1); } if (ctrl && e.key === '0') { e.preventDefault(); S.settings.zoom = 1; persist(); return toast('100%'); }
  if (e.key === 'Escape') { if ($('#ctx').hidden === false) return hideCtx(); if (modal) return closeModal(); if (sel.size) { sel.clear(); return render(); } }
  if (e.key === 'Enter' && e.target.id === 'cnew') { e.preventDefault(); return act.cadd(); } if (e.key === 'Enter' && e.target.id === 'iq') { e.preventDefault(); return act.imgs(); }
  if (e.key === 'Enter' && e.target.id === 'ncol') return act.addcol(); if (e.key === 'Enter' && e.target.id === 'nth') return act.thnew();
  if (typing(e) || modal) return;
  const ids = sel.size ? [...sel] : (hov ? [hov] : []);
  if (ctrl && e.key.toLowerCase() === 'c' && ids.length) { e.preventDefault(); copyItems(ids, 'copy'); }
  else if (ctrl && e.key.toLowerCase() === 'x' && ids.length) { e.preventDefault(); copyItems(ids, 'cut'); }
  else if (ctrl && e.key.toLowerCase() === 'v' && clip) { e.preventDefault(); const d = (tab === 'agenda' && view === 'dia') ? ymd(cur) : hovDay; if (tab === 'kanban') return toast('No Kanban, clique com o botão direito na coluna para colar.'); paste(d || ymd(new Date()), null); }
  else if (e.key === 'Delete' && ids.length && sel.size) delItems(ids);
});
function zoomBy(d) { S.settings.zoom = Math.round(Math.min(1.6, Math.max(.6, (S.settings.zoom || 1) + d)) * 100) / 100; persist(); toast('Zoom ' + Math.round(S.settings.zoom * 100) + '%'); if (tab === 'ajustes') render(); }
window.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? .1 : -.1); } }, { passive: false });
function renderSearch() {
  const box = $('#sres'); if (!gq) { box.hidden = true; return; }
  const L = S.items.filter(i => match(i, gq)).slice(0, 8);
  box.innerHTML = L.map(i => `<div data-a="sopen" data-id="${i.id}"><span class="dot" style="background:${col(i)}"></span>${esc(i.title)}<small>${esc(i.theme || '')}${i.date ? ' · ' + esc(fmt(parse(i.date), { day: 'numeric', month: 'short' })) : ''}</small></div>`).join('') || '<div class="mut">Nenhuma atividade encontrada.</div>'; box.hidden = false;
}

// Arrastar e soltar: cards do Kanban (reordenar), atividades entre dias (Ctrl copia)
const clr = () => document.querySelectorAll('.ins-b,.ins-a,.dropday').forEach(x => x.classList.remove('ins-b', 'ins-a', 'dropday'));
const half = (k, e) => { const r = k.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
const dragIds = () => dnd && sel.has(dnd) ? [...sel] : (dnd ? [dnd] : []);
document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('[data-idrag],[data-drag]'); if (c) { dnd = c.dataset.id; e.dataTransfer.setData('text/plain', dnd); e.dataTransfer.effectAllowed = 'copyMove'; } });
document.addEventListener('dragend', () => { dnd = null; clr(); });
document.addEventListener('dragover', e => { if (!dnd) return; const col = e.target.closest('[data-col]'), day = e.target.closest('[data-day]'); if (!col && !day) return; e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; clr();
  if (col) { const k = e.target.closest('[data-drag]'); if (k && k.dataset.id !== dnd) k.classList.add(half(k, e) ? 'ins-a' : 'ins-b'); } else day.classList.add('dropday'); });
document.addEventListener('drop', e => { if (!dnd) return; const col = e.target.closest('[data-col]'), day = e.target.closest('[data-day]'); if (!col && !day) return; e.preventDefault();
  const ids = dragIds(), its = ids.map(find).filter(Boolean);
  if (col) { const k = e.target.closest('[data-drag]'), cid = col.dataset.col, cols = S.settings.cols, it = find(dnd); if (!it) return;
    const list = S.items.filter(x => (x.status || cols[0].id) === cid && x.id !== dnd).sort(byOrd); let idx = list.length;
    if (k && k.dataset.id !== dnd) { const j = list.findIndex(x => x.id === k.dataset.id); if (j >= 0) idx = j + (half(k, e) ? 1 : 0); }
    it.status = cid; list.splice(idx, 0, it); list.forEach((x, n) => { x.ord = n * 10; }); persist(); }
  else { place(its, e.ctrlKey ? 'copy' : 'move', day.dataset.day); toast(e.ctrlKey ? 'Copiado para o dia.' : 'Movido para o dia.'); }
  dnd = null; clr(); sel.clear(); render(); });

// Redimensionar colunas do mês
document.addEventListener('pointerdown', e => { const h = e.target.closest && e.target.closest('[data-rz]'); if (!h) return; e.preventDefault(); e.stopPropagation();
  const i = +h.dataset.rz, g = h.closest('.month'), cells = [...g.querySelectorAll('.wd')], a = cells[i].getBoundingClientRect().width, b = cells[i + 1].getBoundingClientRect().width, x0 = e.clientX, fr = [...S.settings.mcols], tot = fr[i] + fr[i + 1];
  const mv = ev => { const d = Math.max(-a + 50, Math.min(b - 50, ev.clientX - x0)); fr[i] = tot * (a + d) / (a + b); fr[i + 1] = tot - fr[i]; g.style.gridTemplateColumns = fr.map(x => x + 'fr').join(' '); };
  const up = () => { removeEventListener('pointermove', mv); S.settings.mcols = fr; persist(); }; addEventListener('pointermove', mv); addEventListener('pointerup', up, { once: true }); });
document.addEventListener('dblclick', e => { if (e.target.closest && e.target.closest('[data-rz]')) { S.settings.mcols = [1, 1, 1, 1, 1, 1, 1]; persist(); render(); } });

(async () => {
  S = await api.load();
  api.onDb(d => { S = d; if (!modal) render(); });
  api.onGoto(t => { tab = t; render(); });
  api.onAlarm(a => { alarmQ.push(a); playAlarm(); renderAlarm(); });
  api.onOpen(a => openItemById(a.id, a.date));
  render();
})();
