/* ============================================================
   B+ HQ — capa de datos
   ------------------------------------------------------------
   HOY: todo vive en localStorage (modo beta, sin cuentas).
   MANANA: para conectar Supabase SOLO se reescribe este archivo.
   El resto de la app (app.js) nunca toca localStorage directamente:
   siempre pasa por DB.*, y todos los metodos devuelven Promesas.
   Guia de migracion y esquema SQL: README.md + supabase/schema.sql
   ============================================================ */
var DB = (function () {
  'use strict';

  var KEY = 'bplus-hq-v1';
  var SCHEMA = 1;

  /* ---------- datos iniciales (demo del equipo real) ---------- */
  function uid() { return 't' + Math.random().toString(36).slice(2, 9); }
  function today() { return new Date().toISOString().slice(0, 10); }

  function seed() {
    return {
      schema: SCHEMA,
      who: null,
      theme: null,
      xp: {},
      log: [],
      members: [
        { id: 'alvaro',    name: 'Alvaro',    c: '#2a82ad', role: 'Fundador - integra todo',     job: 'Que el proyecto avance entero, no por partes.' },
        { id: 'mariana',   name: 'Mariana',   c: '#b4637a', role: 'Hardware - PCB',              job: 'La placa: revisiones, BOM y fabricacion.' },
        { id: 'sebastian', name: 'Sebastian', c: '#8aa54a', role: 'Firmware - integracion',      job: 'Que lo que sale de la placa funcione end-to-end.' },
        { id: 'fabricio',  name: 'Fabricio',  c: '#eaa545', role: 'Kickstarter - comunidad',     job: 'Contarle esto al mundo: video, copy, campana.' },
        { id: 'angel',     name: 'Angel',     c: '#a573a5', role: 'Diseno - sistema analogo',    job: 'La siguiente invencion del sistema de objetos.' }
      ],
      tasks: [
        { id: uid(), t: 'Ensamblar el prototipo completo',                   area: 'd3',          who: 'alvaro',    due: '2026-08-15', prio: 'urgente', note: 'Sabado 15, 3pm presencial. Cada quien llega con su parte lista.', col: 'doing', mode: null },
        { id: uid(), t: 'Lista de cambios para la rev B de la PCB',          area: 'pcb',         who: 'mariana',   due: '2026-08-15', prio: 'normal',  note: '', col: 'doing', mode: null },
        { id: uid(), t: 'Integrar firmware con la placa nueva',              area: 'firmware',    who: 'sebastian', due: '2026-08-15', prio: 'normal',  note: '', col: 'doing', mode: null },
        { id: uid(), t: 'Propuesta Rockie 1 lista para verificar',           area: 'diseno',      who: 'angel',     due: '2026-08-15', prio: 'urgente', note: 'Se revisa en la virtual del sabado 6pm. Formularios Chispa y Desarrollo en la carpeta compartida.', col: 'doing', mode: null },
        { id: uid(), t: 'Armar el carrito de compras de Rockie 1',           area: 'gestion',     who: 'alvaro',    due: '2026-08-15', prio: 'normal',  note: 'Para comprar el sabado mismo por Mercado Libre. Plan B: domingo online, lunes Paruro.', col: 'todo',  mode: null },
        { id: uid(), t: 'Guion del video Kickstarter (45 s)',                area: 'video',       who: 'fabricio',  due: '2026-08-25', prio: 'normal',  note: 'Secuencia sugerida en FABLE 5 / PROMPT_PARA_FABLE.md', col: 'todo', mode: null },
        { id: uid(), t: 'Definir recompensas y precios del Kickstarter',     area: 'kickstarter', who: 'fabricio',  due: '2026-09-05', prio: 'normal',  note: '', col: 'todo', mode: null },
        { id: uid(), t: 'Sesion de fotos del prototipo con la carcasa',      area: 'video',       who: 'fabricio',  due: '2026-09-01', prio: 'normal',  note: 'Necesita el hito 1 casi cerrado', col: 'todo', mode: null },
        { id: uid(), t: 'Registrarnos en la lista de aviso de Blueprint II', area: 'gestion',     who: 'alvaro',    due: '2026-08-12', prio: 'normal',  note: 'f.inc/blueprint', col: 'done', mode: 'proof' }
      ],
      hitos: [
        { id: 'h1', t: 'Prototipo cerrado',              d: 'PCB + firmware integrado + carcasa ensamblada y funcional.',            date: '2026-08-15', pct: 60 },
        { id: 'h2', t: 'Rockie 1 construido',            d: 'La siguiente version oficial, con las piezas que se compran esta semana.', date: '2026-08-22', pct: 10 },
        { id: 'h3', t: 'Material Kickstarter listo',     d: 'Video de 45 s, fotos del prototipo, copy y pagina armada.',             date: '2026-09-30', pct: 15 },
        { id: 'h4', t: 'Postulacion Blueprint II',       d: 'Aplicar apenas abra la cohorte. Historia: all-in, hardware probado.',   date: 'otono 2026', pct: 10 },
        { id: 'h5', t: 'Lanzamiento en Kickstarter',     d: 'Campana publica con la comunidad que armo Fabricio.',                   date: '2026-11-01', pct: 0 }
      ],
      notes: [
        { id: 'n1', t: 'Acuerdos de la reunion',        c: '#659ca5', body: '- Nada sale sin dueno y fecha.\n- Lo urgente se marca coral, no se grita.\n- Toda validacion con su prueba.' },
        { id: 'n2', t: 'Carrito Rockie 1 (Mercado Libre)', c: '#eaa545', body: 'Pegar aqui los links con precio que salgan de la propuesta de Angel.\nCompra ideal: sabado 15 de noche.' }
      ]
    };
  }

  /* ---------- lectura / escritura ---------- */
  var cache = null;

  function read() {
    if (cache) return cache;
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (!raw) { cache = seed(); return cache; }
    try {
      var data = JSON.parse(raw);
      if (!data || !data.tasks) throw new Error('formato invalido');
      cache = migrate(data);
    } catch (e) {
      console.warn('[B+ HQ] datos ilegibles, arrancando de cero:', e.message);
      cache = seed();
    }
    return cache;
  }

  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) {
      console.error('[B+ HQ] no se pudo guardar:', e.message);
      return Promise.reject(e);
    }
    return Promise.resolve(cache);
  }

  /* Migraciones entre versiones del esquema local. */
  function migrate(data) {
    if (!data.schema) data.schema = 1;
    if (!data.xp) data.xp = {};
    if (!data.log) data.log = [];
    if (!data.notes) data.notes = [];
    return data;
  }

  /* ============================================================
     API PUBLICA — lo unico que app.js conoce.
     Cada metodo devuelve una Promesa para que el cambio a
     Supabase (que es asincrono) no obligue a tocar la UI.
     ============================================================ */
  return {
    mode: 'local',
    uid: uid,
    today: today,

    /* Carga el estado completo del cuartel. */
    load: function () { return Promise.resolve(read()); },

    /* Devuelve el estado ya cargado, sin esperar (para renders). */
    state: function () { return read(); },

    /* Guarda todo el estado tal cual esta en memoria.
       En Supabase esto se parte por entidad; ver README. */
    persist: function () { return write(); },

    /* ---- tareas ---- */
    addTask: function (task) {
      task.id = task.id || uid();
      read().tasks.unshift(task);
      return write().then(function () { return task; });
    },
    updateTask: function (id, patch) {
      var t = read().tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return Promise.reject(new Error('tarea no encontrada'));
      Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
      return write().then(function () { return t; });
    },
    removeTask: function (id) {
      var s = read();
      s.tasks = s.tasks.filter(function (x) { return x.id !== id; });
      return write();
    },

    /* ---- validacion (el corazon de B+: hecho vs. demostrado) ---- */
    validateTask: function (id, mode, proof) {
      var s = read();
      var t = s.tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return Promise.reject(new Error('tarea no encontrada'));
      if (proof) t.note = proof;
      t.col = 'done';
      t.mode = (mode === 'proof') ? 'proof' : 'plain';
      var pts = (t.mode === 'proof') ? 100 : 40;
      var owner = t.who || s.who || s.members[0].id;
      s.xp[owner] = (s.xp[owner] || 0) + pts;
      s.log.push({ date: today(), id: id, who: owner, mode: t.mode, pts: pts });
      return write().then(function () { return { task: t, pts: pts, owner: owner }; });
    },

    /* ---- hitos, apartados, miembros, preferencias ---- */
    setHito: function (id, pct) {
      var h = read().hitos.filter(function (x) { return x.id === id; })[0];
      if (!h) return Promise.reject(new Error('hito no encontrado'));
      h.pct = Math.max(0, Math.min(100, pct));
      return write().then(function () { return h; });
    },
    addNote: function (note) {
      note.id = note.id || uid();
      read().notes.unshift(note);
      return write().then(function () { return note; });
    },
    updateNote: function (id, patch) {
      var n = read().notes.filter(function (x) { return x.id === id; })[0];
      if (!n) return Promise.reject(new Error('apartado no encontrado'));
      Object.keys(patch).forEach(function (k) { n[k] = patch[k]; });
      return write();
    },
    removeNote: function (id) {
      var s = read();
      s.notes = s.notes.filter(function (x) { return x.id !== id; });
      return write();
    },
    updateMember: function (id, patch) {
      var m = read().members.filter(function (x) { return x.id === id; })[0];
      if (!m) return Promise.reject(new Error('miembro no encontrado'));
      Object.keys(patch).forEach(function (k) { m[k] = patch[k]; });
      return write();
    },
    setWho: function (id) { read().who = id; return write(); },
    setTheme: function (t) { read().theme = t; return write(); },

    /* ---- respaldo ---- */
    exportJSON: function () { return JSON.stringify(read(), null, 2); },
    importJSON: function (text) {
      var data = JSON.parse(text);
      if (!data || !data.tasks) throw new Error('Ese archivo no parece un respaldo del cuartel.');
      cache = migrate(data);
      return write();
    },
    reset: function () { cache = seed(); return write(); }
  };
})();
