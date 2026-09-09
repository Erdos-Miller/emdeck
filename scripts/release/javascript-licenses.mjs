import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import parse from 'spdx-expression-parse';
import { root } from './tools.mjs';

const allowed = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  '0BSD',
  'BlueOak-1.0.0',
  'Python-2.0',
]);
const accepted = node =>
  node.conjunction
    ? node.conjunction === 'or'
      ? accepted(node.left) || accepted(node.right)
      : accepted(node.left) && accepted(node.right)
    : !node.exception && !node.plus && allowed.has(node.license);
const read = path => JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
const find = (name, from) => {
  for (let path = from; ; path = dirname(path)) {
    const candidate = join(path, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (path === dirname(path)) return null;
  }
  // No evaluation of dependency code or network requests is necessary.
};
const collect = production => {
  const packages = new Map();
  const queue = [{ directory: root, initial: true }];
  for (let index = 0; index < queue.length; index++) {
    const { directory, initial } = queue[index];
    const pkg = read(directory);
    if (!initial) {
      if (packages.has(directory)) continue;
      const expression = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type;
      if (!expression || !accepted(parse(expression)))
        throw new Error(`Unapproved license: ${pkg.name}@${pkg.version}: ${expression}`);
      packages.set(directory, { ...pkg, directory, expression });
    }
    const required = {
      ...pkg.dependencies,
      ...(initial && !production ? pkg.devDependencies : {}),
    };
    const optional = pkg.optionalDependencies || {};
    for (const name of new Set([
      ...Object.keys(required),
      ...Object.keys(optional),
      ...Object.keys(pkg.peerDependencies || {}),
    ])) {
      const dependency = find(name, directory);
      if (!dependency && name in required && !(name in optional))
        throw new Error(`Missing installed dependency: ${pkg.name} → ${name}`);
      if (dependency) queue.push({ directory: dependency, initial: false });
    }
  }
  return [...packages.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en')
  );
};

const all = collect(false);
const production = collect(true);
const notices = [
  '# JavaScript dependency notices',
  '',
  'Generated from the installed, locked production dependency graph. Includes full license files supplied by each package; Emdeck has not modified these packages.',
  '',
];
for (const pkg of production) {
  const files = readdirSync(pkg.directory).filter(name =>
    /^(licen[sc]e|copying|notice)([._-]|$)/i.test(name)
  );
  if (!files.length) throw new Error(`No distributable license text: ${pkg.name}@${pkg.version}`);
  notices.push(
    `## ${pkg.name}@${pkg.version}`,
    '',
    `Declared license: ${pkg.expression}`,
    '',
    `Source: https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`,
    ''
  );
  for (const name of files.sort()) {
    const text = readFileSync(join(pkg.directory, name), 'utf8')
      .replaceAll('\r\n', '\n')
      .replace(/[\t ]+$/gm, '')
      .trim();
    if (!text) throw new Error(`Empty license text: ${pkg.name}/${name}`);
    notices.push(`### ${name}`, '', '````text', text, '````', '');
  }
}
mkdirSync(join(root, 'docs/licenses'), { recursive: true });
writeFileSync(join(root, 'docs/licenses/JAVASCRIPT.md'), `${notices.join('\n').trimEnd()}\n`);
console.log(
  `License expressions accepted for ${all.length} installed production/development packages; notices include ${production.length} production packages.`
);
