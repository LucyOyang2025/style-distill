---
name: style-distill
description: 蒸馏设计源（网站/画作/模板）成可复用设计技能：指纹提取→铸造技能→双胞胎门禁，含多语言并行排版与素材统一
description_full: 把任意设计素材源（设计网站 UI、设计师画作/风格图、设计模板）蒸馏成一个可复用的「设计技能」包：先量出风格指纹（调性、版式骨架、色彩构成、字族/字号/字距/行距、间距、圆角与阴影、图案元素处理策略、内容层次），再铸造成带 frontmatter 的 skill（规则数值 + 设计令牌 + 双胞胎骨架），最后用六道门禁（主色、色相、明度、字号阶梯、栏数、图像策略/照片感）判定是否与源同构。同时负责文案不失真的多语言并行排版、以及把上传图形统一进该风格。凡用户说「做成 XX 风格」「跟这个网站/这张图一模一样」「蒸馏一个设计 skill」「复刻这个模板」时，先读本技能。
short_description: Distill a design source into a reusable twin-style skill.
short_description_zh: 把设计源蒸馏成可复用设计技能（指纹→铸造→双胞胎门禁）。
version: 1.0
updated: 2026-09-19T22:00:00Z
---

# style-distill · 设计源蒸馏

把一个**设计源**变成一套**能反复复用的设计技能**，产物不是「参考一下」，而是**双胞胎**：换个内容，看起来还是同一个设计师做的。

**源**可以是：设计网站 / 产品页（活体 UI）、设计师画作或风格图（位图）、设计模板（Figma / PSD / 网页 / PDF 截图）。
**产物**：一个 skill 包 —— 数值规则 + 设计令牌 + 双胞胎骨架 + 指纹原件（可复核）。

## 先判源类型，再选路线（决定后面用哪套工具）

| 源的情形 | 走哪条路线 | 关键工具 |
| --- | --- | --- |
| 页面能直连、能跑 JS（活体 UI） | **活体路线**：量 computed style | `dna-probe.mjs <url>` |
| 只能拿到截图 / 设计稿 / 画作（位图） | **位图路线**：量像素统计 | `dna-probe.mjs <img>` + `probe-*.mjs` |
| `curl` 403 但真人浏览器打得开 | **借上下文**：借登录态取全页长图 | `grab-cdn.mjs` + `references/cdn-bypass.md` |
| 真站被 Cloudflare / 登录墙拦死 | **位图路线**（用条目页代管截图），量不到的字段标 unverified | `probe-palette/margins/lines.mjs` + `references/bitmap-source.md` |
| 要出双语 / 多语种稿 | 文案走**平行层**，截图配色按令牌改写 | `references/multilang.md`、`references/screenshot-localization.md` |

## 两条主梁（先定这两条，再谈其他）

1. **构图构成（第一）**：东西放在哪、多大、留多少白 —— 段落骨架与块序、容器与栏数、间距档位、**图位密度与首屏压图**。块序本身就是构图，不许重排。
2. **色彩构成（第二）**：什么颜色、**占多大面积** —— 色值与面积比是同一件事的两面。

顺序颠倒 = 白做：构图不对，颜色与字体再准也不像。其余（排印、图案、层次、素材、多语言）都服从这两条。

3. **工艺与气质（第三，画作源必做）**：笔触与肌理 · 线条语言 · 空间处理 · 节奏与重复 · 边界处理 · 符号与图式系统 · 情绪与精神气质 —— 构图与色彩相同而笔触不同，就是两个画家。前五条有像素代理量（`craft`），后两条只能读图。详见 `references/style-dna.md` 的 `craft` 字段表。

## 四段流水线（不许跳步）

| 段 | 做什么 | 产出 |
| --- | --- | --- |
| 1 · READ | 判源类型 + 写一行 Design Read | 一句话定调 + 源清单 |
| 2 · EXTRACT | 量指纹，不是"看感觉" | `dna.json`（每个数字带出处） |
| 3 · MINT | 把指纹铸成 skill | `<skills>/design-<名>/` |
| 4 · VERIFY | 六道门禁判同构 | `twin.json` + 门禁报告 |

