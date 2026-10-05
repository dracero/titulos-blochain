export const prerender = false;
import { getAppContext } from '../../lib/app-context.js';

export async function GET({ params, request }) {
  const ctx = await getAppContext();
  const listId = params.id;
  const url = new URL(request.url);
  const statusUrl = `${url.protocol}//${url.host}/estado/${listId}`;
  
  const credential = ctx.statusList.generateCredential(statusUrl, ctx.didManager.did);
  return new Response(JSON.stringify(credential, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
