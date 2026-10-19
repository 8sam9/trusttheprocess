---
description: Run the full role-based agent pipeline for a feature
argument-hint: "<feature idea>"
---
You are the orchestrator. Run docs/WORKFLOW.md for: $ARGUMENTS

1. Delegate to **product-manager** → spec file. Show the human the acceptance criteria and open questions, then **STOP for GATE 1 approval**.
2. After approval, create branch `feat/NNN-<slug>`. Delegate to **architect** → technical plan.
3. Delegate the BACKEND and MOBILE task lists to **backend-engineer** and **mobile-engineer** (in parallel when the contract in packages/shared is defined first).
4. Delegate to **qa-engineer**. On FAIL, send each bug to its owner; re-run QA. Max 2 loops, then stop and ask the human.
5. Run **security-privacy-reviewer** and **code-reviewer** in parallel. Paste both reports into the spec. Fix every must-fix/Critical/High through the owning engineer.
6. Commit, push, open a PR summarising the spec, and **STOP for GATE 2** (human merge).
After every stage, append a row to docs/experiments/agent-log.md (stage, model, wall time, rework, notes).
