# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/base:trixie@sha256:025b74bb5f7ac53edd77e01aa7188c359aab100e23a2f6220bde50bbb9fd31dd

# 各種ボリュームのマウント先の所有者が vscode となるよう事前に作成しておく
RUN bash -euo pipefail -s <<'EOF'
  mkdir -p /home/vscode/.local/share/mise
  chown -R vscode:vscode /home/vscode/.local

  mkdir -p /home/vscode/.cache/mise
  mkdir -p /home/vscode/.cache/ms-playwright
  chown -R vscode:vscode /home/vscode/.cache
EOF

USER vscode
