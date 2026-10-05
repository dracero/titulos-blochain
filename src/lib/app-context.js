/**
 * Contexto Central de Aplicación (Singleton para Astro SSR)
 * Gestiona el estado de emisión, claves del HSM, did:web, Bitstring Status List
 * y conexión a Hyperledger Besu / simulador EVM.
 */

import { generateEd25519KeyPair } from '../core/crypto.js';
import DidWebManager from '../core/did.js';
import BitstringStatusList from '../core/status-list.js';
import { hashCredential, buildMerkleTree, getMerkleProof } from '../core/merkle.js';
import { createDegreeCredential, signCredential } from '../core/vc.js';
import DegreeVerifier from '../core/verifier.js';
import AnchorService from '../blockchain/anchor-service.js';
import academicDb from './academic-db.js';
import dbService from './db.js';
import QRCode from 'qrcode';

class AppContext {
  constructor() {
    this.port = process.env.PORT || 4000;
    this.domain = process.env.UBA_DOMAIN || `localhost:${this.port}`;
    this.keyId = 'clave-2026';
    
    this.db = dbService;
    this.hsmKeys = generateEd25519KeyPair(); // Provisional hasta init()
    this.didManager = new DidWebManager(this.domain, this.keyId, this.hsmKeys.publicKeyMultibase);
    this.statusList = new BitstringStatusList(100000);
    this.anchorService = new AnchorService({ db: this.db });
    this.academicDb = academicDb;

    this.issuedCredentials = new Map();
    this.nextStatusIndex = 100;
    this.currentBatchCounter = 1;

    this.verifier = new DegreeVerifier({
      anchorService: this.anchorService,
      fallbackDidDoc: this.didManager.getDidDocument(),
      statusListProvider: async () => this.statusList
    });

    this.initialized = false;
    this.initPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // 1. Inicializar base de datos PostgreSQL
      try {
        await this.db.init();
      } catch (err) {
        console.warn('Aviso al conectar con base de datos:', err.message);
      }

      // 2. Conectar servicio de anclaje (Besu / Simulador)
      try {
        await this.anchorService.init();
      } catch (err) {
        console.warn('Aviso al conectar con red de anclaje:', err.message);
      }

      // 3. Cargar o persistir claves institucionales HSM
      try {
        this.hsmKeys = await this.db.getOrCreateInstitutionalKeys(
          () => generateEd25519KeyPair(),
          this.domain,
          this.keyId
        );
        this.didManager = new DidWebManager(this.domain, this.keyId, this.hsmKeys.publicKeyMultibase);
      } catch (err) {
        console.warn('Aviso con claves:', err.message);
      }

      // 4. Cargar o persistir lista de estado Bitstring
      try {
        const storedList = await this.db.loadStatusList(100000);
        if (storedList && storedList.buffer) {
          this.statusList = new BitstringStatusList(storedList.sizeInBits, storedList.buffer);
          this.nextStatusIndex = storedList.nextStatusIndex || 100;
        } else {
          await this.db.saveStatusList(this.statusList.buffer, this.nextStatusIndex);
        }
      } catch (err) {
        console.warn('Aviso con status list:', err.message);
      }

      // 5. Configurar verificador institucional con claves y lista cargadas
      this.verifier = new DegreeVerifier({
        anchorService: this.anchorService,
        fallbackDidDoc: this.didManager.getDidDocument(),
        statusListProvider: async () => this.statusList
      });

      // 6. Cargar egresados desde Postgres o semilla inicial
      try {
        const loadedGrads = await this.db.loadGraduates(this.academicDb.getAllGraduates());
        if (loadedGrads && loadedGrads.length > 0) {
          this.academicDb.setGraduates(loadedGrads);
        }
      } catch (err) {
        console.warn('Aviso al sincronizar graduados:', err.message);
      }

      // 7. Cargar títulos emitidos guardados en Postgres
      try {
        const storedCreds = await this.db.loadIssuedCredentials();
        if (storedCreds && storedCreds.size > 0) {
          this.issuedCredentials = storedCreds;
        } else {
          await this.seedInitialData();
        }
      } catch (err) {
        console.warn('Aviso al sincronizar títulos:', err.message);
        await this.seedInitialData();
      }

      this.initialized = true;
    })();

    return this.initPromise;
  }

  async seedInitialData() {
    try {
      const initialGrads = this.academicDb.getAllGraduates();
      if (initialGrads.length >= 2 && this.issuedCredentials.size === 0) {
        // Diploma 1
        const g1 = initialGrads[0];
        const idx1 = this.nextStatusIndex++;
        const u1 = createDegreeCredential({
          issuerDid: this.didManager.did,
          issuerName: 'Universidad de Buenos Aires',
          degreeName: g1.degreeName,
          achievementType: g1.achievementType,
          graduateName: g1.name,
          graduateDni: g1.dni,
          faculty: g1.faculty,
          graduationDate: g1.graduationDate,
          statusIndex: idx1,
          statusCredentialUrl: `http://${this.domain}/estado/1`
        });
        const s1 = signCredential(u1, this.hsmKeys.privateKeyPem, this.didManager.getVerificationMethodId());
        const leaf1 = hashCredential(s1);

        // Diploma 2
        const g2 = initialGrads[1];
        const idx2 = this.nextStatusIndex++;
        const u2 = createDegreeCredential({
          issuerDid: this.didManager.did,
          issuerName: 'Universidad de Buenos Aires',
          degreeName: g2.degreeName,
          achievementType: g2.achievementType,
          graduateName: g2.name,
          graduateDni: g2.dni,
          faculty: g2.faculty,
          graduationDate: g2.graduationDate,
          statusIndex: idx2,
          statusCredentialUrl: `http://${this.domain}/estado/1`
        });
        const s2 = signCredential(u2, this.hsmKeys.privateKeyPem, this.didManager.getVerificationMethodId());
        const leaf2 = hashCredential(s2);

        // Árbol de Merkle y Anclaje
        const batchTree = buildMerkleTree([leaf1, leaf2]);
        const batchId = `LOTE-UBA-EXACTAS-MEDICINA-2026`;
        const receipt = await this.anchorService.anchorMerkleRoot(
          batchTree.root,
          batchId,
          2,
          'Lote inicial de títulos verificables (Ciencias Exactas y Medicina)'
        );

        const rec1 = {
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

        const rec2 = {
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

        this.issuedCredentials.set(s1.id, rec1);
        this.issuedCredentials.set(s2.id, rec2);

        await this.db.saveIssuedCredential(rec1);
        await this.db.saveIssuedCredential(rec2);
        await this.db.saveStatusList(this.statusList.buffer, this.nextStatusIndex);
        await this.db.saveAnchorBatch({
          batchId,
          merkleRoot: batchTree.root,
          credentialCount: 2,
          leafHashes: [leaf1, leaf2],
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          consensus: receipt.consensus,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn('Aviso en seed inicial:', err.message);
    }
  }
}

// Singleton global persistente
const globalContextKey = Symbol.for('titulos_bc_app_context');
if (!global[globalContextKey]) {
  global[globalContextKey] = new AppContext();
}

const appContext = global[globalContextKey];

export {
  appContext,
  createDegreeCredential,
  signCredential,
  hashCredential,
  buildMerkleTree,
  getMerkleProof,
  QRCode
};

export async function getAppContext() {
  await appContext.ensureInitialized();
  return appContext;
}
