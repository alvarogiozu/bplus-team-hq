/* ============================================================
   HQ — logica de interfaz. Vanilla JS, sin dependencias.
   Los datos SIEMPRE pasan por DB.* (db.js). Aqui no se toca
   localStorage nunca.
   ============================================================ */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var S;
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = function () { return matchMedia('(max-width: 860px)').matches; };

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function memberById(id) { return S.members.filter(function (m) { return m.id === id; })[0]; }
  function areaById(id) { return S.areas.filter(function (a) { return a.id === id; })[0] || { id: id, name: id || '—', c: '#9893a5' }; }
  function colById(id) { return S.columns.filter(function (c) { return c.id === id; })[0]; }
  function doneCol() { return S.columns.filter(function (c) { return c.kind === 'done'; })[0]; }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-'); if (p.length < 3) return iso;
    var mm = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return parseInt(p[2], 10) + ' ' + mm[parseInt(p[1], 10) - 1];
  }
  function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ---------- Rockie ---------- */
  function rockieSVG(color, size, opts) {
    opts = opts || {}; var s = size || 44;
    var eyes = opts.sleepy
      ? '<path d="M13 21 q3 2.6 6 0" stroke="#fdfbf7" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M25 21 q3 2.6 6 0" stroke="#fdfbf7" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
      : '<g class="eye"><ellipse cx="16" cy="20" rx="3.4" ry="4.6" fill="#fdfbf7"/></g><g class="eye"><ellipse cx="28" cy="20" rx="3.4" ry="4.6" fill="#fdfbf7"/></g>';
    var zzz = opts.sleepy ? '<text x="36" y="10" font-size="8" font-weight="700" fill="' + color + '">z z</text>' : '';
    return '<svg class="rockie" width="' + s + '" height="' + s + '" viewBox="0 0 44 44" aria-hidden="true">' +
      '<path d="M22 3 C33 3 40 11 40 22 C40 34 33 41 22 41 C11 41 4 34 4 22 C4 11 11 3 22 3 Z" fill="' + color + '"/>' + eyes +
      '<path d="M18 29 q4 3 8 0" stroke="#fdfbf7" stroke-width="2.4" fill="none" stroke-linecap="round"/>' + zzz + '</svg>';
  }
  function isNight() { var h = new Date().getHours(); return h >= 23 || h < 6; }
  function celebrateRockie() { var r = $('#navRockie .rockie'); if (!r) return; r.classList.remove('celebrate'); void r.offsetWidth; r.classList.add('celebrate'); }

  /* ---------- confetti ---------- */
  var CONF = ['#cf7358','#eaa545','#8aa54a','#2e88aa','#b4637a','#a573a5','#73a58a'];
  var cvs = $('#confetti'), ctx = cvs.getContext('2d'), parts = [], running = false;
  function sizeCanvas() { cvs.width = innerWidth * devicePixelRatio; cvs.height = innerHeight * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); }
  addEventListener('resize', sizeCanvas); sizeCanvas();
  function burst(x, y, n) {
    if (reduceMotion) return;
    for (var i = 0; i < (n || 26); i++) parts.push({ x: x, y: y, vx: (Math.random() - .5) * 7, vy: -Math.random() * 8 - 3, g: .28, r: Math.random() * 4 + 2.5, c: CONF[i % CONF.length], a: 1, rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .3 });
    if (!running) { running = true; requestAnimationFrame(tick); }
  }
  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.a > .02; });
    parts.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.a -= .012; p.rot += p.vr; ctx.save(); ctx.globalAlpha = p.a; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r * .6, p.r * 2, p.r * 1.2); ctx.restore(); });
    if (parts.length) requestAnimationFrame(tick); else running = false;
  }

  /* ---------- feedback ---------- */
  function xpFloat(x, y, txt, color, sub) {
    var e = el('div', 'xpfloat', esc(txt) + (sub ? '<small>' + esc(sub) + '</small>' : ''));
    e.style.left = (x - 20) + 'px'; e.style.top = (y - 30) + 'px'; e.style.color = color;
    document.body.appendChild(e); setTimeout(function () { e.remove(); }, 1500);
  }
  var toastQ = [], toastBusy = false;
  function toast(html, kind) {
    toastQ.push({ html: html, kind: kind || '' });
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    var t = toastQ.shift(); if (!t) { toastBusy = false; return; }
    toastBusy = true;
    var e = el('div', 'toast ' + t.kind, t.html); document.body.appendChild(e);
    setTimeout(function () { e.classList.add('bye'); setTimeout(function () { e.remove(); nextToast(); }, 380); }, 3200);
  }
  var FLAME = '<svg class="ico flame" style="width:18px;height:18px" viewBox="0 0 24 24"><path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.5.5-3 1.5-4.5C9 9 10 10 11 10c0-3 1-5.5 1-7z" fill="currentColor" stroke="none"/></svg>';
  var STAR  = '<svg class="ico" style="width:18px;height:18px" viewBox="0 0 24 24"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.2l5.9-.9z" fill="currentColor" stroke="none"/></svg>';
  function haptic(p) { if (navigator.vibrate) navigator.vibrate(p); }

  /* ---------- tema del espacio ---------- */
  function applySpaceTheme() {
    var t = DB.THEMES[S.space.colorTheme] || DB.THEMES.coral;
    var r = document.documentElement.style;
    r.setProperty('--title', t.title); r.setProperty('--title-soft', t.titleSoft);
    r.setProperty('--accent', t.accent); r.setProperty('--accent-edge', t.accentEdge); r.setProperty('--accent-soft', t.accentSoft);
    if (document.documentElement.dataset.theme === 'dark') {
      r.setProperty('--title-soft', hexA(t.title, .18)); r.setProperty('--accent-soft', hexA(t.accent, .26));
    }
    $('#spaceName').textContent = S.space.name || 'HQ';
    document.title = (S.space.name || 'HQ') + ' HQ — el cuartel del equipo';
  }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function applyTheme() {
    var t = S.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = t;
    applySpaceTheme();
  }

  /* ============================================================
     MODAL — una sola ventana reutilizable. Centrada en PC, sheet en movil.
     open({ title, body: HTMLElement|string, foot: [botones], onClose })
     ============================================================ */
  var modalState = { onClose: null, lastFocus: null };
  function openModal(o) {
    modalState.lastFocus = document.activeElement;
    modalState.onClose = o.onClose || null;
    $('#modalTitle').textContent = o.title || '';
    var body = $('#modalBody'); body.innerHTML = '';
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    var foot = $('#modalFoot'); foot.innerHTML = '';
    (o.foot || []).forEach(function (b) {
      if (b === 'spacer') { foot.appendChild(el('span', 'spacer')); return; }
      var btn = el('button', 'btn ' + (b.cls || ''), esc(b.label));
      btn.addEventListener('click', function () { var r = b.onClick ? b.onClick() : true; if (r !== false) closeModal(); });
      foot.appendChild(btn);
    });
    var ov = $('#modal'); ov.classList.add('on'); ov.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { var f = body.querySelector('input,textarea,select,button'); if (f) f.focus(); }, 60);
  }
  function closeModal() {
    var ov = $('#modal'); if (!ov.classList.contains('on')) return;
    ov.classList.remove('on'); ov.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (modalState.onClose) modalState.onClose();
    modalState.onClose = null;
    if (modalState.lastFocus && modalState.lastFocus.focus) modalState.lastFocus.focus();
  }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (ev) { if (ev.target === $('#modal')) closeModal(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeModal();
    if (ev.key === 'Tab' && $('#modal').classList.contains('on')) {
      var f = $$('#modal .dialog button, #modal .dialog input, #modal .dialog textarea, #modal .dialog select').filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { last.focus(); ev.preventDefault(); }
      else if (!ev.shiftKey && document.activeElement === last) { first.focus(); ev.preventDefault(); }
    }
  });
  /* helpers de formularios */
  function field(labelTxt, input) { var w = el('div'); var l = el('label', null, esc(labelTxt)); w.appendChild(l); w.appendChild(input); return w; }
  function inp(id, value, ph, type) { var i = document.createElement(type === 'textarea' ? 'textarea' : 'input'); if (type && type !== 'textarea') i.type = type; i.id = id; i.value = value == null ? '' : value; if (ph) i.placeholder = ph; return i; }
  function sel(id, options, value) { var s = document.createElement('select'); s.id = id; options.forEach(function (o) { var op = document.createElement('option'); op.value = o.v; op.textContent = o.t; s.appendChild(op); }); if (value != null) s.value = value; return s; }
  function swatchPicker(current, onPick) {
    var w = el('div', 'swatches');
    DB.PALETTE.forEach(function (c) {
      var b = el('button', 'sw' + (c === current ? ' on' : '')); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', c);
      b.addEventListener('click', function () { $$('.sw', w).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); w.dataset.value = c; if (onPick) onPick(c); });
      w.appendChild(b);
    });
    w.dataset.value = current || DB.PALETTE[0];
    return w;
  }

  /* ---------- navegacion ---------- */
  var VIEWS = ['manifiesto','tablero','hitos','base','equipo'];
  function show(view) {
    VIEWS.forEach(function (v) { $('#v-' + v).classList.remove('on'); });
    $('#v-' + view).classList.add('on');
    $$('.navitem').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    $('#fabAdd').classList.toggle('on', view === 'tablero');
    if (view === 'manifiesto') renderManifest();
    if (view === 'tablero') renderBoard();
    if (view === 'equipo') renderTeam();
    if (view === 'hitos') renderHitos();
    if (view === 'base') { renderLinks(); renderNotes(); }
    requestAnimationFrame(function () { $$('#v-' + view + ' .reveal').forEach(function (e, i) { setTimeout(function () { e.classList.add('in'); }, 70 * i); }); });
    try { history.replaceState(null, '', '#' + view); } catch (e) {}
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* ============================================================
     MANIFIESTO (editable)
     ============================================================ */
  function renderManifest() {
    var sp = S.space;
    $('#spaceTagline').textContent = sp.tagline || '';
    /* el titulo: la ultima oracion va en color */
    var t = sp.heroTitle || ''; var idx = t.lastIndexOf('. ');
    var h = $('#heroTitle');
    if (idx > 0) h.innerHTML = esc(t.slice(0, idx + 1)) + '<br><span class="hl">' + esc(t.slice(idx + 2)) + '</span>';
    else h.innerHTML = '<span class="hl">' + esc(t) + '</span>';
    $('#heroLead').textContent = sp.heroLead || '';
    $('#stTeamXp').textContent = DB.teamXP();
    $('#stStreak').textContent = DB.streak();
    var dc = doneCol();
    $('#stOpen').textContent = S.tasks.filter(function (x) { return !dc || x.col !== dc.id; }).length;
    $('#stDone').textContent = S.tasks.filter(function (x) { return dc && x.col === dc.id; }).length;

    var rl = $('#rulesList'); rl.innerHTML = '';
    (sp.rules || []).forEach(function (r) {
      var c = el('div', 'card rule reveal', '<h3>' + esc(r.t) + '</h3><p>' + esc(r.d) + '</p>');
      c.style.setProperty('--rc', r.c || 'var(--accent)'); rl.appendChild(c);
    });
    var ab = $('#aboutBody'); ab.innerHTML = '';
    (sp.about || '').split(/\n\s*\n/).forEach(function (par) { if (par.trim()) ab.appendChild(el('p', null, esc(par.trim()))); });
    var nl = $('#northList'); nl.innerHTML = '';
    (sp.northstar || []).forEach(function (n, i) {
      nl.appendChild(el('li', null, '<span class="num">0' + (i + 1) + '</span><div>' + esc(n.t) + '<span class="sub">' + esc(n.d || '') + '</span></div>'));
    });
    $$('#v-manifiesto .reveal').forEach(function (e) { e.classList.add('in'); });
  }

  function openManifestEditor() {
    var sp = S.space;
    var body = el('div');
    var tabs = el('div', 'tabs');
    var panes = {};
    [['texto','Textos'],['reglas','Reglas'],['norte','Estrella del norte']].forEach(function (p, i) {
      var b = el('button', i === 0 ? 'on' : '', esc(p[1])); b.type = 'button';
      b.addEventListener('click', function () { $$('button', tabs).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); Object.keys(panes).forEach(function (k) { panes[k].classList.toggle('on', k === p[0]); }); });
      tabs.appendChild(b); panes[p[0]] = el('div', 'tabpane' + (i === 0 ? ' on' : ''));
    });
    body.appendChild(tabs);
    /* textos */
    var pT = panes.texto;
    var fTitle = inp('mTitle', sp.heroTitle, 'Título grande', 'textarea'); fTitle.rows = 2;
    var fLead  = inp('mLead',  sp.heroLead,  'Párrafo de entrada', 'textarea'); fLead.rows = 3;
    var fAbout = inp('mAbout', sp.about,     'De qué trata (párrafos separados por línea en blanco)', 'textarea'); fAbout.rows = 6;
    pT.appendChild(field('Título (la última oración va en color)', fTitle));
    pT.appendChild(field('Entrada', fLead));
    pT.appendChild(field('De qué trata todo esto', fAbout));
    body.appendChild(pT);
    /* reglas */
    var pR = panes.reglas; var rules = JSON.parse(JSON.stringify(sp.rules || []));
    function drawRules() {
      pR.innerHTML = '';
      var list = el('div', 'editlist');
      rules.forEach(function (r, i) {
        var row = el('div', 'row');
        var dot = el('button', 'cdot'); dot.type = 'button'; dot.style.background = r.c || '#2e88aa'; dot.title = 'Cambiar color';
        dot.addEventListener('click', function () { var i2 = DB.PALETTE.indexOf(r.c); r.c = DB.PALETTE[(i2 + 1) % DB.PALETTE.length]; dot.style.background = r.c; });
        var wrap = el('div'); var it = inp('', r.t, 'Regla'); var id = inp('', r.d, 'Explicación'); id.style.marginTop = '6px';
        it.addEventListener('input', function () { r.t = it.value; }); id.addEventListener('input', function () { r.d = id.value; });
        wrap.appendChild(it); wrap.appendChild(id);
        var del = el('button', 'iconbtn small', '<svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'); del.type = 'button'; del.setAttribute('aria-label', 'Quitar');
        del.addEventListener('click', function () { rules.splice(i, 1); drawRules(); });
        row.appendChild(dot); row.appendChild(wrap); row.appendChild(del); list.appendChild(row);
      });
      pR.appendChild(list);
      var add = el('button', 'btn ghost sm', '+ Regla'); add.type = 'button'; add.style.marginTop = '12px';
      add.addEventListener('click', function () { rules.push({ t: '', d: '', c: DB.PALETTE[rules.length % DB.PALETTE.length] }); drawRules(); });
      pR.appendChild(add);
    }
    drawRules(); body.appendChild(pR);
    /* norte */
    var pN = panes.norte; var north = JSON.parse(JSON.stringify(sp.northstar || []));
    function drawNorth() {
      pN.innerHTML = '';
      var list = el('div', 'editlist');
      north.forEach(function (n, i) {
        var row = el('div', 'row');
        var num = el('span', 'cdot static'); num.style.background = 'var(--title)'; num.style.color = '#fdfbf7'; num.style.display = 'grid'; num.style.placeItems = 'center'; num.style.fontWeight = '700'; num.style.fontSize = '12px'; num.textContent = i + 1;
        var wrap = el('div'); var it = inp('', n.t, 'Meta'); var id = inp('', n.d, 'Detalle corto'); id.style.marginTop = '6px';
        it.addEventListener('input', function () { n.t = it.value; }); id.addEventListener('input', function () { n.d = id.value; });
        wrap.appendChild(it); wrap.appendChild(id);
        var del = el('button', 'iconbtn small', '<svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'); del.type = 'button'; del.setAttribute('aria-label', 'Quitar');
        del.addEventListener('click', function () { north.splice(i, 1); drawNorth(); });
        row.appendChild(num); row.appendChild(wrap); row.appendChild(del); list.appendChild(row);
      });
      pN.appendChild(list);
      var add = el('button', 'btn ghost sm', '+ Meta'); add.type = 'button'; add.style.marginTop = '12px';
      add.addEventListener('click', function () { north.push({ t: '', d: '' }); drawNorth(); });
      pN.appendChild(add);
    }
    drawNorth(); body.appendChild(pN);

    openModal({
      title: 'Editar el manifiesto', body: body,
      foot: [
        { label: 'Guardar', onClick: function () {
          DB.updateSpace({ heroTitle: fTitle.value.trim(), heroLead: fLead.value.trim(), about: fAbout.value.trim(),
            rules: rules.filter(function (r) { return r.t.trim(); }), northstar: north.filter(function (n) { return n.t.trim(); }) })
            .then(function () { renderManifest(); toast('Manifiesto guardado'); });
        } },
        { label: 'Cancelar', cls: 'ghost' }
      ]
    });
  }

  /* ============================================================
     TABLERO
     ============================================================ */
  var filterWho = null;

  function renderChips() {
    var host = $('#memberChips'); host.innerHTML = '';
    var all = el('button', 'chip all' + (filterWho === null ? ' on' : ''), '<span class="dotav"></span>Todos');
    all.addEventListener('click', function () { filterWho = null; renderBoard(); });
    host.appendChild(all);
    S.members.forEach(function (m) {
      var b = el('button', 'chip' + (filterWho === m.id ? ' on' : ''), '<span class="dotav">' + rockieSVG(m.c, 24) + '</span>' + esc(m.name));
      b.addEventListener('click', function () { filterWho = (filterWho === m.id ? null : m.id); renderBoard(); });
      host.appendChild(b);
    });
  }

  function taskCard(t) {
    var m = memberById(t.who), area = areaById(t.area), dc = doneCol();
    var isDone = dc && t.col === dc.id;
    var card = el('article', 'task' + (t.prio === 'urgente' && !isDone ? ' urgent' : '') + (isDone ? ' done-card' : ''));
    card.style.setProperty('--area-c', area.c); card.dataset.id = t.id;
    var late = t.due && !isDone && t.due < DB.today();
    var html = '';
    if (isDone && t.mode) html += '<span class="stamp ' + (t.mode === 'proof' ? 'photo' : 'plain') + '"><svg class="ico" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>';
    html += '<span class="areatag">' + esc(area.name) + '</span><div class="ttl">' + esc(t.t) + '</div><div class="meta">';
    if (m) html += '<span class="whodot" title="' + esc(m.name) + '">' + rockieSVG(m.c, 22) + '</span><span>' + esc(m.name) + '</span>';
    if (t.due) html += '<span class="due' + (late ? ' late' : '') + '">' + fmtDate(t.due) + (late ? ' · se pasó' : '') + '</span>';
    html += '</div><div class="actions">';
    var col = colById(t.col);
    var openCols = S.columns.filter(function (c) { return c.kind === 'open'; });
    if (!isDone) {
      var idx = openCols.findIndex(function (c) { return c.id === t.col; });
      if (idx >= 0 && idx < openCols.length - 1) html += '<button class="mini go" data-act="next" data-to="' + openCols[idx + 1].id + '">' + esc(openCols[idx + 1].name) + ' →</button>';
      html += '<button class="mini proof" data-act="validate">Validar</button>';
      if (idx > 0) html += '<button class="mini plain" data-act="next" data-to="' + openCols[idx - 1].id + '">← ' + esc(openCols[idx - 1].name) + '</button>';
    } else {
      html += '<button class="mini plain" data-act="reopen">Reabrir</button>';
    }
    html += '<button class="mini dots" data-act="edit">Editar</button></div>';
    card.innerHTML = html;

    card.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      ev.stopPropagation();
      var act = b.dataset.act;
      if (act === 'edit') return openTaskEditor(t.id);
      if (act === 'validate') return openProof(t.id, ev);
      if (act === 'next') return DB.moveTask(t.id, b.dataset.to, 0).then(renderBoard);
      if (act === 'reopen') { var first = openCols[openCols.length - 1] || openCols[0]; return DB.moveTask(t.id, first.id, 0).then(renderBoard); }
    });
    attachDrag(card, t);
    return card;
  }

  function renderBoard() {
    renderChips();
    var board = $('#board'); board.innerHTML = '';
    S.columns.forEach(function (c) {
      var col = el('div', 'col'); col.dataset.col = c.id;
      col.innerHTML = '<div class="colhead"><span class="cdot" style="background:' + esc(c.c) + '"></span><span class="cname">' + esc(c.name) + '</span><span class="ccount" id="c-' + esc(c.id) + '">0</span>' +
        '<button class="colmenu" data-act="colmenu" aria-label="Opciones de columna"><svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></button></div>' +
        '<div class="tasks" id="list-' + esc(c.id) + '"></div>';
      col.querySelector('[data-act="colmenu"]').addEventListener('click', function () { openColumnEditor(c.id); });
      board.appendChild(col);
      var host = $('#list-' + c.id);
      var items = S.tasks.filter(function (t) { return t.col === c.id && (!filterWho || t.who === filterWho); }).sort(function (a, b) { return a.order - b.order; });
      items.forEach(function (t) { host.appendChild(taskCard(t)); });
      $('#c-' + c.id).textContent = items.length;
    });
    var add = el('div', 'col addcol'); var ab = el('button', null, '+ Columna'); ab.addEventListener('click', function () { openColumnEditor(null); }); add.appendChild(ab); board.appendChild(add);
  }

  /* ---------- drag & drop por puntero (mouse + tactil unificados) ---------- */
  var drag = null;
  function attachDrag(card, t) {
    var pressTimer = null, startX = 0, startY = 0, moved = false, longPressed = false;
    card.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      if (ev.target.closest('button')) return;
      startX = ev.clientX; startY = ev.clientY; moved = false; longPressed = false;
      var pid = ev.pointerId;
      /* en tactil el arrastre arranca tras mantener; con mouse arranca al mover */
      var isTouch = ev.pointerType !== 'mouse';
      pressTimer = setTimeout(function () {
        if (moved) return;
        longPressed = true;
        if (isTouch) { beginDrag(card, t, ev.clientX, ev.clientY, pid); haptic(10); }
        else { card.classList.add('squeeze'); haptic(10); setTimeout(function () { card.classList.remove('squeeze'); openTaskEditor(t.id); }, 320); }
      }, isTouch ? 260 : 520);
      var onMove = function (e) {
        var dx = e.clientX - startX, dy = e.clientY - startY;
        if (!drag && !moved && Math.hypot(dx, dy) > 6) {
          moved = true; clearTimeout(pressTimer);
          if (!isTouch) beginDrag(card, t, e.clientX, e.clientY, pid);
        }
        if (drag && drag.pid === pid) { e.preventDefault(); moveDrag(e.clientX, e.clientY); }
      };
      var onUp = function (e) {
        clearTimeout(pressTimer);
        card.removeEventListener('pointermove', onMove); card.removeEventListener('pointerup', onUp); card.removeEventListener('pointercancel', onUp);
        if (drag && drag.pid === pid) endDrag(e.clientX, e.clientY);
      };
      card.addEventListener('pointermove', onMove); card.addEventListener('pointerup', onUp); card.addEventListener('pointercancel', onUp);
      try { card.setPointerCapture(pid); } catch (e) {}
    });
    /* en tactil, si empieza como scroll vertical, cancelamos el timer */
    card.addEventListener('touchmove', function () { if (!drag) clearTimeout(pressTimer); }, { passive: true });
  }
  function beginDrag(card, t, x, y, pid) {
    var r = card.getBoundingClientRect();
    var ghost = card.cloneNode(true); ghost.className = 'task ghost'; ghost.style.width = r.width + 'px'; ghost.style.setProperty('--area-c', card.style.getPropertyValue('--area-c'));
    $('#dragLayer').appendChild(ghost);
    var ph = el('div', 'placeholder'); ph.style.height = r.height + 'px';
    card.parentNode.insertBefore(ph, card);
    card.classList.add('lifted');
    drag = { card: card, task: t, ghost: ghost, ph: ph, offX: x - r.left, offY: y - r.top, pid: pid, fromCol: t.col, lastCol: null, w: r.width, h: r.height };
    document.body.classList.add('dragging-active');
    moveDrag(x, y);
  }
  function moveDrag(x, y) {
    if (!drag) return;
    drag.ghost.style.transform = 'translate(' + (x - drag.offX) + 'px,' + (y - drag.offY) + 'px)';
    /* que columna hay debajo */
    drag.ghost.style.pointerEvents = 'none';
    var under = document.elementFromPoint(x, y);
    var col = under ? under.closest('.col:not(.addcol)') : null;
    $$('.col.dragover').forEach(function (c) { if (c !== col) c.classList.remove('dragover'); });
    if (!col) return;
    col.classList.add('dragover');
    var list = col.querySelector('.tasks');
    /* posicion dentro de la columna: antes de la primera tarjeta cuyo centro este por debajo del cursor */
    var cards = $$('.task:not(.lifted)', list);
    var before = null;
    for (var i = 0; i < cards.length; i++) { var cr = cards[i].getBoundingClientRect(); if (y < cr.top + cr.height / 2) { before = cards[i]; break; } }
    if (before) { if (drag.ph.nextSibling !== before || drag.ph.parentNode !== list) list.insertBefore(drag.ph, before); }
    else if (drag.ph.parentNode !== list || drag.ph.nextSibling) list.appendChild(drag.ph);
    /* auto-scroll horizontal del tablero cerca de los bordes */
    var sc = $('.boardscroll'); var sr = sc.getBoundingClientRect();
    if (x > sr.right - 48) sc.scrollLeft += 12; else if (x < sr.left + 48) sc.scrollLeft -= 12;
    var vy = innerHeight; if (y > vy - 80) window.scrollBy(0, 10); else if (y < 90) window.scrollBy(0, -10);
  }
  function endDrag(x, y) {
    if (!drag) return;
    var d = drag; drag = null;
    document.body.classList.remove('dragging-active');
    $$('.col.dragover').forEach(function (c) { c.classList.remove('dragover'); });
    /* destino e indice se leen AHORA, antes de animar: cualquier repintado
       posterior del tablero podria mover el placeholder. */
    var list = d.ph.parentNode;
    var col = list ? list.closest('.col') : null;
    var toCol = col ? col.dataset.col : d.fromCol;
    var index = 0; var n = d.ph.previousSibling;
    while (n) { if (n.classList && n.classList.contains('task') && !n.classList.contains('lifted')) index++; n = n.previousSibling; }
    /* si la soltamos sobre su propia posicion original, no hay nada que mover */
    var pr = d.ph.getBoundingClientRect();
    d.ghost.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1), opacity .22s';
    d.ghost.style.rotate = '0deg'; d.ghost.style.scale = '1';
    d.ghost.style.transform = 'translate(' + pr.left + 'px,' + pr.top + 'px)';
    var target = colById(toCol);
    var finish = function () {
      d.ghost.remove(); if (d.ph.parentNode) d.ph.remove(); d.card.classList.remove('lifted');
      if (target && target.kind === 'done' && d.fromCol !== toCol) { openProof(d.task.id, { clientX: x, clientY: y }); renderBoard(); return; }
      DB.moveTask(d.task.id, toCol, index).then(renderBoard);
      if (d.fromCol !== toCol) haptic(8);
    };
    if (reduceMotion) finish(); else setTimeout(finish, 220);
  }

  /* ---------- editor de tarea ---------- */
  function openTaskEditor(id) {
    var t = id ? S.tasks.filter(function (x) { return x.id === id; })[0] : null;
    var body = el('div');
    var fT = inp('fTitle', t ? t.t : '', 'Ej: imprimir la carcasa v2');
    body.appendChild(field('Qué hay que hacer', fT));
    var row = el('div', 'formrow');
    var fA = sel('fArea', S.areas.map(function (a) { return { v: a.id, t: a.name }; }), t ? t.area : S.areas[0].id);
    var fW = sel('fWho', S.members.map(function (m) { return { v: m.id, t: m.name }; }), t ? t.who : (S.who || S.members[0].id));
    var fD = inp('fDue', t && t.due ? t.due : '', '', 'date');
    var fP = sel('fPrio', [{ v: 'normal', t: 'Normal' }, { v: 'urgente', t: 'Urgente (coral)' }], t ? t.prio : 'normal');
    var fC = sel('fCol', S.columns.map(function (c) { return { v: c.id, t: c.name }; }), t ? t.col : S.columns[0].id);
    row.appendChild(field('Área', fA)); row.appendChild(field('Responsable', fW));
    row.appendChild(field('Fecha límite', fD)); row.appendChild(field('Prioridad', fP));
    body.appendChild(row);
    body.appendChild(field('Columna', fC));
    var fN = inp('fNote', t ? (t.note || '') : '', 'Un link al build, la foto, el doc…', 'textarea'); fN.rows = 2;
    body.appendChild(field('Nota / prueba', fN));
    var foot = [
      { label: t ? 'Guardar' : 'Crear tarea', onClick: function () {
        var title = fT.value.trim(); if (!title) { fT.focus(); return false; }
        var patch = { t: title, area: fA.value, who: fW.value, due: fD.value, prio: fP.value, note: fN.value };
        var op = t ? DB.updateTask(t.id, patch).then(function () { if (fC.value !== t.col) return DB.moveTask(t.id, fC.value, 0); })
                   : DB.addTask(Object.assign({ col: fC.value, mode: null }, patch));
        op.then(function () { renderBoard(); toast(t ? 'Tarea guardada' : 'Tarea creada'); });
      } },
      { label: 'Cancelar', cls: 'ghost' }
    ];
    if (t) { foot.push('spacer'); foot.push({ label: 'Eliminar', cls: 'danger', onClick: function () { if (!confirm('¿Eliminar "' + t.t + '"?')) return false; DB.removeTask(t.id).then(renderBoard); } }); }
    openModal({ title: t ? 'Editar tarea' : 'Nueva tarea', body: body, foot: foot });
    fT.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('#modalFoot .btn').click(); } });
  }

  /* ---------- editor de columna ---------- */
  function openColumnEditor(id) {
    var c = id ? colById(id) : null;
    var body = el('div');
    var fN = inp('cName', c ? c.name : '', 'Ej: En revisión'); body.appendChild(field('Nombre', fN));
    var lab = el('label', null, 'Color'); body.appendChild(lab);
    var sw = swatchPicker(c ? c.c : DB.PALETTE[6]); body.appendChild(sw);
    if (c && c.kind === 'done') body.appendChild(el('p', 'hint', 'Esta es la columna de cierre: aquí caen las tareas validadas. Se puede renombrar, no borrar.')).style.marginTop = '14px';
    var foot = [
      { label: c ? 'Guardar' : 'Crear columna', onClick: function () {
        var name = fN.value.trim(); if (!name) { fN.focus(); return false; }
        var op = c ? DB.updateColumn(c.id, { name: name, c: sw.dataset.value }) : DB.addColumn({ name: name, c: sw.dataset.value, kind: 'open' });
        op.then(renderBoard);
      } },
      { label: 'Cancelar', cls: 'ghost' }
    ];
    if (c && c.kind !== 'done') { foot.push('spacer'); foot.push({ label: 'Eliminar', cls: 'danger', onClick: function () {
      var n = S.tasks.filter(function (t) { return t.col === c.id; }).length;
      if (!confirm('¿Eliminar la columna "' + c.name + '"?' + (n ? ' Sus ' + n + ' tareas pasan a la primera columna.' : ''))) return false;
      DB.removeColumn(c.id).then(renderBoard);
    } }); }
    openModal({ title: c ? 'Editar columna' : 'Nueva columna', body: body, foot: foot });
  }

  /* ---------- validar ---------- */
  function openProof(id, ev) {
    var t = S.tasks.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var pt = ev && ev.clientX ? { x: ev.clientX, y: ev.clientY } : { x: innerWidth / 2, y: innerHeight / 2 };
    var owner = t.who || S.who;
    var firstToday = !S.log.some(function (l) { return l.date === DB.today() && l.who === owner; });
    var body = el('div');
    body.appendChild(el('p', 'proofmeta', esc(t.t)));
    var fP = inp('fProof', t.note || '', 'Pega aquí la evidencia (link a foto, build, doc)…', 'textarea'); fP.rows = 3;
    body.appendChild(field('Prueba (opcional para "lo hice")', fP));
    if (firstToday) body.appendChild(el('div', 'bonusnote', STAR + ' Primera validación del día de ' + esc((memberById(owner) || {}).name || 'este miembro') + ': vale doble'));
    function go(mode) {
      var proof = fP.value.trim();
      DB.validateTask(id, mode, proof).then(function (res) {
        renderBoard();
        var color = mode === 'proof' ? '#4a7c3f' : '#8aa54a';
        xpFloat(pt.x, pt.y, '+' + res.pts + ' XP', color, res.bonus ? '×2 primera del día' : '');
        burst(pt.x, pt.y, mode === 'proof' ? 34 : 18); haptic([12, 40, 12]); celebrateRockie();
        var st = DB.streak();
        var firstOfDay = S.log.filter(function (l) { return l.date === DB.today(); }).length === 1;
        if (firstOfDay) toast(FLAME + 'Racha del equipo: ' + st + (st === 1 ? ' día' : ' días'));
        else toast('Validado · +' + res.pts + ' XP');
        if (res.leveledUp) { var m = memberById(res.owner); toast(STAR + esc(m ? m.name : '') + ' sube a nivel ' + res.level + ' · ' + esc(DB.rankOf(res.level)), 'level'); burst(innerWidth / 2, innerHeight / 3, 40); }
        res.achievements.forEach(function (a) { toast('Logro: ' + esc(a.name), 'ach'); });
      });
    }
    openModal({ title: '¿Cómo lo validamos?', body: body, foot: [
      { label: 'Con prueba · +' + (firstToday ? 200 : 100) + ' XP', cls: 'gphoto', onClick: function () { go('proof'); } },
      { label: 'Lo hice · +' + (firstToday ? 80 : 40) + ' XP', cls: 'olive', onClick: function () { go('plain'); } },
      { label: 'Cancelar', cls: 'ghost' }
    ] });
  }

  /* ============================================================
     HITOS — tres vistas
     ============================================================ */
  var hitoView = 'lista';
  function renderHitos() {
    var host = $('#hitosHost'); host.innerHTML = '';
    var hs = S.hitos.slice().sort(function (a, b) { return (a.date || '9') < (b.date || '9') ? -1 : 1; });
    if (hitoView === 'lista') {
      var wrap = el('div', 'hitos');
      hs.forEach(function (h, i) {
        var e = el('article', 'card hito reveal in');
        e.style.setProperty('--hc', h.c || 'var(--berry)');
        e.innerHTML = '<div class="hnum">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</div><div><h3>' + esc(h.t) + '</h3><p class="hdesc">' + esc(h.d || '') + '</p>' +
          '<div class="hbar"><div class="fill" style="width:' + h.pct + '%"></div></div>' +
          '<div class="hctrl"><button data-d="-5" aria-label="Bajar 5">−5</button><input type="range" min="0" max="100" step="5" value="' + h.pct + '" aria-label="Progreso"><button data-d="5" aria-label="Subir 5">+5</button>' +
          '<span class="hdate">objetivo: ' + esc(fmtDate(h.date) || h.date || '—') + '</span><button data-act="edit" class="mini" style="margin-left:auto;padding:4px 12px;font-size:12px">Editar</button></div></div>' +
          '<div class="hpct">' + h.pct + '%</div>';
        var setPct = function (v) { DB.updateHito(h.id, { pct: v }).then(function (res) {
          $('.fill', e).style.width = res.hito.pct + '%'; $('.hpct', e).textContent = res.hito.pct + '%'; $('input', e).value = res.hito.pct;
          if (res.hito.pct === 100 && v >= 100) { var r = e.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + 40, 40); toast('Hito cumplido: ' + esc(res.hito.t), 'level'); }
          res.achievements.forEach(function (a) { toast('Logro: ' + esc(a.name), 'ach'); });
        }); };
        e.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; if (b.dataset.act === 'edit') return openHitoEditor(h.id); setPct(h.pct + parseInt(b.dataset.d, 10)); });
        $('input', e).addEventListener('change', function (ev) { setPct(parseInt(ev.target.value, 10)); });
        $('input', e).addEventListener('input', function (ev) { $('.fill', e).style.width = ev.target.value + '%'; $('.hpct', e).textContent = ev.target.value + '%'; });
        wrap.appendChild(e);
      });
      host.appendChild(wrap);
    } else if (hitoView === 'linea') {
      var dated = hs.filter(function (h) { return /^\d{4}-\d{2}-\d{2}$/.test(h.date || ''); });
      if (dated.length < 1) { host.appendChild(el('p', 'hint', 'La línea de tiempo necesita hitos con fecha (AAAA-MM-DD).')); return; }
      var min = dated[0].date, max = dated[dated.length - 1].date, today = DB.today();
      if (today < min) min = today; if (today > max) max = today;
      var span = Math.max(1, daysBetween(min, max));
      var pad = Math.max(3, Math.round(span * .06)); span += pad * 2;
      var pos = function (d) { return ((daysBetween(min, d) + pad) / span) * 100; };
      var tl = el('div', 'timeline');
      var axis = el('div', 'axis');
      var tm = el('div', 'todaymark'); tm.style.left = pos(today) + '%'; axis.appendChild(tm);
      var labels = el('div', 'tlabels');
      dated.forEach(function (h) {
        var node = el('div', 'tnode' + (h.pct >= 100 ? ' full' : '')); node.style.left = pos(h.date) + '%'; node.style.setProperty('--hc', h.c); node.title = h.t; node.setAttribute('role', 'button'); node.tabIndex = 0;
        node.addEventListener('click', function () { openHitoEditor(h.id); }); axis.appendChild(node);
        var lab = el('div', 'tlab'); lab.style.left = pos(h.date) + '%'; lab.style.setProperty('--hc', h.c);
        lab.innerHTML = '<span class="tp">' + h.pct + '%</span><b>' + esc(h.t) + '</b>' + esc(fmtDate(h.date)); labels.appendChild(lab);
      });
      tl.appendChild(axis); tl.appendChild(labels); host.appendChild(tl);
    } else {
      var grid = el('div', 'ringmap');
      hs.forEach(function (h) {
        var r = 40, c = 2 * Math.PI * r, off = c * (1 - h.pct / 100);
        var e = el('article', 'card ring reveal in');
        e.innerHTML = '<svg width="110" height="110" viewBox="0 0 100 100"><circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--paper-dark)" stroke-width="10"/>' +
          '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + esc(h.c) + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" transform="rotate(-90 50 50)" style="transition:stroke-dashoffset .8s cubic-bezier(.32,.72,0,1)"/>' +
          '<text x="50" y="56" text-anchor="middle" font-family="Fraunces,Georgia,serif" font-weight="700" font-size="22" fill="' + esc(h.c) + '">' + h.pct + '%</text></svg>' +
          '<h3>' + esc(h.t) + '</h3><div class="rd">' + esc(fmtDate(h.date) || h.date || '') + '</div>';
        e.addEventListener('click', function () { openHitoEditor(h.id); }); grid.appendChild(e);
      });
      host.appendChild(grid);
    }
  }
  $$('#hitoViews button').forEach(function (b) { b.addEventListener('click', function () { hitoView = b.dataset.hv; $$('#hitoViews button').forEach(function (x) { x.classList.toggle('on', x === b); }); renderHitos(); }); });

  function openHitoEditor(id) {
    var h = id ? S.hitos.filter(function (x) { return x.id === id; })[0] : null;
    var body = el('div');
    var fT = inp('hT', h ? h.t : '', 'Ej: Lanzamiento beta'); body.appendChild(field('Nombre del hito', fT));
    var fD = inp('hD', h ? h.d : '', 'Qué significa haberlo cumplido', 'textarea'); fD.rows = 2; body.appendChild(field('Descripción', fD));
    var row = el('div', 'formrow');
    var fDate = inp('hDate', h && /^\d{4}-\d{2}-\d{2}$/.test(h.date) ? h.date : '', '', 'date'); row.appendChild(field('Fecha objetivo', fDate));
    var fP = inp('hP', h ? h.pct : 0, '', 'number'); fP.min = 0; fP.max = 100; fP.step = 5; row.appendChild(field('Progreso (%)', fP));
    body.appendChild(row);
    body.appendChild(el('label', null, 'Color')); var sw = swatchPicker(h ? h.c : DB.PALETTE[S.hitos.length % DB.PALETTE.length]); body.appendChild(sw);
    var foot = [
      { label: h ? 'Guardar' : 'Crear hito', onClick: function () {
        var t = fT.value.trim(); if (!t) { fT.focus(); return false; }
        var patch = { t: t, d: fD.value.trim(), date: fDate.value, pct: parseInt(fP.value, 10) || 0, c: sw.dataset.value };
        (h ? DB.updateHito(h.id, patch) : DB.addHito(patch)).then(function () { renderHitos(); toast(h ? 'Hito guardado' : 'Hito creado'); });
      } },
      { label: 'Cancelar', cls: 'ghost' }
    ];
    if (h) { foot.push('spacer'); foot.push({ label: 'Eliminar', cls: 'danger', onClick: function () { if (!confirm('¿Eliminar el hito "' + h.t + '"?')) return false; DB.removeHito(h.id).then(renderHitos); } }); }
    openModal({ title: h ? 'Editar hito' : 'Nuevo hito', body: body, foot: foot });
  }

  /* ============================================================
     EQUIPO + LOGROS
     ============================================================ */
  function renderTeam() {
    var host = $('#teamList'); host.innerHTML = '';
    var ranked = S.members.slice().sort(function (a, b) { return (S.xp[b.id] || 0) - (S.xp[a.id] || 0); });
    var medals = {}; ranked.forEach(function (m, i) { if ((S.xp[m.id] || 0) > 0 && i < 3) medals[m.id] = ['g','s','b'][i]; });
    S.members.forEach(function (m) {
      var xp = S.xp[m.id] || 0, lv = DB.levelOf(xp), cur = DB.xpForLevel(lv), next = DB.xpForLevel(lv + 1);
      var pct = Math.round(((xp - cur) / (next - cur)) * 100);
      var e = el('article', 'card member reveal in');
      e.innerHTML = (medals[m.id] ? '<span class="medal ' + medals[m.id] + '">' + (['g','s','b'].indexOf(medals[m.id]) + 1) + '</span>' : '') +
        '<div style="display:grid;place-items:center">' + rockieSVG(m.c, 64, { sleepy: isNight() }) + '</div>' +
        '<h3>' + esc(m.name) + (S.who === m.id ? ' · tú' : '') + '</h3><div class="mrole">' + esc(m.role || '') + '</div><p class="job">' + esc(m.job || '') + '</p>' +
        '<div class="xp">' + xp + ' <small>XP</small></div><span class="lvlpill">Nivel ' + lv + ' · ' + esc(DB.rankOf(lv)) + '</span>' +
        '<div class="lvlbar"><i style="width:' + pct + '%"></i></div><div class="next">' + (next - xp) + ' XP para nivel ' + (lv + 1) + '</div>';
      e.addEventListener('click', function () { openMemberEditor(m.id); });
      host.appendChild(e);
    });
    var al = $('#achList'); al.innerHTML = '';
    DB.ACHIEVEMENTS.forEach(function (a) {
      var on = S.unlocked.indexOf(a.id) >= 0;
      al.appendChild(el('div', 'card ach' + (on ? ' on' : ''), '<span class="aic">' + STAR + '</span><div><h3>' + esc(a.name) + '</h3><p>' + esc(a.desc) + '</p></div>'));
    });
    $('#achCount').textContent = S.unlocked.length + ' de ' + DB.ACHIEVEMENTS.length;
  }
  function openMemberEditor(id) {
    var m = id ? memberById(id) : null;
    var body = el('div');
    var fN = inp('mN', m ? m.name : '', 'Nombre'); body.appendChild(field('Nombre', fN));
    var fR = inp('mR', m ? m.role : '', 'Ej: Diseño · producto'); body.appendChild(field('Rol', fR));
    var fJ = inp('mJ', m ? m.job : '', 'Su único trabajo, en una frase'); body.appendChild(field('Su único trabajo', fJ));
    body.appendChild(el('label', null, 'Color de su Rockie'));
    var preview = el('div'); preview.style.textAlign = 'center'; preview.style.margin = '6px 0 10px'; preview.innerHTML = rockieSVG(m ? m.c : DB.PALETTE[S.members.length % DB.PALETTE.length], 64);
    body.appendChild(preview);
    var sw = swatchPicker(m ? m.c : DB.PALETTE[S.members.length % DB.PALETTE.length], function (c) { preview.innerHTML = rockieSVG(c, 64); }); body.appendChild(sw);
    var foot = [
      { label: m ? 'Guardar' : 'Añadir', onClick: function () {
        var name = fN.value.trim(); if (!name) { fN.focus(); return false; }
        var patch = { name: name, role: fR.value.trim(), job: fJ.value.trim(), c: sw.dataset.value };
        (m ? DB.updateMember(m.id, patch) : DB.addMember(patch)).then(function () { renderTeam(); renderBoard(); });
      } },
      { label: 'Cancelar', cls: 'ghost' }
    ];
    if (m) { foot.push('spacer'); foot.push({ label: 'Quitar', cls: 'danger', onClick: function () { if (!confirm('¿Quitar a ' + m.name + ' del espacio? Sus tareas pasan al primer miembro.')) return false; DB.removeMember(m.id).then(function () { renderTeam(); renderBoard(); }).catch(function (e) { alert(e.message); }); } }); }
    openModal({ title: m ? 'Editar miembro' : 'Nuevo miembro', body: body, foot: foot });
  }

  /* ============================================================
     BASE: links + apartados
     ============================================================ */
  function renderLinks() {
    var host = $('#linksList'); host.innerHTML = '';
    (S.space.links || []).forEach(function (l, i) {
      var li = el('li');
      li.innerHTML = '<a href="' + esc(l.url) + '" target="_blank" rel="noopener"><span class="ric" style="background:' + esc(l.c || '#4a6fa5') + '"><svg class="ico" viewBox="0 0 24 24"><path d="M10 14a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-.5.5"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-4 4a3.5 3.5 0 0 0 5 5l.5-.5"/></svg></span><span class="ltxt">' + esc(l.t) + '<span class="sub">' + esc(l.d || '') + '</span></span></a>' +
        '<button class="iconbtn small" data-act="edit" aria-label="Editar link"><svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4z"/></svg></button>';
      li.querySelector('[data-act="edit"]').addEventListener('click', function () { openLinkEditor(i); });
      host.appendChild(li);
    });
  }
  function openLinkEditor(i) {
    var links = S.space.links || []; var l = i != null ? links[i] : null;
    var body = el('div');
    var fT = inp('lT', l ? l.t : '', 'Nombre'); body.appendChild(field('Nombre', fT));
    var fD = inp('lD', l ? l.d : '', 'Descripción corta'); body.appendChild(field('Descripción', fD));
    var fU = inp('lU', l ? l.url : '', 'https://…', 'url'); body.appendChild(field('URL', fU));
    body.appendChild(el('label', null, 'Color')); var sw = swatchPicker(l ? l.c : DB.PALETTE[links.length % DB.PALETTE.length]); body.appendChild(sw);
    var foot = [
      { label: l ? 'Guardar' : 'Añadir', onClick: function () {
        var t = fT.value.trim(), u = fU.value.trim(); if (!t || !u) { (t ? fU : fT).focus(); return false; }
        var next = links.slice(); var item = { t: t, d: fD.value.trim(), url: u, c: sw.dataset.value };
        if (l) next[i] = item; else next.push(item);
        DB.updateSpace({ links: next }).then(renderLinks);
      } },
      { label: 'Cancelar', cls: 'ghost' }
    ];
    if (l) { foot.push('spacer'); foot.push({ label: 'Quitar', cls: 'danger', onClick: function () { var next = links.slice(); next.splice(i, 1); DB.updateSpace({ links: next }).then(renderLinks); } }); }
    openModal({ title: l ? 'Editar link' : 'Nuevo link', body: body, foot: foot });
  }
  var NOTE_COLORS = ['#659ca5','#eaa545','#b4637a','#8aa54a','#a573a5','#bd6c56','#4a6fa5','#b97084'];
  function renderNotes() {
    var host = $('#notesList'); host.innerHTML = '';
    S.notes.forEach(function (n) {
      var e = el('div', 'note');
      e.innerHTML = '<div class="nhead" style="--note-c:' + esc(n.c) + '"><input value="' + esc(n.t) + '" aria-label="Título del apartado">' +
        '<button class="iconbtn small" data-act="color" aria-label="Cambiar color"><svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg></button>' +
        '<button class="iconbtn small" data-act="del" aria-label="Eliminar apartado"><svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></svg></button></div>' +
        '<textarea aria-label="Contenido del apartado">' + esc(n.body) + '</textarea>';
      $('input', e).addEventListener('input', function (ev) { DB.updateNote(n.id, { t: ev.target.value }); });
      $('textarea', e).addEventListener('input', function (ev) { DB.updateNote(n.id, { body: ev.target.value }); });
      e.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.act === 'del') { if (confirm('¿Eliminar el apartado "' + n.t + '"?')) DB.removeNote(n.id).then(renderNotes); }
        else { var i = NOTE_COLORS.indexOf(n.c); DB.updateNote(n.id, { c: NOTE_COLORS[(i + 1) % NOTE_COLORS.length] }).then(renderNotes); }
      });
      host.appendChild(e);
    });
  }

  /* ============================================================
     AJUSTES DEL ESPACIO
     ============================================================ */
  function openSettings() {
    var sp = S.space; var body = el('div');
    var tabs = el('div', 'tabs'); var panes = {};
    [['gen','Espacio'],['areas','Áreas'],['datos','Datos']].forEach(function (p, i) {
      var b = el('button', i === 0 ? 'on' : '', esc(p[1])); b.type = 'button';
      b.addEventListener('click', function () { $$('button', tabs).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); Object.keys(panes).forEach(function (k) { panes[k].classList.toggle('on', k === p[0]); }); });
      tabs.appendChild(b); panes[p[0]] = el('div', 'tabpane' + (i === 0 ? ' on' : ''));
    });
    body.appendChild(tabs);
    /* general */
    var pG = panes.gen;
    var fN = inp('sN', sp.name, 'Nombre del equipo, empresa o curso'); pG.appendChild(field('Nombre del espacio', fN));
    var fT = inp('sT', sp.tagline, 'Una frase que los describa'); pG.appendChild(field('Lema', fT));
    pG.appendChild(el('label', null, 'Tema de color'));
    var tp = el('div', 'themepick'); var chosen = sp.colorTheme;
    Object.keys(DB.THEMES).forEach(function (k) {
      var t = DB.THEMES[k]; var b = el('button', k === chosen ? 'on' : '', '<span class="tp"><i style="background:' + t.title + '"></i><i style="background:' + t.accent + '"></i></span>' + esc(t.name)); b.type = 'button';
      b.addEventListener('click', function () { chosen = k; $$('button', tp).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); });
      tp.appendChild(b);
    });
    pG.appendChild(tp); body.appendChild(pG);
    /* areas */
    var pA = panes.areas; var areas = JSON.parse(JSON.stringify(S.areas));
    pA.appendChild(el('p', 'hint', 'Las áreas son las franjas de color de cada tarjeta. Úsalas como categorías de tu equipo: cursos, departamentos, frentes de trabajo…'));
    function drawAreas() {
      var old = $('.editlist', pA); if (old) old.remove(); var oldb = $('.btn', pA); if (oldb) oldb.remove();
      var list = el('div', 'editlist');
      areas.forEach(function (a, i) {
        var row = el('div', 'row');
        var dot = el('button', 'cdot'); dot.type = 'button'; dot.style.background = a.c; dot.title = 'Cambiar color';
        dot.addEventListener('click', function () { var i2 = DB.PALETTE.indexOf(a.c); a.c = DB.PALETTE[(i2 + 1) % DB.PALETTE.length]; dot.style.background = a.c; });
        var it = inp('', a.name, 'Nombre del área'); it.addEventListener('input', function () { a.name = it.value; });
        var del = el('button', 'iconbtn small', '<svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'); del.type = 'button'; del.setAttribute('aria-label', 'Quitar');
        del.addEventListener('click', function () { if (areas.length <= 1) return; areas.splice(i, 1); drawAreas(); });
        row.appendChild(dot); row.appendChild(it); row.appendChild(del); list.appendChild(row);
      });
      pA.appendChild(list);
      var add = el('button', 'btn ghost sm', '+ Área'); add.type = 'button'; add.style.marginTop = '12px';
      add.addEventListener('click', function () { areas.push({ id: DB.uid(), name: '', c: DB.PALETTE[areas.length % DB.PALETTE.length] }); drawAreas(); });
      pA.appendChild(add);
    }
    drawAreas(); body.appendChild(pA);
    /* datos */
    var pD = panes.datos;
    pD.appendChild(el('p', 'hint', 'Modo beta: todo vive en este navegador. Exporta un respaldo para compartirlo o cambiar de dispositivo. La siguiente versión sincroniza en vivo con Supabase.'));
    var br = el('div', 'btnrow'); br.style.marginTop = '12px';
    var bE = el('button', 'btn ghost sm', 'Exportar respaldo'); bE.type = 'button'; bE.addEventListener('click', doExport);
    var bI = el('button', 'btn ghost sm', 'Importar'); bI.type = 'button'; bI.addEventListener('click', function () { $('#importFile').click(); });
    var bR = el('button', 'btn coral sm', 'Reiniciar demo'); bR.type = 'button'; bR.addEventListener('click', function () { if (confirm('Esto borra tareas, XP y apartados de ESTE navegador y vuelve a la demo. ¿Seguro?')) DB.reset().then(function () { closeModal(); boot(); }); });
    br.appendChild(bE); br.appendChild(bI); br.appendChild(bR); pD.appendChild(br); body.appendChild(pD);

    openModal({ title: 'Ajustes del espacio', body: body, foot: [
      { label: 'Guardar', onClick: function () {
        var name = fN.value.trim() || 'HQ';
        var cleanAreas = areas.filter(function (a) { return a.name.trim(); });
        if (!cleanAreas.length) cleanAreas = S.areas;
        DB.updateSpace({ name: name, tagline: fT.value.trim(), colorTheme: chosen }).then(function () { return DB.setAreas(cleanAreas); })
          .then(function () { applySpaceTheme(); renderManifest(); renderBoard(); toast('Ajustes guardados'); });
      } },
      { label: 'Cancelar', cls: 'ghost' }
    ] });
  }

  /* ---------- respaldo ---------- */
  function doExport() {
    var blob = new Blob([DB.exportJSON()], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (S.space.name || 'hq').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-respaldo-' + DB.today() + '.json';
    a.click(); URL.revokeObjectURL(a.href);
  }

  /* ---------- onboarding ---------- */
  function openOnboarding() {
    $('#onbRockie').innerHTML = '<div style="display:grid;place-items:center">' + rockieSVG('#3c5d73', 84) + '</div>';
    var grid = $('#pickgrid'); grid.innerHTML = '';
    S.members.forEach(function (m) {
      var b = el('button', 'card pick', rockieSVG(m.c, 56) + '<span>' + esc(m.name) + '</span>');
      b.addEventListener('click', function () { DB.setWho(m.id).then(function () { $('#onb').classList.remove('on'); toast('Hola, ' + esc(m.name) + ' — a construir'); burst(innerWidth / 2, innerHeight / 3, 30); renderTeam(); renderBoard(); }); });
      grid.appendChild(b);
    });
    var nb = el('button', 'card pick', '<span style="font-size:32px;line-height:1">+</span><span>Soy nuevo</span>');
    nb.addEventListener('click', function () { $('#onb').classList.remove('on'); openMemberEditor(null); });
    grid.appendChild(nb);
    $('#onb').classList.add('on');
  }

  /* ---------- listeners fijos ---------- */
  function wire() {
    $$('.navitem').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.view); }); });
    $('#ctaBoard').addEventListener('click', function () { show('tablero'); });
    $('#editManifest').addEventListener('click', openManifestEditor);
    $('#rockieBtn').addEventListener('click', function () { show('equipo'); celebrateRockie(); });
    $('#fabAdd').addEventListener('click', function () { openTaskEditor(null); });
    $('#switchWho').addEventListener('click', openOnboarding);
    $('#addMember').addEventListener('click', function () { openMemberEditor(null); });
    $('#addHito').addEventListener('click', function () { openHitoEditor(null); });
    $('#addLink').addEventListener('click', function () { openLinkEditor(null); });
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#themeBtn').addEventListener('click', function () { var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; DB.setTheme(next).then(applyTheme); });
    $('#addNote').addEventListener('click', function () { DB.addNote({ t: 'Nuevo apartado', c: NOTE_COLORS[S.notes.length % NOTE_COLORS.length], body: '' }).then(renderNotes); });
    $('#exportBtn').addEventListener('click', doExport);
    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () { try { DB.importJSON(r.result).then(function () { closeModal(); boot(); toast('Respaldo importado'); }); } catch (e) { alert(e.message); } ev.target.value = ''; };
      r.readAsText(f);
    });
    $('#resetBtn').addEventListener('click', function () { if (confirm('Esto borra tareas, XP y apartados de ESTE navegador y vuelve a la demo. ¿Seguro?')) DB.reset().then(boot); });
    $('#shareBtn').addEventListener('click', function () {
      var dc = doneCol();
      var lines = ['*' + (S.space.name || 'HQ') + ' — resumen del cuartel*', '', 'XP del equipo: ' + DB.teamXP() + ' · Racha: ' + DB.streak() + ' días'];
      S.columns.filter(function (c) { return c.kind === 'open'; }).forEach(function (c) {
        var items = S.tasks.filter(function (t) { return t.col === c.id; }).sort(function (a, b) { return a.order - b.order; });
        if (!items.length) return;
        lines.push('', '*' + c.name + ':*');
        items.forEach(function (t) { var m = memberById(t.who); lines.push('- ' + t.t + (m ? ' — ' + m.name : '') + (t.due ? ' (' + fmtDate(t.due) + ')' : '')); });
      });
      var done = dc ? S.tasks.filter(function (t) { return t.col === dc.id; }) : [];
      if (done.length) lines.push('', '*Validadas: ' + done.length + '*');
      open('https://wa.me/?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
    });
    /* si el usuario cambia entre PC/movil con el modal abierto, no pasa nada raro: es el mismo nodo */
  }

  /* ---------- arranque ---------- */
  function boot() {
    return DB.load().then(function (state) {
      S = state; applyTheme();
      $('#navRockie').innerHTML = rockieSVG('#2a82ad', 40, { sleepy: isNight() });
      renderManifest(); renderBoard(); renderHitos(); renderTeam(); renderLinks(); renderNotes();
      var start = (location.hash || '').replace('#', '');
      if (!S.who) { show('manifiesto'); openOnboarding(); }
      else if (VIEWS.indexOf(start) >= 0) show(start);
      else show('tablero');
    });
  }
  wire(); boot();
})();
