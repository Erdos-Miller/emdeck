import type { useConflictResolution } from '../hooks/useConflictResolution';
import { hasConflictMarkers } from '../services/conflicts';

interface Props {
  model: Pick<
    ReturnType<typeof useConflictResolution>,
    'draft' | 'loading' | 'saving' | 'discarding' | 'close' | 'discard' | 'keepEditing'
  >;
  onSave: () => void;
}

export default function ConflictFooter({ model, onSave }: Props) {
  const { draft, saving, loading, discarding, close, discard, keepEditing } = model;
  const unresolved = draft ? hasConflictMarkers(draft.content) : false;
  return (
    <footer className='merge-footer'>
      {discarding ? (
        <>
          <span>Discard unsaved manual merge edits?</span>
          <button className='button secondary' onClick={keepEditing}>
            Keep editing
          </button>
          <button className='button danger' onClick={discard}>
            Discard merge edits
          </button>
        </>
      ) : (
        <>
          <span>
            {saving
              ? 'Saving and staging…'
              : unresolved && draft?.manual
                ? 'Resolve every marker before saving.'
                : ''}
          </span>
          <button className='button secondary' disabled={saving} onClick={close}>
            Close
          </button>
          {draft?.manual && (
            <button
              className='button primary'
              disabled={loading || saving || !draft.source.manualAllowed || unresolved}
              onClick={onSave}
            >
              Save and mark resolved
            </button>
          )}
        </>
      )}
    </footer>
  );
}
