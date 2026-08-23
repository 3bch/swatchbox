# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/base:trixie@sha256:025b74bb5f7ac53edd77e01aa7188c359aab100e23a2f6220bde50bbb9fd31dd

# playwright chromium の実行に必要な共有ライブラリとフォントをインストール
RUN bash -euo pipefail -s <<'EOF'
  export DEBIAN_FRONTEND=noninteractive

  apt-get update
  apt-get install -y --no-install-recommends \
    libasound2t64 \
    libatk-bridge2.0-0t64 \
    libatk1.0-0t64 \
    libatspi2.0-0t64 \
    libcairo2 \
    libcups2t64 \
    libdbus-1-3 \
    libgbm1 \
    libglib2.0-0t64 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    fonts-liberation \
    fonts-noto-cjk

  rm -rf /var/lib/apt/lists/*
EOF

# 各種ボリュームのマウント先の所有者が vscode となるよう事前に作成しておく
RUN bash -euo pipefail -s <<'EOF'
  mkdir -p /home/vscode/.local/share/mise
  chown -R vscode:vscode /home/vscode/.local

  mkdir -p /home/vscode/.cache/mise
  mkdir -p /home/vscode/.cache/ms-playwright
  chown -R vscode:vscode /home/vscode/.cache
EOF

USER vscode
