export const prerender = false;
import { getAppContext } from '../../../lib/app-context.js';

export async function GET() {
  const ctx = await getAppContext();
  const list = Array.from(ctx.issuedCredentials.values()).map(r => ({
    id: r.id,
    graduateName: r.credential.credentialSubject.graduate.name,
    degreeName: r.credential.credentialSubject.achievement.name,
    faculty: r.credential.credentialSubject.graduate.faculty,
    statusIndex: r.statusIndex,
    isRevoked: ctx.statusList.isRevoked(r.statusIndex),
    isAnchored: r.isAnchored,
    batchId: r.batchId,
    merkleRoot: r.merkleRoot,
    leafHash: r.leafHash,
    issuedAt: r.issuedAt
  }));

  return new Response(JSON.stringify(list), {
    headers: { 'Content-Type': 'application/json' }
  });
}
