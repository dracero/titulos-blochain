/**
 * Implementación de Bitstring Status List v1.0 (Estándar W3C)
 * Permite revocar o anular títulos universitarios sin modificar la blockchain.
 * - Sin datos personales: sólo un arreglo de bits comprimido con gzip.
 * - Bit 0 = Vigente / Válido
 * - Bit 1 = Revocado / Anulado
 * - Codificación Multibase base64url (prefijo 'u')
 */

const zlib = require('node:zlib');

class BitstringStatusList {
  /**
   * @param {number} sizeInBits Tamaño del arreglo de bits (por defecto 100,000 para cohortes completas)
   * @param {Buffer} [initialBuffer] Buffer existente si se carga desde almacenamiento
   */
  constructor(sizeInBits = 100000, initialBuffer = null) {
    this.sizeInBits = sizeInBits;
    const byteLength = Math.ceil(sizeInBits / 8);
    this.buffer = initialBuffer ? Buffer.from(initialBuffer) : Buffer.alloc(byteLength, 0);
  }

  /**
   * Obtiene el valor del bit en un índice (0 o 1)
   * @param {number|string} index 
   * @returns {number} 0 o 1
   */
  getBit(index) {
    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 0 || idx >= this.sizeInBits) {
      throw new Error(`Índice de lista de estado fuera de rango: ${index} (Máximo: ${this.sizeInBits - 1})`);
    }
    const byteIndex = Math.floor(idx / 8);
    const bitOffset = 7 - (idx % 8);
    return (this.buffer[byteIndex] >> bitOffset) & 1;
  }

  /**
   * Establece el valor del bit en un índice (0 = vigente, 1 = revocado)
   * @param {number|string} index 
   * @param {boolean|number} value 
   */
  setBit(index, value) {
    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 0 || idx >= this.sizeInBits) {
      throw new Error(`Índice de lista de estado fuera de rango: ${index}`);
    }
    const byteIndex = Math.floor(idx / 8);
    const bitOffset = 7 - (idx % 8);
    if (value) {
      this.buffer[byteIndex] |= (1 << bitOffset);
    } else {
      this.buffer[byteIndex] &= ~(1 << bitOffset);
    }
  }

  /**
   * Marca una credencial como revocada (bit = 1)
   * @param {number|string} index 
   */
  revoke(index) {
    this.setBit(index, 1);
  }

  /**
   * Restablece el estado de una credencial a vigente (bit = 0)
   * @param {number|string} index 
   */
  unrevoke(index) {
    this.setBit(index, 0);
  }

  /**
   * Verifica si el índice está revocado
   * @param {number|string} index 
   * @returns {boolean} true si está revocado, false si está vigente
   */
  isRevoked(index) {
    return this.getBit(index) === 1;
  }

  /**
   * Codifica el bitstring comprimiéndolo con gzip y prefijándolo con 'u' (Multibase base64url)
   * Cumpliendo W3C Bitstring Status List v1.0
   * @returns {string}
   */
  encode() {
    const compressed = zlib.gzipSync(this.buffer);
    return 'u' + compressed.toString('base64url');
  }

  /**
   * Reconstruye una instancia de BitstringStatusList a partir del string codificado
   * @param {string} encodedString Cadena multibase 'u...'
   * @param {number} [sizeInBits]
   * @returns {BitstringStatusList}
   */
  static decode(encodedString, sizeInBits = 100000) {
    if (!encodedString || !encodedString.startsWith('u')) {
      throw new Error('Formato de lista de estado inválido: debe comenzar con prefijo multibase "u"');
    }
    const base64urlData = encodedString.slice(1);
    const compressedBuffer = Buffer.from(base64urlData, 'base64url');
    const decompressed = zlib.gunzipSync(compressedBuffer);
    const calculatedSize = sizeInBits || decompressed.length * 8;
    return new BitstringStatusList(calculatedSize, decompressed);
  }

  /**
   * Genera el objeto Verifiable Credential oficial de la lista de estado (W3C)
   * @param {string} statusCredentialUrl URL pública donde se publica (ej: https://uba.ar/estado/1)
   * @param {string} issuerDid DID del emisor (ej: did:web:uba.ar)
   * @returns {object}
   */
  generateCredential(statusCredentialUrl, issuerDid) {
    return {
      "@context": [
        "https://www.w3.org/ns/credentials/v2"
      ],
      "id": statusCredentialUrl,
      "type": ["VerifiableCredential", "BitstringStatusListCredential"],
      "issuer": issuerDid,
      "validFrom": new Date().toISOString(),
      "credentialSubject": {
        "id": `${statusCredentialUrl}#list`,
        "type": "BitstringStatusList",
        "statusPurpose": "revocation",
        "encodedList": this.encode()
      }
    };
  }
}

module.exports = BitstringStatusList;
