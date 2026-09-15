import type {
  BranchComparison,
  BranchRequest,
  CreateWorktree,
  Entry,
  FileData,
  GitSnapshot,
  Shelf,
  UnshelveReport,
  Worktree,
} from './workspace';
import type { SshTarget } from './remote';
import type { MachineTarget, SessionAction } from './sessions';
import type { ConflictResolution, GitConflict } from './gitConflicts';
import type { DiscardPlan, DiscardRequest } from './gitDiscard';
import type { OpenProjectResult, OpenWindowResult } from './projects';

type Command<Args, Result> = { args: Args; result: Result };
type FileLocation = { root: string; path: string };
type Repository = { root: string };

/** Public IPC payloads. Window identity and authorization are injected by Tauri. */
export interface DesktopCommands {
  session_pair: Command<{ code: string; name: string }, { credential: string; address: string }>;
  session_forget: Command<{ credential: string }, void>;
  session_connect: Command<{ target: MachineTarget }, string>;
  session_request: Command<{ connection: string; action: SessionAction }, unknown>;
  session_disconnect: Command<{ connection: string }, void>;
  remote_session_args: Command<{ target: SshTarget }, string[]>;
  open_project: Command<{ path: string }, OpenProjectResult>;
  open_project_window: Command<{ path: string }, OpenWindowResult>;
  focus_project_window: Command<{ path: string }, string | null>;
  startup_project: Command<Record<string, never>, string | null>;
  read_directory: Command<FileLocation, Entry[]>;
  read_file: Command<FileLocation, FileData>;
  find_file: Command<{ root: string; name: string }, string[]>;
  read_image: Command<FileLocation, string>;
  save_file: Command<FileLocation & { content: string; revision: string }, FileData>;
  create_entry: Command<FileLocation & { directory: boolean }, void>;
  rename_entry: Command<Repository & { from: string; to: string }, void>;
  copy_entry: Command<Repository & { from: string; to: string }, void>;
  trash_entry: Command<FileLocation, void>;
  reveal_entry: Command<FileLocation, void>;
  open_external_url: Command<{ url: string }, void>;
  git_snapshot: Command<Repository, GitSnapshot>;
  git_discard_preview: Command<Repository & { paths: string[] }, DiscardPlan>;
  git_discard_apply: Command<Repository & { request: DiscardRequest }, void>;
  git_conflict: Command<FileLocation, GitConflict>;
  git_resolve_conflict: Command<Repository & { request: ConflictResolution }, void>;
  git_action: Command<
    Repository & { action: string; value: string; original: string | null },
    string
  >;
  git_branch_action: Command<Repository & { request: BranchRequest }, string>;
  git_compare: Command<
    Repository & { base: string; head: string; working: boolean },
    BranchComparison
  >;
  git_diff: Command<FileLocation & { staged: boolean }, string>;
  git_worktrees: Command<Repository, Worktree[]>;
  git_worktree_create: Command<Repository & { request: CreateWorktree }, string>;
  git_worktree_remove: Command<FileLocation, void>;
  shelf_list: Command<Repository, Shelf[]>;
  shelf_create: Command<Repository & { name: string; paths: string[] }, Shelf>;
  shelf_apply: Command<Repository & { id: string; force: boolean }, UnshelveReport>;
  shelf_delete: Command<Repository & { id: string }, void>;
}

export type DesktopCommand = keyof DesktopCommands;
export type CommandArguments<C extends DesktopCommand> = DesktopCommands[C]['args'];
export type CommandResult<C extends DesktopCommand> = DesktopCommands[C]['result'];
