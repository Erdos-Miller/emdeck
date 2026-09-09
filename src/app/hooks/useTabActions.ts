import type { useEditorActions } from './useEditorActions';
import type { useWorkspaceRefresh } from './useWorkspaceRefresh';
import type { useWorkspaceState } from './useWorkspaceState';
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'project'
  | 'setDiffTabs'
  | 'setActiveDiffId'
  | 'setWorktreesActive'
  | 'setTerminalFull'
  | 'diffTabs'
  | 'activeDiffId'
  | 'files'
  | 'worktreesOpen'
  | 'setBranchMenu'
  | 'setWorktreesOpen'
  | 'worktreesActive'
  | 'active'
> &
  Pick<ReturnType<typeof useWorkspaceRefresh>, 'refreshGit'> &
  Pick<ReturnType<typeof useEditorActions>, 'closeFile' | 'saveFile'>;
export function useTabActions({
  project,
  setDiffTabs,
  setActiveDiffId,
  setWorktreesActive,
  setTerminalFull,
  diffTabs,
  activeDiffId,
  files,
  worktreesOpen,
  setBranchMenu,
  setWorktreesOpen,
  refreshGit,
  worktreesActive,
  active,
  closeFile,
  saveFile,
}: Dependencies) {
  const showDiff = (path: string, staged: boolean) => {
    if (!project) return;
    const id = JSON.stringify([path, staged]);
    setDiffTabs(tabs =>
      tabs.some(tab => tab.id === id)
        ? tabs.map(tab => (tab.id === id ? { ...tab, revision: tab.revision + 1 } : tab))
        : [...tabs, { id, path, staged, revision: 0 }]
    );
    setActiveDiffId(id);
    setWorktreesActive(false);
    setTerminalFull(false);
  };
  const refreshDiff = (id: string) =>
    setDiffTabs(tabs =>
      tabs.map(tab => (tab.id === id ? { ...tab, revision: tab.revision + 1 } : tab))
    );
  const closeDiff = (id: string) => {
    const index = diffTabs.findIndex(tab => tab.id === id);
    const remaining = diffTabs.filter(tab => tab.id !== id);
    setDiffTabs(remaining);
    if (activeDiffId === id)
      setActiveDiffId((remaining[index] ?? remaining[index - 1])?.id ?? null);
    if (!remaining.length && !files.length && worktreesOpen) setWorktreesActive(true);
  };
  const showWorktrees = () => {
    if (!project) return;
    setBranchMenu(false);
    setWorktreesOpen(true);
    setWorktreesActive(true);
    setTerminalFull(false);
    void refreshGit();
  };
  const closeWorktrees = () => {
    setWorktreesOpen(false);
    setWorktreesActive(false);
  };
  const closeActiveTab = () => {
    if (worktreesActive) closeWorktrees();
    else if (activeDiffId) closeDiff(activeDiffId);
    else if (active) void closeFile(active);
  };
  const saveCurrentFile = () => (activeDiffId || worktreesActive ? Promise.resolve() : saveFile());
  return {
    showDiff,
    refreshDiff,
    closeDiff,
    showWorktrees,
    closeWorktrees,
    closeActiveTab,
    saveCurrentFile,
  };
}
