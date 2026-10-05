/**
 * Pipeline de Verificación en 4 Niveles para Títulos Universitarios
 * Implementa estrictamente el flujo de verificación de la Sección 4 del documento técnico:
 * 
 * 1. Resolución de did:web y obtención de clave pública.
 * 2. Validación de firma criptográfica Ed25519 (DataIntegrityProof eddsa-rdfc-2022).
 * 3. Consulta de lista de revocación (Bitstring Status List).
 * 4. Comprobación de inclusión Merkle contra el ancla en Blockchain (BFA o Besu QBFT).
 * 
 * Además implementa la propiedad de desacoplamiento:
 * La verificación cotidiana (Pasos 1 a 3) funciona 100% aun cuando la red blockchain
 * no esté disponible o el verificador elija no consultar la blockchain.
 */

const { canonicalizeJson, verifyEd25519, sha256 } = require('./crypto');
const DidWebManager = require('./did');
const BitstringStatusList = require('./status-list');
const { hashCredential, verifyMerkleProof } = require('./merkle');

class DegreeVerifier {
  /**
   * @param {object} [options]
   * @param {object} [options.anchorService] Servicio de consulta a la blockchain (Besu / BFA)
   * @param {object} [options.fallbackDidDoc] Documento DID local para pruebas sin DNS
   * @param {Function} [options.statusListProvider] Función para resolver listas de estado en pruebas
   */
  constructor(options = {}) {
    this.anchorService = options.anchorService || null;
    this.fallbackDidDoc = options.fallbackDidDoc || null;
    this.statusListProvider = options.statusListProvider || null;
  }

