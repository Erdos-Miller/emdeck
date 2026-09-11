interface ScreenRow {
  isWrapped: boolean;
  translateToString: (trim?: boolean) => string;
}

interface LiveBuffer {
  baseY: number;
  length: number;
  getLine: (index: number) => ScreenRow | undefined;
}

// Read the live viewport, never viewportY/scrollback. Blank space below a TUI
// must not displace its status, and soft wraps must not split control labels.
export const readAgentScreen = (buffer: LiveBuffer, rows: number): string[] => {
  const end = Math.min(buffer.length, buffer.baseY + rows);
  const lines: string[] = [];
  for (let index = Math.max(buffer.baseY, end - 256); index < end; index++) {
    const row = buffer.getLine(index);
    const text = (row?.translateToString(false) ?? '').slice(0, 4096);
    if (row?.isWrapped && lines.length) lines[lines.length - 1] += text;
    else lines.push(text);
  }
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  return lines.map(line => line.trimEnd());
};
