# Codex UX Engine - revised bundle

A dependency-free, repo-local skill for evidence-based web UI/UX audits, reviews, designs, and restyling. It works with existing frontend conventions, including React, Next.js, Tailwind, and shadcn/ui, without requiring them.

## Install or update

1. Extract this ZIP.
2. Copy the included `.agents/skills/ux-engine/` folder to `<your-repository>/.agents/skills/ux-engine/`, preserving its contents. Do not place `SKILL.md` directly at the repository root.
3. If updating, back up or merge local customizations before replacing the old skill folder. The former skill-local `DESIGN.md` is now `assets/design-template.md`; remove that obsolete copy after preserving any customizations. Keep the project's actual `DESIGN.md`.
4. Optionally merge [AGENTS-UX-SNIPPET.md](AGENTS-UX-SNIPPET.md) into the project's existing `AGENTS.md`; do not overwrite unrelated instructions.

Codex discovers repo-local skills under `.agents/skills`. If it does not appear, restart or refresh the Codex session. This archive is a skill bundle, not a plugin or a registered set of slash commands.

## Use

- `$ux-engine Audit the inventory page. Suggest changes without editing.`
- `$ux-engine Give a concise UX REVIEW of this form.`
- `$ux-engine Design the new approval screen; do not implement yet.`
- `$ux-engine Restyle the dashboard and implement the changes, preserving behavior.`
- `$ux-engine Audit this page and implement the high-priority fixes within its existing behavior.`

Direct implementation requests authorize scoped edits. Audit/review and design-only requests remain read-only. Mention the task and available code, screenshots, or running UI for stronger results. The skill reads the selected mode's file; `commands/*.md` are internal specifications, not automatically installed `/ux-audit` commands.

## Contents

```text
codex-ux-engine/
  README.md
  AGENTS-UX-SNIPPET.md
  SAMPLE-OUTPUT.md
  EVALS.md
  TEST-RESULTS.md
  .agents/skills/ux-engine/
    SKILL.md
    commands/
      ux-audit.md
      ux-review.md
      ux-design.md
      restyle.md
    references/
      design-principles.md
      verification.md
      audit-example.md
    assets/
      design-template.md
```

## Changes in this revision

- Explicit mode routing and consistent boundaries for editing and preserving behavior.
- Project design rules separated from the optional starter template.
- Evidence, confidence, severity, and testable recommendations replace unexplained scores.
- Task-dependent guidance for tables, density, forms, and mobile layouts.
- Component-specific accessibility, state, responsive, and regression checks with honest verification limits.
- A complete worked audit, repeatable evaluation scenarios, and a record of checks performed on this bundle.

See [SAMPLE-OUTPUT.md](SAMPLE-OUTPUT.md) for the worked example, [EVALS.md](EVALS.md) for evaluation scenarios, and [TEST-RESULTS.md](TEST-RESULTS.md) for validation scope. The example also ships inside the installable skill so it remains available after copying only that folder.
