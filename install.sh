#!/usr/bin/env bash
# 安装本地编辑器 skill。用法：./install.sh [skills目录] [--force] [--dry-run]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${HOME}/.pi/agent/skills"
FORCE=0; DRY=0; TARGET_SET=0
for arg in "$@"; do
  case "$arg" in
    -f|--force) FORCE=1 ;;
    -n|--dry-run) DRY=1 ;;
    -h|--help) head -2 "$0"; exit 0 ;;
    -*) echo "未知参数: $arg" >&2; exit 1 ;;
    *) [ "$TARGET_SET" = 0 ] || { echo '只能提供一个目标目录' >&2; exit 1; }; TARGET="$arg"; TARGET_SET=1 ;;
  esac
done
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12))process.exit(1)' || { echo '需要 Node 22.12+' >&2; exit 1; }
mkdir -p "$TARGET"; TARGET="$(cd "$TARGET" && pwd)"
NAME="$(node -p "require('$ROOT/package.json').name")"; DEST="$TARGET/$NAME"
case "$DEST" in "$ROOT"|"$ROOT"/*) echo '不能安装进源仓库' >&2; exit 1 ;; esac
if [ -e "$DEST" ] && [ "$FORCE" != 1 ]; then echo "已存在 ${DEST}；需要显式 --force，不改动已有安装"; exit 1; fi
ITEMS=(modules references scripts/editor.mjs package.json package-lock.json vite.config.mjs SKILL.md README.md install.sh)
if [ "$DRY" = 1 ]; then printf '将复制并 npm ci/build 到 %s\n' "$DEST"; printf '  %s\n' "${ITEMS[@]}"; exit 0; fi
STAGE="$(mktemp -d "$TARGET/.${NAME}.new.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
for item in "${ITEMS[@]}"; do
  mkdir -p "$(dirname "$STAGE/$item")"
  cp -R "$ROOT/$item" "$STAGE/$item"
done
(cd "$STAGE" && npm ci --include=dev && npm run build)
BACKUP=''
if [ -e "$DEST" ]; then BACKUP="$DEST.backup.$(date +%Y%m%d-%H%M%S)"; mv "$DEST" "$BACKUP"; fi
if ! mv "$STAGE" "$DEST"; then [ -z "$BACKUP" ] || mv "$BACKUP" "$DEST"; exit 1; fi
trap - EXIT
printf '已安装: %s\n启动: cd "%s" && npm start -- --project <持久项目目录> --md <文章.md> --open\n' "$DEST" "$DEST"
[ -z "$BACKUP" ] || printf '旧安装备份保留: %s\n' "$BACKUP"
