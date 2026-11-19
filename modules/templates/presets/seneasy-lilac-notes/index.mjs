import { heading, lists, mono, picture, preset, rule, sans, text } from '../../seneasy-layout.mjs';

const ink = '#4a4a4a', purple = '#773098';
const badge = `var(--weui-FG-0,${purple})`, accent = 'var(--weui-FG-0,#7f52bb)';
const violet = '#916dd5', line = '#d89cf6', edge = '#eadcf7';
const lilac = 'var(--weui-BG-2,#f4eeff)', mist = 'var(--weui-BG-2,#f7f2ff)';
const paragraph = text('p', 'margin:0 0 16px;text-align:justify');

export default preset({
  id: 'seneasy-lilac-notes', name: '丁香紫笺',
  description: '紫色居中题头、淡紫半胶囊章牌和细线小标题，正文轻盈。',
  suitableFor: ['经验分享', '学习笔记', '活动回顾'], pageMargin: 15, reference: 'a.html · 丁香紫',
  outer: `font-family:${sans};font-size:15px;line-height:27px;letter-spacing:1px;color:${ink};background-color:var(--weui-BG-1,#fff);padding:15px`,
  inline: {
    strong: `font-weight:700;color:${accent}`, em: `font-style:normal;color:${accent};border-bottom:1px dashed ${line}`,
    link: `color:${accent};font-weight:600;text-decoration:none;border-bottom:1px solid ${violet}`,
    code: `font-family:${mono};font-size:.88em;font-weight:600;letter-spacing:0;padding:2px 6px;margin:0 2px;border-radius:4px;background-color:${lilac};color:${badge}`,
  },
  blocks: {
    caption: 'margin:-10px 0 22px;color:#6b5679',
    codeBlock: `font-family:${mono};font-size:13px;line-height:22.1px;letter-spacing:0;margin:22px 0;padding:16px 18px;border:1px solid ${edge};border-radius:8px;background-color:var(--weui-BG-2,#faf7ff);color:#463b55`,
    table: 'margin:22px 0;font-size:13px;letter-spacing:0;background-color:var(--weui-BG-1,#fff)',
    tableCell: `border-color:${edge};line-height:20.15px;vertical-align:middle`,
    tableHeader: `font-weight:700;background-color:${lilac};color:${badge}`,
  },
  roles: {
    paragraph, paragraphLast: paragraph,
    h1: heading(1, `font-size:24px;font-weight:700;line-height:33.6px;margin:24px 0 26px;text-align:center;color:${purple}`),
    h2: heading(2, `display:block;width:fit-content;font-size:18px;font-weight:700;line-height:27px;margin:40px 0 18px;padding:4px 14px 4px 10px;border-left:5px solid ${violet};border-radius:0 20px 20px 0;background-color:${lilac};color:${badge}`),
    h3: heading(3, `display:block;width:fit-content;font-size:17px;font-weight:700;line-height:25.5px;margin:34px auto 16px;padding:0 4px 5px;border-bottom:2px solid ${line};text-align:center;color:${badge}`),
    h4: heading(4, `font-size:16px;font-weight:700;line-height:24px;margin:26px 0 12px;color:${accent}`),
    ...lists({ margin: '0 0 16px', item: 'margin:6px 0', bullet: '○' }),
    divider: rule(`margin:36px auto;width:100%;height:1px;background-color:${line}`),
    image: picture('margin:22px auto;border-radius:6px;box-shadow:0 4px 14px rgba(119,48,152,.15)'),
  },
  quote: `margin:22px 0;padding:14px 18px;border-left:4px solid ${line};border-radius:0 8px 8px 0;background-color:${mist}`,
  card: `margin:22px 0;padding:14px 18px;border:1px solid ${edge};border-radius:8px;background-color:${lilac}`,
});
