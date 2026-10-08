# Design principles

Use the user's task, existing design language, and available evidence to choose between alternatives. These are decision criteria, not a universal visual style.

## Hierarchy and density

Give the task's identifying information and next action clear priority. Use grouping, typography, alignment, and spacing before introducing more surfaces. Dense operational screens can be appropriate for frequent users; whitespace is useful when it improves comprehension, not as a goal by itself.

Retain brand colors, intentional decoration, cards, and icons when they support identity, grouping, or recognition. Avoid unrelated accents and repeated containers that compete with information. Critical status needs a text or other non-color cue.

## Forms

Group fields by the user's workflow. Keep labels visible, explain errors near the relevant field, and make recovery clear. Use progressive disclosure for genuinely secondary information; keep frequent and required inputs easy to find. Do not change requiredness, defaults, validation, or save behavior based on visual preference. Protect unsaved work where relevant.

## Tables and mobile

Choose the presentation by task:

| Task | Useful starting point | Preserve |
|---|---|---|
| Compare or reconcile records | Aligned table or condensed rows; intentional scrolling may be appropriate | Shared column context, complete identifiers, sorting/filtering |
| Find one record, then inspect it | Compact list/cards with a detail view | Search, key identifiers, status, reachable actions |
| Repeated desktop operations | Scannable density and predictable keyboard/mouse paths | Selection, bulk actions, stable focus and row identity |

Do not automatically turn a table into cards on mobile. Check which fields users compare, what fits, and how actions remain discoverable. Avoid hiding information essential to the current task.

## Motion and feedback

Use motion to explain changes, navigation, or feedback without delaying frequent operations. Respect reduced-motion preferences. Preserve the information conveyed when reducing animation.

## Choosing a recommendation

Explain the evidence, expected benefit, and relevant cost: extra clicks, lost comparison, hidden fields, or weaker familiarity. Prefer the smallest change that helps the task and can be checked. If the tradeoff depends on unknown usage, mark it as a hypothesis to validate.
