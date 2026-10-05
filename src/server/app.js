/**
 * Servidor Express de Emisión, Publicación y Verificación de Títulos Universitarios UBA
 * Implementa la arquitectura completa definida en la propuesta técnica:
 * - Capa UBA: Sistema académico, Servicio de emisión VC 2.0 / Open Badges 3.0, HSM simulator.
 * - Capa Pública: did:web (/.well-known/did.json), Bitstring Status List (/estado/:id).
 * - Capa Blockchain: Anclaje de lotes Merkle en Hyperledger Besu o simulador BFA (gas=0).
 * - Verificador Público: Portal y API de validación en 4 fases.
 */

const express = require('express');
const cors = require('cors');
const path = require('node:path');
const QRCode = require('qrcode');

const { generateEd25519KeyPair } = require('../core/crypto');
const DidWebManager = require('../core/did');
const BitstringStatusList = require('../core/status-list');
const { hashCredential, buildMerkleTree, getMerkleProof } = require('../core/merkle');
const { createDegreeCredential, signCredential } = require('../core/vc');
const DegreeVerifier = require('../core/verifier');
const AnchorService = require('../blockchain/anchor-service');
const academicDb = require('./academic-db');

function createApp(options = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Claves institucionales UBA (Simulación de HSM protegido)
  const hsmKeys = generateEd25519KeyPair();
  const domain = options.domain || process.env.UBA_DOMAIN || 'localhost:4000';
  const keyId = 'clave-2026';
  
  const didManager = new DidWebManager(domain, keyId, hsmKeys.publicKeyMultibase);
  const statusList = new BitstringStatusList(100000);
  const anchorService = new AnchorService(options.anchorOptions || {});

  // Inicializar anchor service
  anchorService.init().catch(console.error);

  // Almacenamiento en memoria para el entorno de test
  const issuedCredentials = new Map(); // id -> { credential, statusIndex, leafHash, batchId, proof, isAnchored }
  let nextStatusIndex = 100; // Comenzar en índice 100 para pruebas
  let currentBatchCounter = 1;

  // Verificador con inyección de componentes locales
  const verifier = new DegreeVerifier({
    anchorService,
    fallbackDidDoc: didManager.getDidDocument(),
    statusListProvider: async (url) => statusList
  });

  // Auto-poblado de datos iniciales para demostración inmediata
  async function seedInitialData() {
    try {
      const initialGrads = academicDb.getAllGraduates();
      if (initialGrads.length >= 2 && issuedCredentials.size === 0) {
        // 1. Emitir diploma 1
        const g1 = initialGrads[0];
        const idx1 = nextStatusIndex++;
        const u1 = createDegreeCredential({
          issuerDid: didManager.did,
          issuerName: 'Universidad de Buenos Aires',
          degreeName: g1.degreeName,
          achievementType: g1.achievementType,
          graduateName: g1.name,
          graduateDni: g1.dni,
          faculty: g1.faculty,
          graduationDate: g1.graduationDate,
          statusIndex: idx1,
          statusCredentialUrl: `http://${domain}/estado/1`
        });
        const s1 = signCredential(u1, hsmKeys.privateKeyPem, didManager.getVerificationMethodId());
        const leaf1 = hashCredential(s1);

        // 2. Emitir diploma 2
        const g2 = initialGrads[1];
        const idx2 = nextStatusIndex++;
        const u2 = createDegreeCredential({
          issuerDid: didManager.did,
          issuerName: 'Universidad de Buenos Aires',
          degreeName: g2.degreeName,
          achievementType: g2.achievementType,
          graduateName: g2.name,
          graduateDni: g2.dni,
          faculty: g2.faculty,
          graduationDate: g2.graduationDate,
          statusIndex: idx2,
          statusCredentialUrl: `http://${domain}/estado/1`
        });
        const s2 = signCredential(u2, hsmKeys.privateKeyPem, didManager.getVerificationMethodId());
        const leaf2 = hashCredential(s2);

        // 3. Crear árbol de Merkle del lote y anclar en blockchain (Besu/BFA)
        const batchTree = buildMerkleTree([leaf1, leaf2]);
        const batchId = `LOTE-UBA-EXACTAS-MEDICINA-2026`;
        const receipt = await anchorService.anchorMerkleRoot(
          batchTree.root,
          batchId,
          2,
          'Lote inicial de títulos verificables (Ciencias Exactas y Medicina)'
        );

        const r1 = {
          id: s1.id,
          credential: s1,
          statusIndex: idx1,
          leafHash: leaf1,
          graduateId: g1.id,
          issuedAt: new Date().toISOString(),
          isAnchored: true,
          batchId,
          merkleRoot: batchTree.root,
          merkleProof: getMerkleProof(batchTree, 0),
          anchorReceipt: receipt
        };
        const r2 = {
          id: s2.id,
          credential: s2,
          statusIndex: idx2,
          leafHash: leaf2,
          graduateId: g2.id,
          issuedAt: new Date().toISOString(),
          isAnchored: true,
          batchId,
          merkleRoot: batchTree.root,
          merkleProof: getMerkleProof(batchTree, 1),
          anchorReceipt: receipt
        };

        issuedCredentials.set(s1.id, r1);
        issuedCredentials.set(s2.id, r2);
      }
    } catch (err) {
      console.warn('Aviso en seed inicial:', err.message);
    }
  }

  // Ejecutar seed
  seedInitialData();

  // =========================================================================
  // CAPA PÚBLICA (SOLO LECTURA)
  // =========================================================================

  // did:web UBA -> https://<dominio>/.well-known/did.json
  app.get('/.well-known/did.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(didManager.getDidDocument());
  });

  // Lista de revocación -> https://<dominio>/estado/1
  app.get('/estado/:id', (req, res) => {
    const listId = req.params.id;
    const statusUrl = `${req.protocol}://${req.get('host')}/estado/${listId}`;
    const credential = statusList.generateCredential(statusUrl, didManager.did);
    res.setHeader('Content-Type', 'application/json');
    res.json(credential);
  });

  // =========================================================================
  // SISTEMA ACADÉMICO (SIU GUARANÍ)
  // =========================================================================

  app.get('/api/academic/graduates', (req, res) => {
    const graduates = academicDb.getAllGraduates();
    // Añadir información de si ya tiene título emitido
    const result = graduates.map(g => {
      const issued = Array.from(issuedCredentials.values()).find(
        item => item.credential.credentialSubject.graduate.name === g.name
      );
      return {
        ...g,
        hasIssuedDegree: !!issued,
        credentialId: issued ? issued.credential.id : null
      };
    });
    res.json(result);
  });

  app.post('/api/academic/graduates', (req, res) => {
    const newGrad = academicDb.addGraduate(req.body);
    res.status(201).json(newGrad);
  });

  // =========================================================================
  // SERVICIO DE EMISIÓN DE TÍTULOS (UBA)
  // =========================================================================

  app.post('/api/issuer/issue', async (req, res) => {
    try {
      const { graduateId } = req.body;
      const graduate = academicDb.getGraduate(graduateId);
      if (!graduate) {
        return res.status(404).json({ error: 'Graduado no encontrado en sistema académico' });
      }

      const assignedIndex = nextStatusIndex++;
      const statusUrl = `${req.protocol}://${req.get('host')}/estado/1`;

      // 1. Armar la credencial VC 2.0 / Open Badges 3.0
      const unsignedVc = createDegreeCredential({
        issuerDid: didManager.did,
        issuerName: 'Universidad de Buenos Aires',
        degreeName: graduate.degreeName,
        achievementType: graduate.achievementType,
        graduateName: graduate.name,
        graduateDni: graduate.dni,
        faculty: graduate.faculty,
        graduationDate: graduate.graduationDate,
        statusIndex: assignedIndex,
        statusCredentialUrl: statusUrl
      });

      // 2. Firmar con clave en HSM
      const signedVc = signCredential(
        unsignedVc,
        hsmKeys.privateKeyPem,
        didManager.getVerificationMethodId()
      );

      // 3. Calcular hash de la credencial para árbol de Merkle
      const leafHash = hashCredential(signedVc);

      const record = {
        id: signedVc.id,
        credential: signedVc,
        statusIndex: assignedIndex,
        leafHash,
        graduateId,
        issuedAt: new Date().toISOString(),
        isAnchored: false,
        batchId: null,
        merkleProof: null,
        merkleRoot: null
      };

      issuedCredentials.set(signedVc.id, record);

      res.status(201).json({
        success: true,
        message: 'Título universitario emitido y firmado con éxito',
        credential: signedVc,
        leafHash,
        statusIndex: assignedIndex
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/issuer/credentials', (req, res) => {
    const list = Array.from(issuedCredentials.values()).map(r => ({
      id: r.id,
      graduateName: r.credential.credentialSubject.graduate.name,
      degreeName: r.credential.credentialSubject.achievement.name,
      faculty: r.credential.credentialSubject.graduate.faculty,
      statusIndex: r.statusIndex,
      isRevoked: statusList.isRevoked(r.statusIndex),
      isAnchored: r.isAnchored,
      batchId: r.batchId,
      merkleRoot: r.merkleRoot,
      leafHash: r.leafHash,
      issuedAt: r.issuedAt
    }));
    res.json(list);
  });

  app.get('/api/issuer/credential/:id', (req, res) => {
    const record = issuedCredentials.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Credencial no encontrada' });
    }
    res.json(record);
  });

  // Anclaje de lotes en Blockchain (BFA o Besu)
  app.post('/api/issuer/batch-anchor', async (req, res) => {
    try {
      const pendingRecords = Array.from(issuedCredentials.values()).filter(r => !r.isAnchored);
      
      if (pendingRecords.length === 0) {
        return res.status(400).json({
          error: 'No hay títulos pendientes de anclaje. Emita nuevos títulos primero.'
        });
      }

      const leaves = pendingRecords.map(r => r.leafHash);
      const tree = buildMerkleTree(leaves);
      const batchId = `LOTE-UBA-2026-N${currentBatchCounter++}`;

      // Anclar la raíz en la blockchain (BFA/Besu con costo cero)
      const receipt = await anchorService.anchorMerkleRoot(
        tree.root,
        batchId,
        pendingRecords.length,
        `Títulos emitidos por UBA - ${pendingRecords.length} diplomas`
      );

      // Asignar prueba de inclusión a cada título del lote
      pendingRecords.forEach((record, idx) => {
        const proof = getMerkleProof(tree, idx);
        record.isAnchored = true;
        record.batchId = batchId;
        record.merkleRoot = tree.root;
        record.merkleProof = proof;
        record.anchorReceipt = receipt;
      });

      res.json({
        success: true,
        batchId,
        merkleRoot: tree.root,
        totalTítulos: pendingRecords.length,
        receipt,
        network: anchorService.networkName
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Revocación y rectificación
  app.post('/api/issuer/revoke', (req, res) => {
    try {
      const { credentialId, statusIndex } = req.body;
      let targetIndex = statusIndex;

      if (credentialId && !targetIndex) {
        const record = issuedCredentials.get(credentialId);
        if (!record) return res.status(404).json({ error: 'Credencial no encontrada' });
        targetIndex = record.statusIndex;
      }

      statusList.revoke(targetIndex);

      res.json({
        success: true,
        message: `Título con índice ${targetIndex} revocado en Bitstring Status List`,
        statusIndex: targetIndex,
        isRevoked: true
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/issuer/unrevoke', (req, res) => {
    try {
      const { credentialId, statusIndex } = req.body;
      let targetIndex = statusIndex;

      if (credentialId && !targetIndex) {
        const record = issuedCredentials.get(credentialId);
        if (!record) return res.status(404).json({ error: 'Credencial no encontrada' });
        targetIndex = record.statusIndex;
      }

      statusList.unrevoke(targetIndex);

      res.json({
        success: true,
        message: `Título con índice ${targetIndex} restituido como vigente`,
        statusIndex: targetIndex,
        isRevoked: false
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generación de código QR para diplomas
  app.get('/api/qr/:id', async (req, res) => {
    try {
      const record = issuedCredentials.get(req.params.id);
      if (!record) return res.status(404).send('Credencial no encontrada');
      
      const verifyUrl = `${req.protocol}://${req.get('host')}/?verifyId=${encodeURIComponent(record.id)}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        margin: 2,
        width: 250,
        color: { dark: '#0c2340', light: '#ffffff' }
      });
      res.json({ qrDataUrl, verifyUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // PORTAL PÚBLICO DE VERIFICACIÓN
  // =========================================================================

  app.post('/api/verifier/verify', async (req, res) => {
    try {
      const { credential, merkleProof, merkleRoot, skipBlockchain } = req.body;
      
      let finalProof = merkleProof;
      let finalRoot = merkleRoot;

      // Si no se proveyó la prueba pero la tenemos registrada internamente
      if (!finalProof && credential && credential.id) {
        const localRecord = issuedCredentials.get(credential.id);
        if (localRecord && localRecord.merkleProof) {
          finalProof = localRecord.merkleProof;
          finalRoot = localRecord.merkleRoot;
        }
      }

      const report = await verifier.verify({
        credential,
        merkleProof: finalProof,
        merkleRoot: finalRoot,
        skipBlockchain: !!skipBlockchain
      });

      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Estado de la Blockchain
  app.get('/api/blockchain/status', async (req, res) => {
    try {
      const status = await anchorService.getNetworkStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // BATERÍA DE PRUEBAS AUTOMATIZADAS Y ESCENARIOS DE RIESGO (SECCIÓN 9)
  // =========================================================================

  app.get('/api/simulation/scenarios', (req, res) => {
    res.json([
      {
        id: 'scenario-valid',
        name: 'Caso 1: Título Legítimo y Vigente',
        description: 'Emisión formal UBA, firma institucional válida, vigente en lista de revocación y anclado en Blockchain Besu/BFA.',
        expectedResult: 'VÁLIDO (4 de 4 pasos aprobados)',
        category: 'Flujo Normal'
      },
      {
        id: 'scenario-revoked',
        name: 'Caso 2: Título Revocado / Rectificado',
        description: 'La firma y los datos son auténticos, pero la UBA revocó el título en la lista Bitstring Status List (Sección 2).',
        expectedResult: 'REVOCADO en Paso 3 (Detecta anulación sin modificar blockchain)',
        category: 'Gestión de Estado'
      },
      {
        id: 'scenario-tampered',
        name: 'Caso 3: Título Falsificado / Adulterado',
        description: 'Un graduado o tercero modificó maliciosamente la carrera de "Licenciatura" a "Doctorado" en el JSON.',
        expectedResult: 'INVÁLIDO en Paso 2 (Falla firma criptográfica Ed25519 - Protección contra fraude)',
        category: 'Ciberseguridad y Fraude'
      },
      {
        id: 'scenario-retroactive',
        name: 'Caso 4: Título Retroactivo / Falso Histórico',
        description: 'Simula un diploma con firma simulada que intenta alegar egreso en fecha pasada sin estar en la raíz anclada.',
        expectedResult: 'NO ANCLADO en Paso 4 (La blockchain demuestra que no existía en esa fecha)',
        category: 'Mitigación de Riesgos'
      },
      {
        id: 'scenario-blockchain-offline',
        name: 'Caso 5: Resiliencia ante Caída de Blockchain',
        description: 'Simula indisponibilidad temporal del nodo BFA/Besu. La validación cotidiana sigue siendo 100% operativa por did:web.',
        expectedResult: 'VÁLIDO (Pasos 1 a 3 aprobados; demuestra desacoplamiento de la red)',
        category: 'Alta Disponibilidad'
      }
    ]);
  });

  app.post('/api/simulation/run/:scenarioId', async (req, res) => {
    try {
      const { scenarioId } = req.params;
      
      // Asegurar que exista al menos un título emitido y anclado para las pruebas
      let sampleRecord = Array.from(issuedCredentials.values()).find(r => r.isAnchored);
      if (!sampleRecord) {
        // Emitir y anclar automáticamente un título de prueba
        const grad = academicDb.getAllGraduates()[0];
        const statusIdx = nextStatusIndex++;
        const statusUrl = `${req.protocol}://${req.get('host')}/estado/1`;
        const unsigned = createDegreeCredential({
          issuerDid: didManager.did,
          issuerName: 'Universidad de Buenos Aires',
          degreeName: grad.degreeName,
          achievementType: grad.achievementType,
          graduateName: grad.name,
          graduateDni: grad.dni,
          faculty: grad.faculty,
          graduationDate: grad.graduationDate,
          statusIndex: statusIdx,
          statusCredentialUrl: statusUrl
        });
        const signed = signCredential(unsigned, hsmKeys.privateKeyPem, didManager.getVerificationMethodId());
        const leaf = hashCredential(signed);
        const tree = buildMerkleTree([leaf]);
        await anchorService.anchorMerkleRoot(tree.root, 'LOTE-TEST-AUTO', 1, 'Lote automático de prueba');
        const proof = getMerkleProof(tree, 0);

        sampleRecord = {
          id: signed.id,
          credential: signed,
          statusIndex: statusIdx,
          leafHash: leaf,
          batchId: 'LOTE-TEST-AUTO',
          merkleRoot: tree.root,
          merkleProof: proof,
          isAnchored: true
        };
        issuedCredentials.set(signed.id, sampleRecord);
      }

      let testCred = JSON.parse(JSON.stringify(sampleRecord.credential));
      let testProof = sampleRecord.merkleProof;
      let testRoot = sampleRecord.merkleRoot;
      let skipBlockchain = false;
      let scenarioExplanation = '';

      switch (scenarioId) {
        case 'scenario-valid':
          statusList.unrevoke(sampleRecord.statusIndex);
          scenarioExplanation = 'Demostración del flujo estándar exitoso: did:web resuelve la clave, la firma es matemáticamente perfecta, el estado está vigente en 0, y la prueba de Merkle coincide con el bloque registrado.';
          break;

        case 'scenario-revoked':
          // Marcar temporalmente como revocado
          statusList.revoke(sampleRecord.statusIndex);
          scenarioExplanation = 'La Universidad anuló o reemitió el diploma. El bit correspondiente en la Bitstring Status List pasa a 1. El verificador rechaza la credencial sin necesidad de tocar la blockchain.';
          break;

        case 'scenario-tampered':
          // Alterar dato en el diploma
          statusList.unrevoke(sampleRecord.statusIndex);
          testCred.credentialSubject.achievement.name = 'Doctorado de Honor en Inteligencia Artificial';
          scenarioExplanation = 'Un atacante modificó el archivo para asignarse un título superior. La canonicalización y la firma Ed25519 detectan la modificación de un solo caracter y rechazan el título de inmediato.';
          break;

        case 'scenario-retroactive':
          statusList.unrevoke(sampleRecord.statusIndex);
          // Modificar la raíz esperada o usar una no registrada
          testRoot = '0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000';
          scenarioExplanation = 'Se presenta un título que alega haber sido emitido en 2026, pero la raíz no figura en los registros inmutables de BFA/Besu. La prueba de inclusión falla o no existe en la cadena.';
          break;

        case 'scenario-blockchain-offline':
          statusList.unrevoke(sampleRecord.statusIndex);
          skipBlockchain = true;
          scenarioExplanation = 'El verificador no tiene conexión a internet con el nodo blockchain o la red está en mantenimiento. La verificación de autenticidad y vigencia se completa al 100% mediante did:web y status list.';
          break;

        default:
          return res.status(404).json({ error: 'Escenario no reconocido' });
      }

      const report = await verifier.verify({
        credential: testCred,
        merkleProof: testProof,
        merkleRoot: testRoot,
        skipBlockchain
      });

      res.json({
        scenarioId,
        scenarioExplanation,
        testCredential: testCred,
        verificationReport: report
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Servir frontend estático
  app.use(express.static(path.join(__dirname, '../public')));

  // Fallback a index.html (compatible con todas las versiones de Express)
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/.well-known/') && !req.path.startsWith('/estado/')) {
      return res.sendFile(path.join(__dirname, '../public/index.html'));
    }
    next();
  });

  return {
    app,
    hsmKeys,
    didManager,
    statusList,
    anchorService,
    issuedCredentials,
    verifier
  };
}

module.exports = createApp;