### 1 · READ

先判源类型，再写一行 **Design Read**：

> 「按 \<源类型\> 读：\<调性家族\>，主打 \<2–3 个可测特征\>，克制 \<1 个反例\>。」

例：`按活体网页读：暗色科技，主打 8px 间距单位与 1.13× 字号级比，克制彩色装饰。`

同时列清源清单：截了几屏、画作几张、模板几个页；哪部分是**风格**（要抄），哪部分是**内容**（必须换）。

### 2 · EXTRACT —— 用工具量，别用眼睛猜

```bash
S=<agent_state>/skills/style-distill/scripts
node $S/dna-probe.mjs https://站点 --out dna.json --shot src.png --wait 3000
node $S/dna-probe.mjs ./画作.jpg   --out dna.json          # 位图：k-means 8 色 + 明度/色相直方图
node $S/dna-probe.mjs ./模板.html  --out dna.json --shot t.png
```

拿到的是**可测指纹**：按面积加权的调色板、字族栈、字号阶梯与每级的行高/字距、间距频次、圆角、阴影、网格栏数、断点、段落骨架（块的顺序与高/内距/图文钮数量）、图案处理（比例/object-fit/filter/blend/渐变）、**图位密度 `imagery`（图像数量、面积占比、满幅图数、hero 尺寸与画幅比、首屏是否压图）**，以及位图模式下的**工艺指纹 `craft`**（笔触与肌理 · 线条语言 · 空间值域 · 节奏与重复 · 边界处理）。

> **两条主梁先量**：`layout`/`sections`/`imagery`（构图）与 `palette`（色彩）跑完就能定调；这两块不准，后面全是白工。
>
> **工艺指纹量不出的三条**（`craft.needs_vision`）：符号与图式系统、情绪与精神气质、纵深方向 —— 交视觉模型七问逐一作答，标 `source: "vision"`，答不出就写"看不出"，不许编。活体页面源要这一节，就把整页截图另跑一次位图模式，把 `craft` 并回指纹。

- **活体源**：必须跑脚本（computed style 才是真的；视觉效果经常在骗人）。
- **位图源**：脚本给调色板与明度/色相分布；**字族、字号、间距这类测不出来的，交给视觉模型读图**（`read-image.mjs` 或本 agent 的视觉模型），逐项标注 `unverified: true` 并写"如何核"。
- **模板源**（Figma/PSD/PDF）：按位图走；能拿到原始文件时优先读其中真实的色值/字号/图层间距，比读图准。
- **真站进不去**（Cloudflare/登录墙）：用条目页代管的整页截图走位图路线 —— `scripts/probe-palette.mjs`（主色按最饱和色簇取）、`scripts/probe-margins.mjs`（版心 + 深色带位置）、`scripts/probe-lines.mjs`（行高比例当字阶用）；量不到的 computed 字段标 unverified。详见 `references/bitmap-source.md`。
- **缺就标缺**：量不到的字段写 `null` + `unverified`，不许用"现代简约"这类词补位。

**反爬 / 403 的源怎么取**（`curl` 403、真人浏览器却打得开）：

1. 症状 403 = 那一次请求**没带 cookie / UA / referer**，不是站挂了 —— 所以**借用户自己的浏览器上下文**（临时 profile + 独立端口，不动他正在用的那个），比伪造 header 稳。
2. 条目页本身 403 时，页里那张**代管截图的文件名就是真站域名**（`…-td-lovera-framer-website.jpg` → `https://td-lovera.framer.website/`）；真站往往能直连（200），**指纹从真站量，不从聚合站量**。
3. 取全页长图用 `scripts/grab-cdn.mjs`：**把图片 URL 当顶层文档打开**（浏览器自带 cookie/referer，一步过 403 与 CSP）→ 页内 canvas 按 1400px **分片**导出。`element.screenshot()` / `fullPage:true` 拍不到视口外，别用。
4. 借上下文的取证命令、拼回整图、失败模式与红线，见 `references/cdn-bypass.md`。

