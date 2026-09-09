import { BookOpen, Code2, Columns2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { isMarkdown } from '../services/markdown';
import type { EditorProps } from './Editor';
import Editor from './Editor';
const MarkdownPreview = lazy(() => import('./MarkdownPreview'));
type Mode = 'edit' | 'split' | 'preview';
export default function DocumentView(
  props: EditorProps & {
    root: string;
    onOpenFile: (path: string) => Promise<void>;
  }
) {
  const { file, root, onOpenFile, openPaths } = props;
  const markdown = isMarkdown(file.path);
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [anchor, setAnchor] = useState<{
    path: string;
    fragment: string;
    request: number;
  } | null>(null);
  const mode = markdown ? (modes[file.path] ?? 'preview') : 'edit';
  useEffect(() => {
    setModes(previous => {
      if (Object.keys(previous).every(path => openPaths.includes(path))) return previous;
      return Object.fromEntries(
        Object.entries(previous).filter(([path]) => openPaths.includes(path))
      );
    });
  }, [openPaths]);
  const navigate = (path: string, fragment: string) => {
    if (isMarkdown(path)) setModes(previous => ({ ...previous, [path]: 'preview' }));
    setAnchor(previous => ({ path, fragment, request: (previous?.request ?? 0) + 1 }));
    void onOpenFile(path);
  };
  return (
    <>
      {markdown && (
        <div className='document-toolbar'>
          <span>
            <BookOpen size={14} /> Markdown
          </span>
          <div className='document-modes' role='group' aria-label='Markdown view'>
            {(
              [
                ['edit', Code2, 'Edit'],
                ['split', Columns2, 'Split'],
                ['preview', BookOpen, 'Preview'],
              ] as const
            ).map(([value, Icon, label]) => {
              const handleModesClick = () =>
                setModes(previous => ({ ...previous, [file.path]: value }));
              return (
                <button key={value} aria-pressed={mode === value} onClick={handleModesClick}>
                  <Icon size={13} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className={`document-surface document-${mode}`}>
        <div className='document-source' hidden={mode === 'preview'}>
          <Editor {...props} />
        </div>
        {markdown && mode !== 'edit' && (
          <Suspense fallback={<div className='loading'>Opening preview…</div>}>
            <MarkdownPreview
              key={file.path}
              root={root}
              path={file.path}
              content={file.content}
              onNavigate={navigate}
              anchor={anchor?.path === file.path ? anchor : null}
            />
          </Suspense>
        )}
      </div>
    </>
  );
}
