export const prerender = false;
import { getAppContext } from '../../../../lib/app-context.js';

export async function GET({ params }) {
  const ctx = await getAppContext();
  const id = decodeURIComponent(params.id);
  const record = ctx.issuedCredentials.get(id) || ctx.issuedCredentials.get(params.id);
  if (!record) {
    return new Response(JSON.stringify({ error: 'Credencial no encontrada' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(record), {
    headers: { 'Content-Type': 'application/json' }
  });
}
