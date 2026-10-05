-- ==============================================================================
-- Universidad de Buenos Aires (UBA) - Sistema de Títulos Universitarios
-- Esquema de Persistencia PostgreSQL con soporte nativo JSONB
-- Compatible con SIU Guaraní y estándares W3C Verifiable Credentials 2.0
-- ==============================================================================

-- 1. Claves Institucionales HSM (Ed25519)
CREATE TABLE IF NOT EXISTS institutional_keys (
    id VARCHAR(64) PRIMARY KEY,
    key_id VARCHAR(64) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    public_key_multibase TEXT NOT NULL,
    public_key_pem TEXT NOT NULL,
    private_key_pem TEXT NOT NULL,
    raw_public_key_hex TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Configuración del sistema (ej: dirección del contrato MerkleAnchorRegistry desplegado)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. W3C Bitstring Status List v1.0 (Revocaciones institucionales fuera de cadena)
CREATE TABLE IF NOT EXISTS revocation_status_list (
    id INT PRIMARY KEY,
    size_in_bits INT NOT NULL DEFAULT 100000,
    buffer_data BYTEA NOT NULL,
    next_status_index INT NOT NULL DEFAULT 100,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Base Académica SIU Guaraní (Egresados confirmados)
CREATE TABLE IF NOT EXISTS graduates (
    id VARCHAR(64) PRIMARY KEY,
    dni VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    degree_name VARCHAR(255) NOT NULL,
    faculty VARCHAR(255) NOT NULL,
    achievement_type VARCHAR(64) NOT NULL DEFAULT 'BachelorDegree',
    graduation_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMADO',
    book_number VARCHAR(64),
    folio VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Títulos Verificables Emitidos (Almacenamiento JSONB de la Credencial y Pruebas Merkle)
CREATE TABLE IF NOT EXISTS issued_credentials (
    id VARCHAR(128) PRIMARY KEY,
    graduate_id VARCHAR(64) REFERENCES graduates(id) ON DELETE SET NULL,
    status_index INT NOT NULL,
    leaf_hash VARCHAR(66) NOT NULL,
    is_anchored BOOLEAN NOT NULL DEFAULT FALSE,
    batch_id VARCHAR(128),
    merkle_root VARCHAR(66),
    merkle_proof JSONB,
    anchor_receipt JSONB,
    credential_json JSONB NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credentials_graduate ON issued_credentials(graduate_id);
CREATE INDEX IF NOT EXISTS idx_credentials_leaf_hash ON issued_credentials(leaf_hash);
CREATE INDEX IF NOT EXISTS idx_credentials_merkle_root ON issued_credentials(merkle_root);
CREATE INDEX IF NOT EXISTS idx_credentials_status_index ON issued_credentials(status_index);
CREATE INDEX IF NOT EXISTS idx_credentials_jsonb ON issued_credentials USING gin (credential_json);

-- 5. Registro Histórico de Lotes Anclados en Blockchain (Hyperledger Besu / BFA)
CREATE TABLE IF NOT EXISTS anchor_batches (
    batch_id VARCHAR(128) PRIMARY KEY,
    merkle_root VARCHAR(66) NOT NULL,
    credential_count INT NOT NULL,
    leaf_hashes JSONB NOT NULL,
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    consensus VARCHAR(64),
    anchored_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Datos semilla iniciales del Sistema Académico SIU Guaraní (si la tabla está vacía)
INSERT INTO graduates (id, dni, name, degree_name, faculty, achievement_type, graduation_date, status, book_number, folio)
VALUES
  ('grad-001', '38123456', 'Juan Ignacio Pérez', 'Licenciatura en Ciencias de la Computación', 'Facultad de Ciencias Exactas y Naturales', 'BachelorDegree', '2026-11-20', 'CONFIRMADO', 'Libro 142', 'Folio 88'),
  ('grad-002', '39456789', 'Dra. Sofía Victoria Rossi', 'Médica', 'Facultad de Medicina', 'MasterDegree', '2026-10-15', 'CONFIRMADO', 'Libro 210', 'Folio 12'),
  ('grad-003', '36789123', 'Mariano Agustín Fernández', 'Abogado', 'Facultad de Derecho', 'BachelorDegree', '2026-09-30', 'CONFIRMADO', 'Libro 98', 'Folio 405'),
  ('grad-004', '40112233', 'Camila Lucía Morales', 'Ingeniería en Informática', 'Facultad de Ingeniería', 'BachelorDegree', '2026-12-05', 'CONFIRMADO', 'Libro 305', 'Folio 19'),
  ('grad-005', '37554433', 'Lic. Lucas Manuel Giménez', 'Licenciatura en Economía', 'Facultad de Ciencias Económicas', 'BachelorDegree', '2026-11-10', 'CONFIRMADO', 'Libro 512', 'Folio 77')
ON CONFLICT (id) DO NOTHING;
