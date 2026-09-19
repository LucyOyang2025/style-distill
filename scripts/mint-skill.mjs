#!/usr/bin/env node
/**
 * mint-skill —— 把一份风格 DNA 铸造成一个可复用的「设计技能」
 *
 *   node mint-skill.mjs --dna dna.json --name dark-editorial --title "暗色编辑风" \
 *        --out <agent_state>/skills/design-暗色编辑风
 *
 * 产出（一个完整的、可被平台加载的 skill 包）：
 *   SKILL.md                     带 frontmatter，可被 _route.py 索引
 *   references/style-dna.json    指纹原件（可复现、可再比对）
 *   references/style-rules.md    逐项可执行数值规则
 *   assets/tokens.css            可直接引用的设计令牌
 *   assets/twin-scaffold.html    双胞胎骨架（含多语言并行排版层）
 *
 * 只蒸馏「风格」，不搬运源内容；产物一律用新文案、新图形。
 */
import fs from 'node:fs';
import path from 'node:path';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
}
const need = (k) => { if (!args[k]) { console.error('缺 --' + k); process.exit(2); } return args[k]; };

const dnaPath = need('dna');
const name = need('name');
const title = args.title || name;
const dna = JSON.parse(fs.readFileSync(dnaPath, 'utf8'));
const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
const skillDir = path.resolve(args.out || `./${slug}`);