  /**
   * Ejecuta la verificación completa de un título universitario
   * @param {object} params
   * @param {object} params.credential Credencial W3C en formato JSON
   * @param {Array} [params.merkleProof] Prueba de inclusión Merkle
   * @param {string} [params.merkleRoot] Raíz de Merkle esperada
   * @param {boolean} [params.skipBlockchain=false] Si true, omite el paso 4 para simular verificación offline
   * @returns {Promise<object>}
   */
  async verify({
    credential,
    merkleProof = null,
    merkleRoot = null,
    skipBlockchain = false
  }) {
    const report = {
      isValid: false,
      summary: '',
      timestamp: new Date().toISOString(),
      steps: {
        didWeb: { status: 'PENDING', title: 'Paso 1: Resolución did:web de la UBA', details: '' },
        signature: { status: 'PENDING', title: 'Paso 2: Firma Criptográfica (eddsa-rdfc-2022)', details: '' },
        statusList: { status: 'PENDING', title: 'Paso 3: Estado y Revocación (Bitstring Status List)', details: '' },
        blockchainAnchor: { status: 'PENDING', title: 'Paso 4: Prueba de Merkle y Anclaje Blockchain', details: '' }
      },
      degreeData: null
    };

    try {
      // Validación de estructura básica
      if (!credential || typeof credential !== 'object') {
        throw new Error('La credencial proporcionada no es un objeto JSON válido');
      }
      if (!credential.proof || !credential.proof.verificationMethod || !credential.proof.proofValue) {
        throw new Error('La credencial carece de bloque "proof" (DataIntegrityProof) válido');
      }

      // Extraer datos del título para presentación amigable
      const subj = credential.credentialSubject || {};
      const ach = subj.achievement || {};
      const grad = subj.graduate || {};
      report.degreeData = {
        graduateName: grad.name || 'Graduado UBA',
        degreeName: ach.name || 'Título Universitario',
        faculty: grad.faculty || 'Universidad de Buenos Aires',
        graduationDate: grad.graduationDate || credential.validFrom || 'Fecha no especificada',
        issuerName: (credential.issuer && credential.issuer.name) || 'Universidad de Buenos Aires'
      };

      // -------------------------------------------------------------
      // PASO 1: Resolver did:web del emisor
      // -------------------------------------------------------------
      const vmId = credential.proof.verificationMethod;
      let resolvedKey;
      try {
        resolvedKey = await DidWebManager.resolve(vmId, this.fallbackDidDoc);
        report.steps.didWeb = {
          status: 'PASSED',
          title: 'Paso 1: Identidad del Emisor (did:web)',
          issuerDid: credential.issuer.id || credential.issuer,
          verificationMethod: vmId,
          publicKeyMultibase: resolvedKey.publicKeyMultibase,
          details: `DID resuelto exitosamente. Clave pública activa obtenida del dominio institucional: ${resolvedKey.publicKeyMultibase}`
        };
      } catch (err) {
        report.steps.didWeb = {
          status: 'FAILED',
          title: 'Paso 1: Identidad del Emisor (did:web)',
          error: err.message,
          details: `Error al resolver did:web en el dominio de la UBA: ${err.message}`
        };
        report.summary = 'Fallo en la resolución de identidad del emisor (did:web)';
        return report;
      }

      // -------------------------------------------------------------
      // PASO 2: Validar firma criptográfica (DataIntegrityProof)
      // -------------------------------------------------------------
      try {
        const credentialCopy = JSON.parse(JSON.stringify(credential));
        delete credentialCopy.proof;
        const canonicalData = canonicalizeJson(credentialCopy);
        const signatureMultibase = credential.proof.proofValue;

        const isSignatureValid = verifyEd25519(
          canonicalData,
          signatureMultibase,
          resolvedKey.publicKeyMultibase
        );

        if (!isSignatureValid) {
          report.steps.signature = {
            status: 'FAILED',
            title: 'Paso 2: Firma Criptográfica (eddsa-rdfc-2022)',
            cryptosuite: credential.proof.cryptosuite,
            details: 'La firma criptográfica es INVÁLIDA. El título fue modificado, adulterado o no fue firmado por la clave institucional de la UBA.'
          };
          report.summary = 'Fallo de integridad: firma criptográfica inválida (posible adulteración)';
          return report;
        }

        report.steps.signature = {
          status: 'PASSED',
          title: 'Paso 2: Firma Criptográfica (eddsa-rdfc-2022)',
          cryptosuite: credential.proof.cryptosuite,
          proofCreated: credential.proof.created,
          details: 'Firma criptográfica Ed25519 VÁLIDA. Los datos del título están íntegros y no han sufrido alteración alguna.'
        };
      } catch (err) {
        report.steps.signature = {
          status: 'FAILED',
          title: 'Paso 2: Firma Criptográfica (eddsa-rdfc-2022)',
          details: `Error al verificar la firma: ${err.message}`
        };
        report.summary = 'Error al verificar firma criptográfica';
        return report;
      }

      // -------------------------------------------------------------
      // PASO 3: Consultar lista de revocación (Bitstring Status List)
      // -------------------------------------------------------------
      const statusEntry = credential.credentialStatus;
      if (!statusEntry || statusEntry.type !== 'BitstringStatusListEntry') {
        report.steps.statusList = {
          status: 'WARNING',
          title: 'Paso 3: Lista de Revocación',
          details: 'La credencial no especifica una BitstringStatusListEntry estándar'
        };
      } else {
        try {
          const index = parseInt(statusEntry.statusListIndex, 10);
          const listUrl = statusEntry.statusListCredential;
          let statusListInstance;

          if (this.statusListProvider) {
            statusListInstance = await this.statusListProvider(listUrl);
          } else {
            const resp = await fetch(listUrl, { headers: { Accept: 'application/json' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} al consultar ${listUrl}`);
            const statusCred = await resp.json();
            const encoded = statusCred.credentialSubject.encodedList;
            statusListInstance = BitstringStatusList.decode(encoded);
          }

          const isRevoked = statusListInstance.isRevoked(index);

          if (isRevoked) {
            report.steps.statusList = {
              status: 'REVOKED',
              title: 'Paso 3: Estado y Revocación (Bitstring Status List)',
              statusListIndex: String(index),
              statusCredentialUrl: listUrl,
              isRevoked: true,
              details: `El título fue REVOCADO o ANULADO por la Universidad (Bit ${index} = 1 en ${listUrl}).`
            };
            report.summary = 'El título universitario ha sido revocado por la institución emisora';
            return report;
          }

          report.steps.statusList = {
            status: 'PASSED',
            title: 'Paso 3: Estado y Revocación (Bitstring Status List)',
            statusListIndex: String(index),
            statusCredentialUrl: listUrl,
            isRevoked: false,
            details: `Título VIGENTE. Entrada consultada en el índice ${index} de la lista oficial.`
          };
        } catch (err) {
          report.steps.statusList = {
            status: 'WARNING',
            title: 'Paso 3: Estado y Revocación (Bitstring Status List)',
            details: `No se pudo consultar la lista de revocación (${err.message}). La firma sigue siendo válida pero se recomienda reintentar.`
          };
        }
      }

      // -------------------------------------------------------------
      // PASO 4: Comprobación de inclusión Merkle y Ancla Blockchain
      // -------------------------------------------------------------
      if (skipBlockchain) {
        report.steps.blockchainAnchor = {
          status: 'SKIPPED',
          title: 'Paso 4: Prueba de Merkle y Anclaje Blockchain',
          details: 'Paso omitido a solicitud (demuestra que la verificación cotidiana es autónoma sin consultar la red).'
        };
      } else if (!merkleProof || !this.anchorService) {
        report.steps.blockchainAnchor = {
          status: 'SKIPPED',
          title: 'Paso 4: Prueba de Merkle y Anclaje Blockchain',
          details: 'Prueba de Merkle o servicio de anclaje no provisto. La credencial es válida por firma de UBA y vigencia de estado.'
        };
      } else {
        try {
          const leafHash = hashCredential(credential);
          let targetRoot = merkleRoot;

          // Si el árbol de Merkle contiene prueba, verificarla matemáticamente
          if (Array.isArray(merkleProof) && merkleProof.length > 0 && targetRoot) {
            const isProofValid = verifyMerkleProof(leafHash, merkleProof, targetRoot);
            if (!isProofValid) {
              report.steps.blockchainAnchor = {
                status: 'FAILED',
                title: 'Paso 4: Prueba de Merkle y Anclaje Blockchain',
                leafHash,
                targetRoot,
                details: 'La prueba de inclusión de Merkle es INVÁLIDA para la raíz indicada. El título no pertenece a este lote.'
              };
              report.summary = 'Prueba de inclusión Merkle inconsistente con la raíz de anclaje';
              return report;
            }
          }

          // Consultar el contrato de anclaje en la Blockchain (Besu / BFA)
          const anchorRecord = await this.anchorService.getAnchor(targetRoot);

          if (!anchorRecord || !anchorRecord.exists) {
            report.steps.blockchainAnchor = {
              status: 'NOT_ANCHORED',
              title: 'Paso 4: Prueba de Merkle y Anclaje Blockchain',
              leafHash,
              merkleRoot: targetRoot,
              details: 'La raíz de Merkle NO se encuentra anclada en el contrato blockchain. Podría tratarse de un título emitido retroactivamente o no registrado aún.'
            };
            report.summary = 'Título firmado válidamente pero sin anclaje confirmado en blockchain';
            // Nota: según la propuesta, la validez principal reside en la firma,
            // pero el ancla detecta retroactividad o confirma existencia histórica.
          } else {
            report.steps.blockchainAnchor = {
              status: 'PASSED',
              title: 'Paso 4: Prueba de Merkle y Anclaje Blockchain',
              leafHash,
              merkleRoot: targetRoot,
              batchId: anchorRecord.batchId,
              blockNumber: anchorRecord.blockNumber,
              timestamp: anchorRecord.timestamp,
              anchoredDate: new Date(anchorRecord.timestamp * 1000).toLocaleString('es-AR'),
              issuerAddress: anchorRecord.issuer,
              credentialCount: anchorRecord.credentialCount,
              network: this.anchorService.networkName,
              details: `Anclaje CONFIRMADO en ${this.anchorService.networkName}. Lote "${anchorRecord.batchId}" registrado en bloque #${anchorRecord.blockNumber} el ${new Date(anchorRecord.timestamp * 1000).toLocaleString('es-AR')}.`
            };
          }
        } catch (err) {
          report.steps.blockchainAnchor = {
            status: 'WARNING',
            title: 'Paso 4: Prueba de Merkle y Anclaje Blockchain',
            details: `Aviso al consultar la red blockchain (${err.message}). La firma did:web y estado siguen siendo válidos.`
          };
        }
      }

      // Determinación global del resultado
      const didOk = report.steps.didWeb.status === 'PASSED';
      const sigOk = report.steps.signature.status === 'PASSED';
      const statusOk = report.steps.statusList.status === 'PASSED';
      const anchorOk = report.steps.blockchainAnchor.status === 'PASSED' || report.steps.blockchainAnchor.status === 'SKIPPED';

      if (didOk && sigOk && statusOk && anchorOk) {
        report.isValid = true;
        report.summary = 'Título Universitario AUTÉNTICO, VIGENTE y VERIFICADO';
      } else {
        report.isValid = false;
        if (!report.summary) {
          report.summary = 'La verificación no pudo ser completada satisfactoriamente';
        }
      }

      return report;
    } catch (error) {
      report.isValid = false;
      report.summary = `Error fatal durante la verificación: ${error.message}`;
      return report;
    }
  }
}

module.exports = DegreeVerifier;
