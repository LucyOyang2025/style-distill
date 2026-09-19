/** 在模版长截图上量「文字行」：逐行墨量 → 行段 → 行高，换算成 1440 视口的 CSS px */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const src = process.argv[2]
const Y0 = +(process.argv[3] || 0)
const Y1 = +(process.argv[4] || 99999)
const W = 2000
const raw = '/tmp/weave-px3.raw'
execFileSync('/Users/michelleoyang/.local/bin/ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${W}:-1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw])
const buf = fs.readFileSync(raw)
const H = Math.round(buf.length / 3 / W)
const CSS = 1440 / W                            // 图像 px → CSS px
const luma = (x, y) => { const i = (y * W + x) * 3; return (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255 }
const x0 = Math.round(W * 0.083), x1 = Math.round(W * (1 - 0.083))
const lines = []
let cur = null
for (let y = Y0; y < Math.min(Y1, H); y++) {
  let ink = 0
  for (let x = x0; x < x1; x += 2) if (luma(x, y) < 0.62) ink++
  const has = ink > 3
  if (has && !cur) cur = { a: y }
  else if (!has && cur) { cur.b = y; cur.h = y - cur.a; if (cur.h > 4) lines.push(cur); cur = null }
}
if (cur) lines.push({ ...cur, b: H, h: H - cur.a })
console.log('区域 CSS y =', (Y0 * CSS).toFixed(0), '–', (Y1 * CSS).toFixed(0), ' · 行段数', lines.length)
console.log('行高(CSS px) 分布：')
const hist = new Map()
for (const l of lines) hist.set(l.h, (hist.get(l.h) || 0) + 1)
const sorted = [...lines].sort((a, b) => b.h - a.h)
console.log('最高的 12 行：', sorted.slice(0, 12).map((l) => `${(l.h * CSS).toFixed(0)}px@y${(l.a * CSS).toFixed(0)}`).join(' , '))
console.log('常见行高：', [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h, c]) => `${(h * CSS).toFixed(0)}px×${c}`).join(' , '))
