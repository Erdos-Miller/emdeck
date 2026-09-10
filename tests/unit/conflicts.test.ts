import { describe, expect, it } from 'vitest';
import { absolutePath } from '../../src/shared/lib/paths';
import {
  conflicts,
  hasConflictMarkers,
  resolveConflict,
} from '../../src/features/git/services/conflicts';

describe('merge conflict resolution', () => {
  it('supports custom marker widths and unlabeled conflicts', () => {
    const content =
      'before\n<<<<<<<<<\nours\n|||||||||\nbase\n=========\ntheirs\n>>>>>>>>>\nafter\n';
    const blocks = conflicts(content);
    expect(blocks).toHaveLength(1);
    expect(resolveConflict(content, blocks[0], 'both')).toBe('before\nours\ntheirs\nafter\n');
  });
  it('detects unfinished markers without rejecting ordinary operators', () => {
    for (const content of [
      '<<<<<<<\nunresolved',
      '=======\r\n',
      '||||||||| base\n',
      '>>>>>>> incoming',
    ])
      expect(hasConflictMarkers(content)).toBe(true);
    expect(hasConflictMarkers('const shifted = value << 7;\n// ======= separator\n')).toBe(false);
  });
  it('resolves one block at a time without dropping surrounding code', () => {
    const source =
      'before\n<<<<<<< HEAD\nlocal\n=======\nincoming\n>>>>>>> feature\nbetween\n<<<<<<< HEAD\nsecond\n=======\nother\n>>>>>>> feature\nafter\n';
    const blocks = conflicts(source);
    expect(blocks).toHaveLength(2);
    const result = resolveConflict(source, blocks[0], 'both');
    expect(result).toBe(
      'before\nlocal\nincoming\nbetween\n<<<<<<< HEAD\nsecond\n=======\nother\n>>>>>>> feature\nafter\n'
    );
    expect(conflicts(result)).toHaveLength(1);
  });
  it('supports diff3 base markers and preserves CRLF', () => {
    const source =
      'before\r\n<<<<<<< HEAD\r\nlocal\r\n||||||| base\r\nbase version\r\n=======\r\nincoming\r\n>>>>>>> feature\r\nafter\r\n';
    const block = conflicts(source)[0];
    expect(resolveConflict(source, block, 'ours')).toBe('before\r\nlocal\r\nafter\r\n');
    expect(resolveConflict(source, block, 'theirs')).toBe('before\r\nincoming\r\nafter\r\n');
  });
  it('handles a conflict at EOF and ignores incomplete markers', () => {
    expect(conflicts('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch')).toHaveLength(1);
    expect(conflicts('<<<<<<< HEAD\na\n=======\nb')).toHaveLength(0);
  });
});
describe('native clipboard path formatting', () => {
  it('removes the Windows extended path prefix', () =>
    expect(absolutePath('\\\\?\\C:\\work\\project', 'src/app.ts')).toBe(
      'C:\\work\\project\\src\\app.ts'
    ));
  it('preserves Unix paths', () =>
    expect(absolutePath('/home/me/project', 'src/app.ts')).toBe('/home/me/project/src/app.ts'));
});
