import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// Scan every publishable file, including force-tracked ignored paths. Never
// follow a symlink into the developer's filesystem or copy .git credentials.
export const snapshotSource = (root, destination) => {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const copied = [];
  for (const file of new Set(files)) {
    const source = resolve(root, file);
    const path = relative(resolve(root), source);
    if (isAbsolute(path) || path === '..' || path.startsWith('..' + sep))
      throw new Error('Publication path escapes repository');
    if (path.split(sep).some(part => part.toLowerCase() === '.git'))
      throw new Error('Git metadata cannot be published');
    if (!existsSync(source)) continue;
    let ancestor = resolve(root);
    for (const part of path.split(sep)) {
      ancestor = join(ancestor, part);
      if (lstatSync(ancestor).isSymbolicLink())
        throw new Error(`Review publication symlink before scanning: ${file}`);
    }
    if (!lstatSync(source).isFile())
      throw new Error(`Review non-regular publication file before scanning: ${file}`);
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied.push(file);
  }
  return copied;
};
