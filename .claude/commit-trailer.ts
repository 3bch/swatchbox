#!/usr/bin/env node
// コミットメッセージに AI エージェントの利用量トレーラーを付与する。
//
// ccusage が返すセッション累計と、同一セッションの直近コミットに記録された累計との
// 差分をとることで、そのコミットに費やした分を概算する。差分計算用の状態ファイルを
// 持たずに済むよう、基準となる累計はトレーラー自身に埋め込む。
//   - 通常のコミットは HEAD、amend は HEAD~1 から遡って基準を探す
//     （amend では対象コミットに計上済みの分も含めて再計算されるため二重計上にならない）
//   - 別セッションのコミットが間に挟まっていても、同一セッション ID を持つ
//     直近のコミットまで遡るため差分の基準を見失わない
//   - マージコミットではマージ元の履歴も探索対象に加える。フックが走る時点の HEAD には
//     マージ元がまだ含まれておらず、同一セッション中にブランチを切って作業していた場合、
//     HEAD だけを見ると基準を見失って計上済みの分を二重に数えてしまうため
//     （fast-forward マージはコミットを作らないためフック自体が呼ばれない）
//   - 遡る範囲は直近 30 日に限る。セッションがそれ以上生き延びることはないため
//     取りこぼしはなく、基準が存在しないセッション初回のコミットで
//     全履歴を走査してしまうのを避けられる
//   - 基準が見つからない場合は、引き算せず現在のセッション累計をそのまま計上する
//
// ccusage session は --id を指定するとリクエスト単位の内訳（entries）を返すため、
// セッション累計とコンテキスト量の両方をこの 1 回の呼び出しでまかなえる。
//   - 累計の入出力・キャッシュトークンは entries の合計として算出する
//     （--sections で ccusage 自身に集計させた値と一致することは確認済み。
//     --id と --sections は併用できず、両方呼ぶと 1 秒以上余分にかかる）
//   - コンテキスト量は最新 entry の入力系トークンの和。これはコミット時点の
//     スナップショットであり累積値ではないため、差分はとらない
//   - モデル名も同じく最新 entry のものを使う。セッション途中でモデルを
//     切り替えた場合に全モデルが並ぶのを避け、コミット時点の実態を残す
//     （モデル名を示す環境変数は Claude Code から渡されない）
//   - 該当セッションが見つからない場合、ccusage は正常終了して null を返す
//
// 付帯情報の付与であり、失敗してもコミット自体は妨げない（常に正常終了する）。
//
// 引数は prepare-commit-msg フックのもの。
// 参照: https://git-scm.com/docs/githooks#_prepare_commit_msg
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

/** リクエスト単位の利用量（ccusage session --id が返す entries の要素） */
type Entry = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

/** セッションの利用量。該当するセッションがなければ null が返る */
type Usage = { totalCost: number; entries: Entry[] } | null;

/** 累計と差分の組。トレーラーには両方を記録する */
type Amount = { session: number; commit: number };

/** 外部コマンドを実行して標準出力を返す */
const run = (command: string, args: string[]): string =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

// 存在しない参照を問い合わせたときの非ゼロ終了は異常ではなく分岐の材料なので、
// 例外にせず空文字に変換する。
/** 実行した git コマンドの標準出力を返す */
const git = (...args: string[]): string => {
  try {
    return run("git", args);
  } catch {
    return "";
  }
};

/** 浮動小数点の誤差が桁あふれしないよう、コストを小数 6 桁に丸める */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/** 差分をとる。前回値が現在値を上回る異常時は 0 に丸める */
const diff = (total: number, base: number): number => (total - base > 0 ? total - base : 0);

