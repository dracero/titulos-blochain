/**
 * Manejo y Resolución del método did:web (W3C DID v1.0)
 * Permite a la Universidad de Buenos Aires publicar sus claves públicas de firma
 * en su propio dominio (did:web:uba.ar), permitiendo la verificación internacional
 * sin intermediarios, sin costo y sin necesidad de acceder a la blockchain.
 */

class DidWebManager {
  /**
   * @param {string} domain Dominio institucional (ej: 'uba.ar' o 'localhost:4000')
   * @param {string} keyId Identificador de clave (ej: 'clave-2026')
   * @param {string} publicKeyMultibase Clave pública en formato multibase z...
   */
  constructor(domain = 'uba.ar', keyId = 'clave-2026', publicKeyMultibase = '') {
    this.domain = domain;
    this.keyId = keyId;
    this.publicKeyMultibase = publicKeyMultibase;
    this.did = this.formatDid(domain);
  }

  /**
   * Convierte un dominio o host:port al formato did:web
   * Ej: 'uba.ar' -> 'did:web:uba.ar'
   * Ej: 'localhost:4000' -> 'did:web:localhost%3A4000'
   */
  formatDid(domain) {
    const encoded = domain.replace(/:/g, '%3A');
    return `did:web:${encoded}`;
  }

  /**
   * Obtiene el identificador completo del método de verificación
   * Ej: 'did:web:uba.ar#clave-2026'
   */
  getVerificationMethodId() {
    return `${this.did}#${this.keyId}`;
  }

  /**
   * Genera el Documento DID (W3C DID Document) oficial
   * @returns {object}
   */
  getDidDocument() {
    const vmId = this.getVerificationMethodId();
    return {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1"
      ],
      "id": this.did,
      "verificationMethod": [
        {
          "id": vmId,
          "type": "Ed25519VerificationKey2020",
          "controller": this.did,
          "publicKeyMultibase": this.publicKeyMultibase
        }
      ],
      "authentication": [vmId],
      "assertionMethod": [vmId]
    };
  }

  /**
   * Determina la URL HTTPS donde se aloja el documento DID
   * did:web:uba.ar -> https://uba.ar/.well-known/did.json
   */
  static getWellKnownUrl(did) {
    if (!did || !did.startsWith('did:web:')) {
      throw new Error(`DID no soportado: ${did}. Se requiere did:web`);
    }
    const parts = did.slice('did:web:'.length).split(':');
    const domain = decodeURIComponent(parts[0]);
    const protocol = domain.includes('localhost') ? 'http' : 'https';

    if (parts.length === 1) {
      return `${protocol}://${domain}/.well-known/did.json`;
    }
    const path = parts.slice(1).map(decodeURIComponent).join('/');
    return `${protocol}://${domain}/${path}/did.json`;
  }

  /**
   * Resuelve un DID did:web a su clave pública correspondiente
   * Soporta mock local para pruebas y resolución HTTP real
   * @param {string} verificationMethodId Ej: 'did:web:uba.ar#clave-2026'
   * @param {object} [fallbackDidDoc] Documento DID local inyectado para entorno de pruebas
   * @returns {Promise<{ keyId: string, publicKeyMultibase: string, didDocument: object }>}
   */
  static async resolve(verificationMethodId, fallbackDidDoc = null) {
    const [did, fragment] = verificationMethodId.split('#');
    let didDoc = fallbackDidDoc;

    if (!didDoc) {
      const url = DidWebManager.getWellKnownUrl(did);
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          throw new Error(`Error HTTP ${response.status} al resolver ${url}`);
        }
        didDoc = await response.json();
      } catch (err) {
        throw new Error(`No se pudo resolver did:web en ${url}: ${err.message}`);
      }
    }

    if (!didDoc || didDoc.id !== did) {
      throw new Error(`Documento DID inválido o discordante para ${did}`);
    }

    const key = (didDoc.verificationMethod || []).find(vm => {
      return vm.id === verificationMethodId || vm.id === `#${fragment}` || (fragment && vm.id.endsWith(fragment));
    });

    if (!key) {
      throw new Error(`Método de verificación ${verificationMethodId} no encontrado en documento DID`);
    }

    return {
      keyId: key.id,
      publicKeyMultibase: key.publicKeyMultibase,
      didDocument: didDoc
    };
  }
}

export { DidWebManager };
export default DidWebManager;
