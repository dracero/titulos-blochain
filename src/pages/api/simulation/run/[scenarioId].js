export const prerender = false;
import { getAppContext, createDegreeCredential, signCredential, hashCredential, buildMerkleTree, getMerkleProof } from '../../../../lib/app-context.js';

export async function POST({ params, request }) {
  try {
    const ctx = await getAppContext();
    const { scenarioId } = params;

    let sampleRecord = Array.from(ctx.issuedCredentials.values()).find(r => r.isAnchored);
    if (!sampleRecord) {
      const grad = ctx.academicDb.getAllGraduates()[0];
      const statusIdx = ctx.nextStatusIndex++;
      const url = new URL(request.url);
      const statusUrl = `${url.protocol}//${url.host}/estado/1`;
      const unsigned = createDegreeCredential({
        issuerDid: ctx.didManager.did,
        issuerName: 'Universidad de Buenos Aires',
        degreeName: grad.degreeName,
        achievementType: grad.achievementType,
        graduateName: grad.name,
        graduateDni: grad.dni,
        faculty: grad.faculty,
        graduationDate: grad.graduationDate,
        statusIndex: statusIdx,
        statusCredentialUrl: statusUrl
      });
      const signed = signCredential(unsigned, ctx.hsmKeys.privateKeyPem, ctx.didManager.getVerificationMethodId());
      const leaf = hashCredential(signed);
      const tree = buildMerkleTree([leaf]);
      await ctx.anchorService.anchorMerkleRoot(tree.root, 'LOTE-TEST-AUTO', 1, 'Lote automático de prueba');
      const proof = getMerkleProof(tree, 0);

      sampleRecord = {
        id: signed.id,
        credential: signed,
        statusIndex: statusIdx,
        leafHash: leaf,
        batchId: 'LOTE-TEST-AUTO',
        merkleRoot: tree.root,
        merkleProof: proof,
        isAnchored: true
      };
      ctx.issuedCredentials.set(signed.id, sampleRecord);
    }

    let testCred = JSON.parse(JSON.stringify(sampleRecord.credential));
    let testProof = sampleRecord.merkleProof;
    let testRoot = sampleRecord.merkleRoot;
    let skipBlockchain = false;
    let scenarioExplanation = '';

    switch (scenarioId) {
      case 'scenario-valid':
        ctx.statusList.unrevoke(sampleRecord.statusIndex);
        scenarioExplanation = 'Demostración del flujo estándar exitoso: did:web resuelve la clave, la firma es matemáticamente perfecta, el estado está vigente en 0, y la prueba de Merkle coincide con el bloque registrado.';
        break;

      case 'scenario-revoked':
        ctx.statusList.revoke(sampleRecord.statusIndex);
        scenarioExplanation = 'La Universidad anuló o reemitió el diploma. El bit correspondiente en la Bitstring Status List pasa a 1. El verificador rechaza la credencial sin necesidad de tocar la blockchain.';
        break;

      case 'scenario-tampered':
        ctx.statusList.unrevoke(sampleRecord.statusIndex);
        testCred.credentialSubject.achievement.name = 'Doctorado de Honor en Inteligencia Artificial';
        scenarioExplanation = 'Un atacante modificó el archivo para asignarse un título superior. La canonicalización y la firma Ed25519 detectan la modificación de un solo caracter y rechazan el título de inmediato.';
        break;

      case 'scenario-retroactive':
        ctx.statusList.unrevoke(sampleRecord.statusIndex);
        testRoot = '0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000';
        scenarioExplanation = 'Se presenta un título que alega haber sido emitido en 2026, pero la raíz no figura en los registros inmutables de BFA/Besu. La prueba de inclusión falla o no existe en la cadena.';
        break;

      case 'scenario-blockchain-offline':
        ctx.statusList.unrevoke(sampleRecord.statusIndex);
        skipBlockchain = true;
        scenarioExplanation = 'El verificador no tiene conexión a internet con el nodo blockchain o la red está en mantenimiento. La verificación de autenticidad y vigencia se completa al 100% mediante did:web y status list.';
        break;

      default:
        return new Response(JSON.stringify({ error: 'Escenario no reconocido' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    const report = await ctx.verifier.verify({
      credential: testCred,
      merkleProof: testProof,
      merkleRoot: testRoot,
      skipBlockchain
    });

    return new Response(JSON.stringify({
      scenarioId,
      scenarioExplanation,
      testCredential: testCred,
      verificationReport: report
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
