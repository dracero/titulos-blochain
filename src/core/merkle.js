/**
 * Implementación de Árbol de Merkle y Pruebas Criptográficas de Inclusión
 * Utilizado por el Servicio de Emisión de la UBA para anclar lotes de títulos
 * en redes blockchain permisionadas (BFA / Hyperledger Besu) con costo cero.
 * 
 * En la blockchain se registra ÚNICAMENTE la raíz de Merkle (32 bytes).
 * Cada graduado conserva su prueba de inclusión (Merkle Proof) que demuestra
 * de forma matemática que su título pertenecía al lote emitido en esa fecha.
 */

const { sha256, canonicalizeJson } = require('./crypto');

/**
 * Normaliza un hash a Buffer de 32 bytes
 * @param {Buffer|string} hash 
 * @returns {Buffer}
 */
function normalizeHash(hash) {
  if (Buffer.isBuffer(hash)) {
    return hash;
  }
  if (typeof hash === 'string') {
    const cleanHex = hash.startsWith('0x') ? hash.slice(2) : hash;
    return Buffer.from(cleanHex, 'hex');
  }
  throw new Error('Hash inválido: debe ser Buffer o cadena hexadecimal');
}

/**
 * Calcula el hash criptográfico de un título universitario (VC)
 * @param {object} credential Credencial verificable
 * @returns {string} Hash SHA-256 en formato '0x...'
 */
function hashCredential(credential) {
  const canonical = canonicalizeJson(credential);
  const digest = sha256(canonical);
  return '0x' + digest.toString('hex');
}

/**
 * Construye un Árbol de Merkle completo a partir de una lista de hashes de hojas
 * @param {Array<string|Buffer>} leaves 
 * @returns {{ root: string, rootBuffer: Buffer, levels: Buffer[][], leafCount: number }}
 */
function buildMerkleTree(leaves) {
  if (!leaves || leaves.length === 0) {
    throw new Error('No se pueden construir árboles de Merkle sin hojas');
  }

  let currentLevel = leaves.map(normalizeHash);
  const levels = [currentLevel];

  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      // Si el número de elementos es impar en este nivel, se duplica el último elemento
      const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : left;
      const combined = sha256(Buffer.concat([left, right]));
      nextLevel.push(combined);
    }
    currentLevel = nextLevel;
    levels.push(currentLevel);
  }

  const rootBuffer = levels[levels.length - 1][0];

  return {
    root: '0x' + rootBuffer.toString('hex'),
    rootBuffer,
    levels,
    leafCount: leaves.length
  };
}

/**
 * Genera la prueba de inclusión de Merkle para la hoja en el índice dado
 * @param {object} tree Árbol retornado por buildMerkleTree
 * @param {number} leafIndex Índice de la credencial en el lote
 * @returns {Array<{ position: 'left' | 'right', hash: string }>}
 */
function getMerkleProof(tree, leafIndex) {
  if (leafIndex < 0 || leafIndex >= tree.leafCount) {
    throw new Error(`Índice de hoja fuera de rango: ${leafIndex} (Total: ${tree.leafCount})`);
  }

  const proof = [];
  let currentIndex = leafIndex;

  for (let levelIndex = 0; levelIndex < tree.levels.length - 1; levelIndex++) {
    const level = tree.levels[levelIndex];
    const isRightNode = currentIndex % 2 === 1;
    let siblingIndex;

    if (isRightNode) {
      siblingIndex = currentIndex - 1;
      proof.push({
        position: 'left',
        hash: '0x' + level[siblingIndex].toString('hex')
      });
    } else {
      siblingIndex = currentIndex + 1 < level.length ? currentIndex + 1 : currentIndex;
      proof.push({
        position: 'right',
        hash: '0x' + level[siblingIndex].toString('hex')
      });
    }

    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

/**
 * Verifica una prueba de inclusión de Merkle matemáticamente
 * @param {string|Buffer} leafHash Hash de la credencial
 * @param {Array<{ position: 'left' | 'right', hash: string }>} proof Camino de hermanos
 * @param {string|Buffer} expectedRoot Raíz de Merkle registrada en la blockchain
 * @returns {boolean} true si el hash del título pertenece efectivamente a la raíz
 */
function verifyMerkleProof(leafHash, proof, expectedRoot) {
  try {
    let current = normalizeHash(leafHash);
    const rootBuf = normalizeHash(expectedRoot);

    for (const step of proof) {
      const siblingBuf = normalizeHash(step.hash);
      const combined = step.position === 'left'
        ? Buffer.concat([siblingBuf, current])
        : Buffer.concat([current, siblingBuf]);
      current = sha256(combined);
    }

    return current.equals(rootBuf);
  } catch (err) {
    return false;
  }
}

module.exports = {
  hashCredential,
  buildMerkleTree,
  getMerkleProof,
  verifyMerkleProof,
  normalizeHash
};
