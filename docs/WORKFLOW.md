# Development workflow — role-based agents

The **main Claude Code session is the orchestrator**. Subagents can't spawn other subagents, so the main session
runs the pipeline and hands each stage to a specialist in `.claude/agents/`. Start a feature with:

```
/feature "barcode scanning"          # runs the whole pipeline with human gates
/ship                                # release checklist (build, store, OTA)
```

## Pipeline
```
 idea ─► [product-manager] ─► spec ─► 🧑 GATE 1 approve spec
                                         │
                       [architect] ◄─────┘   tech plan + ADR + task split
                           │
               ┌───────────┴───────────┐     (parallel, separate git worktrees)
     [backend-engineer]        [mobile-engineer]
               └───────────┬───────────┘
                     [qa-engineer]  ── fail ──► back to the owning engineer (max 2 loops, then escalate to human)
                           │ pass
          [security-privacy-reviewer] + [code-reviewer]   (fresh context, never saw the work being written)
                           │
                    🧑 GATE 2 merge PR
                           │
                   [release-manager]  (on /ship)
```

## Artifacts per feature
`docs/specs/NNN-<slug>.md` holds everything: the PM section, then the architect's plan, then the QA report and review notes.
One feature = one branch `feat/NNN-<slug>` = one PR.

## Definition of Done
- [ ] Acceptance criteria in spec all have a passing test (unit, pgTAP or Maestro)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green
- [ ] RLS tests for any new table
- [ ] No secrets in client bundle; new env vars documented in `.env.example`
- [ ] Analytics events from spec implemented
- [ ] Accessibility labels on new interactive elements
- [ ] Spec updated with what actually shipped

## Field-test measurement
After each stage the orchestrator appends a row to `docs/experiments/agent-log.md`.
That data answers whether the role-based setup beats a single agent.
