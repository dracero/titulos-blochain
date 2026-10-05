/**
 * Módulo Criptográfico para Títulos Universitarios Verificables (UBA).
 * Implementa:
 * - Algoritmo Ed25519 (Firma y Verificación)
 * - Serialización determinista y canónica (RFC 8785 JSON Canonicalization Scheme - JCS)
 * - Hash criptográfico SHA-256
 * - Multibase Base58btc ('z...') para firmas y claves públicas W3C Multikey
 * - 100% libre de costo, usando APIs nativas de Node.js (crypto)
 */

import crypto from 'node:crypto';

// Alfabeto Base58 Bitcoin
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET[i]] = i;
}

/**
 * Codifica un Buffer a Base58
 * @param {Buffer} buffer 
 * @returns {string}
 */
function toBase58(buffer) {
  if (!buffer || buffer.length === 0) return '';
  let digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += buffer[i];
    let carry = 0;
    for (let j = 0; j < digits.length; j++) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = '';
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) str += '1';
  for (let i = digits.length - 1; i >= 0; i--) str += BASE58_ALPHABET[digits[i]];
  return str;
}

/**
 * Decodifica una cadena Base58 a Buffer
 * @param {string} str 
 * @returns {Buffer}
 */
function fromBase58(str) {
  if (!str || str.length === 0) return Buffer.alloc(0);
  let bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (!(c in BASE58_MAP)) throw new Error('Caracter Base58 invalido: ' + c);
    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += BASE58_MAP[c];
    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) leadingZeros++;
  const result = Buffer.alloc(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[result.length - 1 - i] = bytes[i];
  }
  return result;
}

/**
 * Codifica a Multibase Base58btc (prefijo 'z')
 * @param {Buffer} buffer 
 * @returns {string}
 */
function encodeMultibase(buffer) {
  return 'z' + toBase58(buffer);
}

/**
 * Decodifica Multibase Base58btc (remueve prefijo 'z')
 * @param {string} multibaseStr 
 * @returns {Buffer}
 */
function decodeMultibase(multibaseStr) {
  if (!multibaseStr || !multibaseStr.startsWith('z')) {
    throw new Error('Formato Multibase invalido: debe comenzar con "z" (base58btc)');
  }
  return fromBase58(multibaseStr.slice(1));
}

/**
 * Calcula el hash SHA-256 de un buffer o cadena
 * @param {Buffer|string} data 
 * @returns {Buffer} 32 bytes
 */
function sha256(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  return crypto.createHash('sha256').update(buf).digest();
}

/**
 * Canonicalización determinista de objetos JSON (RFC 8785 JSON Canonicalization Scheme - JCS)
 * @param {any} obj 
 * @returns {string}
 */
function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalizeJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => {
    const val = obj[k];
    if (val === undefined) return null;
    return JSON.stringify(k) + ':' + canonicalizeJson(val);
  }).filter(p => p !== null);
  return '{' + pairs.join(',') + '}';
}

/**
 * Genera un par de claves Ed25519 institucional para la UBA
 * @returns {{ publicKeyMultibase: string, privateKeyPem: string, rawPublicKeyHex: string, rawPublicKey: Buffer, keyPair: crypto.KeyPairSyncResult<string, string> }}
 */
function generateEd25519KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Extraer los 32 bytes crudos de la clave publica desde DER
  const spkiDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  const rawPub = spkiDer.subarray(12); // Header DER Ed25519 = 12 bytes

  // Multicodec para ed25519-pub = 0xed, 0x01
  const multicodecPub = Buffer.concat([Buffer.from([0xed, 0x01]), rawPub]);
  const publicKeyMultibase = encodeMultibase(multicodecPub);

  return {
    publicKeyMultibase,
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    rawPublicKeyHex: rawPub.toString('hex'),
    rawPublicKey: rawPub
  };
}

/**
 * Reconstruye un KeyObject de clave publica a partir de publicKeyMultibase
 * @param {string} multibaseKey 
 * @returns {crypto.KeyObject}
 */
function publicKeyFromMultibase(multibaseKey) {
  const decoded = decodeMultibase(multibaseKey);
  // Verificar multicodec ed25519-pub (0xed, 0x01)
  let rawPub;
  if (decoded[0] === 0xed && decoded[1] === 0x01) {
    rawPub = decoded.subarray(2);
  } else if (decoded.length === 32) {
    rawPub = decoded;
  } else {
    throw new Error('Multicodec de clave publica desconocido para Ed25519');
  }

  // Header DER SPKI para Ed25519 (RFC 8410)
  const derHeader = Buffer.from('302a300506032b6570032100', 'hex');
  const spkiDer = Buffer.concat([derHeader, rawPub]);

  return crypto.createPublicKey({
    key: spkiDer,
    format: 'der',
    type: 'spki'
  });
}

/**
 * Firma digitalmente un buffer o cadena usando la clave privada Ed25519
 * @param {Buffer|string} data 
 * @param {string|crypto.KeyObject} privateKeyPem 
 * @returns {string} Firma en formato Multibase Base58btc ('z...')
 */
function signEd25519(data, privateKeyPem) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const signature = crypto.sign(null, buf, privateKeyPem);
  return encodeMultibase(signature);
}

/**
 * Verifica una firma digital Ed25519
 * @param {Buffer|string} data 
 * @param {string} signatureMultibase Firma en Multibase Base58btc ('z...')
 * @param {crypto.KeyObject|string} publicKey 
 * @returns {boolean}
 */
function verifyEd25519(data, signatureMultibase, publicKey) {
  try {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const signatureBuffer = decodeMultibase(signatureMultibase);
    let keyObj = publicKey;
    if (typeof publicKey === 'string') {
      if (publicKey.startsWith('z')) {
        keyObj = publicKeyFromMultibase(publicKey);
      } else {
        keyObj = crypto.createPublicKey(publicKey);
      }
    }
    return crypto.verify(null, buf, keyObj, signatureBuffer);
  } catch (err) {
    return false;
  }
}

export {
  toBase58,
  fromBase58,
  encodeMultibase,
  decodeMultibase,
  sha256,
  canonicalizeJson,
  generateEd25519KeyPair,
  publicKeyFromMultibase,
  signEd25519,
  verifyEd25519
};

export default {
  toBase58,
  fromBase58,
  encodeMultibase,
  decodeMultibase,
  sha256,
  canonicalizeJson,
  generateEd25519KeyPair,
  publicKeyFromMultibase,
  signEd25519,
  verifyEd25519
};
