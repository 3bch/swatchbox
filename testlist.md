# commit-trailer 単体テスト

`scripts/commit-trailer.ts` の単体テストを TDD で追加するための作業メモ。
テストが出揃って TODO.md の項目を閉じたら、このファイルは削除する。

## 進め方

Kent Beck の TDD に従い、関数ひとつを 1 サイクルとして進める。
サイクルは以下の 5 ステップからなり、各ステップは

**作業 → 人間チェック → コミット**

で完了する。各ステップでは必ず確認を受け、承認を得てからコミットし、
次のステップへ進む。

1. **テスト項目の再検討**: これから扱う関数について、テストリストのケースが
   十分か・過剰でないかを見直し、このサイクルで書くケースを確定する。
   見直した結果として変更が無ければ、無いことを報告してコミットは省く
2. **Red**: テストを書く。この時点では失敗してよい
   （未 export・未実装による失敗も含む）
3. **Green**: 実装を修正してテストを通す。最短で通すことを優先する。
   最初のサイクルだけは設計変更 A・B が同時に必要になるため差分が大きくなる
4. **Refactor**: 重複や読みにくさがないか確認し、あれば直す（テストは緑のまま）。
   直す箇所が無ければ、無いことを報告してコミットは省く
5. **テストリストの更新**: 実施したケースにチェックを入れ、作業中に気づいた
   ケースを追記し、残りの並びを見直す

- テストは `scripts/commit-trailer.test.ts` に集約し、`describe` を関数単位で切る
- 実行は `node --run test`（vitest）
- 実コマンド（git / mise / ccusage）には依存させない
- Red のコミットは型チェックとリントが失敗するため、`LEFTHOOK_EXCLUDE=type,lint git commit`
  でその 2 ジョブだけ飛ばす。`--no-verify` はトレーラーの付与まで止めてしまう

## 現在地

- 対象: formatCounts
- 完了: diff の 1 サイクル（1〜5）、byValueDesc の 1 サイクル（1〜5）、
  formatCounts の 1（テスト項目の再検討）
- 次: 2. Red

## 実装側の設計変更

テスト可能にするため、ロジックを変えない範囲で以下を行う。
それぞれ、必要になったサイクルの Green の中で実施する。

- [x] **A. import 時の副作用をなくす**
      末尾の `try { main(); } catch {}` を `if (import.meta.main)` で囲む。
      Node v24.20 で `import.meta.main` が使えることは確認済み
- [ ] **B. テスト対象を named export にする**
      関数だけでなく、スキーマ定義（`Report` など）も対象に含む。
      サイクルごとに、そこで必要になったものだけを export する
      （round3・diff・byValueDesc は実施済み）
- [ ] **C. `countActivity` を fs 非依存にする**
      引数をパス配列からファイル内容の文字列配列に変え、`readFileSync` は
      `readActivity` 側へ寄せる。JSONL の解釈ロジックを純粋関数にする
- [ ] **D. トレーラーの組み立てを `main()` から切り出す**
      `buildTrailers(...)` として純粋関数にし、`baseTrailer` を引数で受け取る。
      git / ccusage の呼び出しは `main()` に残す
- [ ] **E. 値の並び順を出力側に寄せる**
      `increases` はソートせず `Map` を返し、value 降順の比較は `byValueDesc`
      として切り出す。`formatCounts` は `Map` を受けて内部で `byValueDesc` を
      通し、`Agent-Model` 側も同じ関数を使う。session 区画の並びが出現順から
      value 降順に変わるため、挙動を変えない A〜D とは違い仕様変更にあたる。
      byValueDesc の新設は先行サイクルで行い、呼び出し元の切り替え
      （`increases` の戻りと `Agent-Model`）は formatCounts のサイクルで行う

## テストリスト

依存の少ない順に進める。

### round3

入力は `z.number()` を通った有限の数。届かないことは Session / Report
スキーマ側のテストが担保する。こちら側では、検証がスキーマの責務であって
round3 の責務ではないことを、非有限な値を素通しすることで表現する。

- [x] 小数第 4 位が切り上がる
- [x] 小数第 4 位が切り捨てられる
- [x] 小数第 3 位までの値は変わらない
- [x] 整数と 0 は変わらない
- [x] 負の値も符号を保ったまま丸まる
- [x] 差分計算で出た浮動小数点の誤差が畳まれる
- [x] 非有限な値は検証せずそのまま返る（検証は呼び出し元の責務）

### diff

- [x] 通常の差分
- [x] 前回値が現在値を上回る場合は 0
- [x] 現在値と前回値が等しければ 0
- [x] 基準が 0

### byValueDesc

- [x] value の降順に並ぶ
- [x] 同値の要素はキーのコードポイント順に並ぶ
      （挿入順や ccusage の出力順に依存しない）
- [x] 空の入力は空配列

### formatCounts

