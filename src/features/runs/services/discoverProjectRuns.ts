import type { Entry, FileData } from '../../../shared/contracts/workspace';
import type { RunDiscovery, RunnerPreference } from './runDiscovery';
import { detectRuns, emptyDiscovery } from './runDiscovery';

export interface RunDiscoveryPort {
  list: (root: string) => Promise<Entry[]>;
  read: (root: string, path: string) => Promise<FileData>;
}

/** Read only the root listing and its manifest; never scan dependencies or source files. */
export const discoverProjectRuns = async (
  port: RunDiscoveryPort,
  root: string,
  runner: RunnerPreference,
  isCurrent: () => boolean
): Promise<RunDiscovery | null> => {
  try {
    const entries = await port.list(root);
    if (!isCurrent()) return null;
    const files = entries.filter(entry => !entry.isDir).map(entry => entry.name);
    if (!files.includes('package.json'))
      return {
        ...emptyDiscovery,
        notice: 'No package.json in the project root. You can still add your own commands.',
      };
    const manifest = await port.read(root, 'package.json');
    if (!isCurrent()) return null;
    return detectRuns(JSON.parse(manifest.content), files, runner);
  } catch (error) {
    return isCurrent()
      ? {
          ...emptyDiscovery,
          notice: `Could not detect scripts: ${String(error).replace(/^Error: /, '')}`,
        }
      : null;
  }
};
