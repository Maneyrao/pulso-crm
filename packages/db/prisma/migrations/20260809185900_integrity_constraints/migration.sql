-- Integridad que Prisma no puede expresar en el schema.
--
-- Todo lo de acá abajo es una garantía a nivel de base. La validación en el
-- servicio existe para dar buenos mensajes de error; la que realmente impide
-- el dato malo es ésta. Ver DATA_MODEL.md §14.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Uniques que deben ser PARCIALES
--    Sin el `WHERE deleted_at IS NULL`, dar de baja a alguien impediría volver
--    a darlo de alta con el mismo email/documento. Eso es un bug de negocio.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX "users_gym_email_active_key"
  ON "users" ("gymId", "email") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "branches_gym_name_active_key"
  ON "branches" ("gymId", "name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "activities_gym_name_active_key"
  ON "activities" ("gymId", "name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "plans_gym_name_active_key"
  ON "plans" ("gymId", "name") WHERE "deletedAt" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Documento único por gimnasio
--    Compuesto con gymId: el mismo DNI puede ser socio de dos gimnasios
--    distintos, y eso tiene que seguir funcionando.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX "members_gym_document_active_key"
  ON "members" ("gymId", "documentType", "documentNumber")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "members_gym_card_active_key"
  ON "members" ("gymId", "cardCode")
  WHERE "cardCode" IS NOT NULL AND "deletedAt" IS NULL;

-- Búsqueda por nombre y por documento con índice.
CREATE INDEX "members_name_trgm_idx"
  ON "members" USING gin (("firstName" || ' ' || "lastName") gin_trgm_ops);
CREATE INDEX "members_document_trgm_idx"
  ON "members" USING gin ("documentNumber" gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Caja: sesiones incompatibles
--    Una caja no puede tener dos sesiones abiertas, y un usuario no puede
--    tener dos cajas abiertas a la vez. Son índices parciales porque las
--    sesiones cerradas históricas sí pueden repetirse.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX "cash_sessions_one_open_per_register"
  ON "cash_sessions" ("cashRegisterId") WHERE "status" = 'OPEN';

CREATE UNIQUE INDEX "cash_sessions_one_open_per_user"
  ON "cash_sessions" ("gymId", "openedByUserId") WHERE "status" = 'OPEN';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Membresías activas solapadas
--    Un socio no puede tener dos membresías activas cubriendo el mismo día.
--    endDate NULL (packs de clases) se trata como infinito.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_no_overlap"
  EXCLUDE USING gist (
    "gymId" WITH =,
    "memberId" WITH =,
    daterange("startDate", COALESCE("endDate" + 1, 'infinity'::date), '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Checks de dominio
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_opening_non_negative" CHECK ("openingAmount" >= 0);

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_closed_has_data" CHECK (
    "status" <> 'CLOSED' OR ("closedAt" IS NOT NULL AND "declaredCash" IS NOT NULL)
  );

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_classes_non_negative" CHECK (
    "classesRemaining" IS NULL OR "classesRemaining" >= 0
  );

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_dates_ordered" CHECK (
    "endDate" IS NULL OR "endDate" >= "startDate"
  );

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_price_non_negative" CHECK ("pricePaid" >= 0);

ALTER TABLE "plans"
  ADD CONSTRAINT "plans_price_non_negative" CHECK ("price" >= 0);

ALTER TABLE "plans"
  ADD CONSTRAINT "plans_classes_positive" CHECK (
    "classesIncluded" IS NULL OR "classesIncluded" > 0
  );

-- Una reversa no puede apuntarse a sí misma.
ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_reversal_not_self" CHECK ("reversalOfId" <> "id");
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_reversal_not_self" CHECK ("reversalOfId" <> "id");

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Append-only
--    Se implementa con triggers y no con REVOKE porque el trigger aplica
--    también al dueño de la base. Un REVOKE no protege contra el rol con el
--    que corren las migraciones, que suele ser el mismo de la aplicación en
--    despliegues chicos.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pulso_forbid_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'La tabla % es append-only: % no está permitido. Corregí con un asiento opuesto.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION pulso_forbid_write();

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION pulso_forbid_write();

CREATE TRIGGER access_attempts_append_only
  BEFORE UPDATE OR DELETE ON "access_attempts"
  FOR EACH ROW EXECUTE FUNCTION pulso_forbid_write();

-- CashMovement es casi append-only: lo único que puede cambiar tras crearse es
-- la marca de revertido, y sólo dentro de la transacción que crea la reversa.
CREATE OR REPLACE FUNCTION pulso_cash_movement_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los movimientos de caja no se borran. Usá una reversa.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF ROW(NEW."gymId", NEW."cashSessionId", NEW."type", NEW."amount",
         NEW."paymentMethodId", NEW."cashConceptId", NEW."memberId",
         NEW."membershipId", NEW."reversalOfId", NEW."createdByUserId",
         NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."gymId", OLD."cashSessionId", OLD."type", OLD."amount",
         OLD."paymentMethodId", OLD."cashConceptId", OLD."memberId",
         OLD."membershipId", OLD."reversalOfId", OLD."createdByUserId",
         OLD."createdAt")
  THEN
    RAISE EXCEPTION
      'Un movimiento de caja es inmutable. Sólo puede marcarse como revertido.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD."isReversed" AND NOT NEW."isReversed" THEN
    RAISE EXCEPTION 'No se puede des-revertir un movimiento.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cash_movements_immutable
  BEFORE UPDATE OR DELETE ON "cash_movements"
  FOR EACH ROW EXECUTE FUNCTION pulso_cash_movement_immutable();
