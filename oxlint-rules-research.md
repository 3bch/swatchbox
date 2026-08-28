# oxlint ルール調査メモ

`.oxlintrc.json` の設定にあたって実施した調査の記録。判断の前提を残し、
次の見直し（unicorn / typescript）でも同じ調査を繰り返さずに済むようにする。

- 調査日: 2026-08-28
- 対象バージョン: oxlint 1.80.0
- 比較対象: oxlint 1.13.0（1 年前の 2025-08-26 時点で最新だったバージョン）

## 調査方法

古いバージョンの `configuration_schema.json` にはルール名の列挙がないため、
スキーマ同士の比較ではルール一覧を取得できない。実バイナリを取得し、
全カテゴリ・全プラグインを有効にした `--print-config` の出力を突き合わせる。

```sh
# 1 年前時点の最新バージョンを特定する
npm view oxlint time --json

# 比較対象を一時ディレクトリに入れる
npm install oxlint@1.13.0

# 両バージョンで実行し、rules のキーを比較する
oxlint --print-config -c <空の設定> -D all -D nursery \
  --import-plugin --react-plugin --jsdoc-plugin --vitest-plugin \
  --jsx-a11y-plugin --promise-plugin --node-plugin
```

カテゴリ（correctness / pedantic など）の判定は、`-A all -A nursery -D <category>`
で 1 カテゴリずつ有効にして出力を集めることで得られる。

## 1 年間の増加サマリ

ルール総数は **573 → 870（+297）**。削除されたルールはない。

| プラグイン | 追加数 | 備考                                |
| ---------- | ------ | ----------------------------------- |
| vitest     | +67    | 6 → 73。実質この 1 年で整備された   |
| vue        | +46    | 新設                                |
| react      | +46    | React Compiler 由来のルール群を含む |
| eslint     | +38    |                                     |
| unicorn    | +34    |                                     |
| typescript | +27    |                                     |
| jest       | +10    |                                     |
| node       | +9     |                                     |
| jsx-a11y   | +7     |                                     |
| jsdoc      | +5     |                                     |
| import     | +4     |                                     |
| oxc        | +3     |                                     |
| promise    | +1     |                                     |

## eslint / oxc の見直し結果

AI エージェントがコードを書く前提で、次の 3 点を基準に選定した。

1. エージェントが自力で気づけないバグを弾く
2. 冗長な生成コードは `--fix` で機械的に潰し、レビューの目を本質に向ける
3. 会話が変われば書き方が揺れるため、選択肢を 1 つに固定する

結果として 36 件を追加した（有効ルール数 387 → 423）。

### 追加したルール

| 分類                 | ルール                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| バグ・やり残しの検出 | `array-callback-return` / `no-promise-executor-return` / `no-constructor-return` / `no-self-compare` / `no-loop-func` / `no-unreachable-loop` / `no-useless-assignment` / `no-case-declarations` / `no-inner-declarations` / `no-return-assign` / `typescript/require-await` / `oxc/branches-sharing-code`                                                     |
| 冗長な記述の除去     | `no-else-return` / `no-lonely-if` / `no-negated-condition` / `arrow-body-style` / `no-useless-computed-key` / `operator-assignment` / `logical-assignment-operators` / `prefer-object-has-own` / `prefer-exponentiation-operator` / `prefer-numeric-literals` / `prefer-regex-literals` / `no-useless-return` / `prefer-arrow-callback` / `symbol-description` |
| 書き方の揺れ防止     | `func-style` / `default-case-last` / `new-cap` / `guard-for-in` / `no-labels`                                                                                                                                                                                                                                                                                  |
| 握りつぶしの検出     | `no-empty` / `no-empty-function` / `no-alert` / `no-script-url` / `no-template-curly-in-string`                                                                                                                                                                                                                                                                |

### 見送ったルールと理由

| ルール                                                                                              | 理由                                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `complexity` / `max-lines` / `max-lines-per-function` / `max-statements` / `max-depth` などの上限系 | エージェントが制限を回避するために不自然な関数分割をしがちで、かえって読みにくくなる                                                                |
| `no-magic-numbers`                                                                                  | 定数の乱造を招く                                                                                                                                    |
| `capitalized-comments`                                                                              | コメントを日本語で書くため機能しない                                                                                                                |
| `yoda`                                                                                              | 「比較は常に右が大きい」という書き方の好みと衝突する。`0 < count` や `0 <= x && x < 10` が弾かれる。本家の `exceptRange` オプションは oxlint 未対応 |
| `no-warning-comments`                                                                               | TODO コメントを一律禁止することになり、期限付き TODO を表現できない（後述）                                                                         |
| `require-unicode-regexp` / `prefer-named-capture-group`                                             | 煩わしさに見合わない                                                                                                                                |
| `sort-keys` / `no-ternary` / `no-plusplus` / `id-length` / `one-var` など                           | 趣味の域を出ない                                                                                                                                    |
| `oxc/no-async-await` / `no-const-enum` / `no-optional-chaining` / `no-rest-spread-properties`       | 言語機能を禁じる意図がない。なお `const enum` と `namespace` は tsconfig の `erasableSyntaxOnly` が既に弾いている                                   |

### 検討時に確認した挙動

- `no-empty-function` は React の noop コールバック `onClick={() => {}}` を弾く。
  `allow: ["arrowFunctions"]` で緩められるが、`/* noop */` と書けば済むためオプションなしで採用した
- `no-negated-condition` は `else` を伴う場合のみ発火する。ガード節・早期 return は対象外
- `no-lonely-if` は `else` の中身が `if` 文ひとつだけのときに発火する。oxlint 版に自動 fix はない
- `new-cap` は組み込み関数を例外扱いするため `Number("1")` などは発火しない
- `--fix` でインデントが崩れることがあるが、pre-commit では `fix:format` が先に走るため問題にならない

