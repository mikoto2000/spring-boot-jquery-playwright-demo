import { test, expect } from '@playwright/test';
import { screenshotStep } from './helpers/screenshot-step.js';

const row = (page, name) => page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
const apiPattern = /\/api\/equipment(?:\/\d+)?$/;
const replacementName = '障害テスト備品';

test.beforeEach(async ({ request, page }) => {
  expect((await request.post('/api/test/reset')).status()).toBe(204);
  await screenshotStep(page, '初期一覧を表示', async () => {
    await page.goto('/');
    await expect(page.getByRole('row')).toHaveCount(4);
  });
});

async function openMutation(page, operation) {
  if (operation === '登録') {
    await page.getByRole('button', { name: '備品を登録', exact: true }).click();
  } else {
    await row(page, '会議室モニター').getByRole('button', { name: operation === '更新' ? '編集' : '削除', exact: true }).click();
  }
  const dialog = page.getByRole('dialog');
  if (operation !== '削除') {
    await dialog.getByLabel('備品名', { exact: true }).fill(replacementName);
    await dialog.getByLabel('カテゴリ', { exact: true }).selectOption('その他');
    await dialog.getByLabel('数量', { exact: true }).fill('7');
    await dialog.getByLabel('状態', { exact: true }).selectOption('貸出中');
  }
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const [operation, method, submitLabel] of [['登録', 'POST', '登録する'], ['更新', 'PUT', '更新する'], ['削除', 'DELETE', '削除する']]) {
  test(`${operation}失敗時はデータと集計を保ち、キャンセル・再試行できる`, async ({ page, request }) => {
    const before = await (await request.get('/api/equipment')).json();
    const stats = page.getByRole('region', { name: '備品の集計' });
    const beforeStats = await stats.textContent();
    let intercepted = 0;
    const failWrite = route => {
      if (route.request().method() === method) {
        intercepted++;
        return route.fulfill({ status: 500, json: { message: 'simulated write failure' } });
      }
      return route.continue();
    };
    await page.route(apiPattern, failWrite);
    let dialog;
    await screenshotStep(page, `${operation}操作の確認画面を表示`, async () => {
      dialog = await openMutation(page, operation);
    });

    async function expectFailure() {
      await dialog.getByRole('button', { name: submitLabel, exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText(operation === '削除' ? '削除できませんでした' : '保存できませんでした');
      await expect(dialog.getByRole('button', { name: submitLabel, exact: true })).toBeEnabled();
      await expect(dialog.getByRole('button', { name: 'キャンセル', exact: true })).toBeEnabled();
      if (operation !== '削除') {
        await expect(dialog.getByLabel('備品名', { exact: true })).toHaveValue(replacementName);
        await expect(dialog.getByLabel('カテゴリ', { exact: true })).toHaveValue('その他');
        await expect(dialog.getByLabel('数量', { exact: true })).toHaveValue('7');
        await expect(dialog.getByLabel('状態', { exact: true })).toHaveValue('貸出中');
      }
      expect(await (await request.get('/api/equipment')).json()).toEqual(before);
    }

    await screenshotStep(page, `${operation}失敗の表示・操作復帰・DBの不変を確認`, expectFailure);
    expect(intercepted).toBe(1);
    await screenshotStep(page, 'キャンセル後も一覧と集計が変わらないことを確認', async () => {
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole('row')).toHaveCount(4);
      for (const equipment of before) await expect(row(page, equipment.name)).toBeVisible();
      await expect(stats).toHaveText(beforeStats);
      await page.reload();
      await expect(page.getByRole('row')).toHaveCount(4);
      await expect(stats).toHaveText(beforeStats);
      expect(await (await request.get('/api/equipment')).json()).toEqual(before);
    });
    await screenshotStep(page, '再度失敗しても同じ画面から再試行できる', async () => {
      dialog = await openMutation(page, operation);
      await expectFailure();
      expect(intercepted).toBe(2);
    });
    await page.unroute(apiPattern, failWrite);
    await screenshotStep(page, `${operation}を再試行して成功を確認`, async () => {
      await dialog.getByRole('button', { name: submitLabel, exact: true }).click();
      await expect(dialog).not.toBeVisible();
      if (operation === '削除') {
        await expect(row(page, '会議室モニター')).toHaveCount(0);
        await expect(page.getByRole('row')).toHaveCount(3);
      } else {
        await expect(row(page, replacementName).getByRole('cell', { name: '7', exact: true })).toBeVisible();
        await expect(page.getByRole('row')).toHaveCount(operation === '登録' ? 5 : 4);
      }
    });
    await screenshotStep(page, '再読み込み後も再試行の結果が保存されている', async () => {
      await page.reload();
      await expect(page.getByRole('row')).toHaveCount(operation === '登録' ? 5 : operation === '削除' ? 3 : 4);
      const after = await (await request.get('/api/equipment')).json();
      const id = before.find(equipment => equipment.name === '会議室モニター').id;
      if (operation === '削除') expect(after).toEqual(before.filter(equipment => equipment.id !== id));
      else {
        const changed = after.find(equipment => equipment.name === replacementName);
        expect(changed).toMatchObject({ category: 'その他', quantity: 7, status: '貸出中' });
        if (operation === '更新') expect(changed.id).toBe(id);
        expect(after.filter(equipment => equipment.id !== changed.id)).toEqual(operation === '登録' ? before : before.filter(equipment => equipment.id !== id));
      }
    });
  });
}

for (const [operation, method, submitLabel] of [['登録', 'POST', '登録する'], ['更新', 'PUT', '更新する']]) {
  test(`${operation}成功後に一覧取得が失敗しても保存済みの値と集計を表示し、再取得できる`, async ({ page, request }) => {
    const before = await (await request.get('/api/equipment')).json();
    let committed = false;
    let blockList = true;
    let writes = 0;
    let writeResponse;
    let persisted;
    await page.route(apiPattern, async route => {
      if (route.request().method() === method) {
        writes++;
        const response = await route.fetch();
        expect(response.status()).toBe(operation === '登録' ? 201 : 200);
        writeResponse = await response.json();
        committed = true;
        return route.fulfill({ response });
      }
      if (route.request().method() === 'GET' && committed && blockList) {
        return route.fulfill({ status: 503, json: { message: 'list temporarily unavailable' } });
      }
      return route.continue();
    });
    const expectedStats = operation === '登録' ? ['4', '17', '2'] : ['3', '14', '2'];
    const stats = page.getByRole('region', { name: '備品の集計' }).locator('strong');
    async function expectSavedView() {
      const savedRow = row(page, replacementName);
      for (const value of [replacementName, 'その他', '7', '貸出中']) {
        await expect(savedRow.getByRole('cell', { name: value, exact: true })).toBeVisible();
      }
      await expect(page.getByRole('row')).toHaveCount(operation === '登録' ? 5 : 4);
      await expect(stats).toHaveText(expectedStats);
      if (operation === '更新') await expect(row(page, '会議室モニター')).toHaveCount(0);
    }
    await screenshotStep(page, `${operation}フォームに入力`, async () => {
      await openMutation(page, operation);
    });
    await screenshotStep(page, `${operation}成功と一覧取得失敗を区別して表示`, async () => {
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: submitLabel, exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: `備品を${operation}しました` })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('備品を取得できませんでした');
      await expectSavedView();
      persisted = await (await request.get('/api/equipment')).json();
      const saved = persisted.find(equipment => equipment.name === replacementName);
      expect(writeResponse.equipment).toEqual(saved);
      expect(saved).toMatchObject({ category: 'その他', quantity: 7, status: '貸出中' });
      const previous = before.find(equipment => equipment.name === '会議室モニター');
      if (operation === '更新') expect(saved.id).toBe(previous.id);
      expect(persisted.filter(equipment => equipment.id !== saved.id)).toEqual(operation === '登録' ? before : before.filter(equipment => equipment.id !== previous.id));
      expect(writes).toBe(1);
    });
    await screenshotStep(page, '一覧取得が再度失敗しても保存を再送せず、値を保持', async () => {
      await page.getByRole('button', { name: '再試行', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('備品を取得できませんでした');
      await expectSavedView();
      expect(writes).toBe(1);
    });
    await screenshotStep(page, '一覧再取得後も値・ID・件数が変わらず、重複登録されない', async () => {
      blockList = false;
      const refreshed = page.waitForResponse(response => response.request().method() === 'GET'
        && new URL(response.url()).pathname === '/api/equipment' && response.status() === 200);
      await page.getByRole('button', { name: '再試行', exact: true }).click();
      await refreshed;
      await expect(page.getByText('備品を読み込み中…', { exact: true })).not.toBeVisible();
      await expect(page.getByRole('alert')).not.toBeVisible();
      await expectSavedView();
      expect(await (await request.get('/api/equipment')).json()).toEqual(persisted);
      expect(writes).toBe(1);
    });
    await screenshotStep(page, '再読み込み後も保存結果が残る', async () => {
      await page.reload();
      await expectSavedView();
      expect(await (await request.get('/api/equipment')).json()).toEqual(persisted);
      expect(writes).toBe(1);
    });
  });
}

test('削除成功後に一覧取得が失敗しても削除済みの備品を表示せず、再取得できる', async ({ page, request }) => {
  let deleted = false;
  await page.route('**/api/equipment/*', async route => {
    const response = await route.fetch();
    if (route.request().method() === 'DELETE' && response.ok()) deleted = true;
    await route.fulfill({ response });
  });
  await page.route('**/api/equipment', route => deleted && route.request().method() === 'GET'
    ? route.fulfill({ status: 503, json: { message: 'list temporarily unavailable' } }) : route.continue());
  await screenshotStep(page, '削除成功と一覧取得失敗を区別して表示', async () => {
    const dialog = await openMutation(page, '削除');
    await dialog.getByRole('button', { name: '削除する', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '備品を削除しました' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('備品を取得できませんでした');
    await expect(row(page, '会議室モニター')).toHaveCount(0);
    expect((await (await request.get('/api/equipment')).json()).map(equipment => equipment.name)).not.toContain('会議室モニター');
  });
  await screenshotStep(page, '一覧を再取得して削除結果と集計を確認', async () => {
    await page.unroute('**/api/equipment');
    await page.getByRole('button', { name: '再試行', exact: true }).click();
    await expect(page.getByRole('row')).toHaveCount(3);
    await expect(row(page, '会議室モニター')).toHaveCount(0);
    await expect(page.getByRole('region', { name: '備品の集計' })).toContainText('7');
  });
});