// ---------- 小工具 ----------
const hex2rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const luma = (h) => { const [r, g, b] = hex2rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const sat = (h) => { const [r, g, b] = hex2rgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const pct = (n) => Math.round(n * 100);

// ---------- 从指纹里读出「调性」 ----------
function deriveTone(d) {
  const bg = d.palette?.background?.[0]?.hex || d.palette?.clusters?.[0]?.hex || '#ffffff';
  const clusters = d.palette?.clusters || [];
  const bgPalette = (d.palette?.background || []).slice(0, 8);
  // 综合彩度：按面积占比加权的平均饱和度。一枚小红点不该把一个纸白站判成「活力消费向」。
  const shareList = (clusters.length ? clusters : bgPalette).slice(0, 8);
  const shareTotal = shareList.reduce((s, x) => s + (x.share ?? x.weight ?? 0), 0) || 1;
  const colorfulness = shareList.reduce((s, x) => s + ((x.share ?? x.weight ?? 0) / shareTotal) * sat(x.hex), 0);
  const pool = [
    ...(d.palette?.accent_weighted || []).map(x => x.hex),
    ...(d.palette?.text || []).slice(0, 6).map(x => x.hex),
    ...clusters.slice(0, 6).map(c => c.hex),
    ...bgPalette.slice(0, 6).map(x => x.hex),
    ...(d.palette?.css_literals || []).slice(0, 12).map(x => x.hex),
  ];
  const dark = (d.mode === 'image' ? (d.stats?.mean_luma ?? 1) : luma(bg)) < 0.42;
  const satMax = Math.max(0, ...pool.map(sat));                 // 源内出现过的最高饱和度（不代表面积）
  const ladder = d.type?.size_ladder?.map(x => x.size) || [];
  const radii = (d.rhythm?.radii || []).map(r => parseInt(r.value, 10) || 0);
  const radiusMax = Math.max(0, ...radii.filter(r => r < 100));
  const serif = /serif|Georgia|Times|Song|Songti|Ming/i.test(d.page?.body_font || '') && !/sans-serif/i.test(d.page?.body_font || '');
  const density = d.sections?.length ? Math.round(d.sections.reduce((s, x) => s + (x.text_density || 0), 0) / d.sections.length) : 0;

  const words = [
    dark ? '暗色基调' : '明亮基调',
    colorfulness < 0.03 ? '近乎单色' : colorfulness < 0.12 ? '低饱和' : colorfulness < 0.3 ? '中饱和' : '高饱和',
    ladder.length >= 7 ? '层次丰富' : ladder.length >= 4 ? '层次克制' : '极简层次',
    radiusMax === 0 ? '硬边几何' : radiusMax >= 16 ? '柔和圆角' : '微圆角',
    serif ? '衬线编辑感' : '无衬线理性',
    density > 240 ? '高信息密度' : density > 90 ? '中密度' : '大留白',
  ];
  const family =
    dark && colorfulness < 0.12 ? '静奢 / 暗色高级' :
    dark ? '暗色科技' :
    colorfulness < 0.12 ? '克制的编辑风' : '活力消费向';
  return { words, family, dark, satMax: Math.round(satMax * 100) / 100, colorfulness: Math.round(colorfulness * 1000) / 1000, radiusMax, density, bg, ladder };
}

const tone = deriveTone(dna);
const isImg = dna.mode === 'image';

// ---------- 颜色角色 ----------
const bgList = dna.palette?.background || dna.palette?.clusters?.map(c => ({ hex: c.hex })) || [];
const fgList = dna.palette?.text || [];
const pickFg = () => {
  if (!fgList.length) return tone.dark ? '#f5f5f4' : '#111111';
  const bgLuma = luma(bgList[0]?.hex || '#ffffff');
  return fgList.slice(0, 5).slice().sort((a, b) => Math.abs(luma(b.hex) - bgLuma) - Math.abs(luma(a.hex) - bgLuma))[0].hex;
};
// 面板色：与底色几乎同亮度、但仍是独立一档的浅背景（卡片/引文块的底）
const panelPick = (() => {
  const bgLuma = luma(bgList[0]?.hex || '#ffffff');
  return bgList.filter((x, i) => i > 0 && Math.abs(luma(x.hex) - bgLuma) < 0.16 && luma(x.hex) > 0.6)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0]?.hex || null;
})();
const roles = {
  bg: bgList[0]?.hex || (tone.dark ? '#0b0b0c' : '#ffffff'),
  bg_alt: bgList[1]?.hex || (tone.dark ? '#141416' : '#f5f5f4'),
  fg: pickFg(),
};
roles.fg_muted = (fgList.find(x => x.hex !== roles.fg) || fgList[0] || {}).hex || (tone.dark ? '#a1a1aa' : '#6b7280');
// 点缀色：重字重文字色 → 彩色文字 → 位图色簇 → **小面积底色**（网页上的胶囊/圆点/箭头就是这么出现的）
const bgMax = Math.max(1, ...bgList.map(x => x.weight ?? 1));
const smallBg = bgList.filter((x, i) => i > 0 && (x.weight ?? 0) < bgMax * 0.1).map(x => x.hex);
const accentFrom = (dna.palette?.accent_weighted || []).map(x => x.hex).find(h => sat(h) > 0.2)
  || fgList.find(x => sat(x.hex) > 0.2)?.hex
  || (dna.palette?.clusters || []).slice().sort((a, b) => sat(b.hex) - sat(a.hex)).find(c => sat(c.hex) > 0.2 && c.share > 0.005)?.hex
  || smallBg.slice().sort((a, b) => sat(b) - sat(a)).find(h => sat(h) > 0.2);
const accentFallback = !accentFrom;
roles.accent = accentFrom || roles.fg;   // 单色系就用正文色当点缀，不凭空造一个蓝色
// 分隔线：边框色 → 细长块底色（发丝线）→ 次底色兜底。
// 源的线常有两档：贴近底色的发丝线（分隔用）与高对比的强线（起标题用）。按"离底色多远"分开取。
const ruleList = (dna.palette?.rule || []).filter(x => x.hex !== roles.bg);
const bgL = luma(roles.bg);
const sortedRules = ruleList.slice().sort((a, b) => Math.abs(luma(a.hex) - bgL) - Math.abs(luma(b.hex) - bgL));
const hairline = sortedRules[0]?.hex, strongRule = sortedRules[sortedRules.length - 1]?.hex;
roles.line = (dna.palette?.border || [])[0]?.hex || hairline || '';
const lineFallback = !roles.line;
if (lineFallback) roles.line = roles.bg_alt;   // 兜底取次底色，保持同色调
roles.ruleStrong = strongRule && strongRule !== roles.line ? strongRule : null;
const noType = !(dna.type?.roles || []).length;

// ---------- 字体栈 + 字号阶梯 ----------
const rolesType = dna.type?.roles || [];
const displayRole = [...rolesType].sort((a, b) => b.font_size_px - a.font_size_px)[0] || {};
const bodyRole = [...rolesType].sort((a, b) => b.chars - a.chars)[0] || {};
const stack = (f) => (f || 'system-ui').split(',').map(s => s.trim()).join(', ');
const fontDisplay = stack(displayRole.font_family || dna.page?.body_font);
const fontBody = stack(bodyRole.font_family || dna.page?.body_font);
const ladder = (dna.type?.size_ladder || []).slice(0, 8);
const lh = (role) => role.line_height_ratio || null;
const track = (role) => (role.letter_spacing_em ?? 0);

// ---------- 间距 / 圆角 / 阴影 / 容器 ----------
const spaceUnit = (() => {
  const nums = (dna.rhythm?.spacing_counts || []).map(x => Number(x.value)).filter(n => n > 0);
  if (!nums.length) return 8;
  for (const u of [4, 8, 6, 12, 16, 10]) if (nums.filter(n => n % u === 0).length / nums.length > 0.6) return u;
  return 8;
})();
const spaceScale = [...new Set([1, 2, 3, 4, 6, 8, 12, 16].map(m => m * spaceUnit))];
const radiiRaw = (dna.rhythm?.radii || []).map(r => ({ value: r.value, count: r.count, px: parseInt(r.value, 10) || 0 }));
const shapeRadius = radiiRaw.filter(r => r.px > 0 && r.px < 100).sort((a, b) => b.count - a.count)[0];
const pillRadius = radiiRaw.find(r => r.px >= 100);
const radiusMain = shapeRadius ? shapeRadius.value : '0px';
const shadow = (dna.rhythm?.shadows || [])[0]?.value || 'none';
const gapMain = (dna.rhythm?.gap_counts || [])[0]?.value ? (dna.rhythm.gap_counts[0].value + 'px') : spaceUnit * 3 + 'px';
const container = (() => {
  const widths = (dna.layout?.containers || [])
    .map(c => String(c.value).replace('max-width ', ''))
    .filter(v => /px$/.test(v)).map(parseFloat);
  const plausible = widths.filter(w => w >= 960 && w <= 1800);
  return (plausible.length ? Math.max(...plausible) : (widths.length ? Math.max(...widths) : 1280)) + 'px';
})();
const cols = (() => { const g = dna.layout?.grids?.[0]?.value; if (!g) return 12; return parseInt(g, 10) || 12; })();
const breakpoints = dna.layout?.breakpoints || [];

// ---------- 图案元素处理策略 ----------
const media = dna.media || {};
const fitMain = (media.object_fit || [])[0]?.value || 'cover';
const arMain = (media.aspect_ratios || [])[0]?.value || '16:9';
const blendMain = (media.blend_modes || [])[0]?.value || 'normal';
const filterMain = (media.filters || [])[0]?.value || 'none';
const gradientTop = (media.gradients || [])[0] || 'none';
const grain = (filterMain !== 'none' || /noise|grain/i.test(JSON.stringify(dna.media || {}))) ? '有颗粒/滤镜处理，统一配方里保留' : '无明显颗粒，素材统一以纯净处理为准';

// ---------- 图像策略（图位密度） ----------
// 位图源（dna.mode==='image'）没有 imagery 块：交视觉模型估，但密度与压图照样要写死。
const imagery = dna.imagery || {};
const imgArea = imagery.area_share;
const imgDense = (imgArea ?? 0) >= 0.15;
const hero = imagery.hero || null;
// hero 的尺寸可能是 "1440x807" 字符串，也可能是 {width,height} —— 两种都认
const wh = (v) => {
  if (!v) return null;
  if (typeof v === 'string') { const m = v.match(/^(\d+)\s*x\s*(\d+)$/); return m ? { width: +m[1], height: +m[2] } : null; }
  if (v.width && v.height) return { width: +v.width, height: +v.height };
  return null;
};
const heroRen = wh(hero?.rendered), heroNat = wh(hero?.natural);
const heroAS = heroNat ? Math.round((heroNat.width / heroNat.height) * 100) / 100 : (hero?.aspect ?? null);
const heroDesc = hero
  ? `${heroRen ? `渲染 ${heroRen.width}×${heroRen.height}` : '渲染尺寸待测'}${heroNat ? `、原始 ${heroNat.width}×${heroNat.height}` : ''}${heroAS ? `（画幅比 ${heroAS}，按它裁）` : ''}，object-fit \`${hero.object_fit || fitMain}\`，距页顶 ${hero.top_px ?? '?'}px`
  : '源未测到满幅 hero（位图源请交视觉模型读首屏构图）';
const imageryTable = imgArea === undefined
  ? '| — | 位图源无 DOM 图像尺寸：交视觉模型读「图占多大比例、首屏是不是满幅照片、图片组是几张一行」，全部标 `unverified` |\n'
  : [
      `| 图像数量 | ${imagery.count ?? '?'} 张 | DOM 里可见的 \`<img>\`/\`<picture>\` |`,
      `| 图像面积占比 | ${imgArea} | 图像面积之和 ÷ 视口面积（≥ 0.15 即"图像密集"） |`,
      `| 满幅图 | ${imagery.full_bleed_count ?? 0} 张 | 宽度 ≥ 视口 90% |`,
      `| 大图 | ${imagery.large_count ?? 0} 张 | 宽度 ≥ 视口 40% |`,
      `| 首屏压图 | ${imagery.hero_is_first_screen ? '**是** —— 首屏就是满幅照片，标题直接压在图面上' : '否 —— 首屏无满幅照片'} | hero 的 \`top_px\` 是否落在首屏内 |`,
      `| 主图（hero） | ${heroDesc} | 第一张满幅图 |`,
    ].join('\n');

// ---------- 工艺指纹（笔触/线条/空间/节奏/边界）----------
// 位图模式才量得到；活体页面源没有 craft，这一节就退化成"交视觉模型补测"。
const craft = dna.craft || null;
const hasCraft = !!craft;
const cn = (a, b) => {
  const v = hasCraft && craft[a] ? craft[a][b] : null;
  return v === undefined || v === null ? '待测（交视觉模型）' : v;
};

// ---------- 留白 / 阴影 / 动效 / 排版方向 ----------
const white = (craft && craft['留白']) || null;      // 位图源（含截图）才有
// 页边距：视口宽 − 容器宽，两侧各一半（源没给视口时留空，别瞎猜）
const containerPx = parseFloat(String(container).replace('px', '')) || 1280;
const vpW = dna.viewport ? parseFloat(String(dna.viewport)) : null;
const pageMargin = vpW && containerPx < vpW ? Math.round((vpW - containerPx) / 2) + 'px' : null;
const shadowStats = dna.rhythm?.shadow_stats || [];
const shadowLine = shadowStats.length
  ? shadowStats.slice(0, 3).map(s => `\`${s.raw}\``).join(' · ') + `（偏移 ${shadowStats[0].dx}/${shadowStats[0].dy} · 模糊 ${shadowStats[0].blur}${shadowStats[0].blur > 24 ? ' → **弥散投影**' : ' → 紧贴的硬投影'}）`
  : '源未使用阴影 —— 产出也别加，加一层阴影整套气质就变了';
const motion = dna.motion || null;
const typeSizes = (dna.type?.size_ladder || []).map(l => Number(l.size)).filter(Boolean);
const typeMax = typeSizes.length ? Math.max(...typeSizes) : null;
const typeMin = typeSizes.length ? Math.min(...typeSizes) : null;
const writingMode = dna.layout?.writing_mode || null;

// ---------- 骨架 ----------
const sections = dna.sections || [];

// ---------- tokens.css ----------
const tokensCss = `/* ${title} · 设计令牌（由 dna-probe + mint-skill 从源指纹生成）
   源：${dna.source || 'unknown'}
   抓取：${dna.captured_at || ''} · 视口 ${dna.viewport || 'image'}
   只蒸馏风格，不搬运源内容。数值改动即离开双胞胎。 */
:root {
  /* 颜色 */
  --bg: ${roles.bg};
  --bg-alt: ${roles.bg_alt};
${panelPick ? `  --panel: ${panelPick}; /* 卡片/引文块底，与底色同亮度的一档 */\n` : ''}  --fg: ${roles.fg};
  --fg-muted: ${roles.fg_muted};
  --accent: ${roles.accent};
  --line: ${roles.line};
${roles.ruleStrong ? `  --rule-strong: ${roles.ruleStrong}; /* 起标题用的强线 */\n` : ''}
  /* 字体 */
  --font-display: ${noType ? '/* 待补：源为位图，字族未测到 */ system-ui' : fontDisplay};
  --font-body: ${noType ? '/* 待补：同上 */ system-ui' : fontBody};
${ladder.map((l, i) => `  --step-${i + 1}: ${l.size}px;`).join('\n')}
  --lh-display: ${lh(displayRole) || 1.1};
  --lh-body: ${lh(bodyRole) || 1.6};
  --track-display: ${track(displayRole)}em;
  --track-body: ${track(bodyRole)}em;

  /* 间距 */
  --space-unit: ${spaceUnit}px;
${spaceScale.map(s => `  --space-${s}: ${s}px;`).join('\n')}
  --gap: ${gapMain};

  /* 形状 */
  --radius: ${radiusMain};
${pillRadius ? `  --radius-pill: ${pillRadius.value}; /* 按钮/头像胶囊，别用在整张图上 */\n` : ''}  --shadow: ${shadow};
  --border: 1px solid var(--line);

  /* 布局 */
  --container: ${container};
  --grid-cols: ${cols};

  /* 多语言并行排版：不改字号，只改字族/行高/字距 */
  --lh-cjk: ${((lh(bodyRole) || 1.6) + 0.15).toFixed(2)};
  --lh-arabic: ${((lh(bodyRole) || 1.6) + 0.25).toFixed(2)};
  --track-cjk: 0em;
  --track-arabic: 0em;
}
`;

// ---------- 双胞胎骨架 ----------
const skeletonRows = sections.length
  ? sections.map((s, i) => `      <!-- ${i + 1}. ${s.heading || s.tag} · 高 ${s.height}px · 背景 ${s.background || '—'} · ${s.text_align} · 图 ${s.items?.images ?? 0} 文 ${s.items?.paragraphs ?? 0} 钮 ${s.items?.actions ?? 0} -->`).join('\n')
  : '      <!-- 源为位图：按上面「版式结构」手写段落，块高与留白比例照数字抄 -->';

const scaffold = `<!doctype html>
<html lang="zh-Hans" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · 双胞胎骨架</title>
<link rel="stylesheet" href="./tokens.css">
<style>
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-body);
       font-size:16px;line-height:var(--lh-body);letter-spacing:var(--track-body)}
  .wrap{width:min(100% - var(--space-${spaceScale[4] || 48}px), var(--container));margin-inline:auto}
  h1,h2,h3{font-family:var(--font-display);line-height:var(--lh-display);letter-spacing:var(--track-display);margin:0}
  h1{font-size:var(--step-1)} h2{font-size:var(--step-2)} h3{font-size:var(--step-4)}
  p{margin:var(--space-${spaceUnit * 3}px) 0;color:var(--fg-muted)}
  section{padding-block:calc(var(--space-${spaceUnit * 8}px))}
  .actions a{display:inline-block;padding:var(--space-${spaceUnit * 3}px) var(--space-${spaceUnit * 5}px);
       border-radius:var(--radius);background:var(--accent);color:var(--bg);text-decoration:none}
  img{width:100%;aspect-ratio:${String(arMain).split(' ')[0].replace(':', '/')};object-fit:${fitMain};border-radius:var(--radius)}
  /* 多语言并行排版：同一视觉框，换语言不换字号 */
  :lang(zh-Hans),:lang(zh-Hant),:lang(ja),:lang(ko){font-family:var(--font-body);line-height:var(--lh-cjk);letter-spacing:var(--track-cjk)}
  :lang(ar),:lang(he),:lang(fa){line-height:var(--lh-arabic);letter-spacing:var(--track-arabic)}
  [dir="rtl"]{direction:rtl;text-align:right}
  .lang-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--gap)}
  .lang-main{font-size:var(--step-4)} .lang-sub{font-size:var(--step-5);color:var(--fg-muted)}
</style>
</head>
<body>
  <main class="wrap">
${skeletonRows}
  </main>
</body>
</html>
`;

// ---------- style-rules.md ----------
const rulesMd = `# ${title} · 硬规则（照抄，不许自创）

源：${dna.source || 'unknown'} · 抓取 ${dna.captured_at || ''} · 模式 ${dna.mode || 'page'}
调性：**${tone.family}** —— ${tone.words.join(' · ')}

> 这张表里的每个数字都来自源的真实计算样式。任何一项改动都要跑 \`dna-probe.mjs --compare\` 复核，过不了门禁不算双胞胎。
>
> **两条主梁，顺序不能颠倒**：**§1 构图构成**（东西放哪、多大、留多少白）→ **§2 色彩构成**（什么颜色、占多大面积）。这两条先落地，再谈排印（§3）、图案（§4）、工艺与气质（§5）、层次（§6）。

## 0. 维度总表（每个维度只有一个归属，别重复描述）

风格能拆出这么多可辨认的维度，**每一项在本表里只落一节**：改哪一项就回哪一节，别在别处再写一遍。

| # | 维度 | 落在哪 | 怎么量 |
| --- | --- | --- | --- |
| 1 | 构图构成（块序 · 容器 · 栏数 · 间距档 · 节奏 · 页边距 · 比例系统） | **§1.1** | 脚本（\`layout\` / \`sections\` / \`rhythm\`） |
| 2 | 图位密度 · 首屏压图 · **图像处理方式**（彩色/黑白 · 裁切 · 图文关系 · 滤镜） | **§1.2** | 脚本（\`imagery\` / \`media\`）+ 读图 |
| 3 | 留白与密度 | **§1.3** | 位图（\`craft.留白\`） |
| 4 | 色彩构成（色值 + 面积比 + 饱和度倾向 + 渐变 + 背景） | **§2** | 脚本（\`palette\` / \`tone\`） |
| 5 | 字体与排版语言（字族 · 阶梯 · 字距 · 行距 · 方向 · 对齐 · **图文位置关系**） | **§3** | 脚本（\`type\` / \`layout.writing_mode\`）+ 读图 |
| 6 | 图形语言与造型（几何还是有机 · 形状库 · 圆角 · 描边还是扁平 · **描边粗细**） | **§4** | 脚本（半径 / 描边）+ 读图 |
| 7 | 装饰语法（边框 · 分割线 · 投影 · 纹理 · 圆角弧度） | **§4** | 脚本（\`palette.rule\` / \`rhythm.shadow_stats\`） |
| 8 | 动效与交互语言（时长 · 缓动 · 关键帧） | **§4** | 脚本（\`motion\`；数字设计才有） |
| 9 | 笔触与肌理 | **§5** | 位图代理量（\`craft.肌理\`） |
| 10 | 线条语言 | **§5** | 位图代理量（\`craft.线条\`） |
| 11 | 空间处理 | **§5** | 位图代理量（\`craft.空间\`）+ 读图判纵深 |
| 12 | 节奏与重复 · **视觉锚点位置** | **§5** | 位图代理量（\`craft.节奏\` / \`craft.锚点\`） |
| 13 | 边界处理 | **§5** | 位图代理量（\`craft.边界\`） |
| 14 | 符号与图式系统 · 情绪与精神气质 | **§5** | 视觉模型（\`craft.needs_vision\`） |
| 15 | 材质与纹理（噪点 / 纸张 / 金属 / 渐变） | **§4 + §5** | 脚本（filter / 渐变）+ 读图 |
| 16 | 信息层级的处理方式 | **§6** | 脚本（阶梯比 / 弱化色差）+ 读图 |

**去重口径（最容易重复的四处）**：① 「扁平 vs 质感」在 §4 判一次（图形语言），§5 只在有图时用肌理数字旁证；② 「留白」在 §1.3 定**比例**、在 §6 谈**密度**，两处数字必须自洽；③ 「圆角 / 投影 / 边框 / 分割线」只在 §4 写一次，§1 不再复述；④ 「渐变」只在 §2 判（属色彩构成），§4 不再写第二遍。

## 1. 构图构成（第一优先）

**这条是本风格的主梁：先说清「东西放在哪、多大、留多少白」，再谈别的。** 构图不对，颜色和字体再准也不像。

### 1.1 版式骨架与间距

- 容器：内容最大宽 \`${container}\`；源内出现最多的内容网格 ${cols} 栏，主间隙 \`${gapMain}\`（按此分栏，别自创栅格）。
- 间距单位：**${spaceUnit}px**，档位 ${spaceScale.join(' / ')}；除该倍数外不许出现别的间距值。
- 断点：${breakpoints.length ? breakpoints.join(' · ') : '源未暴露媒体查询（位图源请自行按 640 / 1024 / 1440 分档）'}。
- 段落骨架（源的实际块序，按此排 —— **块序本身就是构图**，不许重排、不许漏块、不许加块）：
${sections.length ? sections.map((s, i) => `  ${i + 1}. \`${s.tag}\` 高 ${s.height}px · 背景 ${s.background || '—'} · padding-y ${s.padding_y} · ${s.text_align} · 图 ${s.items?.images ?? 0} / 文 ${s.items?.paragraphs ?? 0} / 钮 ${s.items?.actions ?? 0}${s.heading ? ' · 「' + s.heading + '」' : ''}`).join('\n') : '  （位图源：按视觉测出的块序手写）'}
- 留白节奏：块间用上面的间距档位，别拉平也别挤；源里块高与留白的比例照抄（位图源按"块高 ÷ 画幅高"换算）。
- 页边距：${pageMargin === null ? '源未暴露视口/容器关系 —— 位图源按"内容宽 ÷ 画面宽"量' : `视口 ${dna.viewport || '—'} 里容器 ${container} ⇒ 两侧各约 **${pageMargin}**（内容宽 ÷ 画面宽 = ${Math.round(((containerPx / (dna.viewport ? parseFloat(dna.viewport) : 1440)) || 0) * 100) / 100}）`}；产出照这个比例留边，**别用默认的 16px**。
- 比例系统（元素之间有没有固定倍数关系）：容器 ÷ 主间隙 = ${Math.round((containerPx / Math.max(spaceUnit * 3, 1)) * 100) / 100}；间距单位 ${spaceUnit}px 的整数倍已覆盖所有间距；主图比例 ${arMain}、内容网格 ${cols} 栏 —— 这就是源的比例语言，**别引入黄金比之类源里没有的第二套**。
- 留白是均匀还是刻意不平衡：脚本量不出，交视觉模型读图（四周均等的白 / 压在一侧的白），标 \`source: "vision"\`。

### 1.2 图位密度与首屏压图

源**不是纯排版页面**，图像是它一等公民级的构图元素。产出的图像密度必须与源**同量级** —— **源有照片，产出就必须有照片位；只画线稿不算双胞胎。**

| 项 | 源的值 | 口径 |
| --- | --- | --- |
${imageryTable}

- 密度：${imgArea === undefined ? '待测（见上表口径）' : imgDense
  ? `图像面积占比 **${imgArea}** —— 约每 ${Math.max(1, Math.round(1 / imgArea))} 屏里有 1 屏是图。产出必须有满幅图与成组大图，别把图缩成配图。`
  : `图像面积占比 ${imgArea} —— 图像是点缀不是主体，别自作主张铺满幅大图。`}
- 开局：${imagery.hero_is_first_screen
  ? '首屏就是**满幅照片 + 标题压图**（标题白色直接压在照片上，不另加蒙版底块）——这是本风格签名性的开局，缺了它一眼就看出不对。'
  : '首屏不是满幅压图开局，按 §1.1 的段落骨架第一条排。'}
- 图组：成组出现时按主比例 ${arMain} 与主间隙 \`${gapMain}\` 排，组内比例必须统一（一半方一半横就散了）。
- 图从哪来：走 §7.1 的占位顺序；**用户没投喂时，能拿到合规免费素材就优先用它，源模版自己的图只许当「临时占位」并显著标注待替换**。
- 复核：\`dna-probe.mjs <产出> --out twin.json\` 后 \`--compare\` 比「图像策略（照片感）」这道门禁 —— 判据是**中间调占比**（实拍照片 ≥ 0.4，纯线稿 < 0.05），拿线稿顶照片位必挂。

**图像处理方式**（照片是彩色还是黑白、怎么裁、跟文字什么关系）：

- 彩色还是黑白：${craft ? `源截图整体饱和度 ${dna.stats?.mean_saturation ?? '—'}、彩度 ${tone.colorfulness} —— ${(dna.stats?.mean_saturation ?? 1) < 0.08 ? '**近乎黑白**：产出把照片压到低饱和（≤ 0.2），别放彩色原图' : (dna.stats?.mean_saturation ?? 1) < 0.25 ? '**低饱和**：产出用 saturate(0.8)×上下，别提饱和' : '**彩色**：产出保留原色，别自作主张去色'}` : '待测（位图源才有饱和度数字）'}。
- 裁切方式：满幅图用 \`object-fit: cover\` 满版裁（源 \`${fitMain}\`）；成组图按主比例 ${arMain} 统一裁；**不用圆形裁切**除非源里出现过圆形图位（源里 ${pillRadius ? '胶囊圆角只给按钮，不算图位' : '无胶囊'}）。
- 图片与文字的关系：${imagery.hero_is_first_screen ? '**文字压图**（叠印）——首屏就是"照片铺满 + 标题压上去"，产出照这样开篇' : '图文并排（图与文字各占其位），不叠印'}；其余图位一律独立成块，不半透明叠在文字后面。
- 滤镜：\`${filterMain}\`，blend-mode \`${blendMain}\`；${gradientTop === 'none' ? '不加渐变' : '渐变见 §2'}。**不许加源里没有的模糊或噪点**（那会立刻变成另一种风格）。

### 1.3 留白与密度（"少"不是极简，留白的**比例**才是）

${white ? `- 留白率 **${white['空白占比']}**（落在主底色档 ±1 的像素占比）· 墨量 ${white['墨量']} · 主色占比 ${white['主色占比']} · 底色档 ${white['底色档']}/16。
- 判读：留白率 ≥ 0.70 = 疏；0.45–0.70 = 中；< 0.45 = 满。**源的留白在什么位置和源的留白有多少一样重要** —— 是四周均等的白，还是压在一侧的白，交视觉模型读图定性。` : '- 留白率要位图才算得出：把源（或源的截图）另跑一次位图模式，取 \\`craft.留白\\` 的**空白占比**填进来。'}
- 纪律：留白率变了，气质就变了。产出量一遍，与源同档（疏 / 中 / 满）才算通过；**别为了"好看"加白或缩白**。
- 密度只由这一处定：段内文字密度见 §6，元素间距见 §1.1，**不要在这里再描述一遍**。

## 2. 色彩构成（第二优先）

**主梁之二：什么颜色、占多大面积。** 面积比与色值是同一件事的两面 —— 色对不对看表，像不像看面积。

| 角色 | 值 | 依据 |
| --- | --- | --- |
| 背景 | ${roles.bg} | 面积最大的 ${isImg ? 'k-means 色簇' : 'background-color'} |
| 次级背景 | ${roles.bg_alt} | 第二大面积底色 |
${panelPick ? `| 面板色 | ${panelPick} | 与底色同亮度区间的独立一档，用作卡片/引文块底 |` : ''}
| 正文 | ${roles.fg} | 文字面积加权最多${tone.dark ? '' : '／色簇中最深'} |
| 弱化文字 | ${roles.fg_muted} | 次级文字色 |
| 点缀 | ${roles.accent} | ${accentFallback ? '**源未测到有饱和度的点缀色 → 取正文色，本风格按单色处理，别自己加彩色**' : '唯一有饱和度且权重高的色'} |
| 描边 | ${roles.line} | ${lineFallback ? '**源未测到边框 → 兜底取次底色，需按视觉核对后修正**' : '发丝线：细长块的底色，取离底色最近的一档' }|
${roles.ruleStrong ? `| 强分隔线 | ${roles.ruleStrong} | 细长块底色里对比最强的一档（起标题/切段用，别拿它画表格线） |\n` : ''}

- **面积比（与色值同等重要）**：背景≈60–70%，正文与留白≈25–30%，点缀≤10%。
- 综合彩度 ${tone.colorfulness}（面积加权的平均饱和度，< 0.03 即"近乎单色"）；源内出现过的最高饱和度 ${pct(tone.satMax)}%，但只占极小面积 —— **强调色是"一枚"的量级，不是色块**。
- 饱和度倾向：${tone.colorfulness < 0.03 ? '**黑白灰 + 一枚强调色**（莫兰迪式低饱和）' : tone.colorfulness < 0.12 ? '**低饱和**（莫兰迪 / 雾面）' : tone.colorfulness < 0.3 ? '**中等饱和**' : '**高饱和纯色**'} —— 产出照这个倾向取图与配色，别越档。
- 源样式表里还出现过的色（含伪元素与悬停态，量不到面积，仅供核对）：${(dna.palette?.css_literals || []).slice(0, 10).map(x => x.hex).join(' ') || '—'}
- 禁止：表外的颜色。需要新色时只能从 accent 调明度，不引入新色相。
- 图文关系：图面上的文字色按表取（源常把正文色/背景色当"反白字"，照抄那一对，别自创）。

## 3. 字体与排印

- 标题字族：\`${noType ? '待补 —— 位图源测不到字族，交视觉模型读出"衬线 / 无衬线 + 几何 / 人文"方向' : fontDisplay}\`
- 正文字族：\`${noType ? '待补（同上）' : fontBody}\`
- 注意：字族栈按原样抄，**不要替换成通用字体**；源字体不可得时，用手感最近的替代并在交付说明里写清。${noType ? '本条为 `unverified`：必须补测后再交付。' : ''}

| 级 | 字号 | 行高 | 字距 | 用途 |
| --- | --- | --- | --- | --- |
${(dna.type?.size_ladder || []).length ? (dna.type.size_ladder || []).slice(0, 8).map((l, i) => {
  const r = rolesType.find(x => x.font_size_px === l.size) || {};
  return `| ${i + 1} | ${l.size}px | ${r.line_height_ratio || (i === 0 ? 1.1 : 1.6)} | ${r.letter_spacing_em ?? 0}em | ${r.sample ? (r.sample.slice(0, 16) + '…') : (i === 0 ? '主标题' : '辅助')} |`;
}).join('\n') : '| — | 待补 | — | — | 位图源无字号数据：按下面「等效口径」由视觉模型估出，全部标 `unverified` |'}

${noType ? `**等效口径（位图源专用）**：把画幅当版式量比例 —— 标题区高度 ÷ 画幅高、正文行高 ÷ 字高、边距 ÷ 画幅宽；产出的字号阶梯按这些比例 × 目标画布尺寸反推，并在交付时写清是估的。\n` : ''}
- 字重：标题 ${displayRole.font_weight || 700}，正文 ${bodyRole.font_weight || 400}。层级别靠加粗堆叠，靠字号级差 + 颜色弱化。
- 字距：${Math.abs(track(displayRole)) > 0.001 ? `标题 ${track(displayRole)}em（大字号可负），` : '标题 0em，'}正文与 CJK **禁止负字距**（源正文 ${track(bodyRole)}em，只对拉丁有效）。
- 标点/大小写：${(dna.type?.roles || [])[0]?.text_transform && dna.type.roles[0].text_transform !== 'none' ? '源有 text-transform: ' + dna.type.roles[0].text_transform + '，照抄' : '无特殊变换，原样'}。
- **排版语言**（字体之外，决定气质的那几项）：
  - 字号对比尺度：最大 ${typeMax ?? '—'}px ÷ 最小 ${typeMin ?? '—'}px = **${typeMax && typeMin ? Math.round((typeMax / typeMin) * 100) / 100 : '—'}×** —— 大就是"戏剧性"，小就是"克制"。
  - 行距松紧：正文行高比 ${bodyRole.line_height_ratio || 1.6} —— > 1.75 是松（呼吸感），< 1.4 是紧（密排）。
  - 排布方向：\`${writingMode || 'horizontal-tb'}\`${/vertical/.test(writingMode || '') ? '（**竖排**：产出照抄，行高与字距按竖排重算）' : '（横排）。源没有竖排/倾斜/环绕 —— 产出也别自创'}。
  - 对齐与断行：源用 \`${(sections[0] && sections[0].text_align) || 'start'}\` 对齐，照抄；中文断行 \`line-break: strict\`，拉丁 \`hyphens: auto\`（见 §8）。
  - 图文位置关系：${imagery.hero_is_first_screen ? '文字**嵌入 / 压在图上**（首屏即压图）' : '文字独立成块，不嵌入图形'}；其余场合文字一律独立成块、左对齐起排，**贴边或环绕源里没出现就别自创**。

## 4. 图形 · 装饰 · 动效语言（图形语言 · 装饰语法 · 交互语言）

- 图片：出现最多的比例 ${arMain}，object-fit \`${fitMain}\`，图片圆角 \`${radiusMain}\`${pillRadius ? `（源里胶囊圆角 ${pillRadius.value} 只用于按钮/头像）` : ''}。
- 叠加与滤镜：blend-mode \`${blendMain}\`，filter \`${filterMain}\`；${grain}。
- 渐变：${gradientTop === 'none' ? '源未使用渐变，产出也别用' : '\`' + gradientTop.slice(0, 120) + '\` —— 照抄角度与色标'}。
- 图标：线宽与圆角端点跟描边色 \`${roles.line}\` 统一；禁止 emoji 当图标，禁止混入第三方图标库的默认圆角。

**图形语言与造型**（几何还是有机、圆角还是直角、描边还是扁平）：

- 半径档：图片 \`${radiusMain}\`${pillRadius ? `、胶囊 \`${pillRadius.value}\`（只给按钮/头像）` : '、无胶囊'}；**档位之外不出现别的弧度**。
- 扁平还是质感：${filterMain === 'none' && gradientTop === 'none' ? '**纯平涂** —— 无渐变、无滤镜、无噪点；产出加任何纹理都算出格' : `源带处理（filter \`${filterMain}\`、渐变${gradientTop === 'none' ? '无' : '有'}）—— 产出照抄同一套，别改配方`}。
- 几何还是有机 / 形状库 / 描边 / 组合逻辑：脚本量不出，**一次读图问全五项** —— ① 几何还是有机；② 反复出现的形状（圆 / 方 / 三角 / 有机曲线）；③ 描边还是填充、描边多粗、端点样式（源里的线只有 \`${roles.line}\` 发丝线与 \`${roles.ruleStrong || '—'}\` 强线两档，别自创第三档）；④ 图形之间的组合（叠加 / 穿插 / 并列 / 嵌套）；⑤ 有没有源里没有的比例关系。判完写在这行下面，标 \`source: "vision"\`。

**装饰语法**（细节积累起来就是风格）：

- 分割线：${roles.ruleStrong ? `起标题/切段用 \`${roles.ruleStrong}\` 强线，其余用发丝线 \`${roles.line}\`；` : ''}不用装饰性花线，线只有"分隔"这一个用途。
- 阴影：${shadowLine}。
- 边框：1px \`${roles.line}\`，圆角 \`${radiusMain}\`；**不加描边到图上**（图的边界由裁切决定，不由描边决定）。
- 禁止：新拟态 / 玻璃拟态的模糊底、霓虹发光、多重阴影叠层 —— 表里没有的一律不做。

**动效与交互语言**（数字设计才用；印刷品这一段留空）：

${motion && (motion['过渡时长'].length || motion['关键帧动画'].length)
  ? `- 过渡时长（源里出现频次最高的）：${motion['过渡时长'].map(x => `\`${x.value}\`×${x.count}`).join(' · ') || '—'}；带过渡的元素 ${motion['有过渡的元素数']} 个。
