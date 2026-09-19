# 指纹字段表（Style DNA）

`dna.json` 的每个字段都能追溯到源上的一个测量点。**逐项照抄，改动即离开双胞胎。**

## 顶层结构（dna-probe 输出）

```json
{
  "mode": "page | image",
  "source": "https://… 或 /路径/画作.png",
  "captured_at": "ISO8601", "viewport": "1440x900",
  "page":     { "title","lang","dir","body_font","body_size","body_color","body_bg","scroll_height","element_count" },
  "palette":  { "background":[{hex,weight}], "text":[…], "accent_weighted":[…], "border":[…] },
  "type":     { "roles":[{font_size_px,font_weight,font_family,line_height_ratio,letter_spacing_em,color,text_transform,sample,chars,elements}],
                "size_ladder":[{size,chars}] },
  "rhythm":   { "spacing_counts":[{value,count}], "gap_counts":[…], "radii":[…], "shadows":[…] },
  "layout":   { "skeleton_host","section_count","containers":[…],"grids":[…],"flex_rows":[…],"breakpoints":[…] },
  "sections": [{ "tag","height","background","padding_y","heading","text_align","items{images,paragraphs,actions}","text_density","children" }],
  "media":    { "img_count","svg_count","aspect_ratios":[…],"object_fit":[…],"filters":[…],"blend_modes":[…],"gradients":[…],"background_images":[…] },
  "imagery":  { "count","area_share","full_bleed_count","large_count",
                "hero":{"rendered":{"width","height"},"natural":{"width","height"},"object_fit","top_px","src"},
                "hero_is_first_screen", "sample_srcs":[…] },   // 仅 page 模式
  "fonts_loaded": ["Inter 400 loaded", …],
  "histograms": { "luminance":[16],"saturation":[10],"hue":[12] },   // 仅位图模式
  "craft":    { "肌理":{画笔能量,颗粒增益,粗面占比}, "线条":{强线占比,线条连续性,笔道宽度},
                "空间":{值域档数,暗部占比,亮部占比}, "节奏":{疏密离散,重复强度,重复周期,纵深趋势},
                "边界":{硬边占比,软边占比,边硬度}, "needs_vision":[…] }   // 仅位图模式
}
```

## 每个字段怎么来的

| 字段 | 测量口径 | 怎么用 |
| --- | --- | --- |
| `palette.background[0]` | 所有可见元素的 `background-color` 按**渲染面积**加权 | 主底色；比值决定"暗底/亮底"，别把它当纯白或纯黑想当然 |
| `palette.text` | 有自有文本节点的元素，按 `字符数 × 字号` 加权 | 正文色取"与底色亮度差最大"的那个，弱化色取次高权重 |
| `palette.accent_weighted` | 字重 ≥ 600 的文字色再加权 | 点缀色来源；一个就够，别扩散成套色 |
| `palette.border` | 有边框的元素，按**面积**加权 | 分隔线/卡片描边色 |
| `type.roles[]` | 按 `字号+字重+字族+行高+字距` 归组，取字符数最多的组 | 每个角色 = 一种排印用途；`sample` 是它的实际文本样例 |
| `type.size_ladder[]` | 去重后的字号，按字符量排序 | 字号阶梯；**相邻级比**才是可复刻的规律，不是绝对值 |
| `rhythm.spacing_counts` | `margin/padding/gap` 四边的实际值，频次统计 | 反推间距单位（通常是 4 或 8 的倍数） |
| `rhythm.radii` | `border-radius` 频次；**≥100px 视为胶囊**，单列 | 形状半径取 <100px 里最高频的那个；胶囊只用于按钮/头像 |
| `rhythm.shadows` | `box-shadow` 原文 | 阴影配方照抄（含色与模糊半径） |
| `layout.grids` | `display:grid` 的轨道数 | 分栏参考；**不是**铁律，位图源自行按 12 栏推 |
| `layout.breakpoints` | 样式表里的 `min/max-width` 媒体查询 | 断点分档 |
| `sections[]` | 段落宿主的直接块（高 ≥80px、宽 ≥25% 视口） | **版式骨架**：块序 + 每块的高/内距/对齐/图文钮数量/文字密度 |
| `media.*` | 图片比例、`object-fit`、`filter`、`mix-blend-mode`、渐变原文 | 图案元素处理策略 |
| `imagery.area_share` | 可见 `<img>`/`<picture>` 的**渲染面积之和 ÷ 视口面积** | **图位密度**；≥ 0.15 即"图像密集"——产出必须带同量级图像位，只画线稿不算双胞胎 |
| `imagery.full_bleed_count` / `large_count` | 渲染宽 ≥ 视口 90% / ≥ 40% 的图各几张 | 决定"满幅压图"与"成组大图"各要几张 |
| `imagery.hero` | 第一张满幅图的渲染尺寸、`naturalWidth/Height`、`object-fit`、`top_px` | 首屏主图的**画幅比**按它裁；`top_px` 用于判首屏 |
| `imagery.hero_is_first_screen` | hero 的 `top_px` 是否落在首屏（`< viewport 高`）内 | 为真 = 本风格签名性的"满幅照片 + 标题压图"开局，缺它一眼看出不对 |
| `stats.mid_tone_share` | 位图 4–11 档明度像素占比 | **照片 vs 线稿的唯一可靠判据**：实拍照片 0.59–0.93，线稿 0.006–0.013 |
| `stats.photographic` | `mid_tone_share >= 0.4` | 图像策略门禁；`detail_density` 分辨不出照片与线稿（2.5 vs 2.3），只作参考 |
| `craft.肌理.颗粒增益` | 拉普拉斯能量 ÷ 梯度能量 | 高 = 沙粒 / 短笔触 / 厚堆；低 = 平涂晕染（德库宁 vs 罗斯科） |
| `craft.肌理.粗面占比` | 局部 3×3 明度标准差 > 0.06 的像素占比 | 厚堆、沙土、拼贴的粗面质感 |
| `craft.线条.强线占比` / `连续性` / `笔道宽度` | 梯度 > 0.24 的像素占比；其中 4 邻域有两个以上同为强边的比例；强边水平连续段平均长度 | 线的分量、断裂还是连绵、粗笔还是细线（波洛克 vs 赵无极） |
| `craft.空间.值域档数` | 16 档明度里占比 > 6% 的档数 | 1–2 档 = 平涂；4 档以上 = 多层次。纵深感仍交视觉模型 |
| `craft.节奏.疏密离散` / `重复强度` / `重复周期` | 8×8 分块均值的 CV；行/列亮度轮廓**去趋势后**的自相关峰与周期 | 疏密对比与重复单元（即兴爵士 vs 节拍器）。**不去趋势就全是 0.94–0.99，没有判别力** |
| `craft.边界.边硬度` | 硬边像素占比 ÷（硬边 + 软边占比） | 越高越硬（纽曼），越低越渗透（罗斯科） |
| `craft.needs_vision` | 量不出来的三条 | 符号与图式系统 · 情绪与精神气质 · 纵深方向 —— 必须交视觉模型，标 `source: "vision"` |
| `histograms` | 位图逐像素：16 档明度、10 档饱和、12 档色相 | 门禁用；位图源与截图源才有 |

