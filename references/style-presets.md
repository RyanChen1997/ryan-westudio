# 开源版内置模板

| 名称 | 模板 ID |
| --- | --- |
| 杏暖手记 | `apricot-notes` |
| 脑机周刊 | `bci-weekly` |
| 京华艺历 | `beijing-art-calendar` |
| 蓝序手册 | `blue-sequence` |
| 陶白雅集 | `ceramic-exhibition` |
| 朱砂序章 | `cinnabar-chapters` |
| 咖啡对谈 | `coffee-dialogue` |
| 星野长卷 | `cosmos-story` |
| 晴蓝深读 | `cyan-report` |
| 月白诗笺 | `moonlit-copybook` |
| 金阙云游 | `palace-guide` |
| 坪山蓝金 | `pingshan-blue-gold` |
| 珞樱春讯 | `sakura-campus` |
| 春日观展 | `spring-art-guide` |
| 威雅野餐 | `wycombe-picnic` |
| 小米新章 | `xiaomi-keynote` |
| 丁香紫笺 | `seneasy-lilac-notes` |
| 澄蓝细线 | `seneasy-blue-rule` |
| 紫序简报 | `violet-field-notes` |

可用 CLI 的 `--preset <ID>` 指定，或在编辑器右侧切换。不指定时通常用「澄蓝细线」；科技、商务、AI 内容优先用「蓝序手册」。

主动换模板保留文字、层级、卡片内容和配图，但会重置视觉微调（含图片大小）、页边距和纯装饰块。恢复项目不会重置这些微调；如果保存时的模板不在当前开源版目录中，会换成可用样式，保留正文与图片，不重跑原文校验。「公众号蓝黄线框」回退至「蓝序手册」，旧个人模板 `user-violet-field-notes` 恢复为同款内置「紫序简报」，其余不可用模板回退至「澄蓝细线」。
