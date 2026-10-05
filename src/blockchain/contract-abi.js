/**
 * ABI oficial del contrato inteligente MerkleAnchorRegistry
 * Compatible con Ethereum, Hyperledger Besu (QBFT) y Blockchain Federal Argentina (BFA).
 */

const MERKLE_ANCHOR_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "bytes32", "name": "merkleRoot", "type": "bytes32" },
      { "indexed": false, "internalType": "string", "name": "batchId", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "blockNumber", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "issuer", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "credentialCount", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "metadata", "type": "string" }
    ],
    "name": "MerkleRootAnchored",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "_merkleRoot", "type": "bytes32" },
      { "internalType": "string", "name": "_batchId", "type": "string" },
      { "internalType": "uint256", "name": "_credentialCount", "type": "uint256" },
      { "internalType": "string", "name": "_metadata", "type": "string" }
    ],
    "name": "anchorMerkleRoot",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "_merkleRoot", "type": "bytes32" }
    ],
    "name": "getAnchor",
    "outputs": [
      { "internalType": "bool", "name": "exists", "type": "bool" },
      { "internalType": "string", "name": "batchId", "type": "string" },
      { "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "internalType": "uint256", "name": "blockNumber", "type": "uint256" },
      { "internalType": "address", "name": "issuer", "type": "address" },
      { "internalType": "uint256", "name": "credentialCount", "type": "uint256" },
      { "internalType": "string", "name": "metadata", "type": "string" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalAnchors",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "index", "type": "uint256" }
    ],
    "name": "getRootAtIndex",
    "outputs": [
      { "internalType": "bytes32", "name": "", "type": "bytes32" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

module.exports = { MERKLE_ANCHOR_ABI };
