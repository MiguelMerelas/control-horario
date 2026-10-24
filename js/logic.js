// Lógica pura de la app: fechas, clasificación de horas y bolsas.
// No toca el DOM ni la base de datos, para poder probarla aparte.

export const TIPOS = [
  { id: 'ordinaria', label: 'Ordinaria', grupo: 'jornada' },
  { id: 'desplazamiento', label: 'Desplazamiento', grupo: 'jornada' },
  { id: 'prolongacion', label: 'Prolongación', grupo: 'prol' },
  { id: 'extra', label: 'Extra', grupo: 'extra' },
  { id: 'comida', label: 'Comida', grupo: 'nada', sinAviso: true },
  { id: 'libranza_prol', label: 'Libranza prolongación', grupo: 'jornada', sinAviso: true },
  { id: 'libranza_extra', label: 'Libranza extra', grupo: 'jornada', sinAviso: true },
  { id: 'vacaciones', label: 'Vacaciones', grupo: 'jornada', sinAviso: true },
  { id: 'enfermedad', label: 'Enfermedad', grupo: 'jornada', sinAviso: true },
  { id: 'info', label: 'INFO (formación)', grupo: 'jornada', sinAviso: true },
  { id: 'preventa', label: 'Preventa', grupo: 'jornada', sinAviso: true },
];
export const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t]));
/** ¿Este tipo de hora va asociado a un aviso? */
export const llevaAviso = (tipo) => !TIPO[tipo]?.sinAviso;

export const COMP = { cobro: 'Cobro', total: 'Canje total', parcial: 'Canje parcial' };
export const COMP_FACTOR = { cobro: 0, total: 1.75, parcial: 0.5 };

export const CATEGORIAS_GASTO = ['Hotel', 'Peaje', 'Parking', 'Kilómetros', 'Transporte', 'Otros'];
export const DIETAS = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'comida', label: 'Comida' },
  { id: 'cena', label: 'Cena' },
  { id: 'viaje', label: 'Viaje extendido' },
];

export const JORNADA_INVIERNO = 510; // 8:30
export const JORNADA_VERANO = 395; // 6:35
export const PROL_MAX_DIA = 120;
export const PROL_MAX_MES = 32 * 60;
export const PROL_MAX_ANIO = 85 * 60;
export const EXTRA_MAX_ANIO = 80 * 60;
export const ORD_MAX_DIA = 12 * 60;

// ---------- Fechas (siempre 'AAAA-MM-DD', hora local) ----------

const pad = (n) => String(n).padStart(2, '0');

