# UX AUDIT

Assess the requested surface without editing it unless implementation is also requested. Use the shared boundaries in SKILL.md. Read its design-principles and verification references as routed there.

## Assessment

State the user, primary task, reviewed surface, available evidence, and limits. A screenshot supports visible layout observations; it does not prove behavior, responsiveness at other widths, focus order, or assistive-technology output. A description is reported evidence, not direct UI inspection. Do not call an unseen state missing.

Assess hierarchy, clarity, interactions, forms, data density, state coverage, responsive behavior, accessibility, and consistency where relevant. Report sound decisions too; do not manufacture an issue in every category.

## Findings

For each actionable finding include:

- **Location and evidence:** screen/component, code location or screenshot region when available; distinguish observed from inferred.
- **Severity and confidence:** use the anchors below, with a short rationale when uncertain.
- **Observation:** the concrete problem.
- **Why:** the affected task and consequence.
- **Fix:** a scoped recommendation preserving required behavior.
- **Expected effect:** a hypothesis unless measured.
- **Verification:** how to check whether the change helps and preserves the task.

| Severity | Anchor |
|---|---|
| Critical | Primary task is blocked or evidence shows a credible risk of serious harm or data loss |
| High | Major barrier or error risk in an important task |
| Medium | Repeated friction; a workable alternative exists |
| Low | Minor inconsistency or limited inconvenience |

Confidence is **High** for direct, relevant evidence; **Medium** for partial evidence; **Low** for an untested inference. Severity and confidence are separate: a serious suspected issue can have low confidence. Label it as suspected and prioritize confirmation.

Do not assign numeric UX scores by default. If the user requests scores, state the scale and anchors, show evidence for assessed dimensions, and exclude unassessed dimensions with an explanation. Disclose any weighting or aggregation. Do not imply a subjective score is a measured outcome.

## Default output

1. Scope, user/task, evidence, and limits.
2. Overall assessment.
3. Findings ordered by severity, confidence, and task frequency.
4. State, responsive, and accessibility coverage: pass / fail / not tested / not applicable with reason, supported by evidence.
5. Up to five highest-value changes and a verification plan.

Adapt presentation length to the request. Keep material evidence and limits even in a short audit. If fixes are requested, implement the scoped changes and report the actual verification results separately from proposed checks.
