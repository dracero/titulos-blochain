export const prerender = false;
import { getAppContext } from '../../../lib/app-context.js';

export async function GET() {
  const ctx = await getAppContext();
  const graduates = ctx.academicDb.getAllGraduates();
  const result = graduates.map(g => {
    const issued = Array.from(ctx.issuedCredentials.values()).find(
      item => item.credential.credentialSubject.graduate.name === g.name
    );
    return {
      ...g,
      hasIssuedDegree: !!issued,
      credentialId: issued ? issued.credential.id : null
    };
  });

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function POST({ request }) {
  try {
    const ctx = await getAppContext();
    const body = await request.json();
    const newGrad = ctx.academicDb.addGraduate(body);
    await ctx.db.saveGraduate(newGrad);
    return new Response(JSON.stringify(newGrad), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
