/**
 * Ed25519 signing and verification over WebCrypto (Node 20+, browsers,
 * workers), with node:crypto as a fallback where WebCrypto lacks Ed25519.
 *
 * Keys:
 *   private  PKCS#8 PEM ("BEGIN PRIVATE KEY"), or the raw 32-byte seed as
 *            base64 / base64url / hex
 *   public   SPKI PEM ("BEGIN PUBLIC KEY"), or the raw 32 bytes as base64 /
 *            base64url / hex
 *   key_id   first 16 hex characters of SHA-256 of the raw public key
 * Signatures are 64 bytes, base64url without padding.
 */
import { sha256Hex } from '@xyntherium/verify-core';

const PKCS8_PREFIX = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
const SPKI_PREFIX = new Uint8Array([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);

export class KeyFormatError extends Error {}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64Decode(s: string): Uint8Array {
  const t = s.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = t + '='.repeat((4 - (t.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexDecode(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** A copy backed by a plain ArrayBuffer, which is what WebCrypto accepts. */
function ab(u: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(u.length));
  out.set(u);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(a.length + b.length));
  out.set(a);
  out.set(b, a.length);
  return out;
}

function pemBody(pem: string, label: string): Uint8Array | null {
  const m = new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`).exec(pem);
  return m ? b64Decode(m[1].replace(/\s+/g, '')) : null;
}

function rawish(s: string): Uint8Array {
  const t = s.trim();
  if (/^[0-9a-f]{64}$/i.test(t)) return hexDecode(t);
  return b64Decode(t);
}

/** The raw 32-byte seed from any accepted private-key form. */
export function privateSeed(key: string): Uint8Array {
  const der = pemBody(key, 'PRIVATE KEY');
  if (der) {
    if (der.length !== 48 || !PKCS8_PREFIX.every((b, i) => der[i] === b)) throw new KeyFormatError('not an Ed25519 PKCS#8 private key');
    return der.slice(16);
  }
  const raw = rawish(key);
  if (raw.length !== 32) throw new KeyFormatError('an Ed25519 private key is a 32-byte seed (or a PKCS#8 PEM)');
  return raw;
}

/** The raw 32-byte public key from any accepted public-key form. */
export function publicRaw(key: string): Uint8Array {
  const der = pemBody(key, 'PUBLIC KEY');
  if (der) {
    if (der.length !== 44 || !SPKI_PREFIX.every((b, i) => der[i] === b)) throw new KeyFormatError('not an Ed25519 SPKI public key');
    return der.slice(12);
  }
  const raw = rawish(key);
  if (raw.length !== 32) throw new KeyFormatError('an Ed25519 public key is 32 bytes (or an SPKI PEM)');
  return raw;
}

export function keyIdOf(publicKeyRaw: Uint8Array): string {
  return sha256Hex(publicKeyRaw).slice(0, 16);
}

type Subtle = SubtleCrypto;
function subtle(): Subtle | null {
  return (globalThis as { crypto?: { subtle?: Subtle } }).crypto?.subtle ?? null;
}

async function nodeCrypto(): Promise<typeof import('node:crypto') | null> {
  try {
    return await import('node:crypto');
  } catch {
    return null;
  }
}

/** Derive the public key from a seed. */
export async function publicFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  const s = subtle();
  if (s) {
    try {
      const priv = await s.importKey('pkcs8', concat(PKCS8_PREFIX, seed), { name: 'Ed25519' }, true, ['sign']);
      const jwk = (await s.exportKey('jwk', priv)) as JsonWebKey;
      if (jwk.x) return b64Decode(jwk.x);
    } catch {
      // fall through to node:crypto
    }
  }
  const nc = await nodeCrypto();
  if (!nc) throw new Error('no Ed25519 implementation available');
  const priv = nc.createPrivateKey({ key: Buffer.from(concat(PKCS8_PREFIX, seed)), format: 'der', type: 'pkcs8' });
  const spki = nc.createPublicKey(priv).export({ format: 'der', type: 'spki' }) as Buffer;
  return new Uint8Array(spki.subarray(12));
}

export async function sign(message: Uint8Array, privateKey: string): Promise<{ signature: string; public_key: string; key_id: string }> {
  const seed = privateSeed(privateKey);
  const pub = await publicFromSeed(seed);
  const s = subtle();
  let sig: Uint8Array | null = null;
  if (s) {
    try {
      const k = await s.importKey('pkcs8', concat(PKCS8_PREFIX, seed), { name: 'Ed25519' }, false, ['sign']);
      sig = new Uint8Array(await s.sign({ name: 'Ed25519' }, k, ab(message)));
    } catch {
      sig = null;
    }
  }
  if (!sig) {
    const nc = await nodeCrypto();
    if (!nc) throw new Error('no Ed25519 implementation available');
    const k = nc.createPrivateKey({ key: Buffer.from(concat(PKCS8_PREFIX, seed)), format: 'der', type: 'pkcs8' });
    sig = new Uint8Array(nc.sign(null, Buffer.from(message), k));
  }
  return { signature: b64urlEncode(sig), public_key: b64urlEncode(pub), key_id: keyIdOf(pub) };
}

export async function verify(message: Uint8Array, signature: string, publicKey: string): Promise<boolean> {
  let pub: Uint8Array;
  let sig: Uint8Array;
  try {
    pub = publicRaw(publicKey);
    sig = b64Decode(signature);
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  const s = subtle();
  if (s) {
    try {
      const k = await s.importKey('raw', ab(pub), { name: 'Ed25519' }, false, ['verify']);
      return await s.verify({ name: 'Ed25519' }, k, ab(sig), ab(message));
    } catch {
      // fall through
    }
  }
  const nc = await nodeCrypto();
  if (!nc) return false;
  try {
    const k = nc.createPublicKey({ key: Buffer.from(concat(SPKI_PREFIX, pub)), format: 'der', type: 'spki' });
    return nc.verify(null, Buffer.from(message), k, Buffer.from(sig));
  } catch {
    return false;
  }
}

/** A fresh key pair, for `xyntherium-verify keygen` and tests. Returns the seed as base64url. */
export async function generateKeyPair(): Promise<{ private_key: string; public_key: string; key_id: string }> {
  const seed = new Uint8Array(32);
  (globalThis as { crypto: Crypto }).crypto.getRandomValues(seed);
  const pub = await publicFromSeed(seed);
  return { private_key: b64urlEncode(seed), public_key: b64urlEncode(pub), key_id: keyIdOf(pub) };
}

export function publicKeyPem(publicKeyRaw: Uint8Array): string {
  const der = concat(SPKI_PREFIX, publicKeyRaw);
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  return `-----BEGIN PUBLIC KEY-----\n${btoa(bin)}\n-----END PUBLIC KEY-----\n`;
}