export function parseFecha(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtFecha(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
export function hoyStr(now = new Date()) {
  return fmtFecha(now);
}
export function ahoraMin(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}
export function addDias(s, n) {
  const d = parseFecha(s);
  d.setDate(d.getDate() + n);
  return fmtFecha(d);
}
/** 1 = lunes … 7 = domingo */
export function diaSemana(s) {
  return ((parseFecha(s).getDay() + 6) % 7) + 1;
}
export function lunesDe(s) {
  return addDias(s, 1 - diaSemana(s));
}
export function diasSemana(s) {
  const l = lunesDe(s);
  return Array.from({ length: 7 }, (_, i) => addDias(l, i));
}
export function diasMes(s) {
  const [y, m] = s.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}
export function semanaISO(s) {
  const d = parseFecha(s);
  const jueves = new Date(d);
  jueves.setDate(d.getDate() + 4 - (((d.getDay() + 6) % 7) + 1));
  const inicioAnio = new Date(jueves.getFullYear(), 0, 1);
  return Math.floor(Math.round((jueves - inicioAnio) / 86400000) / 7) + 1;
}
/** Último día en que se pueden librar las horas de prolongación generadas en `mes` ('AAAA-MM'). */
export function caducidad(mes) {
  const [y, m] = mes.split('-').map(Number);
  return fmtFecha(new Date(y, m - 1 + 3, 0));
}
export function diasEntre(a, b) {
  return Math.round((parseFecha(b) - parseFecha(a)) / 86400000);
}

export function esVerano(s) {
  const md = Number(s.slice(5, 7)) * 100 + Number(s.slice(8, 10));
  return md >= 615 && md <= 914; // 15 jun – 14 sep, ambos incluidos
}
export function esLaborable(s, festivos) {
  return diaSemana(s) <= 5 && !festivos.has(s);
}
/** Horas que tocan ese día según calendario (para el objetivo semanal y mensual). */
export function jornadaBase(s, festivos) {
  if (!esLaborable(s, festivos)) return 0;
  return esVerano(s) ? JORNADA_VERANO : JORNADA_INVIERNO;
}

// ---------- Formatos ----------

export function fmtHM(min, conSigno = false) {
  const neg = min < 0;
  const a = Math.abs(Math.round(min));
  const txt = `${Math.floor(a / 60)}:${pad(a % 60)}`;
  if (neg) return '−' + txt;
  return conSigno && a > 0 ? '+' + txt : txt;
}
/** Minutos desde 00:00 → 'HH:MM' (si pasa de medianoche, marca '+1'). */
export function fmtHora(min) {
  if (min == null) return '—';
  const dia = Math.floor(min / 1440);
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}${dia > 0 ? ' (+1)' : ''}`;
}
export function parseHora(s) {
  const m = /^\s*(\d{1,2})[:.h](\d{2})\s*$/.exec(s || '');
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}
/** '8:30', '8,5', '-2:00', '2' → minutos */
export function parseDuracion(s) {
  if (s == null) return null;
  let t = String(s).trim().replace('−', '-');
  if (t === '') return 0;
  let signo = 1;
  if (t.startsWith('-')) { signo = -1; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
  let m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return signo * (+m[1] * 60 + +m[2]);
  m = /^(\d+)(?:[.,](\d+))?$/.exec(t);
  if (m) return signo * Math.round(parseFloat(`${m[1]}.${m[2] || 0}`) * 60);
  return null;
}
export function fmtDecimal(min) {
  return (Math.round((min / 60) * 100) / 100).toString().replace('.', ',');
}

const DIAS_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function nombreDia(s, largo = false) {
  return (largo ? DIAS_LARGO : DIAS_CORTO)[diaSemana(s) - 1];
}
export function fechaLarga(s, conAnio = false) {
  const d = parseFecha(s);
  return `${cap(DIAS_LARGO[diaSemana(s) - 1])} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}${conAnio ? ' ' + d.getFullYear() : ''}`;
}
export function fechaCorta(s) {
  const d = parseFecha(s);
  return `${cap(DIAS_CORTO[diaSemana(s) - 1])} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}
export function nombreMes(mes, conAnio = true) {
  const [y, m] = mes.split('-').map(Number);
  return `${cap(MESES[m - 1])}${conAnio ? ' ' + y : ''}`;
}
export function mesLargo(mes) {
  return MESES[Number(mes.slice(5, 7)) - 1];
}

// ---------- Clasificación de un día ----------

/**
 * Convierte los tramos de un día en segmentos con su tipo de hora.
 * - Tramos con `tipo` fijado por el usuario se respetan tal cual.
 * - Los automáticos de trabajo o viaje rellenan primero la jornada del día
 *   (el viaje dentro de la jornada queda como Desplazamiento), luego hasta
 *   2 h de prolongación (solo lunes a viernes laborables) y el resto es Extra.
 */
export function clasificarDia(tramos, { objetivo, laborable, ahora = null, compDefecto = 'cobro' }) {
  const ts = tramos.slice().sort((a, b) => a.ini - b.ini || (a.fin ?? 1e9) - (b.fin ?? 1e9));
  const prolMax = laborable ? PROL_MAX_DIA : 0;
  let ord = 0, prol = 0;
  const segs = [];
  for (const t of ts) {
    const fin = t.fin ?? ahora;
    if (fin == null || fin <= t.ini) continue;
    const dur = fin - t.ini;
    const base = {
      tramoId: t.id, avisoId: t.avisoId || null, comp: t.comp || compDefecto,
      abierto: t.fin == null, manual: !!t.tipo, clase: t.clase, comentario: t.comentario || '',
    };
    if (t.tipo) {
      segs.push({ ...base, ini: t.ini, fin, tipo: t.tipo });
      const g = TIPO[t.tipo]?.grupo;
      if (g === 'jornada') ord += dur;
      else if (g === 'prol') prol += dur;
      continue;
    }
    if (t.clase === 'comida') {
      segs.push({ ...base, ini: t.ini, fin, tipo: 'comida' });
      continue;
    }
    let cur = t.ini, rest = dur;
    const pieza = (ini, finP, tipo) => segs.push({ ...base, abierto: base.abierto && finP === fin, ini, fin: finP, tipo });
    const a = Math.min(rest, Math.max(0, objetivo - ord));
    if (a > 0) {
      pieza(cur, cur + a, t.clase === 'desplazamiento' ? 'desplazamiento' : 'ordinaria');
      cur += a; rest -= a; ord += a;
    }
    const b = Math.min(rest, Math.max(0, prolMax - prol));
    if (b > 0) {
      pieza(cur, cur + b, 'prolongacion');
      cur += b; rest -= b; prol += b;
    }
    if (rest > 0) pieza(cur, cur + rest, 'extra');
  }
  return segs;
}

