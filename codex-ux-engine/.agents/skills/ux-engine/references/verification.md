# Verification and evidence

Select checks for the affected components and task. This checklist supports focused review; it does not establish formal accessibility compliance.

## Record what is known

For each relevant check, record **pass**, **fail**, **not tested**, or **not applicable (reason)**, plus the evidence or limitation. A pass needs an actual check; existing code is evidence of implementation intent, not proof of runtime behavior. Do not treat unavailable checks as passing, failing, or missing features.

Separate reported context, observed code/UI behavior, and inferred consequences. Identify the viewport, state, or interaction inspected when material. With screenshot-only input, confine direct claims to visible content. Measured contrast, keyboard behavior, announcements, other widths, and hidden states require additional evidence.

## States

Consider applicable states before implementation and verify affected ones afterward:

| State | Check |
|---|---|
| Loading | Progress is understandable; repeated activation is handled |
| First-use empty | Explain the next useful action |
| No results | Explain active filters/search and a recovery path |
| Error | Explain the problem and recovery without losing entered work |
| Partial data | Distinguish unavailable information from genuine zero/empty values |
| Success | Confirm the result without masking failure or moving focus unnecessarily |
| Disabled | Reason is understandable when needed |
| Permission/restricted | Explain available actions; preserve existing authorization rules |
| Offline/connection failure | Where applicable, communicate connectivity and recovery |
| Destructive action | Clearly identify target/consequence and preserve the existing confirmation or recovery design |

## Component checks

- **Keyboard:** reach and operate affected controls; logical focus order; visible focus; no unintended traps or focus loss after updates.
- **Forms:** accessible names/labels; instructions and errors associated with fields; errors described in text; correction preserves appropriate input.
- **Dialogs/overlays:** accessible name, focus entry/containment for modal dialogs, intended dismissal, and focus return to a sensible control.
- **Tables:** meaningful headers and cell relationships; labeled row actions; selected/sorted state understandable; full identifying data accessible.
- **Status and async changes:** meaningful text beyond color; relevant updates exposed to assistive technology without unnecessary announcements. Report screen-reader behavior untested if not exercised.
- **Visual access:** contrast measured against the project's stated accessibility target; zoom/reflow, text scaling, target spacing, and focus visibility checked on affected content. Preserve intentional two-dimensional table use where appropriate.
- **Motion:** reduced-motion behavior retains essential feedback; animation does not obstruct completion.

## Responsive and regression checks

Inspect representative narrow and wide layouts and any affected breakpoint. Check clipping, overflow, navigation, content order, actions, validation, overlays, and long/empty content. Explain deliberate table scrolling instead of treating all overflow equally.

Recheck task behavior affected by the change: filters, sort, selection, pagination, bulk actions, save/cancel, errors, and permissions where present. Run existing relevant lint/typecheck/tests. Add focused regression coverage when behavior or accessibility interactions change; do not add tests that merely repeat CSS values.

Report exact checks and outcomes concisely. If tools, fixtures, or a runnable UI are unavailable, perform independent available checks and list the remainder as not tested. Do not keep widening the work after the requested change is verified.
