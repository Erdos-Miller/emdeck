import { describe, expect, it } from 'vitest';
import { branchTree } from '../../src/features/git/services/branchTree';

describe('branch folder hierarchy', () => {
  it('shares folders and preserves full names for duplicate leaf labels', () => {
    const tree = branchTree([
      'main',
      'dima/bugfix/branch-name',
      'dima/bugfix/another',
      'dima/feature/branch-name',
    ]);
    expect(tree.map(node => node.name)).toEqual(['dima', 'main']);
    expect(tree[0].children.map(node => node.name)).toEqual(['bugfix', 'feature']);
    expect(tree[0].children[0].children).toEqual([
      { name: 'another', path: 'dima/bugfix/another', children: [] },
      { name: 'branch-name', path: 'dima/bugfix/branch-name', children: [] },
    ]);
    expect(tree[0].children[1].children[0].path).toBe('dima/feature/branch-name');
  });

  it('filters full paths without losing remote names or parent folders', () => {
    const tree = branchTree(
      ['origin/dima/bugfix/branch-name', 'upstream/main', 'origin/main'],
      ' DIMA/BUGFIX '
    );
    expect(tree).toEqual([
      {
        name: 'origin',
        path: 'origin',
        children: [
          {
            name: 'dima',
            path: 'origin/dima',
            children: [
              {
                name: 'bugfix',
                path: 'origin/dima/bugfix',
                children: [
                  { name: 'branch-name', path: 'origin/dima/bugfix/branch-name', children: [] },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(branchTree(['main'], 'missing')).toEqual([]);
    expect(branchTree([])).toEqual([]);
  });
});
