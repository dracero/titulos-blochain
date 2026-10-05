// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title MerkleAnchorRegistry
 * @notice Registro descentralizado de raíces de Merkle para títulos universitarios verificables de la UBA.
 * Diseñado para operar sobre redes permissioned como Blockchain Federal Argentina (BFA) o
 * una red propia Hyperledger Besu con consenso QBFT y gas en cero (costo de transacción = $0).
 * 
 * Cumplimiento Ley 25.326: No almacena datos personales ni identificadores de personas.
 * Únicamente preserva raíces de Merkle (32 bytes) y marcas de tiempo institucionales.
 */
contract MerkleAnchorRegistry {
    struct AnchorRecord {
        bytes32 merkleRoot;
        string batchId;
        uint256 timestamp;
        uint256 blockNumber;
        address issuer;
        uint256 credentialCount;
        string metadata;
    }

    // Propietario u operador institucional
    address public immutable owner;

    // Mapeo de raíz de Merkle -> Registro de anclaje
    mapping(bytes32 => AnchorRecord) public anchors;

    // Listado de todas las raíces ancladas en orden cronológico
    bytes32[] public roots;

    // Evento emitido al anclar un nuevo lote
    event MerkleRootAnchored(
        bytes32 indexed merkleRoot,
        string batchId,
        uint256 timestamp,
        uint256 blockNumber,
        address indexed issuer,
        uint256 credentialCount,
        string metadata
    );

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Registra una raíz de Merkle en la cadena.
     * @param _merkleRoot Raíz criptográfica de 32 bytes
     * @param _batchId Identificador institucional del lote (ej: "LOTE-UBA-EXACTAS-2026-1")
     * @param _credentialCount Cantidad de títulos incluidos en el árbol
     * @param _metadata Descripción institucional opcional
     */
    function anchorMerkleRoot(
        bytes32 _merkleRoot,
        string calldata _batchId,
        uint256 _credentialCount,
        string calldata _metadata
    ) external {
        require(_merkleRoot != bytes32(0), "Raiz Merkle no puede ser cero");
        require(anchors[_merkleRoot].timestamp == 0, "Esta raiz ya fue anclada previamente");

        AnchorRecord memory record = AnchorRecord({
            merkleRoot: _merkleRoot,
            batchId: _batchId,
            timestamp: block.timestamp,
            blockNumber: block.number,
            issuer: msg.sender,
            credentialCount: _credentialCount,
            metadata: _metadata
        });

        anchors[_merkleRoot] = record;
        roots.push(_merkleRoot);

        emit MerkleRootAnchored(
            _merkleRoot,
            _batchId,
            block.timestamp,
            block.number,
            msg.sender,
            _credentialCount,
            _metadata
        );
    }

    /**
     * @notice Consulta el estado de un anclaje por su raíz de Merkle
     * @param _merkleRoot Raíz a verificar
     */
    function getAnchor(bytes32 _merkleRoot) external view returns (
        bool exists,
        string memory batchId,
        uint256 timestamp,
        uint256 blockNumber,
        address issuer,
        uint256 credentialCount,
        string memory metadata
    ) {
        AnchorRecord memory r = anchors[_merkleRoot];
        if (r.timestamp == 0) {
            return (false, "", 0, 0, address(0), 0, "");
        }
        return (true, r.batchId, r.timestamp, r.blockNumber, r.issuer, r.credentialCount, r.metadata);
    }

    /**
     * @notice Retorna la cantidad total de lotes anclados
     */
    function totalAnchors() external view returns (uint256) {
        return roots.length;
    }

    /**
     * @notice Obtiene la raíz en un índice determinado
     */
    function getRootAtIndex(uint256 index) external view returns (bytes32) {
        require(index < roots.length, "Indice fuera de rango");
        return roots[index];
    }
}
