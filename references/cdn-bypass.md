# 反爬 / 403 的源怎么取（借浏览器上下文 + 切片全页图）

源站被 Cloudflare / CDN 拦着（`curl` 403），但**真人浏览器打开正常**时，走这套。实测可用：`scripts/grab-cdn.mjs`。

## A · 判定与侦察

| 现象 | 结论 | 动作 |
| --- | --- | --- |
| `curl -I` 目标站 → **403**，响应头有 `server: cloudflare` | 反爬，**不是站点挂了** | 继续下面几条，别急着重试 curl |
| 真人浏览器打开**正常** | 403 是「**无 cookie / 无 UA / 无 referer / TLS 指纹不对**」造成的 | **借人已登录的浏览器上下文**，比伪造 header 稳 |
| curl 换 UA / referer 后**偶尔** 200 | 撞运气，明天就失效 | 不靠它；只用它做佐证 |

```bash
curl -sI https://目标站 | head -3          # 看状态码与 server 头
curl -sI -A "Mozilla/5.0 ..." https://目标站 | head -1   # 只作参考，不作依赖
```

**为什么不伪造 header**：CDN 的判据是 TLS 指纹 + cookie + JS 挑战的组合，header 只占一角；浏览器自己带的是全套，一次就过。

## B · 借浏览器上下文（macOS / Chrome，不打断用户正在用的浏览器）

关键：**复制登录态到临时 profile**，再用**独立端口 + 独立 user-data-dir** 起第二个 Chrome。用户那个浏览器不动、不用关。

| 步 | 做什么 | 命令 / 说明 |
| --- | --- | --- |
| 1 | 建临时 profile 目录 | `mkdir -p /tmp/<name>-profile` |
| 2 | 复制登录态文件 | 见下表，源目录 `~/Library/Application Support/Google/Chrome` |
| 3 | 起第二个 Chrome | 独立端口 9336 + 独立 user-data-dir，`about:blank` 起 |
| 4 | 连上去 | `chromium.connectOverCDP('http://127.0.0.1:9336')` → `b.contexts()[0].newPage()` |
| 5 | **收工清场** | 关掉这个 Chrome + 删掉临时 profile（`rm -f` 逐文件 + `rmdir`，不用 `rm -rf`） |

要拿的登录态文件（**缺 cookie 就等于白借**）：

| 路径 | 为什么要 |
| --- | --- |
| `Local State` | 加密密钥等全局状态，缺了 cookie 解不开 |
| `Cookies` | 老的 cookie 库位置 |
| `Network/Cookies` | **新版的真正 cookie 库**（macOS 上这两处**都要拿**：本机实测只有 `Default/Cookies`，新版 Chrome 会在 `Default/Network/` 下；两个都试，存在的才拿） |
| `Preferences` | 站点偏好 / 语言 / 地区 |
| `Local Storage/` | localStorage 里的 token |
| `Session Storage/` | 会话级凭据 |

```bash
SRC="$HOME/Library/Application Support/Google/Chrome"
DST=/tmp/<name>-profile
mkdir -p "$DST/Default/Network"
cp "$SRC/Local State" "$DST/" 2>/dev/null
cp "$SRC/Default/Cookies" "$DST/Default/" 2>/dev/null
cp "$SRC/Default/Network/Cookies" "$DST/Default/Network/" 2>/dev/null   # 新版真正的位置
cp "$SRC/Default/Preferences" "$DST/Default/" 2>/dev/null
cp -R "$SRC/Default/Local Storage" "$DST/Default/" 2>/dev/null
cp -R "$SRC/Default/Session Storage" "$DST/Default/" 2>/dev/null

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9336 --user-data-dir=/tmp/<name>-profile \
  --no-first-run --no-default-browser-check about:blank
```

- **端口被占就换**（9337、9338…），别抢别人的端口；脚本侧 `CDP=http://127.0.0.1:9337` 覆盖。
- **Chrome 不在 `/Applications`** 时用实际路径（本机实测在 `/Users/michelleoyang/Desktop/Google Chrome.app`），或 `mdfind "kMDItemCFBundleIdentifier == 'com.google.Chrome'"` 定位。
- 借来的是**用户本人可见**的页面；付费墙、批量抓取不借（见 E）。

## C · 从条目页拿真站域名（这条最值钱）

设计聚合站（如 land-book）常见这么一套：**条目页本身 403**，页里给的是**代管截图**；而**那张截图的文件名就是真站域名**。

| 现象 | 推断 |
| --- | --- |
| 条目页给的是聚合站 CDN 上的 `.jpg`（不是真站截图接口） | 站点自己代管了截图 |
| 文件名形如 `<hash>-<域名用-连起来>-framer-website.jpg` | 去掉 hash 前缀与后缀，就是真站域名的词 |
| 真站往往**能直连**（200） | **指纹从真站量**，不从聚合站量（聚合站量到的是它的壳） |

