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
//   - コミット時刻で JSONL を区切っても同じ数字が出ることは確認済みだが、コストは
//     ccusage 依存でセッション累計しか取れず（--since/--until は日付単位）、
//     時刻方式に揃えられない。境界の決め方が 2 種類混ざるのを避けて差分方式に統一する
//
// ccusage session はエージェント横断のセッション一覧を返す。セッション ID は period に
// 入るので、そこで突き合わせれば特定のエージェント向けのオプションに依存せずに済む。
//   - 以前はリクエスト単位の内訳（--id が返す entries）を合計していたが、これは
//     Claude Code が書く JSONL をほぼそのまま写したものだった。同一リクエストが
//     複数行に重複して現れるため、ccusage 側の重複排除の有無だけでセッション累計が
//     倍近く変わった実績がある。--id 自体もドキュメントに記載がなく、unified 側に
//     生えていないバージョンも存在した。行の集計値は entries の合計と一致する
//   - 受け取った JSON はスキーマで検証する。上記のとおり ccusage の出力は変わりうるので、
//     欠けたフィールドを 0 とみなして誤った数字を残すより、何も付けずに終わるほうがよい
//   - モデル名は modelBreakdowns の差分から求め、トークンが増えたモデルを増分の
//     多い順に並べる。セッション途中でモデルを切り替えてもコミット時点の実態が残る
//     （モデル名を示す環境変数は Claude Code から渡されない）。増分が無いとき
//     （コミット直後の amend など）は基準コミットの値を引き継ぐ
//   - 該当するセッションが見つからない場合は何も付けない
//
// ツール呼び出し数・API リクエスト数・スキル起動数・コンテキスト量は ccusage が
// 扱わないため、Claude Code が書く JSONL を直接読む。
//   - 対象は <CLAUDE_CONFIG_DIR ?? ~/.claude>/projects/*/<セッション ID>.jsonl と、
//     同じセッションのサブエージェント分 <セッション ID>/subagents/*.jsonl。
//     cwd をディレクトリ名に変換する規則に依存しないよう glob で引く
//   - API リクエスト数は assistant 行の requestId のユニーク数。ローカルの全セッションで
//     (requestId, message.id) 単位の usage 合計が ccusage のトークン値と一致したので、
//     ccusage が数えているのと同じ単位を数えていることになる
//   - assistant 行は content のブロックごとに分割して書かれる。上に書いた「同一リクエストが
//     複数行に重複して現れる」の正体はこれ。tool_use ブロック自体は重複しないため、
//     ツール呼び出しはブロックをそのまま数えればよい
//   - スキル起動は Skill ツールの tool_use だけでは数え漏れる。ユーザーが /<名前> で
//     起動した場合は tool_use を経ずにスキルが読み込まれるため。どちらの経路でも
//     "Base directory for this skill: <パス>" で始まる isMeta の user 行が
//     1 回につき 1 行残るので、そちらを数える
//   - コンテキスト量は最後のメインライン（isSidechain でない）リクエストの
//     input + cache_read + cache_creation。sidechain を除けば単調増加する。以前
//     ccusage の entries から求めて取りやめたのは、サブエージェントの小さな
//     コンテキストを末尾で拾っていたため。これは累計ではなく時点の値なので差し引かない
//   - 内訳は該当が無くても空値のまま残す。キーがあって空なら計測した上で該当が
//     無かった、キーごと無ければ計測できなかった（JSONL が読めない、あるいは記録を
//     入れる前のコミット）ことを表す。空値の行末の空白は git がコミット時に詰める
//   - JSONL が読めない場合はここ由来のトレーラーだけを省く。ccusage 由来の分は残す
//
// 付帯情報の付与であり、失敗してもコミット自体は妨げない（常に正常終了する）。
//
// 引数は prepare-commit-msg フックのもの。
// 参照: https://git-scm.com/docs/githooks#_prepare_commit_msg
import { existsSync, globSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { xSync } from "tinyexec";
import { z } from "zod";

/** モデル別の利用量（ccusage が返す modelBreakdowns の要素） */
const Breakdown = z.object({
  modelName: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
});

/** セッション単位の利用量（ccusage session が返す session 配列の要素） */
const Session = z.object({
  period: z.string(),
  totalCost: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  modelBreakdowns: z.array(Breakdown),
});

/** ccusage session --json が返すレポート全体 */
const Report = z.object({ session: z.array(Session) });

// 未知のキーは z.object が黙って捨てるため、読む項目だけを並べればよい。
/** assistant のメッセージに含まれるブロック。tool_use 以外は種別しか見ない */
const Block = z.object({
  type: z.string(),
  text: z.string().optional(),
  name: z.string().optional(),
  input: z.object({ subagent_type: z.string().optional() }).optional(),
});

/** リクエストが報告する利用量。コンテキスト量の算出にだけ使う */
const LineUsage = z.object({
  input_tokens: z.number().default(0),
  cache_creation_input_tokens: z.number().default(0),
  cache_read_input_tokens: z.number().default(0),
});

/** Claude Code が書く JSONL の 1 行 */
const Line = z.object({
  type: z.string(),
  isSidechain: z.boolean().optional(),
  isMeta: z.boolean().optional(),
  requestId: z.string().optional(),
  message: z
    .object({
      content: z.union([z.string(), z.array(Block)]).optional(),
      usage: LineUsage.optional(),
    })
    .optional(),
});

/** モデル別の利用量 */
type Breakdown = z.infer<typeof Breakdown>;

/** 累計と差分の組。トレーラーには両方を記録する */
interface Amount {
  session: number;
  commit: number;
}

/** JSONL から数えたセッションの活動量。コンテキスト量以外はいずれも累計 */
interface Activity {
  requests: number;
  toolCalls: number;
  tools: Map<string, number>;
  skills: Map<string, number>;
  contextTokens: number;
}

/** トレーラーのキーと値の組 */
type Trailers = Record<string, string | number>;

// 終了コードは見ない。存在しない参照の問い合わせなど、非ゼロ終了が異常ではなく
// 分岐の材料になる呼び出しがあるため。コマンド自体を起動できない場合は例外になり、
// トレーラーを付けずに終わる。
/** 外部コマンドを実行して標準出力を返す */
const run = (command: string, args: string[]): string => xSync(command, args).stdout.trim();

/** 実行した git コマンドの標準出力を返す */
const git = (...args: string[]): string => run("git", args);

/** 浮動小数点の誤差が桁あふれしないよう、コストを小数 6 桁に丸める */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/** 差分をとる。前回値が現在値を上回る異常時は 0 に丸める */
const diff = (total: number, base: number): number => Math.max(total - base, 0);

/** modelBreakdowns をモデル名から総トークン数への対応に畳む */
const modelTokens = (breakdowns: Breakdown[]): Map<string, number> =>
  new Map(
    breakdowns.map((breakdown) => [
      breakdown.modelName,
      breakdown.inputTokens +
        breakdown.outputTokens +
        breakdown.cacheCreationTokens +
        breakdown.cacheReadTokens,
    ]),
  );

/** 名前ごとの数値をトレーラー 1 行分の文字列にする */
const formatCounts = (counts: Iterable<readonly [string, number]>): string =>
  [...counts].map(([name, value]) => `${name}=${value}`).join(",");

// 値が壊れていた要素は捨てる。その名前は差分の基準を失って累計がそのまま
// 計上されるだけで、トレーラーの付与自体は妨げない。
/** formatCounts の逆変換 */
const parseCounts = (value: string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const part of value.split(",")) {
    const separator = part.lastIndexOf("=");
    if (separator <= 0) {
      continue;
    }
    counts.set(part.slice(0, separator), Number(part.slice(separator + 1)) || 0);
  }
  return counts;
};