export function totales(segs) {
  const porTipo = Object.fromEntries(TIPOS.map((t) => [t.id, 0]));
  for (const s of segs) porTipo[s.tipo] += s.fin - s.ini;
  let jornada = 0;
  for (const t of TIPOS) if (t.grupo === 'jornada') jornada += porTipo[t.id];
  const trabajoOrd = porTipo.ordinaria + porTipo.desplazamiento;
  return {
    porTipo, jornada, trabajoOrd,
    prol: porTipo.prolongacion,
    extra: porTipo.extra,
    comida: porTipo.comida,
    computable: jornada + porTipo.prolongacion + porTipo.extra,
  };
}

export function avisosDia(tramos, segs, { laborable, verano }) {
  const out = [];
  const ts = tramos.filter((t) => t.fin != null).sort((a, b) => a.ini - b.ini);
  for (let i = 1; i < ts.length; i++) {
    if (ts[i].ini < ts[i - 1].fin) { out.push('Hay tramos que se solapan. Revisa las horas.'); break; }
  }
  const tot = totales(segs);
  if (tot.trabajoOrd > ORD_MAX_DIA) out.push('Más de 12 h de jornada ordinaria en el día.');
  if (tot.prol > PROL_MAX_DIA) out.push('Más de 2 h de prolongación en el día.');
  if (!laborable && tot.prol > 0) out.push('Prolongación en fin de semana o festivo: normalmente sería extra.');
  if (laborable && !verano && tot.computable > 360 && tot.comida < 30) {
    out.push('Sin pausa de comida de al menos 30 min (obligatoria en invierno).');
  }
  return out;
}

/** Huecos sin fichar entre el primer y el último tramo del día: [{ini, fin}] */
export function huecos(tramos) {
  const ts = tramos.slice().sort((a, b) => a.ini - b.ini);
  const out = [];
  let finMax = null;
  for (const t of ts) {
    if (finMax != null && t.ini > finMax) out.push({ ini: finMax, fin: t.ini });
    const f = t.fin == null ? Infinity : t.fin;
    finMax = finMax == null ? f : Math.max(finMax, f);
  }
  return out;
}

/** Tramos que se pisan entre sí: Map(idTramo → [tramos con los que se solapa]) */
export function solapes(tramos, ahora = null) {
  const m = new Map();
  const finDe = (t) => t.fin ?? ahora ?? Infinity;
  for (let i = 0; i < tramos.length; i++) {
    for (let j = i + 1; j < tramos.length; j++) {
      const a = tramos[i], b = tramos[j];
      if (a.ini < finDe(b) && b.ini < finDe(a)) {
        if (!m.has(a.id)) m.set(a.id, []);
        if (!m.has(b.id)) m.set(b.id, []);
        m.get(a.id).push(b);
        m.get(b.id).push(a);
      }
    }
  }
  return m;
}

// ---------- Manipulación de tramos ----------

/** Corta el tramo t para que [a,b] tenga el tipo indicado. Devuelve los trozos. */
export function partirTramo(t, a, b, tipo, nuevoId) {
  const trozos = [];
  if (a > t.ini) trozos.push({ ...t, id: nuevoId(), fin: a });
  if (t.fin == null) {
    trozos.push({ ...t, id: nuevoId(), ini: a, fin: null, tipo });
    return trozos;
  }
  trozos.push({ ...t, id: nuevoId(), ini: a, fin: b, tipo });
  if (b < t.fin) trozos.push({ ...t, id: nuevoId(), ini: b });
  return trozos;
}

const mismoContenido = (a, b) =>
  a.fecha === b.fecha && a.clase === b.clase && (a.tipo || null) === (b.tipo || null) &&
  (a.avisoId || null) === (b.avisoId || null) && (a.comp || null) === (b.comp || null) &&
  (a.comentario || '') === (b.comentario || '');

