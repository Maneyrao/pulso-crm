import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { GLOBAL_MODELS, TENANT_SCOPED_MODELS } from './tenant-extension.js';

/**
 * Guardián del registro de modelos tenant-scoped (ADR-009).
 *
 * `TENANT_SCOPED_MODELS` se mantiene a mano y la extensión de Prisma sólo
 * inyecta/filtra `gymId` en los modelos listados ahí. Un modelo nuevo con
 * columna `gymId` que NO esté en la lista queda SIN aislamiento: sus consultas
 * no filtran por gimnasio y sus escrituras no reciben el tenant de la sesión.
 * Eso es exactamente cómo un gimnasio termina viendo datos de otro, y no falla
 * de forma visible — por eso se verifica contra el schema real (DMMF) y no por
 * revisión humana.
 */

const models = Prisma.dmmf.datamodel.models;

function hasGymId(model: (typeof models)[number]): boolean {
  return model.fields.some((field) => field.name === 'gymId');
}

describe('registro de modelos tenant-scoped', () => {
  it('todo modelo del schema con columna gymId está declarado como tenant-scoped', () => {
    const declared = new Set<string>(TENANT_SCOPED_MODELS);
    const missing = models.filter((model) => hasGymId(model) && !declared.has(model.name));

    expect(
      missing.map((model) => model.name),
      'Modelos con gymId ausentes de TENANT_SCOPED_MODELS: quedan sin aislamiento multi-tenant',
    ).toEqual([]);
  });

  it('ningún modelo declarado tenant-scoped dejó de tener gymId', () => {
    const byName = new Map(models.map((model) => [model.name, model]));
    const broken = TENANT_SCOPED_MODELS.filter((name) => {
      const model = byName.get(name);
      return !model || !hasGymId(model);
    });

    expect(broken, 'Modelos declarados tenant-scoped que ya no existen o perdieron gymId').toEqual(
      [],
    );
  });

  it('los modelos globales no tienen gymId y no se solapan con los tenant-scoped', () => {
    const byName = new Map(models.map((model) => [model.name, model]));
    for (const name of GLOBAL_MODELS) {
      const model = byName.get(name);
      expect(model, `El modelo global ${name} no existe en el schema`).toBeDefined();
      expect(hasGymId(model!), `El modelo global ${name} tiene gymId`).toBe(false);
    }
    const declared = new Set<string>(TENANT_SCOPED_MODELS);
    expect(GLOBAL_MODELS.filter((name) => declared.has(name))).toEqual([]);
  });

  it('cada modelo del schema está clasificado como tenant-scoped o global', () => {
    const classified = new Set<string>([...TENANT_SCOPED_MODELS, ...GLOBAL_MODELS]);
    const unclassified = models.map((model) => model.name).filter((name) => !classified.has(name));

    expect(
      unclassified,
      'Modelos sin clasificar: agregalos a TENANT_SCOPED_MODELS (si llevan gymId) o a GLOBAL_MODELS',
    ).toEqual([]);
  });
});
