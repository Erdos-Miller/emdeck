import { useEffect, useRef, useState } from 'react';
import type {
  ConflictChoice,
  ConflictPort,
  GitConflict,
} from '../../../shared/contracts/gitConflicts';
import { useLatest } from '../../../shared/hooks/useLatest';
import { hasConflictMarkers } from '../services/conflicts';

interface Draft {
  source: GitConflict;
  content: string;
  manual: boolean;
}
interface Options {
  paths: string[];
  initialPath?: string;
  port: ConflictPort;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
}

export function useConflictResolution({
  paths,
  initialPath,
  port,
  onDirtyChange,
  onClose,
}: Options) {
  const [selected, setSelected] = useState(
    initialPath && paths.includes(initialPath) ? initialPath : (paths[0] ?? '')
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const savingRef = useRef(false);
  const callbacks = useLatest({ port, onDirtyChange, onClose });
  const remaining = paths;
  const draft = drafts[selected];
  const dirty = Object.values(drafts).some(
    draft => draft.manual && draft.content !== (draft.source.working.content ?? '')
  );
  useEffect(() => {
    if (!saving && !dirty && !paths.includes(selected)) setSelected(paths[0] ?? '');
  }, [paths, selected, saving, dirty]);
  useEffect(() => {
    callbacks.current.onDirtyChange(dirty);
  }, [dirty, callbacks]);
  useEffect(() => () => callbacks.current.onDirtyChange(false), [callbacks]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void callbacks.current.port
      .read(selected)
      .then(source => {
        if (cancelled) return;
        setDrafts(previous => {
          const existing = previous[selected];
          return {
            ...previous,
            [selected]: {
              source,
              content: existing?.manual ? existing.content : (source.working.content ?? ''),
              manual: existing?.manual ?? false,
            },
          };
        });
      })
      .catch(error => {
        if (!cancelled) setError(String(error).replace(/^Error: /, ''));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, reload, callbacks]);
  const select = (path: string) => {
    if (!savingRef.current) {
      setSelected(path);
      setDiscarding(false);
    }
  };
  const change = (content: string) => {
    if (savingRef.current) return;
    setDrafts(previous =>
      previous[selected]
        ? { ...previous, [selected]: { ...previous[selected], content, manual: true } }
        : previous
    );
  };
  const startManual = () => {
    if (draft && !savingRef.current)
      setDrafts(previous => ({ ...previous, [selected]: { ...draft, manual: true } }));
  };
  const resolve = async (choice: ConflictChoice) => {
    if (!draft || loading || savingRef.current) return;
    if (choice === 'manual' && hasConflictMarkers(draft.content)) {
      setError('Resolve all conflict markers before saving the result.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await callbacks.current.port.resolve({
        path: selected,
        revision: draft.source.revision,
        choice,
        ...(choice === 'manual' ? { content: draft.content } : {}),
      });
      setDrafts(previous =>
        Object.fromEntries(Object.entries(previous).filter(([path]) => path !== selected))
      );
      setSelected(remaining.find(path => path !== selected) ?? '');
    } catch (error) {
      setError(String(error).replace(/^Error: /, ''));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const close = () => {
    if (savingRef.current) return;
    if (dirty) setDiscarding(true);
    else callbacks.current.onClose();
  };
  const discard = () => callbacks.current.onClose();
  const keepEditing = () => setDiscarding(false);
  const reloadVersions = () => {
    if (!savingRef.current) setReload(value => value + 1);
  };
  return {
    selected,
    remaining,
    draft,
    loading,
    saving,
    error,
    discarding,
    select,
    change,
    startManual,
    resolve,
    close,
    discard,
    keepEditing,
    reloadVersions,
  };
}
