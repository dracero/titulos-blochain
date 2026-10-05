export const prerender = false;
import { getAppContext, buildMerkleTree, getMerkleProof } from '../../../lib/app-context.js';

export async function POST() {
  try {
    const ctx = await getAppContext();
    const pendingRecords = Array.from(ctx.issuedCredentials.values()).filter(r => !r.isAnchored);

    if (pendingRecords.length === 0) {
      return new Response(JSON.stringify({
        error: 'No hay títulos pendientes de anclaje. Emita nuevos títulos primero.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const leaves = pendingRecords.map(r => r.leafHash);
    const tree = buildMerkleTree(leaves);
    const batchId = `LOTE-UBA-2026-N${ctx.currentBatchCounter++}`;

    const receipt = await ctx.anchorService.anchorMerkleRoot(
      tree.root,
      batchId,
      pendingRecords.length,
      `Títulos emitidos por UBA - ${pendingRecords.length} diplomas`
    );

    for (let idx = 0; idx < pendingRecords.length; idx++) {
      const record = pendingRecords[idx];
      const proof = getMerkleProof(tree, idx);
      record.isAnchored = true;
      record.batchId = batchId;
      record.merkleRoot = tree.root;
      record.merkleProof = proof;
      record.anchorReceipt = receipt;

      await ctx.db.updateCredentialAnchor(record.id, {
        batchId,
        merkleRoot: tree.root,
        merkleProof: proof,
        anchorReceipt: receipt
      });
    }

    await ctx.db.saveAnchorBatch({
      batchId,
      merkleRoot: tree.root,
      credentialCount: pendingRecords.length,
      leafHashes: leaves,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      consensus: receipt.consensus,
      timestamp: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      batchId,
      merkleRoot: tree.root,
      totalTítulos: pendingRecords.length,
      receipt,
      network: ctx.anchorService.networkName
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
