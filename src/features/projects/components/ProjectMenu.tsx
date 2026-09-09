import { ArrowRightLeft, ChevronDown, ExternalLink, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { OpenTarget } from '../../../shared/contracts/projects';
import type { Project } from '../../../shared/contracts/workspace';
export default function ProjectMenu({
  project,
  recent,
  onOpen,
}: {
  project: Project | null;
  recent: Project[];
  onOpen: (path?: string, target?: OpenTarget) => void;
}) {
  const handleProjectsClick = () => setOpen(value => !value);
  const handleOpenClick = () => setOpen(false);
  const handleClick = () => choose(undefined, 'new');
  const handleClick2 = () => choose(undefined, 'current');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    if (open) document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const choose = (path: string | undefined, target: OpenTarget) => {
    setOpen(false);
    onOpen(path, target);
  };
  return (
    <div className='project-menu-wrapper'>
      <button
        className='project-switch'
        title='Projects'
        aria-haspopup='menu'
        aria-expanded={open}
        onClick={handleProjectsClick}
      >
        <FolderOpen size={15} />
        <span>{project?.name ?? 'Open workspace'}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className='popover-dismiss' onClick={handleOpenClick} />
          <div className='project-popover popover' role='menu' aria-label='Projects'>
            <div className='popover-title'>PROJECTS</div>
            <button className='menu-item' role='menuitem' onClick={handleClick}>
              <ExternalLink size={14} />
              Open project in new window…
            </button>
            <button className='menu-item' role='menuitem' onClick={handleClick2}>
              <ArrowRightLeft size={14} />
              {project ? 'Replace project in this window…' : 'Open project in this window…'}
            </button>
            {recent.length > 0 && (
              <>
                <div className='menu-divider' />
                <div className='popover-title'>RECENT PROJECTS</div>
                {recent.slice(0, 6).map(item => {
                  const handleClick = () => choose(item.root, 'auto');
                  return (
                    <button
                      className='menu-item recent-project-menu-item'
                      role='menuitem'
                      key={item.root}
                      title={item.root.replace(/^\\\\\?\\/, '')}
                      onClick={handleClick}
                    >
                      <FolderOpen size={14} />
                      <span className='truncate'>{item.name}</span>
                      <ExternalLink size={12} />
                    </button>
                  );
                })}
              </>
            )}
            <p className='popover-note'>
              Each window keeps its own editor tabs, Git view, and terminal sessions.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
