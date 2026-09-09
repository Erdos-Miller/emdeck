export interface Conflict {
  start: number;
  end: number;
  ours: string;
  theirs: string;
  oursLabel: string;
  theirsLabel: string;
}
export const conflicts = (content: string): Conflict[] => {
  const result: Conflict[] = [];
  const pattern = /^<<<<<<< (.*)\r?\n([\s\S]*?)^=======\r?\n([\s\S]*?)^>>>>>>> (.*)(?:\r?\n|$)/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    const ours = match[2].replace(/^\|\|\|\|\|\|\| .*\r?\n[\s\S]*$/m, '');
    result.push({
      start: match.index,
      end: pattern.lastIndex,
      ours,
      theirs: match[3],
      oursLabel: match[1].trim(),
      theirsLabel: match[4].trim(),
    });
  }
  return result;
};
export const resolveConflict = (
  content: string,
  conflict: Conflict,
  choice: 'ours' | 'theirs' | 'both'
): string => {
  return (
    content.slice(0, conflict.start) +
    (choice === 'ours'
      ? conflict.ours
      : choice === 'theirs'
        ? conflict.theirs
        : conflict.ours + conflict.theirs) +
    content.slice(conflict.end)
  );
};
