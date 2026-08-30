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
// ccusage session はエージェント横断のセッション一覧を返す。セッション ID は period に
// 入るので、そこで突き合わせれば特定のエージェント向けのオプションに依存せずに済む。
//   - 以前はリクエスト単位の内訳（--id が返す entries）を合計していたが、これは
//     Claude Code が書く JSONL をほぼそのまま写したものだった。同一リクエストが
//     複数行に重複して現れるため、ccusage 側の重複排除の有無だけでセッション累計が
//     倍近く変わった実績がある。--id 自体もドキュメントに記載がなく、unified 側に
//     生えていないバージョンも存在した。行の集計値は entries の合計と一致する
//   - モデル名は modelBreakdowns の差分から求め、トークンが増えたモデルを増分の
//     多い順に並べる。セッション途中でモデルを切り替えてもコミット時点の実態が残る
//     （モデル名を示す環境変数は Claude Code から渡されない）。増分が無いとき
//     （コミット直後の amend など）は基準コミットの値を引き継ぐ
//   - コンテキスト量の記録は取りやめた。entries の末尾から求めていたが、末尾が
//     バックグラウンドの副次的な呼び出しだと、そちらの小さなコンテキストを拾って
//     しまう。別の求め方が見つかれば改めて足す
//   - 該当するセッションが見つからない場合は何も付けない
//
// 付帯情報の付与であり、失敗してもコミット自体は妨げない（常に正常終了する）。
//
// 引数は prepare-commit-msg フックのもの。
// 参照: https://git-scm.com/docs/githooks#_prepare_commit_msg
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

/** モデル別の利用量（ccusage が返す modelBreakdowns の要素） */
type Breakdown = {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

/** セッション単位の利用量（ccusage session が返す session 配列の要素） */
type Session = {
  period: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelBreakdowns: Breakdown[];
};

/** Ccusage session --json が返すレポート全体 */
type Report = { session?: Session[] };

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

/** ModelBreakdowns をモデル名から総トークン数への対応に畳む */
const modelTokens = (breakdowns: Breakdown[]): Map<string, number> =>
  new Map(
    breakdowns.map((breakdown) => [
      breakdown.modelName,
      (breakdown.inputTokens || 0) +
        (breakdown.outputTokens || 0) +
        (breakdown.cacheCreationTokens || 0) +
        (breakdown.cacheReadTokens || 0),
    ]),
  );

/** モデル別トークン数をトレーラー 1 行分の文字列にする */
const formatModelTokens = (tokens: Map<string, number>): string =>
  [...tokens].map(([name, total]) => `${name}=${total}`).join(",");

// 値が壊れていた要素は捨てる。そのモデルは差分の基準を失って累計がそのまま
// 計上されるだけで、トレーラーの付与自体は妨げない。
/** FormatModelTokens の逆変換 */
const parseModelTokens = (value: string): Map<string, number> => {
  const tokens = new Map<string, number>();
  for (const part of value.split(",")) {
    const separator = part.lastIndexOf("=");
    if (separator <= 0) continue;
    tokens.set(part.slice(0, separator), Number(part.slice(separator + 1)) || 0);
  }
  return tokens;
};

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
  const baseTrailer = (key: string): string =>
    baseCommit === ""
      ? ""
      : (git("log", baseCommit, "-n", "1", `--format=%(trailers:key=${key},valueonly)`).split(
          "\n",
        )[0] ?? "");
  const base = (key: string): number => Number(baseTrailer(key)) || 0;

  // ccusage は mise で管理しているため mise 経由で起動する。
  const report: Report = JSON.parse(run("mise", ["exec", "--", "ccusage", "session", "--json"]));
  const usage = report.session?.find((entry) => entry.period === sessionId);
  if (usage === undefined) return;

  const amount = (total: number, baseKey: string): Amount => ({
    session: total,
    commit: diff(total, base(baseKey)),
  });

  const cost = amount(round6(usage.totalCost || 0), "Agent-Session-Estimated-Cost-USD");
  const input = amount(usage.inputTokens || 0, "Agent-Session-Tokens-Input");
  const output = amount(usage.outputTokens || 0, "Agent-Session-Tokens-Output");
  const cacheCreation = amount(
    usage.cacheCreationTokens || 0,
    "Agent-Session-Tokens-Cache-Creation",
  );
  const cacheRead = amount(usage.cacheReadTokens || 0, "Agent-Session-Tokens-Cache-Read");

  // このコミットまでにトークンが増えたモデルを、増分の多い順に並べる。
  const tokens = modelTokens(usage.modelBreakdowns ?? []);
  const baseTokens = parseModelTokens(baseTrailer("Agent-Session-Model-Tokens"));
  const models = [...tokens]
    .map(([name, total]): [string, number] => [name, diff(total, baseTokens.get(name) ?? 0)])
    .filter(([, increase]) => increase > 0)
    .sort(([, left], [, right]) => right - left)
    .map(([name]) => name);

  // --if-exists replace により amend でも既存トレーラーが二重にならない。
  // ただし git はキー名を前方一致で比較するため、あるキーが別のキーの接頭辞に
  // なってはならない（例: Agent-Session は Agent-Session-Tokens-Input と衝突して
  // 相互に上書きされる）。キーを追加する際は接頭辞の重複に注意すること。
  const trailers: Record<string, string | number> = {
    "Agent-Model": models.join(", ") || baseTrailer("Agent-Model") || "unknown",
    "Agent-Effort": process.env["CLAUDE_EFFORT"] ?? "unknown",
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
    "Agent-Session-Model-Tokens": formatModelTokens(tokens),
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