## 設定に書いていないが有効になっているルール

`categories` で `correctness` / `suspicious` / `perf` を error にしているため、
これらのカテゴリに属するルールは `.oxlintrc.json` に書かなくても効いている。
次の 2 つはこの 1 年で suspicious に追加されたもので、意図せず有効になっている点に注意。

- `no-underscore-dangle` — `const _cache = ...` が弾かれる。ただし関数引数は対象外なので、
  未使用引数を `_unused` とする慣習は問題ない
- `no-shadow` — 外側スコープと同名の変数を禁止する。`map((value) => ...)` のような
  素直な命名が弾かれるため、煩わしければ個別に off にする

## oxlint 側の未実装事項

いずれも今回の判断の前提。状況が変わったら再検討する。

- **`unicorn/expiring-todo-comments` が未実装**。日付ベースの期限切れ TODO
  （`// TODO [2026-12-31]: メッセージ`）を検出するルール。実装 PR
  [#22389](https://github.com/oxc-project/oxc/pull/22389) は 2026-05-13 作成、
  2026-08-06 更新で open のまま。先行する PR #14201 はマージされずクローズ済み。
  傘 issue は [#684](https://github.com/oxc-project/oxc/issues/684)。
  マージされたら `no-warning-comments` の代わりに導入を検討する
- **`yoda` の `exceptRange` / `onlyEquality` オプションが未対応**。
  スキーマ上も `"never"` / `"always"` の文字列しか受け付けない
- **`no-restricted-syntax` 自体が未実装**。AST セレクタによる独自ルールは書けない。
  比較演算子の向きを `<` / `<=` に統一するルールは oxlint・ESLint 本体のいずれにもないが、
  サードパーティの `eslint-plugin-etc` に `etc/prefer-less-than` がある。
  ただし v2.0.3（2023-05-10）が最新でほぼ更新が止まっており、
  導入するには ESLint 側に TypeScript パーサごと持ち込む必要がある

## 次の見直しの材料

`categories` の設定上、correctness / suspicious / perf は自動的に有効になるため、
検討が必要なのは pedantic / style / restriction / nursery の未設定ルールに限られる。

### unicorn（この 1 年の新規 34 件）

| カテゴリ    | 状態   | ルール                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| suspicious  | 設定済 | `no-array-fill-with-reference-type` / `no-array-reverse` / `no-array-sort` / `no-confusing-array-with` / `require-module-specifiers`                                                                                                                                                                                                                                                                                         |
| pedantic    | 設定済 | `prefer-at`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| pedantic    | 未設定 | `no-array-callback-reference` / `no-immediate-mutation` / `no-negated-condition` / `no-unnecessary-array-splice-count` / `prefer-import-meta-properties` / `prefer-number-coercion` / `prefer-single-call` / `prefer-top-level-await`                                                                                                                                                                                        |
| style       | 設定済 | `prefer-keyboard-event-key`                                                                                                                                                                                                                                                                                                                                                                                                  |
| style       | 未設定 | `consistent-template-literal-escape` / `custom-error-definition` / `explicit-timer-delay` / `max-nested-calls` / `no-useless-collection-argument` / `prefer-bigint-literals` / `prefer-class-fields` / `prefer-classlist-toggle` / `prefer-default-parameters` / `prefer-export-from` / `prefer-response-static-json` / `prefer-ternary` / `relative-url-style` / `require-module-attributes` / `switch-case-break-position` |
| restriction | 未設定 | `import-style` / `no-useless-error-capture-stack-trace` / `prefer-module`                                                                                                                                                                                                                                                                                                                                                    |
| nursery     | 未設定 | `no-useless-iterator-to-array`                                                                                                                                                                                                                                                                                                                                                                                               |

`unicorn/no-negated-condition` は今回追加した `eslint/no-negated-condition` と
重複するため、採用しない。

### typescript（この 1 年の新規 27 件）

| カテゴリ    | 状態   | ルール                                                                                                                                                                                                                                                    |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| correctness | 設定済 | `no-useless-default-assignment`                                                                                                                                                                                                                           |
| suspicious  | 設定済 | `consistent-return` / `no-unnecessary-type-conversion` / `no-unnecessary-type-parameters`                                                                                                                                                                 |
| pedantic    | 設定済 | `no-deprecated` / `prefer-nullish-coalescing` / `strict-boolean-expressions`                                                                                                                                                                              |
| pedantic    | 未設定 | `prefer-includes` / `prefer-readonly-parameter-types` / `strict-void-return`                                                                                                                                                                              |
| style       | 設定済 | `consistent-type-exports` / `method-signature-style`                                                                                                                                                                                                      |
| style       | 未設定 | `class-literal-property-style` / `consistent-type-assertions` / `dot-notation` / `no-unnecessary-qualifier` / `parameter-properties` / `prefer-find` / `prefer-readonly` / `prefer-regexp-exec` / `prefer-string-starts-ends-with` / `unified-signatures` |
| restriction | 設定済 | `no-invalid-void-type`                                                                                                                                                                                                                                    |
| restriction | 未設定 | `explicit-member-accessibility` / `no-restricted-types`                                                                                                                                                                                                   |
| nursery     | 設定済 | `no-unnecessary-condition` / `prefer-optional-chain`                                                                                                                                                                                                      |

nursery カテゴリ自体は off だが、`no-unnecessary-condition` と
`prefer-optional-chain` は個別に error 指定しているため有効になっている。
