#!/usr/bin/env node
/**
 * dna-probe —— 风格 DNA 提取器（零依赖，CDP 驱动本地 Chromium）
 *
 * 源 → 可测的风格指纹（颜色/字号阶梯/字距行距/间距/圆角/阴影/骨架/图案处理）
 *      node dna-probe.mjs https://example.com --out dna.json --shot src.png
 *      node dna-probe.mjs ./page.html       --out dna.json
 *      node dna-probe.mjs ./画作.png        --out dna.json      # 画作/设计稿走像素模式
 *
 * 双胞胎判定（源指纹 vs 产出指纹）
 *      node dna-probe.mjs --compare dna-source.json dna-twin.json
 *
 * 依赖：本机 ms-playwright 的 headless_shell（无 node_modules 依赖，走 CDP + 全局 WebSocket）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

// ---------- 找浏览器 ----------
function findBrowser() {
  if (process.env.PH_CHROMIUM) return process.env.PH_CHROMIUM;
  const roots = [
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root).sort().reverse()) {
      if (!d.startsWith('chromium')) continue;
      for (const rel of ['chrome-mac/headless_shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/headless_shell', 'chrome-linux/chrome']) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  throw new Error('找不到 Chromium。设 PH_CHROMIUM=<可执行文件路径>，或先装 headless shell。');
}

// ---------- 极简 CDP 客户端 ----------
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  static async connect(url, timeout = 20000) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('CDP 连接超时')), timeout);
      ws.addEventListener('open', () => { clearTimeout(t); res(); });
      ws.addEventListener('error', (e) => { clearTimeout(t); rej(new Error('CDP 连接失败: ' + (e.message || ''))); });
    });
    const c = new CDP(ws);
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method && c.handlers.has(m.method)) {
        c.handlers.get(m.method)();
      }
    });
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  once(method) { return new Promise((res) => this.handlers.set(method, res)); }
  close() { try { this.ws.close(); } catch {} }
}

async function launch(pageUrl, { viewport, wait, selector, proxy }) {
  const bin = findBrowser();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dna-probe-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--disable-lcd-text', '--mute-audio',
    '--allow-file-access-from-files', '--font-render-hinting=none',
    `--window-size=${viewport}`,
    'about:blank',
  ];
  const proxyUrl = proxy || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxyUrl) args.unshift(`--proxy-server=${proxyUrl}`);
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('浏览器 20 秒没起来：\n' + buf.slice(-800))), 20000);
    proc.stderr.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); res(m[1]); }
    });
    proc.on('exit', (c) => { clearTimeout(t); rej(new Error(`浏览器退出(${c})：\n` + buf.slice(-800))); });
  });

  const c = await CDP.connect(wsUrl);
  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
  const sess = {
    send: (method, params = {}) => new Promise((res, rej) => {
      const id = ++c.id;
      c.pending.set(id, { res, rej });
      c.ws.send(JSON.stringify({ id, method, params, sessionId }));
    }),
  };
  const raws = c.ws;
  // 会话内事件
  const events = [];
  raws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.sessionId === sessionId && m.method) events.push(m.method); });

  async function load(url) {
    events.length = 0;
    await sess.send('Page.enable');
    await sess.send('Runtime.enable');
    const [vw, vh] = viewport.split('x').map(Number);
    await sess.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh || 900, deviceScaleFactor: 1, mobile: false });
    await sess.send('Page.navigate', { url });
    const deadline = Date.now() + 30000;
    while (!events.includes('Page.loadEventFired') && Date.now() < deadline) await sleep(120);
    await sleep(wait);
  }

  return { cdp: c, sess, proc, profile, load, events };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 页面侧：风格指纹收集器 ----------
const COLLECTOR = `(() => {
  const rgb = (s) => {
    if (!s || s === 'transparent' || s === 'rgba(0, 0, 0, 0)') return null;
    const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(',').map(Number);
    if (p.length > 3 && p[3] < 0.05) return null;
    const h = (n) => Math.round(n).toString(16).padStart(2, '0');
    return '#' + h(p[0]) + h(p[1]) + h(p[2]);
  };
  const vis = (el) => {
    const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return null;
    if (parseFloat(s.opacity) < 0.05) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    if (r.bottom < -2000 || r.top > (document.body.scrollHeight + 2000)) return null;
    return r;
  };
  const tag = (el) => el.tagName.toLowerCase();
  const ownText = (el) => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();

  const all = [document.documentElement, ...(document.body ? [document.body] : []), ...document.querySelectorAll('body *')];
  const rows = [];
  for (const el of all) {
    const r = vis(el); if (!r) continue;
    const s = getComputedStyle(el);
    rows.push({ el, r, s, area: r.width * r.height, text: ownText(el) });
  }

  // ---- 调色板：按渲染面积加权 ----
  const bg = new Map(), fg = new Map(), bd = new Map(), accents = new Map(), rules = new Map();
  const bump = (m, k, v) => { if (k) m.set(k, (m.get(k) || 0) + v); };
  for (const x of rows) {
    bump(bg, rgb(x.s.backgroundColor), x.area);
    if (x.text) {
      bump(fg, rgb(x.s.color), x.text.length * (parseFloat(x.s.fontSize) || 12));
      if (x.s.fontWeight >= 600) bump(accents, rgb(x.s.color), x.text.length * 4);
    }
    // 发丝线：又细又长的块，它的底色就是分隔线色（很多站不用 border 画线）
    const thin = (x.r.height <= 2.5 && x.r.width >= 24) || (x.r.width <= 2.5 && x.r.height >= 24);
    if (thin) bump(rules, rgb(x.s.backgroundColor), Math.max(x.r.width, x.r.height));
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(x.s['border' + side + 'Width']) > 0 && !x.s['border' + side + 'Style'].includes('none'))
        bump(bd, rgb(x.s['border' + side + 'Color']), x.area);
    }
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([hex, w]) => ({ hex, weight: Math.round(w) }));

  // ---- 排印：按「有自己文字的元素」分组 ----
  const typeMap = new Map();
  for (const x of rows) {
    if (!x.text) continue;
    const size = Math.round(parseFloat(x.s.fontSize) * 100) / 100;
    const lhpx = x.s.lineHeight === 'normal' ? null : Math.round(parseFloat(x.s.lineHeight) * 100) / 100;
    const ls = parseFloat(x.s.letterSpacing);
    const key = [size, x.s.fontWeight, x.s.fontFamily.split(',')[0].replace(/["']/g, ''), lhpx, isNaN(ls) ? 'normal' : Math.round(ls * 1000) / 1000].join('|');
    const cur = typeMap.get(key) || {
      font_size_px: size, font_weight: Number(x.s.fontWeight), font_family: x.s.fontFamily,
      line_height_px: lhpx, line_height_ratio: lhpx ? Math.round((lhpx / size) * 1000) / 1000 : null,
      letter_spacing_px: isNaN(ls) ? 0 : Math.round(ls * 1000) / 1000,
      letter_spacing_em: isNaN(ls) ? 0 : Math.round((ls / size) * 1000) / 1000,
      color: rgb(x.s.color), text_transform: x.s.textTransform, chars: 0, sample: '', elements: 0,
    };
    cur.chars += x.text.length; cur.elements += 1;
    if (cur.sample.length < 40) cur.sample = (cur.sample + ' ' + x.text).trim().slice(0, 40);
    typeMap.set(key, cur);
  }
  const types = [...typeMap.values()].sort((a, b) => b.chars - a.chars);
  const ladder = [...new Set(types.map(t => t.font_size_px))].sort((a, b) => b - a)
    .map(size => ({ size, chars: types.filter(t => t.font_size_px === size).reduce((s, t) => s + t.chars, 0) }));

  // ---- 间距 / 圆角 / 阴影 ----
  const space = new Map(), radii = new Map(), shadows = new Map(), gaps = new Map(), filters = new Map(), blends = new Map(), fits = new Map(), ars = new Map();
  for (const x of rows) {
    for (const k of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'rowGap', 'columnGap']) {
      const v = parseFloat(x.s[k]); if (v > 0) bump(space, String(Math.round(v)), 1);
    }
    const gap = parseFloat(x.s.gap); if (gap > 0) bump(gaps, String(Math.round(gap)), 1);
    const br = x.s.borderRadius;
    if (br && br !== '0px') bump(radii, br.split(' ').map(v => Math.round(parseFloat(v)) + 'px').join(' '), 1);
    if (x.s.boxShadow && x.s.boxShadow !== 'none') bump(shadows, x.s.boxShadow, 1);
    if (x.s.filter && x.s.filter !== 'none') bump(filters, x.s.filter, 1);
    if (x.s.mixBlendMode && x.s.mixBlendMode !== 'normal') bump(blends, x.s.mixBlendMode, 1);
    for (const im of (x.el.tagName === 'IMG' ? [x.el] : [])) {
      if (im.naturalWidth) {
        const ar = Math.round((im.naturalWidth / im.naturalHeight) * 100) / 100;
        bump(ars, ar + ' (' + im.naturalWidth + 'x' + im.naturalHeight + ')', 1);
        bump(fits, getComputedStyle(im).objectFit, 1);
      }
    }
  }
  const num = (m, n) => [...m.entries()].map(([k, c]) => ({ value: k, count: c })).sort((a, b) => b.count - a.count).slice(0, n);

  // ---- 容器宽度 / 网格 / 断点 ----
  const widths = new Map(), grids = new Map(), cols = new Map();
  for (const x of rows) {
    const mw = x.s.maxWidth;
    if (mw && mw !== 'none') bump(widths, 'max-width ' + mw, 1);
    if (x.s.display === 'grid' && x.s.gridTemplateColumns && x.s.gridTemplateColumns !== 'none') {
      const n = x.s.gridTemplateColumns.split(' ').filter(Boolean).length;
      if (n > 1) bump(grids, n + ' 栏 · ' + x.s.gridTemplateColumns, 1);
    }
    if (x.s.display === 'flex' && x.s.flexDirection === 'row' && parseFloat(x.s.gap) > 0) bump(cols, 'flex row · gap ' + x.s.gap, 1);
  }
  const breakpoints = new Set();
  // 样式表里出现过的色字面量：兜住「伪元素画的线、只在悬停时出现的色」这类量不到的色
  const lit = new Map();
  let budget = 4000;
  const hexOf = (...p) => { const h = (n) => Math.round(n).toString(16).padStart(2, '0'); return '#' + h(p[0]) + h(p[1]) + h(p[2]); };
  const scan = (rs) => {
    for (const r of rs) {
      if (budget-- < 0) return;
      const t = r.cssText || '';
      for (const m of t.matchAll(/#([0-9a-fA-F]{3,8})\\b/g)) {
        let v = m[1];
        if (v.length === 3) v = v.split('').map(c => c + c).join('');
        if (v.length === 6) bump(lit, '#' + v.toLowerCase(), 1);
      }
      for (const m of t.matchAll(/rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/g)) {
        const a = t.slice(m.index).match(/rgba\\([^)]*?,\\s*([\\d.]+)\\s*\\)/);
        if (a && Number(a[1]) < 0.05) continue;
        bump(lit, hexOf(+m[1], +m[2], +m[3]), 1);
      }
      if (r.cssRules) scan(r.cssRules);
    }
  };
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch { continue; }
    if (!rules) continue;
    for (const r of rules) {
      if (r.media && r.conditionText) { for (const m of r.conditionText.matchAll(/\\((\\s*min-width|\\s*max-width)\\s*:\\s*([^)]+)\\)/g)) breakpoints.add(m[1].trim() + ': ' + m[2].trim()); }
      if (r.cssRules) for (const r2 of r.cssRules) { if (r2.media && r2.conditionText) for (const m of r2.conditionText.matchAll(/\\((\\s*min-width|\\s*max-width)\\s*:\\s*([^)]+)\\)/g)) breakpoints.add(m[1].trim() + ': ' + m[2].trim()); }
    }
    scan(rules);
  }

  // ---- 版式骨架：找出「段落宿主」，再列它的直接块 ----
  const vw = window.innerWidth;
  const blocksOf = (host) => [...host.children].map((el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (r.height < 80 || r.width < vw * 0.25) return null;
    const h = el.querySelector('h1,h2,h3');
    const imgs = el.querySelectorAll('img,svg,video,picture').length;
    const paras = el.querySelectorAll('p,li').length;
    const links = el.querySelectorAll('a,button').length;
    return {
      tag: tag(el), height: Math.round(r.height),
      background: rgb(s.backgroundColor), background_image: s.backgroundImage === 'none' ? null : s.backgroundImage.slice(0, 160),
      padding_y: [s.paddingTop, s.paddingBottom].join('/'),
      heading: h ? h.innerText.trim().slice(0, 48) : null,
      text_align: s.textAlign, items: { images: imgs, paragraphs: paras, actions: links },
      text_density: Math.round((el.innerText || '').length / Math.max(r.height / 100, 1)),
      children: [...el.children].map(c => tag(c) + (c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')).slice(0, 8),
    };
  }).filter(Boolean);
  const candidates = [document.body, ...document.querySelectorAll('body *')].filter(el => el.children.length >= 2);
  let sections = [], hostPath = 'body';
  for (const el of candidates) {
    const b = blocksOf(el);
    const solid = b.filter(x => x.height >= 120);
    if (solid.length >= 3 && solid.length > sections.length) {
      sections = b; hostPath = tag(el) + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : '');
    }
  }
  if (!sections.length) { const first = document.querySelector('main') || document.body; sections = blocksOf(first); hostPath = first === document.body ? 'body' : 'main'; }

  // ---- 图案元素处理策略 ----
  const media = {
    img_count: document.querySelectorAll('img').length,
    svg_count: document.querySelectorAll('svg').length,
    aspect_ratios: num(ars, 5),
    object_fit: num(fits, 4),
    filters: num(filters, 6),
    blend_modes: num(blends, 5),
    gradients: [...new Set([...document.querySelectorAll('body *')].map(e => getComputedStyle(e).backgroundImage).filter(v => v && v.includes('gradient')).map(v => v.slice(0, 200)))].slice(0, 8),
    background_images: [...new Set([...document.querySelectorAll('body *')].map(e => getComputedStyle(e).backgroundImage).filter(v => v && v !== 'none' && !v.includes('gradient')).map(v => v.slice(0, 120)))].slice(0, 6),
  };

  // ---- 图像策略：源到底用不用照片、用多大、铺在哪 ----
  const imgEls = rows.filter(x => x.el.tagName === 'IMG');
  const pageArea = Math.max(1, document.documentElement.scrollHeight * window.innerWidth);
  const imgArea = imgEls.reduce((s, x) => s + x.area, 0);
  const bigImg = imgEls.slice().sort((a, b) => b.area - a.area)[0];
  const bgImgEls = rows.filter(x => {
    const v = x.s.backgroundImage;
    return v && v !== 'none' && v.includes('url(');
  });
  const imagery = {
    count: imgEls.length,
    background_image_count: bgImgEls.length,
    area_share: Math.round((imgArea / pageArea) * 1000) / 1000,
    full_bleed_count: imgEls.filter(x => x.r.width >= window.innerWidth * 0.9).length,
    large_count: imgEls.filter(x => x.r.width >= window.innerWidth * 0.4).length,
    hero: bigImg ? {
      rendered: Math.round(bigImg.r.width) + 'x' + Math.round(bigImg.r.height),
      natural: bigImg.el.naturalWidth + 'x' + bigImg.el.naturalHeight,
      aspect: Math.round((bigImg.r.width / Math.max(bigImg.r.height, 1)) * 100) / 100,
      object_fit: bigImg.s.objectFit,
      top_px: Math.round(bigImg.r.top + window.scrollY),
      src: (bigImg.el.currentSrc || bigImg.el.src || '').slice(-70),
    } : null,
    // 首屏有没有压图（Orix 那种“照片铺满 + 标题压上去”）
    hero_is_first_screen: !!bigImg && bigImg.r.top + window.scrollY < window.innerHeight * 0.25 && bigImg.r.width >= window.innerWidth * 0.9,
    sample_srcs: imgEls.slice(0, 8).map(x => (x.el.currentSrc || x.el.src || '').slice(-48)),
  };

  const cs = getComputedStyle(document.body);
  const loaded = [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.status).slice(0, 20);

  // ---------- 动效语言（数字设计才有；印刷品这一节留空）----------
  // 缓动曲线与时长是风格的一部分：量化它们，产出照抄。
  const durs = {}, eases = {}, anims = {};
  for (const el of all) {
    const s = getComputedStyle(el);
    for (const d of String(s.transitionDuration || '').split(',')) {
      const v = d.trim(); if (v && v !== '0s') durs[v] = (durs[v] || 0) + 1;
    }
    for (const e of String(s.transitionTimingFunction || '').split(',').map(x => x.trim())) {
      if (e && e !== 'ease' && e !== 'linear') eases[e] = (eases[e] || 0) + 1;
    }
    if (s.animationName && s.animationName !== 'none') {
      const k = s.animationName + ' / ' + s.animationDuration;
      anims[k] = (anims[k] || 0) + 1;
    }
  }
  const topN = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
  const motion = {
    过渡时长: topN(durs, 5),
    缓动曲线: topN(eases, 5),
    关键帧动画: topN(anims, 5),
    有过渡的元素数: all.filter(el => { const s = getComputedStyle(el); return s.transitionProperty && s.transitionProperty !== 'none' && s.transitionDuration !== '0s'; }).length,
  };
  const writingMode = getComputedStyle(document.body).writingMode || 'horizontal-tb';

  // ---------- 阴影解剖：硬投影 vs 弥散投影 ----------
  const shadowStats = (() => {
    // 顶层逗号切分（rgba(...) 里的逗号不算分隔）——用正则断言写不出可用的形态
    const splitTop = (v) => {
      const out = []; let depth = 0, cur = '';
      for (const ch of v) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const out = [];
    for (const el of all.slice(0, 1500)) {
      const v = getComputedStyle(el).boxShadow;
      if (!v || v === 'none') continue;
      for (const part of splitTop(v)) {
        const nums = (part.match(/-?\d+(?:\.\d+)?px/g) || []).map(parseFloat);
        if (nums.length < 3) continue;
        out.push({ raw: part.trim().slice(0, 60), dx: nums[0], dy: nums[1], blur: nums[2], spread: nums[3] ?? 0 });
      }
    }
    return out.slice(0, 6);
  })();

  return {
    page: {
      url: location.href, title: document.title,
      lang: document.documentElement.lang || cs.lang || null, dir: document.documentElement.dir || cs.direction || 'ltr',
      body_font: cs.fontFamily, body_size: cs.fontSize, body_color: rgb(cs.color), body_bg: rgb(cs.backgroundColor),
      scroll_height: document.documentElement.scrollHeight, element_count: all.length,
    },
    palette: { background: top(bg, 10), text: top(fg, 8), accent_weighted: top(accents, 6), border: top(bd, 6), rule: top(rules, 4), css_literals: top(lit, 12) },
    type: { roles: types.slice(0, 14), size_ladder: ladder },
    rhythm: { spacing_counts: num(space, 12), gap_counts: num(gaps, 8), radii: num(radii, 8), shadows: num(shadows, 5), shadow_stats: shadowStats },
    layout: { skeleton_host: hostPath, section_count: sections.length, containers: num(widths, 8), grids: num(grids, 6), flex_rows: num(cols, 6), breakpoints: [...breakpoints].slice(0, 12), writing_mode: writingMode },
    motion,
    sections: sections.slice(0, 14),
    media,
    imagery,
    fonts_loaded: loaded,
  };
})()`;

// ---------- 页面侧：位图（画作 / 设计稿）取色 ----------
const IMAGE_PROBE = (dataUrl) => `(async () => {
  const img = new Image(); img.src = ${JSON.stringify(dataUrl)};
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('图片解码失败')); });
  const W = 480, H = Math.max(1, Math.round(img.height * (W / img.width)));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const hex = (r, g, b) => '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
  const px = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]; if (a < 128) continue;
    px.push([data[i], data[i + 1], data[i + 2]]);
  }
  // k-means（k=8，固定种子，结果可复现）
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let centro = Array.from({ length: 8 }, () => px[Math.floor(rnd() * px.length)]);
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < 12; it++) {
    for (let i = 0; i < px.length; i++) {
      let best = 0, bd = 1e9;
      for (let c = 0; c < centro.length; c++) {
        const d = (px[i][0] - centro[c][0]) ** 2 + (px[i][1] - centro[c][1]) ** 2 + (px[i][2] - centro[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
    }
    const sum = centro.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) { const c = assign[i]; sum[c][0] += px[i][0]; sum[c][1] += px[i][1]; sum[c][2] += px[i][2]; sum[c][3]++; }
    centro = centro.map((c, i) => sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c);
  }
  const counts = new Array(centro.length).fill(0);
  for (const a of assign) counts[a]++;
  const total = px.length;
  const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const sat = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx === 0 ? 0 : (mx - mn) / mx; };
  const clusters = centro.map((c, i) => ({
    hex: hex(Math.round(c[0]), Math.round(c[1]), Math.round(c[2])),
    share: Math.round((counts[i] / total) * 1000) / 1000,
    luma: Math.round(luma(c) * 1000) / 1000, saturation: Math.round(sat(c) * 1000) / 1000,
  })).sort((a, b) => b.share - a.share);
  // 明度直方图（16 档）+ 色相直方图（12 档）
  const lumHist = new Array(16).fill(0), hueHist = new Array(12).fill(0), satHist = new Array(10).fill(0);
  for (const c of px) {
    lumHist[Math.min(15, Math.floor(luma(c) * 16))]++;
    satHist[Math.min(9, Math.floor(sat(c) * 10))]++;
    const mx = Math.max(...c), mn = Math.min(...c), d = mx - mn;
    let h = 0; if (d) { if (mx === c[0]) h = ((c[1] - c[2]) / d) % 6; else if (mx === c[1]) h = (c[2] - c[0]) / d + 2; else h = (c[0] - c[1]) / d + 4; h *= 60; if (h < 0) h += 360; }
    if (d / (mx || 1) > 0.12) hueHist[Math.min(11, Math.floor(h / 30))]++;
  }
  const norm = (a) => a.map(v => Math.round((v / total) * 1000) / 1000);
  const used = lumHist.map((v, i) => (v / total > 0.02 ? i : -1)).filter(i => i >= 0);
  // 中间调占比：照片有大片中间调（4–11 档），线稿几乎没有 —— 用它分辨「有照片」还是「只有线条」
  const midTone = lumHist.slice(4, 12).reduce((s, v) => s + v, 0) / total;
  // 细节密度：相邻像素亮度差的均值，照片高、纯色块低
  let detail = 0, dn = 0;
  for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) {
    const i = (y * W + x) * 4, j = i - 4;
    detail += Math.abs((data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) - (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114));
    dn++;
  }
  // ---------- 工艺指纹（笔触/线条/边界/节奏/值域）----------
  // 这些是**像素代理量**，用来把"粗糙还是光滑""硬边还是渗透"这类话变成可复现的数字；
  // 定性判断（纵深/图式/气质）仍交视觉模型，见 needs_vision。
  const L = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    L[y * W + x] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  }
  const at = (x, y) => L[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const gAt = (x, y) => Math.abs(at(x + 1, y) - at(x - 1, y)) + Math.abs(at(x, y + 1) - at(x, y - 1));
  const strongMask = new Uint8Array(W * H);
  let gSum = 0, lapSum = 0, rough = 0, strong = 0, veryStrong = 0, softN = 0, nn = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = gAt(x, y), c = at(x, y);
    gSum += g;
    lapSum += Math.abs(4 * c - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1));
    nn++;
    if (g > 0.24) { strong++; strongMask[y * W + x] = 1; if (g > 0.7) veryStrong++; }
    else if (g > 0.08) softN++;
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {       // 局部 3×3 标准差 > 0.06 视为"粗"
      let m = 0, m2 = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = at(x + dx, y + dy); m += v; m2 += v * v; }
      m /= 9; m2 /= 9;
      if (m2 - m * m > 0.0036) rough++;
    }
  }
  let contig = 0, runSum = 0, runN = 0;
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) {
      const on = strongMask[y * W + x];
      if (on) {
        run++;
        let nb = 0;
        if (x > 0 && strongMask[y * W + x - 1]) nb++;
        if (x < W - 1 && strongMask[y * W + x + 1]) nb++;
        if (y > 0 && strongMask[(y - 1) * W + x]) nb++;
        if (y < H - 1 && strongMask[(y + 1) * W + x]) nb++;
        if (nb >= 2) contig++;
      } else if (run) { runSum += run; runN++; run = 0; }
    }
    if (run) { runSum += run; runN++; }
  }
  const bins = new Array(16).fill(0);
  for (let i = 0; i < L.length; i++) bins[Math.min(15, Math.floor(L[i] * 16))]++;
  const share = (v) => Math.round((v / nn) * 1000) / 1000;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
  const corr = (a, b) => {
    const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < a.length; i++) { const da = a[i] - ma, db = b[i] - mb; s += da * db; sa += da * da; sb += db * db; }
    return sa * sb ? s / Math.sqrt(sa * sb) : 0;
  };
  // 8×8 分块：疏密（块均值的离散度）与密集度趋势
  const B = 8, bw = Math.floor(W / B), bh = Math.floor(H / B), bMean = [], bDetail = [], bIdx = [];
  for (let by = 0; by < B; by++) for (let bx = 0; bx < B; bx++) {
    let m = 0, d = 0, c = 0;
    for (let y = by * bh; y < (by + 1) * bh; y++) for (let x = bx * bw; x < (bx + 1) * bw; x++) { m += at(x, y); d += gAt(x, y); c++; }
    bMean.push(m / c); bDetail.push(d / c); bIdx.push(by);
  }
  // 重复单元：行/列亮度轮廓的自相关峰。**必须先去掉整体明暗渐变**，
  // 否则"上暗下亮"这种趋势会伪装成强重复（实测未去趋势时所有图都是 0.94–0.99，等于没有判别力）。
  const prof = (rows) => {
    const p = [];
    if (rows) { for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) s += at(x, y); p.push(s / W); } }
    else { for (let x = 0; x < W; x++) { let s = 0; for (let y = 0; y < H; y++) s += at(x, y); p.push(s / H); } }
    const w = Math.max(5, Math.min(31, (Math.floor(p.length / 8) || 5) | 1)), half = w >> 1;
    const det = p.map((_, i) => {
      let s = 0, c = 0;
      for (let k = -half; k <= half; k++) { const j = i + k; if (j >= 0 && j < p.length) { s += p[j]; c++; } }
      return p[i] - s / c;
    });
    const d = det.reduce((s, z) => s + z * z, 0) || 1;
    let best = 0, lag = 0;
    for (let k = 5; k < Math.floor(p.length / 3); k++) {
      let s = 0;
      for (let i = 0; i + k < det.length; i++) s += det[i] * det[i + k];
      s /= d;
      if (s > best) { best = s; lag = k; }
    }
    return { value: Math.round(Math.max(0, best) * 1000) / 1000, lag };
  };
  const repRow = prof(true), repCol = prof(false);
  const hard = share(veryStrong), soft = share(softN);
  const craft = {
    采样: W + 'x' + H,
    // 1 笔触与肌理：粗糙/厚涂 vs 光滑/晕染
    肌理: {
      画笔能量: Math.round((gSum / nn) * 1000) / 1000,          // 全局笔触能量（含边缘）
      颗粒增益: Math.round((lapSum / Math.max(gSum, 1e-6)) * 1000) / 1000,  // 高频 ÷ 总能量：高 = 沙粒/短笔触，低 = 平涂晕染
      粗面占比: share(rough),                                    // 局部起伏大的像素占比：厚堆 / 沙土质感
    },
    // 2 线条语言：书写性
    线条: {
      强线占比: share(strong),                                   // 强边像素占比 ≈ 线与笔道在画面上的分量
      线条连续性: strong ? Math.round((contig / strong) * 1000) / 1000 : 0,  // 强边像素里有多少是连着的（断裂 vs 连绵）
      笔道宽度: runN ? Math.round((runSum / runN) * 10) / 10 : 0,            // 强边水平连续段平均长度（px；粗笔 vs 细线）
    },
    // 3 空间处理（值域层次；纵深 / 呼吸感交视觉模型）
    空间: {
      值域档数: bins.filter(b => b / nn > 0.06).length,           // 16 档里占 >6% 的档数：平涂 1–2 档，多层次 4 档以上
      暗部占比: share(bins.slice(0, 4).reduce((s, v) => s + v, 0)),
      亮部占比: share(bins.slice(12).reduce((s, v) => s + v, 0)),
    },
    // 4 节奏与重复
    节奏: {
      疏密离散: mean(bMean) > 0 ? Math.round((std(bMean) / mean(bMean)) * 1000) / 1000 : 0,  // 块均值的 CV：节拍器 vs 疏密对比
      重复强度: Math.max(repRow.value, repCol.value),             // 行/列轮廓自相关峰：高 = 有重复单元 / 网格
      重复周期: repRow.value >= repCol.value ? repRow.lag : repCol.lag,
      纵深趋势: Math.round(corr(bDetail, bIdx) * 1000) / 1000,     // 块细化度与纵向位置的相关：越往下越密 / 越疏
    },
    // 5 边界处理：硬边 vs 渐变渗透
    边界: {
      硬边占比: hard,
      软边占比: soft,
      边硬度: Math.round((hard / Math.max(hard + soft, 1e-6)) * 1000) / 1000,  // 越高越硬（纽曼式硬边），越低越渗透（罗斯科式晕染）
    },
    // 7 视觉锚点：画面里"最重"的那一块落在哪（8×8 分块里细度最高的块）
    锚点: (() => {
      let bi = 0;
      for (let i = 1; i < bDetail.length; i++) if (bDetail[i] > bDetail[bi]) bi = i;
      const bx = bi % B, by = Math.floor(bi / B);
      const avg = mean(bDetail) || 1e-6;
      return {
        位置: Math.round(((bx + 0.5) / B) * 100) + '% / ' + Math.round(((by + 0.5) / B) * 100) + '%',  // 横向% / 纵向%
        相对强度: Math.round((bDetail[bi] / avg) * 100) / 100,   // 最密块 ÷ 平均：越高说明画面越"单点聚焦"
      };
    })(),
    // 8 留白与密度：「少」不是极简，留白的**比例**才是
    留白: (() => {
      const d = bins.indexOf(Math.max(...bins));
      const blank = bins.filter((_, i) => Math.abs(i - d) <= 1).reduce((s, v) => s + v, 0);
      return {
        底色档: d,
        空白占比: Math.round((blank / nn) * 1000) / 1000,                     // 落在主底色档 ±1 的像素占比 = 留白率
        墨量: Math.round((1 - blank / nn) * 1000) / 1000,                     // 1 − 留白率
        主色占比: Math.round(((clusters[0] && clusters[0].share) || 0) * 1000) / 1000,
      };
    })(),
    // 7/8 图形语言（几何还是有机、扁平还是描边）与材质（噪点 / 纹理 / 渐变）：像素判不出体系，交视觉模型
    //    能给的旁证是"扁平度"：既无渐变又无颗粒时，画面就是纯平涂
    needs_vision_more: ['图形语言：几何还是有机、圆角还是直角、描边还是扁平', '装饰语法：边框 / 分割线 / 阴影 / 圆角弧度的用法', '材质：噪点 / 纸张纹理 / 金属光泽 / 渐变'],
    // 6/7 图式与气质：像素量不出来，交视觉模型
    needs_vision: ['符号与图式系统（反复出现的形状与组合模式）', '情绪与精神气质（宁静 / 焦虑 / 狂喜 / 虚无）', '空间是扁平还是纵深、往里退还是往外冲'],
  };

  return {
    page: { url: 'image:' + ${JSON.stringify(dataUrl.slice(0, 24))} + '…', width: img.width, height: img.height, aspect_ratio: Math.round((img.width / img.height) * 100) / 100, pixels_sampled: total },
    palette: { clusters, dominant_light: luma(centro.slice().sort((a, b) => counts[centro.indexOf(b)] - counts[centro.indexOf(a)])[0]) > 0.6 },
    histograms: { luminance: norm(lumHist), saturation: norm(satHist), hue: norm(hueHist) },
    stats: {
      mean_luma: Math.round(px.reduce((s, c) => s + luma(c), 0) / total * 1000) / 1000,
      mean_saturation: Math.round(px.reduce((s, c) => s + sat(c), 0) / total * 1000) / 1000,
      contrast_span: used.length ? Math.round(((used[used.length - 1] - used[0] + 1) / 16) * 1000) / 1000 : 0,
      mid_tone_share: Math.round(midTone * 1000) / 1000,
      detail_density: Math.round((detail / Math.max(dn, 1)) * 10) / 10,
      // 只认中间调占比：实拍照片有大片 4–11 档中间调（0.59–0.93），线稿几乎为零（0.006–0.013），差 40 倍。
      // detail_density 分辨不出（线稿图版 2.3 vs 方形照片 2.5），故不作判据，只作参考输出。
      photographic: midTone >= 0.4,
    },
    craft,
  };
})()`;

// ---------- 对比（双胞胎判定） ----------
function compare(a, b) {
  const js = (p, q, bins = 12) => {
    const P = normalise(p, bins), Q = normalise(q, bins);
    const M = P.map((v, i) => (v + Q[i]) / 2);
    const kl = (X) => X.reduce((s, v, i) => s + (v > 0 ? v * Math.log2(v / (M[i] || 1e-9)) : 0), 0);
    return Math.round(((kl(P) + kl(Q)) / 2) * 1000) / 1000;
  };
  const normalise = (arr, n) => {
    const out = new Array(n).fill(0);
    (arr || []).forEach((v, i) => { if (i < n) out[i] = v; });
    const s = out.reduce((x, y) => x + y, 0) || 1;
    return out.map(v => v / s);
  };
  const hexOf = (probe) => {
    const c = probe.palette?.clusters;
    if (c) return c.map(x => ({ hex: x.hex, share: x.share }));
    return (probe.palette?.background || []).slice(0, 8).map(x => ({ hex: x.hex, share: x.weight })).map((x, _, arr) => ({ hex: x.hex, share: x.share / (arr.reduce((s, y) => s + y.share, 0) || 1) }));
  };
  const swatch = hexOf(a), swatchB = hexOf(b);
  // 两色是否算同一个色：明度差 ≤ 0.12 是硬条件；色相只对**有彩**的色比 ——
  // 近中性的灰里，色相是小噪声放大出来的数字（#8d9090 vs #90979b 只差 3 个色阶，
  // 算出来却差 22°），拿它判定会把近乎单色的源整片判成"没承接"，所以无彩之间只比明度。
  const near = (x, y) => {
    if (Math.abs(luma(x.hex) - luma(y.hex)) > 0.12) return false;
    const sx = satHex(x.hex), sy = satHex(y.hex);
    if (sx < 0.12 && sy < 0.12) return true;
    return Math.abs(hue(x.hex) - hue(y.hex)) < 14;
  };
  // 源的主色是否被产出承接（按面积占比加权：主导色的覆盖比数量更重要）
  const srcTotal = swatch.reduce((s, x) => s + x.share, 0) || 1;
  const covered = swatch.filter(s => swatchB.some(t => near(s, t))).reduce((s, x) => s + x.share, 0) / srcTotal;
  const noise = swatchB.filter(t => !swatch.some(s => near(s, t)));
  const ladderOf = (p) => (p.type?.size_ladder || []).map(x => x.size);
  const la = ladderOf(a), lb = ladderOf(b);
  const top = la.slice(0, 6);
  const hit = top.filter(s => lb.some(t => Math.abs(t - s) <= 1)).length;
  const colsOf = (p) => {
    const g = p.layout?.grids?.[0]?.value; if (g) return parseInt(g, 10) || null;
    const f = p.layout?.flex_rows?.[0]?.value; return f ? 'flex-row' : null;
  };
  const hue13 = (h) => { const out = new Array(13).fill(0); const src = h || []; for (let i = 0; i < 12; i++) out[i] = src[i] || 0; out[12] = Math.max(0, 1 - out.slice(0, 12).reduce((s, v) => s + v, 0)); return out; };
  const hueA = hue13(a.histograms?.hue || hueHistFromPalette(swatch));
  const hueB = hue13(b.histograms?.hue || hueHistFromPalette(swatchB));
  const lumA = (a.histograms?.luminance) || lumaHistFromPalette(swatch);
  const lumB = (b.histograms?.luminance) || lumaHistFromPalette(swatchB);
  const jsHue = js(hueA, hueB, 13), jsLum = js(lumA, lumB, 16);
  const gates = [
    {
      gate: '主色承接', value: Math.round(covered * 100) / 100, threshold: '>= 0.70', pass: covered >= 0.7,
      note: `源前 ${swatch.length} 色的面积占比里 ${Math.round(covered * 100)}% 能在产出里找到；产出另有杂色 ${noise.length} 个${noise.length ? '（' + noise.slice(0, 4).map(x => x.hex).join(' ') + '）' : ''}`,
    },
    { gate: '色相分布', value: jsHue, threshold: '<= 0.30', pass: jsHue <= 0.3, note: '12 档色相 + 1 档无彩，JS 散度（越小越像）' },
    { gate: '明度分布', value: jsLum, threshold: '<= 0.30', pass: jsLum <= 0.3, note: '16 档明度直方图 JS 散度' },
    {
      gate: '字号阶梯', value: `${hit}/${top.length}`, threshold: '≥ 0.7', pass: top.length === 0 || hit / top.length >= 0.7,
      note: `源最大 6 级 ${top.join('/')} → 产出 ${lb.slice(0, 6).join('/')}（源共 ${la.length} 级，含界面小字，不必全搬）`,
    },
    { gate: '栏数一致', value: String(colsOf(b)), threshold: String(colsOf(a)), pass: String(colsOf(a)) === String(colsOf(b)), note: '主内容网格栏结构' },
  ];
  // 图像策略门禁：源有照片时，产出不能只有线条（这是"图片全没了"这类事故的唯一自动判据）
  const midA = a.stats?.mid_tone_share, midB = b.stats?.mid_tone_share;
  const srcImagery = a.imagery;
  if (midA !== undefined && midB !== undefined) {
    const need = srcImagery ? Math.max(0.12, midA * 0.6) : 0.12;
    gates.push({
      gate: '图像策略（照片感）', value: midB, threshold: `>= ${Math.round(need * 1000) / 1000}`, pass: midB >= need,
      note: `中间调占比：源 ${midA} / 产出 ${midB}；源图像面积占比 ${srcImagery ? srcImagery.area_share : 'n/a'}${srcImagery?.hero_is_first_screen ? '（首屏就是满幅照片）' : ''} —— 纯线稿的中间调通常 < 0.05，光有线条过不了这关`,
    });
  } else if (srcImagery && srcImagery.area_share >= 0.15) {
    gates.push({
      gate: '图像策略（人工核）', value: srcImagery.area_share, threshold: '产出必须带同量级图像位', pass: true,
      note: `源图像面积占比 ${srcImagery.area_share}、满幅图 ${srcImagery.full_bleed_count} 张${srcImagery.hero_is_first_screen ? '、首屏即满幅照片 + 标题压图' : ''}。两侧都是活体页面时自动比色，涉及 PDF/位图产出时这条只能人工核 —— 但**不许跳过**：纯线稿不算双胞胎。`,
    });
  }
  const failed = gates.filter(g => !g.pass);
  return {
    status: failed.length ? 'off' : 'twin',
    verdict: failed.length
      ? `还差 ${failed.length} 项：${failed.map(g => g.gate).join(' · ')} —— 按 style-rules 的对应小节改数值后重跑`
      : `${gates.length} 道门禁全过：${gates.map(g => g.gate).join('、')}与源同构。`,
    gates, source_colors: swatch, twin_colors: swatchB,
  };
}
function hue(hex) { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return -1; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; }
function luma(hex) { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); return (0.2126 * r + 0.7152 * g + 0.0722 * b); }
function satHex(hex) { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; }
function hueHistFromPalette(sw) { const out = new Array(12).fill(0); for (const s of sw) { if (satHex(s.hex) < 0.12) continue; out[Math.min(11, Math.floor(hue(s.hex) / 30))] += s.share || 1; } const t = out.reduce((a, b) => a + b, 0) || 1; return out.map(v => v / t); }
function lumaHistFromPalette(sw) { const out = new Array(16).fill(0); for (const s of sw) { out[Math.min(15, Math.floor(luma(s.hex) * 16))] += s.share || 1; } const t = out.reduce((a, b) => a + b, 0) || 1; return out.map(v => v / t); }

// ---------- 主流程 ----------
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '--shot' || a === '--viewport' || a === '--wait' || a === '--selector' || a === '--proxy') o[a.slice(2)] = argv[++i];
    else if (a === '--compare') o.compare = argv.slice(i + 1).filter(x => !x.startsWith('--')); 
    else o._.push(a);
  }
  return o;
}

const args = parseArgs(process.argv.slice(2));

if (args.compare?.length === 2) {
  const a = JSON.parse(fs.readFileSync(args.compare[0], 'utf8'));
  const b = JSON.parse(fs.readFileSync(args.compare[1], 'utf8'));
  const r = compare(a, b);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.status === 'twin' ? 0 : 1);
}

const target = args._[0];
if (!target) { console.error('用法：dna-probe.mjs <url|file|image> [--out dna.json] [--shot shot.png] [--viewport 1440x900] [--wait 1500] [--selector css] [--proxy url]'); process.exit(2); }

const viewport = args.viewport || '1440x900';
const wait = args.wait ? Number(args.wait) : 1800;
const isImage = /\.(png|jpe?g|gif|webp)$/i.test(target) && fs.existsSync(target);

const env = await launch(target, { viewport, wait, selector: args.selector, proxy: args.proxy });
let dna;
try {
  if (isImage) {
    const buf = fs.readFileSync(target);
    const mime = /\.png$/i.test(target) ? 'image/png' : /\.webp$/i.test(target) ? 'image/webp' : /\.gif$/i.test(target) ? 'image/gif' : 'image/jpeg';
    await env.load('about:blank');
    const expr = IMAGE_PROBE('data:' + mime + ';base64,' + buf.toString('base64'));
    const { result, exceptionDetails } = await env.sess.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || '像素提取失败');
    dna = result.value;
    dna.mode = 'image';
  } else {
    const url = /^https?:|^file:/.test(target) ? target : 'file://' + path.resolve(target);
    await env.load(url);
    if (args.selector) {
      const found = await env.sess.send('Runtime.evaluate', { expression: `!!document.querySelector(${JSON.stringify(args.selector)})`, returnByValue: true });
      if (!found.result.value) throw new Error('页面里没有 ' + args.selector);
    }
    const { result, exceptionDetails } = await env.sess.send('Runtime.evaluate', { expression: COLLECTOR, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || '指纹提取失败');
    dna = result.value;
    dna.mode = 'page';
    dna.viewport = viewport;
    if (args.shot) {
      const shot = await env.sess.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(args.shot, Buffer.from(shot.data, 'base64'));
      dna.screenshot = path.resolve(args.shot);
    }
  }
  dna.captured_at = new Date().toISOString();
  dna.source = /^https?:/.test(target) ? target : path.resolve(target);
  dna.probed_with = 'dna-probe.mjs';
} catch (e) {
  console.error('提取失败：' + e.message);
  env.cdp.close(); env.proc.kill();
  process.exit(1);
}
env.cdp.close(); env.proc.kill();

const out = args.out || null;
const text = JSON.stringify(dna, null, 2);
if (out) { fs.writeFileSync(out, text); console.log('已写入 ' + out); }
else console.log(text);
