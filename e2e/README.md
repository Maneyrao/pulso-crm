# E2E

Los 6 flujos del MVP, contra la aplicación real.

## Correrlos

```bash
pnpm dev:services
pnpm db:reset && pnpm db:seed   # los specs asumen el seed determinístico
pnpm dev                        # api :4001 · web :4000
pnpm --filter @pulso/e2e test:e2e
```

Los specs usan los datos del seed. Si cambia el seed, hay que revisar los
documentos y nombres que aparecen acá.

Los socios nuevos que crean los tests usan documentos del rango
90.500.000–90.900.000, fuera del que ocupa el seed, para que dos corridas
seguidas no choquen contra el unique de documento.
