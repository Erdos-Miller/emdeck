import type { Locator } from '@playwright/test';

/** Model the webview's default paste without reading or replacing the user's clipboard. */
export const installTerminalClipboard = async (input: Locator, image = false) => {
  await input.evaluate((element, image) => {
    element.addEventListener('keydown', event => {
      const key = event as KeyboardEvent;
      if (
        !((key.ctrlKey || key.metaKey) && key.key.toLowerCase() === 'v') &&
        !(key.shiftKey && key.key === 'Insert')
      )
        return;
      // Runs after xterm's key handler. Only an uncanceled key may cause native paste.
      const allowed = !event.defaultPrevented;
      event.preventDefault();
      element.setAttribute('data-paste-allowed', String(allowed));
      if (!allowed) return;
      const clipboardData = new DataTransfer();
      if (image)
        clipboardData.items.add(new File(['fixture image'], 'fixture.png', { type: 'image/png' }));
      else clipboardData.setData('text/plain', 'first line\nsecond line');
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
      );
    });
  }, image);
};
