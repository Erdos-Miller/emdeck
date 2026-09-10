import { useCallback } from 'react';
import { api } from '../../platform/desktop/api';
import { basename } from '../../shared/lib/paths';
import type { useWorkspaceRefresh } from './useWorkspaceRefresh';
import type { useWorkspaceState } from './useWorkspaceState';
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'expanded'
  | 'setExpanded'
  | 'fail'
  | 'latest'
  | 'setActive'
  | 'setActiveDiffId'
  | 'setReveal'
  | 'setWorktreesActive'
  | 'setTerminalFull'
  | 'setFiles'
  | 'active'
  | 'notify'
  | 'project'
  | 'file'
  | 'confirm'
  | 'activeDiffId'
  | 'diffTabs'
  | 'worktreesOpen'
  | 'setCursor'
> &
  Pick<ReturnType<typeof useWorkspaceRefresh>, 'refreshDirectory' | 'refreshGit'>;
export function useEditorActions({
  expanded,
  setExpanded,
  refreshDirectory,
  fail,
  latest,
  setActive,
  setActiveDiffId,
  setReveal,
  setWorktreesActive,
  setTerminalFull,
  setFiles,
  active,
  notify,
  refreshGit,
  project,
  file,
  confirm,
  activeDiffId,
  diffTabs,
  worktreesOpen,
  setCursor,
}: Dependencies) {
  const toggleFolder = async (path: string) => {
    if (expanded.has(path))
      setExpanded(s => {
        const next = new Set(s);
        next.delete(path);
        return next;
      });
    else {
      setExpanded(s => new Set(s).add(path));
      try {
        await refreshDirectory(path);
      } catch (e) {
        fail(e);
        setExpanded(s => {
          const next = new Set(s);
          next.delete(path);
          return next;
        });
      }
    }
  };
  const openFile = async (
    path: string,
    p = latest.current.project,
    target?: { line: number; column?: number }
  ) => {
    if (!p) return;
    if (target)
      setReveal(previous => ({ ...target, path, sequence: (previous?.sequence ?? 0) + 1 }));
    if (latest.current.files.some(f => f.path === path)) {
      setActive(path);
      setActiveDiffId(null);
      setWorktreesActive(false);
      setTerminalFull(false);
      return;
    }
    try {
      const data = await api.read(p.root, path);
      if (latest.current.project?.root !== p.root) return;
      setFiles(fs =>
        fs.some(f => f.path === path) ? fs : [...fs, { path, ...data, saved: data.content }]
      );
      setActive(path);
      setActiveDiffId(null);
      setWorktreesActive(false);
      setTerminalFull(false);
    } catch (e) {
      fail(e);
    }
  };
  const saveFile = async (path = active, refreshAfter = true) => {
    const p = latest.current.project,
      f = latest.current.files.find(f => f.path === path);
    if (!p || !f) return;
    const data = await api.save(p.root, f.path, f.content, f.revision);
    if (latest.current.project?.root !== p.root) return;
    setFiles(fs =>
      fs.map(item =>
        item.path === path
          ? { ...item, revision: data.revision, saved: data.content, external: false }
          : item
      )
    );
    notify(`Saved ${basename(path)}`);
    if (refreshAfter) void refreshGit();
  };
  const reloadFile = async () => {
    if (!project || !file) return;
    if (
      file.content !== file.saved &&
      !(await confirm(
        'Reload file from disk?',
        'Your unsaved edits will be discarded. The version on disk will be loaded.',
        'Reload',
        true
      ))
    )
      return;
    try {
      const data = await api.read(project.root, file.path);
      setFiles(fs =>
        fs.map(f =>
          f.path === file.path ? { ...f, ...data, saved: data.content, external: false } : f
        )
      );
    } catch (e) {
      fail(e);
    }
  };
  const closeFile = async (path: string) => {
    const f = latest.current.files.find(f => f.path === path);
    if (
      f &&
      f.content !== f.saved &&
      !(await confirm(
        'Close without saving?',
        `${basename(path)} has unsaved changes.`,
        'Discard changes',
        true
      ))
    )
      return;
    const remaining = latest.current.files.filter(f => f.path !== path);
    setFiles(remaining);
    if (active === path) {
      setActive(remaining.at(-1)?.path ?? '');
      if (!remaining.length && !activeDiffId) setActiveDiffId(diffTabs.at(-1)?.id ?? null);
      if (!remaining.length && !diffTabs.length && worktreesOpen) setWorktreesActive(true);
    }
  };
  const changeFile = useCallback(
    (path: string, content: string) =>
      setFiles(fs =>
        fs.map(f => (f.path === path && f.content !== content ? { ...f, content } : f))
      ),
    [setFiles]
  );
  const changeCursor = useCallback(
    (line: number, column: number) => setCursor({ line, column }),
    [setCursor]
  );
  return { toggleFolder, openFile, saveFile, reloadFile, closeFile, changeFile, changeCursor };
}
