#!/usr/bin/env bash
# コミットメッセージに AI エージェントの利用量トレーラーを付与する。
#
# ccusage が返すセッション累計と、同一セッションの直近コミットに記録された累計との
# 差分をとることで、そのコミットに費やした分を概算する。差分計算用の状態ファイルを
# 持たずに済むよう、基準となる累計はトレーラー自身に埋め込む。
#   - 通常のコミットは HEAD、amend は HEAD~1 から遡って基準を探す
#     （amend では対象コミットに計上済みの分も含めて再計算されるため二重計上にならない）
#   - 別セッションのコミットが間に挟まっていても、同一セッション ID を持つ
#     直近のコミットまで遡るため差分の基準を見失わない
#   - 基準が見つからない場合は、引き算せず現在のセッション累計をそのまま計上する
#   - ccusage session は --id と --sections を併用できないため、
#     全セッションを取得したうえで現在のセッション ID で絞り込む
#
# 付帯情報の付与であり、失敗してもコミット自体は妨げない（常に正常終了する）。
#
# 引数は prepare-commit-msg フックのもの。
# 参照: https://git-scm.com/docs/githooks#_prepare_commit_msg
set -euo pipefail

msg_file="${1:-}"
commit_source="${2:-}"
commit_sha="${3:-}"

# エージェント経由でない（人が手で打った）コミットには付与しない。
if [ -z "${CLAUDE_CODE_SESSION_ID:-}" ] || [ ! -f "$msg_file" ]; then
  exit 0
fi

# ccusage は mise で管理しているため mise 経由で起動する。
command -v mise >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

session_id="$CLAUDE_CODE_SESSION_ID"

# 第 2 引数が commit かつ第 3 引数にコミットが指定されている場合が amend（および -c/-C）。
# 書き換え対象のコミット自身は基準にできないため、その親から遡る。
if [ "$commit_source" = 'commit' ] && [ -n "$commit_sha" ]; then
  base_ref='HEAD~1'
else
  base_ref='HEAD'
fi
git rev-parse --verify --quiet "$base_ref" >/dev/null || base_ref=''

# 同一セッションの直近コミットを基準にする。見つからなければ差し引かない。
base_cost=0; base_input=0; base_output=0; base_cache_creation=0; base_cache_read=0
if [ -n "$base_ref" ]; then
  base_commit="$(git log "$base_ref" -n 1 --format='%H' \
    --grep="^Agent-Session-Id: ${session_id}$" || true)"
  if [ -n "$base_commit" ]; then
    read_trailer() {
      git log "$base_commit" -n 1 --format="%(trailers:key=$1,valueonly)" | head -1
    }
    base_cost="$(read_trailer 'Agent-Session-Estimated-Cost-USD')"
    base_input="$(read_trailer 'Agent-Session-Tokens-Input')"
    base_output="$(read_trailer 'Agent-Session-Tokens-Output')"
    base_cache_creation="$(read_trailer 'Agent-Session-Tokens-Cache-Creation')"
    base_cache_read="$(read_trailer 'Agent-Session-Tokens-Cache-Read')"
  fi
fi

usage_json="$(mise exec -- ccusage session --sections session --json 2>/dev/null || true)"
if [ -z "$usage_json" ]; then
  exit 0
fi

# セッション累計と、基準との差分をまとめて算出する。
# 値は「モデル 累計コスト コスト差分 累計入力 入力差分 ...」の順に 1 行ずつ出力する。
values="$(printf '%s' "$usage_json" | jq -r \
  --arg id "$session_id" \
  --argjson base_cost "${base_cost:-0}" \
  --argjson base_input "${base_input:-0}" \
  --argjson base_output "${base_output:-0}" \
  --argjson base_cache_creation "${base_cache_creation:-0}" \
  --argjson base_cache_read "${base_cache_read:-0}" '
  # 浮動小数点の誤差が桁あふれしないよう、コストは小数 6 桁に丸める。
  def round6: . * 1000000 | round / 1000000;
  # 前回値が現在値を上回る異常時は 0 に丸める。
  def diff($total; $base): if $total - $base > 0 then $total - $base else 0 end;

  .session[] | select(.period == $id) |
  ((.totalCost // 0) | round6) as $cost |
  (.inputTokens // 0) as $input |
  (.outputTokens // 0) as $output |
  (.cacheCreationTokens // 0) as $cache_creation |
  (.cacheReadTokens // 0) as $cache_read |
  [
    (.modelsUsed // [] | join(",")),
    ($cost | tostring), (diff($cost; $base_cost) | round6 | tostring),
    ($input | tostring), (diff($input; $base_input) | tostring),
    ($output | tostring), (diff($output; $base_output) | tostring),
    ($cache_creation | tostring), (diff($cache_creation; $base_cache_creation) | tostring),
    ($cache_read | tostring), (diff($cache_read; $base_cache_read) | tostring)
  ] | .[]' 2>/dev/null || true)"

if [ -z "$values" ]; then
  exit 0
fi

model=''
session_cost=''; commit_cost=''
session_input=''; commit_input=''
session_output=''; commit_output=''
session_cache_creation=''; commit_cache_creation=''
session_cache_read=''; commit_cache_read=''
{
  IFS= read -r model || :
  IFS= read -r session_cost || :; IFS= read -r commit_cost || :
  IFS= read -r session_input || :; IFS= read -r commit_input || :
  IFS= read -r session_output || :; IFS= read -r commit_output || :
  IFS= read -r session_cache_creation || :; IFS= read -r commit_cache_creation || :
  IFS= read -r session_cache_read || :; IFS= read -r commit_cache_read || :
} <<EOF
$values
EOF

# --if-exists replace により amend でも既存トレーラーが二重にならない。
# ただし git はキー名を前方一致で比較するため、あるキーが別のキーの接頭辞に
# なってはならない（例: Agent-Session は Agent-Session-Tokens-Input と衝突して
# 相互に上書きされる）。キーを追加する際は接頭辞の重複に注意すること。
git interpret-trailers --in-place --if-exists replace \
  --trailer "Agent-Model: ${model:-unknown}" \
  --trailer "Agent-Effort: ${CLAUDE_EFFORT:-unknown}" \
  --trailer "Agent-Commit-Estimated-Cost-USD: $commit_cost" \
  --trailer "Agent-Commit-Tokens-Input: $commit_input" \
  --trailer "Agent-Commit-Tokens-Output: $commit_output" \
  --trailer "Agent-Commit-Tokens-Cache-Creation: $commit_cache_creation" \
  --trailer "Agent-Commit-Tokens-Cache-Read: $commit_cache_read" \
  --trailer "Agent-Session-Id: $session_id" \
  --trailer "Agent-Session-Estimated-Cost-USD: $session_cost" \
  --trailer "Agent-Session-Tokens-Input: $session_input" \
  --trailer "Agent-Session-Tokens-Output: $session_output" \
  --trailer "Agent-Session-Tokens-Cache-Creation: $session_cache_creation" \
  --trailer "Agent-Session-Tokens-Cache-Read: $session_cache_read" \
  "$msg_file"
