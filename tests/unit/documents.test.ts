import { describe, expect, it } from 'vitest';
import { hasUnsavedFiles, reconcileDocument } from '../../src/features/editor/services/documents';
import type { OpenFile } from '../../src/shared/contracts/workspace';

const clean: OpenFile = { path: 'notes.ts', content: 'saved', saved: 'saved', revision: 'one' };
describe('document reconciliation', () => {
  it('reloads a clean buffer when an external writer changes its revision', () => {
    expect(reconcileDocument(clean, { content: 'external', revision: 'two' })).toEqual({
      ...clean,
      content: 'external',
      saved: 'external',
      revision: 'two',
      external: false,
    });
  });
  it('keeps edits made while a disk read was pending and flags the conflict', () => {
    const edited = { ...clean, content: 'new local typing' };
    expect(reconcileDocument(edited, { content: 'external', revision: 'two' })).toEqual({
      ...edited,
      external: true,
    });
  });
  it('retains missing files and unchanged revisions without destroying editor state', () => {
    expect(reconcileDocument(clean, null)).toEqual({ ...clean, external: true });
    expect(reconcileDocument(clean, { content: clean.content, revision: clean.revision })).toBe(
      clean
    );
  });
  it('recognizes empty dirty documents as unsaved', () => {
    expect(hasUnsavedFiles([clean])).toBe(false);
    expect(hasUnsavedFiles([{ ...clean, content: '' }])).toBe(true);
  });
});
