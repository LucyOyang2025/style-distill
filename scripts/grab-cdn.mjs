#!/usr/bin/env node
/**
 * grab-cdn —— 用**浏览器上下文**绕过 CDN 的 403，取整页长图（切片 → 落盘）。
 *
 * 核心机制（三步，不许换）：
 *   1) 把图片 URL 当**顶层文档**打开（page.goto(imgUrl)）—— cookie / referer / UA / TLS 指纹
 *      全由浏览器自己带，一步过 403 与 CSP，不需要伪造任何 header。
 *      （反例：页内 fetch 图片会被 CSP/CORS 拦；curl 直连 CDN 返回 403。）
 *   2) 页内建 <canvas>，按 SLICE（默认 1400px）高**分片** drawImage → toDataURL('image/jpeg', 0.92)，
 *      Node 侧把 base64 落盘。整页长图（如 2000×19656）**必须切片**，一次性 canvas 会爆内存。
 *   3) 为什么不用 element.screenshot() / page.screenshot({fullPage:true})：
 *      视口外那部分会被拍成空白，长图尤其明显（实测踩过，不是理论问题）。
 *
 * 前置：一个开着 CDP 端口的 Chrome（独立端口 + 独立 user-data-dir，配方见 references/cdn-bypass.md）。
 * 依赖：只用 playwright-core 的 connectOverCDP，零其它 npm 依赖。
 *
 * 用法：
 *   node grab-cdn.mjs --help
 *   node grab-cdn.mjs <图片URL> <输出目录> [切片高px] [缩放]
 *   node grab-cdn.mjs <图片URL> <输出目录> --slice 1400 --scale 1
 *   CDP=http://127.0.0.1:9337 node grab-cdn.mjs <图片URL> <输出目录>
 *
 * 产物：<输出目录>/slice-00.jpg … + meta.json（图片 URL / 原图尺寸 / 切片高 / 缩放 / 片数 / 时间 / 端点）
 * 拼回整图：ffmpeg -i slice-00.jpg -i slice-01.jpg -i slice-02.jpg -filter_complex vstack=inputs=N out.png
 *          （image2 序列是"一个流"，vstack 要的是 N 个输入 —— 必须逐个 -i 列出来）
 * 退出码：0 = 成功；1 = 参数缺 / 连不上 CDP / 页内取不到图 / 图没加载完。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const USAGE = `grab-cdn —— 借浏览器上下文绕过 CDN 403，取全页长图

用法：
  node grab-cdn.mjs <图片URL> <输出目录> [切片高px] [缩放]
  node grab-cdn.mjs <图片URL> <输出目录> --slice 1400 --scale 1

选项：
  --out <目录>    输出目录（也可用第 2 个位置参数）
  --slice <px>    每片高度，默认 1400（长图必须切片）
  --scale <倍数>  输出缩放，默认 1
  -h, --help      显示这段说明

环境：
  CDP                    CDP 端点，默认 http://127.0.0.1:9336
  PH_PLAYWRIGHT_CORE     playwright-core 所在目录（默认自动查找）

产物：slice-XX.jpg + meta.json；拼回整图见 references/cdn-bypass.md
示例：CDP=http://127.0.0.1:9336 node grab-cdn.mjs "https://cdn.example.com/a.jpg" ./out`

// ---------- 参数（缺省就打印用法并退 1，不静默失败） ----------
const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); process.exit(0) }

const pos = []
let SLICE = 1400, SCALE = 1, outArg = null
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--out') outArg = argv[++i]
  else if (a === '--slice') SLICE = Number(argv[++i])
  else if (a === '--scale') SCALE = Number(argv[++i])
  else if (a.startsWith('-')) { console.error(`未知选项：${a}\n\n${USAGE}`); process.exit(1) }
  else pos.push(a)
}
if (pos.length > 4) { console.error(`位置参数最多 4 个（URL 目录 切片 缩放）。\n\n${USAGE}`); process.exit(1) }
const url = pos[0]
const outRaw = outArg || pos[1]
if (pos[2] !== undefined) SLICE = Number(pos[2])
if (pos[3] !== undefined) SCALE = Number(pos[3])
const outDir = path.resolve(outRaw || '.')

if (!url || !outRaw) { console.error(`参数不全：需要「图片URL」与「输出目录」。\n\n${USAGE}`); process.exit(1) }
if (!/^https?:\/\//i.test(url)) { console.error(`图片URL 必须是 http(s) 地址，收到：${url}\n\n${USAGE}`); process.exit(1) }
if (!Number.isFinite(SLICE) || SLICE <= 0) { console.error(`切片高必须是正数，收到：${process.argv.join(' ')}\n\n${USAGE}`); process.exit(1) }
if (!Number.isFinite(SCALE) || SCALE <= 0) { console.error(`缩放必须是正数，收到：${SCALE}\n\n${USAGE}`); process.exit(1) }

const CDP = process.env.CDP || 'http://127.0.0.1:9336'

// ---------- 找 playwright-core（只连 CDP，不用它自带的浏览器） ----------
function loadPlaywright() {
  const req = createRequire(import.meta.url)
  const dirs = (d) => {                     // 只列目录，scratchpad 里混着文件，硬 readdir 会炸
    try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) } catch { return [] }
  }
  const roots = []
  if (process.env.PH_PLAYWRIGHT_CORE) roots.push(process.env.PH_PLAYWRIGHT_CORE)
  for (const d of (process.env.NODE_PATH || '').split(path.delimiter)) if (d) roots.push(d)
  const home = process.env.HOME || ''
  const agents = path.join(home, '.penguin/data/default_project/agents')
  for (const a of dirs(agents)) {           // 本机各 agent 的 shared_env 与 scratchpad
    const se = path.join(agents, a, 'shared_env')
    for (const v of dirs(se)) roots.push(path.join(se, v, 'node/lib/node_modules'), path.join(se, v, 'node_modules'))
    const sc = path.join(agents, a, 'scratchpad')
    for (const s of dirs(sc)) for (const sub of dirs(path.join(sc, s))) roots.push(path.join(sc, s, sub, 'node_modules'))
  }
  const tries = [req]
  for (const r of roots) {
    for (const p of [path.join(r, 'x.js'), path.join(r, 'node_modules/x.js')]) {
      if (fs.existsSync(path.dirname(p))) tries.push(createRequire(p))
    }
  }
  const errs = []
  for (const r of tries) for (const name of ['playwright-core', 'playwright']) {
    try { const m = r(name); if (m?.chromium) return m } catch (e) { errs.push(`${name}: ${e.code || e.message}`) }
  }
  console.error('找不到 playwright-core。装一次即可（不装依赖到本技能目录）：\n' +
    '  npm i -g playwright-core   # 或 npm i playwright-core\n' +
    '  然后设 PH_PLAYWRIGHT_CORE=<playwright-core 所在目录> node grab-cdn.mjs ...\n' +
    `找过：${roots.length} 处。${errs.slice(0, 2).join(' / ')}`)
  process.exit(1)
}
const { chromium } = loadPlaywright()

// ---------- 连上浏览器 → 顶层文档打开图片 → canvas 切片 ----------
fs.mkdirSync(outDir, { recursive: true })
let browser = null
const bye = () => { try { browser?.close() } catch {} }        // 收工要关，别把 CDP 连接挂着
process.on('SIGINT', () => { bye(); process.exit(130) })

try {
  browser = await chromium.connectOverCDP(CDP)
} catch (e) {
  console.error(`连不上 CDP 端点 ${CDP}：${e.message}\n` +
    `先起一个独立 Chrome（不动用户在用的那个），见 references/cdn-bypass.md §B：\n` +
    `  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9336 \\\n` +
    `    --user-data-dir=/tmp/<name>-profile --no-first-run --no-default-browser-check about:blank`)
  process.exit(1)
}

const ctx = browser.contexts()[0]
if (!ctx) { console.error('这个 CDP 端点没有任何 browser context（Chrome 可能刚起）：重开一次 Chrome 再跑。'); bye(); process.exit(1) }
const page = await ctx.newPage()
try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })   // 顶层文档 = 浏览器自己带全凭据
  await page.waitForTimeout(800)

  // 等图加载完：complete 或 naturalWidth=0 都说明还没好，等 onload（有上限，不无限等）
  const meta = await page.evaluate(async () => {
    const im = document.querySelector('img')
    if (!im) return { error: `页内没有 img（document.contentType=${document.contentType}，可能是错误页/非图片文档）` }
    if (!im.complete || !im.naturalWidth) {
      await new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 30000) })
    }
    if (!im.naturalWidth || !im.naturalHeight) {
      return { error: `图没加载完（naturalWidth=${im.naturalWidth}，naturalHeight=${im.naturalHeight}，src=${String(im.currentSrc || im.src).slice(0, 200)}）` }
    }
    return { w: im.naturalWidth, h: im.naturalHeight }
  })
  if (meta.error) { console.error(meta.error); bye(); process.exit(1) }

  const n = Math.ceil(meta.h / SLICE)
  const pad = Math.max(2, String(n - 1).length)
  console.log(`原图 ${meta.w}×${meta.h}px → ${n} 片（每片 ${SLICE}px，缩放 ${SCALE}）`)
  let bytes = 0
  for (let i = 0; i < n; i++) {
    const y = i * SLICE, hh = Math.min(SLICE, meta.h - y)
    const dataUrl = await page.evaluate(async ({ y, hh, SCALE }) => {
      const im = document.querySelector('img')
      const c = document.createElement('canvas')
      c.width = Math.round(im.naturalWidth * SCALE); c.height = Math.round(hh * SCALE)
      const g = c.getContext('2d')
      g.drawImage(im, 0, y, im.naturalWidth, hh, 0, 0, c.width, c.height)
      return c.toDataURL('image/jpeg', 0.92)                     // 分片导出，内存才扛得住
    }, { y, hh, SCALE })
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
    fs.writeFileSync(path.join(outDir, `slice-${String(i).padStart(pad, '0')}.jpg`), buf)
    bytes += buf.length
  }
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({
    url, w: meta.w, h: meta.h, slice: SLICE, scale: SCALE, n,
    cdp: CDP, shot_at: new Date().toISOString(), bytes,
  }, null, 1))
  console.log(`写好 ${n} 片 → ${outDir}（共 ${(bytes / 1048576).toFixed(1)} MB）`)
  // 拼回整图：image2 序列是一个流，vstack 要的是 n 个输入 —— 必须逐个 -i 列出来
  const ins = Array.from({ length: n }, (_, i) => `-i ${path.join(outDir, `slice-${String(i).padStart(pad, '0')}.jpg`)}`).join(' ')
  console.log(`拼回整图：\n  ffmpeg ${ins} -filter_complex vstack=inputs=${n} ${path.join(outDir, 'full.png')}`)
} catch (e) {
  console.error(`取图失败：${e.message}`)
  bye(); process.exit(1)
}
bye()
