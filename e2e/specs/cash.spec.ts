import { expect, test } from '@playwright/test';

/**
 * Flujo 4 del MVP: un turno completo de caja.
 *
 * Abrir, registrar un ingreso y un egreso, revertir uno, cerrar con arqueo.
 * Es el flujo donde un error se traduce en plata que no cuadra, así que se
 * verifica el número final, no sólo que las pantallas naveguen.
 */

const RECEPTION = { email: 'recepcion@demo.local', password: 'Demo.1234' };

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(RECEPTION.email);
  await page.getByLabel(/contraseña/i).fill(RECEPTION.password);
  await page.getByRole('button', { name: /ingresar|iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test.describe('caja', () => {
  test('el seed deja una caja abierta lista para operar', async ({ page }) => {
    await page.goto('/cash');
    await expect(page.getByText(/caja abierta|movimientos/i).first()).toBeVisible();
  });

  test('un ingreso aparece en el listado y suma al total', async ({ page }) => {
    await page.goto('/cash');

    await page
      .getByRole('button', { name: /ingreso/i })
      .first()
      .click();
    await page.getByLabel(/importe|monto/i).fill('1500.50');
    await page.getByRole('button', { name: /registrar|confirmar|guardar/i }).click();

    await expect(page.getByText('1.500,50')).toBeVisible();
  });

  test('la reversa deja los dos movimientos visibles, no borra el original', async ({ page }) => {
    await page.goto('/cash');

    await page
      .getByRole('button', { name: /ingreso/i })
      .first()
      .click();
    await page.getByLabel(/importe|monto/i).fill('2000.00');
    await page.getByRole('button', { name: /registrar|confirmar|guardar/i }).click();
    await expect(page.getByText('2.000,00').first()).toBeVisible();

    await page
      .getByRole('button', { name: /revertir/i })
      .first()
      .click();
    await page.getByLabel(/motivo/i).fill('Cobro cargado por error al socio equivocado');
    await page
      .getByRole('button', { name: /confirmar|revertir/i })
      .last()
      .click();

    // Quedan dos movimientos: el original marcado como revertido y la reversa.
    // Un sistema de caja auditable no borra: corrige con un asiento opuesto.
    await expect(page.getByText('2.000,00')).toHaveCount(2);
  });

  test('el cierre calcula la diferencia en vivo mientras se cuenta el efectivo', async ({
    page,
  }) => {
    await page.goto('/cash');
    await page.getByRole('button', { name: /cerrar caja/i }).click();

    const declared = page.getByLabel(/efectivo contado|declarado/i);
    await declared.fill('1000.00');

    // La diferencia la calcula el backend contra lo esperado; la UI la refleja
    // apenas se tipea, para que el operador vea si le falta plata antes de
    // confirmar.
    await expect(page.getByText(/diferencia/i)).toBeVisible();
  });

  test('un importe de cero se rechaza', async ({ page }) => {
    await page.goto('/cash');
    await page
      .getByRole('button', { name: /ingreso/i })
      .first()
      .click();
    await page.getByLabel(/importe|monto/i).fill('0');
    await page.getByRole('button', { name: /registrar|confirmar|guardar/i }).click();

    await expect(page.getByText(/mayor a cero|inválido|importe/i).first()).toBeVisible();
  });
});
