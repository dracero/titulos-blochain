import { test, describe, it, before } from 'node:test';
import assert from 'node:assert';

import { generateEd25519KeyPair } from '../src/core/crypto.js';
import DidWebManager from '../src/core/did.js';
import BitstringStatusList from '../src/core/status-list.js';
import { createDegreeCredential, signCredential } from '../src/core/vc.js';
import { hashCredential, buildMerkleTree, getMerkleProof } from '../src/core/merkle.js';
import DegreeVerifier from '../src/core/verifier.js';
import EvmSimulator from '../src/blockchain/evm-simulator.js';

describe('Flujo de Integración End-to-End: Emisión, Anclaje y Verificación UBA', () => {
  let hsmKeys;
  let didManager;
  let statusList;
  let evmSimulator;
  let verifier;
  let testCredential;
  let testProof;
  let testRoot;

  before(async () => {
    // 1. Inicializar componentes institucionales de la UBA
    hsmKeys = generateEd25519KeyPair();
    didManager = new DidWebManager('uba.ar', 'clave-2026', hsmKeys.publicKeyMultibase);
    statusList = new BitstringStatusList(100000);
    evmSimulator = new EvmSimulator({ networkName: 'Besu QBFT Testnet' });

    verifier = new DegreeVerifier({
      anchorService: evmSimulator,
      fallbackDidDoc: didManager.getDidDocument(),
      statusListProvider: async () => statusList
    });

    // 2. Emitir credencial para graduado
    const unsignedVc = createDegreeCredential({
      issuerDid: didManager.did,
      issuerName: 'Universidad de Buenos Aires',
      degreeName: 'Licenciatura en Ciencias de la Computación',
      graduateName: 'Juan Ignacio Pérez',
      graduateDni: '38123456',
      faculty: 'Facultad de Ciencias Exactas y Naturales',
      graduationDate: '2026-12-10',
      statusIndex: 94567,
      statusCredentialUrl: 'https://uba.ar/estado/1'
    });

    testCredential = signCredential(
      unsignedVc,
      hsmKeys.privateKeyPem,
      didManager.getVerificationMethodId()
    );

    // 3. Crear lote y árbol de Merkle
    const leaf1 = hashCredential(testCredential);
    const leaf2 = '0x' + Buffer.alloc(32, 1).toString('hex');
    const leaf3 = '0x' + Buffer.alloc(32, 2).toString('hex');
    const tree = buildMerkleTree([leaf1, leaf2, leaf3]);

    testRoot = tree.root;
    testProof = getMerkleProof(tree, 0);

    // 4. Anclar la raíz en la blockchain con costo 0 (gas=0)
    await evmSimulator.anchorMerkleRoot(
      testRoot,
      'LOTE-UBA-EXACTAS-2026-1',
      3,
      'Acta de Graduación Diciembre 2026'
    );
  });

  it('1. Verificación Completa Exitosa (Pasa los 4 niveles de la arquitectura)', async () => {
    const report = await verifier.verify({
      credential: testCredential,
      merkleProof: testProof,
      merkleRoot: testRoot
    });

    assert.strictEqual(report.isValid, true);
    assert.strictEqual(report.steps.didWeb.status, 'PASSED');
    assert.strictEqual(report.steps.signature.status, 'PASSED');
    assert.strictEqual(report.steps.statusList.status, 'PASSED');
    assert.strictEqual(report.steps.blockchainAnchor.status, 'PASSED');
    assert.strictEqual(report.degreeData.graduateName, 'Juan Ignacio Pérez');
  });

  it('2. Detección de Revocación en Bitstring Status List (Sección 2 y 4)', async () => {
    // Revocar el título en el índice 94567
    statusList.revoke(94567);

    const report = await verifier.verify({
      credential: testCredential,
      merkleProof: testProof,
      merkleRoot: testRoot
    });

    assert.strictEqual(report.isValid, false);
    assert.strictEqual(report.steps.statusList.status, 'REVOKED');
    assert.strictEqual(report.steps.statusList.isRevoked, true);

    // Restituir para siguientes pruebas
    statusList.unrevoke(94567);
  });

  it('3. Detección de Adulteración o Fraude (Falla Paso 2 - Firma Criptográfica)', async () => {
    // Modificar maliciosamente el nombre del graduado en el JSON
    const tamperedCredential = JSON.parse(JSON.stringify(testCredential));
    tamperedCredential.credentialSubject.graduate.name = 'Juan Carlos Hacker';

    const report = await verifier.verify({
      credential: tamperedCredential,
      merkleProof: testProof,
      merkleRoot: testRoot
    });

    assert.strictEqual(report.isValid, false);
    assert.strictEqual(report.steps.signature.status, 'FAILED');
  });

  it('4. Detección de Título Retroactivo / Falso Histórico (Falla Paso 4 - Ancla Blockchain)', async () => {
    // Probar contra una raíz falsa no anclada
    const unanchoredRoot = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    const report = await verifier.verify({
      credential: testCredential,
      merkleProof: testProof,
      merkleRoot: unanchoredRoot
    });

    // Falla en la prueba de Merkle o no se encuentra en la blockchain
    assert.strictEqual(report.isValid, false);
    assert.ok(report.steps.blockchainAnchor.status === 'FAILED' || report.steps.blockchainAnchor.status === 'NOT_ANCHORED');
  });

  it('5. Verificación Desacoplada sin Blockchain (Verificación Cotidiana Internacional)', async () => {
    // Simular que el verificador extranjero no consulta la blockchain
    const report = await verifier.verify({
      credential: testCredential,
      skipBlockchain: true
    });

    // Debe ser válido porque la firma y la lista de revocación son suficientes para la verificación del día a día
    assert.strictEqual(report.isValid, true);
    assert.strictEqual(report.steps.didWeb.status, 'PASSED');
    assert.strictEqual(report.steps.signature.status, 'PASSED');
    assert.strictEqual(report.steps.statusList.status, 'PASSED');
    assert.strictEqual(report.steps.blockchainAnchor.status, 'SKIPPED');
  });
});