- 缓动曲线：${motion['缓动曲线'].map(x => `\`${x.value}\`×${x.count}`).join(' · ') || '源全部用默认 ease/linear —— 产出也别自创曲线'}。
- 关键帧动画：${motion['关键帧动画'].map(x => `\`${x.value}\`×${x.count}`).join(' · ') || '源没有自定义动画'}。
- 纪律：时长与曲线照抄，**同一交互只用一种曲线**；动效只做"状态可见"（进入 / 悬停 / 反馈），不做炫技。`
  : '- 源未暴露过渡 / 动画（或本就是印刷品）：产出**不做动效**，或只保留 ≥ 150ms 的透明度过渡，不加位移与弹跳。'}

## 5. 笔触 · 线条 · 空间 · 节奏 · 边界 · 图式 · 气质（工艺与气质）

**这一节管"手"和"气"** —— 构图与色彩再像，笔触和气质不同，就是两个画家。左边是像素代理量（可复现），右边是读法；**第 6、7 两条量不出来，必须交视觉模型读图**，读出来的每条标 \`source: "vision"\` + \`unverified: true\`。

${hasCraft ? `| 维度 | 源的值 | 怎么读 |
| --- | --- | --- |
| 1 笔触与肌理 | 画笔能量 \`${cn('肌理', '画笔能量')}\` · 颗粒增益 \`${cn('肌理', '颗粒增益')}\` · 粗面占比 \`${cn('肌理', '粗面占比')}\` | 颗粒增益高 = 沙粒 / 短笔触 / 厚堆；低 = 平涂晕染。语言取一种并贯穿全篇：刮刀厚堆 · 干笔 · 湿画晕染 · 泼洒 · 海绵 · 拼贴 |
| 2 线条语言 | 强线占比 \`${cn('线条', '强线占比')}\` · 线条连续性 \`${cn('线条', '线条连续性')}\` · 笔道宽度 \`${cn('线条', '笔道宽度')}\`px | 强线占比高 + 连续性高 = 有书写性主线。线是**颤抖还是果断、连续还是断裂、粗细怎么变**，把这三点定死再落笔 |
| 3 空间处理 | 值域档数 \`${cn('空间', '值域档数')}\` · 暗部 \`${cn('空间', '暗部占比')}\` · 亮部 \`${cn('空间', '亮部占比')}\` | 值域档数 1–2 = 平涂；4 档以上 = 多层次。**扁平还是纵深、往里退还是往外冲，交视觉模型判** |
| 4 节奏与重复 | 疏密离散 \`${cn('节奏', '疏密离散')}\` · 重复强度 \`${cn('节奏', '重复强度')}\` · 重复周期 \`${cn('节奏', '重复周期')}\` · 纵深趋势 \`${cn('节奏', '纵深趋势')}\` | 疏密离散高 = 疏密对比大；重复强度高 = 有稳定重复单元 / 网格。即兴爵士还是节拍器，照这个定 |
| 5 视觉锚点 | 位置 \`${cn('锚点', '位置')}\` · 相对强度 \`${cn('锚点', '相对强度')}\` | 最密的那一块在哪、比平均密多少 —— **产出的重心要落同一处**（相对强度高就做单点聚焦，低就做均匀铺陈） |
| 6 边界处理 | 硬边占比 \`${cn('边界', '硬边占比')}\` · 软边占比 \`${cn('边界', '软边占比')}\` · 边硬度 \`${cn('边界', '边硬度')}\` | 边硬度高 = 硬边（分界利落）；低 = 渗透晕染（边缘化开）。**形状边缘怎么收口，直接定义流派** |` : '本次源是**活体页面**，量不到工艺指纹 —— 要这一节就把源截图另跑一次位图模式（\`dna-probe.mjs 源截图.png --out dna-craft.json\`），把 \`craft\` 贴回指纹里再铸。'}

