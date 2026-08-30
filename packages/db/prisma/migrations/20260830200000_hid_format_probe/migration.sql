-- Resultado del sondeo de formatos contra el lector real: qué entregó ADC para
-- PngImage, Intermediate, Compressed y Raw. Es la evidencia que decide si el
-- sensor no entrega frames a la PC (ningún formato responde) o si el problema
-- es sólo el formato que usa el CRM.
ALTER TYPE "BiometricCaptureStage" ADD VALUE IF NOT EXISTS 'FORMAT_PROBE' AFTER 'ACQUISITION_SILENT';