/** Junta tramos contiguos idénticos (para que no se acumulen cortes innecesarios). */
export function fusionar(tramos) {
  const ts = tramos.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.ini - b.ini));
  const out = [];
  for (const t of ts) {
    const prev = out[out.length - 1];
    if (prev && prev.fin != null && prev.fin === t.ini && mismoContenido(prev, t)) {
      prev.fin = t.fin;
    } else out.push({ ...t });
  }
  return out;
}

// ---------- Bolsa de prolongación ----------

/**
 * movs: [{fecha, min}] (+ prolongación generada, − libranza de prolongación), solo posteriores al saldo de partida.
 * inicial: { fecha, lotes:[{mes, min}], netoAnual }
 */
export function libroProlongacion(inicial, movs, hoy) {
  let lotes = [];
  let deuda = 0;
  const caducadas = [];
  for (const l of (inicial?.lotes || []).slice().sort((a, b) => (a.mes < b.mes ? -1 : 1))) {
    if (l.min > 0) lotes.push({ mes: l.mes, min: l.min });
    else if (l.min < 0) deuda += -l.min;
  }
  const consumir = (x) => {
    for (const l of lotes) {
      const r = Math.min(x, l.min);
      l.min -= r; x -= r;
      if (!x) break;
    }
    lotes = lotes.filter((l) => l.min > 0);
    return x;
  };
  if (deuda > 0) deuda = consumir(deuda);
  const caducar = (fecha) => {
    lotes = lotes.filter((l) => {
      if (caducidad(l.mes) < fecha) { caducadas.push({ ...l, caduca: caducidad(l.mes) }); return false; }
      return true;
    });
  };
  const ordenados = movs.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  for (const m of ordenados) {
    caducar(m.fecha);
    if (m.min > 0) {
      let x = m.min;
      const r = Math.min(x, deuda);
      deuda -= r; x -= r;
      if (x > 0) {
        const mes = m.fecha.slice(0, 7);
        let l = lotes.find((q) => q.mes === mes);
        if (!l) { l = { mes, min: 0 }; lotes.push(l); lotes.sort((p, q) => (p.mes < q.mes ? -1 : 1)); }
        l.min += x;
      }
    } else if (m.min < 0) {
      deuda += consumir(-m.min);
    }
  }
  caducar(hoy);
  const anio = hoy.slice(0, 4), mes = hoy.slice(0, 7);
  const fi = inicial?.fecha || '';
  let netoAnual = fi.slice(0, 4) === anio ? inicial.netoAnual || 0 : 0;
  let netoMes = 0;
  if (fi.slice(0, 7) === mes) netoMes += (inicial.lotes || []).filter((l) => l.mes === mes).reduce((s, l) => s + l.min, 0);
  for (const m of ordenados) {
    if (m.fecha.slice(0, 4) === anio) netoAnual += m.min;
    if (m.fecha.slice(0, 7) === mes) netoMes += m.min;
  }
  const saldo = lotes.reduce((s, l) => s + l.min, 0) - deuda;
  return {
    saldo, deuda, netoAnual, netoMes,
    lotes: lotes.map((l) => ({ ...l, caduca: caducidad(l.mes), diasRestantes: diasEntre(hoy, caducidad(l.mes)) })),
    caducadas,
  };
}

// ---------- Horas extra ----------

/**
 * extras: [{fecha, min, comp}], libranzas: [{fecha, min}] — solo posteriores al saldo de partida.
 * inicial: { fecha, cobro, parcial, total, bolsa }
 */
export function libroExtras(inicial, extras, libranzas, hoy) {
  const anio = hoy.slice(0, 4);
  const mismoAnio = (inicial?.fecha || '').slice(0, 4) === anio;
  const porComp = {
    cobro: mismoAnio ? inicial.cobro || 0 : 0,
    parcial: mismoAnio ? inicial.parcial || 0 : 0,
    total: mismoAnio ? inicial.total || 0 : 0,
  };
  let generadas = 0;
  for (const e of extras) {
    if (e.fecha.slice(0, 4) === anio) porComp[e.comp] = (porComp[e.comp] || 0) + e.min;
    generadas += e.min * (COMP_FACTOR[e.comp] || 0);
  }
  const libradas = libranzas.reduce((s, l) => s + l.min, 0);
  generadas = Math.round(generadas);
  return {
    porComp,
    hechasAnio: porComp.cobro + porComp.parcial + porComp.total,
    generadas, libradas,
    bolsa: (inicial?.bolsa || 0) + generadas - libradas,
  };
}

// ---------- Validaciones ----------

export function avisoValido(n) {
  return /^\d{9}-\d{1,3}$/.test((n || '').trim());
}
