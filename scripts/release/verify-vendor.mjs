import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root } from './tools.mjs';

const directory = join(root, 'src-tauri/vendor/glib');
const manifest = JSON.parse(readFileSync(join(root, 'src-tauri/vendor/glib.files.json'), 'utf8'));
const walk = path =>
  readdirSync(path, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]
  );
const files = walk(directory)
  .map(path => relative(directory, path).replaceAll('\\', '/'))
  .sort();
if (JSON.stringify(files) !== JSON.stringify(Object.keys(manifest.files).sort()))
  throw new Error('Vendored GLib file inventory changed; review the backport.');
for (const file of files) {
  const bytes = readFileSync(join(directory, file));
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.files[file])
    throw new Error(`Vendored GLib changed: ${file}`);
}
const source = readFileSync(join(directory, 'src/variant_iter.rs'), 'utf8');
if (
  !source.includes('let mut p: *mut libc::c_char = std::ptr::null_mut();') ||
  !source.includes('                &mut p,')
)
  throw new Error('GLib iterator backport is missing.');
const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
if (!cargo.includes('glib = { path = "vendor/glib" }'))
  throw new Error('Vendored GLib is not selected by Cargo.');
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--format-version', '1'],
    { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 }
  )
);
const glib = metadata.packages.filter(pkg => pkg.name === 'glib');
if (
  glib.length !== 1 ||
  glib[0].source !== null ||
  glib[0].version !== '0.18.5+emdeck.1' ||
  glib[0].manifest_path.replaceAll('\\', '/') !==
    join(directory, 'Cargo.toml').replaceAll('\\', '/')
)
  throw new Error('The resolved Cargo graph must use the patched local GLib package.');
console.log(`Verified ${files.length} GLib source files and the iterator backport.`);
