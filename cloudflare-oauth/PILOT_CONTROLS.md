# Pilot controls: export, copy and source tabs

This change adapts Lucian UX/UI elements #438, #008 and #416 to the existing Pilot. It is limited to the generated OAuth Pilot build. The offline root `index.html`, report/ADS rules, CRM adapters, OAuth worker, session duration, configuration and stored workspace format are unchanged.

## Behavior

- Export feedback covers ADS/Scale XLSX, report XLSX/TSV and saved Build downloads. It waits for the existing operation, blocks repeated export actions in the current user/warehouse/channel/view, and shows a check only after the operation resolves. Serialization and preflight errors keep the original error notice and allow retry.
- Copy feedback covers existing copy actions. The check waits for confirmed plain or rich clipboard success. An action that only warns without copying stays idle. Clipboard fallback and original contents remain intact.
- Report menu choices also reflect feedback on the visible `Xuất / Copy báo cáo` summary after the menu closes.
- Button layout boxes remain full width while their visual backgrounds shrink. The new presentation does not move adjacent controls.
- Source tabs use the existing CĐ/MESS and API CRM/Dán–File actions. No API request is added by tab selection, rendering, resize or keyboard navigation. CRM caches, personnel mapping and date shortcuts keep their existing behavior.
- Feedback is transient memory only. Rerendering restores pending state; changing scope clears obsolete announcements and prevents a late completion from painting success in another workspace.
- Existing light/dark theme variables and reduced-motion choices are used. Narrow source-tab containers wrap rather than overflow; the broader existing mobile layout is outside this change.

The success text is **Đã tạo file**, not a guarantee that the browser has finished saving to disk. The browser remains responsible for download prompts and storage.

## Integration

`prepare.mjs` injects `pilot-controls.js` inside the existing application closure, after the CRM adapter and before the existing event dispatcher. It adds one scoped stylesheet and copies the included MIT license. Guarded replacements fail the build if insertion points drift. No additional runtime dependency, configuration screen, polling or external service is introduced.

Upstream copyright and permission text are retained in `LUCIAN-LICENSE.txt`.

## Validation

- 96 Node test cases passed: 85 existing cases plus 11 focused feedback/integration cases.
- Full generated app booted in a DOM simulation as Huyền with no JavaScript errors. Keyboard source switching preserved CRM cache; clipboard completion updated feedback; a real ExcelJS export was read back and its headers and values matched the synthetic input.
- Chrome preview: actual clipboard success and XLSX download event; button boxes stayed at the original measured dimensions; report preflight failure appeared on the visible closed-menu summary; light and dark source indicators were legible.
- A real 390px iframe viewport verified the new source tabs do not overflow their container. Existing app reduced-motion mode removed the new animation/transition while retaining completion feedback.
- Test-only preview bootstrap, synthetic records and debugging hooks are outside the source branch and are not part of the Pilot build.

Commands:

```sh
node --check cloudflare-oauth/pilot-controls.js
node --test cloudflare-oauth/tests/*.test.mjs
node cloudflare-oauth/prepare.mjs
```

This branch is prepared for review before updating the active Pilot branch.
