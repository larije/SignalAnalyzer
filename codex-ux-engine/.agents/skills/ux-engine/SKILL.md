---
name: ux-engine
description: Use when auditing, reviewing, designing, or restyling web application UI/UX, especially dashboards, forms, tables, and operational workflows. Not for backend-only work or generic code review without a UX question.
---

# UX Engine

Improve task completion, clarity, and interaction quality using the project's existing visual language. Scale the work to the requested screen or change.

## Choose a mode

Match the user's intent and read the selected specification before working. Paths are relative to this skill directory; these Markdown files are supporting instructions, not registered slash commands.

| Request | Mode | Read | Editing |
|---|---|---|---|
| Assess usability, prioritize problems | UX AUDIT | [commands/ux-audit.md](commands/ux-audit.md) | Read-only unless fixes are requested |
| Give a short critique | UX REVIEW | [commands/ux-review.md](commands/ux-review.md) | Read-only unless fixes are requested |
| Design a screen or interaction | UX DESIGN | [commands/ux-design.md](commands/ux-design.md) | Implement when requested |
| Improve or implement the existing visual UI | RESTYLE | [commands/restyle.md](commands/restyle.md) | Implement within the request |

For audit plus fixes, assess first, then implement the requested fixes. A direct implementation request already authorizes that work; do not add a redundant approval step. For a design-only request, deliver the design. If intent remains ambiguous, provide a concise review and clarify before editing.

## Establish context

Inspect the target code and running UI when available. Identify the primary user, task, important data, device, and frequency of use. Check applicable project instructions, design documentation, components, and verification commands. For a new screen, inspect related patterns. Keep discovery proportional to scope.

Use supplied context first. State consequential unknowns; ask only when an answer is needed to make a safe, useful decision. Preserve existing behavior while those questions are unresolved.

## Boundaries

- Preserve existing business behavior unless the user's request authorizes a behavior change. Recommend additional behavior changes without implementing them.
- Reuse existing primitives and conventions. Keep changes local; add dependencies only when necessary for the requested result.
- Use applicable project design documentation and components as design authority, subject to user and repository instructions. The bundled starter is not project policy.
- Do not invent domain rules, remove access to needed information for appearance, or treat aesthetic preferences as measured usability defects.
- Separate observed evidence, inference, and behavior not tested. Never claim visual, keyboard, accessibility, or functional checks that were not performed. Predicted benefits are hypotheses until measured.

## Supporting guidance

- For critique or layout tradeoffs, read [design principles](references/design-principles.md).
- For audits, design state planning, or implementation checks, read [verification](references/verification.md). Apply only relevant checks; record unavailable checks explicitly.
- When a design system is requested and project documentation is absent, adapt [the starter template](assets/design-template.md) from observed conventions. Update project design documentation only when a change establishes a reusable rule.
- For an example audit format, read [the worked example](references/audit-example.md) when useful.

After implementation, run relevant available project checks, inspect the result where possible, and report changes, verification evidence, and remaining limits. Stop when the requested outcome and applicable checks are complete.
