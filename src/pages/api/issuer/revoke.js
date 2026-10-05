export const prerender = false;
import { getAppContext } from '../../../lib/app-context.js';

export async function POST({ request }) {
  try {
    const ctx = await getAppContext();
    const { credentialId, statusIndex } = await request.json();
    let targetIndex = statusIndex;

    if (credentialId && !targetIndex) {
      const record = ctx.issuedCredentials.get(credentialId);
      if (!record) {
        return new Response(JSON.stringify({ error: 'Credencial no encontrada' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      targetIndex = record.statusIndex;
    }

    ctx.statusList.revoke(targetIndex);
    await ctx.db.saveStatusList(ctx.statusList.buffer, ctx.nextStatusIndex);

    return new Response(JSON.stringify({
      success: true,
      message: `Título con índice ${targetIndex} revocado en Bitstring Status List`,
      statusIndex: targetIndex,
      isRevoked: true
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
