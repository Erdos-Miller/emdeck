import { runTool } from './tools.mjs';
runTool('cargo-deny', [
  '--manifest-path',
  'src-tauri/Cargo.toml',
  '--locked',
  '--config',
  'deny.toml',
  'check',
  'advisories',
  'licenses',
  'sources',
]);
