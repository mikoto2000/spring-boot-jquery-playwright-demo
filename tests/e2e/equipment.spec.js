import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request, page }) => {
  const response = await request.post('/api/test/reset');
  expect(response.status()).toBe(204);
  await page.goto('/');
  await expect(page.getByRole('row')).toHaveCount(4);
});

const equipmentRow = (page, name) => page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });

async function register(page, name = 'デモ用モニター') {
  await page.getByRole('button', { name: '備品を登録', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '備品の登録', exact: true });
  await dialog.getByLabel('備品名', { exact: true }).fill(name);
  await dialog.getByLabel('カテゴリ', { exact: true }).selectOption('PC・周辺機器');
  await dialog.getByLabel('数量', { exact: true }).fill('1');
  await dialog.getByRole('button', { name: '登録する', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(equipmentRow(page, name)).toBeVisible();
}

test('初期データを表示し、名前とカテゴリで絞り込める', async ({ page }) => {
  await expect(equipmentRow(page, '会議室モニター')).toBeVisible();
  await page.getByLabel('備品名で検索').fill('モニター');
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByLabel('カテゴリで絞り込み').selectOption('オフィス用品');
  await expect(page.getByText('備品が見つかりません', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '条件をクリア' }).click();
  await expect(page.getByRole('row')).toHaveCount(4);
});

test('未入力と不正な数量は登録せず、入力エラーを表示する', async ({ page, request }) => {
  await page.getByRole('button', { name: '備品を登録', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '登録する' }).click();
  await expect(dialog.getByText('備品名を入力してください', { exact: true })).toBeVisible();
  await expect(dialog.getByText('カテゴリを選択してください', { exact: true })).toBeVisible();
  await dialog.getByLabel('備品名', { exact: true }).fill('不正な数量の備品');
  await dialog.getByLabel('カテゴリ', { exact: true }).selectOption('その他');
  for (const quantity of ['-1', '1.5', '10000', '']) {
    await dialog.getByLabel('数量', { exact: true }).fill(quantity);
    await dialog.getByRole('button', { name: '登録する' }).click();
    await expect(dialog.getByText('数量は0〜9999の整数で入力してください', { exact: true })).toBeVisible();
  }
  expect(await (await request.get('/api/equipment')).json()).toHaveLength(3);
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(dialog).not.toBeVisible();
});

test('登録 → 検索 → 編集 → 再読み込み → 削除のデモシナリオ', async ({ page }) => {
  await register(page);
  await page.getByLabel('備品名で検索').fill('デモ用モニター');
  await expect(page.getByRole('row')).toHaveCount(2);
  await equipmentRow(page, 'デモ用モニター').getByRole('button', { name: '編集', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '備品の編集', exact: true });
  await dialog.getByLabel('数量', { exact: true }).fill('4');
  await dialog.getByLabel('状態', { exact: true }).selectOption('貸出中');
  await dialog.getByRole('button', { name: '更新する' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(equipmentRow(page, 'デモ用モニター').getByRole('cell', { name: '4', exact: true })).toBeVisible();
  await page.reload();
  const row = equipmentRow(page, 'デモ用モニター');
  await expect(row.getByRole('cell', { name: '4', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: '貸出中', exact: true })).toBeVisible();
  await row.getByRole('button', { name: '削除', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '備品の削除', exact: true });
  await confirmation.getByRole('button', { name: 'キャンセル' }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '削除', exact: true }).click();
  await confirmation.getByRole('button', { name: '削除する', exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await page.getByLabel('備品名で検索').fill('デモ用モニター');
  await expect(page.getByText('備品が見つかりません', { exact: true })).toBeVisible();
  await page.reload();
  await expect(equipmentRow(page, 'デモ用モニター')).toHaveCount(0);
});

test('編集のキャンセルでは保存されず、ゼロ個の備品も登録できる', async ({ page }) => {
  await equipmentRow(page, '会議室モニター').getByRole('button', { name: '編集', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('備品名', { exact: true }).fill('保存しない変更');
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(equipmentRow(page, '会議室モニター')).toBeVisible();
  await page.getByRole('button', { name: '備品を登録', exact: true }).click();
  await dialog.getByLabel('備品名', { exact: true }).fill('在庫切れの備品');
  await dialog.getByLabel('カテゴリ', { exact: true }).selectOption('その他');
  await dialog.getByLabel('数量', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: '登録する' }).click();
  await expect(equipmentRow(page, '在庫切れの備品').getByRole('cell', { name: '0', exact: true })).toBeVisible();
});

test('API の取得失敗から再試行できる', async ({ page }) => {
  await page.route('**/api/equipment', route => route.fulfill({ status: 503, json: { message: 'unavailable' } }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('備品を取得できませんでした');
  await page.unroute('**/api/equipment');
  await page.getByRole('button', { name: '再試行' }).click();
  await expect(page.getByRole('row')).toHaveCount(4);
});

test('保存失敗時は入力を保持し、再送できる', async ({ page }) => {
  await page.route('**/api/equipment', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, json: { message: 'failed' } }) : route.continue());
  await page.getByRole('button', { name: '備品を登録', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('備品名', { exact: true }).fill('再送する備品');
  await dialog.getByLabel('カテゴリ', { exact: true }).selectOption('その他');
  await dialog.getByRole('button', { name: '登録する' }).click();
  await expect(dialog.getByRole('alert')).toContainText('保存できませんでした');
  await expect(dialog.getByLabel('備品名', { exact: true })).toHaveValue('再送する備品');
  await page.unroute('**/api/equipment');
  await dialog.getByRole('button', { name: '登録する' }).click();
  await expect(equipmentRow(page, '再送する備品')).toBeVisible();
});

test('入力した HTML は文字列として表示される', async ({ page }) => {
  const name = '<img src=x onerror="window.injected=true">';
  await register(page, name);
  await expect(equipmentRow(page, name).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('API も不正入力を拒否し、存在しない備品は404になる', async ({ request }) => {
  const valid = { name: 'APIテスト', category: 'その他', quantity: 1, status: '利用可能' };
  for (const change of [{ name: ' ' }, { category: '無効' }, { quantity: -1 }, { quantity: 1.5 }, { quantity: null }, { quantity: 10000 }, { status: '無効' }]) {
    expect((await request.post('/api/equipment', { data: { ...valid, ...change } })).status()).toBe(400);
  }
  expect((await request.put('/api/equipment/999999', { data: valid })).status()).toBe(404);
  expect((await request.delete('/api/equipment/999999')).status()).toBe(404);
  expect(await (await request.get('/api/equipment')).json()).toHaveLength(3);
});
