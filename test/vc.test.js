import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { createDegreeCredential, signCredential } from '../src/core/vc.js';
import { generateEd25519KeyPair } from '../src/core/crypto.js';

describe('W3C Verifiable Credentials 2.0 y Open Badges 3.0', () => {
  it('Debe generar la estructura de credencial conforme al esquema de la Sección 6', () => {
    const vc = createDegreeCredential({
      issuerDid: 'did:web:uba.ar',
      issuerName: 'Universidad de Buenos Aires',
      degreeName: 'Licenciatura en Ciencias de la Computación',
      achievementType: 'BachelorDegree',
      graduateName: 'Juan Ignacio Pérez',
      graduateDni: '38123456',
      faculty: 'Facultad de Ciencias Exactas y Naturales',
      graduationDate: '2026-12-10',
      statusIndex: 94567,
      statusCredentialUrl: 'https://uba.ar/estado/1'
    });

    // Validar contextos W3C y Open Badges
    assert.ok(vc['@context'].includes('https://www.w3.org/ns/credentials/v2'));
    assert.ok(vc['@context'].includes('https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'));

    // Validar tipos
    assert.ok(vc.type.includes('VerifiableCredential'));
    assert.ok(vc.type.includes('OpenBadgeCredential'));

    // Validar emisor
    assert.strictEqual(vc.issuer.id, 'did:web:uba.ar');
    assert.strictEqual(vc.issuer.name, 'Universidad de Buenos Aires');

    // Validar achievement (Open Badges)
    assert.strictEqual(vc.credentialSubject.type[0], 'AchievementSubject');
    assert.strictEqual(vc.credentialSubject.achievement.achievementType, 'BachelorDegree');
    assert.strictEqual(vc.credentialSubject.achievement.name, 'Licenciatura en Ciencias de la Computación');

    // Validar privacidad de datos (Ley 25.326: DNI con hash sha256)
    assert.ok(vc.credentialSubject.graduate.documentNumberHash.startsWith('sha256:'));
    assert.notStrictEqual(vc.credentialSubject.graduate.documentNumberHash, '38123456');

    // Validar lista de estado
    assert.strictEqual(vc.credentialStatus.type, 'BitstringStatusListEntry');
    assert.strictEqual(vc.credentialStatus.statusPurpose, 'revocation');
    assert.strictEqual(vc.credentialStatus.statusListIndex, '94567');
    assert.strictEqual(vc.credentialStatus.statusListCredential, 'https://uba.ar/estado/1');
  });

  it('Debe firmar la credencial generando DataIntegrityProof eddsa-rdfc-2022', () => {
    const keyPair = generateEd25519KeyPair();
    const unsigned = createDegreeCredential({
      degreeName: 'Médico',
      graduateName: 'Sofía Rossi',
      graduateDni: '39456789',
      faculty: 'Facultad de Medicina',
      statusIndex: 12,
      statusCredentialUrl: 'https://uba.ar/estado/1'
    });

    const signed = signCredential(unsigned, keyPair.privateKeyPem, 'did:web:uba.ar#clave-2026');

    assert.ok(signed.proof);
    assert.strictEqual(signed.proof.type, 'DataIntegrityProof');
    assert.strictEqual(signed.proof.cryptosuite, 'eddsa-rdfc-2022');
    assert.strictEqual(signed.proof.verificationMethod, 'did:web:uba.ar#clave-2026');
    assert.ok(signed.proof.proofValue.startsWith('z'));
  });
});
