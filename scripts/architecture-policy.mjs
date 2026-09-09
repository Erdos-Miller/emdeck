/** Emdeck code-size budgets; no legacy exemptions. */
export const sourceRoots = ['src', 'src-tauri/src', 'tests', 'scripts'];
export const budgets = {
  component: { warn: 250, max: 500 },
  service: { warn: 400, max: 700 },
  test: { warn: 600, max: 900 },
};

export const fileBudget = file =>
  /(^tests\/|\/tests\.rs$|\/tests\/|\.test\.)/.test(file)
    ? budgets.test
    : /\.tsx$|\/hooks\//.test(file)
      ? budgets.component
      : budgets.service;

export const forbiddenImport = (from, to) => {
  if (!to.startsWith('src/')) return null;
  const ownFeature = from.match(/^src\/features\/([^/]+)\//)?.[1];
  const targetFeature = to.match(/^src\/features\/([^/]+)\//)?.[1];
  if (from.startsWith('src/shared/') && !to.startsWith('src/shared/'))
    return 'Shared modules must remain independent of features and platform adapters.';
  if (from.startsWith('src/shared/contracts/') && !to.startsWith('src/shared/contracts/'))
    return 'Contracts must contain plain types and depend only on other contracts.';
  if (from.startsWith('src/platform/') && !/^src\/(platform|shared\/(contracts|lib))\//.test(to))
    return 'Platform adapters may depend only on contracts, neutral utilities and other adapters.';
  if (ownFeature && (to.startsWith('src/app/') || (targetFeature && ownFeature !== targetFeature)))
    return 'Compose features in the app layer; features cannot import the app or sibling features.';
  if (
    from.includes('/services/') &&
    !/^src\/shared\/(contracts|lib)\//.test(to) &&
    !(ownFeature && targetFeature === ownFeature && to.includes('/services/'))
  )
    return 'Domain services depend on plain contracts and domain services, never UI or adapters.';
  if (from.startsWith('src/app/hooks/') && to.includes('/components/'))
    return 'Controllers cannot import views, including view-owned types.';
  return null;
};
