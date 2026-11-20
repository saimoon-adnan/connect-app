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

  // Click messages tab
  const messagesNav = page.locator('button', { hasText: 'Messages' }).first();
  if (await messagesNav.isVisible()) {
    await messagesNav.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/messages-list-390.png', fullPage: true });

    const convo = page.locator('.inbox-person').first();
    if (await convo.isVisible()) {
      await convo.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/messages-chat-390.png', fullPage: true });
    }
  }

  // Evaluate computed styles
  const styles = await page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        found: true,
        background: cs.background,
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        borderRadius: cs.borderRadius,
        height: cs.height,
        width: cs.width,
        backdropFilter: cs.backdropFilter,
        border: cs.border,
        opacity: cs.opacity,
        display: cs.display,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
      };
    };
    return {
      appShell: get('.app-shell'),
      messagesShell: get('.messages-shell'),
      inbox: get('.inbox'),
      inboxSearch: get('.inbox-search'),
      inboxPerson: get('.inbox-person'),
      chatHead: get('.chat-head'),
      chatContent: get('.chat-content'),
      bubbleReceived: get('.bubble.received'),
      bubbleSent: get('.bubble.sent'),
      messageComposer: get('.message-composer'),
      sendButton: get('.send-button'),
      mobileBottomNav: get('.mobile-bottom-nav'),
    };
  });

  console.log(JSON.stringify(styles, null, 2));
  await browser.close();
})();