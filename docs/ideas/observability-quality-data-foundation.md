# Idea: Observability Quality Data Foundation

## Status

- `state`: candidate
- `commitment`: thought
- `classification`: new_concern
- `createdAt`: 2026-05-26
- `lastUpdatedAt`: 2026-05-26

This is an Idea, not a committed requirement, Spec, Issue, or Work item.

## Scope

Capture the possible direction that LinX may need a shared data foundation for
quality feedback, observability, and optimization loops across product features
and agent runtimes.

This record intentionally does not define implementation work yet.

## Source Messages

- Current Codex conversation on 2026-05-26 about whether models should define
  effect-optimization and monitoring reports.
- Current Codex conversation on 2026-05-26 about the risk of modeling from
  optimization goals instead of stable facts.

Concrete message URIs are not available in this portable Codex session. When
projected into LinX, these should become `sourceMessages` relations.

## Area

- `models`
- `observability`
- `quality-feedback`
- `agent-runtime`
- `symphony-control-plane`

## Current Understanding

Business models are already difficult to unify. Modeling directly from desired
optimization effects would be harder and likely unstable.

The preferred direction is:

- core models record stable facts about what happened;
- append-only observation/audit facts record why the system acted and what
  happened afterward;
- metric reports and optimization scores are derived views, not the source of
  truth;
- dashboards and quality loops should not force product-specific telemetry
  schemas into every feature.

This principle may apply beyond approval/grant. It could become a general LinX
modeling rule for AI-controlled systems, runtime quality, Symphony, auto mode,
workers, and future product feedback loops.

## Open Questions

- Should `@undefineds.co/models` define a generic `Observation` or
  `Evaluation` resource, or should existing `Audit`, `RunStep`, `Evidence`,
  and feature resources be extended first?
- What is the smallest shared shape that supports quality reporting without
  becoming a generic telemetry sink?
- Which fields are stable cross-domain facts, and which belong only in report
  jobs or dashboard definitions?
- How should privacy and access control work for observation records that point
  to sensitive approvals, secrets, worker transcripts, logs, or runtime inputs?
- How should LinX handle portable runtimes such as Codex or Claude Code where
  the initial control record is file-backed instead of Pod-backed?

## Related Records

- `docs/symphony-system-evolution-control-plane.md`
- `skills/symphony/SKILL.md`
- `docs/approval-grant-design.md`
- `docs/cli-app-shared-core.md`

## Possible Conflicts

- Do not create a separate private telemetry model per CLI/Web/runtime surface.
- Do not put metric formulas or product-stage optimization scores into core
  domain schema as if they were stable business facts.
- Do not lose evidence needed for audit, replay, explanation, recovery, or
  cross-surface consistency.

## Promotion Gate State

Requirement Candidate gate:

- Problem: partial. The system needs reliable quality feedback without schema
  pollution.
- Area: clear enough for candidate state.
- Value: partial. Expected value is better observability and safer optimization.
- Current understanding: captured above.
- Open questions: captured above.

Spec gate:

- Expected behavior: not defined.
- Scope and non-scope: not defined enough.
- Compatibility impact: unknown.
- Acceptance: not defined.
- Commitment: not committed.

Work gate:

- Implementation boundary: not defined.
- Evidence plan: not defined.
- Blocker rules: not defined.

## Next Step

Keep discussing until the boundary is clear. If this direction becomes
committed, promote it to a Requirement Candidate for a shared observability /
quality-feedback model and compare it with existing `Audit`, `RunStep`,
`Evidence`, and report resources before adding any new schema.