/** 名前ごとの累計から前回コミットとの増分をとり、増分の多い順に並べる */
const increases = (
  total: Map<string, number>,
  base: Map<string, number>,
): Array<[string, number]> =>
  [...total]
    .map(([name, value]): [string, number] => [name, diff(value, base.get(name) ?? 0)])
    .filter(([, increase]) => 0 < increase)
    .toSorted(([, left], [, right]) => right - left);

/** 対応表の値を 1 加算する */
const increment = (counts: Map<string, number>, name: string): void => {
  counts.set(name, (counts.get(name) ?? 0) + 1);
};

/** メッセージの content を、種別を問わずテキストとして連結する */
const contentText = (content: string | Array<z.infer<typeof Block>>): string =>
  typeof content === "string" ? content : content.map((block) => block.text ?? "").join("");

/** セッションの JSONL（サブエージェント分を含む）のパスを返す */
const sessionFiles = (sessionId: string): string[] => {
  const projects = join(process.env["CLAUDE_CONFIG_DIR"] ?? join(homedir(), ".claude"), "projects");
  if (!existsSync(projects)) {
    return [];
  }
  return globSync([`*/${sessionId}.jsonl`, `*/${sessionId}/subagents/*.jsonl`], {
    cwd: projects,
  }).map((file) => join(projects, file));
};

