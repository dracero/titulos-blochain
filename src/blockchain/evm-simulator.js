/**
 * Simulador Ligero de Red Blockchain EVM Permissioned (BFA / Hyperledger Besu)
 * Proporciona un entorno de prueba 100% gratuito, en memoria y sin dependencias externas.
 * Emula el comportamiento del contrato MerkleAnchorRegistry:
 * - Creación y avance de bloques (Proof of Authority / QBFT)
 * - Transacciones con costo cero (gasPrice = 0, sin tokens)
 * - Emisión de eventos MerkleRootAnchored
 * - Consulta de anclajes con marcas de tiempo verificables
 */

import crypto from 'node:crypto';

class EvmSimulator {
  constructor(options = {}) {
    this.networkName = options.networkName || 'BFA / Besu QBFT (Simulador Local)';
    this.chainId = options.chainId || 2026;
    this.contractAddress = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
    this.issuerAddress = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4df';
    
    this.currentBlockNumber = 1042;
    this.anchors = new Map(); // merkleRoot -> AnchorRecord
    this.rootList = [];
    this.events = [];
    this.transactions = [];
  }

  /**
   * Registra una raíz de Merkle en el simulador
   * @param {string} merkleRoot Hash en hex (ej: '0x...')
   * @param {string} batchId Identificador del lote
   * @param {number} credentialCount Cantidad de títulos
   * @param {string} metadata Metadatos institucionales
   * @returns {Promise<object>} Recibo de la transacción
   */
  async anchorMerkleRoot(merkleRoot, batchId, credentialCount = 1, metadata = '') {
    const cleanRoot = merkleRoot.toLowerCase();
    
    if (this.anchors.has(cleanRoot)) {
      throw new Error('Esta raíz de Merkle ya fue anclada previamente en la blockchain');
    }

    this.currentBlockNumber++;
    const nowTimestamp = Math.floor(Date.now() / 1000);
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const blockHash = '0x' + crypto.randomBytes(32).toString('hex');

    const record = {
      merkleRoot: cleanRoot,
      batchId,
      timestamp: nowTimestamp,
      blockNumber: this.currentBlockNumber,
      issuer: this.issuerAddress,
      credentialCount,
      metadata: metadata || 'Lote de Títulos Universitarios UBA',
      txHash,
      blockHash
    };

    this.anchors.set(cleanRoot, record);
    this.rootList.push(cleanRoot);

    const event = {
      event: 'MerkleRootAnchored',
      merkleRoot: cleanRoot,
      batchId,
      timestamp: nowTimestamp,
      blockNumber: this.currentBlockNumber,
      issuer: this.issuerAddress,
      credentialCount,
      metadata: record.metadata
    };
    this.events.push(event);

    const receipt = {
      status: 1, // Éxito
      transactionHash: txHash,
      blockNumber: this.currentBlockNumber,
      blockHash,
      from: this.issuerAddress,
      to: this.contractAddress,
      gasUsed: '21000',
      effectiveGasPrice: '0', // Gas en cero (sin criptomoneda)
      costoTransaccion: '0.00 ARS (Sin costo/gas cero)',
      consensus: 'QBFT / Proof of Authority',
      events: [event]
    };

    this.transactions.push(receipt);
    return receipt;
  }

  /**
   * Consulta el registro de anclaje de una raíz de Merkle
   * @param {string} merkleRoot 
   * @returns {Promise<object>}
   */
  async getAnchor(merkleRoot) {
    if (!merkleRoot) {
      return { exists: false };
    }
    const cleanRoot = merkleRoot.toLowerCase();
    const record = this.anchors.get(cleanRoot);
    if (!record) {
      return { exists: false };
    }

    return {
      exists: true,
      merkleRoot: record.merkleRoot,
      batchId: record.batchId,
      timestamp: record.timestamp,
      blockNumber: record.blockNumber,
      issuer: record.issuer,
      credentialCount: record.credentialCount,
      metadata: record.metadata,
      txHash: record.txHash
    };
  }

  /**
   * Retorna el número total de raíces ancladas
   */
  async totalAnchors() {
    return this.rootList.length;
  }

  /**
   * Retorna información de estado de la red
   */
  async getNetworkStatus() {
    return {
      network: this.networkName,
      chainId: this.chainId,
      currentBlockNumber: this.currentBlockNumber,
      totalAnchors: this.rootList.length,
      contractAddress: this.contractAddress,
      operator: 'Universidad de Buenos Aires (Nodo Institucional)',
      consensus: 'QBFT / Proof of Authority (Sin minería ni monedas)',
      gasPrice: 0,
      isRealBesu: false
    };
  }
}

export { EvmSimulator };
export default EvmSimulator;
