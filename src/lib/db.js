/**
 * Capa de Persistencia PostgreSQL para Títulos Verificables UBA
 * Utiliza PostgreSQL nativo con soporte JSONB para almacenar credenciales W3C VC 2.0,
 * pruebas de Merkle, claves del HSM y registros de revocación.
 * 
 * Incluye modo de degradación elegante (graceful degradation):
 * Si PostgreSQL no está disponible (ej: pruebas unitarias aisladas sin Docker),
 * opera en memoria sin interrumpir el funcionamiento del sistema.
 */

import pg from 'pg';
const { Pool } = pg;

export class DatabaseService {
  constructor(options = {}) {
    this.connectionString = options.connectionString || process.env.DATABASE_URL || 'postgresql://uba_admin:uba_secret_2026@127.0.0.1:5432/titulos_uba';
    this.pool = null;
    this.isPostgres = false;
    this.initPromise = null;

    // Fallback en memoria si PostgreSQL no está conectado
    this.memoryStore = {
      keys: null,
      statusList: null,
      graduates: new Map(),
      credentials: new Map(),
      batches: new Map()
    };
  }

  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        this.pool = new Pool({
          connectionString: this.connectionString,
          connectionTimeoutMillis: 2000,
          idleTimeoutMillis: 10000,
          max: 10
        });