// 読み取りに失敗しても undefined を返すだけにする。ここで例外を投げると
// 呼び出し元まで巻き込んで ccusage 由来のトレーラーも落ちてしまうため。
/** JSONL からセッションの活動量を数える。数えられなければ undefined */
const readActivity = (sessionId: string): Activity | undefined => {
  try {
    return countActivity(sessionFiles(sessionId));
  } catch {
    return undefined;
  }
};

/** JSONL を走査して活動量を数える */
const countActivity = (files: string[]): Activity | undefined => {
  if (files.length === 0) {
    return undefined;
  }

  const requests = new Set<string>();
  const tools = new Map<string, number>();
  const skills = new Map<string, number>();
  let toolCalls = 0;
  let contextTokens = 0;

  for (const file of files) {
    for (const text of readFileSync(file, "utf8").split("\n")) {
      if (text === "") {
        continue;
      }
      let parsed;
      try {
        parsed = Line.safeParse(JSON.parse(text));
      } catch {
        continue;
      }
      if (!parsed.success) {
        continue;
      }
      const line = parsed.data;
      const content = line.message?.content;

      // スキルの読み込みは Skill ツール経由でもスラッシュ起動でもこの 1 行が残る。
      if (line.type === "user" && line.isMeta === true && content !== undefined) {
        const path = /^Base directory for this skill: (\S+)/.exec(contentText(content).trim())?.[1];
        const name = path?.split("/").at(-1);
        if (name !== undefined && name !== "") {
          increment(skills, name);
        }
        continue;
      }

      if (line.type !== "assistant") {
        continue;
      }
      if (line.requestId !== undefined) {
        requests.add(line.requestId);
      }
      // 行は時系列に並ぶので、最後に見たメインラインの値がコミット時点のコンテキスト量。
      const usage = line.message?.usage;
      if (line.isSidechain !== true && usage !== undefined) {
        contextTokens =
          usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
      }
      for (const block of typeof content === "string" ? [] : (content ?? [])) {
        if (block.type !== "tool_use" || block.name === undefined) {
          continue;
        }
        toolCalls += 1;
        // サブエージェントは種別まで残す。どのスキルかは Agent-*-Skills が持つ。
        const subagent = block.input?.subagent_type;
        increment(tools, subagent === undefined ? block.name : `${block.name}(${subagent})`);
      }
    }
  }

  return { requests: requests.size, toolCalls, tools, skills, contextTokens };
};

