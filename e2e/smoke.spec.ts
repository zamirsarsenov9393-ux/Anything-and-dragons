import { test, expect, type Page } from '@playwright/test';

/** На телефоне страница не должна быть шире экрана — иначе Safari уменьшает масштаб. */
async function noOverflow(page: Page, where: string) {
  const [cw, sw] = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
  expect(sw, `горизонтальная прокрутка: ${where}`).toBeLessThanOrEqual(cw + 1);
}

test('быстрое создание, лист, повышение уровня, отмена', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Персонажи' })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'e2e/shots/01-home.png' }); await noOverflow(page, 'e2e/shots/01-home');
  await page.getByRole('button', { name: 'Создать' }).first().click();
  await page.getByText('Быстрое создание').click();
  await expect(page.getByRole('heading', { name: 'Быстрое создание' })).toBeVisible();
  await page.locator('select').first().selectOption({ label: 'Воин' });
  await page.locator('input[type=range]').fill('5');
  await page.screenshot({ path: 'e2e/shots/02-quick.png', fullPage: false }); await noOverflow(page, 'e2e/shots/02-quick');
  await page.getByRole('button', { name: 'Создать персонажа' }).click();
  await expect(page.getByText('Воин 5')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'e2e/shots/03-sheet.png', fullPage: false }); await noOverflow(page, 'e2e/shots/03-sheet');
  await page.getByRole('button', { name: 'Бой' }).click();
  await page.screenshot({ path: 'e2e/shots/04-combat.png', fullPage: false }); await noOverflow(page, 'e2e/shots/04-combat');
  await page.getByRole('button', { name: 'Инвентарь' }).click();
  await page.screenshot({ path: 'e2e/shots/05-inventory.png', fullPage: false }); await noOverflow(page, 'e2e/shots/05-inventory');
  // повышение уровня
  await page.getByRole('button', { name: 'Уровень' }).last().click();
  await expect(page.getByRole('heading', { name: 'Повышение уровня' })).toBeVisible();
  await page.locator('button.card').filter({ hasText: 'Воин' }).first().click();
  await page.screenshot({ path: 'e2e/shots/06-levelup.png', fullPage: false }); await noOverflow(page, 'e2e/shots/06-levelup');
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByText('Воин 6')).toBeVisible();
  await page.getByRole('button', { name: 'История' }).click();
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click();
  await expect(page.getByText('Последнее изменение отменено')).toBeVisible();
  await expect(page.getByText('Воин 5 · 2014')).toBeVisible();
  // данные переживают перезагрузку
  await page.reload();
  await expect(page.getByText('Воин 5 · 2014')).toBeVisible({ timeout: 30_000 });
  expect(errors.filter((e) => !/favicon|manifest/i.test(e))).toEqual([]);
});

test('подробный мастер: заклинатель 3 уровня', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/new/wizard');
  await expect(page.getByText('Шаг 1 из 14')).toBeVisible({ timeout: 30_000 });
  let step = 1;
  const next = async (shot?: string) => {
    await page.getByRole('button', { name: 'Далее' }).click();
    step++;
    await expect(page.getByText(`Шаг ${step} из 14`)).toBeVisible();
    await page.waitForTimeout(250);
    if (shot) { await page.screenshot({ path: `e2e/shots/${shot}.png` }); await noOverflow(page, shot); }
  };
  await page.getByRole('button', { name: 'D&D 5e 2024' }).click();
  await next();
  await page.locator('input[type=range]').fill('3');
  await next('10-wizard-species');
  await page.locator('button.card').filter({ hasText: 'Эльф' }).first().click();
  await next();
  await page.locator('button.card').filter({ hasText: 'Волшебник' }).first().click();
  await page.screenshot({ path: 'e2e/shots/11-wizard-class.png' }); await noOverflow(page, 'e2e/shots/11-wizard-class');
  await next('12-wizard-subclass');
  await next();
  await page.locator('button.card').filter({ hasText: 'Мудрец' }).first().click();
  await page.screenshot({ path: 'e2e/shots/13-wizard-background.png' }); await noOverflow(page, 'e2e/shots/13-wizard-background');
  await next('14-wizard-abilities');
  await next('15-wizard-skills');
  await next();
  await next('16-wizard-feats');
  await next('17-wizard-features');
  await next('18-wizard-spells');
  await next('19-wizard-kit');
  await next();
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByText('Волшебник 3')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'e2e/shots/20-wizard-sheet.png' }); await noOverflow(page, 'e2e/shots/20-wizard-sheet');
  expect(errors).toEqual([]);
});

test('библиотека, пакеты, настройки, кампания', async ({ page }) => {
  await page.goto('./#/library');
  await expect(page.getByRole('heading', { name: 'Библиотека' })).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('Поиск заклинания').fill('fire');
  await page.screenshot({ path: 'e2e/shots/30-library.png', fullPage: false }); await noOverflow(page, 'e2e/shots/30-library');
  await page.goto('./#/packages');
  await expect(page.getByText('SRD 5.1').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/31-packages.png', fullPage: false }); await noOverflow(page, 'e2e/shots/31-packages');
  await page.goto('./#/settings');
  await expect(page.getByText('файл базы на устройстве (OPFS)')).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/32-settings.png', fullPage: false }); await noOverflow(page, 'e2e/shots/32-settings');
  await page.goto('./#/campaigns');
  await page.getByRole('button', { name: 'Новая' }).click();
  await page.locator('input').first().fill('Стимпанк');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Стимпанк' })).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/33-campaign.png', fullPage: false }); await noOverflow(page, 'e2e/shots/33-campaign');
});
