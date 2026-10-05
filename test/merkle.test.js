const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const { sha256 } = require('../src/core/crypto');
const {
  buildMerkleTree,
  getMerkleProof,
  verifyMerkleProof,
  hashCredential
} = require('../src/core/merkle');

describe('Árbol de Merkle y Pruebas Criptográficas de Inclusión', () => {
  it('Debe construir un árbol de Merkle a partir de hashes de hojas y generar la raíz', () => {
    const leaves = [
      sha256('Título 1').toString('hex'),
      sha256('Título 2').toString('hex'),
      sha256('Título 3').toString('hex'),
      sha256('Título 4').toString('hex')
    ];

    const tree = buildMerkleTree(leaves);

    assert.ok(tree.root.startsWith('0x'));
    assert.strictEqual(tree.leafCount, 4);
    assert.strictEqual(tree.levels.length, 3); // hojas -> nivel intermedio -> raíz
  });

  it('Debe generar y verificar pruebas de inclusión de Merkle para cada hoja', () => {
    const leaves = [
      sha256('Juan Perez - Computacion').toString('hex'),
      sha256('Sofia Rossi - Medicina').toString('hex'),
      sha256('Mariano Fernandez - Derecho').toString('hex'),
      sha256('Camila Morales - Ingenieria').toString('hex'),
      sha256('Tomas Benitez - Datos').toString('hex') // Impar para probar balanceo
    ];

    const tree = buildMerkleTree(leaves);

    for (let i = 0; i < leaves.length; i++) {
      const proof = getMerkleProof(tree, i);
      assert.ok(Array.isArray(proof));
      assert.ok(proof.length > 0);

      const isValid = verifyMerkleProof(leaves[i], proof, tree.root);
      assert.strictEqual(isValid, true, `La prueba de inclusión para la hoja ${i} debe ser matemáticamente válida`);
    }
  });

  it('Debe rechazar la prueba si la hoja o el camino fueron adulterados', () => {
    const leaves = [
      sha256('Título Legítimo A').toString('hex'),
      sha256('Título Legítimo B').toString('hex')
    ];
    const tree = buildMerkleTree(leaves);
    const proof = getMerkleProof(tree, 0);

    const fakeLeaf = sha256('Título Falso No Registrado').toString('hex');
    const isValid = verifyMerkleProof(fakeLeaf, proof, tree.root);

    assert.strictEqual(isValid, false, 'No debe validar una hoja adulterada contra la raíz');
  });

  it('Debe hashear credenciales completas de forma determinista', () => {
    const vc1 = { id: 'urn:uuid:123', credentialSubject: { name: 'Lucas' } };
    const vc2 = { credentialSubject: { name: 'Lucas' }, id: 'urn:uuid:123' };

    const hash1 = hashCredential(vc1);
    const hash2 = hashCredential(vc2);

    assert.strictEqual(hash1, hash2, 'El hash debe ser idéntico independientemente del orden de claves');
    assert.ok(hash1.startsWith('0x'));
  });
});
