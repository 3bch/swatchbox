#!/bin/bash

set -euo pipefail

# このスクリプトの親ディレクトリを取得
dir="$(dirname "$(realpath "$0")")"

# 存在しない場合は事前に作成することで root 化するのを回避する
if [ ! -d "${dir}/claude/.claude" ]; then
  mkdir -p "${dir}/claude/.claude"
fi

# 存在しない場合は事前に作成することで root 化 & ディレクトリ化するのを回避する
if [ ! -f "${dir}/claude/.claude.json" ]; then
  echo '{}' > "${dir}/claude/.claude.json"
fi

# playwright-cli の一時出力（スナップショット・ログ・スクリーンショット）を破棄する
rm -rf "$(dirname "${dir}")/.playwright-cli"
