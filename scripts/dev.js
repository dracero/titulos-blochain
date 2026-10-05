#!/usr/bin/env node

/**
 * Script de inicio unificado para desarrollo (npm run dev)
 * 1. Levanta automáticamente el nodo Hyperledger Besu (QBFT) en Docker si está disponible.
 * 2. Espera a que el nodo esté listo respondiendo en JSON-RPC (http://localhost:8545).
 * 3. Si Docker no está instalado o activo, continúa sin fallar usando el Simulador EVM local (gas=0).
 * 4. Inicia el servidor Node.js en modo observación (--watch) con recarga en caliente.
 */

import { execSync, spawn } from 'node:child_process';
import net from 'node:net';

async function waitForRpc(timeoutMs = 15000) {
  const start = Date.now();
  const urls = ['http://127.0.0.1:8545', 'http://localhost:8545'];
  while (Date.now() - start < timeoutMs) {
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.result !== undefined) return true;
        }
      } catch (_) {
        // Ignorar hasta que el servicio levante
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise(resolve => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function startInfrastructure() {
  process.stdout.write('🐳 Verificando entorno Docker (Hyperledger Besu + PostgreSQL)...\n');
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    
    process.stdout.write('🚀 Iniciando contenedores Besu (QBFT gas=0) y PostgreSQL (Persistencia JSONB)...\n');
    execSync('docker compose up -d besu-node postgres', { stdio: 'inherit' });

    process.stdout.write('⏳ Esperando inicialización de servicios (RPC:8545, PG:5432)...\n');
    const [besuReady, pgReady] = await Promise.all([
      waitForRpc(15000),
      waitForPort(5432, 15000)
    ]);

    if (besuReady) {
      process.stdout.write('✅ Hyperledger Besu QBFT listo y produciendo bloques.\n');
    } else {
      process.stdout.write('⚠️  Nodo Besu no respondió a tiempo; usando simulador local.\n');
    }

    if (pgReady) {
      process.stdout.write('✅ PostgreSQL listo con persistencia relacional y JSONB.\n\n');
    } else {
      process.stdout.write('⚠️  PostgreSQL no respondió a tiempo; usando almacenamiento en memoria.\n\n');
    }
  } catch (err) {
    process.stdout.write('ℹ️  Docker no está en ejecución o no está disponible.\n');
    process.stdout.write('   El sistema utilizará automáticamente el simulador EVM local y almacenamiento en memoria.\n\n');
  }
}

async function main() {
  await startInfrastructure();

  process.stdout.write('🌐 Iniciando servidor Astro.js SSR en modo desarrollo...\n\n');

  const serverProcess = spawn('npx', ['astro', 'dev', '--port', '4000', '--host'], {
    stdio: 'inherit',
    env: process.env
  });

  const cleanExit = (signal) => {
    try {
      execSync('npx astro dev stop', { stdio: 'ignore' });
    } catch (_) {}
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill(signal);
    }
  };

  process.on('SIGINT', () => {
    cleanExit('SIGINT');
    process.stdout.write('\n💡 Para detener también el nodo Besu en segundo plano ejecute: npm run besu:down\n');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanExit('SIGTERM');
    process.exit(0);
  });

  serverProcess.on('exit', (code) => {
    process.exit(code || 0);
  });
}

main().catch(err => {
  console.error('Error al iniciar el entorno de desarrollo:', err);
  process.exit(1);
});
