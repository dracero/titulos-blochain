/**
 * Cliente de API para el Entorno de Test de Títulos Verificables UBA
 */

const Api = {
  async getGraduates() {
    const res = await fetch('/api/academic/graduates');
    return res.json();
  },

  async addGraduate(data) {
    const res = await fetch('/api/academic/graduates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async issueDegree(graduateId) {
    const res = await fetch('/api/issuer/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graduateId })
    });
    return res.json();
  },

  async getCredentials() {
    const res = await fetch('/api/issuer/credentials');
    return res.json();
  },

  async getCredential(id) {
    const res = await fetch(`/api/issuer/credential/${encodeURIComponent(id)}`);
    return res.json();
  },

  async batchAnchor() {
    const res = await fetch('/api/issuer/batch-anchor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  },

  async revoke(credentialId, statusIndex) {
    const res = await fetch('/api/issuer/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId, statusIndex })
    });
    return res.json();
  },

  async unrevoke(credentialId, statusIndex) {
    const res = await fetch('/api/issuer/unrevoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId, statusIndex })
    });
    return res.json();
  },

  async getQr(id) {
    const res = await fetch(`/api/qr/${encodeURIComponent(id)}`);
    return res.json();
  },

  async verify(payload) {
    const res = await fetch('/api/verifier/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async getBlockchainStatus() {
    const res = await fetch('/api/blockchain/status');
    return res.json();
  },

  async getScenarios() {
    const res = await fetch('/api/simulation/scenarios');
    return res.json();
  },

  async runScenario(scenarioId) {
    const res = await fetch(`/api/simulation/run/${encodeURIComponent(scenarioId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  }
};

window.Api = Api;
