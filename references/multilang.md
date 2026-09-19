# 多语言并行排版（文案不失真）

目标：**同一套版式里并排多种语言，原文一个字都不变，且各语言看起来同等重量。**

## 一、不失真的定义（硬约束）

| 允许 | 禁止 |
| --- | --- |
| 原文一字不改地进入排版 | 缩写、省略、"精简一下" |
| 翻译另存为平行层 | 把译文覆盖到 `source_text` |
| 标点**本地化并留痕**（中文全角 ↔ 英文半角） | 悄悄改标点/大小写 |
| 数字、单位、专有名词保留原文 | 把品牌名/人名"意译" |
| 换行、连字、断字（纯排版层） | 为了塞进版式而删字、缩小到看不清 |

数据形态：

```json
{
  "block_id": "hero-title",
  "source_text": "信用即流量，资产跟着人走。",
  "source_lang": "zh-Hans",
  "layout": "parallel-cols",
  "translations": [
    { "lang": "en", "text": "Credit is traffic; assets follow the person.", "status": "mt", "reviewed": false },
    { "lang": "ja", "text": "信用は流動、資産は人に従う。", "status": "mt", "reviewed": false }
  ],
  "punct_localized": false,
  "source_hash": "<原文的哈希，改了原文就对不上>"
}
```

- `status: "mt"` 的译文**必须标未复核**，不得对外宣称已校对。
- 交付时原文与译文成对出现，方便逐句核对。

## 二、并行版式三选一（按信息主次，不按语言贵贱）

| 版式 | 结构 | 适用 |
| --- | --- | --- |
| `stacked` 上下双语 | 主语言在上，副语言紧跟其下 | 标题、标语、CTA |
| `parallel-cols` 等宽多列 | 每语言一列，同字号、同基线 | 说明书、菜单、价目、条款 |
| `main-sub` 主从 | 主语言按版式精致排，副语言换弱化色但不缩小 | 长文、画册 |

**各语言字号一致**是默认；靠**颜色弱化**（`--fg-muted`）区分主次，不靠缩小。只有 `main-sub` 允许副语言降一级，且不得低于 `--step-5`。

## 三、换语言只换三样：字族、行高、字距

```css
/* 字号一律不动，动的是呼吸 */
:lang(zh-Hans), :lang(zh-Hant), :lang(ja), :lang(ko) {
  line-height: var(--lh-cjk);        /* 拉丁行高 + 0.15 ~ 0.2 */
  letter-spacing: 0;                 /* CJK 禁止负字距 */
  word-break: normal;
  line-break: strict;                /* 禁则处理，标点不出现在行首 */
}
:lang(ar), :lang(he), :lang(fa) {
  line-height: var(--lh-arabic);     /* 拉丁行高 + 0.25 */
  letter-spacing: 0;
}
:lang(de), :lang(ru), :lang(fr), :lang(es) {
  hyphens: auto;                     /* 需要 lang 属性才生效 */
  overflow-wrap: anywhere;
}
```

- **必须写 `lang` 属性**：没有 `lang`，`:lang()` 不生效，断字与朗读都会错。
- RTL：容器加 `dir="rtl"`，不要靠 `text-align` 硬凑；混排段落用 `unicode-bidi: plaintext`。
- `text-wrap: balance` 用于标题、`pretty` 用于正文，避免单字尾行。

## 四、容器按"最长语言"预留

经验膨胀系数（相对英文，**行业经验值，非本机实测**）：`de/ru 1.25–1.35` · `fr/es 1.10–1.20` · `en 1.00` · `ar 0.80–0.90` · `ja/ko 0.65–0.80` · `zh-Hans 0.55–0.65`。

- 版式宽度按**最宽语言**算，别按主语言算；否则一换德语就挤爆。
- **禁止自动缩放（fit-text / 动态字号）**：那会让各语言字号不一致，一眼假。要塞不下就改版式（换列数、换断点），不是改字号。
- 数字并排时给 `font-variant-numeric: tabular-nums`，多列数字才能对齐。

## 五、排版层允许做的"调整"（不算改文案）

1. 换行位置、断字、连字。
2. 标点本地化（并留痕 `punct_localized: true`）。
3. 数字分组符（1,000 ↔ 1 000）**仅在译文层**，原文层不动。
4. CJK 与拉丁数字混排时给拉丁段 `letter-spacing: .02em` 的视觉补偿。

## 六、自检（交付前逐条过）

1. **溢出**：每个语言块量 `scrollHeight > clientHeight` 或 `scrollWidth > clientWidth`，有溢出就改版式。
2. **一致性**：同框内各语言 `font-size` 与基线位置是否一致（`main-sub` 除外）。
3. **原文完整**：把 `source_text` 与渲染出的主语言文本逐字对比，长度与哈希对得上。
4. **RTL**：把 `dir="rtl"` 打开截图，确认没有镜像错位的图标/数字/括号。
5. **断字**：德语长词、CJK 禁则各截一张，看有没有线首标点或超宽。

浏览器里量溢出的最小片段（复制到控制台或浏览器工具执行）：

```js
[...document.querySelectorAll('[lang]')]
  .filter(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
  .map(el => ({ lang: el.lang, dir: el.dir, overflowY: el.scrollHeight - el.clientHeight, overflowX: el.scrollWidth - el.clientWidth, text: el.innerText.slice(0, 24) }))
```

返回空数组才算通过。
