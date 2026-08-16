/* ============================================================
   HQ — capa de datos
   ------------------------------------------------------------
   HOY: todo vive en localStorage (sin cuentas, sin servidor).
   MANANA: para conectar Supabase SOLO se reescribe este archivo.
   El resto de la app (app.js) nunca toca localStorage directamente:
   siempre pasa por DB.*, y todos los metodos devuelven Promesas.
   Esquema SQL y guia de migracion: README.md + supabase/schema.sql
   ============================================================ */
var DB = (function () {
  'use strict';

  var KEY = 'bplus-hq-v2';
  var OLD_KEY = 'bplus-hq-v1';
  var SCHEMA = 2;

  function uid() { return 't' + Math.random().toString(36).slice(2, 9); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function shift(days) { var d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

  /* ---------- catalogo de temas de color ----------
     Cada tema define acento de titulos + acento de accion.
     El resto (papel, tinta) es el mismo idioma visual. */
  var THEMES = {
    coral:  { name: 'Coral',    title: '#cf7358', titleSoft: '#f7e9e3', accent: '#2e88aa', accentEdge: '#216b87', accentSoft: '#e2eef3' },
    berry:  { name: 'Frambuesa',title: '#b4637a', titleSoft: '#f6e8ec', accent: '#575279', accentEdge: '#3f3b5c', accentSoft: '#e9e6f0' },
    olive:  { name: 'Oliva',    title: '#6d833a', titleSoft: '#eef1e3', accent: '#bd6c56', accentEdge: '#9d5541', accentSoft: '#f7e9e3' },
    azure:  { name: 'Azul',     title: '#2e88aa', titleSoft: '#e2eef3', accent: '#cf7358', accentEdge: '#9d5541', accentSoft: '#f7e9e3' },
    amber:  { name: 'Ambar',    title: '#c8831e', titleSoft: '#fbf0dc', accent: '#4a6fa5', accentEdge: '#38547e', accentSoft: '#e6ebf3' },
    purple: { name: 'Morado',   title: '#a573a5', titleSoft: '#f2e8f2', accent: '#73a58a', accentEdge: '#5c8871', accentSoft: '#e6f0ea' }
  };

  var PALETTE = ['#2a82ad','#b4637a','#8aa54a','#eaa545','#a573a5','#bd6c56','#659ca5','#4a6fa5','#73a58a','#b97084','#cf7358','#575279'];

  /* ---------- logros del equipo ---------- */
  var ACHIEVEMENTS = [
    { id: 'first',    name: 'Primera piedra',   desc: 'La primera tarea validada del espacio.',        test: function (s) { return s.log.length >= 1; } },
    { id: 'proof5',   name: 'Con pruebas',      desc: '5 tareas validadas con evidencia.',              test: function (s) { return s.log.filter(function (l) { return l.mode === 'proof'; }).length >= 5; } },
    { id: 'ten',      name: 'Diez de diez',     desc: '10 tareas validadas en total.',                  test: function (s) { return s.log.length >= 10; } },
    { id: 'streak3',  name: 'Tres seguidos',    desc: 'Racha de 3 dias con validaciones.',              test: function (s) { return streakOf(s) >= 3; } },
    { id: 'streak7',  name: 'Semana entera',    desc: 'Racha de 7 dias.',                                test: function (s) { return streakOf(s) >= 7; } },
    { id: 'xp500',    name: 'Medio millar',     desc: '500 XP acumulados por el equipo.',                test: function (s) { return teamXPOf(s) >= 500; } },
    { id: 'xp2000',   name: 'Dos mil',          desc: '2000 XP acumulados.',                             test: function (s) { return teamXPOf(s) >= 2000; } },
    { id: 'allin',    name: 'Todos a bordo',    desc: 'Cada miembro valido al menos una tarea.',         test: function (s) { return s.members.every(function (m) { return (s.xp[m.id] || 0) > 0; }); } },
    { id: 'hito',     name: 'Hito cumplido',    desc: 'Un hito llego al 100%.',                          test: function (s) { return s.hitos.some(function (h) { return h.pct >= 100; }); } },
    { id: 'lategone', name: 'Cero atrasos',     desc: 'Ninguna tarea abierta con fecha vencida.',        test: function (s) { var t = today(); return s.tasks.length > 0 && !s.tasks.some(function (x) { return x.col !== 'done' && x.due && x.due < t; }); } }
  ];

  /* ---------- niveles con nombre ---------- */
  var RANKS = ['Chispa','Aprendiz','Constructor','Artesano','Maestro','Leyenda'];
  function levelOf(xp) { return Math.floor(Math.sqrt(xp / 60)) + 1; }
  function xpForLevel(lv) { return Math.pow(lv - 1, 2) * 60; }
  function rankOf(lv) { return RANKS[Math.min(RANKS.length - 1, Math.floor((lv - 1) / 3))]; }

  function teamXPOf(s) { var t = 0; Object.keys(s.xp).forEach(function (k) { t += s.xp[k]; }); return t; }
  function streakOf(s) {
    var days = {}; s.log.forEach(function (l) { days[l.date] = 1; });
    var n = 0, d = new Date();
    if (!days[today()]) d.setDate(d.getDate() - 1);
    while (days[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------- datos iniciales (el equipo B+ como primer espacio) ---------- */
  function seed() {
    return {
      schema: SCHEMA,
      who: null,
      theme: null,
      space: {
        name: 'B+',
        tagline: 'Turn habits into real-life wins together',
        colorTheme: 'coral',
        heroTitle: 'Convertimos hábitos en victorias reales. Aquí se construye cómo.',
        heroLead: 'B+ es la app donde tus metas se validan con pruebas de verdad — foto, IA y amigos que no te dejan caer. Este cuartel usa las mismas reglas del producto para organizarnos: somos el primer grupo que vive B+ antes que nadie.',
        about: 'Una app de hábitos para estudiantes de LATAM donde Rockie — nuestra mascota — crece contigo, y cada hábito se demuestra con una foto que valida la IA. Duolingo × Tamagotchi × WhatsApp.\n\nAlrededor de la app crece un sistema físico — hardware con propósito único — y una campaña para contarlo al mundo. Todo eso pasa por este tablero.',
        rules: [
          { t: 'Una tarea, un dueño',        d: 'Nada sale del tablero sin nombre y fecha. Si es de todos, no es de nadie.', c: '#2e88aa' },
          { t: 'Todo se valida con prueba',  d: '"Hecho" vale +40, "hecho con prueba" vale +100. Link, foto o build.', c: '#4a7c3f' },
          { t: 'Los colores hablan solos',   d: 'Coral = urgente. Ámbar = en curso. Verde = validado. Si hay que explicarlo, está mal.', c: '#eaa545' },
          { t: 'Somos el primer usuario',    d: 'Este cuartel es el laboratorio del modo Grupos de B+. Lo que nos sirva, llegará a los estudiantes.', c: '#b4637a' }
        ],
        northstar: [
          { t: 'Prototipo cerrado y funcional', d: 'hardware + firmware + carcasa' },
          { t: 'Rockie 1, la siguiente versión', d: 'se verifica y se compra esta semana' },
          { t: 'Postular a Blueprint II (San Francisco)', d: 'f.inc/blueprint — ya en la lista de aviso' },
          { t: 'Lanzar el Kickstarter', d: 'video, página y recompensas' }
        ],
        links: [
          { t: 'Tablero Pinterest', d: 'referencia visual · diseño industrial', url: 'https://pin.it/L90b254O7', c: '#b4637a' },
          { t: 'Canva — propuestas de estilo', d: 'identidad y exploraciones', url: 'https://www.canva.com/design/DAHQ7f8cz1E/y8oMmFv0g5lOrv4KFR1btA/edit', c: '#a573a5' },
          { t: 'Blueprint · Founders Inc', d: 'la aceleradora de hardware en SF', url: 'https://f.inc/blueprint', c: '#4a6fa5' },
          { t: 'Agenda 15–22 de agosto', d: 'las reuniones de estas dos semanas', url: 'agenda.html', c: '#bd6c56' }
        ]
      },
      areas: [
        { id: 'app',         name: 'App',         c: '#2e88aa' },
        { id: 'pcb',         name: 'PCB',         c: '#b4637a' },
        { id: 'firmware',    name: 'Firmware',    c: '#8aa54a' },
        { id: 'd3',          name: '3D',          c: '#659ca5' },
        { id: 'kickstarter', name: 'Kickstarter', c: '#eaa545' },
        { id: 'video',       name: 'Video',       c: '#bd6c56' },
        { id: 'diseno',      name: 'Diseño',      c: '#a573a5' },
        { id: 'gestion',     name: 'Gestión',     c: '#4a6fa5' }
      ],
      columns: [
        { id: 'todo',  name: 'Por hacer', c: '#9893a5', kind: 'open' },
        { id: 'doing', name: 'En curso',  c: '#eaa545', kind: 'open' },
        { id: 'done',  name: 'Hecho',     c: '#4a7c3f', kind: 'done' }
      ],
      xp: {},
      log: [],
      unlocked: [],
      members: [
        { id: 'alvaro',    name: 'Álvaro',    c: '#2a82ad', role: 'Fundador · integra todo',    job: 'Que el proyecto avance entero, no por partes.' },
        { id: 'mariana',   name: 'Mariana',   c: '#b4637a', role: 'Hardware · PCB',             job: 'La placa: revisiones, BOM y fabricación.' },
        { id: 'sebastian', name: 'Sebastián', c: '#8aa54a', role: 'Firmware · integración',     job: 'Que lo que sale de la placa funcione end-to-end.' },
        { id: 'fabricio',  name: 'Fabricio',  c: '#eaa545', role: 'Kickstarter · comunidad',    job: 'Contarle esto al mundo: video, copy, campaña.' },
        { id: 'angel',     name: 'Ángel',     c: '#a573a5', role: 'Diseño · sistema análogo',   job: 'La siguiente invención del sistema de objetos.' }
      ],
      tasks: [
        { id: uid(), t: 'Ensamblar el prototipo completo',                   area: 'd3',          who: 'alvaro',    due: '2026-08-15', prio: 'urgente', note: 'Sábado 15, 3pm presencial. Cada quien llega con su parte lista.', col: 'doing', mode: null, order: 0 },
        { id: uid(), t: 'Lista de cambios para la rev B de la PCB',          area: 'pcb',         who: 'mariana',   due: '2026-08-15', prio: 'normal',  note: '', col: 'doing', mode: null, order: 1 },
        { id: uid(), t: 'Integrar firmware con la placa nueva',              area: 'firmware',    who: 'sebastian', due: '2026-08-15', prio: 'normal',  note: '', col: 'doing', mode: null, order: 2 },
        { id: uid(), t: 'Propuesta Rockie 1 lista para verificar',           area: 'diseno',      who: 'angel',     due: '2026-08-15', prio: 'urgente', note: 'Se revisa en la virtual del sábado 6pm.', col: 'doing', mode: null, order: 3 },
        { id: uid(), t: 'Subir el firmware al repo (17 archivos sin git)',   area: 'firmware',    who: 'sebastian', due: shift(2),     prio: 'urgente', note: 'La carpeta firmware/ de BPLUS COMEBACK no está trackeada. Si se pierde, se pierde el trabajo.', col: 'todo', mode: null, order: 0 },
        { id: uid(), t: 'Armar el carrito de compras de Rockie 1',           area: 'gestion',     who: 'alvaro',    due: '2026-08-15', prio: 'normal',  note: 'Para comprar el sábado mismo por Mercado Libre. Plan B: domingo online, lunes Paruro.', col: 'todo', mode: null, order: 1 },
        { id: uid(), t: 'Guion del video Kickstarter (45 s)',                area: 'video',       who: 'fabricio',  due: '2026-08-25', prio: 'normal',  note: 'Secuencia sugerida en FABLE 5 / PROMPT_PARA_FABLE.md', col: 'todo', mode: null, order: 2 },
        { id: uid(), t: 'Definir recompensas y precios del Kickstarter',     area: 'kickstarter', who: 'fabricio',  due: '2026-09-05', prio: 'normal',  note: '', col: 'todo', mode: null, order: 3 },
        { id: uid(), t: 'Sesión de fotos del prototipo con la carcasa',      area: 'video',       who: 'fabricio',  due: '2026-09-01', prio: 'normal',  note: 'Necesita el hito 1 casi cerrado', col: 'todo', mode: null, order: 4 },
        { id: uid(), t: 'Registrarnos en la lista de aviso de Blueprint II', area: 'gestion',     who: 'alvaro',    due: '2026-08-12', prio: 'normal',  note: 'f.inc/blueprint', col: 'done', mode: 'proof', order: 0 }
      ],
      hitos: [
        { id: 'h1', t: 'Prototipo cerrado',          d: 'PCB + firmware integrado + carcasa ensamblada y funcional.',                 date: '2026-08-15', pct: 60, c: '#bd6c56' },
        { id: 'h2', t: 'Rockie 1 construido',        d: 'La siguiente versión oficial, con las piezas que se compran esta semana.',    date: '2026-08-22', pct: 10, c: '#2e88aa' },
        { id: 'h3', t: 'Material Kickstarter listo', d: 'Video de 45 s, fotos del prototipo, copy y página armada.',                  date: '2026-09-30', pct: 15, c: '#eaa545' },
        { id: 'h4', t: 'Postulación Blueprint II',   d: 'Aplicar apenas abra la cohorte. Historia: all-in, hardware probado.',        date: '2026-10-15', pct: 10, c: '#4a6fa5' },
        { id: 'h5', t: 'Lanzamiento en Kickstarter', d: 'Campaña pública con la comunidad que armó Fabricio.',                        date: '2026-11-01', pct: 0,  c: '#8aa54a' }
      ],
      notes: [
        { id: 'n1', t: 'Acuerdos de la reunión',            c: '#659ca5', body: '- Nada sale sin dueño y fecha.\n- Lo urgente se marca coral, no se grita.\n- Toda validación con su prueba.' },
        { id: 'n2', t: 'Carrito Rockie 1 (Mercado Libre)', c: '#eaa545', body: 'Pegar aquí los links con precio que salgan de la propuesta de Ángel.\nCompra ideal: sábado 15 de noche.' }
      ]
    };
  }

  /* ---------- lectura / escritura ---------- */
  var cache = null;

  function read() {
    if (cache) return cache;
    var raw = null;
    try { raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); } catch (e) {}
    if (!raw) { cache = seed(); return cache; }
    try {
      var data = JSON.parse(raw);
      if (!data || !data.tasks) throw new Error('formato invalido');
      cache = migrate(data);
    } catch (e) {
      console.warn('[HQ] datos ilegibles, arrancando de cero:', e.message);
      cache = seed();
    }
    return cache;
  }

  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); }
    catch (e) { console.error('[HQ] no se pudo guardar:', e.message); return Promise.reject(e); }
    return Promise.resolve(cache);
  }

  /* Migra datos de versiones anteriores sin perder nada del usuario. */
  function migrate(data) {
    var fresh = seed();
    if (!data.schema || data.schema < 2) {
      data.schema = 2;
      data.space = data.space || fresh.space;
      data.areas = data.areas || fresh.areas;
      data.columns = data.columns || fresh.columns;
      data.unlocked = data.unlocked || [];
      (data.tasks || []).forEach(function (t, i) { if (t.order === undefined) t.order = i; });
      (data.hitos || []).forEach(function (h, i) { if (!h.c) h.c = PALETTE[i % PALETTE.length]; });
    }
    if (!data.xp) data.xp = {};
    if (!data.log) data.log = [];
    if (!data.notes) data.notes = [];
    if (!data.space.links) data.space.links = fresh.space.links;
    if (!data.space.rules) data.space.rules = fresh.space.rules;
    if (!data.space.northstar) data.space.northstar = fresh.space.northstar;
    return data;
  }

  /* Devuelve los logros nuevos que se acaban de desbloquear. */
  function checkAchievements() {
    var s = read(), fresh = [];
    ACHIEVEMENTS.forEach(function (a) {
      if (s.unlocked.indexOf(a.id) >= 0) return;
      if (a.test(s)) { s.unlocked.push(a.id); fresh.push(a); }
    });
    return fresh;
  }

  /* ============================================================
     API PUBLICA — lo unico que app.js conoce.
     ============================================================ */
  return {
    mode: 'local',
    uid: uid, today: today,
    THEMES: THEMES, PALETTE: PALETTE, ACHIEVEMENTS: ACHIEVEMENTS, RANKS: RANKS,
    levelOf: levelOf, xpForLevel: xpForLevel, rankOf: rankOf,
    teamXP: function () { return teamXPOf(read()); },
    streak: function () { return streakOf(read()); },

    load: function () { return Promise.resolve(read()); },
    state: function () { return read(); },
    persist: function () { return write(); },

    /* ---- espacio (personalizacion) ---- */
    updateSpace: function (patch) {
      var sp = read().space;
      Object.keys(patch).forEach(function (k) { sp[k] = patch[k]; });
      return write();
    },

    /* ---- areas ---- */
    setAreas: function (areas) { read().areas = areas; return write(); },

    /* ---- columnas ---- */
    addColumn: function (col) {
      col.id = col.id || uid();
      var cols = read().columns;
      /* la columna "hecho" siempre va al final */
      var doneIdx = cols.findIndex(function (c) { return c.kind === 'done'; });
      if (doneIdx >= 0) cols.splice(doneIdx, 0, col); else cols.push(col);
      return write().then(function () { return col; });
    },
    updateColumn: function (id, patch) {
      var c = read().columns.filter(function (x) { return x.id === id; })[0];
      if (!c) return Promise.reject(new Error('columna no encontrada'));
      Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
      return write();
    },
    removeColumn: function (id) {
      var s = read();
      var col = s.columns.filter(function (x) { return x.id === id; })[0];
      if (!col || col.kind === 'done') return Promise.reject(new Error('esa columna no se puede borrar'));
      var first = s.columns.filter(function (x) { return x.id !== id && x.kind === 'open'; })[0];
      s.tasks.forEach(function (t) { if (t.col === id) t.col = first ? first.id : s.columns[0].id; });
      s.columns = s.columns.filter(function (x) { return x.id !== id; });
      return write();
    },

    /* ---- tareas ---- */
    addTask: function (task) {
      task.id = task.id || uid();
      var s = read();
      task.order = -1;
      s.tasks.unshift(task);
      return write().then(function () { return task; });
    },
    updateTask: function (id, patch) {
      var t = read().tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return Promise.reject(new Error('tarea no encontrada'));
      Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
      return write().then(function () { return t; });
    },
    /* Mueve una tarea a una columna y posicion concreta (drag & drop). */
    moveTask: function (id, col, index) {
      var s = read();
      var t = s.tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return Promise.reject(new Error('tarea no encontrada'));
      var siblings = s.tasks.filter(function (x) { return x.col === col && x.id !== id; })
                            .sort(function (a, b) { return a.order - b.order; });
      t.col = col;
      var doneCol = s.columns.filter(function (c) { return c.id === col; })[0];
      if (!doneCol || doneCol.kind !== 'done') t.mode = null;
      siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, t);
      siblings.forEach(function (x, i) { x.order = i; });
      return write().then(function () { return t; });
    },
    removeTask: function (id) {
      var s = read();
      s.tasks = s.tasks.filter(function (x) { return x.id !== id; });
      return write();
    },

    /* ---- validacion (hecho vs. demostrado) ---- */
    validateTask: function (id, mode, proof) {
      var s = read();
      var t = s.tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return Promise.reject(new Error('tarea no encontrada'));
      if (proof) t.note = proof;
      var doneCol = s.columns.filter(function (c) { return c.kind === 'done'; })[0];
      t.col = doneCol ? doneCol.id : 'done';
      t.mode = (mode === 'proof') ? 'proof' : 'plain';
      var base = (t.mode === 'proof') ? 100 : 40;
      /* bonus: la primera validacion del dia de ese miembro vale doble */
      var owner = t.who || s.who || s.members[0].id;
      var firstToday = !s.log.some(function (l) { return l.date === today() && l.who === owner; });
      var pts = firstToday ? base * 2 : base;
      var before = levelOf(s.xp[owner] || 0);
      s.xp[owner] = (s.xp[owner] || 0) + pts;
      var after = levelOf(s.xp[owner]);
      s.log.push({ date: today(), id: id, who: owner, mode: t.mode, pts: pts });
      var achievements = checkAchievements();
      return write().then(function () {
        return { task: t, pts: pts, base: base, bonus: firstToday, owner: owner,
                 leveledUp: after > before, level: after, achievements: achievements };
      });
    },

    /* ---- hitos ---- */
    addHito: function (h) {
      h.id = h.id || uid();
      read().hitos.push(h);
      return write().then(function () { return h; });
    },
    updateHito: function (id, patch) {
      var h = read().hitos.filter(function (x) { return x.id === id; })[0];
      if (!h) return Promise.reject(new Error('hito no encontrado'));
      Object.keys(patch).forEach(function (k) { h[k] = patch[k]; });
      if (h.pct !== undefined) h.pct = Math.max(0, Math.min(100, h.pct));
      var achievements = checkAchievements();
      return write().then(function () { return { hito: h, achievements: achievements }; });
    },
    removeHito: function (id) {
      var s = read();
      s.hitos = s.hitos.filter(function (x) { return x.id !== id; });
      return write();
    },

    /* ---- apartados ---- */
    addNote: function (note) { note.id = note.id || uid(); read().notes.unshift(note); return write().then(function () { return note; }); },
    updateNote: function (id, patch) {
      var n = read().notes.filter(function (x) { return x.id === id; })[0];
      if (!n) return Promise.reject(new Error('apartado no encontrado'));
      Object.keys(patch).forEach(function (k) { n[k] = patch[k]; });
      return write();
    },
    removeNote: function (id) { var s = read(); s.notes = s.notes.filter(function (x) { return x.id !== id; }); return write(); },

    /* ---- miembros ---- */
    addMember: function (m) {
      m.id = m.id || uid();
      read().members.push(m);
      return write().then(function () { return m; });
    },
    updateMember: function (id, patch) {
      var m = read().members.filter(function (x) { return x.id === id; })[0];
      if (!m) return Promise.reject(new Error('miembro no encontrado'));
      Object.keys(patch).forEach(function (k) { m[k] = patch[k]; });
      return write();
    },
    removeMember: function (id) {
      var s = read();
      if (s.members.length <= 1) return Promise.reject(new Error('el espacio necesita al menos un miembro'));
      s.members = s.members.filter(function (x) { return x.id !== id; });
      s.tasks.forEach(function (t) { if (t.who === id) t.who = s.members[0].id; });
      if (s.who === id) s.who = null;
      return write();
    },
    setWho: function (id) { read().who = id; return write(); },
    setTheme: function (t) { read().theme = t; return write(); },

    /* ---- respaldo ---- */
    exportJSON: function () { return JSON.stringify(read(), null, 2); },
    importJSON: function (text) {
      var data = JSON.parse(text);
      if (!data || !data.tasks) throw new Error('Ese archivo no parece un respaldo del espacio.');
      cache = migrate(data);
      return write();
    },
    reset: function () { cache = seed(); return write(); }
  };
})();
