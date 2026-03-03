# Phase 09 UAT Gap 1 - Overflow/Jitter when diff panel open

- Symptom: opening diff panel causes visible screen jitter/overflow-like thrash; closing panel stops it.
- Primary cause: terminal remount churn (App conditional TerminalView branches + unstable callback identity).
- Evidence: repeated WebGL context warnings, xterm lifecycle churn while toggling panel.
