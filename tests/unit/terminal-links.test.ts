import { describe, expect, it } from 'vitest';
import { findPaths, linkRange } from '../../src/features/agents/services/terminalLinks';

const paths = (text: string) => findPaths(text).map(m => m.path);

describe('terminal file links', () => {
  it('finds relative paths with and without a leading dot segment', () => {
    expect(paths('edited src/app/main.ts today')).toEqual(['src/app/main.ts']);
    expect(paths('see ./docs/USAGE.md for details')).toEqual(['./docs/USAGE.md']);
    expect(paths('../shared/contracts/workspace.ts')).toEqual(['../shared/contracts/workspace.ts']);
  });

  it('captures line and column when present', () => {
    expect(findPaths('src/lib.rs:42')[0]).toMatchObject({ path: 'src/lib.rs', line: 42 });
    expect(findPaths('src/lib.rs:42:7')[0]).toMatchObject({
      path: 'src/lib.rs',
      line: 42,
      column: 7,
    });
    expect(findPaths('src/lib.rs')[0].line).toBeUndefined();
  });

  it('reports ranges that cover the whole reference including the line suffix', () => {
    const [match] = findPaths('at src/lib.rs:42:7 failed');
    expect(match.start).toBe(3);
    expect('at src/lib.rs:42:7 failed'.slice(match.start, match.end)).toBe('src/lib.rs:42:7');
  });

  it('ignores urls so they keep their own link handling', () => {
    expect(paths('see https://example.com/docs/guide.md now')).toEqual([]);
    expect(paths('http://localhost:1420/index.html')).toEqual([]);
  });

  it('requires a file extension so ordinary prose is not linked', () => {
    expect(paths('the quick brown fox jumped over')).toEqual([]);
    expect(paths('run the build and then deploy')).toEqual([]);
  });

  it('drops trailing sentence punctuation', () => {
    expect(paths('open src/app.tsx.')).toEqual(['src/app.tsx']);
    expect(paths('(src/app.tsx)')).toEqual(['src/app.tsx']);
    expect(paths('src/a.ts, src/b.ts')).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('finds several references on one line', () => {
    expect(paths('src/a.ts:3 and src/b.ts:9')).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('wrapped line ranges', () => {
  const columns = 20;

  it('keeps a match on one row when it does not cross the wrap', () => {
    expect(linkRange({ start: 3, end: 9, path: 'a.ts' }, 5, columns)).toEqual({
      start: { x: 4, y: 5 },
      end: { x: 9, y: 5 },
    });
  });

  it('carries a match that spans the wrap onto the next row', () => {
    expect(linkRange({ start: 18, end: 24, path: 'a.ts' }, 5, columns)).toEqual({
      start: { x: 19, y: 5 },
      end: { x: 4, y: 6 },
    });
  });

  it('finds a path that only exists once the wrapped rows are joined', () => {
    const wrapped = 'see src/features/agen' + 'ts/services/links.ts:14 now';
    expect(findPaths(wrapped)[0]).toMatchObject({
      path: 'src/features/agents/services/links.ts',
      line: 14,
    });
  });
});

describe('false positives in prose', () => {
  it('ignores dotted identifiers that are not file names', () => {
    expect(paths('self.method returns early')).toEqual([]);
    expect(paths('read obj.prop.value first')).toEqual([]);
    expect(paths('e.g. see the docs')).toEqual([]);
  });

  it('still accepts a bare source file name', () => {
    expect(paths('failed in terminalLinks.ts:14')).toEqual(['terminalLinks.ts']);
    expect(paths('check Cargo.toml')).toEqual(['Cargo.toml']);
  });

  it('accepts any extension once the reference has a directory', () => {
    expect(paths('src/data/fixture.unusualext')).toEqual(['src/data/fixture.unusualext']);
  });
});
