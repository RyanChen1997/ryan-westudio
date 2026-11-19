// Declaration helpers for the four Seneasy layouts. Text and images always come from the document.
export const element = (tag, css, children = [], attrs = {}) => [tag, css, children, attrs];
export const text = (tag, css = '') => element(tag, css, ['$text']);
export const decorative = { 'data-decorative': 'true', 'aria-hidden': 'true' };
export const box = 'box-sizing:border-box;max-width:100%;overflow-wrap:anywhere';
export const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
export const mono = "Menlo,Consolas,Monaco,'Courier New',monospace";
export const heading = (level, css, ornament) => element(`h${level}`, `${box};${css}`, ornament
  ? [text('span'), ornament]
  : level === 2
    ? [element('span', 'white-space:nowrap', ['$chapterNumber:2', '｜'], decorative), text('span')]
    : ['$text']);
export const rule = css => element('section', `line-height:0;${css}`, [], decorative);
export const picture = css => element('img', `box-sizing:border-box;display:block;max-width:100%;max-height:600px;height:auto;object-fit:contain;${css}`, [], { src: '$image' });
export const frame = css => [element('section', `${box};${css}`, ['$children']), null];

export function lists({ margin, item, bullet }) {
  const list = element('section', `margin:${margin}`, ['$children']);
  const itemRole = ordered => element('section', `${box};display:flex;align-items:flex-start;${item}`, [
    element('span', `flex:none;min-width:1.2em;padding-right:${ordered ? 5 : 6}px;white-space:nowrap;font-weight:${ordered ? 'inherit' : '700'}`, ordered ? ['$itemNumber', '.'] : [bullet], decorative),
    text('span', 'flex:1;min-width:0;overflow-wrap:anywhere'),
  ]);
  const unordered = itemRole(false), ordered = itemRole(true);
  return { list, steps: list, listItem: unordered, listItemLast: unordered, stepsItem: ordered, stepsItemLast: ordered };
}

export function preset({ id, name, description, suitableFor, pageMargin, outer, inline, blocks, roles, quote, card, reference }) {
  return {
    id, name, category: 'original', description, suitableFor, layout: { pageMargin },
    tokens: {
      outer: `${box};${outer}`, numbered: [2], inline, blocks,
      containers: { quote: frame(quote), card: frame(card) },
      roles: { main: roles, quote: roles, card: roles, quotedCard: roles },
    },
    capabilities: ['fontSize', 'color', 'borderColor', 'borderWidth', 'pageMargin', 'card', 'butterfly', 'table'],
    provenance: { reference: `用户提供的《句方便 - 优雅排版，一键分发》正文 HTML（${reference}）`, assets: {} },
  };
}
