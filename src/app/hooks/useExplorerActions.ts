import { call } from '../../platform/desktop/api';
import type { Entry } from '../../shared/contracts/workspace';
import { basename, dirname, join } from '../../shared/lib/paths';
import type { useEditorActions } from './useEditorActions';
import type { useWorkspaceRefresh } from './useWorkspaceRefresh';
import type { useWorkspaceState } from './useWorkspaceState';
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'setContext'
  | 'project'
  | 'ask'
  | 'setExpanded'
  | 'fail'
  | 'files'
  | 'notify'
  | 'setFiles'
  | 'active'
  | 'setActive'
  | 'setDirectories'
  | 'confirm'
  | 'clipboard'
> &
  Pick<ReturnType<typeof useWorkspaceRefresh>, 'refreshDirectory' | 'refreshGit'> &
  Pick<ReturnType<typeof useEditorActions>, 'openFile'>;
export function useExplorerActions({
  setContext,
  project,
  ask,
  refreshDirectory,
  setExpanded,
  openFile,
  fail,
  files,
  notify,
  setFiles,
  active,
  setActive,
  setDirectories,
  refreshGit,
  confirm,
  clipboard,
}: Dependencies) {
  const newEntry = async (directory: boolean, parent = '') => {
    setContext(null);
    if (!project) return;
    const data = await ask({
      title: directory ? 'New folder' : 'New file',
      submit: 'Create',
      fields: [
        { name: 'name', label: 'Name', placeholder: directory ? 'components' : 'untitled.ts' },
      ],
    });
    if (!data) return;
    try {
      const path = join(parent, data.name);
      await call('create_entry', { root: project.root, path, directory });
      await refreshDirectory(parent);
      if (parent) setExpanded(s => new Set(s).add(parent));
      if (!directory) await openFile(path);
    } catch (e) {
      fail(e);
    }
  };
  const renameEntry = async (entry: Entry) => {
    setContext(null);
    if (!project) return;
    if (
      files.some(
        f => (f.path === entry.path || f.path.startsWith(entry.path + '/')) && f.content !== f.saved
      )
    ) {
      notify('Save open files in this location before renaming.', true);
      return;
    }
    const data = await ask({
      title: 'Rename',
      fields: [{ name: 'name', label: 'New name', value: entry.name }],
    });
    if (!data) return;
    try {
      const to = join(dirname(entry.path), data.name);
      await call('rename_entry', { root: project.root, from: entry.path, to });
      setFiles(fs =>
        fs.map(f =>
          f.path === entry.path || f.path.startsWith(entry.path + '/')
            ? { ...f, path: to + f.path.slice(entry.path.length) }
            : f
        )
      );
      if (active === entry.path || active.startsWith(entry.path + '/'))
        setActive(to + active.slice(entry.path.length));
      setExpanded(new Set());
      setDirectories({});
      await refreshDirectory();
      void refreshGit();
    } catch (e) {
      fail(e);
    }
  };
  const deleteEntry = async (entry: Entry) => {
    setContext(null);
    if (
      !project ||
      !(await confirm(
        'Move to trash?',
        `${entry.name} will be moved to your system trash. Any unsaved edits in this location will be discarded.`,
        'Move to trash',
        true
      ))
    )
      return;
    try {
      await call('trash_entry', { root: project.root, path: entry.path });
      setFiles(fs => fs.filter(f => f.path !== entry.path && !f.path.startsWith(entry.path + '/')));
      if (active === entry.path || active.startsWith(entry.path + '/')) setActive('');
      await refreshDirectory(dirname(entry.path));
      void refreshGit();
    } catch (e) {
      fail(e);
    }
  };
  const pasteEntry = async (parent: string) => {
    setContext(null);
    if (!project || !clipboard || clipboard.root !== project.root) return;
    const data = await ask({
      title: 'Copy into folder',
      fields: [{ name: 'name', label: 'Copy name', value: basename(clipboard.path) }],
    });
    if (!data) return;
    try {
      await call('copy_entry', {
        root: project.root,
        from: clipboard.path,
        to: join(parent, data.name),
      });
      await refreshDirectory(parent);
      notify('Copy created.');
    } catch (e) {
      fail(e);
    }
  };
  const copyText = async (text: string) => {
    setContext(null);
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied to clipboard.');
    } catch (e) {
      fail(e);
    }
  };
  return { newEntry, renameEntry, deleteEntry, pasteEntry, copyText };
}
