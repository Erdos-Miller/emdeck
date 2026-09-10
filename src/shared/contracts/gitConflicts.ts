export interface ConflictVersion {
  exists: boolean;
  content: string | null;
  binary: boolean;
}

export interface GitConflict {
  path: string;
  revision: string;
  base: ConflictVersion;
  ours: ConflictVersion;
  theirs: ConflictVersion;
  working: ConflictVersion;
  oursLabel: string;
  theirsLabel: string;
  manualAllowed: boolean;
}

export type ConflictChoice = 'ours' | 'theirs' | 'manual';
export interface ConflictResolution {
  path: string;
  revision: string;
  choice: ConflictChoice;
  content?: string;
}

export interface ConflictPort {
  read: (path: string) => Promise<GitConflict>;
  resolve: (request: ConflictResolution) => Promise<void>;
}

export interface MergeEditorProps {
  path: string;
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
}
