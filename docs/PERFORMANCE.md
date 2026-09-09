# Windows beta measurements

The final 0.1.22 idle/six-terminal measurements and the separate 45-minute GUI
and two-hour backend soak results are in the
[release validation record](validation/0.1.22/VALIDATION.md). The baseline below
remains labeled with its original version.

Measured on 2026-09-09 with the local optimized Emdeck 0.1.20 build. These are
observations from one development machine, not minimum requirements or a
comparison with another IDE.

Machine: Windows 11 Pro 10.0.26200, Intel Core Ultra 7 265F (20 logical cores),
128 GiB RAM. Other development applications were running. Build tools: Node
22.21.1, Bun 1.3.6 and Rust 1.94.1. Executable SHA-256:
`3dfa4ce4a6e3ba3051267ed846062ffe9b24d54d274517091a5518ef4e601197`.

The native window and document were verified visible. Each workload ran for 120
seconds; sampling every five seconds excludes the initial CPU baseline.
Playwright connected to the real system WebView2, with no mocked desktop bridge.

| Workload                                                           | Samples | Average CPU, one core | Peak sampled CPU, one core | Average working-set sum | Average private bytes |
| ------------------------------------------------------------------ | ------: | --------------------: | -------------------------: | ----------------------: | --------------------: |
| Welcome screen, no project or terminals                            |      21 |                 0.40% |                      2.24% |              522.31 MiB |            222.54 MiB |
| Synthetic project, Markdown preview, six idle PowerShell terminals |      20 |                 0.71% |                      3.22% |             1428.50 MiB |            711.52 MiB |

The measurements include Emdeck, WebView2 and attached shell processes.
Working-set sums can count shared pages more than once; they are not the
machine's incremental RAM consumption. CPU percentages refer to one logical
core, not the whole 20-core machine. The six terminals were mounted in a
scrollable grid; not all were simultaneously visible. No provider agent was
running. Large output streams, agent processes, different shells, OS versions
and hardware can produce different results.

Raw samples: [idle](validation/0.1.20/windows-idle.json) and
[six terminals](validation/0.1.20/windows-six-terminals.json).

The separate two-hour native PTY soak streams synthetic output and repeatedly
resizes six shells. It does not include WebView rendering. Its final result and
the separately sampled process-tree memory belong in the release's validation
record; these short desktop observations do not substitute for that soak.
