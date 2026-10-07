import { expect, test, type Browser, type Page } from '@playwright/test';

async function joinAsGroup(browser: Browser, code: string, name: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(`/unirse?c=${code}`);
  await page.getByLabel('Nombre del grupo').fill(name);
  await page.getByLabel('Nombre de su startup (del TP Integrador)').fill(`${name} SA`);
  await page.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(page.getByText(`¡Listo, ${name}!`)).toBeVisible();
  return page;
}

test('partida corta de Phish or Fish con un docente y dos grupos', async ({ browser, page }) => {
  // Docente crea la sesión.
  await page.goto('/');
  await page.getByRole('link', { name: /Soy docente/ }).click();
  await page.getByRole('button', { name: /Phish or Fish/ }).click();
  await page.getByLabel('PIN docente (4 dígitos)').fill('4321');
  await page.getByRole('button', { name: 'Crear sesión y obtener código' }).click();
  await expect(page).toHaveURL(/\/docente\/[A-Z2-9]{6}$/);
  const code = page.url().split('/').pop()!;

  // Pantalla proyectada en otra pestaña.
  const screen = await page.context().newPage();
  await screen.goto(`/pantalla/${code}`);
  await expect(screen.getByText(code).first()).toBeVisible();

  // Dos grupos se unen desde navegadores distintos.
  const g1 = await joinAsGroup(browser, code, 'Halcones');
  const g2 = await joinAsGroup(browser, code, 'Firewall');
  await expect(page.getByText('Grupos conectados: 2')).toBeVisible();
  await expect(screen.getByText('Halcones')).toBeVisible();

  // OSINT → concurso.
  await page.getByRole('button', { name: /Iniciar dinámica/ }).click();
  await expect(g1.getByText('Mini OSINT')).toBeVisible();
  await g1
    .getByLabel('Datos que usaría un atacante')
    .fill('Viaje a Bariloche y el nombre de su jefa');
  await g1.getByRole('button', { name: 'Guardar notas' }).click();
  await expect(g1.getByText(/Enviado/)).toBeVisible();

  await page.getByRole('button', { name: /Siguiente fase: Concurso/ }).click();
  await page.getByRole('button', { name: /Lanzar ronda 1/ }).click();

  // Ronda 1 (SMS de CorreoExpress = PHISH).
  await g1.getByRole('button', { name: /PHISH/ }).click();
  await g2.getByRole('button', { name: /FISH/ }).last().click();
  await expect(g1.getByText('¿Cuál es la señal clave?')).toBeVisible();
  await g1.getByRole('button', { name: /Urgencia \+ pago pequeño/ }).click();
  await g2
    .getByRole('button', { name: /^[A-D]\)/ })
    .first()
    .click();

  await expect(g1.getByText('¡Correcto!')).toBeVisible();
  await expect(g2.getByText('No esta vez')).toBeVisible();
  await expect(
    screen.getByText('Señal clave: Urgencia + pago pequeño + link acortado'),
  ).toBeVisible();

  // Exportación CSV desde el panel docente.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇ CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`ciberjunta-${code}.csv`);

  // Reconexión: el grupo recarga y vuelve a su estado.
  await g1.reload();
  await expect(g1.getByText('¡Correcto!')).toBeVisible();
});
