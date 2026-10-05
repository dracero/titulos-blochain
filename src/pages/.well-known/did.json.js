export const prerender = false;
import { getAppContext } from '../../lib/app-context.js';

export async function GET() {
  const ctx = await getAppContext();
  return new Response(JSON.stringify(ctx.didManager.getDidDocument(), null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
