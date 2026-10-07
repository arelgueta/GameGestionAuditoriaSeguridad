import { expect, test } from '@playwright/test';

test('el docente crea una sesión y tres grupos se unen desde tres navegadores', async ({
  browser,
  page,
}) => {
  await page.goto('/docente');
  await page.getByRole('button', { name: /Crisis Room/ }).click();
  await page.getByLabel('PIN docente (4 dígitos)').fill('1111');
  await page.getByRole('button', { name: 'Crear sesión y obtener código' }).click();
  await expect(page).toHaveURL(/\/docente\/[A-Z2-9]{6}$/);
  const code = page.url().split('/').pop()!;

  for (const name of ['Uno', 'Dos', 'Tres']) {
    const ctx = await browser.newContext();
    const g = await ctx.newPage();
    await g.goto(`/unirse?c=${code}`);
    await g.getByLabel('Nombre del grupo').fill(name);
    await g.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(g.getByText(`¡Listo, ${name}!`)).toBeVisible();
  }
  await expect(page.getByText('Grupos conectados: 3')).toBeVisible();

  // Un docente sin token no entra al panel.
  const other = await (await browser.newContext()).newPage();
  await other.goto(`/docente/${code}`);
  await expect(other.getByText('Ingresen el PIN de 4 dígitos')).toBeVisible();
});
