-- Etapa nueva: la adquisición quedó armada y ADC no entregó NINGUNA
-- notificación (ni calidad, ni muestra, ni error) mientras el operador apoyaba
-- el dedo. Es la evidencia que separa un problema de driver/ADC/hardware de un
-- problema de código: sin ella, ese intento no deja rastro en ninguna parte.
ALTER TYPE "BiometricCaptureStage" ADD VALUE IF NOT EXISTS 'ACQUISITION_SILENT' AFTER 'ACQUISITION_STARTED';
