import { expect, test } from '@playwright/test';

/**
 * Flujo 5 del MVP: control de acceso en el mostrador.
 *
 * Es la pantalla más usada del producto y la que tiene que funcionar con una
 * fila de gente esperando. Se prueba con teclado, que es como se opera de verdad.
 */

const RECEPTION = { email: 'recepcion@demo.local', password: 'Demo.1234' };

// Del seed determinístico: los socios 1..25 están activos, y hay deudores y
// vencidos más adelante en la lista.
const DOC_ACTIVO = '90000001';
const DOC_INEXISTENTE = '90999999';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(RECEPTION.email);
  await page.getByLabel(/contraseña/i).fill(RECEPTION.password);
  await page.getByRole('button', { name: /ingresar|iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/access');
});

test.describe('control de acceso', () => {
  test('el input tiene el foco al entrar, sin tocar nada', async ({ page }) => {
    // Un lector de tarjetas tipea y manda Enter. Si hay que hacer click antes,
    // la fila se traba.
    const input = page.getByRole('textbox').first();
    await expect(input).toBeFocused();
  });

  test('un socio al día entra', async ({ page }) => {
    await page.keyboard.type(DOC_ACTIVO);
    await page.keyboard.press('Enter');

    const banner = page.getByRole('status');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/permitido|adelante|bienvenid/i);
  });

  test('un documento inexistente se rechaza con un motivo claro', async ({ page }) => {
    await page.keyboard.type(DOC_INEXISTENTE);
    await page.keyboard.press('Enter');

    const banner = page.getByRole('status');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/no encontrado|no existe|sin registro/i);
  });

  test('el foco vuelve al input después de cada consulta', async ({ page }) => {
    await page.keyboard.type(DOC_ACTIVO);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toBeVisible();

    // Sin esto, la segunda persona de la fila no puede pasar sin un click.
    await expect(page.getByRole('textbox').first()).toBeFocused();
  });

  test('el segundo ingreso del mismo día no duplica la asistencia', async ({ page }) => {
    await page.keyboard.type(DOC_ACTIVO);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toBeVisible();

    await page.keyboard.type(DOC_ACTIVO);
    await page.keyboard.press('Enter');

    const banner = page.getByRole('status');
    // Salir a comprar agua y volver no puede costarle una clase al socio: se
    // permite el paso, pero se avisa que ya había ingresado.
    await expect(banner).toContainText(/ya ingresó|ya registrad|hoy/i);
  });

  test('el resultado no se comunica sólo con color', async ({ page }) => {
    await page.keyboard.type(DOC_INEXISTENTE);
    await page.keyboard.press('Enter');

    const banner = page.getByRole('status');
    const text = (await banner.textContent())?.trim() ?? '';
    // Quien no distingue rojo de verde tiene que poder operar igual.
    expect(text.length).toBeGreaterThan(3);
  });
});