| 维度 | 源的值 |
| --- | --- |
| 7 符号与图式系统 | **交视觉模型**：反复出现的形状、比例与组合模式（如圆形 / 三角 / 网格 / 某种专用笔势）。词汇越稳定，风格越独特 —— 产出必须延续**同一套**词汇，不许混入别的体系 |
| 8 情绪与精神气质 | **交视觉模型**（数字旁证：明度 ${dna.stats?.mean_luma ?? '—'} · 饱和度 ${dna.stats?.mean_saturation ?? '—'} · 对比跨度 ${dna.stats?.contrast_span ?? '—'}）：宁静 / 焦虑 / 狂喜 / 虚无。它贯穿上面所有选择，是风格的灵魂 |

- **代理量的边界**：第 1–5 条在**画作、抽象图形、插画**上才有解释力；纯摄影（\`photographic: true\`）上这些数字读作噪声，别硬套结论。
- **材质与纹理**（噪点 / 纸张 / 金属 / 渐变）：**只在 §4「扁平还是质感」判一次**，这里不再复述；有图时用上面的「颗粒增益 / 粗面占比」做旁证即可。
- **只求方向一致，不求数值相等**：产出量一遍，源粗则产出也别修平，源静则产出别加高对比。
- **落不到数字上的，落到取舍纪律上**：源的边界是渗透的，产出就别做描边；源的线是断裂的，产出就别连成一根。
- 读图问法（固定下来，别每次换问法）：肌理与笔触 / 线的书写性 / 空间纵深 / 节奏疏密 / 边界收口 / 反复出现的形状 / 情绪气质 —— 七问逐一作答，答不出的写"看不出"，不许编。

## 6. 内容层次

- 字号阶梯共 ${ladder.length} 级：\`${ladder.map(l => l.size).join(' / ')}\`。
- 相邻级比：${ladder.slice(0, 5).map((l, i) => i < ladder.length - 1 ? `${l.size}→${ladder[i + 1].size} ${Math.round((l.size / ladder[i + 1].size) * 100) / 100}×` : '').filter(Boolean).join(' · ')}。
- 强调手段优先级：字号 → 留白 → 颜色弱化对比 → 字重。一次只用一种。
- **信息层级的处理方式**（这一节定"功能导向还是氛围导向"）：
  - 层数：字号阶梯 ${ladder.length} 级${ladder.length >= 6 ? '（阶梯多 —— 功能导向，靠层级把信息排清楚）' : ladder.length <= 3 ? '（阶梯少 —— 氛围导向，靠留白与颜色分主次）' : ''}。
  - 手段：字号跨度 ${typeMax && typeMin ? Math.round((typeMax / typeMin) * 100) / 100 + '×' : '—'}、字重只用到 ${[...new Set(rolesType.map(r => r.font_weight))].length} 档、弱化色 \`${roles.fg_muted}\` 与正文 \`${roles.fg}\` 的亮度差 ${Math.round(Math.abs(luma(roles.fg) - luma(roles.fg_muted)) * 100) / 100}。
  - 判读：亮度差 > 0.35 = 阶梯式（层级分明）；< 0.2 = 融合式（氛围优先，靠位置与留白暗示层级）。
  - 纪律：**层级只用一种手段建立**（选了字号级差就用到底），混用两种以上会立刻变成"通用后台"。
- 段内密度参考：源每 100px 高约 ${tone.density} 字——正文块按这个密度排，别塞满。

## 7. 素材统一（把上传图形收进本风格）

1. 取图形 → 无损保留其内容（人脸/产品/Logo 不变形、不重绘）。
2. 色调映射：转灰度后按 \`${roles.bg} → ${roles.accent}\` 做双色调（duotone），或直接 \`luminosity\` 叠一层 accent，透明度 ≤ ${pct(tone.satMax) > 40 ? 45 : 25}%。
3. 质感：统一 ${grain.includes('保留') ? '颗粒/滤镜' : '纯净边缘，不加噪点'}；不要给同组素材一半加颗粒一半不加。
4. 形状：圆角 \`${radiusMain}\`，容器裁切比 ${arMain}；不同原比例的素材先按该比例裁切再入版。
5. 合成：贴到 \`${roles.bg}\` 或 \`${roles.bg_alt}\` 上，blend-mode \`${blendMain}\`，描边用 \`${roles.line}\` 1px。

### 7.1 图位缺素材时怎么办（占位顺序 · 含「源图当临时占位」的许可口径）

图位（hero / 产品图 / 人像 / 场景 / 纹理底）没有用户投喂的素材时，**不许空着**，也不许拿来源不明的网图顶上。按顺序补：

| 顺序 | 做法 | 说明 |
| --- | --- | --- |
| 1 · 本机自绘（首选） | 内联 SVG / Canvas 示意插画 | 零版权风险、可复现、与令牌 100% 对齐；**图版 / UI 示意图一律走这条** |
| 2 · 本机生成 | ComfyUI（可复现、免费）/ 即梦（不可复现、每张花钱） | 需要照片级质感时用；生成后回到 §7 走统一链 |
| 3 · 免费素材站（要真实照片时的首选） | Unsplash / Pexels / Openverse / Wikimedia Commons 检索 → 核许可 → 下载入本地 → 统一处理 | 前两条做不出照片质感时走这条，**优先于动源图** |
| 4 · 源模版自身图当**临时占位**（许可但受限） | 从源站下载 → 走统一链 → 图上/图注显著标注「临时占位 · 待替换」 | 只在前三条来不及或都不合适时；**必须**写进占位清单、交付时逐条说明、用户点头才可外发 |

**第 4 条的边界（缺一不可）**：① 只作**临时占位**，不得当终稿素材，不得对外宣称是自家作品；② 图上或图注必须看得出它是占位（「临时占位 · 待替换」）；③ 留痕 —— 源站 URL、下载日期、落位页；④ 走 §7 统一链，否则色调与整套打不齐；⑤ **交付时把待替换项一次说清**，不夹在正文里。

免费素材站的准入条件（缺一不可）：**许可**为 CC0 / 公共领域 / 明确免费商用（需授权或限商用的不用）· **留痕** 来源 URL、作者、许可、下载日期 · **落地**下载到本地再排版，不许外链 · **统一**走 §7 处理链 · **标注**图注挂「占位示意图」+ 来源与许可 · **兜底**找不到合规的就留白 + 一行说明，绝不硬凑。

关键词 = 本风格调性词（${tone.words.slice(0, 3).join(' / ')}）+ 构图词 + 画幅比 ${arMain}；优先 Unsplash / Pexels / Wikimedia Commons / Openverse，用 \`firecrawl\` 技能检索。交付时附 \`占位素材清单.md\`（文件 · 来源 · 作者 · 许可 · 落位 · 状态（占位 / 待替换）· 替换时机）。

## 8. 文案不失真 · 多语言并行排版

- **原文一字不改**：不得缩写、意译、"润色"、删标点。翻译只放在平行层里，\`source_text\` 永久保留。
- 同一视觉框内并行：主语言 \`var(--step-4)\`，副语言 \`var(--step-5)\`（不缩小到看不清，靠颜色弱化）。
- 换语言**只换字族/行高/字距**，不换字号：
  \`\`\`css
  :lang(zh-Hans), :lang(ja), :lang(ko) { line-height: var(--lh-cjk); letter-spacing: 0 }
  :lang(ar), :lang(he) { line-height: var(--lh-arabic); direction: rtl }
  \`\`\`
- 文本膨胀：德语/俄语比英语长 30–35%，CJK 比英语短约 40%。容器按最长语言预留，禁止自动缩放（fit-text）导致各语言字号不一致。
- 断行：CJK 用 \`line-break: strict; word-break: normal\`；拉丁/西里尔用 \`hyphens: auto; overflow-wrap: anywhere\`。
- 数字与拉丁混排进 CJK 时，给拉丁段 \`font-feature-settings\` 与 0.02em 补偿，避免视觉上"卡"。

## 9. 交付与自检

1. 产出页面/画稿 → 截图（PDF/位图产出也要截一页图拿去比）。
2. \`dna-probe.mjs <产出> --out twin.json\` → \`dna-probe.mjs --compare <source.json> twin.json\`。
3. **六道门禁全过才算双胞胎**：主色承接 ≥ 0.70 · 色相分布 JS ≤ 0.30 · 明度分布 JS ≤ 0.30 · 字号阶梯同构（命中 ≥ 0.7）· 栏数一致 · **图像策略（照片感）** —— 源 ${imgArea === undefined ? '有照片时' : `图像面积占比 ${imgArea}，`}产出图的中间调占比必须 ≥ ${imgArea === undefined ? 0.4 : Math.round(Math.max(0.12, (dna.stats?.mid_tone_share ?? 0.6) * 0.6) * 1000) / 1000}（源 ${dna.stats?.mid_tone_share ?? '待测'}）。
4. 第 6 道不过 = 图位被线稿顶了：回到 §1.2 / §7.1 补同量级图像位，别拿"示意插画"糊过去。
5. 任一门不过 → **先回到 §1 构图 / §2 色彩**改这两条主梁，再顺延到 §3/§4，改完重跑，不交差。
`;

