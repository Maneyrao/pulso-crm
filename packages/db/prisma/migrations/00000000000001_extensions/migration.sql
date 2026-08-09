-- Extensiones necesarias antes de cualquier tabla.
--   pgcrypto    : gen_random_uuid, digest
--   citext      : email y slug case-insensitive sin lower() en cada consulta
--   btree_gist  : requerido por el EXCLUDE que impide membresías solapadas
--   pg_trgm     : búsqueda por nombre con índice
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
