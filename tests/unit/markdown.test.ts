import { describe, expect, it } from 'vitest';
import {
  isMarkdown,
  markdownHeadings,
  markdownTarget,
} from '../../src/features/editor/services/markdown';

describe('Markdown document links', () => {
  it('recognizes Markdown extensions without changing code files', () => {
    for (const path of ['README.md', 'README.MD', 'guide.markdown', 'notes.mdown', 'notes.mkd'])
      expect(isMarkdown(path)).toBe(true);
    expect(isMarkdown('notes.md.ts')).toBe(false);
  });
  it('resolves links and images relative to the document within the project', () => {
    expect(markdownTarget('docs/guide.md', '../assets/diagram.svg')).toEqual({
      kind: 'file',
      path: 'assets/diagram.svg',
      fragment: '',
    });
    expect(markdownTarget('docs/guide.md', './More%20Info.md#next-step')).toEqual({
      kind: 'file',
      path: 'docs/More Info.md',
      fragment: 'next-step',
    });
    expect(markdownTarget('docs/guide.md', '/README.md')).toEqual({
      kind: 'file',
      path: 'README.md',
      fragment: '',
    });
    expect(markdownTarget('docs/guide.md', '#details')).toEqual({
      kind: 'file',
      path: 'docs/guide.md',
      fragment: 'details',
    });
  });
  it('rejects traversal, executable links and OS paths', () => {
    for (const href of [
      '../../secret.md',
      '/../../secret',
      '..%2f..%2fsecret',
      'C:\\Windows\\file',
      '//server/share',
      '%5C%5Cserver%5Cshare',
      'javascript:alert(1)',
      'data:text/html,hello',
      'file:///C:/private',
      'command:run',
      '%00file',
      '%ZZ',
      'https://user:secret@example.com',
      'foo?bar',
    ]) {
      expect(markdownTarget('docs/guide.md', href), href).toEqual({ kind: 'invalid' });
    }
    expect(markdownTarget('docs/guide.md', 'https://example.com/docs#start')).toEqual({
      kind: 'external',
      url: 'https://example.com/docs#start',
    });
  });
  it('assigns unique, prefixed heading anchors including Unicode', () => {
    const headings = ['Hello *world*!', 'Hello world', 'Hello world-1', 'Привет мир'].map(
      value => ({
        type: 'element',
        tagName: 'h2',
        children: [{ type: 'text', value }],
        properties: {} as Record<string, unknown>,
      })
    );
    markdownHeadings()({ type: 'root', children: headings });
    expect(headings.map(node => node.properties.id)).toEqual([
      'md-hello-world',
      'md-hello-world-1',
      'md-hello-world-1-1',
      'md-привет-мир',
    ]);
    const footnoteLabel = {
      type: 'element',
      tagName: 'h2',
      properties: { id: 'footnote-label' },
      children: [{ type: 'text', value: 'Footnotes' }],
    };
    markdownHeadings()({ type: 'root', children: [footnoteLabel] });
    expect(footnoteLabel.properties.id).toBe('footnote-label');
  });
});
