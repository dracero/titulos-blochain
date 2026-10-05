export const prerender = false;
import { getAppContext, createDegreeCredential, signCredential, hashCredential } from '../../../lib/app-context.js';

export async function POST({ request }) {
  try {
    const ctx = await getAppContext();
    const body = await request.json();
    const { graduateId } = body;

    const graduate = ctx.academicDb.getGraduate(graduateId);
    if (!graduate) {
      return new Response(JSON.stringify({ error: 'Graduado no encontrado en sistema académico' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const assignedIndex = ctx.nextStatusIndex++;
    const url = new URL(request.url);
    const statusUrl = `${url.protocol}//${url.host}/estado/1`;

    const unsignedVc = createDegreeCredential({
      issuerDid: ctx.didManager.did,
      issuerName: 'Universidad de Buenos Aires',
      degreeName: graduate.degreeName,
      achievementType: graduate.achievementType,
      graduateName: graduate.name,
      graduateDni: graduate.dni,
      faculty: graduate.faculty,
      graduationDate: graduate.graduationDate,
      statusIndex: assignedIndex,
      statusCredentialUrl: statusUrl
    });

    const signedVc = signCredential(
      unsignedVc,
      ctx.hsmKeys.privateKeyPem,
      ctx.didManager.getVerificationMethodId()
    );

    const leafHash = hashCredential(signedVc);

    const record = {
      id: signedVc.id,
      credential: signedVc,
      statusIndex: assignedIndex,
      leafHash,
      graduateId,
      issuedAt: new Date().toISOString(),
      isAnchored: false,
      batchId: null,
      merkleProof: null,
      merkleRoot: null
    };

    ctx.issuedCredentials.set(signedVc.id, record);
    await ctx.db.saveIssuedCredential(record);
    await ctx.db.saveStatusList(ctx.statusList.buffer, ctx.nextStatusIndex);

    return new Response(JSON.stringify({
      success: true,
      message: 'Título universitario emitido y firmado con éxito',
      credential: signedVc,
      leafHash,
      statusIndex: assignedIndex
    }), {
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
