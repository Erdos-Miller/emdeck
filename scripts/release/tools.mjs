import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const windows = process.platform === 'win32';
const platform = windows ? 'windows' : 'linux';
const directory = join(root, '.tmp', 'release-tools', 'verified');
const manifests = {
  gitleaks: {
    repo: 'gitleaks/gitleaks',
    version: 'v8.30.1',
    windows: [
      'gitleaks_8.30.1_windows_x64.zip',
      'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e',
    ],
    linux: [
      'gitleaks_8.30.1_linux_x64.tar.gz',
      '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    ],
  },
  actionlint: {
    repo: 'rhysd/actionlint',
    version: 'v1.7.12',
    windows: [
      'actionlint_1.7.12_windows_amd64.zip',
      '6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9',
    ],
    linux: [
      'actionlint_1.7.12_linux_amd64.tar.gz',
      '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
    ],
  },
  'cargo-deny': {
    repo: 'EmbarkStudios/cargo-deny',
    version: '0.20.2',
    windows: [
      'cargo-deny-0.20.2-x86_64-pc-windows-msvc.tar.gz',
      '975a22143262fd27476d19ee00c7af67978426e40e1dee94eed6bbade1cf87dc',
    ],
    linux: [
      'cargo-deny-0.20.2-x86_64-unknown-linux-musl.tar.gz',
      '9f12ed4c49936e09b48bf862b595cde2fe64fcbd9d74dfacac6131ca824c8d5f',
    ],
  },
  'cargo-about': {
    repo: 'EmbarkStudios/cargo-about',
    version: '0.9.2',
    windows: [
      'cargo-about-0.9.2-x86_64-pc-windows-msvc.tar.gz',
      '1c03e5890238562497c2d89a3b75b02560af349c1fc3e713d3284f532a5cd748',
    ],
    linux: [
      'cargo-about-0.9.2-x86_64-unknown-linux-musl.tar.gz',
      '9099a59e820c38a68b9d65f300662a567d56562f9a10f6aa4c7e86c17c2566af',
    ],
  },
};
const walk = path =>
  readdirSync(path, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]
  );

export const installTools = async () => {
  if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64') {
    throw new Error(
      'Pinned audit tools run on Windows/Linux x64. Use the Linux security CI job on other hosts.'
    );
  }
  mkdirSync(directory, { recursive: true });
  for (const [name, manifest] of Object.entries(manifests)) {
    const [filename, expected] = manifest[platform];
    const archive = join(directory, filename);
    if (!existsSync(archive)) {
      const response = await fetch(
        `https://github.com/${manifest.repo}/releases/download/${manifest.version}/${filename}`
      );
      if (!response.ok) throw new Error(`Could not download ${name}: ${response.status}`);
      writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    }
    const actual = createHash('sha256').update(readFileSync(archive)).digest('hex');
    if (actual !== expected) throw new Error(`Checksum mismatch for ${filename}`);
    const destination = join(directory, name);
    mkdirSync(destination, { recursive: true });
    if (filename.endsWith('.zip')) {
      // Literal paths and an environment variable avoid interpolating shell code.
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Expand-Archive -LiteralPath $env:EMDECK_TOOL_ARCHIVE -DestinationPath $env:EMDECK_TOOL_DESTINATION -Force',
        ],
        {
          windowsHide: true,
          env: {
            ...process.env,
            EMDECK_TOOL_ARCHIVE: archive,
            EMDECK_TOOL_DESTINATION: destination,
          },
        }
      );
    } else {
      execFileSync('tar', ['-xzf', archive, '-C', destination], { windowsHide: true });
    }
    const binary = walk(destination).find(
      path => path.endsWith(`/${name}`) || path.endsWith(`\\${name}.exe`)
    );
    if (!binary) throw new Error(`Missing executable for ${name}`);
    if (!windows) chmodSync(binary, 0o755);
    writeFileSync(
      join(directory, `${name}.json`),
      JSON.stringify({ path: binary, archive, sha256: expected })
    );
    if (process.env.GITHUB_PATH) appendFileSync(process.env.GITHUB_PATH, `${dirname(binary)}\n`);
    console.log(`Verified ${name} ${manifest.version}`);
  }
};

export const tool = name => {
  const manifest = JSON.parse(readFileSync(join(directory, `${name}.json`), 'utf8'));
  return manifest.path;
};

export const runTool = (name, args, options = {}) =>
  execFileSync(tool(name), name === 'cargo-deny' ? ['deny', ...args] : args, {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
    ...options,
  });

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await installTools();
