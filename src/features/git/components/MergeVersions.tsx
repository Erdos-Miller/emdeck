import type { ReactNode } from 'react';
import type {
  ConflictVersion,
  GitConflict,
  MergeEditorProps,
} from '../../../shared/contracts/gitConflicts';
import { conflicts, resolveConflict } from '../services/conflicts';

function VersionPreview({ label, version }: { label: string; version: ConflictVersion }) {
  return (
    <section className='merge-version' aria-label={label}>
      <h3>{label}</h3>
      {!version.exists ? (
        <p className='merge-placeholder'>File deleted in this version</p>
      ) : version.binary ? (
        <p className='merge-placeholder'>Binary file — accept a complete version</p>
      ) : (
        <pre tabIndex={0}>
          {version.content || <span className='merge-placeholder'>Empty file</span>}
        </pre>
      )}
    </section>
  );
}

interface Props {
  source: GitConflict;
  content: string;
  manual: boolean;
  busy: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  renderEditor: (props: MergeEditorProps) => ReactNode;
}

export default function MergeVersions({
  source,
  content,
  manual,
  busy,
  onChange,
  onSave,
  renderEditor,
}: Props) {
  const blocks = conflicts(content);
  return (
    <>
      <div className={`merge-panes ${manual ? 'manual' : ''}`} inert={busy}>
        <VersionPreview label={source.oursLabel} version={source.ours} />
        {manual && (
          <section className='merge-result' aria-label='Merged result'>
            <h3>
              Result{' '}
              <span>
                {blocks.length} conflict block{blocks.length === 1 ? '' : 's'} remaining
              </span>
            </h3>
            {blocks[0] && (
              <div
                className='merge-block-actions'
                role='group'
                aria-label='Resolve next conflict block'
              >
                <span>Next block:</span>
                {(['ours', 'theirs', 'both'] as const).map(choice => {
                  const handleBlock = () => onChange(resolveConflict(content, blocks[0], choice));
                  return (
                    <button key={choice} className='button secondary' onClick={handleBlock}>
                      Use {choice}
                    </button>
                  );
                })}
              </div>
            )}
            <div className='merge-result-editor'>
              {renderEditor({ path: source.path, content, onChange, onSave })}
            </div>
          </section>
        )}
        <VersionPreview label={source.theirsLabel} version={source.theirs} />
      </div>
      <details className='merge-base'>
        <summary>Common ancestor</summary>
        <pre>
          {source.base.exists
            ? (source.base.content ?? 'Binary common ancestor')
            : 'This file was added without a common ancestor.'}
        </pre>
      </details>
    </>
  );
}
