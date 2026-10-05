export const prerender = false;
import { getAppContext } from '../../../lib/app-context.js';

export async function GET() {
  try {
    const ctx = await getAppContext();
    const status = await ctx.anchorService.getNetworkStatus();
    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
