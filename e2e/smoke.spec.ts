import { expect, test, type Page } from '@playwright/test';
import { CATALOG } from '@ciberjunta/shared';

/** Recorre todas las fases de cada dinámica y verifica que ninguna vista se rompa. */
for (const game of CATALOG) {
  test(`smoke: ${game.title}`, async ({ browser, page }) => {
    const errors: string[] = [];
    const watch = (p: Page) => {
      p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
      p.on('console', (m) => m.type() === 'error' && errors.push(`${p.url()}: ${m.text()}`));
    };
    watch(page);
    await page.goto('/docente');
    await page.getByRole('button', { name: game.title }).click();
    await page.getByLabel('PIN docente (4 dígitos)').fill('2468');
    await page.getByRole('button', { name: 'Crear sesión y obtener código' }).click();
    await expect(page).toHaveURL(/\/docente\/[A-Z2-9]{6}$/);
    const code = page.url().split('/').pop()!;

    const screen = await page.context().newPage();
    watch(screen);
    await screen.goto(`/pantalla/${code}`);

    const g = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    watch(g);
    await g.goto(`/unirse?c=${code}`);
    await g.getByLabel('Nombre del grupo').fill('Smoke');
    await g.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(g.getByText('¡Listo, Smoke!')).toBeVisible();

    await page.getByRole('button', { name: /Iniciar dinámica/ }).click();
    for (let i = 0; i < game.phases.length; i++) {
      const phase = game.phases[i];
      await expect(
        g.getByText(`Fase ${i + 1}/${game.phases.length}: ${phase.title}`),
      ).toBeVisible();
      await expect(
        screen.getByRole('heading', { name: phase.title, exact: true }).first(),
      ).toBeVisible();
      await expect(page.getByText(`Fase actual: ${phase.title}`)).toBeVisible();
      const next = game.phases[i + 1];
      if (next) await page.getByRole('button', { name: `Siguiente fase: ${next.title} →` }).click();
    }
    expect(errors).toEqual([]);
  });
}
