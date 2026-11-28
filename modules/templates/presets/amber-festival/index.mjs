// Promoted unchanged from the reviewed personal preset user-amber-festival.
// Layout reference: three user-provided 11.11 promotion screenshots. No source assets are reused.

const hidden = { 'aria-hidden': 'true', 'data-decorative': 'true' };
const tree = (tag, css, children = [], attrs = {}) => [tag, css, children, attrs];
const decor = (tag, css, words = []) => tree(tag, css, words, hidden);
const text = (tag, css) => tree(tag, css, ['$text']);
const children = (tag, css) => tree(tag, css, ['$children']);
const ink = 'var(--weui-FG-0,#483e3b)';
const brown = 'var(--weui-FG-0,#6d3a1f)';
const muted = 'var(--weui-FG-1,#615c60)';
const satin = 'linear-gradient(112deg,#ffae4f 0%,#ffda84 35%,#f7c9a2 70%,#f3dbcb 100%)';
const sliver = 'linear-gradient(90deg,#ed913a,#ffc37d 58%,rgba(255,211,146,0) 100%)';
const base = `box-sizing:border-box;font-size:15px;line-height:1.82;color:${ink};letter-spacing:.27px;overflow-wrap:anywhere`;
const orangeAccent = 'color:var(--weui-FG-0,#854318)';

const glint = decor('span', 'display:block;position:absolute;top:3px;right:10%;width:41px;height:41px;pointer-events:none;background-image:radial-gradient(ellipse at center,rgba(255,252,236,.94),rgba(255,248,221,.31) 27%,transparent 71%)', [
  decor('span', 'position:absolute;top:0;left:19px;width:3px;height:41px;background-image:linear-gradient(transparent,rgba(255,252,240,.98),transparent)'),
  decor('span', 'position:absolute;top:19px;left:0;width:41px;height:3px;background-image:linear-gradient(90deg,transparent,rgba(255,252,240,.98),transparent)'),
  decor('span', 'position:absolute;top:17px;left:17px;width:7px;height:7px;transform:rotate(45deg);background-color:#fff7e5;box-shadow:0 0 7px #fffdf1'),
]);
const hero = tree('section', 'position:relative;box-sizing:border-box;margin:14px 0 125px;padding:62px 11px 28px;text-align:center;background-image:radial-gradient(ellipse 50% 47% at 50% 47%,var(--weui-BG-4,#fffefb) 0%,var(--weui-BG-5,#fff9e9) 40%,transparent 100%),radial-gradient(ellipse 34% 27% at 66% 29%,var(--weui-BG-5,#f6d3b6) 0%,transparent 100%),radial-gradient(ellipse 31% 42% at 34% 57%,var(--weui-BG-5,#f7b477) 0%,transparent 100%)', [
  decor('span', 'display:block;position:absolute;top:23px;left:5%;width:90%;border-top:1px dotted rgba(255,255,255,.92);pointer-events:none'),
  glint,
  text('h1', 'box-sizing:border-box;margin:0 auto;max-width:10em;font-size:35px;line-height:1.23;font-weight:900;letter-spacing:.035em;text-align:center;color:var(--weui-FG-0,#ffd784);-webkit-text-stroke:1.35px var(--weui-BG-0,#a95720);paint-order:stroke fill;text-shadow:-1px -1px var(--weui-BG-3,#fff4c5),0 1px var(--weui-BG-3,#e48a30),0 2px var(--weui-BG-1,#c27834),0 3px var(--weui-BG-0,#ab5a21),1px 4px 0 var(--weui-BG-1,#f2b364),0 8px 17px var(--weui-FG-3,rgba(227,124,37,.36));text-wrap:balance;overflow-wrap:anywhere'),
  decor('span', `display:block;box-sizing:border-box;width:63%;max-width:235px;height:25px;margin:25px auto 0;border:1px solid rgba(248,152,64,.48);border-radius:4px;background-image:${satin};box-shadow:inset 0 1px 0 rgba(255,255,255,.63),0 3px 10px rgba(203,115,43,.12)`),
]);