取证命令序列（条目页 403，所以第 1 步也要借同一个浏览器上下文）：

```bash
# 1) 借浏览器打开条目页，取页内截图 URL（curl 拿不到 HTML）
#    node -e '…connectOverCDP…page.goto(条目页)…page.$$eval("img",e=>e.map(x=>x.src))'
SHOT="https://cdn.<聚合站>/.../90339/49f72a731343535e-td-lovera-framer-website.jpg"
# 2) 解析文件名 → 去掉 hash 前缀与扩展名
BASE=$(basename "$SHOT" .jpg | sed -E 's/^[0-9a-f]+-//')      # → td-lovera-framer-website
# 3) 拼真站 URL 并验 200
curl -sI "https://$BASE/" | head -1                            # → HTTP/2 200
```

真站 200 → 直接用 `dna-probe.mjs` 量真站（`--shot` 全页截图），**别量聚合站的截图**；真站也 403 → 回 B 借上下文，再走 D 取长图。

## D · 取全页长图（核心机制）

手段对比（前三条都试过，都不行）：

| 手段 | 结果 |
| --- | --- |
| `curl` 直连 CDN 图片 URL | **403** |
| 页内 `fetch(imgUrl)` 拿 blob | 被 **CSP / CORS** 拦 |
| `element.screenshot()` / `page.screenshot({fullPage:true})` | 视口外的部分拍成**空白**，长图尤其明显（实测踩过） |
| **`page.goto(imgUrl)` 顶层文档 + canvas 分片** | ✅ 一次过 |

机制三步：

1. **把图片 URL 当顶层文档打开** —— `page.goto(imgUrl)`：cookie / referer / UA / TLS 指纹全由浏览器自己带，**一步过 403 与 CSP，不需要伪造任何 header**。
2. **页内建 `<canvas>` 分片** —— 按 `SLICE`（默认 1400px）高 `drawImage` → `toDataURL('image/jpeg', 0.92)`，Node 侧 base64 落盘。整页长图（如 2000×19656）**必须切片**，一次性 canvas 会爆内存。
3. **拼回整图** + 写 `meta.json` 留痕。

```bash
S=<agent_state>/skills/style-distill/scripts
node $S/grab-cdn.mjs "<图片URL>" ./out                 # 默认切片 1400px、缩放 1
node $S/grab-cdn.mjs "<图片URL>" ./out --slice 1400 --scale 1
CDP=http://127.0.0.1:9337 node $S/grab-cdn.mjs "<图片URL>" ./out

# 拼回整图：image2 序列是"一个流"，vstack 要的是 N 个输入 —— 必须逐个 -i 列出来
ffmpeg -i out/slice-00.jpg -i out/slice-01.jpg -i out/slice-02.jpg \
       -filter_complex vstack=inputs=3 out/full.png
```

`meta.json` 字段：`url`（原图 URL）· `w` / `h`（原图尺寸）· `slice`（切片高）· `scale`（缩放）· `n`（片数）· `cdp`（端点）· `shot_at` · `bytes`。

失败模式与对策：

| 现象 | 原因 | 对策 |
| --- | --- | --- |
| 报「页内没有 img」并退 1 | 顶层文档不是图片（错误页 / HTML 挑战页） | 换真站直连的图片 URL；借上下文重试 |
| `naturalWidth=0` | 图没加载完 | 脚本等 `onload`（上限 30s）再量；仍为 0 就报错退出 |
| 连不上 CDP 端点 | 第二个 Chrome 没起 / 端口变了 | 按 B 起 Chrome，或 `CDP=` 指到实际端口 |
| 找不到 playwright-core | 本技能不带 node_modules | `npm i -g playwright-core`，或 `PH_PLAYWRIGHT_CORE=<目录>` |
| 切片拼不齐 | `vstack` 少列了 `-i` | 按输出提示原样复制那条 ffmpeg 命令 |

## E · 注意与红线

- 只取**风格证据**（截图 / 色值 / 字号 / 间距），**不搬运**源的文案与图片当成品素材（见 SKILL.md「反抄袭红线」）。
- 借登录态只用于**用户本人可见**的页面；**不用它绕付费墙、不做批量抓取**，不跑并发轰炸。
- **全程留痕**：原图 URL、尺寸、切片数、时间写进 `meta.json`，源 URL 写进指纹报告，便于复核。
- 临时 profile 与第二个 Chrome 用完即清（`rm -f` + `rmdir`）；**登录态副本不许留在 `/tmp` 过夜**，不许拷出本机。
- 抓不到就**如实说**，改走「截图 + 视觉模型读图」，并把测不准的字段标 `unverified`（SKILL.md「环境」一节同款纪律）。