## 位图源（画作 / 设计稿）的补充口径

脚本给：k-means 8 色（含面积占比、明度、饱和度）、明度/饱和/色相直方图、平均明度与饱和度、对比跨度、画幅比。

测不出来、需要**视觉模型读图**的：字族气质（衬线/无衬线/几何/人文）、字号比例、字距松紧、行距、网格与留白节奏、笔触/颗粒/材质、构图重心、图案处理手法。规则：

1. 每项读图结论标 `source: "vision"` + `unverified: true`。
2. 同时写 `how_to_verify`：怎么用真实文件核（拿到 PSD 看图层、拿到网页看 computed style）。
3. 读不出来的（比如画作没有字号概念）→ 给**等效口径**：把画作当成版式看，"标题区高度占画幅比例"替代字号。

## 设计模板源

- 能拿到原始文件（Figma/PSD/Sketch 导出、可访问的 HTML）：优先读**真实数值**，比读图准一个量级。
- 只有 PDF / 图片：按位图流程走，再用工具量出画布尺寸与边距比例，把"版式结构"落成**比例**（左栏 42%、右栏 52%、栏距 6%），而不是像素。

## 缺字段怎么办

| 情况 | 处理 |
| --- | --- |
| 脚本量不到（登录墙、画作） | 视觉模型读图 + `unverified: true` + `how_to_verify` |
| 源本身没有该特性（如无圆角、无阴影） | 写 `none`，并在规则里写"源未使用，产出也别用"——**别补默认值** |
| 两种读法冲突（脚本 vs 读图） | 以**脚本/原文件**为准，冲突写进 `notes` |
| 一个字都没有（纯图形素材） | `type` 整节留空，排印改用"风格化的字族方向 + 与图形同呼吸的字号阶梯" |

## 手动测量协议（脚本跑不了时的兜底）

1. 截图按 1:1 视口，量 3 个已知元素的实际像素宽高，校准缩放比。
2. 量主容器的左右边距 → 容器宽；量最窄的重复间隙 → 间距单位。
3. 从最大标题的字号除以正文字号，得出级比；再乘回近似的字号阶梯。
4. 用取色器取底色、正文色、点缀色三点；面积比目估到 10% 精度即可。
5. 全部标 `unverified: true`，并在门禁里用**位图比对**兜底（截图比截图）。
