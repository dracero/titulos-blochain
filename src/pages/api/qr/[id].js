export const prerender = false;
import { getAppContext, QRCode } from '../../../lib/app-context.js';

export async function GET({ params, request }) {
  try {
    const ctx = await getAppContext();
    const id = decodeURIComponent(params.id);
    const record = ctx.issuedCredentials.get(id) || ctx.issuedCredentials.get(params.id);
    if (!record) {
      return new Response(JSON.stringify({ error: 'Credencial no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const verifyUrl = `${url.protocol}//${url.host}/?verifyId=${encodeURIComponent(record.id)}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      margin: 2,
      width: 250,
      color: { dark: '#0c2340', light: '#ffffff' }
    });

    return new Response(JSON.stringify({ qrDataUrl, verifyUrl }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
