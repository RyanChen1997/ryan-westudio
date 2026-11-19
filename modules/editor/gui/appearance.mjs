// Product shell adapted from the user's wechat-paiban editor design contract.
// These tokens never enter the article model or published HTML.
export function articleViewportTop(stage) {
  return Math.max(stage.getBoundingClientRect().top,
    stage.closest('.studio').querySelector('.editor-header').getBoundingClientRect().bottom,
    stage.querySelector('.editor-tools').getBoundingClientRect().bottom);
}

export const appearanceCSS = `
:root, [data-astryx-theme] {
  --bg:#f8faff; --surface:#ffffff; --surface-warm:#faf8ff;
  --fg:#30364f; --fg-2:#4d5675; --muted:#65708e;
  --border:#e8ecfb; --accent:#7357e5; --accent-hover:#6243d3; --accent-on:#ffffff;
  --soft:#f4f0ff; --success:#28785d; --danger:#a35170; --danger-bg:#fff1f5;
  --pro-gold:#f7d277; --pro-ink:#664005; --pro-edge:#d8a844;
  --focus:#a58af5; --focus-wash:#b69cff20; --selected-border:#a98ae9;
  --font-body:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  --panel-radius:19px; --control-radius:8px; --card-radius:12px;
  --paper-shadow:0 8px 30px #536cb506; --panel-shadow:0 5px 25px #536dc006;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px;
  --color-accent:var(--accent); --color-text-primary:var(--fg); --color-text-secondary:var(--muted);
  --color-background-body:var(--bg); --color-background-surface:var(--surface);
  --color-border:var(--border);
}
html,body,#root {height:100%;margin:0;background:var(--bg);font-family:var(--font-body);}
body {overflow:hidden;-webkit-font-smoothing:antialiased;}
.studio,.studio * {box-sizing:border-box;}
/* Section's stable inner surface must not become an extra grid/flex item. */
.studio .astryx-section {display:contents;}
.studio {--editor-sticky-inset:0px;height:100dvh;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--fg);font:14px/1.5 var(--font-body);}
.studio :is(h1,h2,h3,p,figure) {margin:0;}
.studio :is(button,input,summary) {font-family:var(--font-body);}
/* Astryx text fields draw focus on their rounded control box, not on the native input. */
.studio :is(button,summary,input:where([type="file"])):focus-visible {outline:3px solid var(--focus);outline-offset:3px;}
.studio ::selection {background:var(--soft);}
.studio .astryx-button {height:36px;min-height:36px;border-radius:var(--control-radius);padding-inline:13px;font:550 13px/1.5 var(--font-body);box-shadow:none;gap:7px;white-space:nowrap;}
.studio .astryx-button[data-variant="primary"] {background:var(--accent);border:1px solid var(--accent);color:var(--accent-on);}
.studio .astryx-button[data-variant="primary"]:hover:not(:disabled):not([aria-disabled="true"]) {background:var(--accent-hover);border-color:var(--accent-hover);}
.studio .astryx-button[data-variant="secondary"] {background:var(--surface);border:1px solid var(--border);color:var(--fg-2);}
.studio .astryx-button[data-variant="ghost"] {background:transparent;color:var(--muted);}
.studio .astryx-button[data-variant="ghost"]:hover:not(:disabled):not([aria-disabled="true"]) {background:var(--soft);color:var(--accent);}
.studio .astryx-button:is(:disabled,[aria-disabled="true"]) {opacity:.42;cursor:default;}
.studio .astryx-button[aria-pressed="true"] {color:var(--accent);background:var(--soft);}
.studio .astryx-button.ui-icon-button {width:34px;min-width:34px;height:34px;min-height:34px;padding:0;}
.editor-header {height:82px;flex-shrink:0;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:24px;padding:0 28px;background:color-mix(in srgb,var(--surface) 86%,transparent);border-bottom:1px solid var(--border);}
.editor-header-start {display:flex;align-items:center;gap:12px;min-width:0;}
.document-mark {display:grid;place-items:center;flex-shrink:0;width:32px;height:36px;color:var(--accent);}
.editor-title-field {width:290px;min-width:0;}
.editor-title-field .astryx-text-input {height:37px;border:1px solid var(--border);border-radius:var(--control-radius);box-shadow:none;background:var(--surface-warm);}
.editor-title-field input {font:13px/1.5 var(--font-body);color:var(--fg);}
.editor-title-field .astryx-text-input:focus-within {border-color:var(--focus);box-shadow:0 0 0 3px var(--focus-wash);}
.editor-actions {display:flex;align-items:center;justify-self:end;gap:8px;}
.history-actions {display:flex;align-items:center;gap:3px;padding-right:10px;margin-right:1px;border-right:1px solid var(--border);}
.preview-controls {display:flex;align-items:center;justify-self:center;gap:8px;padding:4px;border:1px solid var(--border);border-radius:var(--card-radius);background:var(--surface);}
.preview-group {display:flex;align-items:center;gap:3px;}
.preview-theme {border-left:1px solid var(--border);padding-left:8px;}
.studio .astryx-button.preview-choice {height:34px;min-height:34px;min-width:34px;padding-inline:9px;gap:0;}
.preview-choice-label {display:inline-block;max-width:0;opacity:0;overflow:hidden;white-space:nowrap;font-size:12px;transition:max-width 180ms,opacity 140ms,margin-left 180ms;}
.preview-choice:hover .preview-choice-label,.preview-choice:focus-visible .preview-choice-label {max-width:74px;opacity:1;margin-left:7px;}
.editor-layout {display:grid;grid-template-columns:minmax(0,1fr) 424px;gap:25px;padding:25px 28px 25px 32px;min-height:0;flex:1;max-width:1760px;width:100%;margin-inline:auto;background:transparent;}
.editor-column {display:flex;flex-direction:column;min-width:0;min-height:0;}
.editor-stage {flex:1;min-width:0;min-height:0;overflow:auto;padding:0 28px 24px;overscroll-behavior:contain;scrollbar-width:thin;scroll-padding-top:var(--editor-tools-height,0px);}
.studio-paper {width:100%;max-width:738px;margin-inline:auto;min-width:0;border:1px solid var(--border);border-radius:var(--panel-radius);background:var(--surface);box-shadow:var(--paper-shadow);overflow:visible;}
.studio-paper[data-device="mobile"] {max-width:390px;}
.studio-paper[data-night="true"] {background:#1e2234;border-color:#333b54;}
/* Keep the sticky bar opaque where the article scrolls behind its rounded surface. */
.editor-tools {display:flex;align-items:center;gap:2px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:var(--editor-sticky-inset);z-index:2;}
.editor-tools::before {content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:var(--surface);border-radius:var(--panel-radius) var(--panel-radius) 0 0;}
.editor-tools .tool-separator {width:1px;height:18px;background:var(--border);margin-inline:5px;}
.studio .editor-tools .astryx-button {height:32px;min-height:32px;min-width:30px;padding-inline:7px;font-size:12px;}
.studio .editor-tools .ui-icon-button {width:32px;}
.insert-menu {position:relative;}
.insert-menu summary {display:flex;align-items:center;gap:5px;list-style:none;cursor:pointer;padding:7px;color:var(--muted);border-radius:var(--control-radius);font-size:12px;}
.insert-menu summary::-webkit-details-marker {display:none;}
.insert-menu summary:hover,.insert-menu[open] summary {background:var(--soft);color:var(--accent);}
.insert-menu-content {position:absolute;z-index:10;top:calc(100% + 8px);right:0;width:190px;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:var(--card-radius);box-shadow:var(--panel-shadow);}
.studio .insert-menu-content .astryx-button {width:100%;justify-content:flex-start;}
.font-options {left:0;right:auto;width:216px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));max-height:300px;overflow:auto;}
.studio .font-options .astryx-button {justify-content:center;}
.editor-body,.night-reading {overflow:hidden;border-radius:0 0 var(--panel-radius) var(--panel-radius);}
.editor-hidden {display:none;}
.editor-body .tiptap {border:0;outline:none;}
.editor-body .tiptap:focus-visible {outline:none;}
.editor-body .tiptap .ProseMirror-selectednode {outline:1px solid var(--focus);outline-offset:-1px;}
.night-reading {width:100%;min-width:0;}
.inspector {display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;padding:25px 23px;background:var(--surface);border:1px solid var(--border);border-radius:var(--panel-radius);box-shadow:var(--panel-shadow);}
.inspector-tabs {display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin-bottom:22px;background:var(--surface-warm);border:1px solid var(--border);border-radius:11px;flex-shrink:0;}
.studio .inspector-tabs .astryx-button {height:37px;min-height:37px;font-size:13px;}
.studio .inspector-tabs [aria-selected="true"] {color:var(--accent);background:var(--surface);box-shadow:0 2px 7px #30364f08;}
.inspector-content {flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:2px;}
.inspector-title {font-size:20px!important;font-weight:550!important;line-height:1.5!important;margin-bottom:20px!important;color:var(--fg);}
.template-card {position:relative;min-width:0;padding:7px 7px 39px;border:1px solid var(--border);border-radius:var(--card-radius);background:var(--surface);overflow:hidden;}
.template-card[data-selected="true"] {border-color:var(--selected-border);}
.template-card .template-cover {height:172px;overflow:hidden;border-radius:var(--control-radius);background:var(--surface-warm);}
.template-cover iframe {display:block;width:390px;height:630px;border:0;transform:scale(var(--thumbnail-scale,.4));transform-origin:top left;pointer-events:none;background:var(--surface);}
.template-card-tint,.template-card-check {position:absolute;pointer-events:none;opacity:0;transition:opacity 140ms ease;}
.template-card-tint {inset:0;background:color-mix(in srgb,var(--accent) 20%,transparent);}
.template-card-check {top:9px;right:9px;z-index:1;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--accent-hover);color:var(--accent-on);}
.template-card[data-selected="true"] .template-card-check,
.template-card:has(.template-select:focus-visible) :is(.template-card-tint,.template-card-check) {opacity:1;}
@media(hover:hover) {.template-card:hover :is(.template-card-tint,.template-card-check) {opacity:1;}}
.studio .template-card .astryx-button.template-select[data-variant="ghost"]:not(:disabled):not([aria-disabled="true"]) {position:absolute;inset:0;width:100%;height:100%;min-height:0;align-items:flex-end;justify-content:flex-start;padding:0 9px 10px;border:0;border-radius:var(--card-radius);background:transparent;color:var(--fg);font-weight:550;}
.studio .template-card .template-select:focus-visible {outline:2px solid var(--accent-hover);outline-offset:-3px;}
.adjustment-heading {font-size:14px!important;font-weight:600!important;margin-bottom:16px!important;}
.format-parameter {display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;}
.parameter-label {display:flex;align-items:center;gap:9px;color:var(--fg-2);font-size:13px;}
.parameter-label svg {color:var(--muted);}
.parameter-stepper {display:flex;align-items:center;border:1px solid var(--border);border-radius:9px;background:var(--surface-warm);}
.parameter-stepper output {min-width:61px;text-align:center;font-size:12px;color:var(--fg);font-variant-numeric:tabular-nums;}
.parameter-unit {font-size:10px;margin-left:3px;color:var(--muted);}
.studio .parameter-stepper .ui-icon-button {width:32px;height:32px;min-height:32px;min-width:32px;}
.studio .margin-reset {margin-top:12px;padding-inline:0;font-size:12px;}
.inspector-footer {flex-shrink:0;margin-top:18px;padding-top:18px;border-top:1px solid var(--border);}
.studio .output-actions {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:var(--space-2);margin-top:var(--space-3);}
.studio .output-actions .output-action {min-width:0;padding-inline:var(--space-2);}
.studio .output-action[data-variant="primary"] {border-color:var(--accent-hover);}
.studio .output-action[data-variant="secondary"] {border-color:var(--selected-border);}
.pro-dock {position:sticky;inset-block-end:0;z-index:3;display:grid;justify-items:center;flex:none;block-size:1.75rem;overflow:hidden;border-block-end:1px solid var(--border);background:var(--bg);}
.studio .astryx-button.pro-dock-button {min-height:3.5rem;align-items:flex-start;padding-block-start:.32rem;border-color:var(--pro-edge);border-radius:var(--card-radius);background:var(--surface);color:var(--pro-ink);}
.studio .astryx-button.pro-dock-button:hover {background:color-mix(in srgb,var(--pro-gold) 20%,var(--surface));}
.studio .pro-dock-button:focus-visible {outline-offset:-3px;}
.pro-dock-title {display:inline-flex;align-items:center;gap:var(--space-2);color:inherit;}
.pro-benefits {display:grid;gap:var(--space-3);padding-inline-start:var(--space-6);margin:0;}
.pro-benefits li::marker {color:var(--accent);}
.studio .pro-output {position:relative;min-width:0;}
.studio .pro-ribbon {position:absolute;inset-block-start:0;inset-inline-end:var(--space-1);padding:.125rem .375rem;border:1px solid var(--pro-edge);border-radius:calc(var(--control-radius) / 3);background:var(--pro-gold);color:var(--pro-ink);font:700 .625rem/1 var(--font-body);letter-spacing:.02em;transform:translateY(-55%) rotate(25deg);pointer-events:none;}
.status-message {display:block;color:var(--muted);font-size:12px;line-height:1.7;overflow-wrap:anywhere;margin-bottom:14px;}
.status-message[data-failed="true"] {color:var(--danger);}
.editor-alert {margin-bottom:12px;padding:10px 12px;border:1px solid #f2dce5;border-radius:var(--control-radius);color:var(--danger);background:var(--danger-bg);font-size:12px;line-height:1.7;}
.editor-loading {margin:auto;max-width:32rem;padding:var(--space-6);border:1px solid var(--border);border-radius:var(--panel-radius);background:var(--surface);}
/* Editor controls live outside the article, including top-layer popovers. */
.block-highlight {position:fixed;z-index:40;pointer-events:none;border-radius:4px;background:color-mix(in srgb,var(--accent) 13%,transparent);}
.block-handle {position:fixed;z-index:80;display:grid;place-items:center;width:28px;height:28px;padding:0;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--muted);cursor:pointer;}
.block-handle:hover,.block-handle[aria-expanded="true"] {color:var(--accent);border-color:var(--selected-border);background:var(--soft);}
.block-handle:focus-visible,.article-outline button:focus-visible {outline:2px solid var(--focus);outline-offset:2px;}
.astryx-popover:has([data-block-menu]) {border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:0 6px 24px #30364f18;color:var(--fg);}
.block-ui {font:13px/1.5 var(--font-body);color:var(--fg-2);}
.block-ui .astryx-section {display:contents;}
.block-ui .astryx-button,.studio .block-ui .astryx-button {display:flex;justify-content:flex-start;width:100%;height:34px;min-height:34px;padding:6px 9px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--fg-2);box-shadow:none;font:400 13px/1.5 var(--font-body);gap:8px;}
.block-ui .astryx-button:hover:not([aria-disabled="true"]),.block-ui .is-default {background:var(--soft);color:var(--accent);}
.block-ui .astryx-button.is-default,.studio .block-ui .astryx-button.is-default {border-color:var(--selected-border);background:var(--soft);color:var(--accent);}
.block-ui .block-menu-delete {--soft:var(--danger-bg);--accent:var(--danger);}
.block-ui .block-menu-delete:hover {background:var(--danger-bg);color:var(--danger);}
.block-ui .astryx-button:focus-visible {outline:none;box-shadow:inset 0 0 0 1px var(--focus);}
.block-menu-label {display:inline-flex;align-items:center;gap:8px;font:400 13px/1.5 var(--font-body)!important;color:inherit!important;}
.block-menu-caption {display:block;margin:4px 9px 8px;font:400 12px/1.5 var(--font-body)!important;color:var(--muted)!important;}
.block-ui .astryx-button[aria-disabled="true"] {opacity:.45;}
.article-outline {position:fixed;z-index:70;width:25px;color:var(--muted);font:13px/1.5 var(--font-body);}
.outline-trigger {display:grid;place-items:center;width:25px;min-height:36px;padding:9px 2px;border:0;border-radius:6px;background:transparent;cursor:pointer;}
.outline-trigger:hover,.outline-trigger[aria-expanded="true"] {background:var(--soft);}
.outline-rail {display:grid;justify-items:end;gap:8px;}
.outline-rail i {display:block;height:2px;border-radius:2px;background:#b9c6ce;}
.outline-rail i[data-current="true"] {background:var(--accent);}
.outline-popover {position:absolute;right:33px;top:-9px;display:flex;flex-direction:column;width:246px;max-width:calc(100vw - 66px);padding:16px 14px;border:1px solid var(--border);border-radius:18px;background:var(--surface);box-shadow:0 7px 24px #30364f12;}
.outline-hover-bridge {position:absolute;top:0;left:100%;width:12px;height:100%;}
.outline-heading {display:flex;flex-shrink:0;align-items:center;justify-content:space-between;margin:0 6px 10px;font-weight:600;color:var(--fg);}
.outline-heading .astryx-text {font:inherit;}
.article-outline .astryx-button {width:100%;min-height:32px;justify-content:flex-start;padding:6px;border:0;border-radius:5px;background:transparent;color:var(--fg-2);font:400 12px/1.5 var(--font-body);box-shadow:none;}
.article-outline .astryx-button:hover {background:var(--surface-warm);}
.article-outline .astryx-button[aria-current="location"] {color:var(--accent);font-weight:550;}
.outline-heading .astryx-button {width:24px;height:24px;min-height:24px;padding:3px;color:var(--muted);}
.outline-items {display:grid;min-height:0;max-height:55dvh;overflow:auto;}
.editor-body :is(h1,h2,h3,h4,[role="heading"]) {scroll-margin-top:16px;}
.night-reading {--reading-scroll-margin:16px;}
@media(min-width:1500px) {.editor-stage{padding-inline:30px;}}
@media(max-width:1200px) {
  .editor-header{padding-inline:20px;gap:16px;}.editor-title-field{width:244px;}
  .editor-layout{grid-template-columns:minmax(0,1fr) 350px;padding:22px;gap:18px;}
  .inspector{padding:23px 18px;}.template-card .template-cover{height:150px;}
}
@media(max-width:1050px) {
  .editor-layout{grid-template-columns:minmax(0,1fr) 332px;padding:20px;gap:17px;}
  .inspector{padding-inline:16px;}.editor-actions{gap:4px;}
}
@media(max-width:900px) {
  .editor-header{height:126px;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:66px 59px;gap:0 18px;}
  .editor-header-start{grid-column:1;grid-row:1;}.preview-controls{grid-column:2;grid-row:1;}
  .editor-actions{grid-column:1/-1;grid-row:2;align-self:start;}.editor-title-field{width:280px;}
}
@media(max-width:820px) {
  .studio{--panel-radius:16px;}.editor-layout{grid-template-columns:minmax(0,1fr) 292px;padding:17px 16px;gap:14px;}
  .inspector{padding:21px 14px;}.inspector-title{font-size:18px!important;}.template-card .template-cover{height:125px;}
  .studio .output-actions{gap:var(--space-1);}
  .studio .output-actions .output-action{padding-inline:var(--space-1);gap:var(--space-1);font-size:12px;}
}
@media(max-width:670px) {
  .studio{--editor-sticky-inset:178px;overflow:auto;scroll-padding-top:calc(var(--editor-sticky-inset) + var(--editor-tools-height,0px));}
  .editor-header{height:var(--editor-sticky-inset);grid-template-columns:minmax(0,1fr);grid-template-rows:62px 52px 63px;padding-inline:13px;gap:0;position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--surface) 96%,transparent);backdrop-filter:blur(8px);}
  .editor-header-start{grid-column:1;grid-row:1;}.editor-title-field{width:100%;}.preview-controls{grid-column:1;grid-row:2;align-self:start;}.editor-actions{grid-column:1;grid-row:3;justify-self:center;gap:8px;}
  .editor-layout{display:flex;flex:initial;flex-direction:column;padding:17px 13px;gap:22px;min-height:auto;}
  .editor-stage{overflow:visible;padding:0 28px 24px;}.studio-paper{max-width:100%;}.inspector{min-height:390px;overflow:visible;padding:23px;}
  .inspector-content{overflow:visible;}.template-gallery-scroll{max-height:min(55dvh,460px);overflow:auto;scrollbar-width:thin;}.template-card .template-cover{height:145px;}
  .editor-tools{padding:6px;}.insert-menu-content{right:0;}
}
@media(prefers-reduced-motion:reduce) {.studio *{transition:none!important;scroll-behavior:auto!important;}}
`;
