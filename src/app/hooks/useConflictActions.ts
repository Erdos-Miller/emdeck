import { api } from '../../platform/desktop/api';
import type { ConflictResolution } from '../../shared/contracts/gitConflicts';
import type { useWorkspaceRefresh } from './useWorkspaceRefresh';
import type { useWorkspaceState } from './useWorkspaceState';

type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  'latest' | 'gitLock' | 'setGitBusy' | 'setConflictRequest' | 'setBranchMenu' | 'notify'
> &
  Pick<ReturnType<typeof useWorkspaceRefresh>, 'refresh'>;

export function useConflictActions({
  latest,
  gitLock,
  setGitBusy,
  setConflictRequest,
  setBranchMenu,
  notify,
  refresh,
}: Dependencies) {
  const showConflicts = (path?: string) => {
    const root = latest.current.project?.root;
    if (!root) return;
    setBranchMenu(false);
    setConflictRequest({ root, path });
  };
  const checkFile = (root: string, path: string) => {
    if (latest.current.project?.root !== root)
      throw new Error('The project changed. Reopen its conflicts.');
    const file = latest.current.files.find(file => file.path === path);
    if (file && file.content !== file.saved)
      throw new Error(
        `Save or close the unsaved editor tab for ${path} before resolving this file.`
      );
  };
  const readConflict = async (root: string, path: string) => {
    checkFile(root, path);
    return api.conflict(root, path);
  };
  const resolveGitConflict = async (root: string, request: ConflictResolution) => {
    checkFile(root, request.path);
    if (gitLock.current)
      throw new Error('Another Git operation is running. Try again when it finishes.');
    gitLock.current = true;
    setGitBusy(true);
    try {
      await api.resolveConflict(root, request);
      notify(`Resolved and staged ${request.path}`);
    } finally {
      gitLock.current = false;
      setGitBusy(false);
      await refresh();
    }
  };
  return { showConflicts, readConflict, resolveGitConflict };
}
