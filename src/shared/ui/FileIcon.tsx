export function FileIcon({ path }: { path: string }) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const labels: Record<string, string> = {
    ts: 'TS',
    tsx: 'TS',
    js: 'JS',
    jsx: 'JS',
    json: '{}',
    css: '#',
    md: 'M↓',
    markdown: 'M↓',
    mdown: 'M↓',
    mkd: 'M↓',
    rs: 'Rs',
    py: 'Py',
    html: '◇',
    toml: '⚙',
    yml: '≋',
    yaml: '≋',
  };
  return <span className={`file-icon file-${ext}`}>{labels[ext] ?? '≡'}</span>;
}
