import { test } from '@playwright/test';

// Capture only after the action and its assertions have completed successfully.
// Failures are still captured by Playwright's screenshot: 'only-on-failure'.
export async function screenshotStep(page, title, action) {
  return test.step(title, async step => {
    const result = await action();
    await step.attach(title, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
    return result;
  });
}
