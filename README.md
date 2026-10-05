# Títulos Universitarios Verificables — Universidad de Buenos Aires (UBA)

> **Entorno de Pruebas de Arquitectura Técnica**  
> Basado en la propuesta técnica para la Secretaría Académica (Octubre 2026):  
> **W3C VC 2.0 / Open Badges 3.0 + did:web + Bitstring Status List + Anclaje en BFA / Hyperledger Besu (QBFT)**.

Este entorno implementa **todos y cada uno de los componentes y flujos** descriptos en el documento de propuesta técnica de 6 páginas, permitiendo realizar pruebas funcionales, criptográficas, de rendimiento y de mitigación de riesgos de ciberseguridad.

**100% Gratuito y de Código Abierto:**
- **Sin minería**: Consenso por autoridad (Proof of Authority / QBFT) con validadores identificados.
- **Sin moneda ni tokens**: Redes que operan con costo de transacción cero ($0 gas).
- **Sin servicios pagos**: Todo se ejecuta localmente usando APIs estándar abiertas de Node.js, Docker y W3C.

---

## 🏛️ Mapa de la Arquitectura en el Código

| Componente del Documento | Función Técnica | Implementación en este Entorno |
| **Sistema Académico** | Fuente de verdad de egresados (SIU Guaraní) | [`src/lib/academic-db.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/lib/academic-db.js) |
| **Persistencia Relacional / JSONB** | Base de datos PostgreSQL para títulos, claves HSM, revocaciones y lotes | [`src/lib/db.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/lib/db.js) y [`sql/init.sql`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/sql/init.sql) |
| **Servicio de Emisión** | Genera credencial W3C VC 2.0 / Open Badges 3.0 y agrupa lotes | [`src/core/vc.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/core/vc.js) |
| **HSM de Claves** | Custodia de clave privada y firma institucional protegida | [`src/core/crypto.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/core/crypto.js) (`Ed25519` + `JCS RFC 8785`) |
| **did:web** | Publicación de clave pública en dominio UBA vía HTTPS | [`src/core/did.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/core/did.js) y [`src/pages/.well-known/did.json.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/pages/.well-known/did.json.js) |
| **Lista de Revocación** | Estado de títulos fuera de cadena (sin datos personales) | [`src/core/status-list.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/core/status-list.js) y [`src/pages/estado/[id].js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/pages/estado/[id].js) |
| **Árbol de Merkle** | Cálculo de raíces y pruebas de inclusión por lote | [`src/core/merkle.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/core/merkle.js) (SHA-256 binary Merkle Tree) |
| **Anclaje Blockchain** | Registro de raíz de Merkle en BFA o Besu ($0 gas) | [`contracts/MerkleAnchorRegistry.sol`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/contracts/MerkleAnchorRegistry.sol) y [`src/blockchain/anchor-service.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/blockchain/anchor-service.js) |
| **Graduado (Titular)** | Billetera digital y diploma digital con código QR | [`src/components/GraduateTab.astro`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/components/GraduateTab.astro) (Pestaña 4: Diploma & Billetera) |
| **Verificador Público** | Portal web de validación en 4 fases (did:web, firma, estado, ancla) | [`src/core/verifier.js`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/core/verifier.js) y [`src/components/VerifierTab.astro`](file:///run/media/cetec/c182e059-3c92-4885-9b5a-0b2f0aeaadfe/AIProjects/titulos-bc/src/components/VerifierTab.astro) |

---

## 🚀 Inicio Rápido

### Requisitos
- **Node.js**: v18.0 o superior (recomendado v20+ o v22+).
- *(Opcional)* **Docker**: Para ejecutar un nodo real de Hyperledger Besu local con QBFT. Si no se usa Docker, el sistema usa automáticamente el simulador EVM integrado con costo cero.

### 1. Clonar e Instalar
```bash
# Instalar dependencias libres (express, ethers, qrcode)
npm install
```

### 2. Ejecutar Pruebas Automatizadas (21 Tests Unitarios y E2E)
```bash
npm test
```
Las pruebas validan en menos de 250ms:
- Generación de claves Ed25519 y firmas DataIntegrityProof.
- Canonicalización estricta RFC 8785 JCS (detección de fraude ante la alteración de un solo carácter).
- Compresión y verificación de Bitstring Status List v1.0 (100.000 títulos en menos de 100 bytes).
- Árbol de Merkle y pruebas matemáticas de inclusión.
- Verificación completa en 4 niveles y pruebas de escenarios de riesgo (revocación, adulteración, emisión retroactiva, resiliencia ante caída de la blockchain).

### 3. Iniciar Todo con un Solo Comando (Desarrollo y Pruebas)
```bash
npm run dev
```
> **¿Qué hace `npm run dev`?**
> 1. Detecta y levanta automáticamente los contenedores de **Hyperledger Besu (QBFT)** y **PostgreSQL (Persistencia JSONB)** en segundo plano mediante Docker.
> 2. Inicializa las tablas relacionales y esquemas JSONB para egresados SIU Guaraní, títulos VC 2.0 y claves institucionales.
> 3. Despliega (o reutiliza de forma persistente) el contrato inteligente `MerkleAnchorRegistry` en Besu con **gas cero ($0)**.
> 4. Si Docker no estuviera disponible, inicia de forma transparente con el simulador EVM y almacenamiento en memoria sin fallar.
> 5. Inicia el servidor Astro SSR de la UBA con recarga en caliente.

Abra su navegador en:
👉 **[http://localhost:4000/](http://localhost:4000/)**

---

## 🔍 Flujo de Verificación en 4 Niveles (Sección 4 del Documento)

Cuando un empleador o universidad extranjera valida un título en el portal:

```
[1. Resolver did:web de la UBA]
        ⬇ (Clave pública activa desde https://uba.ar/.well-known/did.json)
[2. Validar Firma Criptográfica (Ed25519)]
        ⬇ (Garantiza integridad: el título no fue adulterado y fue firmado por la UBA)
[3. Consultar Lista de Revocación (Bitstring Status List)]
        ⬇ (Revisa bit en https://uba.ar/estado/1: confirma que el título sigue vigente)
[4. (Respaldo) Comprobar Prueba de Merkle contra Ancla Blockchain]
        ⬇ (Comprueba la raíz en BFA o Besu: prueba existencia en esa fecha y evita emisión retroactiva)
[VEREDICTO: TÍTULO AUTÉNTICO, VIGENTE Y VERIFICADO]
```

### 💡 Desacoplamiento de la Blockchain (Ventaja Clave)
La verificación cotidiana (Pasos 1 a 3) **NO requiere acceso a la blockchain ni depende de que la red esté activa**. La blockchain actúa como respaldo inmutable e independiente de fecha y existencia en caso de compromiso de claves o auditorías retroactivas.

---

## 🧪 Pruebas de Mitigación de Riesgos (Sección 9)

En la pestaña **"6. Sandbox de Riesgos"** del panel web, se pueden ejecutar en vivo con un solo clic los siguientes escenarios documentados en el informe:

1. **Caso 1: Título Legítimo y Vigente**
   - *Resultado*: Los 4 pasos aprobados (100% auténtico).
2. **Caso 2: Título Revocado / Rectificado**
   - *Resultado*: La firma es válida, pero el Paso 3 detecta la revocación institucional en la Bitstring Status List sin necesidad de alterar la blockchain.
3. **Caso 3: Título Falsificado / Adulterado**
   - *Resultado*: Si alguien altera el nombre, carrera o notas en el JSON, el Paso 2 (firma criptográfica Ed25519) falla inmediatamente.
4. **Caso 4: Título Retroactivo / Falso Histórico**
   - *Resultado*: Si alguien intentara usar una clave para emitir un título con fecha falsa hacia atrás, el Paso 4 detecta que la raíz nunca estuvo anclada en la blockchain en ese bloque/fecha histórica.
5. **Caso 5: Resiliencia ante Caída de la Blockchain**
   - *Resultado*: Se simula la indisponibilidad de la red blockchain; los Pasos 1, 2 y 3 se aprueban con éxito, garantizando continuidad operativa internacional.

---

## 🐳 Opcional: Probar con un Nodo Real Hyperledger Besu (QBFT)

Si desea probar contra un contenedor real de Hyperledger Besu con consenso QBFT y gas cero:

```bash
# Levantar el nodo Besu en segundo plano
npm run besu:up

# El nodo Besu expondrá JSON-RPC en http://localhost:8545
# El servicio de anclaje de este entorno lo detectará automáticamente.

# Para detener el nodo Besu
npm run besu:down
```

---

## 📂 Estructura del Proyecto (Astro.js SSR)

```
titulos-bc/
├── package.json               # Dependencias (Astro 7, Node adapter, Ethers, Ed25519)
├── astro.config.mjs           # Configuración Astro SSR (Standalone @astrojs/node)
├── docker-compose.yml         # Contenedor oficial de Hyperledger Besu (QBFT, $0 gas)
├── start.sh                   # Script bash de arranque automático
├── scripts/
│   └── dev.js                 # Orquestador: Besu + dev server Astro unificado
├── contracts/
│   └── MerkleAnchorRegistry.sol # Contrato Solidity de anclaje de raíces Merkle ($0 gas)
├── public/
│   ├── css/style.css          # Estilos institucionales UBA con glassmorphism y dark mode
│   └── js/
│       ├── api.js             # Cliente HTTP a los endpoints SSR de Astro
│       └── app.js             # Controlador del árbol de Merkle, diploma interactivo y sandbox
├── src/
│   ├── layouts/
│   │   └── Layout.astro       # Layout raíz HTML5 y metadatos SEO
│   ├── pages/
│   │   ├── index.astro        # Página principal reactiva con tabs dinámicos
│   │   ├── .well-known/
│   │   │   └── did.json.js    # Endpoint did:web institucional de la UBA
│   │   ├── estado/
│   │   │   └── [id].js        # Endpoint W3C Bitstring Status List v1.0
│   │   └── api/
│   │       ├── academic/      # Registro SIU Guaraní de egresados
│   │       ├── issuer/        # Emisión VC 2.0, anclaje por lote y revocaciones
│   │       ├── verifier/      # Pipeline de verificación en 4 fases
│   │       ├── blockchain/    # Estado de la red Besu y contrato de anclaje
│   │       ├── qr/            # Generación de códigos QR para diplomas
│   │       └── simulation/    # Escenarios interactivos del Sandbox de riesgos
│   ├── components/
│   │   ├── Header.astro       # Cabecera institucional UBA
│   │   ├── NavBar.astro       # Barra de navegación por pestañas
│   │   ├── ArchitectureTab.astro # Pestaña 1: Diagrama interactivo y flujo de 4 niveles
│   │   ├── IssuerTab.astro    # Pestaña 2: Emisión SIU Guaraní y credenciales
│   │   ├── AnchorTab.astro    # Pestaña 3: Árbol de Merkle y anclaje Besu
│   │   ├── GraduateTab.astro  # Pestaña 4: Diploma digital y billetera
│   │   ├── VerifierTab.astro  # Pestaña 5: Validador en 4 fases
│   │   ├── SandboxTab.astro   # Pestaña 6: Banco de pruebas de seguridad
│   │   └── Footer.astro       # Pie institucional UBA y especificaciones técnicas
│   ├── lib/
│   │   ├── app-context.js     # Singleton institucional (HSM, DID, StatusList, Besu)
│   │   └── academic-db.js     # Base simulada SIU Guaraní (alumnos de Exactas, Medicina, etc.)
│   ├── core/
│   │   ├── crypto.js          # Ed25519, canonicalización JCS (RFC 8785), Multibase z...
│   │   ├── did.js             # Generador y resolutor W3C did:web
│   │   ├── status-list.js     # W3C Bitstring Status List v1.0 (gzip + multibase)
│   │   ├── merkle.js          # Árbol de Merkle binario y pruebas de inclusión
│   │   ├── vc.js              # Creador y firmador W3C VC 2.0 / Open Badges 3.0
│   │   └── verifier.js        # Pipeline de verificación en 4 niveles
│   └── blockchain/
│       ├── contract-abi.js    # ABI del contrato MerkleAnchorRegistry
│       ├── evm-simulator.js   # Emulador local EVM con gas cero y timestamps
│       └── anchor-service.js  # Conector agnóstico (Hyperledger Besu o Simulador)
└── test/
    ├── crypto.test.js         # Tests unitarios criptográficos Ed25519
    ├── status-list.test.js    # Tests unitarios de Bitstring Status List
    ├── merkle.test.js         # Tests unitarios de Árbol de Merkle y pruebas
    ├── vc.test.js             # Tests de esquema VC 2.0 y Open Badges 3.0
    └── e2e.test.js            # Tests de integración End-to-End de los 5 casos de uso
```

---

## ⚖️ Licencia y Cumplimiento Normativo
- Desarrollado bajo estándares abiertos: **W3C Verifiable Credentials Data Model v2.0**, **W3C Bitstring Status List v1.0**, **Open Badges 3.0**, **RFC 8785 (JCS)**.
- Cumplimiento de la **Ley 25.326 de Protección de Datos Personales** (Argentina): únicamente huellas criptográficas en blockchain; datos personales fuera de la cadena en poder del graduado.
- Código 100% de uso libre y gratuito.
