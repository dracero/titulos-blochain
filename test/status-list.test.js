import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import BitstringStatusList from '../src/core/status-list.js';

describe('W3C Bitstring Status List v1.0', () => {
  it('Debe inicializar la lista con todos los bits en 0 (vigentes)', () => {
    const list = new BitstringStatusList(10000);
    assert.strictEqual(list.getBit(0), 0);
    assert.strictEqual(list.getBit(42), 0);
    assert.strictEqual(list.getBit(9456), 0);
    assert.strictEqual(list.isRevoked(9456), false);
  });

  it('Debe permitir revocar índices individuales cambiando el bit a 1', () => {
    const list = new BitstringStatusList(100000);
    const indexToRevoke = 94567; // Mismo índice del ejemplo en la Sección 6

    list.revoke(indexToRevoke);

    assert.strictEqual(list.getBit(indexToRevoke), 1);
    assert.strictEqual(list.isRevoked(indexToRevoke), true);

    // Los vecinos no deben verse afectados
    assert.strictEqual(list.getBit(indexToRevoke - 1), 0);
    assert.strictEqual(list.getBit(indexToRevoke + 1), 0);
  });

  it('Debe permitir restituir (unrevoke) un título', () => {
    const list = new BitstringStatusList(5000);
    list.revoke(100);
    assert.strictEqual(list.isRevoked(100), true);

    list.unrevoke(100);
    assert.strictEqual(list.isRevoked(100), false);
  });

  it('Debe comprimir con gzip y codificar en multibase (prefijo "u")', () => {
    const list = new BitstringStatusList(100000);
    list.revoke(1234);
    list.revoke(5678);

    const encoded = list.encode();
    assert.ok(encoded.startsWith('u'), 'Debe iniciar con prefijo multibase "u"');
    assert.ok(encoded.length < 200, 'Debe comprimirse drásticamente (menos de 200 bytes para 100k bits)');

    // Reconstruir desde la cadena codificada
    const decodedList = BitstringStatusList.decode(encoded, 100000);
    assert.strictEqual(decodedList.isRevoked(1234), true);
    assert.strictEqual(decodedList.isRevoked(5678), true);
    assert.strictEqual(decodedList.isRevoked(1233), false);
  });

  it('Debe generar una Credencial Verificable conforme al estándar W3C', () => {
    const list = new BitstringStatusList(50000);
    const cred = list.generateCredential('https://uba.ar/estado/1', 'did:web:uba.ar');

    assert.strictEqual(cred.id, 'https://uba.ar/estado/1');
    assert.strictEqual(cred.type[1], 'BitstringStatusListCredential');
    assert.strictEqual(cred.issuer, 'did:web:uba.ar');
    assert.strictEqual(cred.credentialSubject.type, 'BitstringStatusList');
    assert.strictEqual(cred.credentialSubject.statusPurpose, 'revocation');
    assert.ok(cred.credentialSubject.encodedList.startsWith('u'));
  });
});
