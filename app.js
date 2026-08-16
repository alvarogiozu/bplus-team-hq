/* ============================================================
   B+ HQ — logica de interfaz
   Vanilla JS, sin dependencias. Los datos SIEMPRE pasan por DB.*
   (ver db.js). Aqui no se toca localStorage nunca.
   ============================================================ */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var S;                                   // estado en memoria (lo sirve DB)
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- catalogo de areas (color = significado) ---------- */
  var AREAS = {
    app:         { name: 'App',         c: '#2e88aa' },
    pcb:         { name: 'PCB',         c: '#b4637a' },
    firmware:    { name: 'Firmware',    c: '#8aa54a' },
    d3:          { name: '3D',          c: '#659ca5' },
    kickstarter: { name: 'Kickstarter', c: '#eaa545' },
    video:       { name: 'Video',       c: '#bd6c56' },
    diseno:      { name: 'Diseno',      c: '#a573a5' },
    gestion:     { name: 'Gestion',     c: '#4a6fa5' }
  };

  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function memberById(id) { return S.members.filter(function (m) { return m.id === id; })[0]; }
  function fmtDate(iso) {
    try {
      var p = iso.split('-');
      var mm = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      return parseInt(p[2], 10) + ' ' + mm[parseInt(p[1], 10) - 1];
    } catch (e) { return iso; }
  }

  /* ---------- Rockie: el alma de B+ ---------- */
  function rockieSVG(color, size, opts) {
    opts = opts || {};
    var s = size || 44;
    var eyes = opts.sleepy
      ? '<path d="M13 21 q3 2.6 6 0" stroke="#fdfbf7" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M25 21 q3 2.6 6 0" stroke="#fdfbf7" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
      : '<g class="eye"><ellipse cx="16" cy="20" rx="3.4" ry="4.6" fill="#fdfbf7"/></g>' +
        '<g class="eye"><ellipse cx="28" cy="20" rx="3.4" ry="4.6" fill="#fdfbf7"/></g>';
    var zzz = opts.sleepy ? '<text x="36" y="10" font-size="8" font-weight="700" fill="' + color + '">z z</text>' : '';
    return '<svg class="rockie" width="' + s + '" height="' + s + '" viewBox="0 0 44 44" aria-hidden="true">' +
      '<path d="M22 3 C33 3 40 11 40 22 C40 34 33 41 22 41 C11 41 4 34 4 22 C4 11 11 3 22 3 Z" fill="' + color + '"/>' +
      eyes +
      '<path d="M18 29 q4 3 8 0" stroke="#fdfbf7" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      zzz + '</svg>';
  }
  function isNight() { var h = new Date().getHours(); return h >= 23 || h < 6; }
  function celebrateRockie() {
    var r = $('#navRockie .rockie');
    if (!r) return;
    r.classList.remove('celebrate'); void r.offsetWidth; r.classList.add('celebrate');
  }

  /* ---------- confetti ---------- */
  var CONF = ['#cf7358','#eaa545','#8aa54a','#2e88aa','#b4637a','#a573a5','#73a58a'];
  var cvs = $('#confetti'), ctx = cvs.getContext('2d'), parts = [], running = false;
  function sizeCanvas() {
    cvs.width = innerWidth * devicePixelRatio; cvs.height = innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  addEventListener('resize', sizeCanvas); sizeCanvas();
  function burst(x, y, n) {
    if (reduceMotion) return;
    for (var i = 0; i < (n || 26); i++) {
      parts.push({ x: x, y: y, vx: (Math.random() - .5) * 7, vy: -Math.random() * 8 - 3, g: .28,
        r: Math.random() * 4 + 2.5, c: CONF[i % CONF.length], a: 1,
        rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .3 });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }
  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.a > .02; });
    parts.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.a -= .012; p.rot += p.vr;
      ctx.save(); ctx.globalAlpha = p.a; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r * .6, p.r * 2, p.r * 1.2); ctx.restore();
    });
    if (parts.length) requestAnimationFrame(tick); else running = false;
  }

  /* ---------- XP, niveles, racha ---------- */
  function teamXP() { var t = 0; Object.keys(S.xp).forEach(function (k) { t += S.xp[k]; }); return t; }
  function level(xp) { return Math.floor(Math.sqrt(xp / 60)) + 1; }
  function streak() {
    var days = {}; S.log.forEach(function (l) { days[l.date] = 1; });
    var n = 0, d = new Date();
    if (!days[DB.today()]) d.setDate(d.getDate() - 1);
    while (days[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function xpFloat(x, y, txt, color) {
    var el = document.createElement('div');
    el.className = 'xpfloat'; el.textContent = txt;
    el.style.left = (x - 20) + 'px'; el.style.top = (y - 30) + 'px'; el.style.color = color;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1500);
  }
  var toastTimer;
  function toast(html) {
    var old = $('.toast'); if (old) old.remove();
    var el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.add('bye'); setTimeout(function () { el.remove(); }, 400);
    }, 4200);
  }
  var FLAME = '<svg class="ico flame" style="width:18px;height:18px" viewBox="0 0 24 24">' +
    '<path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.5.5-3 1.5-4.5C9 9 10 10 11 10c0-3 1-5.5 1-7z" fill="currentColor" stroke="none"/></svg>';

  /* ---------- navegacion ---------- */
  var VIEWS = ['manifiesto','tablero','hitos','base','equipo'];
  function show(view) {
    VIEWS.forEach(function (v) { $('#v-' + v).classList.remove('on'); });
    $('#v-' + view).classList.add('on');
    $$('.navitem').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    $('#fabAdd').classList.toggle('on', view === 'tablero');
    /* cada vista se repinta al entrar: el XP y los contadores cambian
       desde otras pantallas (validar una tarea suma XP al equipo). */
    if (view === 'manifiesto') refreshStats();
    if (view === 'equipo') renderTeam();
    if (view === 'hitos') renderHitos();
    requestAnimationFrame(function () {
      $$('#v-' + view + ' .reveal').forEach(function (el, i) {
        setTimeout(function () { el.classList.add('in'); }, 80 * i);
      });
    });
    try { history.replaceState(null, '', '#' + view); } catch (e) {}
  }

  /* ---------- stats ---------- */
  function refreshStats() {
    $('#stTeamXp').textContent = teamXP();
    $('#stStreak').textContent = streak();
    $('#stOpen').textContent  = S.tasks.filter(function (t) { return t.col !== 'done'; }).length;
    $('#stDone').textContent  = S.tasks.filter(function (t) { return t.col === 'done'; }).length;
  }

  /* ---------- tablero ---------- */
  var filterWho = null, dragId = null;

  function renderChips() {
    var host = $('#memberChips'); host.innerHTML = '';
    var all = document.createElement('button');
    all.className = 'chip all' + (filterWho === null ? ' on' : '');
    all.innerHTML = '<span class="dotav"></span>Todos';
    all.addEventListener('click', function () { filterWho = null; renderBoard(); renderChips(); });
    host.appendChild(all);
    S.members.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'chip' + (filterWho === m.id ? ' on' : '');
      b.innerHTML = '<span class="dotav">' + rockieSVG(m.c, 24) + '</span>' + esc(m.name);
      b.addEventListener('click', function () {
        filterWho = (filterWho === m.id ? null : m.id); renderBoard(); renderChips();
      });
      host.appendChild(b);
    });
  }

  function taskCard(t) {
    var m = memberById(t.who);
    var area = AREAS[t.area] || { name: t.area, c: '#9893a5' };
    var el = document.createElement('article');
    el.className = 'task' +
      (t.prio === 'urgente' && t.col !== 'done' ? ' urgent' : '') +
      (t.col === 'done' ? ' done-card' : '');
    el.style.setProperty('--area-c', area.c);
    el.draggable = true; el.dataset.id = t.id;

    var late = t.due && t.col !== 'done' && t.due < DB.today();
    var html = '';
    if (t.col === 'done' && t.mode) {
      html += '<span class="stamp ' + (t.mode === 'proof' ? 'photo' : 'plain') + '">' +
        '<svg class="ico" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>';
    }
    html += '<span class="areatag">' + esc(area.name) + '</span>';
    html += '<div class="ttl">' + esc(t.t) + '</div>';
    html += '<div class="meta">';
    if (m) html += '<span class="whodot" title="' + esc(m.name) + '">' + rockieSVG(m.c, 22) + '</span><span>' + esc(m.name) + '</span>';
    if (t.due) html += '<span class="due' + (late ? ' late' : '') + '">' + fmtDate(t.due) + (late ? ' - se paso!' : '') + '</span>';
    html += '</div><div class="actions">';
    if (t.col === 'todo')  html += '<button class="mini go" data-act="doing">Empezar</button>';
    if (t.col === 'doing') html += '<button class="mini proof" data-act="validate">Validar</button><button class="mini plain" data-act="todo">Volver</button>';
    if (t.col === 'done')  html += '<button class="mini plain" data-act="doing">Reabrir</button>';
    html += '<button class="mini dots" data-act="edit" aria-label="Editar tarea">Editar</button></div>';
    el.innerHTML = html;

    el.addEventListener('dragstart', function (ev) {
      dragId = t.id; el.classList.add('dragging');
      ev.dataTransfer.setData('text/plain', t.id); ev.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', function () { el.classList.remove('dragging'); dragId = null; });

    /* long press = editar (gesto consistente con la app) */
    var press = null;
    el.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('button')) return;
      press = setTimeout(function () {
        el.classList.add('squeeze');
        if (navigator.vibrate) navigator.vibrate(10);
        setTimeout(function () { el.classList.remove('squeeze'); openTaskSheet(t.id); }, 320);
      }, 480);
    });
    ['pointerup','pointerleave','pointercancel'].forEach(function (e) {
      el.addEventListener(e, function () { clearTimeout(press); });
    });

    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var act = b.dataset.act;
      if (act === 'edit') return openTaskSheet(t.id);
      if (act === 'validate') return openProofSheet(t.id, ev);
      DB.updateTask(t.id, { col: act, mode: null }).then(renderBoard);
    });
    return el;
  }

  function renderBoard() {
    ['todo','doing','done'].forEach(function (col) {
      var host = $('#list-' + col); host.innerHTML = '';
      var items = S.tasks.filter(function (t) {
        return t.col === col && (!filterWho || t.who === filterWho);
      });
      items.forEach(function (t) { host.appendChild(taskCard(t)); });
      $('#c-' + col).textContent = items.length;
    });
    refreshStats();
  }

  /* ---------- hoja: crear / editar tarea ---------- */
  var editingId = null;

  function fillSelects() {
    var a = $('#fArea'); a.innerHTML = '';
    Object.keys(AREAS).forEach(function (k) {
      var o = document.createElement('option'); o.value = k; o.textContent = AREAS[k].name; a.appendChild(o);
    });
    var w = $('#fWho'); w.innerHTML = '';
    S.members.forEach(function (m) {
      var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; w.appendChild(o);
    });
  }

  function openTaskSheet(id) {
    editingId = id || null;
    fillSelects();
    var t = id ? S.tasks.filter(function (x) { return x.id === id; })[0] : null;
    $('#sheetTitle').textContent = t ? 'Editar tarea' : 'Nueva tarea';
    $('#fTitle').value = t ? t.t : '';
    $('#fArea').value  = t ? t.area : 'gestion';
    $('#fWho').value   = t ? t.who : (S.who || S.members[0].id);
    $('#fDue').value   = t && t.due ? t.due : '';
    $('#fPrio').value  = t ? t.prio : 'normal';
    $('#fNote').value  = t ? (t.note || '') : '';
    $('#deleteTask').style.display = t ? '' : 'none';
    $('#taskOverlay').classList.add('on');
    setTimeout(function () { $('#fTitle').focus(); }, 250);
  }

  function closeSheets() {
    $$('.overlay').forEach(function (o) { o.classList.remove('on'); });
    editingId = null; provingId = null;
  }

  /* ---------- hoja: validar ---------- */
  var provingId = null, proofPoint = { x: innerWidth / 2, y: innerHeight / 2 };

  function openProofSheet(id, ev) {
    provingId = id;
    var t = S.tasks.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    if (ev && ev.clientX) proofPoint = { x: ev.clientX, y: ev.clientY };
    $('#proofTaskName').textContent = t.t;
    $('#fProof').value = t.note || '';
    $('#proofOverlay').classList.add('on');
  }

  function validate(mode) {
    var id = provingId;
    if (!id) return;
    var proof = $('#fProof').value.trim();
    closeSheets();
    DB.validateTask(id, mode, proof).then(function (res) {
      renderBoard();
      var txt = '+' + res.pts + ' XP';
      var color = mode === 'proof' ? '#4a7c3f' : '#8aa54a';
      xpFloat(proofPoint.x, proofPoint.y, txt, color);
      burst(proofPoint.x, proofPoint.y, mode === 'proof' ? 34 : 18);
      if (navigator.vibrate) navigator.vibrate([12, 40, 12]);
      celebrateRockie();
      var firstToday = S.log.filter(function (l) { return l.date === DB.today(); }).length === 1;
      if (firstToday) {
        var st = streak();
        toast(FLAME + 'Racha del equipo: ' + st + (st === 1 ? ' dia' : ' dias'));
      } else {
        toast('Validado - ' + txt);
      }
    });
  }

  /* ---------- hitos ---------- */
  function renderHitos() {
    var host = $('#hitosList'); host.innerHTML = '';
    S.hitos.forEach(function (h, i) {
      var el = document.createElement('article');
      el.className = 'card hito reveal in';
      el.innerHTML =
        '<div class="hnum">0' + (i + 1) + '</div>' +
        '<div><h3>' + esc(h.t) + '</h3><p class="hdesc">' + esc(h.d) + '</p>' +
        '<div class="hbar"><div class="fill" style="width:' + h.pct + '%"></div></div>' +
        '<div class="hctrl"><button data-d="-5" aria-label="Bajar progreso">-5</button>' +
        '<button data-d="5" aria-label="Subir progreso">+5</button>' +
        '<span class="hdate" style="align-self:center;margin-left:8px">objetivo: ' + esc(h.date) + '</span></div></div>' +
        '<div class="hpct">' + h.pct + '%</div>';
      el.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        var old = h.pct;
        DB.setHito(h.id, h.pct + parseInt(b.dataset.d, 10)).then(function (up) {
          $('.fill', el).style.width = up.pct + '%';
          $('.hpct', el).textContent = up.pct + '%';
          if (up.pct === 100 && old !== 100) {
            var r = el.getBoundingClientRect();
            burst(r.left + r.width / 2, r.top + 40, 40);
            toast('Hito cumplido: ' + up.t);
          }
        });
      });
      host.appendChild(el);
    });
  }

  /* ---------- equipo ---------- */
  function renderTeam() {
    var host = $('#teamList'); host.innerHTML = '';
    S.members.forEach(function (m) {
      var xp = S.xp[m.id] || 0;
      var el = document.createElement('article');
      el.className = 'card member reveal in';
      el.innerHTML =
        '<div style="display:grid;place-items:center">' + rockieSVG(m.c, 64, { sleepy: isNight() }) + '</div>' +
        '<h3>' + esc(m.name) + (S.who === m.id ? ' - tu' : '') + '</h3>' +
        '<div class="mrole">' + esc(m.role) + '</div>' +
        '<p class="job">' + esc(m.job) + '</p>' +
        '<div class="xp">' + xp + ' <small>XP</small></div>' +
        '<span class="lvlpill">Nivel ' + level(xp) + '</span>';
      el.addEventListener('click', function () {
        var nr = prompt('Rol de ' + m.name + ':', m.role); if (nr === null) return;
        var nj = prompt('Su unico trabajo (una frase):', m.job); if (nj === null) return;
        DB.updateMember(m.id, { role: nr.trim() || m.role, job: nj.trim() || m.job }).then(renderTeam);
      });
      host.appendChild(el);
    });
  }

  /* ---------- apartados libres ---------- */
  var NOTE_COLORS = ['#659ca5','#eaa545','#b4637a','#8aa54a','#a573a5','#bd6c56','#4a6fa5','#b97084'];
  function renderNotes() {
    var host = $('#notesList'); host.innerHTML = '';
    S.notes.forEach(function (n) {
      var el = document.createElement('div'); el.className = 'note';
      el.innerHTML =
        '<div class="nhead" style="--note-c:' + n.c + '">' +
          '<input value="' + esc(n.t) + '" aria-label="Titulo del apartado">' +
          '<button class="iconbtn" style="width:36px;height:36px;flex:none" data-act="color" aria-label="Cambiar color">' +
            '<svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg></button>' +
          '<button class="iconbtn" style="width:36px;height:36px;flex:none" data-act="del" aria-label="Eliminar apartado">' +
            '<svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></svg></button>' +
        '</div>' +
        '<textarea aria-label="Contenido del apartado">' + esc(n.body) + '</textarea>';
      $('input', el).addEventListener('input', function (ev) { DB.updateNote(n.id, { t: ev.target.value }); });
      $('textarea', el).addEventListener('input', function (ev) { DB.updateNote(n.id, { body: ev.target.value }); });
      el.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.act === 'del') {
          if (confirm('Eliminar el apartado "' + n.t + '"?')) DB.removeNote(n.id).then(renderNotes);
        } else {
          var i = NOTE_COLORS.indexOf(n.c);
          DB.updateNote(n.id, { c: NOTE_COLORS[(i + 1) % NOTE_COLORS.length] }).then(renderNotes);
        }
      });
      host.appendChild(el);
    });
  }

  /* ---------- tema ---------- */
  function applyTheme() {
    var t = S.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = t;
  }

  /* ---------- onboarding ---------- */
  function openOnboarding() {
    $('#onbRockie').innerHTML = '<div style="display:grid;place-items:center">' + rockieSVG('#3c5d73', 84) + '</div>';
    var grid = $('#pickgrid'); grid.innerHTML = '';
    S.members.forEach(function (m) {
      var b = document.createElement('button'); b.className = 'card pick';
      b.innerHTML = rockieSVG(m.c, 56) + '<span>' + esc(m.name) + '</span>';
      b.addEventListener('click', function () {
        DB.setWho(m.id).then(function () {
          $('#onb').classList.remove('on');
          toast('Hola, ' + m.name + ' - a construir');
          burst(innerWidth / 2, innerHeight / 3, 30);
          renderTeam(); renderBoard();
        });
      });
      grid.appendChild(b);
    });
    $('#onb').classList.add('on');
  }

  /* ---------- listeners fijos ---------- */
  function wire() {
    $$('.navitem').forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.view); });
    });
    $('#ctaBoard').addEventListener('click', function () { show('tablero'); });
    $('#rockieBtn').addEventListener('click', function () { show('equipo'); celebrateRockie(); });
    $('#fabAdd').addEventListener('click', function () { openTaskSheet(null); });
    $('#switchWho').addEventListener('click', openOnboarding);
    $('#cancelTask').addEventListener('click', closeSheets);
    $('#proofCancel').addEventListener('click', closeSheets);
    $('#proofYes').addEventListener('click', function () { validate('proof'); });
    $('#proofNo').addEventListener('click', function () { validate('plain'); });

    $('#saveTask').addEventListener('click', function () {
      var title = $('#fTitle').value.trim();
      if (!title) { $('#fTitle').focus(); return; }
      var patch = {
        t: title, area: $('#fArea').value, who: $('#fWho').value,
        due: $('#fDue').value, prio: $('#fPrio').value, note: $('#fNote').value
      };
      var op = editingId ? DB.updateTask(editingId, patch)
                         : DB.addTask(Object.assign({ col: 'todo', mode: null }, patch));
      op.then(function () { closeSheets(); renderBoard(); toast('Guardado en el tablero'); });
    });

    $('#deleteTask').addEventListener('click', function () {
      if (!editingId) return;
      DB.removeTask(editingId).then(function () { closeSheets(); renderBoard(); });
    });

    $('#themeBtn').addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      DB.setTheme(next).then(applyTheme);
    });

    /* columnas: drag & drop */
    $$('.col').forEach(function (col) {
      col.addEventListener('dragover', function (ev) { ev.preventDefault(); col.classList.add('dragover'); });
      col.addEventListener('dragleave', function () { col.classList.remove('dragover'); });
      col.addEventListener('drop', function (ev) {
        ev.preventDefault(); col.classList.remove('dragover');
        var id = dragId || ev.dataTransfer.getData('text/plain'); if (!id) return;
        if (col.dataset.col === 'done') openProofSheet(id, ev);
        else DB.updateTask(id, { col: col.dataset.col, mode: null }).then(renderBoard);
      });
    });

    $$('.overlay').forEach(function (o) {
      o.addEventListener('click', function (ev) { if (ev.target === o) closeSheets(); });
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeSheets(); });

    $('#addNote').addEventListener('click', function () {
      DB.addNote({ t: 'Nuevo apartado', c: NOTE_COLORS[S.notes.length % NOTE_COLORS.length], body: '' })
        .then(renderNotes);
    });

    /* respaldo */
    $('#exportBtn').addEventListener('click', function () {
      var blob = new Blob([DB.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bplus-hq-respaldo-' + DB.today() + '.json';
      a.click(); URL.revokeObjectURL(a.href);
    });
    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try { DB.importJSON(r.result).then(boot); toast('Respaldo importado'); }
        catch (e) { alert(e.message); }
      };
      r.readAsText(f);
    });
    $('#resetBtn').addEventListener('click', function () {
      if (confirm('Esto borra tareas, XP y apartados de ESTE navegador y vuelve a la demo. Seguro?')) {
        DB.reset().then(boot);
      }
    });

    /* resumen a WhatsApp */
    $('#shareBtn').addEventListener('click', function () {
      var lines = ['*B+ HQ - resumen del cuartel*', ''];
      lines.push('XP del equipo: ' + teamXP() + ' - Racha: ' + streak() + ' dias');
      [['doing','*En curso:*'], ['todo','*Por hacer:*']].forEach(function (pair) {
        var items = S.tasks.filter(function (t) { return t.col === pair[0]; });
        if (!items.length) return;
        lines.push('', pair[1]);
        items.forEach(function (t) {
          var m = memberById(t.who);
          lines.push('- ' + t.t + (m ? ' - ' + m.name : '') + (t.due ? ' (' + fmtDate(t.due) + ')' : ''));
        });
      });
      var done = S.tasks.filter(function (t) { return t.col === 'done'; });
      if (done.length) lines.push('', '*Validadas: ' + done.length + '*');
      open('https://wa.me/?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
    });
  }

  /* ---------- arranque ---------- */
  function boot() {
    return DB.load().then(function (state) {
      S = state;
      applyTheme();
      $('#navRockie').innerHTML = rockieSVG('#2a82ad', 40, { sleepy: isNight() });
      renderChips(); renderBoard(); renderHitos(); renderTeam(); renderNotes(); refreshStats();
      var start = (location.hash || '').replace('#', '');
      if (!S.who) { show('manifiesto'); openOnboarding(); }
      else if (VIEWS.indexOf(start) >= 0) show(start);
      else show('tablero');
    });
  }

  wire();
  boot();
})();
