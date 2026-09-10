# Resolve merge conflicts

Open **Source Control → Resolve conflicts…**, click a conflicted file, or use
**Resolve conflicts…** in the branch menu. Emdeck also opens the dialog when a
merge, rebase or update started from its Git controls produces conflicts.

The file list shows the remaining conflicts. Select a file to inspect both
versions, then choose:

- **Accept Ours** or **Accept Theirs** to apply that complete version and stage
  the file. When that side deleted the file, the button says **delete file**.
- **Merge manually** to edit the result between the two original versions. Use
  **Use ours**, **Use theirs** or **Use both** for the next conflict block, or
  edit the result directly. **Save and mark resolved** becomes available after
  all conflict markers have been removed. The common ancestor is available below
  the editor.

Each file is resolved independently. When the list is empty, close the dialog,
review the staged changes and use **Continue merge/rebase** in Source Control.
Applying a file does not automatically continue the Git operation or commit it.

During a rebase, Ours means the destination being rebased onto; Theirs means the
commit being replayed. The modal labels these roles explicitly, following
[Git's definition of ours and theirs](https://git-scm.com/docs/git-checkout#Documentation/git-checkout.txt---ours).

Manual drafts stay in the dialog while switching files and after failed saves.
Closing with unsaved merge edits asks whether to discard them. Save or close an
unsaved regular editor tab for the same file before using the merge dialog. If
the working file or Git index changed since loading, **Reload versions** keeps
your draft while loading the new source versions for review.

Binary files support complete-version choices. The merge editor has the same 5
MB limit as the regular editor; oversized files, symbolic links and submodule
conflicts report an explicit fallback to Git in a terminal.
