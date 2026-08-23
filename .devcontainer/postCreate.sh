#!/bin/bash

set -euo pipefail

git config pull.ff only

mise trust --yes
mise install --yes

mise exec -- pnpm install

# ブラウザバイナリの取得と Claude Code 向け skill の導入をおこなう
mise exec -- playwright-cli install-browser chromium
mise exec -- playwright-cli install --skills