const chapter = tree('section', 'box-sizing:border-box;margin:-51px -1px 15px', [
  decor('span', 'display:block;width:fit-content;padding:0 5px 3px 1px;font-family:Arial,sans-serif;font-size:33px;font-style:italic;font-weight:900;line-height:1.08;letter-spacing:-1px;color:#fff1d0;-webkit-text-stroke:1px #b55e23;text-shadow:1px 2px #b55e23,0 0 9px rgba(248,164,68,.46)', ['$chapterNumber:2']),
  text('h2', `box-sizing:border-box;margin:0;padding:10px 9px 11px;font-size:23px;line-height:1.34;font-weight:900;letter-spacing:.035em;text-align:center;color:var(--weui-BG-0,#fff8df);-webkit-text-stroke:1.1px var(--weui-BG-0,#8f4417);paint-order:stroke fill;text-shadow:0 1px var(--weui-BG-0,#ad5316),0 2px 0 var(--weui-BG-1,#ae5c22),0 0 4px rgba(164,83,24,.24);border:1px solid #dea873;border-radius:4px;background-image:${satin};box-shadow:inset 0 0 0 1px rgba(255,248,223,.55);text-wrap:balance;overflow-wrap:anywhere`),
]);

const item = symbol => tree('section', `display:flex;align-items:baseline;gap:8px;margin:0 0 7px;${base}`, [
  decor('span', `flex:none;min-width:15px;text-align:center;font-variant-numeric:tabular-nums;font-weight:800;${orangeAccent}`, symbol),
  text('span', 'flex:1;min-width:0'),
]);
const bullet = item(['◆']);
const ordered = item(['$itemNumber', '.']);
const roles = {
  paragraph: text('p', `margin:0 6px 13px;${base}`),
  paragraphLast: text('p', `margin:0 6px;${base}`),
  h1: hero,
  h2: chapter,
  h3: tree('section', 'margin:22px 6px 12px', [
    text('h3', `margin:0 0 7px;${base};font-size:16px;font-weight:800;text-align:center;color:${muted}`),
    decor('span', `display:block;width:100%;height:2px;background-image:${sliver}`),
  ]),
  h4: text('h4', `margin:18px 6px 8px;padding-left:8px;border-left:2px solid #dd914e;${base};font-size:14px;font-weight:800;color:${muted}`),
  list: children('section', 'margin:0 4px 14px'),
  steps: children('section', 'margin:0 4px 14px'),
  listItem: bullet,
  listItemLast: bullet,
  stepsItem: ordered,
  stepsItemLast: ordered,
  image: tree('img', 'display:block;width:100%;height:auto;box-sizing:border-box;margin:18px auto 0;padding:clamp(8px,5%,18px) 4% clamp(8px,5%,17px);background-image:linear-gradient(90deg,#f39942 0%,rgba(250,171,91,.9) 26%,rgba(255,197,124,.5) 72%,rgba(255,208,151,0) 100%),linear-gradient(180deg,rgba(195,205,225,.45) 0%,rgba(207,216,233,.28) 41%,rgba(229,233,241,.12) 78%,rgba(247,246,246,0) 100%);background-position:top left,top left;background-size:100% 5px,100% 100%;background-repeat:no-repeat', [], { src: '$image' }),
  divider: decor('section', 'display:flex;align-items:center;width:85%;height:15px;gap:9px;margin:24px auto 4px', [
    decor('span', `flex:1;height:1px;background-image:linear-gradient(90deg,transparent,#dc9a59)`),
    decor('span', 'position:relative;flex:none;width:6px;height:6px;transform:rotate(45deg);background-color:#d89553;box-shadow:0 0 0 2px rgba(229,159,83,.25)'),
    decor('span', `flex:1;height:1px;background-image:linear-gradient(90deg,#dc9a59,transparent)`),
  ]),
};
const quote = {
  ...roles,
  h2: tree('section', 'box-sizing:border-box;margin:16px 0 12px', chapter[2]),
  paragraph: text('p', `margin:0 0 9px;${base};color:var(--weui-FG-0,#615c60)`),
  paragraphLast: text('p', `margin:0;${base};color:var(--weui-FG-0,#615c60)`),
};
const card = {
  ...quote,
  paragraph: text('p', `margin:0 0 9px;padding-bottom:9px;border-bottom:1px dashed rgba(255,251,231,.92);${base};font-size:16px;color:${brown};text-align:center`),
  paragraphLast: text('p', `margin:0;${base};color:${brown};text-align:center`),
};

