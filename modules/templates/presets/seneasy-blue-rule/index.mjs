import { heading, lists, mono, picture, preset, rule, sans, text } from '../../seneasy-layout.mjs';

const ink = '#4a4a4a', blue = 'var(--weui-LINK,#3c70c6)', teal = '#3c7076';
const gray = 'var(--weui-BG-2,#efefef)', pale = 'var(--weui-BG-2,#f5f5f5)';
const paragraph = text('p', 'padding-top:23px;margin:16px 0');

export default preset({
  id: 'seneasy-blue-rule', name: '澄蓝细线',
  description: '蓝字题头和细线分隔，章标题左对齐，留白宽松，引用为素灰底。',
  suitableFor: ['教程', '更新说明', '知识长文'], pageMargin: 8, reference: 'b.html · 澄蓝细线',
  outer: `font-family:${sans};font-size:16px;line-height:28px;color:${ink};background-color:var(--weui-BG-1,#fff)`,
  inline: {
    strong: 'font-weight:600;color:inherit', em: 'font-style:normal;letter-spacing:.3em;color:var(--weui-FG-0,#c93424)',
    link: `color:${blue};border-bottom:1px solid ${blue};text-decoration:none`,
    code: `font-family:${mono};font-size:14px;padding:2px 6px;border-radius:3px;background-color:${pale};color:${blue}`,
  },
  blocks: {
    caption: 'margin:-13px 0 25px;color:#5a6268',
    codeBlock: `font-family:${mono};font-size:14px;line-height:23.8px;margin:20px 0;padding:16px;border-radius:8px;background-color:${pale};color:#414a59`,
    table: 'margin:20px 0;font-size:13px', tableCell: 'border-color:#e0e0e0;line-height:20.15px;vertical-align:middle',
    tableHeader: `font-weight:600;background-color:var(--weui-BG-2,#f0f0f0);color:${blue}`,
  },
  roles: {
    paragraph, paragraphLast: paragraph,
    // Equivalent one-line height without forcing the same line-height on wraps.
    h1: heading(1, `font-size:20px;font-weight:700;line-height:27px;padding:34px 0;margin:38px 0 10px;text-align:center;border-bottom:2px solid ${teal};color:${blue}`),
    h2: heading(2, `font-size:18px;font-weight:700;line-height:26px;padding:7px 0 5px;margin:38px 0 10px;color:${blue}`),
    h3: heading(3, `font-size:16px;font-weight:700;line-height:28px;margin:20px 0 16px 8px;color:${blue}`),
    h4: heading(4, `font-size:15px;font-weight:700;line-height:26px;margin:20px 0 10px;color:${ink}`),
    ...lists({ margin: '16px 0', item: 'margin:8px 0;color:#161616', bullet: '•' }),
    divider: rule('margin:20px 0;height:1px;background-color:rgba(60,122,198,.75)'),
    image: picture('margin:20px auto 25px;border-radius:4px'),
  },
  quote: `margin:20px 0;padding:15px 20px;line-height:26.25px;font-size:15px;background-color:${gray}`,
  card: `margin:20px 0;padding:15px 20px;border-top:1px solid ${teal};background-color:${pale}`,
});
