if (process.env.EMDECK_SIGNED === 'true') {
  const required = [
    'APPLE_CERTIFICATE',
    'APPLE_CERTIFICATE_PASSWORD',
    'APPLE_SIGNING_IDENTITY',
    'APPLE_ID',
    'APPLE_PASSWORD',
    'APPLE_TEAM_ID',
  ];
  const missing = required.filter(name => !process.env[name] || process.env[name] === '-');
  if (missing.length)
    throw new Error(`Signed macOS builds require these repository secrets: ${missing.join(', ')}`);
  console.log(
    'macOS signing and notarization inputs are present. Tauri will perform signing/notarization.'
  );
} else {
  if (process.env.APPLE_SIGNING_IDENTITY !== '-')
    throw new Error('Unsigned previews must use explicit ad-hoc signing.');
  console.log('Creating an ad-hoc signed macOS preview, without Apple notarization.');
}