export default {
  id: 'amber-festival',
  name: '琥珀暖金',
  category: 'original',
  description: '珍珠灰底衬蜜橙光晕，金色浮雕题头、斜体序号章牌、冷雾图框与暖渐变卡片。',
  suitableFor: ['活动专题', '节庆推文', '图文故事'],
  layout: {
    pageMargin: 16,
    panel: {
      beforeHeading: true, includeHeading: false, splitH2: true, entire: false,
      frames: [['section', 'box-sizing:border-box;margin:42px 0 95px;padding:9px 8px 17px;background-color:var(--weui-BG-2,#fffdfb);border:1px solid rgba(218,161,109,.24);border-radius:5px;box-shadow:0 6px 16px rgba(139,86,45,.07)']],
    },
  },
  tokens: {
    outer: `box-sizing:border-box;padding:22px 16px 8px;font-family:"PingFang SC","Microsoft YaHei",Arial,system-ui,sans-serif;font-size:15px;line-height:1.82;color:${ink};background-color:var(--weui-BG-1,#f2eeee);background-image:radial-gradient(ellipse at 100% 0,rgba(244,180,131,.25),transparent 62%) ,radial-gradient(ellipse at 0 100%,rgba(244,180,131,.18),transparent 68%);background-size:100% 490px,100% 370px;background-repeat:no-repeat;background-position:top,bottom;border-radius:10px;overflow-wrap:anywhere`,
    numbered: [2],
    inline: {
      strong: `font-weight:800;${orangeAccent};box-shadow:inset 0 -.28em rgba(235,154,74,.26)`,
      headingStrong: 'font-weight:inherit;color:inherit;box-shadow:none',
      em: 'font-style:italic',
      link: `${orangeAccent};text-decoration:underline;text-underline-offset:2px`,
      code: 'font-family:ui-monospace,monospace;font-size:.9em;padding:1px 3px;color:var(--weui-FG-0,#684326);background-color:var(--weui-BG-3,#f7eadf);border-radius:3px;overflow-wrap:anywhere',
    },
    blocks: {
      caption: `margin:7px 8px 13px;color:${muted};font-size:12px;line-height:1.55;letter-spacing:.28px`,
      codeBlock: 'padding:11px 9px;margin:10px 6px 14px;border:1px solid rgba(218,161,109,.36);border-radius:4px;font-size:13px;background-color:var(--weui-BG-3,#f7efe9)',
      table: 'margin:14px 0;border-color:#d6ad90;table-layout:fixed;width:100%;font-size:13px;line-height:1.55',
      tableCell: 'border-color:#d6ad90;padding:6px 5px;overflow-wrap:anywhere',
      tableHeader: `font-weight:800;color:${brown};background-color:var(--weui-BG-3,#f6e3d1)`,
    },
    containers: {
      quote: [children('section', 'margin:16px 6px;padding:10px 12px;border-left:2px solid #e9a058;background-color:var(--weui-BG-3,#f8eee5);border-radius:0 4px 4px 0'), null],
      card: [children('section', 'margin:18px auto;width:92%;max-width:490px;box-sizing:border-box;padding:14px 12px 15px;border-radius:5px 5px 0 0;background-color:var(--weui-BG-2,#fffdfb);background-image:linear-gradient(180deg,rgba(255,139,39,.9),rgba(255,188,90,.62) 45%,rgba(255,221,149,.47) 78%,rgba(255,250,225,0));background-blend-mode:multiply;box-shadow:inset 0 1px 0 rgba(255,240,208,.67)'), null],
    },
    roles: { main: roles, quote, card, quotedCard: card },
  },
  provenance: { assets: {} },
  capabilities: ['fontSize', 'color', 'borderColor', 'borderWidth', 'pageMargin', 'card', 'butterfly', 'table'],
};
