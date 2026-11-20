// Generadores de archivos sin dependencias: ZIP (sin comprimir) y Excel (.xlsx).

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const enc = new TextEncoder();

/** files: [{ name, data: Uint8Array | string }] → Uint8Array */
export function zipBytes(files) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const partes = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nombre = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint16(8, 0, true);
    h.setUint16(10, dosTime, true);
    h.setUint16(12, dosDate, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, nombre.length, true);
    h.setUint16(28, 0, true);
    partes.push(new Uint8Array(h.buffer), nombre, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true);
    c.setUint16(14, dosDate, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nombre);
    offset += 30 + nombre.length + data.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, files.length, true);
  fin.setUint16(10, files.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const x of todo) { out.set(x, p); p += x.length; }
  return out;
}

const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function colRef(i) {
  let s = '';
  i += 1;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

/**
 * sheets: [{ name, rows: [[cell]], widths?: [n], merges?: [[fila, colIni, colFin]], heights?: { fila: alto } }]
 * cell: string | number | null | { v, b?: true, n?: 'dec', fill?: 'RRGGBB', color?: 'RRGGBB' }
 * (filas y columnas empiezan en 0). Una celda vacía con estilo se escribe igualmente
 * para que el color de una fila combinada llegue hasta el final.
 */
export function xlsxBytes(sheets) {
  // Estilos: se registran según se usan (fuente + relleno + formato de número)
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const idx = { font: new Map(), fill: new Map(), xf: new Map() };
  const registrar = (mapa, lista, clave, xmlTxt) => {
    if (!mapa.has(clave)) { mapa.set(clave, lista.length); lista.push(xmlTxt); }
    return mapa.get(clave);
  };
  const estilo = (o) => {
    if (!o.b && !o.n && !o.fill && !o.color) return 0;
    const color = o.color ? `<color rgb="FF${o.color}"/>` : '';
    const fontId = o.b || o.color ? registrar(idx.font, fonts, `${!!o.b}|${o.color || ''}`, `<font>${o.b ? '<b/>' : ''}<sz val="11"/>${color}<name val="Calibri"/></font>`) : 0;
    const fillId = o.fill ? registrar(idx.fill, fills, o.fill, `<fill><patternFill patternType="solid"><fgColor rgb="FF${o.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const numFmtId = o.n === 'dec' ? 2 : 0;
    const clave = `${fontId}|${fillId}|${numFmtId}`;
    return registrar(idx.xf, xfs, clave, `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${numFmtId ? ' applyNumberFormat="1"' : ''}/>`);
  };

  const hojasXml = sheets.map((s) => {
    const filas = s.rows.map((fila, r) => {
      const celdas = fila.map((c, ci) => {
        if (c == null) return '';
        const o = typeof c === 'object' ? c : { v: c };
        const st = estilo(o);
        const ref = colRef(ci) + (r + 1);
        const sAttr = st ? ` s="${st}"` : '';
        if (o.v == null || o.v === '') return st ? `<c r="${ref}"${sAttr}/>` : '';
        if (typeof o.v === 'number' && isFinite(o.v)) return `<c r="${ref}"${sAttr}><v>${o.v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${sAttr}><is><t xml:space="preserve">${xml(o.v)}</t></is></c>`;
      }).join('');
      const ht = s.heights?.[r];
      return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${celdas}</row>`;
    }).join('');
    const cols = s.widths ? `<cols>${s.widths.map((w, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const vista = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    const merges = s.merges?.length ? `<mergeCells count="${s.merges.length}">${s.merges.map(([r, a, b]) => `<mergeCell ref="${colRef(a)}${r + 1}:${colRef(b)}${r + 1}"/>`).join('')}</mergeCells>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${vista}${cols}<sheetData>${filas}</sheetData>${merges}</worksheet>`;
  });

  const files = [];
  const ct = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${ct}</Types>` });
  files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  const hojas = sheets.map((s, i) => `<sheet name="${xml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas}</sheets></workbook>` });
  const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  files.push({ name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` });
  hojasXml.forEach((data, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data }));
  return zipBytes(files);
}
