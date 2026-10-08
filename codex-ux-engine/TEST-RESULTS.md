# Revision validation - 2026-10-08

This record separates package checks and limited exercises from live product testing. The six scenarios in EVALS.md are a reusable evaluation plan, not a claim that the full suite has run.

## Package validation - passed

The revision is checked for UTF-8 readability, a valid simple name/description YAML frontmatter, correct skill name, resolvable local Markdown links, a self-contained installable skill directory, matching worked-example copies, and removal of the old skill-local DESIGN.md.

The ZIP is checked for duplicate or unsafe paths, inclusion of the hidden `.agents` tree, CRC integrity, and byte-for-byte equality with the authored files. Only the bundle's Markdown documents are packaged; temporary fixtures and authoring scripts are excluded.

The bundled skill-creator validator could not run because PyYAML was absent from the available Python runtime. A Python standard-library checker validated this bundle's deliberately simple two-field YAML subset and the package checks above. It is not a general YAML parser. No dependency installation is needed to use this instruction-only skill.

## Description-only audit exercise - passed

An independent agent received the installed-skill entry path and a realistic inventory description: daily serial comparison, uniformly sized table text, horizontal mobile scrolling, and twelve visible form fields. No images, DOM, runtime, or measurements were supplied.

The agent loaded SKILL.md, the audit mode, design principles, and verification guidance. It preserved the table as a reasonable comparison layout, treated recommendations as provisional, attached conditional severity and confidence, preserved full identifiers and form behavior, and marked inaccessible states and accessibility checks not tested. It supplied task-based verification suggestions and made no edits or numeric UX score.

A separate no-skill baseline on the same description also gave task-sensitive advice. This small exercise supports the revised instruction/output consistency; it does not demonstrate a measured quality gain over the baseline.

## Isolated restyle exercise - passed within stated limits

An independent agent used the revised skill to restyle a small HTML/CSS/JavaScript inventory fixture. Project documentation required an aubergine brand, warm neutral surfaces, Georgia headings, a compact comparison table, complete serials, and intentional horizontal scrolling.

The agent changed only the stylesheet, following those project rules. The HTML and embedded business JavaScript remained byte-identical. A read-only Node VM exercise checked the actual script's filtering, record counts, ascending sorting, selection, individual actions, and bulk updates, including selected rows hidden by a filter. These checks establish script semantics, not browser behavior. Static CSS and calculated palette contrast checks also passed in the exercise.

Rendering, actual keyboard interaction, focus behavior, and screen-reader output were explicitly not tested. This limited fixture exercise is not the complete runnable-application scenario in EVALS.md.

## Independent static review - passed

A separate reviewer inspected all thirteen authored Markdown files available before this validation record was added. It found no actionable contradictions in authorization, mode routing, project/template precedence, evidence limits, or sample consistency. The two worked examples matched. This was static review, not an installation or live execution test.

## Limits

No actual screenshot audit, cold automatic skill-discovery test, host installation test, user study, or production application validation was performed. Broader use should exercise EVALS.md with real fixtures and record outcomes. Accessibility checklist coverage is not a compliance certification.