/** JSONL 由来の値をトレーラーの 3 区画に振り分ける。読めていなければどれも空 */
const activityTrailers = (
  activity: Activity | undefined,
  amount: (total: number, baseKey: string) => Amount,
  baseTrailer: (key: string) => string,
): { context: Trailers; commit: Trailers; session: Trailers } => {
  if (activity === undefined) {
    return { context: {}, commit: {}, session: {} };
  }

  const requests = amount(activity.requests, "Agent-Session-Api-Requests");
  const toolCalls = amount(activity.toolCalls, "Agent-Session-Tool-Calls");
  const tools = increases(activity.tools, parseCounts(baseTrailer("Agent-Session-Tool-Breakdown")));
  const skills = increases(activity.skills, parseCounts(baseTrailer("Agent-Session-Skills")));

  return {
    context: { "Agent-Context-Tokens": activity.contextTokens },
    commit: {
      "Agent-Commit-Api-Requests": requests.commit,
      "Agent-Commit-Tool-Calls": toolCalls.commit,
      "Agent-Commit-Tool-Breakdown": formatCounts(tools),
      "Agent-Commit-Skills": formatCounts(skills),
    },
    session: {
      "Agent-Session-Api-Requests": requests.session,
      "Agent-Session-Tool-Calls": toolCalls.session,
      "Agent-Session-Tool-Breakdown": formatCounts(activity.tools),
      "Agent-Session-Skills": formatCounts(activity.skills),
    },
  };
};

/** コミットメッセージにトレーラーを付与する */
const main = (): void => {
  const [msgFile, commitSource = "", commitSha = ""] = process.argv.slice(2);
  const sessionId = process.env["CLAUDE_CODE_SESSION_ID"] ?? "";

  // エージェント経由でない（人が手で打った）コミットには付与しない。
  if (sessionId === "" || msgFile === undefined || !existsSync(msgFile)) {
    return;
  }

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
  const report = Report.parse(
    JSON.parse(run("mise", ["exec", "--", "ccusage", "session", "--json"])),
  );
  const usage = report.session.find((entry) => entry.period === sessionId);
  if (usage === undefined) {
    return;
  }

  const amount = (total: number, baseKey: string): Amount => ({
    session: total,
    commit: diff(total, base(baseKey)),
  });

  const cost = amount(round6(usage.totalCost), "Agent-Session-Estimated-Cost-USD");
  const input = amount(usage.inputTokens, "Agent-Session-Tokens-Input");
  const output = amount(usage.outputTokens, "Agent-Session-Tokens-Output");
  const cacheCreation = amount(usage.cacheCreationTokens, "Agent-Session-Tokens-Cache-Creation");
  const cacheRead = amount(usage.cacheReadTokens, "Agent-Session-Tokens-Cache-Read");
  const activity = activityTrailers(readActivity(sessionId), amount, baseTrailer);

  // このコミットまでにトークンが増えたモデルを、増分の多い順に並べる。
  const tokens = modelTokens(usage.modelBreakdowns);
  const models = increases(tokens, parseCounts(baseTrailer("Agent-Session-Model-Tokens"))).map(
    ([name]) => name,
  );

  // --if-exists replace により amend でも既存トレーラーが二重にならない。
  // ただし git はキー名を前方一致で比較するため、あるキーが別のキーの接頭辞に
  // なってはならない（例: Agent-Session は Agent-Session-Tokens-Input と衝突して
  // 相互に上書きされる）。キーを追加する際は接頭辞の重複に注意すること。
  const trailers: Trailers = {
    "Agent-Model": models.join(", ") || baseTrailer("Agent-Model") || "unknown",
    "Agent-Effort": process.env["CLAUDE_EFFORT"] ?? "unknown",
    ...activity.context,
    "Agent-Commit-Estimated-Cost-USD": round6(cost.commit),
    "Agent-Commit-Tokens-Input": input.commit,
    "Agent-Commit-Tokens-Output": output.commit,
    "Agent-Commit-Tokens-Cache-Creation": cacheCreation.commit,
    "Agent-Commit-Tokens-Cache-Read": cacheRead.commit,
    ...activity.commit,
    "Agent-Session-Id": sessionId,
    "Agent-Session-Estimated-Cost-USD": cost.session,
    "Agent-Session-Tokens-Input": input.session,
    "Agent-Session-Tokens-Output": output.session,
    "Agent-Session-Tokens-Cache-Creation": cacheCreation.session,
    "Agent-Session-Tokens-Cache-Read": cacheRead.session,
    ...activity.session,
    "Agent-Session-Model-Tokens": formatCounts(tokens),
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
  // ccusage が無い、スキーマに合わない JSON が返った等。何も付けずに正常終了する。
}
