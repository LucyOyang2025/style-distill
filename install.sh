#!/usr/bin/env bash
# style-distill · one-line installer
#
#   curl -fsSL https://raw.githubusercontent.com/LucyOyang2025/style-distill/main/install.sh \
#     | bash -s -- [目标目录]
#
# 目标目录默认 ./style-distill；通常就是你 agent 的 skills 目录，例如
#   <your-agent>/agent_state/skills/style-distill
#
# 只做三件事：下载 → 解包到目标目录 → 体检（文件齐不齐、node 在不在）。
# 不装任何全局包、不动目标目录以外的东西、不覆盖非空目录。

set -euo pipefail

REPO="${STYLE_DISTILL_REPO:-LucyOyang2025/style-distill}"
REF="${STYLE_DISTILL_REF:-main}"
TARGET="${1:-./style-distill}"

say() { printf '%s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "需要 curl"
command -v tar  >/dev/null 2>&1 || die "需要 tar"

if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null || true)" ]; then
  die "目标目录已存在且非空：$TARGET（先移走它，或换一个路径）"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "→ 从 $REPO@$REF 下载"
curl -fsSL \
  -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$REPO/tarball/$REF" \
  | tar -xz -C "$TMP"

SRC="$(find "$TMP" -maxdepth 1 -mindepth 1 -type d | head -1)"
[ -n "$SRC" ] || die "解包失败"
mkdir -p "$TARGET"
cp -R "$SRC"/. "$TARGET"/

say "→ 安装到 $TARGET"

# 体检
missing=0
for f in SKILL.md README.md INSTALL.md LICENSE scripts/dna-probe.mjs scripts/mint-skill.mjs references/style-dna.md; do
  [ -e "$TARGET/$f" ] || { say "  ✗ 缺 $f"; missing=1; }
done
[ "$missing" -eq 0 ] && say "  ✓ SKILL.md、脚本与 references 都在"

if command -v node >/dev/null 2>&1; then
  say "  ✓ node $(node --version)"
  case "$(node --version)" in
    v1[0-7].*|v[0-9].*) say "  ! 建议 node 18 或更新（量活体页面要用）" ;;
  esac
else
  say "  ! 没找到 node —— 量活体网页需要 node 18+；只读 SKILL.md 的话不需要"
fi

say ""
say "下一步："
say "  1) 告诉你的 agent：「用这条模版链接 <链接> 的风格帮我出一份 PDF，内容在这儿，中文。」"
say "  2) 量活体页面再装一次 playwright-core：npm i -g playwright-core"
say "  3) 细节看 $TARGET/INSTALL.md"
