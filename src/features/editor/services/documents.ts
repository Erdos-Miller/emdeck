import type { FileData, OpenFile } from '../../../shared/contracts/workspace';

export const hasUnsavedFiles = (files: readonly OpenFile[]): boolean =>
  files.some(file => file.content !== file.saved);

/** Reconcile against the current buffer, which may have changed while disk IO was pending. */
export const reconcileDocument = (file: OpenFile, disk: FileData | null): OpenFile => {
  if (!disk) return { ...file, external: true };
  if (file.revision === disk.revision) return file;
  return file.content !== file.saved
    ? { ...file, external: true }
    : { ...file, ...disk, saved: disk.content, external: false };
};
