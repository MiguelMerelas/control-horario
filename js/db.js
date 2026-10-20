// Almacenamiento en el propio móvil (IndexedDB): el estado en un registro y las fotos aparte.
const NOMBRE = 'control-horario';
let abierta;

function abrir() {
  if (!abierta) {
    abierta = new Promise((ok, mal) => {
      const r = indexedDB.open(NOMBRE, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos');
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  }
  return abierta;
}

function op(almacen, modo, fn) {
  return abrir().then((db) => new Promise((ok, mal) => {
    const tx = db.transaction(almacen, modo);
    const req = fn(tx.objectStore(almacen));
    tx.oncomplete = () => ok(req ? req.result : undefined);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  }));
}

export const leer = (k) => op('kv', 'readonly', (s) => s.get(k));
export const escribir = (k, v) => op('kv', 'readwrite', (s) => s.put(v, k));
export const fotoLeer = (id) => op('fotos', 'readonly', (s) => s.get(id));
export const fotoGuardar = (id, blob) => op('fotos', 'readwrite', (s) => s.put(blob, id));
export const fotoBorrar = (id) => op('fotos', 'readwrite', (s) => s.delete(id));
export const fotoClaves = () => op('fotos', 'readonly', (s) => s.getAllKeys());
export const fotosVaciar = () => op('fotos', 'readwrite', (s) => s.clear());
