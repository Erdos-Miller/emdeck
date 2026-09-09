import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import type { Change, Entry, Project } from '../../../shared/contracts/workspace';
import { FileIcon } from '../../../shared/ui/FileIcon';
interface Props {
  project: Project;
  directories: Record<string, Entry[]>;
  expanded: Set<string>;
  selected: string;
  showHidden: boolean;
  changes: Change[];
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onContext: (entry: Entry, x: number, y: number) => void;
  onRefresh: () => void;
  onNew: (directory: boolean) => void;
  onCollapse: () => void;
}
export default function Explorer(props: Props) {
  const handleFilterLoadedFilesClick = () => {
    setSearching(s => !s);
    setFilter('');
  };
  const handleContextContextMenu: React.ComponentProps<'div'>['onContextMenu'] = e => {
    e.preventDefault();
    props.onContext(
      { name: project.name, path: '', isDir: true, isSymlink: false },
      e.clientX,
      e.clientY
    );
  };
  const handleNewFileClick = () => props.onNew(false);
  const handleNewFolderClick = () => props.onNew(true);
  const handleFilterLoadedFilesChange: React.ComponentProps<'input'>['onChange'] = e =>
    setFilter(e.target.value);
  const [filter, setFilter] = useState('');
  const [searching, setSearching] = useState(false);
  const { project, directories, expanded, selected, showHidden, changes } = props;
  const render = (parent: string, depth: number): React.ReactNode =>
    (directories[parent] ?? [])
      .filter(e => showHidden || !e.name.startsWith('.'))
      .map(entry => {
        const handleToggleClick = () =>
          entry.isDir ? props.onToggle(entry.path) : props.onOpen(entry.path);
        const handleContextContextMenu: React.ComponentProps<'button'>['onContextMenu'] = e => {
          e.preventDefault();
          props.onContext(entry, e.clientX, e.clientY);
        };
        const open = expanded.has(entry.path);
        const status = changes.find(c => c.path === entry.path);
        if (filter && !entry.isDir && !entry.name.toLowerCase().includes(filter.toLowerCase()))
          return null;
        return (
          <div key={entry.path} role='none'>
            <button
              role='treeitem'
              aria-level={depth + 1}
              aria-expanded={entry.isDir ? open : undefined}
              aria-selected={selected === entry.path}
              className={`tree-row ${selected === entry.path ? 'selected' : ''}`}
              style={{ paddingLeft: 12 + depth * 16 }}
              onClick={handleToggleClick}
              onContextMenu={handleContextContextMenu}
              title={entry.path}
            >
              <span className='tree-chevron'>
                {entry.isDir && (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
              </span>
              {entry.isDir ? (
                open ? (
                  <FolderOpen size={15} className='folder-icon' />
                ) : (
                  <Folder size={15} className='folder-icon' />
                )
              ) : (
                <FileIcon path={entry.path} />
              )}
              <span className='truncate'>{entry.name}</span>
              {entry.isSymlink && <Link2 size={11} />}
              {status && (
                <span className={`git-letter ${status.conflict ? 'conflict' : ''}`}>
                  {status.conflict
                    ? '!'
                    : status.index === '?'
                      ? 'U'
                      : status.working.trim() || status.index}
                </span>
              )}
            </button>
            {entry.isDir && open && (
              <div role='group'>
                {directories[entry.path] ? (
                  directories[entry.path].length ? (
                    render(entry.path, depth + 1)
                  ) : (
                    <div className='tree-empty' style={{ paddingLeft: 44 + depth * 16 }}>
                      Empty folder
                    </div>
                  )
                ) : (
                  <div className='tree-empty' style={{ paddingLeft: 44 + depth * 16 }}>
                    Loading…
                  </div>
                )}
              </div>
            )}
          </div>
        );
      });
  return (
    <>
      <div className='sidebar-heading'>
        <span>EXPLORER</span>
        <span className='spacer' />
        <button
          className='icon-button'
          title='Filter loaded files'
          onClick={handleFilterLoadedFilesClick}
        >
          <Search size={14} />
        </button>
        <button className='icon-button' title='Refresh explorer' onClick={props.onRefresh}>
          <RefreshCw size={13} />
        </button>
      </div>
      <div className='project-tree-heading' onContextMenu={handleContextContextMenu}>
        <ChevronDown size={13} />
        <strong>{project.name}</strong>
        <span className='spacer' />
        <button className='icon-button' title='New file' onClick={handleNewFileClick}>
          <FilePlus2 size={13} />
        </button>
        <button className='icon-button' title='New folder' onClick={handleNewFolderClick}>
          <FolderPlus size={13} />
        </button>
        <button className='icon-button' title='Collapse folders' onClick={props.onCollapse}>
          <ChevronsDownUp size={13} />
        </button>
      </div>
      {searching && (
        <div className='tree-filter'>
          <input
            autoFocus
            placeholder='Filter loaded files…'
            value={filter}
            onChange={handleFilterLoadedFilesChange}
            aria-label='Filter loaded files'
          />
          <small>Only expanded folders are searched.</small>
        </div>
      )}
      <div className='file-tree' role='tree' aria-label='Project files'>
        {render('', 0)}
      </div>
      <div className='explorer-bottom'>
        <span className='tiny-dot' />
        <span>Loaded on demand</span>
        <span className='spacer' />
        <span>{Object.values(directories).reduce((n, es) => n + es.length, 0)} entries</span>
      </div>
    </>
  );
}