### 3 · MINT —— 铸造成可复用技能

```bash
node $S/mint-skill.mjs --dna dna.json --name design-<kebab> --title "<中文名>" \
     --out <agent_state>/skills/design-<名>
```

产出（这就是"自己的设计 skill"）：

| 文件 | 作用 |
| --- | --- |
| `SKILL.md` | 带 frontmatter，平台可索引；下次说「用 XX 风格做一页」直接命中 |
| `references/style-rules.md` | 9 节硬规则：**§1 构图构成（第一优先）· §2 色彩构成（第二优先）** / 排印 / 图案 / 工艺与气质 / 素材统一·占位 / 多语言 / 自检 |
| `references/style-dna.json` | 指纹原件（门禁的输入，也是"离开双胞胎"的唯一裁判） |
| `assets/tokens.css` | 设计令牌，可直接 `<link>` |
| `assets/twin-scaffold.html` | 双胞胎骨架，含 `:lang()` 多语言层 |

铸造完即装入并重建路由索引：

```bash
PY=~/.penguin/data/default_project/agents/default_agent/shared_env/py-docx/bin/python3
$PY ~/.penguin/skill-library/_route.py --build
```

### 4 · VERIFY —— 六道门禁，不过不算双胞胎

```bash
node $S/dna-probe.mjs ./产出.html --out twin.json --shot twin.png
node $S/dna-probe.mjs --compare dna.json twin.json     # 退出码 0 = twin
```

| 门禁 | 判据 |
| --- | --- |
| 主色承接 | 源前 8 色的**面积占比**里 ≥ 70% 能在产出里找到（杂色单列） |
| 色相分布 | 12 档色相 + 1 档无彩，JS 散度 ≤ 0.30 |
| 明度分布 | 16 档明度，JS 散度 ≤ 0.30 |
| 字号阶梯 | 源最大 6 级里 ≥ 70% 在产出里出现（±1px）；界面小字不必全搬 |
| 栏数一致 | 主内容网格栏数相同 |
| **图像策略（照片感）** | 产出位图的**中间调占比** ≥ 源的门槛（源有照片时按源算，最低 0.12）。源图像面积占比 ≥ 0.15 时，**产出必须带同量级图像位；只画线稿过不了这关** |

- **强比对**（推荐）：把源截图与产出截图**都跑位图模式**再比，明度/色相就是真像素统计，比调色板近似严格得多。
- **图像门禁怎么判**：实拍照片的中间调占比 0.59–0.93，线稿/UI 示意图 0.006–0.013（差 40 倍）；`detail_density` 分辨不出，别拿它当判据。产出是 PDF / 位图时，把封面或图页截图丢进位图模式测即可。
- 人工确认：把两张图并排给人看，问"哪张是源"；一眼看得出，就还没到位。
- 不过就改对应数值重跑；**先改 §1 构图 / §2 色彩 这两条主梁**，**不许交差式声明"很接近了"**。

## 三条铁律

1. **数值优先**：规则表外的颜色、字号、间距不出现。要新色只能从 accent 调明度，不引入新色相。
2. **文案不失真**：源文案一字不改（缩写、意译、删标点都不行）；翻译只进平行层，`source_text` 永久保留。详见 `references/multilang.md`。
3. **素材统一但不变形**：上传图形只做色调 / 质感 / 形状的收编，不重绘内容、不换脸、不美化产品。详见 `references/unify-assets.md`。
4. **没投喂就占位，不空着也不硬搬**：图位缺素材时按「本机自绘 → 本机生成 → **免费素材站**（Unsplash / Pexels / Openverse / Wikimedia，须核许可、留痕、下载入本地、统一处理、标注）→ **源模版自身图作临时占位**（须显著标注「临时占位 · 待替换」、写进清单、交付时逐条说明）」的顺序补；找不到合规的就留白 + 一行说明。详见 `references/placeholders.md`。
5. **素材来源按成本顺位取，别一上来就抓站**：**客户录入的文档** → 客户自备截图 → 抓现有站点（只做调色融合）→ 截图本地化。
   前两条够用就别做后两条；「只有一个单语界面却要出别的语种」才走截图本地化，那是半天级的活。
   详见 `references/screenshot-localization.md`。

