// Layout carried over unchanged from the reviewed personal preset user-violet-field-notes.
const roles = {
  paragraph: ["p","margin:0 0 24px;box-sizing:border-box;font-size:15px;line-height:27.8px;letter-spacing:.58px;text-align:justify;color:var(--weui-FG-0,#191919);overflow-wrap:break-word",["$text"],{}],
  paragraphLast: ["p","margin:0 0 24px;box-sizing:border-box;font-size:15px;line-height:27.8px;letter-spacing:.58px;text-align:justify;color:var(--weui-FG-0,#191919);overflow-wrap:break-word",["$text"],{}],
  h1: ["section","box-sizing:border-box;margin:31px 0 14px;padding:0 3px;text-align:center",[["section","display:block;text-align:center;margin:0 auto 12px",[["span","display:block;color:#e5e1ed;font-family:Arial,sans-serif;font-weight:800;font-size:46px;line-height:42px;letter-spacing:-1.8px;-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 45%,transparent 93%);mask-image:linear-gradient(to bottom,#000 0%,#000 45%,transparent 93%)",["$chapterNumber:2"],{"data-decorative":"true","aria-hidden":"true"}],["span","display:table;position:relative;margin:-13px auto 0;padding:0 2px;font-family:Arial,sans-serif;font-size:12px;line-height:14px;font-weight:800;letter-spacing:.7px;color:#442e61",["NOTES"],{"data-decorative":"true","aria-hidden":"true"}]],{"data-decorative":"true","aria-hidden":"true"}],["h1","max-width:27em;margin:0 auto;font-size:17px;line-height:31.8px;font-weight:700;font-style:italic;letter-spacing:0;text-align:center;color:#442e61;overflow-wrap:anywhere",["$text"],{}]],{}],
  h2: ["section","margin:25px 0 10px;box-sizing:border-box",[["h2","box-sizing:border-box;margin:0;padding:1px 0 1px 11px;border-left:3px solid #8663aa;font-size:16px;line-height:25px;font-weight:700;letter-spacing:.2px;color:#442e61;text-align:left;overflow-wrap:anywhere",["$text"],{}],["span","display:block;width:41px;height:0;border-top:1px solid #d7cbe6;margin:6px 0 0",[],{"data-decorative":"true","aria-hidden":"true"}]],{}],
  h3: ["h3","margin:18px 0 6px;font-size:15px;line-height:26px;font-weight:700;box-sizing:border-box;letter-spacing:.25px;text-align:left;color:#442e61;overflow-wrap:anywhere",["$text"],{}],
  h4: ["h4","margin:14px 0 6px;font-size:14px;line-height:25px;font-weight:700;box-sizing:border-box;letter-spacing:.25px;text-align:left;color:#442e61;overflow-wrap:anywhere",["$text"],{}],
  list: ["section","margin:0 0 24px",["$children"],{}],
  steps: ["section","margin:0 0 24px",["$children"],{}],
  listItem: ["section","display:flex;align-items:flex-start;gap:8px;margin:8px 0;box-sizing:border-box;font-size:15px;line-height:27.8px;letter-spacing:.58px;text-align:justify;color:var(--weui-FG-0,#191919);overflow-wrap:break-word",[["span","flex:none;min-width:15px;color:#442e61",["•"],{"data-decorative":"true","aria-hidden":"true"}],["span","flex:1;min-width:0",["$text"],{}]],{}],
  listItemLast: ["section","display:flex;align-items:flex-start;gap:8px;margin:8px 0;box-sizing:border-box;font-size:15px;line-height:27.8px;letter-spacing:.58px;text-align:justify;color:var(--weui-FG-0,#191919);overflow-wrap:break-word",[["span","flex:none;min-width:15px;color:#442e61",["•"],{"data-decorative":"true","aria-hidden":"true"}],["span","flex:1;min-width:0",["$text"],{}]],{}],
  stepsItem: ["section","display:flex;align-items:flex-start;gap:8px;margin:8px 0;box-sizing:border-box;font-size:15px;line-height:27.8px;letter-spacing:.58px;text-align:justify;color:var(--weui-FG-0,#191919);overflow-wrap:break-word",[["span","flex:none;min-width:15px;color:#442e61",["$itemNumber","."],{"data-decorative":"true","aria-hidden":"true"}],["span","flex:1;min-width:0",["$text"],{}]],{}],
  stepsItemLast: ["section","display:flex;align-items:flex-start;gap:8px;margin:8px 0;box-sizing:border-box;font-size:15px;line-height:27.8px;letter-spacing:.58px;text-align:justify;color:var(--weui-FG-0,#191919);overflow-wrap:break-word",[["span","flex:none;min-width:15px;color:#442e61",["$itemNumber","."],{"data-decorative":"true","aria-hidden":"true"}],["span","flex:1;min-width:0",["$text"],{}]],{}],
  divider: ["section","display:flex;width:100%;max-width:402px;margin:23px auto 13px;align-items:center;height:34px;box-sizing:border-box",[["span","flex:1;border-top:1px solid #732ca6",[],{"data-decorative":"true","aria-hidden":"true"}],["span","position:relative;flex:0 0 16px;height:34px",[["span","position:absolute;left:4px;top:0;height:15px;border-left:3px solid #732ca6;transform:rotate(14deg)",[],{"data-decorative":"true","aria-hidden":"true"}],["span","position:absolute;left:11px;top:0;height:33px;border-left:3px solid #732ca6;transform:rotate(14deg)",[],{"data-decorative":"true","aria-hidden":"true"}]],{"data-decorative":"true","aria-hidden":"true"}],["span","flex:1;border-top:1px solid #732ca6",[],{"data-decorative":"true","aria-hidden":"true"}]],{"data-decorative":"true","aria-hidden":"true"}],
  image: ["img","display:block;width:72%;max-width:340px;height:auto;margin:20px auto;padding:5px;border:1px solid #dfd6ea;border-radius:2px;background-color:var(--weui-BG-2,#f7f4fb);box-sizing:border-box",[],{"src":"$image"}],
};
const inset = {
  ...roles,
  paragraph: ["p","margin:0 0 15px;box-sizing:border-box;font-size:15px;line-height:27.8px;letter-spacing:.58px;text-align:justify;color:var(--weui-FG-0,#191919);overflow-wrap:break-word;font-size:15px;line-height:33px;letter-spacing:2px",["$text"],{}],
  paragraphLast: ["p","margin:0;box-sizing:border-box;font-size:15px;line-height:27.8px;letter-spacing:.58px;text-align:justify;color:var(--weui-FG-0,#191919);overflow-wrap:break-word;font-size:15px;line-height:33px;letter-spacing:2px",["$text"],{}],
};

