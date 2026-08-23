#!/usr/bin/env bash
# Claude Code status line for swatchbox
# 表示形式: {MODEL} ({EFFORT}) | Context: n%
#   - EFFORT 非対応のモデルでは () ごと省略
#   - コンテキスト使用率が取れない場合は "| Context: n%" ごと省略
#   - 使用率が 20% を超えたら橙色
#
# stdin にステータスライン用の JSON ペイロードが渡される。
# 参照: https://docs.claude.com/en/docs/claude-code/statusline
set -euo pipefail

input="$(cat)"

# .model.display_name / .effort.level / .context_window.used_percentage を一度に取り出す。
# effort はモデルが effort に対応している場合のみペイロードに含まれるため、
# 対応していないモデルでは effort 自体を表示しない。
model=""; effort=""; pct=""
{ IFS= read -r model || :; IFS= read -r effort || :; IFS= read -r pct || :; } <<EOF
$(printf '%s' "$input" | jq -r '[
  (.model.display_name // "unknown"),
  (.effort.level // ""),
  (.context_window.used_percentage // "")
] | .[]')
EOF

RESET=$'\033[0m'
ORANGE=$'\033[38;5;208m'

line="$model"
[ -n "$effort" ] && line="$line ($effort)"

if [ -n "$pct" ]; then
  if [ "$pct" -gt 20 ]; then
    line="$line | Context: ${ORANGE}${pct}%${RESET}"
  else
    line="$line | Context: ${pct}%"
  fi
fi

printf '%s\n' "$line"