## 反抄袭红线

- 只蒸馏**风格层**（构图、配色、排印、版式、质感），不搬运**内容层**（源文案、源图片、Logo、插画）。
- 产物必须换新文案与新图形；图位缺素材时按 `references/placeholders.md` 补占位。**源模版自身的图只许当「临时占位」**：必须显著标注待替换、列入 `占位素材清单.md`、交付时逐条说清，不得当终稿素材、不得对外宣称是自家作品。
- 复刻**某个具名品牌**的成品对外使用前，提醒用户商标与外观设计的边界。

## 与其他技能的分工

- **有设计源** → 本技能接管风格与版式；通用审美技能（`design-taste-frontend` / `minimalist-skill` / `soft-skill`）不参与定调，避免把源"改回平均脸"。
- **没有设计源**（凭 brief 从零设计）→ 走 taste 家族，本技能不下场。
- **收尾** → `impeccable` 的 polish / critique 仍要跑：风格像源，工艺要过关（层级、间距、可访问性、空状态）。
- **微信小程序** → 落 `.wxml`/`.wxss` 时按 `weui-wxss` 的组件与类名实现（令牌照本技能的数值）。

## 文件

| 文件 | 用途 |
| --- | --- |
| `scripts/dna-probe.mjs` | 指纹提取（活体/位图）+ 双胞胎门禁比对。零依赖，CDP 驱动本机 Chromium |
| `scripts/mint-skill.mjs` | 指纹 → skill 包 |
| `scripts/grab-cdn.mjs` | 借浏览器上下文绕 CDN 403 取全页长图（图片 URL 当顶层文档 + canvas 分片） |
| `scripts/probe-palette.mjs` | 位图源：高频色桶 + 最饱和色簇（把 accent 取准） |
| `scripts/probe-margins.mjs` | 位图源：内容左右边界（版心）+ 深色带位置 |
| `scripts/probe-lines.mjs` | 位图源：逐行墨量切文字行 → 行高比例（当字阶用） |
| `scripts/make-recolor-map.mjs` | 把界面图的调色映射表换成另一个模版的色系（只换右值，素材与词典都不用重做） |
| `references/style-dna.md` | 指纹字段表：每个字段怎么量、怎么用、缺了怎么办 |
| `references/multilang.md` | 多语言并行排版规范（文案不失真） |
| `references/unify-assets.md` | 上传图形统一进风格的配方 |
| `references/placeholders.md` | 图位缺素材时的占位策略（自绘 → 生成 → 免费素材站 → 源图当临时占位；许可核验、留痕、待替换清单） |
| `references/cdn-bypass.md` | 403 源的取证配方：借登录态、条目页反推真站域名、切片取长图、红线 |
| `references/bitmap-source.md` | **活体页面进不去时的位图源路线**：代管整页截图 + 位图三件套（调色板/版心/行高当字阶）、门禁先算源自己的基准、四个坑 |
| `references/screenshot-localization.md` | **备选路径**：把单语 App 截图当场改成别的语种（半天级，默认不走）；素材来源顺位 + 调色令牌映射 + 三个坑 + 实测耗时账 |

## 环境

- 浏览器：本机 ms-playwright 的 `headless_shell`；找不到时 `PH_CHROMIUM=<路径>`。
- Node：`<shared_env>/node-24/bin/node`（系统无 node）。
- 代理：自动读 `HTTPS_PROXY` / `HTTP_PROXY`；需要时 `--proxy http://127.0.0.1:17891`。
- 抓不到页面（登录墙、反爬）：如实说明，改走截图 + 视觉模型读图，并把测不准的字段标 `unverified`。
