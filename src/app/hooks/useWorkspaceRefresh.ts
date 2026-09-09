import { reconcileDocument } from '../../features/editor/services/documents';
import { api } from '../../platform/desktop/api';
import type { useWorkspaceState } from './useWorkspaceState';
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'latest'
  | 'gitLock'
  | 'setGitBusy'
  | 'setGit'
  | 'setGitRevision'
  | 'fail'
  | 'setDirectories'
  | 'setFiles'
>;
export function useWorkspaceRefresh({
  latest,
  gitLock,
  setGitBusy,
  setGit,
  setGitRevision,
  fail,
  setDirectories,
  setFiles,
}: Dependencies) {
  const refreshGit = async (p = latest.current.project) => {
    if (!p || gitLock.current) return;
    gitLock.current = true;
    setGitBusy(true);
    try {
      const result = await api.git(p.root);
      if (latest.current.project?.root === p.root) {
        setGit(result);
        setGitRevision(value => value + 1);
      }
    } catch (e) {
      fail(e);
    } finally {
      gitLock.current = false;
      setGitBusy(false);
    }
  };
  const refreshDirectory = async (path = '', p = latest.current.project) => {
    if (!p) return;
    const entries = await api.list(p.root, path);
    if (latest.current.project?.root === p.root)
      setDirectories(old => ({ ...old, [path]: entries }));
  };
  const refreshFiles = async () => {
    const { project: p, files: openFiles } = latest.current;
    if (!p) return;
    await Promise.all(
      openFiles.map(async opened => {
        try {
          const disk = await api.read(p.root, opened.path);
          if (latest.current.project?.root !== p.root) return;
          setFiles(fs => fs.map(f => (f.path !== opened.path ? f : reconcileDocument(f, disk))));
        } catch {
          if (latest.current.project?.root === p.root)
            setFiles(fs => fs.map(f => (f.path === opened.path ? reconcileDocument(f, null) : f)));
        }
      })
    );
  };
  const refresh = async () => {
    await Promise.allSettled([
      refreshDirectory(),
      ...[...latest.current.expanded].map(p => refreshDirectory(p)),
      refreshGit(),
      refreshFiles(),
    ]);
  };
  return { refreshGit, refreshDirectory, refreshFiles, refresh };
}
