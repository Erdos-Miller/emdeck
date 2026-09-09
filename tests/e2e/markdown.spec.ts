import { expect, test } from '@playwright/test';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64"><rect width="320" height="64" rx="8" fill="#294133"/><text x="18" y="40" fill="#b8ee86" font-family="sans-serif" font-size="22">A project image</text></svg>';
const markdown = `# Project handbook

Read **formatted documents** with *live editing* and ~~old notes~~.

[Setup guide](docs/guide.markdown#details) · [Jump to checklist](#checklist) · [Website](https://example.test/docs)

| Mode | Purpose |
| --- | --- |
| Preview | Read documentation |
| Split | Edit and read |

## Checklist

- [x] Open a project
- [ ] Write your next idea

> Keep your code and documentation together.

\`\`\`typescript
const workspace = 'Emdeck';
\`\`\`

![Project diagram](assets/diagram.svg)

![Remote diagram](https://example.test/pixel.svg)

<script>window.markdownExecuted = true</script>

[Unsafe](javascript:alert%281%29)

[Outside](../private.md)
`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ markdown, svg }) => {
      if (localStorage.getItem('relay:demo-files')) return;
      localStorage.setItem(
        'relay:demo-files',
        JSON.stringify({
          'src/app.ts': 'const original = true;\n',
          'README.md': markdown,
          'docs/guide.markdown':
            '# Setup guide\n\n[Back to handbook](../README.md)\n\n' +
            'An introduction.\n\n'.repeat(35) +
            '## Details\n\nRun the project.\n\n' +
            'More detail.\n\n'.repeat(20),
          'assets/diagram.svg': svg,
          'empty.MD': '',
        })
      );
    },
    { markdown, svg }
  );
  await page.goto('/');
  await page.getByRole('treeitem', { name: /README.md/ }).click();
  await expect(page.getByRole('region', { name: 'Markdown preview' })).toBeVisible();
});

test('renders formatted Markdown with project images and inert embedded HTML', async ({ page }) => {
  const preview = page.getByRole('region', { name: 'Markdown preview' });
  await expect(preview.getByRole('heading', { name: 'Project handbook', level: 1 })).toBeVisible();
  await expect(preview.locator('strong')).toHaveText('formatted documents');
  await expect(preview.locator('del')).toHaveText('old notes');
  await expect(preview.getByRole('cell', { name: 'Read documentation' })).toBeVisible();
  await expect(preview.getByRole('checkbox').first()).toBeChecked();
  await expect(preview.getByRole('checkbox').first()).toBeDisabled();
  await expect(preview.locator('pre code')).toContainText("const workspace = 'Emdeck';");
  await expect
    .poll(() =>
      preview
        .getByAltText('Project diagram', { exact: true })
        .evaluate((img: HTMLImageElement) => img.naturalWidth)
    )
    .toBe(320);
  await expect(preview.getByRole('link', { name: 'Unsafe', exact: true })).toHaveCount(0);
  await expect(preview.getByRole('link', { name: 'Outside', exact: true })).toHaveCount(0);
  await expect(preview.locator('script,iframe')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).markdownExecuted)
  ).toBeUndefined();
  await expect(page.getByTestId('code-editor')).toBeHidden();
  await page.screenshot({ path: 'test-results/markdown-preview-dark.png' });
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.screenshot({ path: 'test-results/markdown-preview-light.png' });
});

test('split updates unsaved content and keeps editor history across mode and file switches', async ({
  page,
}) => {
  const editor = page.getByTestId('code-editor');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.evaluate(el => el.setAttribute('data-document-marker', 'preserved'));
  await editor.locator('.cm-content').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.insertText('# Draft title\n\n');
  await expect(
    page
      .getByRole('region', { name: 'Markdown preview' })
      .getByRole('heading', { name: 'Draft title' })
  ).toBeVisible();
  await expect(page.getByLabel('Unsaved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('tab', { name: /app.ts/ }).click();
  await expect(page.getByRole('group', { name: 'Markdown view' })).toHaveCount(0);
  await page.getByRole('tab', { name: /README.md/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editor).toHaveAttribute('data-document-marker', 'preserved');
  await editor.locator('.cm-content').click();
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('Draft title');
  await page.keyboard.press('Control+Home');
  await page.keyboard.insertText('# Saved title\n\n');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.keyboard.press('Control+s');
  await expect(page.getByLabel('Unsaved', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/markdown-split.png' });
  await page.reload();
  await page.getByRole('treeitem', { name: /README.md/ }).click();
  await expect(page.getByRole('heading', { name: 'Saved title' })).toBeVisible();
});

test('project links and heading anchors navigate within the workspace', async ({ page }) => {
  await page.getByRole('link', { name: 'Setup guide', exact: true }).click();
  await expect(page.getByRole('tab', { name: /guide.markdown/ })).toBeVisible();
  const preview = page.getByRole('region', { name: 'Markdown preview' });
  await expect(preview.getByRole('heading', { name: 'Details' })).toBeInViewport();
  const heading = (await preview.getByRole('heading', { name: 'Details' }).boundingBox())!;
  const region = (await preview.boundingBox())!;
  expect(Math.abs(heading.y - region.y - 24)).toBeLessThan(3);
  await preview.evaluate(el => {
    el.scrollTop = 0;
  });
  await page.getByRole('link', { name: 'Back to handbook' }).click();
  await expect(page.getByRole('heading', { name: 'Project handbook' })).toBeVisible();
  await page.getByRole('link', { name: 'Jump to checklist' }).click();
  await expect(preview.getByRole('heading', { name: 'Checklist' })).toBeInViewport();
  expect(page.url()).toBe('http://127.0.0.1:1420/');
});

test('remote images load only on request and empty files remain editable at small sizes', async ({
  page,
  context,
}) => {
  let imageRequests = 0;
  await page.route('https://example.test/pixel.svg', route => {
    imageRequests++;
    return route.fulfill({ contentType: 'image/svg+xml', body: svg });
  });
  await expect(page.getByRole('button', { name: 'Load image: Remote diagram' })).toBeVisible();
  expect(imageRequests).toBe(0);
  await page.getByRole('button', { name: 'Load image: Remote diagram' }).click();
  await expect.poll(() => imageRequests).toBe(1);
  await expect
    .poll(() =>
      page.getByAltText('Remote diagram').evaluate((img: HTMLImageElement) => img.naturalWidth)
    )
    .toBe(320);
  await context.route('https://example.test/docs', route =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Example documentation</h1>' })
  );
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Website', exact: true }).click();
  const external = await opened;
  await expect(external.getByRole('heading', { name: 'Example documentation' })).toBeVisible();
  expect(page.url()).toBe('http://127.0.0.1:1420/');
  await external.close();
  await page.getByRole('treeitem', { name: /empty.MD/ }).click();
  await expect(page.getByText('This Markdown file is empty.', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 900, height: 640 });
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  const preview = page.getByRole('region', { name: 'Markdown preview' });
  await expect(preview).toBeVisible();
  const region = (await preview.boundingBox())!;
  expect(region.x + region.width).toBeLessThanOrEqual(900);
});