- [ ] 複数要素が value の降順で `name=value` のカンマ区切りになる
      （挿入順と違う順で渡し、byValueDesc が繋がっていることも示す）
- [ ] 空の入力は空文字（トレーラーが空値で残ることの確認）

### parseCounts

- [ ] formatCounts の出力を往復で戻せる
- [ ] 空文字
- [ ] 名前に `=` を含む（`lastIndexOf` で区切る挙動）
- [ ] 区切りが無い／先頭が `=` の壊れた要素は捨てる
- [ ] 数値にならない値は 0 になる

`Number(...) || 0` は NaN を 0 に潰すが、`Infinity` という文字列だけは
素通りする。差分側（`diff` の `Math.max(..., 0)` と `increases` の
`0 < increase`）が受け止めるため実害は無い。このサイクルに来たときに、
素通りを仕様として固定するか判断する。

### increases

戻りは `Map`。並び順は byValueDesc の責務（設計変更 E）。

- [ ] 増分のあるものだけが残る
- [ ] 基準に無い名前は累計がそのまま増分になる
- [ ] 減っている名前は落ちる（diff が 0 のため）

### modelTokens

- [ ] 4 種のトークンが合算される
- [ ] 複数モデル
- [ ] 空配列

### increment

- [ ] 未登録の名前は 1 になる
- [ ] 既存の名前は 1 増える

### contentText

- [ ] string がそのまま返る
- [ ] ブロック配列の text が連結される
- [ ] text を持たないブロックは空文字として扱われる

### Session / Report スキーマ

ccusage の出力は変わりうるため、欠けた値や壊れた値を 0 とみなして誤った
数字を残すより、parse に失敗させて何も付けないほうがよい（ファイル冒頭の
コメントの方針）。zod は v3 では `z.number()` が Infinity を通していた
実績があり、この拒否はライブラリのバージョンで動きうる。round3 や diff に
非有限値が届かない根拠がここにある。

- [ ] totalCost が NaN なら parse に失敗する
- [ ] totalCost が Infinity なら parse に失敗する
- [ ] modelBreakdowns の中の非有限な値も parse に失敗する
- [ ] 必須フィールドが欠けていれば parse に失敗する
- [ ] 未知のキーは黙って捨てられる

負の totalCost は round3 も diff も素通りする。diff の `Math.max(..., 0)` は
そのコミットの値は守るが、セッション累計の側は負のままトレーラーに残り、
次のコミットで基準として引かれて負の分だけ上乗せされる（総額 2.0 の回が
基準 -1.5 なら 3.5 と記録される）。例外にならないので main() の catch にも
掛からず、誤った数字が履歴に残り続ける。ccusage が負を返すとは考えにくいが、
z.number() は負を弾かない。totalCost を `.nonnegative()` にして、既存の方針
どおり parse を失敗させて何も付けないほうがよいか、このサイクルで判断する。

### countActivity（設計変更 C の後）

- [ ] 入力が空なら undefined
- [ ] requestId のユニーク数を数える（重複行を 1 と数える）
- [ ] tool_use ブロックの数を数える
- [ ] ツール名ごとの内訳。`subagent_type` があれば `Agent(type)` の形
- [ ] スキル行（isMeta の user + `Base directory for this skill:`）を数える
- [ ] スキル行はツール経由・スラッシュ起動のどちらの経路でも数える
- [ ] contextTokens は最後のメインライン行の input + cache_read + cache_creation
- [ ] isSidechain の行は contextTokens に影響しない
- [ ] JSON として壊れた行はスキップする
- [ ] スキーマに合わない行はスキップする
- [ ] 空行はスキップする
- [ ] 複数ファイル（サブエージェント分）の合算

### activityTrailers（設計変更 C の後）

- [ ] activity が undefined なら 3 区画とも空オブジェクト
- [ ] context / commit / session の 3 区画に正しく振り分ける
- [ ] 内訳は該当が無くても空文字のキーとして残る

### buildTrailers（設計変更 D の後）

- [ ] 基準トレーラーがある場合、commit 側が差分になる
- [ ] 基準が無い場合、commit 側に累計がそのまま入る
- [ ] キーが接頭辞で衝突していない（`--if-exists replace` の前提）
- [ ] Agent-Model は増分のあったモデルを増分の多い順に並べる
- [ ] 増分が無い場合は基準コミットの Agent-Model を引き継ぐ
- [ ] 基準にも無ければ `unknown`
- [ ] Agent-Effort は環境変数が無ければ `unknown`

## スコープ外

- `main()` 本体（git / mise / ccusage の実コマンドに依存するため）。
  ただし ccusage の出力を検証するスキーマ自体はスコープに含む
- `sessionFiles` / `readActivity`（fs と環境変数に依存。設計変更 C により
  ロジックの実体は countActivity 側へ移るため、残るのは薄い接続部分のみ）
