/**
 * Servicio de Anclaje a Blockchain (Agnóstico a la Red)
 * Conecta de forma transparente con:
 * 1. Hyperledger Besu (nodo QBFT local en http://localhost:8545) si está corriendo en Docker.
 * 2. O Simulador EVM local (en memoria, gas cero) para pruebas inmediatas sin dependencias.
 * 
 * Cumple la recomendación de la Sección 5:
 * "Diseñar el servicio de anclaje de forma agnóstica a la red. Así la UBA podría
 * duplicar el ancla en una red Besu propia o migrar más adelante sin reemitir ningún título".
 */

import { ethers } from 'ethers';
import EvmSimulator from './evm-simulator.js';
import { MERKLE_ANCHOR_ABI, MERKLE_ANCHOR_BYTECODE } from './contract-abi.js';

class AnchorService {
  constructor(options = {}) {
    this.rpcUrl = options.rpcUrl || process.env.BESU_RPC_URL || 'http://localhost:8545';
    this.contractAddress = options.contractAddress || process.env.ANCHOR_CONTRACT_ADDRESS || null;
    this.privateKey = options.privateKey || '0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63'; // Cuenta de prueba prefondeada en Besu dev
    
    this.db = options.db || null;
    this.simulator = new EvmSimulator();
    this.isRealBesu = false;
    this.provider = null;
    this.contract = null;
    this.wallet = null;
    this.networkName = 'BFA / Besu QBFT (Simulador Local)';
  }

  /**
   * Inicializa la conexión y detecta si hay un nodo Besu activo
   */
  async init() {
    try {
      const prov = new ethers.JsonRpcProvider(this.rpcUrl);
      // Timeout de 1500ms para no demorar el inicio si no hay contenedor Besu
      const network = await Promise.race([
        prov.getNetwork(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout RPC Besu')), 1500))
      ]);

      this.provider = prov;
      this.isRealBesu = true;
      this.networkName = `Hyperledger Besu QBFT (Chain ID: ${network.chainId})`;

      const wallet = new ethers.Wallet(this.privateKey, this.provider);
      this.wallet = wallet;

      if (!this.contractAddress && this.db) {
        try {
          const savedAddr = await this.db.getSetting('anchor_contract_address');
          if (savedAddr) {
            const code = await this.provider.getCode(savedAddr);
            if (code && code !== '0x') {
              this.contractAddress = savedAddr;
            }
          }
        } catch (_) {}
      }

      if (this.contractAddress) {
        this.contract = new ethers.Contract(this.contractAddress, MERKLE_ANCHOR_ABI, wallet);
      } else if (MERKLE_ANCHOR_BYTECODE) {
        try {
          const factory = new ethers.ContractFactory(MERKLE_ANCHOR_ABI, MERKLE_ANCHOR_BYTECODE, wallet);
          const deployedContract = await factory.deploy();
          await deployedContract.waitForDeployment();
          this.contractAddress = await deployedContract.getAddress();
          this.contract = deployedContract;
          console.log(`⛓️  [Besu QBFT] Contrato MerkleAnchorRegistry desplegado en: ${this.contractAddress}`);

          if (this.db) {
            try {
              await this.db.setSetting('anchor_contract_address', this.contractAddress);
            } catch (_) {}
          }
        } catch (deployErr) {
          console.warn('Aviso: No se pudo auto-desplegar contrato en Besu:', deployErr.message);
        }
      }

      return { isRealBesu: true, chainId: network.chainId, contractAddress: this.contractAddress };
    } catch (err) {
      this.isRealBesu = false;
      this.networkName = 'BFA / Besu QBFT (Simulador Local)';
      return { isRealBesu: false, info: 'Usando simulador EVM local integrado (gas=0)' };
    }
  }

  /**
   * Registra una raíz de Merkle en la cadena
   * @param {string} merkleRoot Hash en hex
   * @param {string} batchId Identificador del lote
   * @param {number} credentialCount Cantidad de títulos
   * @param {string} metadata Descripción
   */
  async anchorMerkleRoot(merkleRoot, batchId, credentialCount = 1, metadata = '') {
    if (this.isRealBesu && this.contract) {
      const tx = await this.contract.anchorMerkleRoot(
        merkleRoot,
        batchId,
        credentialCount,
        metadata
      );
      const receipt = await tx.wait();
      return {
        status: 1,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        costoTransaccion: '0.00 ARS (Sin costo/gas cero)',
        consensus: 'Hyperledger Besu (QBFT)',
        isRealBesu: true
      };
    }

    // Usar simulador local
    return await this.simulator.anchorMerkleRoot(merkleRoot, batchId, credentialCount, metadata);
  }

  /**
   * Consulta el registro de anclaje de una raíz de Merkle
   * @param {string} merkleRoot 
   */
  async getAnchor(merkleRoot) {
    if (this.isRealBesu && this.contract) {
      try {
        const result = await this.contract.getAnchor(merkleRoot);
        return {
          exists: result.exists,
          batchId: result.batchId,
          timestamp: Number(result.timestamp),
          blockNumber: Number(result.blockNumber),
          issuer: result.issuer,
          credentialCount: Number(result.credentialCount),
          metadata: result.metadata
        };
      } catch (err) {
        return { exists: false, error: err.message };
      }
    }

    return await this.simulator.getAnchor(merkleRoot);
  }

  /**
   * Retorna el estado y configuración de la red de anclaje
   */
  async getNetworkStatus() {
    if (this.isRealBesu && this.provider) {
      const blockNumber = await this.provider.getBlockNumber();
      return {
        network: this.networkName,
        isRealBesu: true,
        rpcUrl: this.rpcUrl,
        currentBlockNumber: blockNumber,
        contractAddress: this.contractAddress,
        consensus: 'Hyperledger Besu QBFT (Permisionada, Gas Cero)',
        costoPorTransaccion: '$0 (Sin minería ni tokens)'
      };
    }

    const simStatus = await this.simulator.getNetworkStatus();
    return simStatus;
  }
}

export { AnchorService };
export default AnchorService;