/** コミットメッセージにトレーラーを付与する */
const main = (): void => {
  const [msgFile, commitSource = "", commitSha = ""] = process.argv.slice(2);
  const sessionId = process.env["CLAUDE_CODE_SESSION_ID"] ?? "";

  // エージェント経由でない（人が手で打った）コミットには付与しない。
  if (sessionId === "" || msgFile === undefined || !existsSync(msgFile)) return;

  // 第 2 引数が commit かつ第 3 引数にコミットが指定されている場合が amend（および -c/-C）。
  // 書き換え対象のコミット自身は基準にできないため、その親から遡る。
  const head = commitSource === "commit" && commitSha !== "" ? "HEAD~1" : "HEAD";
  const baseRefs = [
    ...(git("rev-parse", "--verify", "--quiet", head) === "" ? [] : [head]),
    // マージの最中はマージ元の履歴も探索対象に加える。
    ...(commitSource === "merge" && git("rev-parse", "--verify", "--quiet", "MERGE_HEAD") !== ""
      ? ["MERGE_HEAD"]
      : []),
  ];

  // 同一セッションの直近コミットを基準にする。見つからなければ差し引かない。
  const baseCommit =
    baseRefs.length === 0
      ? ""
      : git(
          "log",
          ...baseRefs,
          "-n",
          "1",
          "--format=%H",
          "--since=30 days ago",
          `--grep=^Agent-Session-Id: ${sessionId}$`,
        );
  const base = (key: string): number =>
    baseCommit === ""
      ? 0
      : Number(
          git("log", baseCommit, "-n", "1", `--format=%(trailers:key=${key},valueonly)`).split(
            "\n",
          )[0],
        ) || 0;

  // ccusage は mise で管理しているため mise 経由で起動する。
  const usage: Usage = JSON.parse(
    run("mise", ["exec", "--", "ccusage", "session", "--id", sessionId, "--json"]),
  );
  const entries = usage?.entries ?? [];
  const latest = entries.at(-1);
  if (latest === undefined) return;

  const sum = (key: keyof Omit<Entry, "model">): number =>
    entries.reduce((acc, e) => acc + (e[key] || 0), 0);
  const amount = (total: number, baseKey: string): Amount => ({
    session: total,
    commit: diff(total, base(baseKey)),
  });

  const cost = amount(round6(usage?.totalCost ?? 0), "Agent-Session-Estimated-Cost-USD");
  const input = amount(sum("inputTokens"), "Agent-Session-Tokens-Input");
  const output = amount(sum("outputTokens"), "Agent-Session-Tokens-Output");
  const cacheCreation = amount(sum("cacheCreationTokens"), "Agent-Session-Tokens-Cache-Creation");
  const cacheRead = amount(sum("cacheReadTokens"), "Agent-Session-Tokens-Cache-Read");

  // コンテキスト量は最新リクエストが読み込んだ入力系トークンの総和。
  const context =
    (latest.inputTokens || 0) + (latest.cacheCreationTokens || 0) + (latest.cacheReadTokens || 0);

  // --if-exists replace により amend でも既存トレーラーが二重にならない。
  // ただし git はキー名を前方一致で比較するため、あるキーが別のキーの接頭辞に
  // なってはならない（例: Agent-Session は Agent-Session-Tokens-Input と衝突して
  // 相互に上書きされる）。キーを追加する際は接頭辞の重複に注意すること。
  const trailers: Record<string, string | number> = {
    "Agent-Model": latest.model || "unknown",
    "Agent-Effort": process.env["CLAUDE_EFFORT"] ?? "unknown",
    "Agent-Context-Tokens": context,
    "Agent-Commit-Estimated-Cost-USD": round6(cost.commit),
    "Agent-Commit-Tokens-Input": input.commit,
    "Agent-Commit-Tokens-Output": output.commit,
    "Agent-Commit-Tokens-Cache-Creation": cacheCreation.commit,
    "Agent-Commit-Tokens-Cache-Read": cacheRead.commit,
    "Agent-Session-Id": sessionId,
    "Agent-Session-Estimated-Cost-USD": cost.session,
    "Agent-Session-Tokens-Input": input.session,
    "Agent-Session-Tokens-Output": output.session,
    "Agent-Session-Tokens-Cache-Creation": cacheCreation.session,
    "Agent-Session-Tokens-Cache-Read": cacheRead.session,
  };

  git(
    "interpret-trailers",
    "--in-place",
    "--if-exists",
    "replace",
    ...Object.entries(trailers).flatMap(([key, value]) => ["--trailer", `${key}: ${value}`]),
    msgFile,
  );
};

try {
  main();
} catch {
  // ccusage が無い、壊れた JSON が返った等。何も付けずに正常終了する。
}
