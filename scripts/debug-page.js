const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:3004', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'screenshots/messages-home-390.png', fullPage: true });

  const html = await page.content();
  console.log('HTML LENGTH:', html.length);
  console.log('HTML PREVIEW:', html.substring(0, 2000));
  await browser.close();
})();