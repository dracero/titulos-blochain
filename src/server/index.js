/**
 * Punto de entrada principal para el Entorno de Test de Títulos Verificables UBA
 */

const createApp = require('./app');

const PORT = process.env.PORT || 4000;
const DOMAIN = process.env.UBA_DOMAIN || `localhost:${PORT}`;

const { app, anchorService, didManager } = createApp({ domain: DOMAIN });

app.listen(PORT, async () => {
  console.log('='.repeat(70));
  console.log('🏛️  UNIVERSIDAD DE BUENOS AIRES - SISTEMA DE TÍTULOS VERIFICABLES');
  console.log('    Entorno de Prueba de Arquitectura VC 2.0 / Open Badges 3.0');
  console.log('='.repeat(70));
  console.log(`🌐 Servidor iniciado en:      http://localhost:${PORT}`);
  console.log(`🔑 did:web UBA:              http://localhost:${PORT}/.well-known/did.json`);
  console.log(`📋 Bitstring Status List:    http://localhost:${PORT}/estado/1`);
  console.log(`⛓️  Red de Anclaje:           ${anchorService.networkName}`);
  console.log(`💻 Panel Interactivo Web:    http://localhost:${PORT}/`);
  console.log('='.repeat(70));
});
