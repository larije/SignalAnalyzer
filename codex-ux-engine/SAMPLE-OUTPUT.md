# Fictional worked example: UX AUDIT

This is a fictional report, not an actual product audit. No screenshot or application was supplied or inspected. The input is the desktop screenshot description below. “Reported” identifies fixture details, not independently observed UI behavior. Expected effects are hypotheses.

## Scope, user, task, evidence, and limits

**Scope:** the loaded desktop screen, described as 1440 pixels wide. **User:** a warehouse operator. **Task:** compare expected and scanned serial numbers and identify discrepancies requiring investigation. This task is stipulated, not established through research.

**Fictional screenshot description:** “Reconcile delivery” displays twelve product cards in three columns. Each card's upper half contains a photograph. Expected and scanned serials occupy separate lines, truncated after eight characters. Some serials share those prefixes. Cards have green or amber dots without text labels or a visible legend. “Complete reconciliation” appears above the grid. No expanded card, selection, error, or confirmation is described.

**Evidence:** the description supports layout and visible-content observations only. Interaction, permissions, data accuracy, persistence, and completion behavior are **not tested**. No files changed. No timing, error-rate, or quality score is reported.

## Overall assessment

The screen emphasizes product recognition while the task requires exact identifier comparison. Truncation is the clearest potential barrier. A compact desktop table merits validation with operators and project conventions. Expansion, tooltips, or another view may already offer workarounds.

## Findings

### 1. Exact serial comparison is unavailable in the described view

- **Location:** expected/scanned fields in every product card.
- **Severity:** High — hidden distinguishing characters create a major comparison barrier in this view.
- **Confidence:** Medium — truncation is explicit; workarounds and actual impact are unknown.
- **Observation:** **Reported in the description:** both identifiers are truncated. **Inferred:** operators may need repeated navigation or another comparison source.
- **Why it matters:** matching prefixes do not establish matching serials. Photographs consume space that could expose identifiers.
- **Fix:** propose a desktop table pairing full expected/scanned serials with existing product, status, and action fields. Reuse the project's component. Preserve matching rules, ordering, permissions, and completion behavior.
- **Expected effect:** hypothesis — easier comparison with fewer context switches. Cards may suit condition inspection or one-record-at-a-time work; the choice depends on the task.
- **Verification:** inspect existing reveal behavior. Compare the current layout and table prototype using shared-prefix serials, long values, and discrepancies. Record accuracy, time, and comments without predicting numerical gains.

### 2. Status meaning depends on an unexplained color cue

- **Location:** green and amber dots on product cards.
- **Severity:** Medium — unexplained cues may cause repeated friction during discrepancy scanning.
- **Confidence:** Medium — missing labels are explicit; familiarity and accessible names are unknown.
- **Observation:** **Reported in the description:** dots lack status text or a legend. **Inferred:** operators may misinterpret them.
- **Why it matters:** color alone does not explain the underlying business status.
- **Fix:** pair dots with domain status labels, confirmed in project documentation. Preserve status meanings and transitions.
- **Expected effect:** hypothesis — clearer recognition of records needing investigation.
- **Verification:** inspect status mappings, accessible names, operator interpretation, and color-independent meaning in the rendered interface.

## State, mobile, and accessibility coverage

Only the described loaded desktop state is covered. Loading, empty, error, partial reconciliation, success, and mobile states are **not tested**.

| Accessibility check | Result and evidence |
| --- | --- |
| Visible color-independent status meaning | **Fail in the fictional fixture** — dots lack text or a legend; real interface unverified. |
| Contrast and text scaling | **Not tested** — no pixels, styles, or browser available. |
| Keyboard, focus, and screen reader semantics | **Not tested** — no interactive interface or DOM available. |
| Media captions | **N/A** — no audio or video is described in scope. |

## Priorities and verification plan

1. Inspect full-serial access; prototype paired, untruncated identifiers.
2. Confirm domain status labels and expose them beside color cues.

Obtain the actual screen and project guidance. Inspect interactions and states; test desktop and narrow layouts with representative data. Run keyboard, screen reader, zoom, and contrast checks. Report outcomes separately from these hypotheses before implementation.
