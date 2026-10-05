import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateEd25519KeyPair,
  signEd25519,
  verifyEd25519,
  canonicalizeJson,
  encodeMultibase,
  decodeMultibase,
  sha256
} from '../src/core/crypto.js';

describe('Módulo Criptográfico Ed25519 y Multibase', () => {
  it('Debe generar un par de claves Ed25519 con formato multibase z...', () => {
    const keyPair = generateEd25519KeyPair();
    assert.ok(keyPair.publicKeyMultibase.startsWith('z'), 'La clave pública debe ser multibase base58btc (z...)');
    assert.ok(keyPair.publicKeyPem.includes('BEGIN PUBLIC KEY'));
    assert.ok(keyPair.privateKeyPem.includes('BEGIN PRIVATE KEY'));
  });

  it('Debe canonicalizar objetos JSON de forma determinista (RFC 8785 JCS)', () => {
    const objA = { b: 2, a: 1, c: { z: 10, y: 5 } };
    const objB = { c: { y: 5, z: 10 }, a: 1, b: 2 };
    
    const canonA = canonicalizeJson(objA);
    const canonB = canonicalizeJson(objB);

    assert.strictEqual(canonA, canonB, 'El orden de las propiedades no debe afectar el resultado');
    assert.strictEqual(canonA, '{"a":1,"b":2,"c":{"y":5,"z":10}}');
  });

  it('Debe firmar y verificar datos correctamente con Ed25519', () => {
    const keyPair = generateEd25519KeyPair();
    const message = 'Título Universitario UBA - Licenciatura en Computación';

    const signature = signEd25519(message, keyPair.privateKeyPem);
    assert.ok(signature.startsWith('z'), 'La firma debe iniciar con prefijo multibase z');

    const isValid = verifyEd25519(message, signature, keyPair.publicKeyMultibase);
    assert.strictEqual(isValid, true, 'La firma debe ser válida con la clave pública generada');
  });

  it('Debe rechazar la firma si el mensaje es alterado', () => {
    const keyPair = generateEd25519KeyPair();
    const originalMessage = 'Licenciatura en Ciencias de la Computación';
    const tamperedMessage = 'Doctorado en Ciencias de la Computación';

    const signature = signEd25519(originalMessage, keyPair.privateKeyPem);
    const isValid = verifyEd25519(tamperedMessage, signature, keyPair.publicKeyMultibase);

    assert.strictEqual(isValid, false, 'La firma debe ser rechazada si el contenido cambia');
  });

  it('Debe codificar y decodificar en Base58btc multibase con precisión de bytes', () => {
    const original = Buffer.from('Universidad de Buenos Aires 2026', 'utf8');
    const encoded = encodeMultibase(original);
    assert.ok(encoded.startsWith('z'));

    const decoded = decodeMultibase(encoded);
    assert.deepStrictEqual(decoded, original);
  });
});
