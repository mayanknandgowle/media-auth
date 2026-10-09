# ExecPlan guidance

Use a versioned Markdown ExecPlan under `docs/plans/YYYY-MM-DD-short-name.md` for substantial multi-step changes. Write a concise plan before major edits; routine local fixes do not require a new plan. Plans are living records, not permissions to expand scope.

Each plan must contain:

1. **Objective and scope**: user-visible outcome, explicit non-goals, acceptance criteria.
2. **Repository/context**: starting branch/state, existing architecture, relevant constraints and tooling.
3. **Current milestone**: what is being implemented now versus later.
4. **Architecture and boundaries**: domain, clients, adapters, data/permission flows; link ADRs for major decisions.
5. **Implementation steps**: ordered, independently reviewable work with progress status.
6. **Validation**: exact commands, deterministic fixtures, behavioral/security checks, observed results, environment limitations marked `NOT VERIFIED`.
7. **Dependencies and risks**: licensing, compatibility, resource/permission limits, unresolved decisions.
8. **Decisions/discoveries**: dated facts, changes of direction, rationale, deviations from the original request.
9. **Next milestones**: concrete follow-up work distinct from the current acceptance criteria.
10. **Deferred research and long-term ideas**: explicitly aspirational; never describe as shipped capabilities.

Keep the plan synchronized after major milestones, failures, decisions, and final review. Record evidence, not optimistic predictions. Durable engineering rules belong in `AGENTS.md`; detailed acceptance results belong in the plan or linked validation report. A plan is complete only when the implemented scope is checked and limitations are recorded accurately.
