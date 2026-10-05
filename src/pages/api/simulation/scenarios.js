export const prerender = false;

export async function GET() {
  const scenarios = [
    {
      id: 'scenario-valid',
      name: 'Caso 1: Título Legítimo y Vigente',
      description: 'Emisión formal UBA, firma institucional válida, vigente en lista de revocación y anclado en Blockchain Besu/BFA.',
      expectedResult: 'VÁLIDO (4 de 4 pasos aprobados)',
      category: 'Flujo Normal'
    },
    {
      id: 'scenario-revoked',
      name: 'Caso 2: Título Revocado / Rectificado',
      description: 'La firma y los datos son auténticos, pero la UBA revocó el título en la lista Bitstring Status List (Sección 2).',
      expectedResult: 'REVOCADO en Paso 3 (Detecta anulación sin modificar blockchain)',
      category: 'Gestión de Estado'
    },
    {
      id: 'scenario-tampered',
      name: 'Caso 3: Título Falsificado / Adulterado',
      description: 'Un graduado o tercero modificó maliciosamente la carrera de "Licenciatura" a "Doctorado" en el JSON.',
      expectedResult: 'INVÁLIDO en Paso 2 (Falla firma criptográfica Ed25519 - Protección contra fraude)',
      category: 'Ciberseguridad y Fraude'
    },
    {
      id: 'scenario-retroactive',
      name: 'Caso 4: Título Retroactivo / Falso Histórico',
      description: 'Simula un diploma con firma simulada que intenta alegar egreso en fecha pasada sin estar en la raíz anclada.',
      expectedResult: 'NO ANCLADO en Paso 4 (La blockchain demuestra que no existía en esa fecha)',
      category: 'Mitigación de Riesgos'
    },
    {
      id: 'scenario-blockchain-offline',
      name: 'Caso 5: Resiliencia ante Caída de Blockchain',
      description: 'Simula indisponibilidad temporal del nodo BFA/Besu. La validación cotidiana sigue siendo 100% operativa por did:web.',
      expectedResult: 'VÁLIDO (Pasos 1 a 3 aprobados; demuestra desacoplamiento de la red)',
      category: 'Alta Disponibilidad'
    }
  ];

  return new Response(JSON.stringify(scenarios), {
    headers: { 'Content-Type': 'application/json' }
  });
}
