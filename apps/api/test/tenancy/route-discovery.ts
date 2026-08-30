import type { INestApplication } from '@nestjs/common';
// Constantes estables de Nest usadas para introspección de rutas — el mismo
// mecanismo que usan herramientas como @nestjs/swagger para generar specs
// automáticamente a partir del árbol de controllers ya registrado.
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota en src/infra/redis/redis.service.ts
import { ModulesContainer, Reflector } from '@nestjs/core';
import {
  AGENT_ONLY_KEY,
  FEATURE_KEY,
  PERMISSIONS_KEY,
  PUBLIC_KEY,
} from '../../src/common/auth/decorators.js';

/**
 * Descubrimiento automático de rutas (T-2.8).
 *
 * Recorre el `ModulesContainer` de una app Nest YA INICIALIZADA (después de
 * `app.init()`, cuando todos los controllers están registrados) y arma la
 * lista de rutas con su metadata de permisos. No hay una lista escrita a
 * mano en ningún lado: un controller nuevo aparece acá solo, y si no lo
 * cubre el resto de la suite, el test de cobertura de abajo lo hace fallar.
 */
export interface DiscoveredRoute {
  method: string;
  /** Ruta completa con el prefijo global, sin resolver los `:params`. */
  path: string;
  controllerName: string;
  handlerName: string;
  isPublic: boolean;
  isAgentOnly: boolean;
  permissions: string[] | undefined;
  feature: string | undefined;
}

const METHOD_NAMES: Record<number, string> = {
  0: 'GET',
  1: 'POST',
  2: 'PUT',
  3: 'DELETE',
  4: 'PATCH',
  5: 'ALL',
  6: 'OPTIONS',
};

function firstOrSelf(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

function joinPath(...segments: string[]): string {
  const parts = segments
    .map((s) => firstOrSelf(s).replace(/^\/+|\/+$/g, ''))
    .filter((s) => s.length > 0);
  return '/' + parts.join('/');
}

/**
 * `main.ts`/`harness.ts` excluyen `health/live` y `health/ready` del prefijo
 * global (`app.setGlobalPrefix('api/v1', { exclude: [...] })`). Ambas rutas
 * son `@Public()`, así que quedan fuera de la suite de cross-tenant de
 * cualquier forma, pero se replica la exclusión acá para que el `path`
 * reportado sea el real.
 */
function pathPrefixFor(controllerPath: string, globalPrefix: string): string {
  return controllerPath === 'health' ? '' : globalPrefix;
}

export function discoverRoutes(app: INestApplication, globalPrefix = '/api/v1'): DiscoveredRoute[] {
  const modulesContainer = app.get(ModulesContainer);
  const reflector = app.get(Reflector);
  const routes: DiscoveredRoute[] = [];

  for (const module of modulesContainer.values()) {
    for (const wrapper of module.controllers.values()) {
      const instance = wrapper.instance as object | undefined;
      const metatype = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
      if (!instance || !metatype) continue;

      const controllerPathRaw = Reflect.getMetadata(PATH_METADATA, metatype) as
        string | string[] | undefined;
      const controllerPath = firstOrSelf(controllerPathRaw).replace(/^\/+|\/+$/g, '');
      const prefix = pathPrefixFor(controllerPath, globalPrefix);

      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const handlerName of Object.getOwnPropertyNames(prototype)) {
        if (handlerName === 'constructor') continue;
        const handler = prototype[handlerName];
        if (typeof handler !== 'function') continue;

        const routePath = Reflect.getMetadata(PATH_METADATA, handler) as
          string | string[] | undefined;
        const routeMethod = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        // Sin metadata de ruta: no es un handler HTTP (método helper privado, etc.).
        if (routePath === undefined || routeMethod === undefined) continue;

        const fullPath = prefix + joinPath(controllerPath, routePath);

        routes.push({
          method: METHOD_NAMES[routeMethod] ?? 'GET',
          path: fullPath || '/',
          controllerName: metatype.name,
          handlerName,
          isPublic: reflector.get<boolean, boolean>(PUBLIC_KEY, handler) === true,
          isAgentOnly: reflector.get<boolean, boolean>(AGENT_ONLY_KEY, handler) === true,
          permissions: reflector.get<string[], string[]>(PERMISSIONS_KEY, handler),
          feature: reflector.get<string, string>(FEATURE_KEY, handler),
        });
      }
    }
  }

  // Orden estable: hace legible el reporte y determinístico cualquier test
  // que dependa del orden (ninguno debería, pero por las dudas).
  routes.sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
  );
  return routes;
}
