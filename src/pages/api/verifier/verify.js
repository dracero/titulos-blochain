export const prerender = false;
import { getAppContext } from '../../../lib/app-context.js';

export async function POST({ request }) {
  try {
    const ctx = await getAppContext();
    const body = await request.json();
    const { credential, merkleProof, merkleRoot, skipBlockchain } = body;

    let finalProof = merkleProof;
    let finalRoot = merkleRoot;

    if (!finalProof && credential && credential.id) {
      const localRecord = ctx.issuedCredentials.get(credential.id);
      if (localRecord && localRecord.merkleProof) {
        finalProof = localRecord.merkleProof;
        finalRoot = localRecord.merkleRoot;
      }
    }

    const report = await ctx.verifier.verify({
      credential,
      merkleProof: finalProof,
      merkleRoot: finalRoot,
      skipBlockchain: !!skipBlockchain
    });

    return new Response(JSON.stringify(report), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