// ---------- SKILL.md ----------
const skillMd = `---
name: ${slug}
description: ${title}风格设计技能：按源指纹的配色/字体/间距/骨架数值复刻双胞胎，含多语言并行排版与素材统一
description_full: 从「${dna.source || '源素材'}」蒸馏出的 ${title}（${tone.family}）设计技能。动手做任何本风格的页面、海报、封面、组件或素材前先读本技能：所有颜色、字号、字距、行距、间距、圆角、栏数都是源的真实数值，照抄才像；同时强制文案不失真、多语言并行排版、上传图形统一进本风格。数值改动必须跑 dna-probe --compare 复核。
short_description: ${title} style kit distilled from a real design source.
short_description_zh: ${title}风格设计技能：照抄源指纹数值复刻双胞胎，含多语言并行排版。
version: 1
updated: ${new Date().toISOString().replace(/\\.\\d+Z$/, 'Z')}
---

# ${title} · 设计技能

> 源头：\`${dna.source || 'unknown'}\`（${dna.mode === 'image' ? '位图素材' : '活体页面'}，抓取于 ${dna.captured_at || '—'}）
> 调性：**${tone.family}** —— ${tone.words.join(' · ')}
> 本技能只蒸馏**风格**，不搬运源的内容：文案、图片、Logo 一律换新的（源图**只许**当显著标注、待替换的临时占位，见 §7.1）。

## 怎么用

1. 先读 \`references/style-rules.md\`（逐项数值硬规则）与 \`assets/tokens.css\`（可直接 \`<link>\` 的令牌）。
2. **落笔顺序：§1 构图构成 → §2 色彩构成** —— 这两条主梁先定死（东西放哪多大、什么颜色占多大面积），再排字体、图案、工艺与气质、层次。顺序颠倒 = 白做。
3. 版式照 \`references/style-dna.json\` 的 \`sections\` 骨架排序；\`assets/twin-scaffold.html\` 是带多语言层的空壳，复制它起步。
4. 缺口径时：**先查指纹，没有再量一次源**（\`dna-probe.mjs\`），不许凭手感填数字。
5. **图像是一等公民**：先看 \`references/style-rules.md\` §1.2 的图位密度 —— 源有照片就得出照片，只画线稿不算双胞胎。
6. 交付前跑 §9 的六道门禁（含「图像策略·照片感」）；不过就改，别交差。

## 五条铁律

1. **两条主梁优先**：构图构成（§1）与色彩构成（§2）先定，其余一切都服从这两条。
2. **数值优先**：表外的颜色、字号、间距不出现。
3. **文案不失真**：原文一字不改；翻译只进平行层，\`source_text\` 永久保留。
4. **素材统一但不变形**：只做色调/质感/形状的收编，不重绘内容。
5. **没投喂就占位，不空着也不硬搬**：图位缺素材时按「本机自绘 → 本机生成 → 免费素材站（核许可 + 留痕 + 下载入本地 + 统一 + 标注）→ **源模版自身图作临时占位（必须显著标注待替换、写进清单、交付时逐条说明）**」补位；找不到合规的就留白 + 一行说明。详见 §7.1。

## 文件

| 文件 | 用途 |
| --- | --- |
| \`references/style-rules.md\` | 9 节硬规则：**§1 构图构成（第一优先）· §2 色彩构成（第二优先）** · 排印 · 图案 · 工艺与气质 · 层次 · 素材统一/占位 · 多语言 · 自检 |
| \`references/style-dna.json\` | 指纹原件（含 \`imagery\` 图位密度），比对门禁的输入 |
| \`assets/tokens.css\` | 设计令牌 |
| \`assets/twin-scaffold.html\` | 双胞胎骨架（含 \`:lang()\` 并行排版层） |

## 溯源与工具

- 指纹提取：\`skills/style-distill/scripts/dna-probe.mjs\`
- 门禁比对：\`dna-probe.mjs --compare <源.json> <产出.json>\`
- 位图源取色：\`dna-probe.mjs <图> --out dna.json\`（k-means 8 色 + 明度/色相直方图）
`;

fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
fs.mkdirSync(path.join(skillDir, 'assets'), { recursive: true });
fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
fs.writeFileSync(path.join(skillDir, 'references/style-rules.md'), rulesMd);
fs.copyFileSync(path.resolve(dnaPath), path.join(skillDir, 'references/style-dna.json'));
fs.writeFileSync(path.join(skillDir, 'assets/tokens.css'), tokensCss);
fs.writeFileSync(path.join(skillDir, 'assets/twin-scaffold.html'), scaffold);

console.log(JSON.stringify({
  ok: true,
  skill: slug,
  dir: skillDir,
  tone: { family: tone.family, words: tone.words },
  files: ['SKILL.md', 'references/style-rules.md', 'references/style-dna.json', 'assets/tokens.css', 'assets/twin-scaffold.html'],
  next: [
    `cp -R "${skillDir}" <agent_state>/skills/`,
    `~/.penguin/data/default_project/agents/default_agent/shared_env/py-docx/bin/python3 ~/.penguin/skill-library/_route.py --build`,
  ],
}, null, 2));
