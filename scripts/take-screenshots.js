const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  await page.goto('http://localhost:3004', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'screenshots/messages-home-390.png', fullPage: true });

  // Click messages tab in mobile bottom nav or sidebar
  const messagesNav = page.locator('button', { hasText: 'Messages' }).first();
  if (await messagesNav.isVisible()) {
    await messagesNav.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/messages-list-390.png', fullPage: true });

    // Click first conversation if available
    const convo = page.locator('.inbox-person').first();
    if (await convo.isVisible()) {
      await convo.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/messages-chat-390.png', fullPage: true });
    }
  }

  await browser.close();
  console.log('Screenshots completed successfully');
})();
