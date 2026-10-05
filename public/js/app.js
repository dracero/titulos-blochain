/**
 * Controlador de Interfaz de Usuario para el Entorno de Test UBA
 */

document.addEventListener('DOMContentLoaded', () => {
  // Estado local
  let currentCredentials = [];
  let currentGraduates = [];
  let selectedCredentialId = null;

  // Inicialización
  initNavigation();
  initBlockchainStatus();
  loadGraduates();
  loadIssuedCredentials();
  loadScenarios();

  // Escuchar eventos
  setupEventHandlers();

  // =========================================================================
  // NAVEGACIÓN ENTRE TABS
  // =========================================================================
  function initNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetViewId = `view-${tab.dataset.tab}`;
        
        // Cambiar clases activas en tabs
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Cambiar vistas
        document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
        const targetView = document.getElementById(targetViewId);
        if (targetView) targetView.classList.add('active');

        // Si se abre el tab de anclaje o graduado, refrescar datos
        if (tab.dataset.tab === 'anchor') refreshAnchorView();
        if (tab.dataset.tab === 'graduate') refreshGraduateView();
      });
    });

    // Sub-tabs en el visor del graduado
    document.querySelectorAll('.sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const targetContent = document.getElementById(btn.dataset.sub);
        if (targetContent) targetContent.classList.add('active');
      });
    });
  }

  // =========================================================================
  // ESTADO DE BLOCKCHAIN (HEADER Y RESUMEN)
  // =========================================================================
  async function initBlockchainStatus() {
    try {
      const status = await Api.getBlockchainStatus();
      const netNameEl = document.getElementById('net-name');
      const netBlockEl = document.getElementById('net-block');
      const bcNetEl = document.getElementById('bc-network');
      const bcContractEl = document.getElementById('bc-contract');
      const diagAnchorCount = document.getElementById('diag-anchor-count');

      if (netNameEl) netNameEl.textContent = status.network;
      if (netBlockEl) netBlockEl.textContent = `#${status.currentBlockNumber}`;
      if (bcNetEl) bcNetEl.textContent = status.network;
      if (bcContractEl && status.contractAddress) bcContractEl.textContent = status.contractAddress;
      if (diagAnchorCount) diagAnchorCount.textContent = `${status.totalAnchors || 0} raíces ancladas`;
    } catch (err) {
      console.warn('No se pudo obtener el estado de la blockchain:', err);
    }
  }

  // =========================================================================
  // GESTIÓN DE GRADUADOS Y EMISIÓN (UBA)
  // =========================================================================
  async function loadGraduates() {
    try {
      currentGraduates = await Api.getGraduates();
      const listEl = document.getElementById('graduates-list');
      const countEl = document.getElementById('graduates-count');
      if (countEl) countEl.textContent = `${currentGraduates.length} graduados`;

      if (!listEl) return;
      listEl.innerHTML = '';

      currentGraduates.forEach(g => {
        const item = document.createElement('div');
        item.className = 'item-card';
        item.innerHTML = `
          <div class="item-main">
            <h4>${escapeHtml(g.name)}</h4>
            <div class="item-meta">
              <span><strong>Título:</strong> ${escapeHtml(g.degreeName)}</span>
              <span><strong>Facultad:</strong> ${escapeHtml(g.faculty)}</span>
              <span><strong>DNI:</strong> ${escapeHtml(g.dni)}</span>
              <span><strong>Egreso:</strong> ${escapeHtml(g.graduationDate)}</span>
            </div>
          </div>
          <div class="item-actions">
            ${g.hasIssuedDegree 
              ? `<span class="badge-success">Título Emitido</span>`
              : `<button class="btn btn-primary btn-small btn-issue" data-id="${g.id}">Emitir Título</button>`
            }
          </div>
        `;
        listEl.appendChild(item);
      });

      // Vincular botones de emisión
      listEl.querySelectorAll('.btn-issue').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Emitiendo...';
          try {
            await Api.issueDegree(btn.dataset.id);
            await loadGraduates();
            await loadIssuedCredentials();
          } catch (err) {
            alert('Error al emitir el título: ' + err.message);
            btn.disabled = false;
            btn.textContent = 'Emitir Título';
          }
        });
      });
    } catch (err) {
      console.error('Error al cargar graduados:', err);
    }
  }

  async function loadIssuedCredentials() {
    try {
      currentCredentials = await Api.getCredentials();
      const listEl = document.getElementById('issued-credentials-list');
      const countEl = document.getElementById('issued-count');
      const batchContainer = document.getElementById('batch-action-container');
      const pendingCountEl = document.getElementById('pending-anchor-count');

      if (countEl) countEl.textContent = `${currentCredentials.length} emitidos`;

      const pendingAnchors = currentCredentials.filter(c => !c.isAnchored);
      if (batchContainer) {
        batchContainer.style.display = pendingAnchors.length > 0 ? 'flex' : 'none';
        if (pendingCountEl) pendingCountEl.textContent = pendingAnchors.length;
      }

      if (!listEl) return;
      listEl.innerHTML = '';

      if (currentCredentials.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No hay títulos emitidos aún. Emita uno desde la lista de la izquierda.</div>';
        return;
      }

      currentCredentials.forEach(c => {
        const item = document.createElement('div');
        item.className = 'item-card';
        item.innerHTML = `
          <div class="item-main">
            <h4>${escapeHtml(c.graduateName)}</h4>
            <div class="item-meta">
              <span><strong>Título:</strong> ${escapeHtml(c.degreeName)}</span>
              <span><strong>Índice Estado:</strong> #${c.statusIndex}</span>
              ${c.isRevoked 
                ? `<span class="badge-danger">REVOCADO</span>` 
                : `<span class="badge-success">VIGENTE</span>`
              }
              ${c.isAnchored 
                ? `<span class="badge-info">Anclado en Besu</span>` 
                : `<span class="badge-warning">Pendiente Anclaje</span>`
              }
            </div>
          </div>
          <div class="item-actions">
            ${c.isRevoked
              ? `<button class="btn btn-secondary btn-small btn-unrevoke" data-id="${c.id}" data-idx="${c.statusIndex}">Restituir</button>`
              : `<button class="btn btn-danger btn-small btn-revoke" data-id="${c.id}" data-idx="${c.statusIndex}">Revocar</button>`
            }
            <button class="btn btn-secondary btn-small btn-view-diploma" data-id="${c.id}">Ver Título 🎓</button>
          </div>
        `;
        listEl.appendChild(item);
      });

      // Vincular eventos de revocar / restituir / ver
      listEl.querySelectorAll('.btn-revoke').forEach(btn => {
        btn.addEventListener('click', async () => {
          await Api.revoke(btn.dataset.id, btn.dataset.idx);
          await loadIssuedCredentials();
        });
      });

      listEl.querySelectorAll('.btn-unrevoke').forEach(btn => {
        btn.addEventListener('click', async () => {
          await Api.unrevoke(btn.dataset.id, btn.dataset.idx);
          await loadIssuedCredentials();
        });
      });

      listEl.querySelectorAll('.btn-view-diploma').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedCredentialId = btn.dataset.id;
          document.getElementById('tab-btn-grad').click();
        });
      });

      // Actualizar selectores en otras pestañas
      updateCredentialSelectors();
    } catch (err) {
      console.error('Error al cargar títulos emitidos:', err);
    }
  }

  function updateCredentialSelectors() {
    const selGrad = document.getElementById('select-credential-view');
    const selVerif = document.getElementById('select-verifier-preset');

    const optionsHtml = currentCredentials.map(c => 
      `<option value="${c.id}">${escapeHtml(c.graduateName)} - ${escapeHtml(c.degreeName)} (#${c.statusIndex})</option>`
    ).join('');

    if (selGrad) selGrad.innerHTML = optionsHtml;
    if (selVerif) {
      selVerif.innerHTML = '<option value="">-- Seleccionar título emitido --</option>' + optionsHtml;
    }

    if (selectedCredentialId && selGrad) {
      selGrad.value = selectedCredentialId;
    }
  }

  // =========================================================================
  // VISTA DE ANCLAJE EN BLOCKCHAIN & MERKLE TREE
  // =========================================================================
  async function refreshAnchorView() {
    await initBlockchainStatus();
    renderMerkleTree();
  }

  async function renderMerkleTree() {
    const visualizer = document.getElementById('merkle-visualizer');
    if (!visualizer) return;

    const anchoredRecords = currentCredentials.filter(c => c.isAnchored);
    if (anchoredRecords.length === 0) {
      visualizer.innerHTML = '<div class="empty-state">No se ha anclado ningún lote aún. Emita títulos y presione "Anclar Lote Pendiente en Blockchain".</div>';
      return;
    }

    // Tomar el lote más reciente
    const latestBatch = anchoredRecords[anchoredRecords.length - 1];
    document.getElementById('bc-latest-root').textContent = latestBatch.merkleRoot;
    if (latestBatch.anchorReceipt) {
      document.getElementById('bc-latest-block').textContent = `#${latestBatch.anchorReceipt.blockNumber}`;
      document.getElementById('bc-latest-tx').textContent = truncateHex(latestBatch.anchorReceipt.transactionHash);
    }

    visualizer.innerHTML = `
      <div style="text-align: center; margin-bottom: 0.5rem;">
        <span class="badge-neutral">Lote: <strong>${escapeHtml(latestBatch.batchId)}</strong></span>
      </div>
      <div class="merkle-level">
        <div class="merkle-node root-node">
          <div>👑 RAÍZ DE MERKLE (32 bytes)</div>
          <div>${truncateHex(latestBatch.merkleRoot, 14)}</div>
        </div>
      </div>
      <div style="text-align: center; color: var(--text-dim); font-size: 0.8rem;">⬆️ Hash SHA-256 de ramas intermedias ⬆️</div>
      <div class="merkle-level" style="flex-wrap: wrap;">
        ${anchoredRecords.map(r => `
          <div class="merkle-node leaf-node">
            <div>🍃 Título #${r.statusIndex}</div>
            <div>${escapeHtml(r.graduateName.split(' ')[0])}</div>
            <div style="font-size: 0.65rem; color: var(--text-dim);">${truncateHex(r.leafHash, 10)}</div>
          </div>
        `).join('')}
      </div>
    `;

    // Historial
    const historyList = document.getElementById('batch-history-list');
    if (historyList) {
      historyList.innerHTML = `
        <div class="item-card">
          <div class="item-main">
            <h4>${escapeHtml(latestBatch.batchId)}</h4>
            <div class="item-meta">
              <span><strong>Raíz:</strong> ${truncateHex(latestBatch.merkleRoot, 12)}</span>
              <span><strong>Títulos:</strong> ${anchoredRecords.length}</span>
              <span><strong>Consenso:</strong> QBFT / PoA ($0 gas)</span>
            </div>
          </div>
          <span class="badge-success">Confirmado</span>
        </div>
      `;
    }
  }

  // =========================================================================
  // VISTA DEL GRADUADO (DIPLOMA Y BILLETERA)
  // =========================================================================
  async function refreshGraduateView() {
    const selGrad = document.getElementById('select-credential-view');
    const credId = (selGrad && selGrad.value) || selectedCredentialId || (currentCredentials[0] && currentCredentials[0].id);
    if (!credId) return;

    try {
      const record = await Api.getCredential(credId);
      const vc = record.credential;
      const subj = vc.credentialSubject;
      const grad = subj.graduate;
      const ach = subj.achievement;

      // Renderizar Diploma UBA
      document.getElementById('diploma-name').textContent = (grad.name || 'Graduado UBA').toUpperCase();
      document.getElementById('diploma-degree').textContent = ach.name || 'Licenciatura';
      document.getElementById('diploma-faculty').textContent = grad.faculty || 'Facultad de Ciencias Exactas y Naturales';
      document.getElementById('diploma-date').textContent = grad.graduationDate || vc.validFrom.split('T')[0];
      document.getElementById('diploma-issuer').textContent = vc.issuer.id || 'did:web:uba.ar';

      const anchorStatusEl = document.getElementById('diploma-anchor-status');
      if (record.isAnchored) {
        anchorStatusEl.textContent = `Anclado en Besu/BFA (${escapeHtml(record.batchId)})`;
        anchorStatusEl.className = 'diploma-meta-txt text-success';
      } else {
        anchorStatusEl.textContent = 'Pendiente de anclaje (Válido por firma did:web)';
        anchorStatusEl.className = 'diploma-meta-txt text-gold';
      }

      // Código QR
      const qrData = await Api.getQr(record.id);
      const qrImg = document.getElementById('diploma-qr-img');
      if (qrImg && qrData.qrDataUrl) {
        qrImg.src = qrData.qrDataUrl;
      }

      // JSON-LD VC
      const jsonEl = document.getElementById('code-vc-json');
      if (jsonEl) {
        jsonEl.textContent = JSON.stringify(vc, null, 2);
      }

      // Merkle Proof
      const proofEl = document.getElementById('proof-inspection-box');
      if (proofEl) {
        if (!record.merkleProof || record.merkleProof.length === 0) {
          proofEl.innerHTML = '<div class="empty-state">Este título aún no fue anclado en la blockchain. Visite la pestaña "Merkle & Blockchain" para registrar el lote.</div>';
        } else {
          proofEl.innerHTML = `
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
              Camino de hermanos (Sibling hashes) que conectan el hash de este diploma con la raíz:
            </div>
            <div class="merkle-proof-steps">
              <div class="meta-row">
                <span class="meta-name">Hash Hoja (Diploma):</span>
                <span class="meta-val code-font">${truncateHex(record.leafHash, 16)}</span>
              </div>
              ${record.merkleProof.map((step, idx) => `
                <div class="meta-row">
                  <span class="meta-name">Paso ${idx + 1} (${step.position}):</span>
                  <span class="meta-val code-font">${truncateHex(step.hash, 16)}</span>
                </div>
              `).join('')}
              <div class="meta-row" style="border-top: 1px solid var(--uba-gold); padding-top: 0.5rem; margin-top: 0.5rem;">
                <span class="meta-name text-gold">Raíz Anclada en Blockchain:</span>
                <span class="meta-val code-font text-gold">${truncateHex(record.merkleRoot, 16)}</span>
              </div>
            </div>
          `;
        }
      }
    } catch (err) {
      console.error('Error al cargar datos del título para el graduado:', err);
    }
  }

  // =========================================================================
  // PORTAL PÚBLICO DE VERIFICACIÓN (4 NIVELES)
  // =========================================================================
  async function runVerification() {
    const inputEl = document.getElementById('verifier-json-input');
    const skipBcEl = document.getElementById('check-skip-blockchain');
    const badgeEl = document.getElementById('overall-badge');
    const bannerEl = document.getElementById('overall-summary-banner');
    const bannerIcon = document.getElementById('summary-icon');
    const bannerText = document.getElementById('summary-text');

    let credential;
    try {
      credential = JSON.parse(inputEl.value.trim());
    } catch (err) {
      alert('El contenido ingresado no es un JSON válido.');
      return;
    }

    badgeEl.textContent = 'Verificando...';
    badgeEl.className = 'badge-info';

    try {
      const report = await Api.verify({
        credential,
        skipBlockchain: skipBcEl ? skipBcEl.checked : false
      });

      // Actualizar Banner General
      bannerEl.style.display = 'flex';
      if (report.isValid) {
        bannerEl.className = 'overall-summary-banner success';
        badgeEl.textContent = 'VÁLIDO Y AUTÉNTICO';
        badgeEl.className = 'badge-success';
        bannerIcon.textContent = '✅';
        bannerText.textContent = report.summary;
      } else {
        bannerEl.className = 'overall-summary-banner danger';
        badgeEl.textContent = 'RECHAZADO';
        badgeEl.className = 'badge-danger';
        bannerIcon.textContent = '❌';
        bannerText.textContent = report.summary;
      }

      // Renderizar los 4 pasos
      renderStep('did', report.steps.didWeb);
      renderStep('sig', report.steps.signature);
      renderStep('status', report.steps.statusList);
      renderStep('anchor', report.steps.blockchainAnchor);

    } catch (err) {
      alert('Error al verificar: ' + err.message);
      badgeEl.textContent = 'ERROR';
      badgeEl.className = 'badge-danger';
    }
  }

  function renderStep(stepKey, stepData) {
    const card = document.getElementById(`step-card-${stepKey}`);
    const statusEl = document.getElementById(`status-step-${stepKey}`);
    const bodyEl = document.getElementById(`body-step-${stepKey}`);
    if (!card || !statusEl || !bodyEl) return;

    card.className = 'step-card';
    if (stepData.status === 'PASSED') {
      card.classList.add('passed');
      statusEl.textContent = '✅ APROBADO';
    } else if (stepData.status === 'FAILED' || stepData.status === 'REVOKED') {
      card.classList.add('failed');
      statusEl.textContent = stepData.status === 'REVOKED' ? '❌ REVOCADO' : '❌ INVÁLIDO';
    } else if (stepData.status === 'SKIPPED' || stepData.status === 'WARNING') {
      card.classList.add('skipped');
      statusEl.textContent = '⚠️ OMITIDO / AVISO';
    } else {
      statusEl.textContent = '⚪ PENDIENTE';
    }

    bodyEl.textContent = stepData.details || '';
  }

  // =========================================================================
  // SANDBOX DE RIESGOS Y ATAQUES (SECCIÓN 9)
  // =========================================================================
  async function loadScenarios() {
    try {
      const scenarios = await Api.getScenarios();
      const container = document.getElementById('scenarios-container');
      if (!container) return;

      container.innerHTML = '';
      scenarios.forEach(sc => {
        const card = document.createElement('div');
        card.className = 'scenario-card';
        card.innerHTML = `
          <div>
            <div class="scenario-category">${escapeHtml(sc.category)}</div>
            <h3>${escapeHtml(sc.name)}</h3>
            <p>${escapeHtml(sc.description)}</p>
          </div>
          <div>
            <div class="scenario-expected">
              <strong>Resultado Esperado:</strong> ${escapeHtml(sc.expectedResult)}
            </div>
            <button class="btn btn-primary btn-block btn-small mt-3 btn-run-scenario" data-id="${sc.id}">
              Ejecutar Prueba ⚡
            </button>
          </div>
        `;
        container.appendChild(card);
      });

      container.querySelectorAll('.btn-run-scenario').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Probando...';
          try {
            const res = await Api.runScenario(btn.dataset.id);
            displayScenarioResult(res);
          } catch (err) {
            alert('Error en la prueba: ' + err.message);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Ejecutar Prueba ⚡';
          }
        });
      });
    } catch (err) {
      console.error('Error al cargar escenarios:', err);
    }
  }

  function displayScenarioResult(res) {
    const box = document.getElementById('scenario-result-box');
    const pill = document.getElementById('scenario-result-pill');
    const expBox = document.getElementById('scenario-explanation');
    const breakdown = document.getElementById('scenario-steps-breakdown');
    if (!box) return;

    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth' });

    const rep = res.verificationReport;
    if (rep.isValid) {
      pill.textContent = 'Verificación Exitosa';
      pill.className = 'badge-success';
    } else {
      pill.textContent = rep.summary;
      pill.className = 'badge-danger';
    }

    expBox.innerHTML = `<strong>Justificación Técnica (Sección 9):</strong> ${escapeHtml(res.scenarioExplanation)}`;

    breakdown.innerHTML = `
      <div class="meta-row">
        <span>1. did:web:</span>
        <span class="${rep.steps.didWeb.status === 'PASSED' ? 'text-success' : 'badge-danger'}">${rep.steps.didWeb.status}</span>
      </div>
      <div class="meta-row">
        <span>2. Firma Ed25519:</span>
        <span class="${rep.steps.signature.status === 'PASSED' ? 'text-success' : 'badge-danger'}">${rep.steps.signature.status}</span>
      </div>
      <div class="meta-row">
        <span>3. Lista Revocación:</span>
        <span class="${rep.steps.statusList.status === 'PASSED' ? 'text-success' : 'badge-danger'}">${rep.steps.statusList.status}</span>
      </div>
      <div class="meta-row">
        <span>4. Ancla Blockchain:</span>
        <span class="${rep.steps.blockchainAnchor.status === 'PASSED' || rep.steps.blockchainAnchor.status === 'SKIPPED' ? 'text-success' : 'badge-danger'}">${rep.steps.blockchainAnchor.status}</span>
      </div>
    `;
  }

  // =========================================================================
  // LISTENERS GLOBALES
  // =========================================================================
  function setupEventHandlers() {
    // Botón refrescar graduados
    const btnRefGrad = document.getElementById('btn-refresh-graduates');
    if (btnRefGrad) btnRefGrad.addEventListener('click', loadGraduates);

    // Botón agregar nuevo graduado
    const btnAddGrad = document.getElementById('btn-add-graduate');
    if (btnAddGrad) {
      btnAddGrad.addEventListener('click', async () => {
        const name = document.getElementById('new-grad-name').value.trim();
        const dni = document.getElementById('new-grad-dni').value.trim();
        const faculty = document.getElementById('new-grad-faculty').value;
        const degree = document.getElementById('new-grad-degree').value.trim();

        if (!name || !dni || !degree) {
          alert('Por favor complete todos los campos');
          return;
        }

        await Api.addGraduate({ name, dni, faculty, degreeName: degree });
        document.getElementById('new-grad-name').value = '';
        document.getElementById('new-grad-dni').value = '';
        document.getElementById('new-grad-degree').value = '';
        await loadGraduates();
      });
    }

    // Botón ir a anclaje
    const btnGotoAnchor = document.getElementById('btn-goto-anchor');
    if (btnGotoAnchor) {
      btnGotoAnchor.addEventListener('click', () => {
        document.getElementById('tab-btn-anchor').click();
      });
    }

    // Botón anclar lote pendiente
    const btnDoAnchor = document.getElementById('btn-do-batch-anchor');
    if (btnDoAnchor) {
      btnDoAnchor.addEventListener('click', async () => {
        btnDoAnchor.disabled = true;
        btnDoAnchor.innerHTML = '<span>⏳</span> Anclando en Blockchain...';
        try {
          const res = await Api.batchAnchor();
          alert(`¡Lote anclado con éxito en ${res.network}!\nRaíz Merkle: ${res.merkleRoot}\nTx Hash: ${res.receipt.transactionHash}\nCosto: ${res.receipt.costoTransaccion}`);
          await loadIssuedCredentials();
          await refreshAnchorView();
        } catch (err) {
          alert('Error al anclar lote: ' + err.message);
        } finally {
          btnDoAnchor.disabled = false;
          btnDoAnchor.innerHTML = '<span>⚡</span> Anclar Lote Pendiente en Blockchain';
        }
      });
    }

    // Selector de títulos en visor del graduado
    const selGrad = document.getElementById('select-credential-view');
    if (selGrad) {
      selGrad.addEventListener('change', () => {
        selectedCredentialId = selGrad.value;
        refreshGraduateView();
      });
    }

    // Botón copiar JSON
    const btnCopy = document.getElementById('btn-copy-vc');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const jsonText = document.getElementById('code-vc-json').textContent;
        navigator.clipboard.writeText(jsonText).then(() => {
          btnCopy.textContent = '¡Copiado!';
          setTimeout(() => { btnCopy.textContent = 'Copiar JSON'; }, 1500);
        });
      });
    }

    // Botón enviar a verificador
    const btnSendVerif = document.getElementById('btn-send-to-verifier');
    if (btnSendVerif) {
      btnSendVerif.addEventListener('click', () => {
        const jsonText = document.getElementById('code-vc-json').textContent;
        document.getElementById('verifier-json-input').value = jsonText;
        document.getElementById('tab-btn-verifier').click();
      });
    }

    // Selector de presets en el verificador
    const selVerif = document.getElementById('select-verifier-preset');
    if (selVerif) {
      selVerif.addEventListener('change', async () => {
        if (!selVerif.value) return;
        const record = await Api.getCredential(selVerif.value);
        if (record && record.credential) {
          document.getElementById('verifier-json-input').value = JSON.stringify(record.credential, null, 2);
        }
      });
    }

    // Botón ejecutar verificación
    const btnRunVerif = document.getElementById('btn-run-verification');
    if (btnRunVerif) {
      btnRunVerif.addEventListener('click', runVerification);
    }
  }

  // Helpers
  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function truncateHex(hex, chars = 8) {
    if (!hex) return '';
    if (hex.length <= chars * 2) return hex;
    return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
  }
});
