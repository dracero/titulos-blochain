/**
 * Generador y Firmador de Credenciales Verificables W3C VC 2.0 / Open Badges 3.0
 * Alineado exactamente con la Sección 6 ("Ejemplo ilustrativo de credencial")
 * de la propuesta técnica para la Universidad de Buenos Aires.
 */

import crypto from 'node:crypto';
import { canonicalizeJson, signEd25519, sha256 } from './crypto.js';

/**
 * Crea una estructura de credencial de título universitario previa a la firma
 * @param {object} params
 * @param {string} params.issuerDid DID del emisor (ej: 'did:web:uba.ar')
 * @param {string} params.issuerName Nombre de la institución ('Universidad de Buenos Aires')
 * @param {string} params.degreeName Nombre del título (ej: 'Licenciatura en Ciencias de la Computación')
 * @param {string} [params.achievementType] Tipo de titulación (ej: 'BachelorDegree', 'MasterDegree', 'Doctorate')
 * @param {string} params.graduateName Nombre del graduado
 * @param {string} params.graduateDni DNI del graduado (se hashea para cumplir Ley 25.326)
 * @param {string} params.faculty Nombre de la facultad
 * @param {string} params.graduationDate Fecha oficial de egreso
 * @param {number|string} params.statusIndex Índice asignado en la lista de revocación
 * @param {string} params.statusCredentialUrl URL de la lista de estado (ej: 'http://localhost:4000/estado/1')
 * @returns {object} Credencial no firmada
 */
function createDegreeCredential({
  id = null,
  issuerDid = 'did:web:uba.ar',
  issuerName = 'Universidad de Buenos Aires',
  degreeName,
  achievementType = 'BachelorDegree',
  graduateName,
  graduateDni,
  faculty,
  graduationDate,
  statusIndex,
  statusCredentialUrl
}) {
  const dniHash = sha256(graduateDni.trim()).toString('hex');
  const validFrom = graduationDate ? new Date(graduationDate).toISOString() : new Date().toISOString();
  const credentialId = id || `urn:uuid:${cryptoRandomUuid()}`;

  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
    ],
    "id": credentialId,
    "type": ["VerifiableCredential", "OpenBadgeCredential"],
    "issuer": {
      "id": issuerDid,
      "type": ["Profile"],
      "name": issuerName
    },
    "validFrom": validFrom,
    "credentialSubject": {
      "type": ["AchievementSubject"],
      "achievement": {
        "type": ["Achievement"],
        "achievementType": achievementType,
        "name": degreeName,
        "description": `Título universitario oficial otorgado por la ${issuerName} a través de la ${faculty}.`
      },
      "graduate": {
        "name": graduateName,
        "documentType": "DNI",
        "documentNumberHash": `sha256:${dniHash}`,
        "faculty": faculty,
        "graduationDate": graduationDate
      }
    },
    "credentialStatus": {
      "type": "BitstringStatusListEntry",
      "statusPurpose": "revocation",
      "statusListIndex": String(statusIndex),
      "statusListCredential": statusCredentialUrl
    }
  };
}

/**
 * Firma una credencial con la clave custodiada del emisor (simulador HSM)
 * Genera una DataIntegrityProof con cryptosuite eddsa-rdfc-2022
 * @param {object} unsignedCredential Credencial sin campo 'proof'
 * @param {string} privateKeyPem Clave privada Ed25519
 * @param {string} verificationMethodId ID del método en did:web (ej: 'did:web:uba.ar#clave-2026')
 * @returns {object} Credencial Verificable completa y firmada
 */
function signCredential(unsignedCredential, privateKeyPem, verificationMethodId) {
  // Crear copia limpia y remover proof si ya existiera
  const credentialCopy = JSON.parse(JSON.stringify(unsignedCredential));
  delete credentialCopy.proof;

  // Canonicalización RFC 8785 JCS
  const canonicalData = canonicalizeJson(credentialCopy);

  // Firma Ed25519 en formato Multibase 'z...'
  const proofValue = signEd25519(canonicalData, privateKeyPem);

  credentialCopy.proof = {
    "type": "DataIntegrityProof",
    "cryptosuite": "eddsa-rdfc-2022",
    "verificationMethod": verificationMethodId,
    "created": new Date().toISOString(),
    "proofValue": proofValue
  };

  return credentialCopy;
}

/**
 * Extrae los datos a firmar a partir de una credencial firmada
 * @param {object} signedCredential
 * @returns {string} Datos en canonical JSON
 */
function getCredentialCanonicalData(signedCredential) {
  const credentialCopy = JSON.parse(JSON.stringify(signedCredential));
  delete credentialCopy.proof;
  return canonicalizeJson(credentialCopy);
}

function cryptoRandomUuid() {
  return crypto.randomUUID();
}

export {
  createDegreeCredential,
  signCredential,
  getCredentialCanonicalData
};

export default {
  createDegreeCredential,
  signCredential,
  getCredentialCanonicalData
};
