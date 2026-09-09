import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { root } from './tools.mjs';
import { metadata } from './metadata.mjs';

const targets = {
  'windows-x64': ['x86_64-pc-windows-msvc', ['.exe']],
  'macos-arm64': ['aarch64-apple-darwin', ['.dmg']],
  'macos-x64': ['x86_64-apple-darwin', ['.dmg']],
  'linux-x64': ['x86_64-unknown-linux-gnu', ['.deb', '.AppImage']],
};
const label = process.argv[2];
if (!(label in targets)) throw new Error('Unknown release target');
const [target, extensions] = targets[label];
const { version } = metadata();
const directory = join(root, 'src-tauri/target', target, 'release/bundle');
const output = join(root, '.tmp/release-assets');
mkdirSync(output, { recursive: true });
const walk = path =>
  readdirSync(path, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]
  );
for (const extension of extensions) {
  const files = walk(directory).filter(
    file => file.endsWith(extension) && basename(file).includes(version)
  );
  if (files.length !== 1)
    throw new Error(`Expected exactly one ${extension} for ${version}, found ${files.length}`);
  const destination = join(output, `Emdeck-${version}-${label}${extension}`);
  if (existsSync(destination))
    throw new Error(`Refusing to overwrite staged artifact: ${destination}`);
  copyFileSync(files[0], destination);
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
writeFileSync(
  join(output, `${label}.json`),
  JSON.stringify(
    { version, target, commit, signed: process.env.EMDECK_SIGNED === 'true' },
    null,
    2
  ) + '\n'
);
