import process from 'node:process';

const monochrome = process.argv.includes('--expect-no-color');
const depth = process.stdout.isTTY ? process.stdout.getColorDepth() : 0;
const overrides = ['NO_COLOR', 'FORCE_COLOR', 'CLICOLOR', 'CLICOLOR_FORCE', 'NODE_DISABLE_COLORS'];
const valid =
  process.env.EMDECK_COLOR_FIXTURE === 'preserved' &&
  (monochrome
    ? process.env.NO_COLOR === '1' && depth === 1
    : depth === 24 && overrides.every(key => process.env[key] === undefined));

if (!valid) {
  process.stdout.write(
    JSON.stringify({
      depth,
      overrides: Object.fromEntries(overrides.map(key => [key, process.env[key]])),
    })
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    monochrome
      ? 'EMDECK_MONOCHROME_OK\r\n'
      : '\x1b[31mEMDECK_COLOR_OK\x1b[0m\r\n\x1b[38;2;17;34;51mTRUECOLOR_OK\x1b[0m\r\n'
  );
}
