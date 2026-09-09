import {
  ArrowDownToLine,
  Copy,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  TerminalSquare,
  Trash2,
} from 'lucide-react';
import { call } from '../../platform/desktop/api';
import { absolutePath, basename, dirname } from '../../shared/lib/paths';
import type { WorkspaceController } from '../hooks/useWorkspace';
type Props = {
  model: Pick<
    WorkspaceController,
    | 'context'
    | 'project'
    | 'newEntry'
    | 'copyText'
    | 'setClipboard'
    | 'setContext'
    | 'notify'
    | 'clipboard'
    | 'pasteEntry'
    | 'fail'
    | 'addPane'
    | 'renameEntry'
    | 'deleteEntry'
  >;
};
export default function ExplorerContextMenu({ model }: Props) {
  const {
    context,
    project,
    newEntry,
    copyText,
    setClipboard,
    setContext,
    notify,
    clipboard,
    pasteEntry,
    fail,
    addPane,
    renameEntry,
    deleteEntry,
  } = model;
  if (!context || !project) return null;
  const handleStopPropagation: React.ComponentProps<'div'>['onClick'] = e => e.stopPropagation();
  const handleNewFile = () => void newEntry(false, context.entry.path);
  const handleNewFolder = () => void newEntry(true, context.entry.path);
  const handleCopyAbsolutePath = () =>
    void copyText(absolutePath(project.root, context.entry.path));
  const handleCopyRelativePath = () => void copyText(context.entry.path || '.');
  const handleCopyEntry = () => {
    setClipboard({ root: project.root, path: context.entry.path });
    setContext(null);
    notify('File copied. Choose a folder and Paste to duplicate it.');
  };
  const handlePasteEntry = () => void pasteEntry(context.entry.path);
  const handleRevealEntry = () => {
    void call('reveal_entry', { root: project.root, path: context.entry.path }).catch(fail);
    setContext(null);
  };
  const handleOpenTerminal = () => {
    addPane(
      basename(context.entry.path) || 'Terminal',
      '',
      context.entry.isDir ? context.entry.path : dirname(context.entry.path)
    );
    setContext(null);
  };
  const handleRenameEntry = () => void renameEntry(context.entry);
  const handleTrashEntry = () => void deleteEntry(context.entry);

  return (
    context &&
    project && (
      <div
        className='context-menu popover'
        style={{
          left: Math.min(context.x, window.innerWidth - 250),
          top: Math.max(10, Math.min(context.y, window.innerHeight - 375)),
        }}
        onClick={handleStopPropagation}
        role='menu'
      >
        <div className='context-label'>{context.entry.name}</div>
        {context.entry.isDir && (
          <>
            <button className='menu-item' onClick={handleNewFile}>
              <FilePlus2 size={14} />
              New file…
            </button>
            <button className='menu-item' onClick={handleNewFolder}>
              <FolderPlus size={14} />
              New folder…
            </button>
          </>
        )}
        <button className='menu-item' onClick={handleCopyAbsolutePath}>
          <Copy size={14} />
          Copy absolute path
        </button>
        <button className='menu-item' onClick={handleCopyRelativePath}>
          <Copy size={14} />
          Copy relative path
        </button>
        {context.entry.path && (
          <button className='menu-item' onClick={handleCopyEntry}>
            <Copy size={14} />
            Copy file or folder
          </button>
        )}
        {context.entry.isDir && (
          <button
            disabled={!clipboard || clipboard.root !== project.root}
            className='menu-item'
            onClick={handlePasteEntry}
          >
            <ArrowDownToLine size={14} />
            Paste…
          </button>
        )}
        <div className='menu-divider' />
        <button className='menu-item' onClick={handleRevealEntry}>
          <FolderOpen size={14} />
          Show in system file manager
        </button>
        <button className='menu-item' onClick={handleOpenTerminal}>
          <TerminalSquare size={14} />
          Open terminal here
        </button>
        {context.entry.path && (
          <>
            <div className='menu-divider' />
            <button className='menu-item' onClick={handleRenameEntry}>
              <MoreHorizontal size={14} />
              Rename…
            </button>
            <button className='menu-item danger-text' onClick={handleTrashEntry}>
              <Trash2 size={14} />
              Move to trash…
            </button>
          </>
        )}
      </div>
    )
  );
}
