/** 量模版长截图的版心边距与区块分布：内容左右边界、深色带起止、卡片圆角尺寸感 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const src = process.argv[2]
const W = 1000
const raw = '/tmp/weave-px2.raw'
execFileSync('/Users/michelleoyang/.local/bin/ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${W}:-1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw])
const buf = fs.readFileSync(raw)
const n = buf.length / 3
const H = Math.round(n / W)
const at = (x, y) => { const i = (y * W + x) * 3; return [buf[i], buf[i + 1], buf[i + 2]] }
const luma = (x, y) => { const [r, g, b] = at(x, y); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 }
const isBg = (x, y) => { const l = luma(x, y); const [r, g, b] = at(x, y); return l > 0.88 && Math.max(r, g, b) - Math.min(r, g, b) < 20 }

// 1) 逐行：内容左右边界（取 1% 与 99% 分位的非背景像素）
let rows = []
for (let y = 0; y < H; y += 4) {
  let left = -1, right = -1, ink = 0
  for (let x = 0; x < W; x++) if (!isBg(x, y)) { if (left < 0) left = x; right = x; ink++ }
  rows.push({ y, left, right, ink: ink / W })
}
const withContent = rows.filter((r) => r.ink > 0.02 && r.left >= 0)
const lefts = withContent.map((r) => r.left).sort((a, b) => a - b)
const rights = withContent.map((r) => r.right).sort((a, b) => a - b)
const q = (arr, p) => arr[Math.floor(arr.length * p)]
console.log('有内容的行数', withContent.length, '/', rows.length)
console.log('左边界 中位', q(lefts, 0.5), '5%', q(lefts, 0.05), '95%', q(lefts, 0.95))
console.log('右边界 中位', q(rights, 0.5), '5%', q(rights, 0.05), '95%', q(rights, 0.95))

// 2) 深色带（页面底色段）：整行均值 < 0.25 视为深色带
const bands = []
let cur = null
for (const r of rows) {
  const avg = (() => { let s = 0; for (let x = 0; x < W; x += 10) s += luma(x, r.y); return s / (W / 10) })()
  const dark = avg < 0.25
  if (dark && !cur) cur = { a: r.y }
  else if (!dark && cur) { cur.b = r.y; bands.push(cur); cur = null }
}
if (cur) { cur.b = H; bands.push(cur) }
console.log('深色带（整行均值<0.25）：', bands.map((b) => `${(b.a / H * 100).toFixed(1)}%–${(b.b / H * 100).toFixed(1)}%`).join('  '))

// 3) 底部深色区里的「巨字」高度：量最深文字行跨的行程
const lastDark = bands[bands.length - 1]
if (lastDark) console.log('最后一条深色带起止(px)', lastDark.a, lastDark.b, '高', lastDark.b - lastDark.a)
console.log('图片总高', H, '宽', W, '（原始 2000×10969）')
