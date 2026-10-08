# RESTYLE

Improve the requested visual UI while preserving business behavior. Use the shared boundaries, design principles, and verification reference from SKILL.md.

Before editing, identify applicable project design rules and record a brief preservation checklist for affected behavior: important fields, filters, sorting, selection, pagination, row actions, validation, persistence, and permissions as relevant. This is a task-specific checklist, not a request to inventory the whole app.

Establish hierarchy, grouping, spacing, typography, color semantics, component consistency, and responsive behavior using existing primitives. Preserve the project's brand and deliberate density. Remove decorative noise only where it competes with the task. Keep meaningful icons, grouping, and status cues.

Do not infer permission to remove a column, filter, bulk action, validation rule, or workflow because it complicates the design. A user-authorized behavior change may be implemented; other behavior changes remain recommendations. Keep complete identifiers discoverable and usable for the task.

Implement a coherent change to the requested surface. Check the preservation checklist and relevant responsive/accessibility states, and run existing lint/typecheck/tests appropriate to the files changed. Use available browser tools when possible; if the UI cannot run, inspect the diff and report visual checks as not tested.

Deliver a short account of the changes, affected files, checks and results, and any remaining limits. Expected usability gains remain hypotheses unless assessed with task evidence.
