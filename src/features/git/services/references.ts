export const shortRef = (reference: string) => {
  return reference.replace(/^refs\/(heads|remotes)\//, '');
};
