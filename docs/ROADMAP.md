# Feedback and roadmap

Help shape Emdeck in public. This page links to live queues rather than a second
list that can drift out of date. A queue may be empty while the community grows.

| Stage        | Meaning                                                     | Live queue                                                                                                                      |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Ideas        | Discuss a workflow, ask questions, and vote on proposals.   | [Ideas board](https://github.com/Erdos-Miller/emdeck/discussions/categories/ideas)                                              |
| Needs triage | A bug or feature request awaiting maintainer review.        | [New reports](https://github.com/Erdos-Miller/emdeck/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22status%3A%20triage%22)        |
| Planned      | Accepted scope; no delivery date implied.                   | [Planned work](https://github.com/Erdos-Miller/emdeck/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22status%3A%20planned%22)      |
| In progress  | Implementation has started with a linked PR or contributor. | [Active work](https://github.com/Erdos-Miller/emdeck/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22status%3A%20in%20progress%22) |
| In review    | A proposed implementation is awaiting review.               | [Under review](https://github.com/Erdos-Miller/emdeck/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22status%3A%20review%22)       |
| Completed    | Resolved reports; release notes say when changes ship.      | [Completed issues](https://github.com/Erdos-Miller/emdeck/issues?q=is%3Aissue%20is%3Aclosed%20reason%3Acompleted)               |

## Posting feedback

Use the
[bug form](https://github.com/Erdos-Miller/emdeck/issues/new?template=bug.yml)
for broken behavior and the
[feature form](https://github.com/Erdos-Miller/emdeck/issues/new?template=feature.yml)
for a concrete request. Start broader proposals on the Ideas board; maintainers
can turn an agreed proposal into a linked issue. Use
[Q&A](https://github.com/Erdos-Miller/emdeck/discussions/categories/q-a) for
help.

Search before posting. Upvote an existing idea or add a 👍 reaction to an issue
instead of posting “+1”. Add examples when your use case provides new
information. Votes inform priorities; maintainers also consider reliability,
scope, and the cost to maintain the feature. No delivery dates are promised by
these labels.

## Triage for maintainers

New issue forms add a type label and `status: triage`. Keep one status label on
each open issue. Apply `status: needs information` when reproduction details are
missing, or `status: blocked` when another task must be completed first. Link
related discussions, duplicates, and implementation PRs.

Move accepted work through Planned → In progress → In review, then close it as
completed when the implementation merges. Close duplicates or declined requests
with an explanation and GitHub's **not planned** reason. Use release notes to
distinguish merged source from available downloads. Do not auto-close reports
solely because they are old.