        // Probar conexión rápida
        const client = await this.pool.connect();
        try {
          await this.ensureSchema(client);
          this.isPostgres = true;
          console.log('🐘 [PostgreSQL] Conectado exitosamente a base de datos institucional (titulos_uba).');
        } finally {
          client.release();
        }
      } catch (err) {
        this.isPostgres = false;
        console.info('ℹ️  [Persistencia] PostgreSQL no disponible localmente; operando con almacenamiento seguro en memoria.');
      }
    })();

    return this.initPromise;
  }

  async ensureSchema(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS institutional_keys (
          id VARCHAR(64) PRIMARY KEY,
          key_id VARCHAR(64) NOT NULL,
          domain VARCHAR(255) NOT NULL,
          public_key_multibase TEXT NOT NULL,
          public_key_pem TEXT NOT NULL,
          private_key_pem TEXT NOT NULL,
          raw_public_key_hex TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(64) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS revocation_status_list (
          id INT PRIMARY KEY,
          size_in_bits INT NOT NULL DEFAULT 100000,
          buffer_data BYTEA NOT NULL,
          next_status_index INT NOT NULL DEFAULT 100,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS graduates (
          id VARCHAR(64) PRIMARY KEY,
          dni VARCHAR(32) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          degree_name VARCHAR(255) NOT NULL,
          faculty VARCHAR(255) NOT NULL,
          achievement_type VARCHAR(64) NOT NULL DEFAULT 'BachelorDegree',
          graduation_date DATE NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMADO',
          book_number VARCHAR(64),
          folio VARCHAR(64),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS issued_credentials (
          id VARCHAR(128) PRIMARY KEY,
          graduate_id VARCHAR(64) REFERENCES graduates(id) ON DELETE SET NULL,
          status_index INT NOT NULL,
          leaf_hash VARCHAR(66) NOT NULL,
          is_anchored BOOLEAN NOT NULL DEFAULT FALSE,
          batch_id VARCHAR(128),
          merkle_root VARCHAR(66),
          merkle_proof JSONB,
          anchor_receipt JSONB,
          credential_json JSONB NOT NULL,
          issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_credentials_graduate ON issued_credentials(graduate_id);
      CREATE INDEX IF NOT EXISTS idx_credentials_leaf_hash ON issued_credentials(leaf_hash);
      CREATE INDEX IF NOT EXISTS idx_credentials_merkle_root ON issued_credentials(merkle_root);
      CREATE INDEX IF NOT EXISTS idx_credentials_status_index ON issued_credentials(status_index);

      CREATE TABLE IF NOT EXISTS anchor_batches (
          batch_id VARCHAR(128) PRIMARY KEY,
          merkle_root VARCHAR(66) NOT NULL,
          credential_count INT NOT NULL,
          leaf_hashes JSONB NOT NULL,
          transaction_hash VARCHAR(66),
          block_number BIGINT,
          consensus VARCHAR(64),
          anchored_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // =========================================================================
  // CLAVES INSTITUCIONALES (HSM)
  // =========================================================================
  async getOrCreateInstitutionalKeys(keyGeneratorFn, domain, keyId) {
    await this.init();

    if (this.isPostgres) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM institutional_keys WHERE domain = $1 AND key_id = $2 LIMIT 1',
          [domain, keyId]
        );

        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            publicKeyMultibase: row.public_key_multibase,
            publicKeyPem: row.public_key_pem,
            privateKeyPem: row.private_key_pem,
            rawPublicKeyHex: row.raw_public_key_hex,
            rawPublicKey: Buffer.from(row.raw_public_key_hex || '', 'hex')
          };
        }

        // Generar nuevas claves y persistirlas en PostgreSQL
        const newKeys = keyGeneratorFn();
        await this.pool.query(`
          INSERT INTO institutional_keys (id, key_id, domain, public_key_multibase, public_key_pem, private_key_pem, raw_public_key_hex)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `, [
          `key-${domain}-${keyId}`,
          keyId,
          domain,
          newKeys.publicKeyMultibase,
          newKeys.publicKeyPem,
          newKeys.privateKeyPem,
          newKeys.rawPublicKeyHex
        ]);

        return newKeys;
      } catch (err) {
        console.warn('Aviso al consultar claves en Postgres:', err.message);
      }
    }

    // Fallback memoria
    if (!this.memoryStore.keys) {
      this.memoryStore.keys = keyGeneratorFn();
    }
    return this.memoryStore.keys;
  }

  // =========================================================================
  // LISTA DE REVOCACIÓN (BITSTRING STATUS LIST)
  // =========================================================================
  async loadStatusList(sizeInBits = 100000) {
    await this.init();

    if (this.isPostgres) {
      try {
        const res = await this.pool.query(
          'SELECT size_in_bits, buffer_data, next_status_index FROM revocation_status_list WHERE id = 1'
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            sizeInBits: row.size_in_bits,
            buffer: row.buffer_data,
            nextStatusIndex: row.next_status_index
          };
        }
      } catch (err) {
        console.warn('Aviso al cargar status list de Postgres:', err.message);
      }
    }

    return this.memoryStore.statusList;
  }

  async saveStatusList(buffer, nextStatusIndex, sizeInBits = 100000) {
    if (this.isPostgres) {
      try {
        await this.pool.query(`
          INSERT INTO revocation_status_list (id, size_in_bits, buffer_data, next_status_index, updated_at)
          VALUES (1, $1, $2, $3, NOW())
          ON CONFLICT (id) DO UPDATE SET
            buffer_data = EXCLUDED.buffer_data,
            next_status_index = EXCLUDED.next_status_index,
            updated_at = NOW()
        `, [sizeInBits, buffer, nextStatusIndex]);
      } catch (err) {
        console.warn('Aviso al guardar status list en Postgres:', err.message);
      }
    }

    this.memoryStore.statusList = { buffer, nextStatusIndex, sizeInBits };
  }

  // =========================================================================
  // BASE ACADÉMICA (SIU GUARANÍ)
  // =========================================================================
  async loadGraduates(initialSeed = []) {
    await this.init();

    if (this.isPostgres) {
      try {
        const res = await this.pool.query('SELECT * FROM graduates ORDER BY graduation_date DESC');
        if (res.rows.length > 0) {
          return res.rows.map(r => ({
            id: r.id,
            dni: r.dni,
            name: r.name,
            degreeName: r.degree_name,
            faculty: r.faculty,
            achievementType: r.achievement_type,
            graduationDate: r.graduation_date instanceof Date ? r.graduation_date.toISOString().split('T')[0] : r.graduation_date,
            status: r.status,
            bookNumber: r.book_number,
            folio: r.folio
          }));
        }

        // Si la tabla está vacía, insertar datos semilla
        for (const grad of initialSeed) {
          await this.saveGraduate(grad);
        }
        return initialSeed;
      } catch (err) {
        console.warn('Aviso al leer egresados en Postgres:', err.message);
      }
    }

    return null;
  }

  async saveGraduate(grad) {
    if (this.isPostgres) {
      try {
        await this.pool.query(`
          INSERT INTO graduates (id, dni, name, degree_name, faculty, achievement_type, graduation_date, status, book_number, folio)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            book_number = EXCLUDED.book_number,
            folio = EXCLUDED.folio
        `, [
          grad.id,
          grad.dni,
          grad.name,
          grad.degreeName,
          grad.faculty,
          grad.achievementType || 'BachelorDegree',
          grad.graduationDate,
          grad.status || 'CONFIRMADO',
          grad.bookNumber,
          grad.folio
        ]);
      } catch (err) {
        console.warn('Aviso al guardar egresado en Postgres:', err.message);
      }
    }
  }

  // =========================================================================
  // TÍTULOS VERIFICABLES (W3C VC 2.0 / JSONB)
  // =========================================================================
  async loadIssuedCredentials() {
    await this.init();

    if (this.isPostgres) {
      try {
        const res = await this.pool.query('SELECT * FROM issued_credentials ORDER BY issued_at DESC');
        const map = new Map();
        for (const row of res.rows) {
          map.set(row.id, {
            id: row.id,
            graduateId: row.graduate_id,
            statusIndex: row.status_index,
            leafHash: row.leaf_hash,
            isAnchored: row.is_anchored,
            batchId: row.batch_id,
            merkleRoot: row.merkle_root,
            merkleProof: row.merkle_proof,
            anchorReceipt: row.anchor_receipt,
            credential: row.credential_json,
            issuedAt: row.issued_at instanceof Date ? row.issued_at.toISOString() : row.issued_at
          });
        }
        return map;
      } catch (err) {
        console.warn('Aviso al leer títulos de Postgres:', err.message);
      }
    }

    return null;
  }

  async saveIssuedCredential(record) {
    if (this.isPostgres) {
      try {
        await this.pool.query(`
          INSERT INTO issued_credentials (
            id, graduate_id, status_index, leaf_hash, is_anchored, batch_id,
            merkle_root, merkle_proof, anchor_receipt, credential_json, issued_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            is_anchored = EXCLUDED.is_anchored,
            batch_id = EXCLUDED.batch_id,
            merkle_root = EXCLUDED.merkle_root,
            merkle_proof = EXCLUDED.merkle_proof,
            anchor_receipt = EXCLUDED.anchor_receipt
        `, [
          record.id,
          record.graduateId,
          record.statusIndex,
          record.leafHash,
          record.isAnchored || false,
          record.batchId || null,
          record.merkleRoot || null,
          record.merkleProof ? JSON.stringify(record.merkleProof) : null,
          record.anchorReceipt ? JSON.stringify(record.anchorReceipt) : null,
          JSON.stringify(record.credential),
          record.issuedAt || new Date().toISOString()
        ]);
      } catch (err) {
        console.warn('Aviso al guardar título en Postgres:', err.message);
      }
    }

    this.memoryStore.credentials.set(record.id, record);
  }

  async updateCredentialAnchor(id, anchorData) {
    if (this.isPostgres) {
      try {
        await this.pool.query(`
          UPDATE issued_credentials SET
            is_anchored = TRUE,
            batch_id = $2,
            merkle_root = $3,
            merkle_proof = $4,
            anchor_receipt = $5
          WHERE id = $1
        `, [
          id,
          anchorData.batchId,
          anchorData.merkleRoot,
          JSON.stringify(anchorData.merkleProof),
          JSON.stringify(anchorData.anchorReceipt)
        ]);
      } catch (err) {
        console.warn('Aviso al actualizar anclaje en Postgres:', err.message);
      }
    }

    const cached = this.memoryStore.credentials.get(id);
    if (cached) {
      Object.assign(cached, {
        isAnchored: true,
        batchId: anchorData.batchId,
        merkleRoot: anchorData.merkleRoot,
        merkleProof: anchorData.merkleProof,
        anchorReceipt: anchorData.anchorReceipt
      });
    }
  }

  // =========================================================================
  // LOTES DE ANCLAJE MERKLE
  // =========================================================================
  async saveAnchorBatch(batchData) {
    if (this.isPostgres) {
      try {
        await this.pool.query(`
          INSERT INTO anchor_batches (batch_id, merkle_root, credential_count, leaf_hashes, transaction_hash, block_number, consensus, anchored_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (batch_id) DO NOTHING
        `, [
          batchData.batchId,
          batchData.merkleRoot,
          batchData.credentialCount,
          JSON.stringify(batchData.leafHashes),
          batchData.transactionHash,
          batchData.blockNumber,
          batchData.consensus,
          batchData.timestamp || new Date().toISOString()
        ]);
      } catch (err) {
        console.warn('Aviso al guardar lote en Postgres:', err.message);
      }
    }

    this.memoryStore.batches.set(batchData.batchId, batchData);
  }

  async getSetting(key) {
    await this.init();
    if (this.isPostgres) {
      try {
        const res = await this.pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
        if (res.rows.length > 0) return res.rows[0].value;
      } catch (err) {
        console.warn('Aviso al leer configuración en Postgres:', err.message);
      }
    }
    return this.memoryStore[key] || null;
  }

  async setSetting(key, value) {
    await this.init();
    if (this.isPostgres) {
      try {
        await this.pool.query(`
          INSERT INTO system_settings (key, value, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `, [key, String(value)]);
      } catch (err) {
        console.warn('Aviso al guardar configuración en Postgres:', err.message);
      }
    }
    this.memoryStore[key] = String(value);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isPostgres = false;
      this.initPromise = null;
    }
  }
}

export const dbService = new DatabaseService();
export default dbService;