export default {
  id: 'violet-field-notes',
  name: "紫序简报",
  category: 'original',
  description: "渐隐叠影章号、居中紫色斜题、角线导语；小节题签、淡紫下缘强调及细框配图。",
  suitableFor: ["技术解读","会议纪实","方法教程"],
  layout: {"pageMargin":20,"panel":null},
  tokens: {
    outer: "box-sizing:border-box;font-family:Arial,\"Microsoft YaHei\",\"PingFang SC\",system-ui,sans-serif;font-size:15px;line-height:27.8px;color:var(--weui-FG-0,#191919);background-color:var(--weui-BG-1,#ffffff);overflow-wrap:break-word;padding:20px",
    numbered: [1],
    inline: {
      strong: "font-weight:700;color:#442e61;box-shadow:inset 0 -.28em rgba(134,99,170,.17)",
      headingStrong: "font-weight:inherit;color:inherit;box-shadow:none",
      em: "font-style:italic",
      link: "color:#442e61;text-decoration:underline",
    },
    blocks: {
      caption: "font-size:13px;line-height:1.55;text-align:center;color:var(--weui-FG-1,#666269);letter-spacing:.2px",
    },
    containers: {
      quote: [["section","margin:22px 0 24px;padding:10px 13px 0;border-left:2px solid #8663aa;background-color:var(--weui-BG-2,#f8f5fb)",["$children"],{}],null],
      card: [["section","margin:32px 0 27px;padding:0;box-sizing:border-box",[["section","height:25px;position:relative;text-align:left",[["span","position:absolute;left:0;top:9px;height:0;width:43px;border-top:1px solid #9b9a9d",[],{"data-decorative":"true","aria-hidden":"true"}],["span","position:absolute;left:8px;top:0;width:0;height:25px;border-left:1px solid #9b9a9d",[],{"data-decorative":"true","aria-hidden":"true"}]],{"data-decorative":"true","aria-hidden":"true"}],["section","padding:0 26px",["$children"],{}],["section","height:25px;position:relative;text-align:right",[["span","position:absolute;right:0;bottom:9px;height:0;width:43px;border-top:1px solid #9b9a9d",[],{"data-decorative":"true","aria-hidden":"true"}],["span","position:absolute;right:8px;bottom:0;width:0;height:25px;border-left:1px solid #9b9a9d",[],{"data-decorative":"true","aria-hidden":"true"}]],{"data-decorative":"true","aria-hidden":"true"}]],{}],null],
    },
    roles: { main: roles, quote: roles, card: inset, quotedCard: inset },
  },
  capabilities: ['fontSize', 'color', 'borderColor', 'borderWidth', 'pageMargin', 'card', 'butterfly', 'table'],
  provenance: { reference: "https://mp.weixin.qq.com/s/KtPufuFfKn5De9EqKCmoYA", assets: {} },
};
