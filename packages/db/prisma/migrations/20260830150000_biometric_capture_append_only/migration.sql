-- La bitácora de captura HID es la evidencia de qué pasó en cada intento de
-- huella. Si se pudiera editar o borrar no serviría para auditar nada: se
-- protege igual que audit_events, ledger_entries y access_attempts
-- (pulso_forbid_write, 20260809185900_integrity_constraints).
CREATE TRIGGER biometric_capture_events_append_only
  BEFORE UPDATE OR DELETE ON "biometric_capture_events"
  FOR EACH ROW EXECUTE FUNCTION pulso_forbid_write();
