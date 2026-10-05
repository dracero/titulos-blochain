#!/usr/bin/env bash
# ==============================================================================
# Universidad de Buenos Aires - Títulos Universitarios Verificables
# Script de inicio rápido del Entorno de Pruebas (100% Gratuito y Open Source)
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================================"
echo "🏛️  UNIVERSIDAD DE BUENOS AIRES - SISTEMA DE TÍTULOS VERIFICABLES"
echo "    Iniciando Entorno de Pruebas de Arquitectura (VC 2.0 + did:web + Besu/BFA)"
echo "======================================================================"

# Verificar node
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js no está instalado. Instale Node.js v18 o superior."
    exit 1
fi

echo "📦 Verificando dependencias npm..."
if [ ! -d "node_modules" ]; then
    npm install
fi

echo "🧪 Ejecutando suite de pruebas automatizadas..."
npm test

echo "🚀 Iniciando entorno unificado (Besu QBFT + Servidor UBA)..."
npm run dev
