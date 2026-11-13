// Bill photos: kept on the phone in IndexedDB (so they work offline) and uploaded to Supabase Storage.

const DB_NAME = 'trip-splitter-bills';
const STORE = 'photos';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const putBlob = (path, blob) => tx('readwrite', (s) => s.put(blob, path)).catch(() => {});
export const getBlob = (path) => tx('readonly', (s) => s.get(path)).catch(() => undefined);
export const deleteBlob = (path) => tx('readwrite', (s) => s.delete(path)).catch(() => {});

// Shrink a camera photo (often 4–8 MB) to ~200–400 KB so it uploads on a weak signal.
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read this image.'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Could not process this image.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
