import * as L from './logic.js';
import * as DB from './db.js';
import { zipBytes, xlsxBytes } from './export.js';

export const VERSION = '1.1.0';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const hoy = () => L.hoyStr();
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (min) => (min == null ? '' : `${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}`);
const euros = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const numES = (n) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const parseNum = (s) => {
  const t = String(s ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) ? n : NaN;
};
const fechaES = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

const svg = (p, w = 2) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  reloj: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 1.8),
  recibo: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>', 1.8),
  calendario: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', 1.8),
  barras: svg('<path d="M5 20V10M12 20V4M19 20v-7"/>', 1.8),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 1.8),
  atras: svg('<path d="M15 5l-7 7 7 7"/>'),
  sig: svg('<path d="M9 5l7 7-7 7"/>'),
  abajo: svg('<path d="M6 9l6 6 6-6"/>', 2.4),
  lapiz: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  camara: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 1.8),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};

function toast(msg, accion) {
  document.getElementById('toast')?.remove();
  const el = document.createElement('div');
  el.id = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${accion ? `<button>${esc(accion.label)}</button>` : ''}`;
  document.body.appendChild(el);
  if (accion) el.querySelector('button').onclick = () => { el.remove(); accion.fn(); };
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.remove(), accion ? 12000 : 2800);
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let S = null;
const estadoVacio = () => ({
  v: 1,
  obras: [], avisos: [], tramos: [], dias: {}, festivos: [], dietas: {}, gastos: [],
  inicial: null,
  ajustes: { compDefecto: 'cobro', ultimaCopia: null, usoAvisos: {} },
});

async function cargar() {
  S = (await DB.leer('estado')) || estadoVacio();
  const base = estadoVacio();
  for (const k of Object.keys(base)) if (S[k] == null) S[k] = base[k];
  S.ajustes = { ...base.ajustes, ...S.ajustes };
}

let cola = Promise.resolve();
function guardar() {
  const copia = JSON.parse(JSON.stringify(S));
  cola = cola.then(() => DB.escribir('estado', copia)).catch((e) => toast('No se pudo guardar: ' + e.message));
  return cola;
}
function commit() {
  guardar();
  render();
}

const cache = new Map();
const fset = () => {
  if (!cache.has('fs')) cache.set('fs', new Set(S.festivos));
  return cache.get('fs');
};
const tramosDe = (f) => S.tramos.filter((t) => t.fecha === f);
const dia = (f) => (S.dias[f] ||= {});
function objetivoDia(f) {
  const d = S.dias[f];
  return d && d.jornada != null ? d.jornada : L.jornadaBase(f, fset());
}
function calcDia(f) {
  const k = 'd' + f;
  if (cache.has(k)) return cache.get(k);
  const fs = fset();
  const ts = tramosDe(f);
  const laborable = L.esLaborable(f, fs);
  const objetivo = objetivoDia(f);
  const segs = L.clasificarDia(ts, { objetivo, laborable, ahora: f === hoy() ? L.ahoraMin() : null, compDefecto: S.ajustes.compDefecto });
  const r = {
    f, ts, segs, tot: L.totales(segs), objetivo, base: L.jornadaBase(f, fs),
    laborable, verano: L.esVerano(f), festivo: fs.has(f),
  };
  cache.set(k, r);
  return r;
}
function resumen(fechas) {
  const r = { objetivo: 0, jornada: 0, prol: 0, extra: 0, comida: 0, porTipo: Object.fromEntries(L.TIPOS.map((t) => [t.id, 0])), festivos: 0 };
  for (const f of fechas) {
    const d = calcDia(f);
    r.objetivo += d.base;
    r.jornada += d.tot.jornada;
    r.prol += d.tot.prol;
    r.extra += d.tot.extra;
    r.comida += d.tot.comida;
    if (d.festivo && L.diaSemana(f) <= 5) r.festivos++;
    for (const t of L.TIPOS) r.porTipo[t.id] += d.tot.porTipo[t.id];
  }
  return r;
}
function libros() {
  if (cache.has('libros')) return cache.get('libros');
  const ini = S.inicial;
  const desde = ini?.fecha || '';
  const fechas = [...new Set(S.tramos.map((t) => t.fecha))].filter((f) => f > desde).sort();
  const movs = [], extras = [], libExtra = [], porDia = [];
  for (const f of fechas) {
    const d = calcDia(f);
    let gen = 0, lib = 0;
    for (const s of d.segs) {
      const m = s.fin - s.ini;
      if (s.tipo === 'prolongacion') gen += m;
      else if (s.tipo === 'libranza_prol') lib += m;
      else if (s.tipo === 'extra') extras.push({ fecha: f, min: m, comp: s.comp });
      else if (s.tipo === 'libranza_extra') libExtra.push({ fecha: f, min: m });
    }
    if (gen) { movs.push({ fecha: f, min: gen }); porDia.push({ fecha: f, concepto: 'Prolongación', min: gen }); }
    if (lib) { movs.push({ fecha: f, min: -lib }); porDia.push({ fecha: f, concepto: 'Libranza prolongación', min: -lib }); }
  }
  const prol = L.libroProlongacion(ini ? { fecha: ini.fecha, lotes: ini.prolLotes || [], netoAnual: ini.prolNetoAnual || 0 } : null, movs, hoy());
  const ext = L.libroExtras(ini ? { fecha: ini.fecha, cobro: ini.extrasCobro || 0, parcial: ini.extrasParcial || 0, total: ini.extrasTotal || 0, bolsa: ini.bolsaExtra || 0 } : null, extras, libExtra, hoy());
  const r = { prol, ext, movimientos: porDia.reverse().slice(0, 8) };
  cache.set('libros', r);
  return r;
}

const avisoPorId = (id) => S.avisos.find((a) => a.id === id);
const obraPorId = (id) => S.obras.find((o) => o.id === id);
function infoAviso(id) {
  const a = avisoPorId(id);
  if (!a) return null;
  const obra = obraPorId(a.obraId)?.nombre || '';
  const desc = a.descripcion || '';
  return { num: a.numero || '', desc, obra, texto: [desc, obra].filter(Boolean).join(' · ') };
}
const SIN_NUM = '<span class="sinnum">Sin nº</span>';
function avisoHTML(id, vacio = 'Sin aviso') {
  const i = infoAviso(id);
  if (!i) return `<span class="muted">${vacio}</span>`;
  return `${i.num ? `<span class="mono">${esc(i.num)}</span>` : SIN_NUM}${i.texto ? ' · ' + esc(i.texto) : ''}`;
}
/** Avisos con horas o gastos que todavía no tienen número. */
function avisosSinNumero() {
  const usados = new Set([...S.tramos.map((t) => t.avisoId), ...S.gastos.map((g) => g.avisoId)]);
  return S.avisos.filter((a) => !a.numero && !a.archivado && usados.has(a.id));
}
function unirAvisos(desde, hacia) {
  for (const t of S.tramos) if (t.avisoId === desde) t.avisoId = hacia;
  for (const g of S.gastos) if (g.avisoId === desde) g.avisoId = hacia;
  for (const k of Object.keys(S.dietas)) {
    if (k.slice(11) !== desde) continue;
    const k2 = `${k.slice(0, 10)}|${hacia}`;
    const a = S.dietas[k], b = S.dietas[k2] || {};
    S.dietas[k2] = Object.fromEntries(L.DIETAS.map((d) => [d.id, !!(a[d.id] || b[d.id])]));
    delete S.dietas[k];
  }
  for (const d of Object.values(S.dias)) {
    if (d.avisosGasto) d.avisosGasto = [...new Set(d.avisosGasto.map((x) => (x === desde ? hacia : x)))];
  }
  delete S.ajustes.usoAvisos[desde];
  S.avisos = S.avisos.filter((a) => a.id !== desde);
  S.tramos = L.fusionar(S.tramos);
}

// Campos comunes para crear o modificar un aviso
function camposAviso({ num = '', desc = '', obraId = '' } = {}) {
  const obras = S.obras.filter((o) => !o.archivada || o.id === obraId);
  return `<label class="field">Número de aviso<input class="mono" data-s="num" value="${esc(num)}" placeholder="460945671-1" autocomplete="off" autocapitalize="off"><span class="help">Si aún no lo tienes, déjalo vacío y pon una descripción. Lo completas cuando lo tengas.</span></label>
    <label class="field">Descripción<input data-s="desc" value="${esc(desc)}" placeholder="Ej.: avería compresor línea 2" autocomplete="off"></label>
    <label class="field">Obra<select data-s="obra">
      <option value="">— Sin obra (la pongo luego) —</option>
      ${obras.map((o) => `<option value="${o.id}" ${o.id === obraId ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}
      <option value="__nueva">+ Obra nueva…</option>
    </select></label>
    <label class="field hidden" data-s="obraWrap">Obra nueva (código y descripción)<input data-s="obraNueva" placeholder="31PO-4156 Quesería Manolito" autocomplete="off"></label>`;
}
function enlazarCamposAviso(panel) {
  const q = (s) => panel.querySelector(`[data-s="${s}"]`);
  q('obra').addEventListener('change', (e) => q('obraWrap').classList.toggle('hidden', e.target.value !== '__nueva'));
}
/** Lee y valida los campos. Devuelve {num, desc, obraId} o {error}. Crea la obra nueva si hace falta. */
function leerCamposAviso(panel) {
  const q = (s) => panel.querySelector(`[data-s="${s}"]`);
  const num = q('num').value.trim().replace(/[\s./_]+/g, '-');
  const desc = q('desc').value.trim();
  if (!num && !desc) return { error: 'Pon el número de aviso o, si aún no lo tienes, una descripción.' };
  let obraId = q('obra').value || null;
  if (obraId === '__nueva') {
    const nombre = q('obraNueva').value.trim();
    if (!nombre) return { error: 'Escribe la obra nueva (código y descripción).' };
    const ya = S.obras.find((o) => o.nombre.toLowerCase() === nombre.toLowerCase());
    if (ya) obraId = ya.id;
    else { obraId = uid(); S.obras.push({ id: obraId, nombre, archivada: false }); }
  }
  return { num, desc, obraId };
}
const usar = (id) => { if (id) S.ajustes.usoAvisos[id] = Date.now(); };
function ultimoAviso() {
  let mejor = null, t = 0;
  for (const [id, ts] of Object.entries(S.ajustes.usoAvisos)) {
    const a = avisoPorId(id);
    if (a && !a.archivado && ts > t) { t = ts; mejor = id; }
  }
  return mejor;
}
const tramoAbierto = () => S.tramos.find((t) => t.fin == null);

// ---------------------------------------------------------------------------
// Hojas inferiores (diálogos)
// ---------------------------------------------------------------------------
let sheetCancel = null;
let esperandoPop = null;

function mostrarSheet(html, cancel) {
  document.getElementById('sheet')?.remove();
  const el = document.createElement('div');
  el.id = 'sheet';
  el.innerHTML = `<div class="panel" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  el.addEventListener('click', (e) => { if (e.target === el) cancelarSheet(); });
  document.body.appendChild(el);
  if (!(history.state && history.state.sheet)) history.pushState({ sheet: true }, '');
  sheetCancel = cancel || null;
  return el.querySelector('.panel');
}
function cerrarSheet() {
  return new Promise((res) => {
    document.getElementById('sheet')?.remove();
    sheetCancel = null;
    if (history.state && history.state.sheet) { esperandoPop = res; history.back(); } else res();
  });
}
async function cancelarSheet() {
  const c = sheetCancel;
  await cerrarSheet();
  if (c) c();
}
window.addEventListener('popstate', () => {
  if (esperandoPop) { const r = esperandoPop; esperandoPop = null; r(); return; }
  const el = document.getElementById('sheet');
  if (el) { el.remove(); const c = sheetCancel; sheetCancel = null; if (c) c(); }
});
const cabeceraSheet = (titulo) => `<div class="sheet-head"><h3>${esc(titulo)}</h3><button class="iconbtn plain" data-s="x" aria-label="Cerrar">${IC.x}</button></div>`;

function elegirOpcion(titulo, opciones, actual) {
  return new Promise((resolve) => {
    const panel = mostrarSheet(`${cabeceraSheet(titulo)}
      <div style="display:flex;flex-direction:column;gap:6px">${opciones.map((o) => `<button class="choice" data-s="op" data-v="${esc(o.v)}" aria-pressed="${o.v === actual}">${esc(o.l)}${o.d ? `<div class="small muted" style="font-weight:400">${esc(o.d)}</div>` : ''}</button>`).join('')}</div>`, () => resolve(undefined));
    panel.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      if (b.dataset.s === 'x') return cancelarSheet();
      if (b.dataset.s === 'op') { await cerrarSheet(); resolve(b.dataset.v); }
    });
  });
}

function pedirValor(titulo, { valor = '', ayuda = '', mono = false, extra = null, tipo = 'text' } = {}) {
  return new Promise((resolve) => {
    const panel = mostrarSheet(`${cabeceraSheet(titulo)}
      <label class="field"><input data-s="v" type="${tipo}" class="${mono ? 'mono' : ''}" value="${esc(valor)}" autocomplete="off">${ayuda ? `<span class="help">${esc(ayuda)}</span>` : ''}</label>
      <div class="grid2">${extra ? `<button class="btn" data-s="extra">${esc(extra)}</button>` : '<span></span>'}<button class="btn primary" data-s="ok">Aceptar</button></div>`, () => resolve(undefined));
    const inp = panel.querySelector('[data-s="v"]');
    setTimeout(() => inp.focus(), 50);
    panel.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      if (b.dataset.s === 'x') return cancelarSheet();
      if (b.dataset.s === 'extra') { await cerrarSheet(); resolve({ extra: true }); }
      if (b.dataset.s === 'ok') { const v = inp.value; await cerrarSheet(); resolve(v); }
    });
  });
}

function filaAviso(a, actual) {
  const o = obraPorId(a.obraId);
  const texto = [a.descripcion, o?.nombre].filter(Boolean).join(' · ') || 'Sin obra';
  return `<button data-s="pick" data-id="${a.id}"><span class="num">${a.numero ? esc(a.numero) : SIN_NUM}${a.id === actual ? ' ✓' : ''}</span><span class="ob">${esc(texto)}</span></button>`;
}

function elegirAviso({ titulo = 'Elige el aviso', permitirNinguno = false, actual = null, soloNuevo = false } = {}) {
  return new Promise((resolve) => {
    let confirmarFormato = false;
    const lista = (q) => {
      q = (q || '').trim().toLowerCase();
      const avs = S.avisos.filter((a) => !a.archivado)
        .filter((a) => !q || [a.numero, a.descripcion, obraPorId(a.obraId)?.nombre].some((x) => (x || '').toLowerCase().includes(q)))
        .sort((x, y) => (S.ajustes.usoAvisos[y.id] || 0) - (S.ajustes.usoAvisos[x.id] || 0));
      if (!avs.length) return `<div class="empty">${S.avisos.length ? 'Ningún aviso coincide.' : 'Aún no tienes avisos. Crea el primero aquí abajo.'}</div>`;
      return avs.map((a) => filaAviso(a, actual)).join('');
    };
    const panel = mostrarSheet(`${cabeceraSheet(titulo)}
      ${soloNuevo ? '' : `<input class="input" type="search" placeholder="Buscar por número, descripción u obra" data-s="q" aria-label="Buscar aviso" autocomplete="off">
      <div class="picklist" data-s="lista">${lista('')}</div>
      ${permitirNinguno ? '<button class="btn" data-s="ninguno">Sin aviso</button>' : ''}`}
      <details data-s="nuevo" ${soloNuevo || !S.avisos.length ? 'open' : ''}>
        <summary class="btn dashed" style="list-style:none;width:100%">+ Nuevo aviso</summary>
        <div class="card" style="margin-top:8px">
          ${camposAviso()}
          <p class="field"><span class="err" data-s="err"></span></p>
          <button class="btn primary" data-s="crear">Crear y elegir</button>
        </div>
      </details>`, () => resolve(undefined));
    const $ = (s) => panel.querySelector(`[data-s="${s}"]`);
    enlazarCamposAviso(panel);
    $('q')?.addEventListener('input', (e) => { $('lista').innerHTML = lista(e.target.value); });
    $('num').addEventListener('input', () => { confirmarFormato = false; $('err').textContent = ''; });
    panel.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-s]');
      if (!b || b.tagName === 'SUMMARY' || b.tagName === 'DETAILS') return;
      const s = b.dataset.s;
      if (s === 'x') return cancelarSheet();
      if (s === 'pick') { await cerrarSheet(); resolve(b.dataset.id); }
      if (s === 'ninguno') { await cerrarSheet(); resolve(null); }
      if (s === 'crear') {
        const numPrevio = $('num').value.trim().replace(/[\s./_]+/g, '-');
        const existe = numPrevio && S.avisos.find((a) => a.numero === numPrevio);
        if (existe) { existe.archivado = false; usar(existe.id); guardar(); await cerrarSheet(); resolve(existe.id); return; }
        if (numPrevio && !L.avisoValido(numPrevio) && !confirmarFormato) {
          confirmarFormato = true;
          $('err').textContent = 'El formato no es el habitual (9 dígitos-guion-dígitos). Pulsa otra vez para crearlo igualmente.';
          return;
        }
        const r = leerCamposAviso(panel);
        if (r.error) { $('err').textContent = r.error; return; }
        const id = uid();
        S.avisos.push({ id, numero: r.num, descripcion: r.desc, obraId: r.obraId, archivado: false });
        usar(id);
        guardar();
        await cerrarSheet();
        resolve(id);
      }
    });
  });
}

/** Modificar un aviso: completar el número, cambiar descripción u obra, archivarlo. */
function editarAviso(id) {
  const a = avisoPorId(id);
  if (!a) return;
  let confirmarFormato = false;
  const panel = mostrarSheet(`${cabeceraSheet(a.numero ? 'Aviso ' + a.numero : 'Aviso sin número')}
    ${camposAviso({ num: a.numero, desc: a.descripcion, obraId: a.obraId || '' })}
    <p class="field"><span class="err" data-s="err"></span></p>
    <div class="grid2"><button class="btn" data-s="arch">${a.archivado ? 'Recuperar aviso' : 'Archivar aviso'}</button><button class="btn primary" data-s="ok">Guardar</button></div>
    <p class="small muted" style="margin:0">Los avisos archivados no salen al elegir aviso, pero sus horas y gastos se conservan.</p>`);
  enlazarCamposAviso(panel);
  const $ = (s) => panel.querySelector(`[data-s="${s}"]`);
  $('num').addEventListener('input', () => { confirmarFormato = false; $('err').textContent = ''; });
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-s]');
    if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
    const s = b.dataset.s;
    if (s === 'x') return cancelarSheet();
    if (s === 'arch') {
      a.archivado = !a.archivado;
      await cerrarSheet();
      commit();
      return;
    }
    if (s === 'ok') {
      const r = leerCamposAviso(panel);
      if (r.error) { $('err').textContent = r.error; return; }
      if (r.num && !L.avisoValido(r.num) && !confirmarFormato) {
        confirmarFormato = true;
        $('err').textContent = 'El formato no es el habitual (9 dígitos-guion-dígitos). Pulsa otra vez para guardarlo igualmente.';
        return;
      }
      const otro = r.num && S.avisos.find((x) => x.id !== a.id && x.numero === r.num);
      if (otro) {
        if (!confirm(`Ya tienes el aviso ${r.num}. ¿Unir los dos? Las horas, dietas y gastos de este pasarán a ese.`)) return;
        if (!otro.descripcion && r.desc) otro.descripcion = r.desc;
        if (!otro.obraId && r.obraId) otro.obraId = r.obraId;
        otro.archivado = false;
        unirAvisos(a.id, otro.id);
      } else {
        a.numero = r.num;
        a.descripcion = r.desc;
        a.obraId = r.obraId;
      }
      await cerrarSheet();
      commit();
      toast('Aviso guardado');
    }
  });
}

// ---------------------------------------------------------------------------
// Fichaje
// ---------------------------------------------------------------------------
function abrirTramo(clase, avisoId, ahora) {
  S.tramos.push({ id: uid(), fecha: hoy(), ini: ahora, fin: null, clase, tipo: null, avisoId: avisoId || null, comp: S.ajustes.compDefecto, comentario: '' });
  usar(avisoId);
}
function cerrarAbierto(ahora) {
  const t = tramoAbierto();
  if (!t) return null;
  if (ahora <= t.ini) S.tramos = S.tramos.filter((x) => x !== t);
  else t.fin = ahora;
  return t;
}
function abiertoAntiguo() {
  const t = tramoAbierto();
  if (t && t.fecha !== hoy()) {
    toast('Primero cierra el tramo que quedó abierto');
    editarTramo(t.id);
    return true;
  }
  return false;
}
function avisoTrabajoReciente() {
  const ts = tramosDe(hoy()).filter((t) => t.clase === 'trabajo' && t.avisoId).sort((a, b) => b.ini - a.ini);
  return ts[0]?.avisoId || null;
}

const ACC = {
  async salirCasa() {
    if (abiertoAntiguo()) return;
    const ahora = L.ahoraMin();
    const a = await elegirAviso({ titulo: '¿A qué aviso vas?' });
    if (a === undefined) return;
    abrirTramo('desplazamiento', a, ahora);
    commit();
  },
  async empezar() {
    if (abiertoAntiguo()) return;
    const ahora = L.ahoraMin();
    const a = await elegirAviso({ titulo: '¿En qué aviso trabajas?' });
    if (a === undefined) return;
    abrirTramo('trabajo', a, ahora);
    commit();
  },
  llegoCliente() {
    const ahora = L.ahoraMin();
    const t = cerrarAbierto(ahora);
    abrirTramo('trabajo', t?.avisoId, ahora);
    commit();
  },
  terminar() {
    cerrarAbierto(L.ahoraMin());
    commit();
    toast('Tramo cerrado. Revisa el día cuando quieras.');
  },
  comer() {
    const ahora = L.ahoraMin();
    cerrarAbierto(ahora);
    abrirTramo('comida', null, ahora);
    commit();
  },
  volver() {
    const ahora = L.ahoraMin();
    cerrarAbierto(ahora);
    abrirTramo('trabajo', avisoTrabajoReciente(), ahora);
    commit();
  },
  async cambioAviso() {
    const ahora = L.ahoraMin();
    const a = await elegirAviso({ titulo: 'Nuevo aviso', actual: tramoAbierto()?.avisoId });
    if (a === undefined) return;
    cerrarAbierto(ahora);
    abrirTramo('trabajo', a, ahora);
    commit();
  },
  async salgoCliente() {
    const ahora = L.ahoraMin();
    const op = await elegirOpcion('¿A dónde vas?', [
      { v: 'casa', l: 'Vuelvo a casa o al hotel' },
      { v: 'otro', l: 'Voy a otro aviso' },
    ]);
    if (op === undefined) return;
    let aviso = tramoAbierto()?.avisoId;
    if (op === 'otro') {
      const a = await elegirAviso({ titulo: '¿A qué aviso vas?' });
      if (a === undefined) return;
      aviso = a;
    }
    cerrarAbierto(ahora);
    abrirTramo('desplazamiento', aviso, ahora);
    commit();
  },
  nuevoTramo(d) {
    const pre = d.ini != null ? { ini: +d.ini, fin: +d.fin, avisoId: d.aviso || null } : null;
    editarTramo(null, d.fecha, pre);
  },
  editTramo(d) { editarTramo(d.id); },
  async tipoSeg(d) { await cambiarTipoSegmento(d.id, +d.ini, +d.fin); },
  comp(d) {
    const t = S.tramos.find((x) => x.id === d.id);
    if (t) { t.comp = d.v; commit(); }
  },
  async objetivo(d) {
    const f = d.f;
    const base = L.jornadaBase(f, fset());
    const r = await pedirValor('Jornada ordinaria de este día', {
      valor: L.fmtHM(objetivoDia(f)), mono: true,
      ayuda: `Lo normal es ${L.fmtHM(base)}. Puedes hacer más un día y menos otro de la misma semana (máximo 12:00). Formato h:mm.`,
      extra: `Volver a ${L.fmtHM(base)}`,
    });
    if (r === undefined) return;
    if (r.extra) delete dia(f).jornada;
    else {
      const m = L.parseDuracion(r);
      if (m == null || m < 0 || m > L.ORD_MAX_DIA) { toast('Valor no válido (entre 0:00 y 12:00)'); return; }
      dia(f).jornada = m;
    }
    commit();
  },
  festivo(d) {
    const i = S.festivos.indexOf(d.f);
    if (i >= 0) S.festivos.splice(i, 1);
    else S.festivos.push(d.f);
    S.festivos.sort();
    commit();
  },
  atras() {
    if (history.length > 1) history.back();
    else location.hash = '#/hoy';
  },
  // Gastos
  dieta(d) {
    const k = `${d.f}|${d.aviso}`;
    const v = { ...(S.dietas[k] || {}) };
    v[d.d] = !v[d.d];
    if (Object.values(v).some(Boolean)) S.dietas[k] = v;
    else delete S.dietas[k];
    commit();
  },
  nuevoGasto(d) { editarGasto(null, d.f, d.aviso || null); },
  editGasto(d) { editarGasto(d.id); },
  async avisoGastos(d) {
    const a = await elegirAviso({ titulo: 'Añadir aviso a este día' });
    if (!a) return;
    const x = dia(d.f);
    x.avisosGasto = [...new Set([...(x.avisosGasto || []), a])];
    usar(a);
    commit();
  },
  // Resumen
  resModo(d) { R.modo = d.v; render(); },
  resVista(d) { R.vista = d.v; render(); },
  resMover(d) {
    const ref = R.ref || hoy();
    if (R.modo === 'semana') R.ref = L.addDias(ref, 7 * +d.v);
    else {
      const [y, m] = ref.split('-').map(Number);
      const nd = new Date(y, m - 1 + +d.v, 1);
      R.ref = L.fmtFecha(nd);
    }
    render();
  },
  resHoy() { R.ref = null; render(); },
  exportExcel() { exportarExcel(); },
  exportPDF() { imprimir(); },
  async exportTickets() { await exportarTickets(); },
  // Ajustes
  addFestivo() {
    const v = document.getElementById('nuevoFestivo').value;
    if (!v) { toast('Elige una fecha'); return; }
    if (!S.festivos.includes(v)) { S.festivos.push(v); S.festivos.sort(); }
    commit();
    toast(`${L.fechaLarga(v, true)} marcado como festivo`);
  },
  delFestivo(d) { S.festivos = S.festivos.filter((f) => f !== d.f); commit(); },
  guardarSaldos() { guardarSaldos(); },
  compDef(d) { S.ajustes.compDefecto = d.v; commit(); },
  async renombrarObra(d) {
    const o = obraPorId(d.id);
    if (!o) return;
    const r = await pedirValor('Obra (código y descripción)', { valor: o.nombre, extra: o.archivada ? 'Recuperar obra' : 'Archivar obra' });
    if (r === undefined) return;
    if (r.extra) { o.archivada = !o.archivada; S.avisos.filter((a) => a.obraId === o.id).forEach((a) => { a.archivado = o.archivada; }); }
    else if (r.trim()) o.nombre = r.trim();
    commit();
  },
  editarAviso(d) { editarAviso(d.id); },
  async nuevoAviso() {
    const a = await elegirAviso({ titulo: 'Nuevo aviso', soloNuevo: true });
    if (a) { commit(); toast('Aviso creado'); }
  },
  verArchivados() { verArchivados = !verArchivados; render(); },
  async copiaDescargar() { await hacerCopia(false); },
  async copiaCompartir() { await hacerCopia(true); },
};

// ---------------------------------------------------------------------------
// Editor de tramo
// ---------------------------------------------------------------------------
function editarTramo(id, fechaNueva, pre = null) {
  const t0 = id ? S.tramos.find((t) => t.id === id) : null;
  if (id && !t0) return;
  const tmp = t0 ? { ...t0 } : {
    id: uid(), fecha: fechaNueva || hoy(), ini: pre?.ini ?? null, fin: pre?.fin ?? null, clase: 'trabajo', tipo: null,
    avisoId: pre ? pre.avisoId : ultimoAviso(), comp: S.ajustes.compDefecto, comentario: '',
  };
  let enCurso = !!t0 && t0.fin == null;
  let confirmarSolape = false;
  let panel;

  const leer = () => {
    const q = (s) => panel.querySelector(`[data-s="${s}"]`);
    tmp.fecha = q('fecha').value || tmp.fecha;
    tmp.ini = L.parseHora(q('ini').value);
    const fin = L.parseHora(q('fin').value);
    tmp.fin = fin;
    enCurso = q('curso') ? q('curso').checked : false;
    tmp.comentario = q('com').value;
    if (tmp.tipo && !L.llevaAviso(tmp.tipo)) tmp.avisoId = null;
  };
  const modo = () => (tmp.tipo ? tmp.tipo : 'auto:' + tmp.clase);
  const btnModo = (v, l) => `<button class="choice" data-s="modo" data-v="${v}" aria-pressed="${modo() === v}">${esc(l)}</button>`;

  const pintar = () => {
    const esHoy = tmp.fecha === hoy();
    const finMostrado = tmp.fin == null ? '' : hhmm(tmp.fin);
    panel = mostrarSheet(`${cabeceraSheet(t0 ? 'Modificar tramo' : 'Nuevo tramo')}
      <label class="field">Fecha<input type="date" data-s="fecha" value="${tmp.fecha}"></label>
      <div class="grid2">
        <label class="field">Inicio<input type="time" data-s="ini" value="${hhmm(tmp.ini)}"></label>
        <label class="field">Fin<input type="time" data-s="fin" value="${finMostrado}" ${enCurso ? 'disabled' : ''}></label>
      </div>
      ${esHoy || enCurso ? `<label style="display:flex;gap:10px;align-items:center;font-size:14px;min-height:40px"><input type="checkbox" data-s="curso" ${enCurso ? 'checked' : ''} style="width:22px;height:22px"> Todavía en curso (sin hora de fin)</label>` : ''}
      <button class="linkbtn" data-s="completa" style="align-self:flex-start">Poner jornada completa (08:00 + ${L.fmtHM(objetivoDia(tmp.fecha) || L.JORNADA_INVIERNO)})</button>
      <div class="label-up">Qué es</div>
      <div class="grid3">${btnModo('auto:trabajo', 'Trabajo')}${btnModo('auto:desplazamiento', 'Viaje')}${btnModo('auto:comida', 'Comida')}</div>
      <p class="small muted" style="margin:0">Con «Trabajo» y «Viaje» la app decide si es ordinaria, prolongación o extra. Si prefieres fijarlo tú, elige el tipo:</p>
      <div class="grid2">${L.TIPOS.filter((t) => t.id !== 'comida').map((t) => btnModo(t.id, t.label)).join('')}</div>
      <div class="label-up">Si sale extra, ¿cómo la compensas?</div>
      <div class="segm small">${Object.keys(L.COMP).map((c) => `<button data-s="comp" data-v="${c}" aria-pressed="${tmp.comp === c}">${L.COMP[c]}</button>`).join('')}</div>
      ${tmp.tipo && !L.llevaAviso(tmp.tipo) ? '<p class="small muted" style="margin:0">Este tipo de hora no lleva aviso ni obra.</p>' : `<div class="label-up">Aviso</div>
      <button class="choice" data-s="aviso">${tmp.avisoId ? avisoHTML(tmp.avisoId) : '<span class="muted">Sin aviso · tocar para elegir</span>'}</button>`}
      <label class="field">Comentario<textarea data-s="com" rows="2">${esc(tmp.comentario)}</textarea></label>
      <p class="field"><span class="err" data-s="err"></span></p>
      <div class="grid2">${t0 ? '<button class="btn danger" data-s="del">Eliminar</button>' : '<span></span>'}<button class="btn primary" data-s="ok">Guardar</button></div>`);
    const q = (s) => panel.querySelector(`[data-s="${s}"]`);
    q('curso')?.addEventListener('change', (e) => { q('fin').disabled = e.target.checked; });
    panel.addEventListener('click', onClick);
  };

  async function onClick(e) {
    const b = e.target.closest('[data-s]');
    if (!b || b.tagName === 'INPUT' || b.tagName === 'TEXTAREA') return;
    const s = b.dataset.s;
    const err = (m) => { panel.querySelector('[data-s="err"]').textContent = m; };
    if (s === 'x') return cancelarSheet();
    if (s === 'modo') {
      leer();
      const v = b.dataset.v;
      if (v.startsWith('auto:')) { tmp.tipo = null; tmp.clase = v.slice(5); }
      else { tmp.tipo = v; if (v === 'desplazamiento') tmp.clase = 'desplazamiento'; else tmp.clase = 'trabajo'; }
      if (tmp.tipo && !L.llevaAviso(tmp.tipo)) tmp.avisoId = null;
      else if (!tmp.avisoId) tmp.avisoId = ultimoAviso();
      pintar();
      return;
    }
    if (s === 'comp') { leer(); tmp.comp = b.dataset.v; pintar(); return; }
    if (s === 'completa') {
      leer();
      tmp.ini = 480;
      tmp.fin = 480 + (objetivoDia(tmp.fecha) || L.JORNADA_INVIERNO);
      enCurso = false;
      pintar();
      return;
    }
    if (s === 'aviso') {
      leer();
      const a = await elegirAviso({ titulo: 'Aviso del tramo', permitirNinguno: true, actual: tmp.avisoId });
      if (a !== undefined) tmp.avisoId = a;
      pintar();
      return;
    }
    if (s === 'del') {
      if (!confirm('¿Eliminar este tramo?')) return;
      S.tramos = S.tramos.filter((t) => t.id !== t0.id);
      await cerrarSheet();
      commit();
      toast('Tramo eliminado');
      return;
    }
    if (s === 'ok') {
      leer();
      if (tmp.ini == null) return err('Pon la hora de inicio.');
      if (enCurso) {
        const otro = S.tramos.find((t) => t.fin == null && t.id !== tmp.id);
        if (otro) return err('Ya hay otro tramo en curso. Ciérralo primero.');
        if (tmp.fecha !== hoy()) return err('Solo puede estar en curso un tramo de hoy.');
        tmp.fin = null;
      } else {
        if (tmp.fin == null) return err('Pon la hora de fin (o marca «en curso»).');
        if (tmp.fin === tmp.ini) return err('El inicio y el fin son iguales.');
        if (tmp.fin < tmp.ini) tmp.fin += 1440; // termina al día siguiente
      }
      const finEf = tmp.fin ?? L.ahoraMin();
      const solape = S.tramos.find((t) => t.id !== tmp.id && t.fecha === tmp.fecha && t.ini < finEf && (t.fin ?? L.ahoraMin()) > tmp.ini);
      if (solape && !confirmarSolape) {
        confirmarSolape = true;
        return err(`Se solapa con el tramo ${L.fmtHora(solape.ini)}–${solape.fin == null ? 'ahora' : L.fmtHora(solape.fin)}. Pulsa Guardar otra vez si es correcto.`);
      }
      if (t0) Object.assign(t0, tmp);
      else S.tramos.push(tmp);
      usar(tmp.avisoId);
      S.tramos = L.fusionar(S.tramos);
      await cerrarSheet();
      commit();
      toast('Guardado');
    }
  }
  pintar();
}

async function cambiarTipoSegmento(tramoId, ini, fin) {
  const t = S.tramos.find((x) => x.id === tramoId);
  if (!t) return;
  const ops = [{ v: '__auto', l: 'Automático', d: 'Lo que propone la app según la jornada' }, ...L.TIPOS.map((x) => ({ v: x.id, l: x.label }))];
  const v = await elegirOpcion('Tipo de hora de este tramo', ops, t.tipo || '__auto');
  if (v === undefined) return;
  const tipo = v === '__auto' ? null : v;
  const entero = ini <= t.ini && (t.fin == null || fin >= t.fin);
  if (entero) t.tipo = tipo;
  else {
    const trozos = L.partirTramo(t, Math.max(ini, t.ini), fin, tipo, uid);
    S.tramos = S.tramos.filter((x) => x !== t).concat(trozos);
  }
  S.tramos = L.fusionar(S.tramos);
  commit();
}

// ---------------------------------------------------------------------------
// Editor de gasto
// ---------------------------------------------------------------------------
async function comprimir(file) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const max = 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return blob || file;
  } catch {
    return file;
  }
}
const urls = new Map();
async function urlFoto(id) {
  if (urls.has(id)) return urls.get(id);
  const b = await DB.fotoLeer(id);
  if (!b) return null;
  const u = b.type === 'application/pdf' ? 'pdf' : URL.createObjectURL(b);
  urls.set(id, u);
  return u;
}
const PDF_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48"><rect width="40" height="48" fill="#ECEBE5"/><text x="20" y="29" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="#A3195B">PDF</text></svg>');
async function hidratarFotos(root = document) {
  for (const img of root.querySelectorAll('img[data-foto]')) {
    const u = await urlFoto(img.dataset.foto);
    if (u) img.src = u === 'pdf' ? PDF_ICON : u;
  }
}

function editarGasto(id, fecha, avisoId) {
  const g0 = id ? S.gastos.find((g) => g.id === id) : null;
  if (id && !g0) return;
  const tmp = g0 ? { ...g0, fotos: [...(g0.fotos || [])] } : { id: uid(), fecha, avisoId, cat: 'Peaje', importe: null, km: null, detalle: '', fotos: [] };
  const nuevas = [], quitadas = [];
  let panel;
  const leer = () => {
    const q = (s) => panel.querySelector(`[data-s="${s}"]`);
    if (q('km')) tmp.km = parseNum(q('km').value);
    if (q('importe')) tmp.importe = parseNum(q('importe').value);
    tmp.detalle = q('detalle').value;
  };
  const thumbs = () => tmp.fotos.map((f) => `<div class="thumb"><img data-foto="${f}" alt="Ticket" data-s="ver" data-id="${f}"><button data-s="quitarFoto" data-id="${f}" aria-label="Quitar foto">×</button></div>`).join('') || '<span class="small muted">Sin fotos</span>';
  const pintar = () => {
    const km = tmp.cat === 'Kilómetros';
    panel = mostrarSheet(`${cabeceraSheet(g0 ? 'Modificar gasto' : 'Nuevo gasto')}
      <div class="small muted">${L.fechaLarga(tmp.fecha, true)}</div>
      <button class="choice" data-s="aviso">${tmp.avisoId ? avisoHTML(tmp.avisoId) : '<span class="muted">Elegir aviso</span>'}</button>
      <div class="grid3">${L.CATEGORIAS_GASTO.map((c) => `<button class="choice" style="text-align:center;padding:0 4px" data-s="cat" data-v="${c}" aria-pressed="${tmp.cat === c}">${c}</button>`).join('')}</div>
      ${km
        ? `<label class="field">Kilómetros<input class="mono" data-s="km" inputmode="decimal" value="${tmp.km ?? ''}" placeholder="0"></label>`
        : `<label class="field">Importe (€)<input class="mono" data-s="importe" inputmode="decimal" value="${tmp.importe != null ? String(tmp.importe).replace('.', ',') : ''}" placeholder="0,00"></label>`}
      <label class="field">Detalle<input data-s="detalle" value="${esc(tmp.detalle)}" placeholder="${km ? 'Casa → cliente' : 'Opcional'}"></label>
      <div class="label-up">Ticket o factura</div>
      <div class="thumbs" data-s="thumbs">${thumbs()}</div>
      <div class="grid2">
        <label class="btn filebtn">${IC.camara} Hacer foto<input type="file" accept="image/*" capture="environment" data-s="foto"></label>
        <label class="btn filebtn">Galería o PDF<input type="file" accept="image/*,application/pdf" multiple data-s="foto"></label>
      </div>
      <p class="field"><span class="err" data-s="err"></span></p>
      <div class="grid2">${g0 ? '<button class="btn danger" data-s="del">Eliminar</button>' : '<span></span>'}<button class="btn primary" data-s="ok">Guardar</button></div>`,
    async () => { for (const f of nuevas) await DB.fotoBorrar(f); });
    hidratarFotos(panel);
    panel.querySelectorAll('[data-s="foto"]').forEach((inp) => inp.addEventListener('change', async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      leer();
      for (const f of files) {
        const blob = await comprimir(f);
        const fid = uid();
        await DB.fotoGuardar(fid, blob);
        tmp.fotos.push(fid);
        nuevas.push(fid);
      }
      panel.querySelector('[data-s="thumbs"]').innerHTML = thumbs();
      hidratarFotos(panel);
    }));
    panel.addEventListener('click', onClick);
  };
  async function onClick(e) {
    const b = e.target.closest('[data-s]');
    if (!b || b.tagName === 'INPUT') return;
    const s = b.dataset.s;
    const err = (m) => { panel.querySelector('[data-s="err"]').textContent = m; };
    if (s === 'x') return cancelarSheet();
    if (s === 'cat') { leer(); tmp.cat = b.dataset.v; pintar(); return; }
    if (s === 'aviso') {
      leer();
      const prevCancel = sheetCancel;
      sheetCancel = null;
      const a = await elegirAviso({ titulo: 'Aviso del gasto', actual: tmp.avisoId });
      if (a) tmp.avisoId = a;
      pintar();
      sheetCancel = prevCancel || sheetCancel;
      return;
    }
    if (s === 'ver') {
      const blob = await DB.fotoLeer(b.dataset.id);
      if (blob) window.open(URL.createObjectURL(blob), '_blank');
      return;
    }
    if (s === 'quitarFoto') {
      const f = b.dataset.id;
      tmp.fotos = tmp.fotos.filter((x) => x !== f);
      if (nuevas.includes(f)) await DB.fotoBorrar(f);
      else quitadas.push(f);
      panel.querySelector('[data-s="thumbs"]').innerHTML = thumbs();
      hidratarFotos(panel);
      return;
    }
    if (s === 'del') {
      if (!confirm('¿Eliminar este gasto y sus fotos?')) return;
      for (const f of [...(g0.fotos || []), ...nuevas]) await DB.fotoBorrar(f);
      S.gastos = S.gastos.filter((g) => g.id !== g0.id);
      sheetCancel = null;
      await cerrarSheet();
      commit();
      toast('Gasto eliminado');
      return;
    }
    if (s === 'ok') {
      leer();
      if (!tmp.avisoId) return err('Elige el aviso al que va el gasto.');
      if (tmp.cat === 'Kilómetros') {
        if (!(tmp.km > 0)) return err('Pon los kilómetros.');
        tmp.importe = null;
      } else {
        if (Number.isNaN(tmp.importe)) return err('El importe no es un número válido.');
        tmp.km = null;
      }
      for (const f of quitadas) await DB.fotoBorrar(f);
      if (g0) Object.assign(g0, tmp);
      else S.gastos.push(tmp);
      usar(tmp.avisoId);
      sheetCancel = null;
      await cerrarSheet();
      commit();
      toast('Gasto guardado');
    }
  }
  pintar();
}

// ---------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------
function ruta() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, arg] = h.split('/');
  return { p: p || 'hoy', arg };
}

function meter(nombre, valor, max, hint, cls = '', color = 'var(--ink)') {
  const pct = max > 0 ? Math.min(100, Math.round((valor / max) * 100)) : valor > 0 ? 100 : 0;
  return `<div class="meter">
    <div class="head"><span class="name">${esc(nombre)}</span><span class="val"><b>${L.fmtHM(valor)}</b> <span class="muted">/ ${L.fmtHM(max)}</span></span></div>
    <div class="bar" style="--c:${color}"><i style="width:${pct}%"></i></div>
    ${hint ? `<div class="hint ${cls}">${hint}</div>` : ''}
  </div>`;
}
const NOMBRES = { jornada: ['la jornada', 'Jornada cumplida'], semana: ['la semana', 'Semana cumplida'], mes: ['el mes', 'Mes cumplido'] };
function faltan(hecho, objetivo, que) {
  const d = objetivo - hecho;
  const [art, ok] = NOMBRES[que];
  if (objetivo === 0 && hecho === 0) return ['', ''];
  if (d > 0) return [`Faltan ${L.fmtHM(d)} para cumplir ${art}`, ''];
  if (d === 0) return [ok, 'ok'];
  return [`${ok} · ${L.fmtHM(-d)} por encima`, 'ok'];
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rango = (s) => `${L.fmtHora(s.ini)}–${s.abierto ? 'ahora' : L.fmtHora(s.fin)}`;
const chip = (tipo, extra = '') => `<span class="chip t-${tipo}">${esc(L.TIPO[tipo]?.label || tipo)}${extra}</span>`;

const IC_AVISO = svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>');
/** Segmentos y huecos del día en orden, más los solapes de cada tramo. */
function itemsDia(d) {
  const sol = L.solapes(d.ts, d.f === hoy() ? L.ahoraMin() : null);
  const hs = L.huecos(d.ts);
  const items = [...d.segs.map((s) => ({ ini: s.ini, s })), ...hs.map((h) => ({ ini: h.ini, h }))]
    .sort((a, b) => a.ini - b.ini || (a.h ? 1 : -1));
  return { sol, hs, items };
}
const avisoAntesDe = (d, min) => d.ts.filter((t) => t.fin != null && t.fin <= min && t.avisoId).sort((a, b) => b.fin - a.fin)[0]?.avisoId || '';
function msgSolape(sol, tramoId) {
  const otros = sol.get(tramoId);
  if (!otros) return '';
  return `<div class="solapa-msg">${IC_AVISO}Se solapa con ${otros.map((o) => `${L.fmtHora(o.ini)}–${o.fin == null ? 'ahora' : L.fmtHora(o.fin)}`).join(', ')}</div>`;
}
function filaHueco(d, h, compacta = false) {
  return `<div class="hueco"><span class="mono">${L.fmtHora(h.ini)}–${L.fmtHora(h.fin)}</span><span class="grow">Hueco sin fichar · ${L.fmtHM(h.fin - h.ini)}</span>
    <button class="btn small" data-a="nuevoTramo" data-fecha="${d.f}" data-ini="${h.ini}" data-fin="${h.fin}" data-aviso="${avisoAntesDe(d, h.ini)}">${compacta ? '+ Tramo' : '+ Crear tramo'}</button></div>`;
}

function top({ kicker = '', titulo, atras = false, derecha = '' }) {
  return `<header class="top">
    ${atras ? `<button class="iconbtn plain" data-a="atras" aria-label="Volver">${IC.atras}</button>` : ''}
    <div class="grow">${kicker ? `<div class="kicker">${kicker}</div>` : ''}<h1>${titulo}</h1></div>${derecha}
  </header>`;
}

function vHoy() {
  const f = hoy();
  const d = calcDia(f);
  const ab = tramoAbierto();
  const fs = fset();
  const sem = resumen(L.diasSemana(f));
  const mes = resumen(L.diasMes(f));
  let avisos = '';
  if (ab && ab.fecha !== f) {
    avisos += `<div class="warn">Tienes un tramo sin cerrar del ${L.fechaLarga(ab.fecha)} desde las ${L.fmtHora(ab.ini)}. <button class="linkbtn" data-a="editTramo" data-id="${ab.id}">Cerrarlo</button></div>`;
  }
  const uc = S.ajustes.ultimaCopia;
  if (S.tramos.length > 3 && (!uc || L.diasEntre(uc, f) >= 7)) {
    avisos += `<div class="warn">${uc ? `Tu última copia de seguridad es del ${L.fechaCorta(uc)}.` : 'Aún no has hecho ninguna copia de seguridad.'} <a class="linkbtn" href="#/ajustes">Hacer copia</a></div>`;
  }
  const sinNum = avisosSinNumero();
  if (sinNum.length) {
    avisos += `<div class="warn">${sinNum.length > 1 ? 'Avisos' : 'Aviso'} pendiente${sinNum.length > 1 ? 's' : ''} de número: ${sinNum.map((a) => `<button class="linkbtn" data-a="editarAviso" data-id="${a.id}">${esc(a.descripcion || obraPorId(a.obraId)?.nombre || 'sin descripción')}</button>`).join(' ')}</div>`;
  }
  if (!S.inicial) {
    avisos += `<div class="note">Para que las bolsas de prolongación y extras cuadren, mete en Ajustes lo que ya llevabas acumulado este año. <a href="#/ajustes">Ir a Ajustes</a></div>`;
  }

  let hero;
  if (ab && ab.fecha === f) {
    const seg = d.segs.filter((s) => s.tramoId === ab.id).pop();
    const tipo = seg ? seg.tipo : ab.clase === 'comida' ? 'comida' : 'ordinaria';
    let etiqueta = L.TIPO[tipo].label;
    if (ab.clase === 'desplazamiento' && !ab.tipo && tipo !== 'desplazamiento') etiqueta = `Viaje · ${etiqueta}`;
    let botones;
    if (ab.clase === 'desplazamiento') {
      botones = `<button class="btn primary span2" data-a="llegoCliente">Llego al aviso</button>
        <button class="btn" data-a="terminar">Llego a casa</button><button class="btn" data-a="comer">Paro a comer</button>`;
    } else if (ab.clase === 'comida') {
      botones = `<button class="btn primary span2" data-a="volver">Vuelvo al trabajo</button><button class="btn span2" data-a="terminar">Termino la jornada</button>`;
    } else {
      botones = `<button class="btn primary span2" data-a="salgoCliente">Salgo del aviso</button>
        <button class="btn" data-a="comer">Paro a comer</button><button class="btn" data-a="cambioAviso">Cambio de aviso</button>
        <button class="btn span2" data-a="terminar">Termino aquí (sin viaje)</button>`;
    }
    const i = infoAviso(ab.avisoId);
    hero = `<section class="hero">
      <div class="hrow"><span class="chip t-${tipo}">${esc(etiqueta)} · en curso</span><span class="since">desde ${L.fmtHora(ab.ini)}</span></div>
      <div class="timer">${L.fmtHM(L.ahoraMin() - ab.ini)}</div>
      ${ab.clase !== 'comida' ? `<div class="who">${i ? `<div class="since">${i.num ? `Aviso <span class="num">${esc(i.num)}</span>` : 'Aviso todavía sin número'}</div><div class="obra">${esc(i.texto)}</div>` : '<div class="obra">Sin aviso</div>'}</div>` : ''}
      <div class="grid2">${botones}</div>
    </section>`;
  } else {
    const estado = d.ts.length ? (d.tot.jornada >= d.objetivo ? 'Jornada terminada' : 'Sin tramo en curso') : d.festivo ? 'Hoy es festivo' : !d.laborable ? 'Fin de semana' : 'Sin empezar';
    hero = `<section class="hero">
      <div class="hrow"><span class="since">${estado}</span>${d.ts.length ? '<span class="since">trabajado hoy</span>' : ''}</div>
      ${d.ts.length ? `<div class="timer">${L.fmtHM(d.tot.computable)}</div>` : ''}
      <div class="grid2">
        <button class="btn primary span2" data-a="salirCasa">Salgo de casa</button>
        <button class="btn" data-a="empezar">Empiezo a trabajar</button>
        <button class="btn" data-a="nuevoTramo" data-fecha="${f}">Otras horas</button>
      </div>
    </section>`;
  }

  const [hDia, cDia] = d.objetivo ? faltan(d.tot.jornada, d.objetivo, 'jornada') : ['Hoy no es laborable: lo que trabajes cuenta como extra', ''];
  const [hSem, cSem] = faltan(sem.jornada, sem.objetivo, 'semana');
  const [hMes, cMes] = faltan(mes.jornada, mes.objetivo, 'mes');
  const extraHoy = d.tot.extra ? ` · Extra hoy: ${L.fmtHM(d.tot.extra)}` : '';
  const contadores = `<section class="card">
    ${meter('Jornada de hoy', d.tot.jornada, d.objetivo, hDia, cDia, '#1D5FB8')}
    ${d.laborable ? meter('Prolongación de hoy', d.tot.prol, L.PROL_MAX_DIA, (d.tot.prol >= L.PROL_MAX_DIA ? 'Máximo diario alcanzado: lo que siga se propone como extra' : 'Pasadas las 2:00 se propone como extra') + extraHoy, d.tot.prol >= L.PROL_MAX_DIA ? 'bad' : '', '#B45309') : (d.tot.extra ? `<div class="meter"><div class="head"><span class="name">Extra de hoy</span><span class="val"><b>${L.fmtHM(d.tot.extra)}</b></span></div></div>` : '')}
    ${meter(`Semana ${L.semanaISO(f)}`, sem.jornada, sem.objetivo, hSem, cSem)}
    ${meter(cap(L.mesLargo(f.slice(0, 7))), mes.jornada, mes.objetivo, hMes, cMes)}
  </section>`;

  const { sol, items } = itemsDia(d);
  const lista = items.length
    ? items.map(({ s, h }) => (h ? filaHueco(d, h, true)
      : `<a class="row tint t-${s.tipo}${sol.has(s.tramoId) ? ' solapa' : ''}" href="#/dia/${f}"><span class="time">${rango(s)}</span>${chip(s.tipo)}${sol.has(s.tramoId) ? `<span class="solapa-ic" aria-label="Se solapa">${IC_AVISO}</span>` : ''}<span class="dur">${L.fmtHM(s.fin - s.ini)}</span></a>`)).join('')
    : '<div class="empty">Aún no has fichado nada hoy.</div>';

  return `${top({
    kicker: `Semana ${L.semanaISO(f)} · ${L.esVerano(f) ? 'Horario de verano' : 'Horario de invierno'}${fs.has(f) ? ' · Festivo' : ''}`,
    titulo: L.fechaLarga(f),
    derecha: `<a class="iconbtn" href="#/ajustes" aria-label="Ajustes">${IC.ajustes}</a>`,
  })}
  <main class="content">
    ${avisos}${hero}${contadores}
    <div class="sec-title"><h2>Tramos de hoy</h2><a class="linkbtn" href="#/dia/${f}">Revisar día</a></div>
    <div class="card flush">${lista}</div>
    <button class="btn dashed" data-a="nuevoTramo" data-fecha="${f}">+ Añadir tramo a mano</button>
  </main>`;
}

function vDia(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) f = hoy();
  const d = calcDia(f);
  const marcas = [d.festivo && 'Festivo', !d.laborable && !d.festivo && 'Fin de semana', d.verano && 'Horario de verano'].filter(Boolean).join(' · ');
  const warns = L.avisosDia(d.ts, d.segs, { laborable: d.laborable, verano: d.verano });
  const abiertoViejo = d.ts.find((t) => t.fin == null && f !== hoy());
  if (abiertoViejo) warns.unshift(`El tramo que empieza a las ${L.fmtHora(abiertoViejo.ini)} no tiene hora de fin.`);
  const { sol, items } = itemsDia(d);
  const segs = items.map(({ s, h }) => (h ? filaHueco(d, h) : `<div class="seg tint t-${s.tipo}${sol.has(s.tramoId) ? ' solapa' : ''}">
      <div class="l1"><span class="mono" style="font-size:14px;font-weight:500">${rango(s)}</span><span class="dur mono" style="margin-left:auto;font-size:13px;color:var(--muted)">${L.fmtHM(s.fin - s.ini)}</span>
        <button class="iconbtn" style="width:40px;height:40px" data-a="editTramo" data-id="${s.tramoId}" aria-label="Modificar tramo">${IC.lapiz}</button></div>
      <div class="l2"><button class="chip t-${s.tipo}" data-a="tipoSeg" data-id="${s.tramoId}" data-ini="${s.ini}" data-fin="${s.fin}">${esc(L.TIPO[s.tipo].label)}${IC.abajo}</button>
        <span class="small muted">${s.manual ? 'fijado por ti' : 'propuesto'}</span></div>
      ${L.llevaAviso(s.tipo) ? `<div class="aviso">${avisoHTML(s.avisoId)}</div>` : ''}
      ${s.comentario ? `<div class="small">${esc(s.comentario)}</div>` : ''}
      ${msgSolape(sol, s.tramoId)}
      ${s.tipo === 'extra' ? `<div class="segm small" role="group" aria-label="Compensación de la extra">${Object.keys(L.COMP).map((c) => `<button data-a="comp" data-id="${s.tramoId}" data-v="${c}" aria-pressed="${s.comp === c}">${L.COMP[c]}</button>`).join('')}</div>` : ''}
    </div>`)).join('');
  const sinFin = d.ts.filter((t) => t.fin == null && f !== hoy()).map((t) => `<div class="seg"><div class="l1"><span class="mono">${L.fmtHora(t.ini)}–?</span><button class="btn small" style="margin-left:auto" data-a="editTramo" data-id="${t.id}">Poner hora de fin</button></div></div>`).join('');
  const t = d.tot;
  return `${top({ kicker: `${f.slice(0, 4)} · ${marcas || 'Horario de invierno'}`, titulo: L.fechaLarga(f), atras: true,
    derecha: `<a class="iconbtn" href="#/dia/${L.addDias(f, -1)}" aria-label="Día anterior">${IC.atras}</a><a class="iconbtn" href="#/dia/${L.addDias(f, 1)}" aria-label="Día siguiente">${IC.sig}</a>` })}
  <main class="content">
    <section class="card" style="flex-direction:row;align-items:center;justify-content:space-between">
      <div><div class="small muted" style="font-weight:600">Jornada ordinaria de este día</div><div class="mono" style="font-size:20px;font-weight:600">${L.fmtHM(d.objetivo)}${d.objetivo !== d.base ? ` <span class="small muted">(normal ${L.fmtHM(d.base)})</span>` : ''}</div></div>
      <button class="btn small" data-a="objetivo" data-f="${f}">Cambiar</button>
    </section>
    ${warns.map((w) => `<div class="warn">${esc(w)}</div>`).join('')}
    ${d.segs.length ? '<div class="note">Toca el tipo de un tramo para cambiarlo, o el lápiz para cambiar horas, fecha o aviso.</div>' : ''}
    <div class="card flush">${segs || sinFin ? segs + sinFin : '<div class="empty">No hay tramos este día.</div>'}</div>
    <div class="grid2">
      <button class="btn dashed" data-a="nuevoTramo" data-fecha="${f}">+ Añadir tramo</button>
      <button class="btn dashed" data-a="festivo" data-f="${f}">${d.festivo ? 'Quitar festivo' : 'Marcar festivo'}</button>
    </div>
    <label class="field">Comentario del día<textarea data-campo="comentarioDia" data-f="${f}" rows="2" placeholder="Opcional">${esc(S.dias[f]?.comentario || '')}</textarea></label>
    <section class="card tots">
      <div><div class="k">Jornada</div><div class="v txt-t t-ordinaria">${L.fmtHM(t.jornada)}</div><div class="h">de ${L.fmtHM(d.objetivo)}${t.porTipo.desplazamiento ? ` · ${L.fmtHM(t.porTipo.desplazamiento)} de viaje` : ''}</div></div>
      <div><div class="k">Prolongación</div><div class="v txt-t t-prolongacion">${L.fmtHM(t.prol)}</div><div class="h">máx. 2:00</div></div>
      <div><div class="k">Extra</div><div class="v txt-t t-extra">${L.fmtHM(t.extra)}</div><div class="h">&nbsp;</div></div>
      <div><div class="k">Total computable</div><div class="v">${L.fmtHM(t.computable)}</div><div class="h">Comida ${L.fmtHM(t.comida)} aparte</div></div>
    </section>
    <a class="btn" href="#/gastos/${f}">Gastos de este día</a>
  </main>`;
}

function avisosParaGastos(f) {
  const ids = [];
  const add = (id) => { if (id && !ids.includes(id)) ids.push(id); };
  tramosDe(f).sort((a, b) => a.ini - b.ini).forEach((t) => add(t.avisoId));
  S.gastos.filter((g) => g.fecha === f).forEach((g) => add(g.avisoId));
  Object.keys(S.dietas).filter((k) => k.startsWith(f + '|')).forEach((k) => add(k.slice(11)));
  (S.dias[f]?.avisosGasto || []).forEach(add);
  return ids;
}
function valorGasto(g) {
  return g.cat === 'Kilómetros' ? `${numES(g.km || 0)} km` : g.importe != null ? euros(g.importe) : '—';
}

function vGastos(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) f = hoy();
  const ids = avisosParaGastos(f);
  const gastos = S.gastos.filter((g) => g.fecha === f);
  const km = gastos.filter((g) => g.cat === 'Kilómetros').reduce((s, g) => s + (g.km || 0), 0);
  const tarjetas = ids.map((id) => {
    const i = infoAviso(id);
    const v = S.dietas[`${f}|${id}`] || {};
    const gs = gastos.filter((g) => g.avisoId === id);
    return `<section class="card">
      <div style="display:flex;gap:8px;align-items:flex-start"><div class="grow" style="flex:1"><div style="font-weight:600">${i?.num ? `<span class="mono">${esc(i.num)}</span>` : SIN_NUM}</div><div class="small muted">${esc(i?.texto || '')}</div></div>${i && !i.num ? `<button class="btn small" data-a="editarAviso" data-id="${id}">Completar</button>` : ''}</div>
      <div class="label-up">Dietas</div>
      <div class="grid2">${L.DIETAS.map((dt) => `<button class="toggle" data-a="dieta" data-f="${f}" data-aviso="${id}" data-d="${dt.id}" aria-pressed="${!!v[dt.id]}">${dt.label}</button>`).join('')}</div>
      <div class="label-up">Gastos</div>
      ${gs.map((g) => `<button class="row" style="width:100%;background:none;border:none;border-top:1px solid var(--line-soft);padding:8px 0;text-align:left" data-a="editGasto" data-id="${g.id}">
        ${g.fotos?.length ? `<img class="minithumb" data-foto="${g.fotos[0]}" alt="Ticket">` : ''}
        <div class="grow"><div class="t1">${esc(g.cat)}</div><div class="t2">${esc(g.detalle || '')}${g.fotos?.length ? ` · ${g.fotos.length} foto${g.fotos.length > 1 ? 's' : ''}` : ''}</div></div>
        <span class="mono" style="font-weight:600">${valorGasto(g)}</span></button>`).join('') || '<span class="small muted">Sin gastos</span>'}
      <button class="btn dashed small" data-a="nuevoGasto" data-f="${f}" data-aviso="${id}">+ Añadir gasto${IC.camara}</button>
    </section>`;
  }).join('');
  return `${top({ kicker: 'Gastos', titulo: L.fechaLarga(f), derecha: `<a class="iconbtn" href="#/gastos/${L.addDias(f, -1)}" aria-label="Día anterior">${IC.atras}</a><a class="iconbtn" href="#/gastos/${L.addDias(f, 1)}" aria-label="Día siguiente">${IC.sig}</a>` })}
  <main class="content">
    <div class="sec-title"><span class="small muted">Km del día: <b class="mono">${numES(km)} km</b></span>${f !== hoy() ? `<a class="linkbtn" href="#/gastos/${hoy()}">Ir a hoy</a>` : ''}</div>
    ${tarjetas || '<div class="card"><p class="muted">Este día no tiene avisos. Elige uno para apuntar dietas o gastos.</p></div>'}
    <button class="btn dashed" data-a="avisoGastos" data-f="${f}">+ Añadir otro aviso a este día</button>
    <a class="btn" href="#/dia/${f}">Ver horas de este día</a>
  </main>`;
}

const R = { modo: 'semana', ref: null, vista: 'dia' };
function periodo() {
  const ref = R.ref || hoy();
  if (R.modo === 'semana') {
    const fechas = L.diasSemana(ref);
    const anio = fechas[3].slice(0, 4);
    return { fechas, titulo: `Semana ${L.semanaISO(ref)}`, sub: `${L.fechaCorta(fechas[0])} – ${L.fechaCorta(fechas[6])} ${anio}`, archivo: `semana-${L.semanaISO(ref)}-${anio}` };
  }
  const mes = ref.slice(0, 7);
  return { fechas: L.diasMes(ref), titulo: L.nombreMes(mes), sub: '', archivo: `${L.mesLargo(mes)}-${mes.slice(0, 4)}` };
}
function gastosPeriodo(fechas) {
  const set = new Set(fechas);
  const porAviso = new Map();
  const entrada = (id) => {
    if (!porAviso.has(id)) porAviso.set(id, new Map());
    return porAviso.get(id);
  };
  const delDia = (id, f) => {
    const m = entrada(id);
    if (!m.has(f)) m.set(f, { dietas: [], gastos: [] });
    return m.get(f);
  };
  for (const [k, v] of Object.entries(S.dietas)) {
    const f = k.slice(0, 10), id = k.slice(11);
    if (!set.has(f)) continue;
    delDia(id, f).dietas = L.DIETAS.filter((d) => v[d.id]).map((d) => d.label);
  }
  for (const g of S.gastos) if (set.has(g.fecha)) delDia(g.avisoId, g.fecha).gastos.push(g);
  return porAviso;
}

const CHEV = IC.sig.replace('<svg', '<svg width="16" height="16"');
function pillsGasto(x) {
  const out = x.dietas.map((dl) => `<span class="pill-s">Dieta ${esc(dl.toLowerCase())}</span>`);
  for (const g of x.gastos) {
    out.push(`<span class="pill-s">${esc(g.cat)} <b class="mono">${valorGasto(g)}</b>${g.fotos?.length ? ` · ${g.fotos.length} ticket${g.fotos.length > 1 ? 's' : ''}` : ''}</span>`);
  }
  return out.join('');
}
/** Bloque de gastos de un día (todos los avisos, o solo uno). */
function bloqueGastos(f, soloAviso) {
  const gp = gastosPeriodo([f]);
  const partes = [];
  for (const [id, porDia] of gp) {
    if (soloAviso !== undefined && id !== soloAviso) continue;
    const x = porDia.get(f);
    if (!x || (!x.dietas.length && !x.gastos.length)) continue;
    partes.push(`${soloAviso === undefined ? `<div class="gav">${avisoHTML(id)}</div>` : ''}<div class="pills">${pillsGasto(x)}</div>`);
  }
  if (!partes.length) return '';
  return `<a class="gblock" href="#/gastos/${f}"><div class="label-up">Gastos</div>${partes.join('')}</a>`;
}
const cabeceraCols = (c2 = 'Tipo · aviso', acum = true) => `<div class="rrow rhead${acum ? '' : ' sin-acum'}"><span>Horario</span><span>${c2}</span><span class="r">Horas</span>${acum ? '<span class="r">Acum.</span>' : ''}</div>`;

function vResumen() {
  const p = periodo();
  const r = resumen(p.fechas);
  const [hJ, cJ] = faltan(r.jornada, r.objetivo, R.modo === 'semana' ? 'semana' : 'mes');
  const fs = fset();
  const segsDe = (f) => calcDia(f).segs.filter((s) => !s.abierto || f === hoy());
  const tieneGastos = (f) => S.gastos.some((g) => g.fecha === f) || Object.keys(S.dietas).some((k) => k.startsWith(f + '|'));
  let lista = '';

  if (R.vista === 'dia') {
    lista = p.fechas.map((f) => {
      const d = calcDia(f);
      const conGastos = tieneGastos(f);
      if (!d.segs.length && !conGastos && (L.diaSemana(f) >= 6 || f > hoy()) && !fs.has(f)) return '';
      const { sol, items } = itemsDia(d);
      let acum = 0;
      const filas = items.map(({ s, h }) => {
        if (h) {
          return `<a class="rrow hueco-r" href="#/dia/${f}"><span class="mono">${L.fmtHora(h.ini)}–${L.fmtHora(h.fin)}</span><span>Hueco sin fichar</span><span class="mono r">${L.fmtHM(h.fin - h.ini)}</span><span></span></a>`;
        }
        const m = s.fin - s.ini;
        if (s.tipo !== 'comida') acum += m;
        return `<a class="rrow tint t-${s.tipo}${sol.has(s.tramoId) ? ' solapa' : ''}" href="#/dia/${f}">
          <span class="mono">${rango(s)}</span>
          <span>${chip(s.tipo, s.tipo === 'extra' ? ` · ${L.COMP[s.comp].toLowerCase()}` : '')}${sol.has(s.tramoId) ? `<span class="solapa-ic" aria-label="Se solapa">${IC_AVISO}</span>` : ''}</span>
          <span class="mono r">${L.fmtHM(m)}</span>
          <span class="mono r acum${s.tipo === 'comida' ? ' muted' : ''}">${L.fmtHM(acum)}</span>
          ${L.llevaAviso(s.tipo) ? `<span class="sub">${avisoHTML(s.avisoId)}</span>` : ''}
        </a>`;
      }).join('');
      const detalle = d.segs.length
        ? [`Jornada ${L.fmtHM(d.tot.jornada)}`, d.tot.prol && `Prol. ${L.fmtHM(d.tot.prol)}`, d.tot.extra && `Extra ${L.fmtHM(d.tot.extra)}`].filter(Boolean).join(' · ')
        : fs.has(f) ? 'Festivo' : 'Sin horas';
      return `<section class="card flush daycard">
        <a class="dayband${d.segs.length || conGastos ? '' : ' vacio'}" href="#/dia/${f}">
          <span class="grow"><b>${L.fechaLarga(f)}</b><span class="dsub">${detalle}${fs.has(f) && d.segs.length ? ' · Festivo' : ''}</span></span>
          <span class="mono dtot">${d.segs.length ? L.fmtHM(d.tot.computable) : ''}</span>${CHEV}
        </a>
        ${filas ? cabeceraCols() + filas : ''}
        ${bloqueGastos(f)}
      </section>`;
    }).join('');
  } else if (R.vista === 'aviso') {
    const grupos = new Map();
    const add = (k) => { if (!grupos.has(k)) grupos.set(k, []); return grupos.get(k); };
    for (const f of p.fechas) for (const s of segsDe(f)) {
      if (!L.llevaAviso(s.tipo)) continue;
      add(s.avisoId || '').push({ f, s });
    }
    for (const id of gastosPeriodo(p.fechas).keys()) add(id || '');
    lista = [...grupos.entries()].map(([id, xs]) => {
      const tot = {};
      xs.forEach(({ s }) => { tot[s.tipo] = (tot[s.tipo] || 0) + s.fin - s.ini; });
      const dias = [...new Set([...xs.map((x) => x.f), ...p.fechas.filter((f) => S.gastos.some((g) => g.fecha === f && g.avisoId === id) || S.dietas[`${f}|${id}`])])].sort();
      const cuerpo = dias.map((f) => {
        const filas = xs.filter((x) => x.f === f).map(({ s }) => `<a class="rrow sin-acum tint t-${s.tipo}" href="#/dia/${f}"><span class="mono">${rango(s)}</span><span>${chip(s.tipo, s.tipo === 'extra' ? ` · ${L.COMP[s.comp].toLowerCase()}` : '')}</span><span class="mono r">${L.fmtHM(s.fin - s.ini)}</span></a>`).join('');
        return `<div class="subband">${L.fechaLarga(f)}</div>${filas}${bloqueGastos(f, id)}`;
      }).join('');
      return `<section class="card flush daycard">
        <div class="dayband"><span class="grow"><b>${id ? avisoHTML(id) : 'Sin aviso'}</b></span>${id && !avisoPorId(id)?.numero ? `<button class="btn small" data-a="editarAviso" data-id="${id}">Completar</button>` : ''}</div>
        ${Object.keys(tot).length ? `<div class="pills" style="padding:8px 14px">${Object.entries(tot).map(([t, m]) => chip(t, ` ${L.fmtHM(m)}`)).join('')}</div>` : ''}
        ${cuerpo}
      </section>`;
    }).join('');
  } else {
    lista = L.TIPOS.filter((t) => r.porTipo[t.id] > 0).map((t) => {
      const xs = [];
      for (const f of p.fechas) for (const s of segsDe(f)) if (s.tipo === t.id) xs.push({ f, s });
      return `<section class="card flush daycard">
        <div class="dayband t-${t.id} tipoband"><span class="grow"><b>${esc(t.label)}</b></span><span class="mono dtot">${L.fmtHM(r.porTipo[t.id])}</span></div>
        ${xs.map(({ f, s }) => `<a class="rrow sin-acum tint t-${t.id}" href="#/dia/${f}"><span class="mono">${L.fechaCorta(f)}</span><span class="mono">${rango(s)}</span><span class="mono r">${L.fmtHM(s.fin - s.ini)}</span>${L.llevaAviso(t.id) ? `<span class="sub">${avisoHTML(s.avisoId)}</span>` : ''}</a>`).join('')}
      </section>`;
    }).join('');
    const gastosDias = p.fechas.map((f) => {
      const b = bloqueGastos(f);
      return b ? `<div class="subband">${L.fechaLarga(f)}</div>${b}` : '';
    }).join('');
    if (gastosDias) lista += `<section class="card flush daycard"><div class="dayband"><b>Gastos</b></div>${gastosDias}</section>`;
  }

  const cuentaDietas = Object.fromEntries(L.DIETAS.map((d) => [d.label, 0]));
  let totKm = 0;
  for (const [, porDia] of gastosPeriodo(p.fechas)) {
    for (const [, x] of porDia) {
      x.dietas.forEach((dl) => { cuentaDietas[dl]++; });
      x.gastos.forEach((g) => { if (g.cat === 'Kilómetros') totKm += g.km || 0; });
    }
  }
  const resumenGastos = [...Object.entries(cuentaDietas).filter(([, n]) => n).map(([l, n]) => `${l}: ${n}`), totKm ? `${numES(totKm)} km` : ''].filter(Boolean).join(' · ');

  return `${top({ titulo: 'Resumen' })}
  <main class="content">
    <div class="segm">${['semana', 'mes'].map((m) => `<button data-a="resModo" data-v="${m}" aria-pressed="${R.modo === m}">${m === 'semana' ? 'Semana' : 'Mes'}</button>`).join('')}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <button class="iconbtn" data-a="resMover" data-v="-1" aria-label="Anterior">${IC.atras}</button>
      <button class="linkbtn" data-a="resHoy" style="flex-direction:column;color:var(--ink)"><b style="font-size:16px">${p.titulo}</b>${p.sub ? `<span class="small muted">${p.sub}</span>` : ''}</button>
      <button class="iconbtn" data-a="resMover" data-v="1" aria-label="Siguiente">${IC.sig}</button>
    </div>
    <section class="card">
      ${meter(R.modo === 'semana' ? 'Jornada de la semana' : 'Jornada del mes', r.jornada, r.objetivo, hJ + (r.festivos ? ` · ${r.festivos} festivo${r.festivos > 1 ? 's' : ''} descontado${r.festivos > 1 ? 's' : ''}` : ''), cJ, cJ ? 'var(--ok)' : '#1D5FB8')}
      <div class="stats3">
        <div><div class="k">Prolongación</div><div class="v txt-t t-prolongacion">${L.fmtHM(r.prol, true)}</div></div>
        <div><div class="k">Libranza prol.</div><div class="v">${L.fmtHM(-r.porTipo.libranza_prol)}</div></div>
        <div><div class="k">Extra</div><div class="v txt-t t-extra">${L.fmtHM(r.extra)}</div></div>
      </div>
      ${resumenGastos ? `<div class="small muted" style="border-top:1px solid var(--line-soft);padding-top:8px">Gastos: ${resumenGastos}</div>` : ''}
    </section>
    <div class="pills"><span class="small muted">Ver por</span>${[['dia', 'Día'], ['aviso', 'Aviso'], ['tipo', 'Tipo de hora']].map(([v, l]) => `<button class="pill" data-a="resVista" data-v="${v}" aria-pressed="${R.vista === v}">${l}</button>`).join('')}</div>
    ${lista || '<div class="card"><p class="muted">No hay horas ni gastos en este periodo.</p></div>'}
    <div class="grid3">
      <button class="btn" data-a="exportExcel">Excel</button>
      <button class="btn" data-a="exportPDF">PDF</button>
      <button class="btn" data-a="exportTickets">Tickets</button>
    </div>
  </main>`;
}

function vBolsas() {
  const { prol, ext, movimientos } = libros();
  const f = hoy();
  const lotes = prol.lotes.map((l) => `<div class="row" style="padding:8px 0">
      <div class="grow"><div class="t1">Generadas en ${L.mesLargo(l.mes)}</div><div class="t2" style="${l.diasRestantes <= 15 ? 'color:var(--danger);font-weight:700' : ''}">Librar antes del ${L.fechaCorta(l.caduca)} · quedan ${l.diasRestantes} día${l.diasRestantes === 1 ? '' : 's'}</div></div>
      <span class="mono" style="font-weight:600">${L.fmtHM(l.min)}</span></div>`).join('');
  const cad = prol.caducadas.filter((c) => c.caduca.slice(0, 4) === f.slice(0, 4));
  const movs = movimientos.map((m) => `<div class="row" style="padding:8px 0"><div class="grow"><div class="t1">${m.concepto}</div><div class="t2">${L.fechaCorta(m.fecha)}</div></div><span class="mono" style="font-weight:600;color:${m.min > 0 ? 'var(--c)' : 'var(--ok)'}" class="t-prolongacion">${L.fmtHM(m.min, true)}</span></div>`).join('');
  const sobre = (v, max) => (v > max ? 'bad' : '');
  return `${top({ kicker: `Año ${f.slice(0, 4)} · a ${L.fechaCorta(f)}`, titulo: 'Bolsas de horas' })}
  <main class="content">
    ${!S.inicial ? '<div class="warn">Aún no has metido los saldos con los que empezaste. <a href="#/ajustes">Ir a Ajustes</a></div>' : ''}
    <section class="card t-prolongacion">
      <h2 class="txt-t">Prolongación</h2>
      <div class="bigline"><span class="big">${L.fmtHM(prol.saldo, true)}</span><span class="small muted">saldo para librar${prol.deuda ? ' (has librado por adelantado)' : ''}</span></div>
      ${meter('Saldo neto del año', prol.netoAnual, L.PROL_MAX_ANIO, prol.netoAnual > L.PROL_MAX_ANIO ? 'Superas el límite anual de 85 h' : '', sobre(prol.netoAnual, L.PROL_MAX_ANIO), '#B45309')}
      ${meter(`Saldo neto de ${L.mesLargo(f.slice(0, 7))}`, prol.netoMes, L.PROL_MAX_MES, prol.netoMes > L.PROL_MAX_MES ? 'Superas el límite mensual de 32 h' : '', sobre(prol.netoMes, L.PROL_MAX_MES), '#B45309')}
      ${lotes ? `<div class="label-up" style="margin-top:4px">Cuándo caducan (se gastan primero las más antiguas)</div><div>${lotes}</div>` : ''}
      ${cad.length ? `<div class="note">Pasaron a extra este año (lo cambia la empresa): ${cad.map((c) => `${L.mesLargo(c.mes)} ${L.fmtHM(c.min)}`).join(', ')}.</div>` : ''}
      ${movs ? `<div class="label-up">Últimos movimientos</div><div>${movs}</div>` : ''}
      <div class="note">Las libranzas se restan solas: cuando metes en un día un tramo de tipo <b>Libranza prolongación</b>, esas horas salen de la bolsa.</div>
    </section>
    <section class="card t-extra">
      <h2 class="txt-t">Horas extra</h2>
      ${meter('Extras hechas en el año (límite legal)', ext.hechasAnio, L.EXTRA_MAX_ANIO, ext.hechasAnio > L.EXTRA_MAX_ANIO ? 'Superas el límite de 80 h' : '', sobre(ext.hechasAnio, L.EXTRA_MAX_ANIO), '#A3195B')}
      <div>
        <div class="row" style="padding:8px 0"><div class="grow"><div class="t1">Extra (cobro)</div><div class="t2">Se pagan según tabla · no suman a la bolsa</div></div><span class="mono" style="font-weight:600">${L.fmtHM(ext.porComp.cobro)}</span></div>
        <div class="row" style="padding:8px 0"><div class="grow"><div class="t1">Canje parcial</div><div class="t2">+0:30 por hora a la bolsa y compensación</div></div><span class="mono" style="font-weight:600">${L.fmtHM(ext.porComp.parcial)}</span></div>
        <div class="row" style="padding:8px 0"><div class="grow"><div class="t1">Canje total</div><div class="t2">+1:45 por hora a la bolsa</div></div><span class="mono" style="font-weight:600">${L.fmtHM(ext.porComp.total)}</span></div>
      </div>
      <div class="note" style="display:flex;justify-content:space-between;align-items:center;color:var(--ink)">
        <div><div style="font-weight:700;font-size:14px">Bolsa de horas extra</div><div class="small muted">${S.inicial?.bolsaExtra ? `Partida ${L.fmtHM(S.inicial.bolsaExtra)} · ` : ''}generadas ${L.fmtHM(ext.generadas)} · libradas ${L.fmtHM(ext.libradas)}</div></div>
        <span class="mono" style="font-size:22px;font-weight:600">${L.fmtHM(ext.bolsa)}</span>
      </div>
      <div class="note">Cuando metes en un día un tramo de <b>Libranza extra</b> (p. ej. 16:30–17:30), esa hora sale de la bolsa y cuenta para cumplir la semana.</div>
    </section>
  </main>`;
}

let verArchivados = false;
function mesesSaldo(fecha) {
  const [y, m] = (fecha || hoy()).split('-').map(Number);
  return [2, 1, 0].map((k) => L.fmtFecha(new Date(y, m - 1 - k, 1)).slice(0, 7));
}
function vAjustes() {
  const ini = S.inicial || {};
  const meses = mesesSaldo(ini.fecha);
  const lote = (mes) => (ini.prolLotes || []).find((l) => l.mes === mes)?.min;
  const hm = (v) => (v == null ? '' : L.fmtHM(v).replace('−', '-'));
  const festivos = S.festivos.filter((f) => f >= `${Number(hoy().slice(0, 4)) - 1}-01-01`);
  const obras = S.obras.filter((o) => verArchivados || !o.archivada);
  return `${top({ titulo: 'Ajustes', atras: true })}
  <main class="content">
    <section class="card">
      <h2>Festivos y días no laborables</h2>
      <p class="small muted">Un festivo no suma horas a la semana: una semana de invierno con un festivo pasa de 42:30 a 34:00. También puedes marcarlo desde el propio día.</p>
      <div>${festivos.map((f) => `<div class="row" style="padding:6px 0"><div class="grow"><div class="t1">${L.fechaLarga(f, true)}</div></div><button class="iconbtn plain" data-a="delFestivo" data-f="${f}" aria-label="Quitar festivo">${IC.x}</button></div>`).join('') || '<span class="small muted">No has marcado ningún festivo.</span>'}</div>
      <div style="display:flex;gap:8px"><input class="input" type="date" id="nuevoFestivo" aria-label="Fecha del festivo" style="flex:1"><button class="btn" data-a="addFestivo">Añadir</button></div>
    </section>

    <section class="card">
      <h2>Saldos de partida</h2>
      <p class="small muted">Lo que ya llevabas acumulado este año antes de empezar con la app. Cópialo del sistema una sola vez, a fecha del último día antes de empezar a usarla (mejor un fin de mes). Formato h:mm; puede ser negativo.</p>
      <label class="field">A fecha de<input type="date" id="sFecha" value="${ini.fecha || ''}"></label>
      <div class="label-up txt-t t-prolongacion">Prolongación pendiente de librar, por mes en que se generó</div>
      <div class="grid3">${meses.map((m, i) => `<label class="field"><span data-mes="${i}">${cap(L.mesLargo(m))}</span><input class="mono" id="sLote${i}" inputmode="text" value="${hm(lote(m))}" placeholder="0:00"></label>`).join('')}</div>
      <label class="field">Saldo neto de prolongación del año<input class="mono" id="sNeto" value="${hm(ini.prolNetoAnual)}" placeholder="0:00"><span class="help">Trabajadas menos libradas en el año (para el límite de 85 h)</span></label>
      <div class="label-up txt-t t-extra">Horas extra hechas este año</div>
      <div class="grid3">
        <label class="field">Cobro<input class="mono" id="sCobro" value="${hm(ini.extrasCobro)}" placeholder="0:00"></label>
        <label class="field">Canje parcial<input class="mono" id="sParcial" value="${hm(ini.extrasParcial)}" placeholder="0:00"></label>
        <label class="field">Canje total<input class="mono" id="sTotal" value="${hm(ini.extrasTotal)}" placeholder="0:00"></label>
      </div>
      <label class="field">Bolsa de horas extra disponible<input class="mono" id="sBolsa" value="${hm(ini.bolsaExtra)}" placeholder="0:00"></label>
      <p class="field"><span class="err" id="sErr"></span></p>
      <button class="btn primary" data-a="guardarSaldos">Guardar saldos</button>
    </section>

    <section class="card">
      <h2>Horas extra</h2>
      <p class="small muted">Compensación que se propone al fichar (luego puedes cambiarla en cada día).</p>
      <div class="segm small">${Object.keys(L.COMP).map((c) => `<button data-a="compDef" data-v="${c}" aria-pressed="${S.ajustes.compDefecto === c}">${L.COMP[c]}</button>`).join('')}</div>
    </section>

    <section class="card">
      <h2>Obras y avisos</h2>
      <p class="small muted">Toca un aviso para completar su número, cambiar la descripción o la obra, o archivarlo.</p>
      ${[...obras.map((o) => ({ o, avs: S.avisos.filter((a) => a.obraId === o.id) })), { o: null, avs: S.avisos.filter((a) => !a.obraId || !obraPorId(a.obraId)) }].map(({ o, avs }) => {
        avs = avs.filter((a) => verArchivados || !a.archivado);
        if (!o && !avs.length) return '';
        return `<div style="border-top:1px solid var(--line-soft);padding-top:8px">
          <div style="display:flex;align-items:center;gap:8px"><div class="grow" style="flex:1;font-weight:600">${o ? esc(o.nombre) : '<span class="muted">Sin obra</span>'}${o?.archivada ? ' <span class="small muted">(archivada)</span>' : ''}</div>${o ? `<button class="linkbtn" data-a="renombrarObra" data-id="${o.id}">Editar</button>` : ''}</div>
          <div class="pills" style="margin-top:4px">${avs.map((a) => `<button class="pill" data-a="editarAviso" data-id="${a.id}" style="${a.archivado ? 'opacity:.55' : ''}">${a.numero ? `<span class="mono">${esc(a.numero)}</span>` : SIN_NUM}${a.descripcion ? ` ${esc(a.descripcion)}` : ''}</button>`).join('') || '<span class="small muted">Sin avisos</span>'}</div>
        </div>`;
      }).join('') || '<span class="small muted">Aún no tienes avisos. Se crean al elegir aviso por primera vez.</span>'}
      <div class="grid2"><button class="btn" data-a="nuevoAviso">+ Nuevo aviso</button><button class="btn" data-a="verArchivados">${verArchivados ? 'Ocultar archivados' : 'Ver archivados'}</button></div>
    </section>

    <section class="card">
      <h2>Copia de seguridad</h2>
      <p class="small muted">Los datos y las fotos solo están en este móvil. Haz una copia de vez en cuando y guárdala en Drive o envíatela por correo.</p>
      <p class="small">Última copia: <b>${S.ajustes.ultimaCopia ? L.fechaLarga(S.ajustes.ultimaCopia, true) : 'nunca'}</b></p>
      <div class="grid2">
        <button class="btn primary" data-a="copiaCompartir">Guardar en Drive…</button>
        <button class="btn" data-a="copiaDescargar">Descargar copia</button>
      </div>
      <label class="btn filebtn">Restaurar desde una copia<input type="file" accept="application/json,.json" data-campo="restaurar"></label>
    </section>
    <p class="small muted" style="text-align:center">Control horario · versión ${VERSION}</p>
  </main>`;
}

function guardarSaldos() {
  const err = (m) => { document.getElementById('sErr').textContent = m; };
  const fecha = document.getElementById('sFecha').value;
  if (!fecha) return err('Pon la fecha de los saldos.');
  const leerHM = (id) => {
    const v = L.parseDuracion(document.getElementById(id).value);
    if (v == null) throw new Error('Revisa los valores: usa el formato h:mm (por ejemplo 6:10).');
    return v;
  };
  try {
    const meses = mesesSaldo(fecha);
    S.inicial = {
      fecha,
      prolLotes: meses.map((mes, i) => ({ mes, min: leerHM('sLote' + i) })).filter((l) => l.min !== 0),
      prolNetoAnual: leerHM('sNeto'),
      extrasCobro: leerHM('sCobro'), extrasParcial: leerHM('sParcial'), extrasTotal: leerHM('sTotal'),
      bolsaExtra: leerHM('sBolsa'),
    };
  } catch (e) { return err(e.message); }
  commit();
  toast('Saldos guardados');
}

// ---------------------------------------------------------------------------
// Exportaciones
// ---------------------------------------------------------------------------
function filasPeriodo(fechas) {
  const horas = [];
  for (const f of fechas) {
    let acum = 0, primero = true;
    for (const s of calcDia(f).segs) {
      if (s.abierto) continue;
      if (s.tipo !== 'comida') acum += s.fin - s.ini;
      const i = L.llevaAviso(s.tipo) ? infoAviso(s.avisoId) : null;
      horas.push({ f, s, acum, primero, num: i ? i.num || 'SIN Nº' : '', desc: i?.desc || '', obra: i?.obra || '' });
      primero = false;
    }
  }
  const gastos = [];
  for (const [id, porDia] of gastosPeriodo(fechas)) {
    const i = infoAviso(id);
    for (const [f, x] of [...porDia.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const num = i ? i.num || 'SIN Nº' : '';
      for (const dl of x.dietas) gastos.push({ f, num, desc: i?.desc || '', obra: i?.obra || '', concepto: `Dieta ${dl.toLowerCase()}`, km: null, importe: null, detalle: '', tickets: 0 });
      for (const g of x.gastos) gastos.push({ f, num, desc: i?.desc || '', obra: i?.obra || '', concepto: g.cat, km: g.cat === 'Kilómetros' ? g.km : null, importe: g.cat === 'Kilómetros' ? null : g.importe, detalle: g.detalle || '', tickets: g.fotos?.length || 0 });
    }
  }
  return { horas, gastos };
}

function exportarExcel() {
  const p = periodo();
  const { horas, gastos } = filasPeriodo(p.fechas);
  const r = resumen(p.fechas);
  const B = (v) => ({ v, b: true });
  const hojaHoras = [[B('Fecha'), B('Día'), B('Inicio'), B('Fin'), B('Horas'), B('Horas (decimal)'), B('Acumulado día'), B('Tipo'), B('Compensación'), B('Aviso'), B('Descripción aviso'), B('Obra'), B('Comentario')]];
  for (const { f, s, acum, num, desc, obra } of horas) {
    const m = s.fin - s.ini;
    hojaHoras.push([fechaES(f), L.nombreDia(f), L.fmtHora(s.ini), L.fmtHora(s.fin), L.fmtHM(m), { v: Math.round((m / 60) * 100) / 100, n: 'dec' }, L.fmtHM(acum), L.TIPO[s.tipo].label, s.tipo === 'extra' ? L.COMP[s.comp] : '', num, desc, obra, s.comentario || '']);
  }
  const hojaGastos = [[B('Fecha'), B('Aviso'), B('Descripción aviso'), B('Obra'), B('Concepto'), B('Km'), B('Importe (€)'), B('Detalle'), B('Tickets')]];
  for (const g of gastos) hojaGastos.push([fechaES(g.f), g.num, g.desc, g.obra, g.concepto, g.km ?? '', g.importe != null ? { v: g.importe, n: 'dec' } : '', g.detalle, g.tickets || '']);
  const hojaRes = [[B('Concepto'), B('Horas'), B('Horas (decimal)')]];
  const lineaRes = (l, m) => hojaRes.push([l, L.fmtHM(m), { v: Math.round((m / 60) * 100) / 100, n: 'dec' }]);
  lineaRes('Jornada objetivo', r.objetivo);
  lineaRes('Jornada hecha', r.jornada);
  for (const t of L.TIPOS) if (r.porTipo[t.id]) lineaRes(t.label, r.porTipo[t.id]);
  const bytes = xlsxBytes([
    { name: 'Horas', rows: hojaHoras, widths: [11, 6, 8, 8, 8, 9, 10, 22, 14, 15, 26, 32, 30] },
    { name: 'Gastos', rows: hojaGastos, widths: [11, 15, 26, 32, 18, 8, 11, 30, 8] },
    { name: 'Resumen', rows: hojaRes, widths: [26, 10, 14] },
  ]);
  descargar(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `horas-${p.archivo}.xlsx`);
  toast('Excel descargado');
}

function imprimir() {
  const p = periodo();
  const { horas, gastos } = filasPeriodo(p.fechas);
  const r = resumen(p.fechas);
  const el = document.getElementById('print');
  el.innerHTML = `<h1>Control horario · ${esc(p.titulo)} ${esc(p.sub)}</h1>
    <p>Jornada: ${L.fmtHM(r.jornada)} de ${L.fmtHM(r.objetivo)} · Prolongación: ${L.fmtHM(r.prol)} · Extra: ${L.fmtHM(r.extra)}</p>
    <h2>Horas</h2>
    <table><thead><tr><th>Fecha</th><th>Inicio</th><th>Fin</th><th class="num">Horas</th><th class="num">Acum.</th><th>Tipo</th><th>Aviso</th><th>Obra</th></tr></thead><tbody>
    ${horas.map(({ f, s, acum, primero, num, desc, obra }) => `<tr class="${primero ? 'nuevo-dia' : ''}"><td>${primero ? L.fechaCorta(f) : ''}</td><td>${L.fmtHora(s.ini)}</td><td>${L.fmtHora(s.fin)}</td><td class="num">${L.fmtHM(s.fin - s.ini)}</td><td class="num">${s.tipo === 'comida' ? '' : L.fmtHM(acum)}</td><td><span class="pt t-${s.tipo}">${esc(L.TIPO[s.tipo].label)}</span>${s.tipo === 'extra' ? ' (' + L.COMP[s.comp].toLowerCase() + ')' : ''}</td><td>${esc(num)}</td><td>${esc([desc, obra].filter(Boolean).join(' · '))}</td></tr>`).join('') || '<tr><td colspan="8">Sin horas</td></tr>'}
    </tbody></table>
    <h2>Gastos</h2>
    <table><thead><tr><th>Fecha</th><th>Aviso</th><th>Obra</th><th>Concepto</th><th class="num">Km</th><th class="num">Importe</th><th>Detalle</th></tr></thead><tbody>
    ${gastos.map((g) => `<tr><td>${L.fechaCorta(g.f)}</td><td>${esc(g.num)}</td><td>${esc([g.desc, g.obra].filter(Boolean).join(' · '))}</td><td>${esc(g.concepto)}</td><td class="num">${g.km != null ? numES(g.km) : ''}</td><td class="num">${g.importe != null ? euros(g.importe) : ''}</td><td>${esc(g.detalle)}</td></tr>`).join('') || '<tr><td colspan="7">Sin gastos</td></tr>'}
    </tbody></table>`;
  setTimeout(() => window.print(), 50);
}

async function exportarTickets() {
  const p = periodo();
  const set = new Set(p.fechas);
  const files = [];
  for (const g of S.gastos.filter((x) => set.has(x.fecha))) {
    const i = infoAviso(g.avisoId);
    let n = 0;
    for (const fid of g.fotos || []) {
      const blob = await DB.fotoLeer(fid);
      if (!blob) continue;
      n++;
      const ext = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/png' ? 'png' : 'jpg';
      const nombre = `${g.fecha}_${(i?.num || (i ? 'sin-numero' : 'sin-aviso'))}_${g.cat}${n > 1 ? '_' + n : ''}.${ext}`.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ]/g, '_');
      files.push({ name: nombre, data: new Uint8Array(await blob.arrayBuffer()) });
    }
  }
  if (!files.length) { toast('No hay fotos de tickets en este periodo'); return; }
  descargar(new Blob([zipBytes(files)], { type: 'application/zip' }), `tickets-${p.archivo}.zip`);
  toast(`${files.length} ticket${files.length > 1 ? 's' : ''} descargado${files.length > 1 ? 's' : ''}`);
}

// ---------------------------------------------------------------------------
// Copia de seguridad
// ---------------------------------------------------------------------------
const blobAB64 = (blob) => new Promise((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = () => mal(r.error);
  r.readAsDataURL(blob);
});
async function hacerCopia(compartir) {
  toast('Preparando copia…');
  const fotos = [];
  for (const id of await DB.fotoClaves()) {
    const b = await DB.fotoLeer(id);
    if (b) fotos.push({ id, type: b.type, data: await blobAB64(b) });
  }
  const json = JSON.stringify({ app: 'control-horario', version: 1, creada: new Date().toISOString(), estado: S, fotos });
  const nombre = `control-horario-copia-${hoy()}.json`;
  const file = new File([json], nombre, { type: 'application/json' });
  let hecho = false;
  if (compartir && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Copia control horario' });
      hecho = true;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  if (!hecho) descargar(file, nombre);
  S.ajustes.ultimaCopia = hoy();
  commit();
  toast('Copia hecha');
}
async function restaurar(file) {
  let datos;
  try {
    datos = JSON.parse(await file.text());
  } catch {
    toast('Ese archivo no es una copia válida');
    return;
  }
  if (datos.app !== 'control-horario' || !datos.estado) { toast('Ese archivo no es una copia de esta app'); return; }
  if (!confirm(`¿Restaurar la copia del ${new Date(datos.creada).toLocaleString('es-ES')}? Se sustituirán todos los datos actuales.`)) return;
  await DB.fotosVaciar();
  for (const f of datos.fotos || []) {
    const bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    await DB.fotoGuardar(f.id, new Blob([bin], { type: f.type }));
  }
  urls.clear();
  S = datos.estado;
  await cargarDesdeObjeto();
  commit();
  toast('Copia restaurada');
}
async function cargarDesdeObjeto() {
  const base = estadoVacio();
  for (const k of Object.keys(base)) if (S[k] == null) S[k] = base[k];
  S.ajustes = { ...base.ajustes, ...S.ajustes };
}

// ---------------------------------------------------------------------------
// Render y eventos
// ---------------------------------------------------------------------------
function render() {
  cache.clear();
  const { p, arg } = ruta();
  let html;
  let tab = p;
  switch (p) {
    case 'dia': html = vDia(arg); tab = 'hoy'; break;
    case 'gastos': html = vGastos(arg); break;
    case 'resumen': html = vResumen(); break;
    case 'bolsas': html = vBolsas(); break;
    case 'ajustes': html = vAjustes(); tab = ''; break;
    default: html = vHoy(); tab = 'hoy';
  }
  app.innerHTML = html;
  document.querySelectorAll('nav.tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  hidratarFotos(app);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.closest('#sheet')) return;
  e.preventDefault();
  const fn = ACC[el.dataset.a];
  if (fn) Promise.resolve(fn(el.dataset, el)).catch((err) => { console.error(err); toast('Error: ' + err.message); });
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-campo]');
  if (!el) {
    if (e.target.id === 'sFecha') {
      const meses = mesesSaldo(e.target.value);
      document.querySelectorAll('[data-mes]').forEach((s) => { s.textContent = cap(L.mesLargo(meses[+s.dataset.mes])); });
    }
    return;
  }
  if (el.dataset.campo === 'comentarioDia') {
    dia(el.dataset.f).comentario = el.value;
    guardar();
  }
  if (el.dataset.campo === 'restaurar' && el.files[0]) restaurar(el.files[0]).catch((err) => toast('Error: ' + err.message));
});
window.addEventListener('hashchange', () => {
  if (document.getElementById('sheet')) return;
  render();
  window.scrollTo(0, 0);
});

async function iniciar() {
  try {
    await cargar();
  } catch (e) {
    app.innerHTML = `<main class="content"><div class="warn">No se pudo abrir el almacenamiento del móvil: ${esc(e.message)}</div></main>`;
    return;
  }
  try { await navigator.storage?.persist?.(); } catch { /* sin permiso: seguimos */ }
  render();
  setInterval(() => {
    const p = ruta().p;
    if (!document.getElementById('sheet') && document.visibilityState === 'visible' && p === 'hoy') render();
  }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !document.getElementById('sheet') && !document.activeElement?.matches('input,textarea')) render();
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Hay una versión nueva de la app', { label: 'Actualizar', fn: () => w.postMessage('activar') });
          }
        });
      });
      let recargando = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recargando) return;
        recargando = true;
        location.reload();
      });
    } catch (e) {
      console.warn('Service worker no registrado', e);
    }
  }
}

// Acceso para pruebas automáticas
window.__app = { get estado() { return S; }, render, L };
iniciar();
