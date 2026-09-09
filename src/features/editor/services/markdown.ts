export const isMarkdown = (path: string) => /\.(md|markdown|mdown|mkd)$/i.test(path);
export type MarkdownTarget =
  | {
      kind: 'file';
      path: string;
      fragment: string;
    }
  | {
      kind: 'external';
      url: string;
    }
  | {
      kind: 'invalid';
    };
export const markdownTarget = (documentPath: string, href: string): MarkdownTarget => {
  const url = href.trim();
  if (!url || [...url].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127))
    return { kind: 'invalid' };
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) {
    try {
      const external = new URL(url);
      return ['https:', 'http:'].includes(external.protocol) &&
        !external.username &&
        !external.password
        ? { kind: 'external', url: external.href }
        : { kind: 'invalid' };
    } catch {
      return { kind: 'invalid' };
    }
  }
  try {
    const hash = url.indexOf('#');
    const rawPath = hash < 0 ? url : url.slice(0, hash);
    const path = decodeURIComponent(rawPath);
    const fragment = hash < 0 ? '' : decodeURIComponent(url.slice(hash + 1));
    if (
      /[\\:?]/.test(path) ||
      [...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      path.startsWith('//')
    )
      return { kind: 'invalid' };
    if (!path) return { kind: 'file', path: documentPath, fragment };
    const parts = path.startsWith('/') ? [] : documentPath.split('/').slice(0, -1);
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!parts.length) return { kind: 'invalid' };
        parts.pop();
      } else parts.push(part);
    }
    return parts.length ? { kind: 'file', path: parts.join('/'), fragment } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
};
interface MarkdownNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: MarkdownNode[];
  properties?: Record<string, unknown>;
}
const nodeText = (node: MarkdownNode): string =>
  node.value ?? node.children?.map(nodeText).join('') ?? '';
// Keep generated IDs separate from application IDs and make duplicate headings linkable.
export const markdownHeadings = () => {
  return (tree: MarkdownNode) => {
    const used = new Set<string>();
    const visit = (node: MarkdownNode) => {
      if (node.type === 'element' && /^h[1-6]$/.test(node.tagName ?? '') && !node.properties?.id) {
        const base = nodeText(node)
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, '')
          .replace(/\s/g, '-');
        let slug = base;
        for (let i = 1; used.has(slug); i++) slug = `${base}-${i}`;
        used.add(slug);
        node.properties = { ...node.properties, id: `md-${slug}` };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
};
