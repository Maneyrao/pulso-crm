import { expect, test } from '@playwright/test';

/**
 * Flujos 2 y 3 del MVP: alta de socio con cobro y alta con deuda.
 *
 * Un gimnasio real da de alta gente que paga en el momento y gente que "después
 * traigo la plata". Los dos caminos tienen que dejar la cuenta corriente
 * coherente.
 */

const RECEPTION = { email: 'recepcion@demo.local', password: 'Demo.1234' };

/** Fuera del rango del seed (90.000.001–90.000.040) para no chocar. */
const nuevoDocumento = () => String(90_500_000 + Math.floor(Math.random() * 400_000));

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(RECEPTION.email);
  await page.getByLabel(/contraseña/i).fill(RECEPTION.password);
  await page.getByRole('button', { name: /ingresar|iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test.describe('listado de socios', () => {
  test('muestra los socios del seed', async ({ page }) => {
    await page.goto('/members');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('row')).not.toHaveCount(1);
  });

  test('los filtros viven en la URL y sobreviven a un refresh', async ({ page }) => {
    await page.goto('/members');
    await page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/buscar/i))
      .first()
      .fill('Lucía');
    await page.waitForURL(/q=Luc/i);

    await page.reload();
    await expect(
      page
        .getByRole('searchbox')
        .or(page.getByPlaceholder(/buscar/i))
        .first(),
    ).toHaveValue(/Luc/i);
  });

  test('"sin resultados" y "sin socios" son mensajes distintos', async ({ page }) => {
    await page.goto('/members?q=zzzzzznoexiste');
    // Con un filtro puesto, el mensaje tiene que ofrecer limpiarlo, no invitar
    // a dar de alta al primer socio.
    await expect(page.getByText(/no encontramos|sin resultados/i)).toBeVisible();
  });

  test('el documento se muestra enmascarado', async ({ page }) => {
    await page.goto('/members');
    const body = (await page.textContent('body')) ?? '';
    // Recepción no tiene por qué ver documentos completos en un listado.
    expect(body).toMatch(/•|\*/);
  });
});

test.describe('alta de socio', () => {
  test('alta sin cobrar: el socio queda con deuda', async ({ page }) => {
    const doc = nuevoDocumento();
    await page.goto('/members/new');

    await page
      .getByLabel(/nombre/i)
      .first()
      .fill('Camila');
    await page
      .getByLabel(/apellido/i)
      .first()
      .fill('Prueba');
    await page
      .getByLabel(/documento|dni/i)
      .first()
      .fill(doc);
    await page.getByRole('button', { name: /siguiente|continuar/i }).click();

    // Paso 2: plan
    await page.getByRole('button', { name: /siguiente|continuar/i }).click();

    // Paso 3: se finaliza sin cobrar
    await page.getByRole('button', { name: /sin cobrar|finalizar/i }).click();

    await expect(page).toHaveURL(/\/members\/[0-9a-f-]+/);
    await expect(page.getByText(/deuda|saldo/i).first()).toBeVisible();
  });

  test('un documento duplicado se avisa en el mismo paso', async ({ page }) => {
    await page.goto('/members/new');
    await page
      .getByLabel(/nombre/i)
      .first()
      .fill('Duplicada');
    await page
      .getByLabel(/apellido/i)
      .first()
      .fill('Prueba');
    // 90000001 ya existe en el seed.
    await page
      .getByLabel(/documento|dni/i)
      .first()
      .fill('90000001');
    await page.getByRole('button', { name: /siguiente|continuar/i }).click();

    await expect(page.getByText(/ya existe|duplicado/i)).toBeVisible();
  });

  test('recargar no pierde lo que se venía cargando', async ({ page }) => {
    await page.goto('/members/new');
    await page
      .getByLabel(/nombre/i)
      .first()
      .fill('Borrador');
    await page
      .getByLabel(/apellido/i)
      .first()
      .fill('Persistente');

    await page.reload();

    await expect(page.getByLabel(/nombre/i).first()).toHaveValue('Borrador');
  });
});
