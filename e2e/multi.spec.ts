import { expect, test } from '@playwright/test';

test('un mismo código para varias dinámicas en la misma clase', async ({ browser, page }) => {
  // Docente crea la sesión con Phish or Fish.
  await page.goto('/docente');
  await page.getByRole('button', { name: /Phish or Fish/ }).click();
  await page.getByLabel('PIN docente (4 dígitos)').fill('1357');
  await page.getByRole('button', { name: 'Crear sesión y obtener código' }).click();
  await expect(page).toHaveURL(/\/docente\/[A-Z2-9]{6}$/);
  const code = page.url().split('/').pop()!;

  const screen = await page.context().newPage();
  await screen.goto(`/pantalla/${code}`);

  // Un grupo se une una sola vez.
  const g = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await g.goto(`/unirse?c=${code}`);
  await g.getByLabel('Nombre del grupo').fill('Halcones');
  await g.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(g.getByText('¡Listo, Halcones!')).toBeVisible();

  await page.getByRole('button', { name: /Iniciar dinámica/ }).click();
  await expect(g.getByText('Fase 1/5: Mini OSINT')).toBeVisible();

  // El docente agrega la Crisis Room sin cambiar de código.
  await page.getByRole('button', { name: '+ Agregar otra dinámica' }).click();
  const panel = page.getByRole('region', { name: 'Dinámicas de esta clase' });
  await panel.getByRole('button', { name: /Crisis Room/ }).click();
  await panel.getByRole('button', { name: 'Cargar y mostrar a los grupos' }).click();

  await expect(
    page.getByRole('heading', { name: 'Crisis Room: el lunes del ransomware' }),
  ).toBeVisible();
  await expect(
    g.getByText(
      'Esperen a que el docente inicie la dinámica: Crisis Room: el lunes del ransomware.',
    ),
  ).toBeVisible();
  await expect(screen.getByText('Crisis Room: el lunes del ransomware').first()).toBeVisible();
  await expect(screen.getByText('Halcones')).toBeVisible();

  await page.getByRole('button', { name: /Iniciar dinámica/ }).click();
  await expect(g.getByText('Fase 1/3: Comité de crisis')).toBeVisible();

  // Vuelve a Phish or Fish: retoma donde estaba.
  await panel.getByRole('button', { name: 'Mostrar a los grupos' }).click();
  await expect(g.getByText('Fase 1/5: Mini OSINT')).toBeVisible();
  await expect(page.getByText('Fase actual: Mini OSINT')).toBeVisible();

  // El grupo recarga y sigue en la dinámica activa.
  await g.reload();
  await expect(g.getByText('Fase 1/5: Mini OSINT')).toBeVisible();
});
