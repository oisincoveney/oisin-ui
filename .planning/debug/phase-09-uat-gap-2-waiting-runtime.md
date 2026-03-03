# Phase 09 UAT Gap 2 - Waiting snapshot + runtime error

- Symptom: diff panel stuck at "Waiting for diff snapshot" and runtime TypeError in xterm dimensions path.
- Cause 1: delayed scroll call can hit disposed xterm during remount churn.
- Cause 2: DiffPanel waiting state depends on updatedAt prop not currently wired from App.
