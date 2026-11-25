# Pilot input presentation and Daily Page picker

Adapts Lucian UX/UI Prompt #432, #434, #437, #449 and #030, with #430/#031 for the Daily Page picker. The upstream MIT license is retained in `LUCIAN-LICENSE.txt`.

## Scope

The generated Pilot injects `pilot-inputs.js` inside the application closure after the accepted controls adapter, plus one scoped stylesheet. Root `index.html`, CRM adapter, backend/auth, seed configuration, naming/suffix rules, report metrics, imports and export serialization are unchanged. There are no runtime dependencies, polling or additional network requests.

The additional `pilot-pages.js`/CSS only decorates Daily Page cells. Each row has a framed Page button and a separate labeled native Page-type selector where that selector already exists. The Page popup provides accent-insensitive name/ID search and a check beside the selected Page. Its candidates come exclusively from the original native select, including current profile/warehouse/type filtering. Selection dispatches that select's original change event; no Page-type inference or registry rule is replaced. Search, Escape and close never write a selection. Scope changes, detached rows and changed eligibility reject stale selections. Both full render and the existing Daily partial refresh are decorated. The native selects remain the source of truth.

- File drop zones keep their existing picker/drop handlers. Feedback waits for actual parsing, remains pending until the existing confirmation succeeds, and never calls a duplicate/no-op an import success. Status is transient and isolated to the current scope/view. Existing size/batch/format/mapping validation remains authoritative.
- Field focus is clearer. Error appearance reflects existing native constraints after blur/input or existing `aria-invalid`; no validation rule is added, relaxed or replaced, and no green business-validity guarantee is invented.
- Icon-only controls gain meaningful accessible names and hover/focus tooltips where a name is known. Tooltips are dismissed by Escape, can be hovered, retain other described-by IDs, and are placed within the viewport.
- Local table pagination keeps its row-size control and original page action. CRM preview keeps its filtering, 20 rows per page and cached payload, with a numbered pager and disabled boundary controls even for zero/one page. Paging does not affect exported data or call CRM.
- CRM date range uses the existing draft, validation, date arithmetic and apply/cancel actions. Two summary fields, hover preview, focus navigation, Home/End/PageUp/PageDown and clearer range bands are presentation additions. An unfinished range disables Apply. Cancel leaves the persisted interval unchanged. Popup position is recomputed after decoration so the footer remains reachable on a 390px viewport. Future dates remain disabled.
- Both OS and Pilot reduced-motion choices are respected. Light/dark colors reuse current theme tokens.

## Validation

- 123 Node checks pass, including 12 input groups and 7 Page-picker groups covering pagination, import lifecycle/error/no-op/scope behavior, original field constraints, keyboard date arithmetic, pass-through actions, allowed native options, ID handling and stale-selection rejection.
- Full generated app DOM checks: My/Huyền `2021`/TET/NOEL suffix behavior remains intact; partial date selection, cancel, apply and original drop-zone decoration work.
- Chrome preview: actual sample file parse → pending mapping modal → confirmed import; CRM page 3 contains 7 of 47 sample codes and search resets/clamps pages; calendar arrow/Enter selection, disabled incomplete Apply, Cancel/Escape, tooltip keyboard feedback, light/dark and reduced motion.
- 390px iframe: date popup and Apply footer are within its 850px viewport after post-decoration positioning. Existing overall mobile layout is outside this patch.
- On 26 Nov 2026 in Vietnam, BC Thứ 5 selects 22–25 Nov and BC Thứ 2 selects 15–21 Nov; neither action calls CRM.
- Full-app DOM checks for the Page picker confirm three separately framed rows, no override changes on search/Escape, and the original native change handler preserving selection through a partial Daily refresh.
- The new Page picker has not yet received visual Chrome verification: Cloud Browser rejected the preview action because its URL-policy gate could not acquire frame authority. No browser workaround was attempted. The earlier Chrome checks above apply to the original five input components.

Preview fixtures/backend stubs are local QA only and are excluded from the Git change. This branch is prepared for user review before updating the active Pilot branch.
