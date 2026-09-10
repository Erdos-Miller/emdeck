export interface PathMatch {
  start: number;
  end: number;
  path: string;
  line?: number;
  column?: number;
}

// An extension is required: agent output is full of bare words that are not paths.
const REFERENCE = /(\.{0,2}\/)?[\w.-]+(\/[\w.-]+)*\.[A-Za-z]\w*(:\d+)?(:\d+)?/g;
const URL = /\w+:\/\/\S+/g;

// Without a directory to vouch for it, `self.method` is indistinguishable from a file.
const SOURCE_EXTENSIONS = new Set([
  'bash',
  'c',
  'cjs',
  'cpp',
  'cs',
  'css',
  'go',
  'h',
  'hpp',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'kt',
  'lock',
  'md',
  'mjs',
  'php',
  'py',
  'rb',
  'rs',
  'scss',
  'sh',
  'sql',
  'svelte',
  'swift',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
]);

const named = (path: string) =>
  path.includes('/') || SOURCE_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '');

const ranges = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].map(match => [match.index, match.index + match[0].length] as const);

// A wrapped line is one logical string laid over fixed-width rows, so offsets divide.
export const linkRange = (match: PathMatch, startRow: number, columns: number) => ({
  start: { x: (match.start % columns) + 1, y: startRow + Math.floor(match.start / columns) },
  end: {
    x: ((match.end - 1) % columns) + 1,
    y: startRow + Math.floor((match.end - 1) / columns),
  },
});

export const findPaths = (text: string): PathMatch[] => {
  const urls = ranges(text, URL);
  const matches: PathMatch[] = [];
  for (const match of text.matchAll(REFERENCE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (urls.some(([from, to]) => start < to && end > from)) continue;
    const [path, ...suffix] = match[0].split(':');
    if (!named(path)) continue;
    const [line, column] = suffix.map(Number);
    matches.push({ start, end, path, line, column });
  }
  return matches;
};
