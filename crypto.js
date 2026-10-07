// crypto.js — PBKDF2 (SHA-256, 600k итераций) -> AES-GCM 256. Только Web Crypto API.
const te = new TextEncoder(), td = new TextDecoder();
const ITER = 600000;

const b64 = (buf) => {
  const a = new Uint8Array(buf); let s = '';
  for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode.apply(null, a.subarray(i, i + 32768));
  return btoa(s);
};

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// Формат: iv(12) | ciphertext+tag
async function encryptBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}

async function decryptBytes(key, data) {
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12)));
}

// data.json.enc = salt(16) | iv(12) | AES-GCM(JSON)
async function encryptDb(key, salt, db) {
  const body = await encryptBytes(key, te.encode(JSON.stringify(db)));
  const out = new Uint8Array(16 + body.length);
  out.set(salt); out.set(body, 16);
  return out;
}

async function decryptDb(password, buf) {
  const salt = buf.slice(0, 16);
  const key = await deriveKey(password, salt);
  const db = JSON.parse(td.decode(await decryptBytes(key, buf.slice(16))));
  return { key, salt, db };
}
