import { expect, test } from '@playwright/test';

/**
 * Flujo 1 del MVP: iniciar sesión y llegar al panel.
 *
 * Usa los datos del seed (`pnpm db:seed`), que es determinístico.
 */

const OWNER = { email: 'admin@demo.local', password: 'Demo.1234' };

test.describe('login', () => {
  test('un usuario válido entra y ve su gimnasio', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill(OWNER.email);
    await page.getByLabel(/contraseña/i).fill(OWNER.password);
    await page.getByRole('button', { name: /ingresar|iniciar sesión/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Gimnasio Demo')).toBeVisible();
  });

  test('una contraseña incorrecta muestra un error que no revela si el email existe', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(OWNER.email);
    await page.getByLabel(/contraseña/i).fill('incorrecta');
    await page.getByRole('button', { name: /ingresar|iniciar sesión/i }).click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    // El mensaje no debe distinguir "no existe el email" de "la clave está mal".
    await expect(error).not.toContainText(/no existe|no encontrado|no registrado/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('el token no queda accesible desde JavaScript', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(OWNER.email);
    await page.getByLabel(/contraseña/i).fill(OWNER.password);
    await page.getByRole('button', { name: /ingresar|iniciar sesión/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const storage = await page.evaluate(() => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      // document.cookie no debe exponer la cookie de sesión (es httpOnly).
      cookies: document.cookie,
    }));

    expect(storage.local).not.toMatch(/eyJhbGciOi|accessToken|refreshToken/);
    expect(storage.session).not.toMatch(/eyJhbGciOi|accessToken|refreshToken/);
    expect(storage.cookies).not.toContain('pulso_at');
    expect(storage.cookies).not.toContain('pulso_rt');
  });

  test('una ruta protegida redirige a login sin sesión', async ({ page }) => {
    await page.goto('/members');
    await expect(page).toHaveURL(/\/login/);
  });

  test('el formulario se puede completar sólo con el teclado', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    await page.keyboard.type(OWNER.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(OWNER.password);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/dashboard/);
  });
});
