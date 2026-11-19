# 公众号发布兼容性

官方指引：<https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html>。
官方补充检测：<https://github.com/wechatjs/verify-article-structure-spec>。

用户直接编辑、直接复制当前正文，没有编辑器校验或单独发布预览。唯一内容对照发生在 AI 首次结构化之后、编辑器启动之前，详见 content-integrity.md。

渲染实现始终遵守发布合同：全内联样式；列表输出 section + 符号而不是 ul/ol/li；浅色背景用微信变量；本地图片和装饰转内联 PNG；无脚本、style 标签或 SVG。图片读取和编码失败会明确报错，这是生成输出所必需的错误处理，不是用户校验流程。

编辑视图与输出共用模板样式和视觉规则。卡片不在正文里混入编辑提示，列表布局、行内标记嵌套、字体继承与装饰图应保持一致。tests/export-contract.mjs 与真实浏览器中的样式/几何比较仅用于开发回归，不在用户编辑或复制时运行。

夜间仅模拟阅读效果，不改变保存和复制色值。最终仍需检查实际粘贴到微信后的样式、宽度、文字和图片转存：微信可能再次转换内容，浏览器所见即所得不等于微信真机验收。项目不会隐式上传资料到第三方。
