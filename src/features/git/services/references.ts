export const shortRef = (reference: string) => {
  return reference.replace(/^refs\/(heads|remotes)\//, '');
};

// A local branch may be named like a remote ('origin/shared'), so locals resolve first.
export const qualifyRef = (name: string, local: string[], remote: string[]) => {
  if (/^refs\/(heads|remotes)\//.test(name)) return name;
  if (local.includes(name)) return `refs/heads/${name}`;
  if (remote.includes(name)) return `refs/remotes/${name}`;
  return null;
};
