export const basename = (path: string) =>
  path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
export const dirname = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
export const join = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);
export const absolutePath = (root: string, path: string) =>
  `${root.replace(/^\\\\\?\\/, '').replace(/[\\/]$/, '')}${root.includes('\\') ? '\\' : '/'}${path.replace(/\//g, root.includes('\\') ? '\\' : '/')}`;
export function fileKind(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  return (
    (
      {
        ts: 'TypeScript',
        tsx: 'TypeScript JSX',
        js: 'JavaScript',
        jsx: 'JavaScript JSX',
        json: 'JSON',
        rs: 'Rust',
        md: 'Markdown',
        markdown: 'Markdown',
        mdown: 'Markdown',
        mkd: 'Markdown',
        css: 'CSS',
        html: 'HTML',
        py: 'Python',
        yml: 'YAML',
        yaml: 'YAML',
        toml: 'TOML',
      } as Record<string, string>
    )[ext ?? ''] ?? 'Plain text'
  );
}
