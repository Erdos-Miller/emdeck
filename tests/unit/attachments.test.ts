import { expect, it } from 'vitest';
import { validateAttachments } from '../../src/features/agents/services/attachments';

it('accepts small images and empty files but bounds attachment memory', () => {
  expect(() => validateAttachments([{ size: 1234 }, { size: 0 }])).not.toThrow();
  expect(() => validateAttachments([])).toThrow('between 1 and 16');
  expect(() => validateAttachments(Array.from({ length: 17 }, () => ({ size: 1 })))).toThrow(
    'between 1 and 16'
  );
  expect(() => validateAttachments([{ size: 10 * 1024 * 1024 + 1 }])).toThrow('10 MiB');
  expect(() =>
    validateAttachments(Array.from({ length: 3 }, () => ({ size: 8 * 1024 * 1024 })))
  ).toThrow('20 MiB');
});
