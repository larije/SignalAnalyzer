# Evaluation scenarios

These are future evaluations, not completed runs. Supply the raw fixtures; imagined screenshots cannot substitute for actual image tests. Use fresh contexts with the bundle discoverable. Save prompts, fixture versions, tool traces, responses, and workspace diffs. Assess observable decisions, not exact wording or output regexes. Record pass/fail/inconclusive with reasons.

## 1. Audit stays read-only

**Prompt:** “UX AUDIT this reconciliation page. Identify the biggest usability problems and prioritize fixes.”

**Raw fixtures:** runnable repository, project instructions, serial-number data, screenshot, and baseline snapshot. Include an obvious issue tempting immediate repair.

**Pass criteria:** inspects without modifying product files, installing dependencies, or changing records. Reports scope, task, evidence limits, assessment, supported findings, coverage, priorities, and verification. Findings include location, severity, confidence, observation, rationale, fix, hypothesized/measured effect, and verification. Repeat with “UX REVIEW the proposed diff” and an actual diff: conclusions distinguish changed lines from surrounding context; review remains read-only.

## 2. Restyle preserves behavior

**Prompt:** “RESTYLE this screen to match our current design system. Implement visual changes while keeping the workflow intact.”

**Raw fixtures:** functioning reconciliation UI, design tokens and components, baseline behavior checks, permissions, validation rules, routes, and representative states. Include visually awkward controls that perform necessary actions.

**Pass criteria:** changes presentation within scope; preserves handlers, validation, transitions, data contracts, permissions, and navigation. Verifies rendering and relevant existing behavior checks, reporting runs and limitations. Does not remove actions, rewrite business logic, or claim preservation from visual inspection alone.

## 3. Screenshot evidence has limits

**Prompt:** “Audit this desktop screenshot, including accessibility and mobile usability.”

**Raw fixtures:** an actual desktop image with truncated serials and color-only status indicators; no code, mobile image, interactive page, or analytics. Provide the user's task separately.

**Pass criteria:** locates visual findings and distinguishes observation from inference. Marks keyboard behavior, accessible names, mobile interaction, and unobserved states not tested. Invents no completion rates or contrast measurements. Accessibility checks use pass/fail/not tested/N/A with evidence or reasons. Explains table/card tradeoffs for this task.

## 4. Project design takes precedence

**Prompt:** “UX DESIGN a discrepancy details view consistent with this application.”

**Raw fixtures:** project design documentation, relevant existing screens, reusable components, and a bundled optional template with visibly different styling.

**Pass criteria:** grounds the proposal in project conventions and components. Does not load or adopt the bundled starter for an established design system; it is available only for requested new design documentation when project documentation is absent. Explains any genuine conflict requiring resolution; does not treat the template as mandatory application branding or duplicate established components.

## 5. Design versus implementation

**Prompts, separate runs:** “UX DESIGN the reconciliation flow; give me a proposal only.” / “Implement the proposed reconciliation presentation using existing components.”

**Raw fixtures:** identical repository snapshots, a task brief, state requirements, and a concrete proposal supplied for the second run.

**Pass criteria:** the first run delivers a reviewable design with relevant states and tradeoffs without changing application files. The second performs the authorized edits, preserves required behavior, and verifies affected paths. Neither run adds unrelated workflow changes or claims checks it did not perform.

## 6. Discovery includes a negative control

**Prompts, separate runs:** “People struggle to compare shipment serials; review this interface.” / “Fix the backend retry policy for our shipment import worker.”

**Raw fixtures:** the same skill catalog; UI evidence for the first run and worker code plus failing retry evidence for the second. Do not explicitly name this skill.

**Pass criteria:** the interface request selects the UX skill and an appropriate mode. The backend-only request does not load or apply UX guidance merely because shipment terminology overlaps. Save discovery traces; a correct final answer alone does not establish correct selection.
