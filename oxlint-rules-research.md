# oxlint ルール調査メモ

`.oxlintrc.json` の設定にあたって実施した調査の記録。判断の前提を残し、
次の見直し（typescript / react）でも同じ調査を繰り返さずに済むようにする。
見直しはプラグイン単位で進めており、節ごとに調査日と比較対象を書いている。

- 対象バージョン: oxlint 1.80.0

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

- 調査日: 2026-08-28
- 比較対象: oxlint 1.13.0（1 年前の 2025-08-26 時点で最新だったバージョン）

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

## unicorn の見直し結果

- 調査日: 2026-09-02
- 比較対象: eslint-plugin-unicorn 74.0.0

### 方針

`recommended` ではなく `unopinionated` プリセットをベースにした。`recommended` は
`no-null` / `filename-case` / `no-array-reduce` のように好みの分かれるルールまで含むが、
`unopinionated` は「異論の出にくいもの」だけを集めたサブセットになっている。
本家の定義は `meta.docs.recommended === "unopinionated"` で、readme のルール表では
☑️ が付く。

### 突き合わせ

| 区分                                                             | 件数 |
| ---------------------------------------------------------------- | ---- |
| unopinionated                                                    | 215  |
| oxlint 1.80.0 が実装する unicorn ルール                          | 138  |
| 共通集合（旧名での実装を含む）                                   | 112  |
| └ categories により自動で有効（correctness / suspicious / perf） | 23   |
| └ error にした（pedantic 以下）                                  | 87   |
| └ 意図的に off にした                                            | 2    |

`.oxlintrc.json` の unicorn セクションには、categories では有効にならないものだけを書く。
自動で有効になるものまで並べても、`categories` を変えない限り意味を持たない冗長な記述になる。

明示している 91 件の内訳は、上記 87 件に unopinionated 外から残した 4 件
（`catch-error-name` / `no-await-expression-member` / `prefer-query-selector` / `prefer-spread`）を
加えたもの。いずれも前回の見直しで「書き方の揺れ防止」の観点から選んだもので、
`recommended` には含まれる。

### 名前が変わったルール

unicorn は v74 までにいくつかのルールを改名しており、oxlint は旧名のまま実装している。
readme を名前だけで引くと「未実装」に見えるので注意する。

| unopinionated での名前              | oxlint での名前                 |
| ----------------------------------- | ------------------------------- |
| `no-for-each`                       | `no-array-for-each`             |
| `dom-node-dataset`                  | `prefer-dom-node-dataset`       |
| `prefer-unicode-code-point-escapes` | `no-hex-escape`                 |
| `no-instanceof-builtins`            | `no-instanceof-array` も残る    |
| `no-unnecessary-slice-end`          | `no-length-as-slice-end` も残る |

### 他プラグインと重複するルールの判定

いずれも実際に oxlint へ通して検出範囲を確かめた。名前が同じでも中身は違う。

- `no-lonely-if` — **eslint 版と unicorn 版を両方使う**。eslint 版は `else { if … }`、
  unicorn 版は `else` を持たない入れ子の `if (foo) { if (bar) … }` を見る。
  同じコードで検出行が一切重ならなかった。本家 unicorn も併用を推奨している
- `no-negated-condition` — **unicorn 版に寄せ、eslint 版を off**。検出位置が完全に一致し、
  `--fix` の結果も同一だった。本家では unicorn 版が eslint 版の置き換えとして作られており
  （ESLint 本体は fixable にすることを拒否した）、unopinionated ベースの方針に合わせる。
  なお oxlint は eslint 版にも独自に fixer を付けているため、現時点で機能差はない
- `no-anonymous-default-export` — **import 版だけを使う**。import 版は無名の関数・クラスに加えて
  オブジェクト・配列・`new Foo()`・リテラルも検出する上位互換だった。unicorn 版の差分は
  `module.exports = function () {}` への対応のみで、ESM 専用の本リポジトリでは効かない
- `require-array-sort-compare` — 既に `typescript/require-array-sort-compare` を有効にしている。
  型情報を使うぶん typescript 版のほうが精度が高いため、unicorn 版は入れない

### oxfmt と衝突するルール

- `number-literal-case` — **off**。oxfmt は 16 進リテラルを小文字化する（`0xFF` → `0xff`）が、
  このルールは大文字を要求するため、`fix:format` と `fix:lint` が互いの結果を打ち消し合う。
  本家にある `hexadecimalValue: "lowercase"` オプションは oxlint 版が未対応
- `escape-case` / `no-hex-escape` — **採用**。oxfmt は文字列リテラル内のエスケープ列に
  手を加えないため衝突しない。実際に `\u{1f600}` や `\xa9` を整形しても変化しなかった
- `numeric-separators-style` — **採用**。既定では区切りを含まない数値リテラルを対象にしないため、
  `1000000` は指摘されない

### `import-style` と `node:path`

`unicorn/import-style` は `node:path` に default import を要求する（`join` や `resolve` は
名前が汎用的で衝突しやすいため）。`scripts/commit-trailer.ts` が named import を使っていたので、
ルール側をオプションで曲げるのではなく本家の既定に合わせてコードを直した。

その結果、スキルのベースディレクトリを受けるローカル変数 `path` が
モジュールの `path` をシャドウして `no-shadow` に引っかかり、`baseDirectory` に改名した。
「`path` という名前は衝突しやすい」というルールの主張がそのまま再現された形になる。

### oxlint が未実装の unopinionated ルール（103 件）

oxlint に実装されれば採用を検討する。とくに `expiring-todo-comments` は
後述のとおり `no-warning-comments` の代わりとして待っているもの。

`better-dom-traversing` / `consistent-compound-words` / `consistent-export-decorator-position` / `consistent-optional-chaining` /
`expiring-todo-comments` / `no-accidental-bitwise-operator` / `no-array-from-fill` / `no-array-sort-for-min-max` /
`no-async-promise-finally` / `no-blob-to-file` / `no-boolean-sort-comparator` / `no-canvas-to-image` /
`no-chained-comparison` / `no-collection-bracket-access` / `no-constant-zero-expression` / `no-declarations-before-early-exit` /
`no-double-comparison` / `no-duplicate-logical-operands` / `no-error-property-assignment` / `no-exports-in-scripts` /
`no-global-object-property-assignment` / `no-impossible-length-comparison` / `no-invalid-argument-count` / `no-invalid-character-comparison` /
`no-invalid-well-known-symbol-methods` / `no-misrefactored-assignment` / `no-multiple-promise-resolver-calls` / `no-named-default` /
`no-negated-array-predicate` / `no-negated-comparison` / `no-nonstandard-builtin-properties` / `no-redundant-comparison` /
`no-shorthand-property-overrides` / `no-subtraction-comparison` / `no-top-level-side-effects` / `no-transition-all` /
`no-unnecessary-fetch-options` / `no-unnecessary-global-this` / `no-unnecessary-nested-ternary` / `no-unnecessary-polyfills` /
`no-unnecessary-string-trim` / `no-unreadable-object-destructuring` / `no-unsafe-buffer-conversion` / `no-unsafe-promise-all-settled-values` /
`no-unsafe-sqlite-interpolation` / `no-unused-array-method-return` / `no-useless-boolean-cast` / `no-useless-coercion` /
`no-useless-compound-assignment` / `no-useless-concat` / `no-useless-continue` / `no-useless-delete-check` /
`no-useless-logical-operand` / `no-useless-override` / `no-useless-re-export` / `no-useless-template-literals` /
`no-xor-as-exponentiation` / `prefer-add-event-listener-options` / `prefer-aggregate-error` / `prefer-array-from-map` /
`prefer-array-from-range` / `prefer-array-last-methods` / `prefer-await` / `prefer-block-statement-over-iife` /
`prefer-boolean-return` / `prefer-direct-iteration` / `prefer-dom-node-replace-children` / `prefer-early-return` /
`prefer-flat-math-min-max` / `prefer-global-number-constants` / `prefer-has-check` / `prefer-identifier-import-export-specifiers` /
`prefer-iterable-in-constructor` / `prefer-iterator-helpers` / `prefer-iterator-to-array-at-end` / `prefer-map-from-entries` /
`prefer-math-abs` / `prefer-math-constants` / `prefer-minimal-ternary` / `prefer-object-define-properties` /
`prefer-object-iterable-methods` / `prefer-path2d` / `prefer-promise-with-resolvers` / `prefer-queue-microtask` /
`prefer-simple-sort-comparator` / `prefer-simplified-conditions` / `prefer-single-array-predicate` / `prefer-single-replace` /
`prefer-split-limit` / `prefer-string-match-all` / `prefer-string-pad-start-end` / `prefer-string-repeat` /
`prefer-switch` / `prefer-toggle-attribute` / `prefer-unary-minus` / `prefer-url-can-parse` /
`prefer-url-href` / `prefer-url-search-parameters` / `prefer-while-loop-condition` / `require-array-sort-compare` /
`require-css-escape` / `require-passive-events` / `require-proxy-trap-boolean-return`

## default export の禁止

`import/no-default-export` を error にした。default export は import 側で自由に名前を
付け替えられるため、リネームの追跡と grep 可能性を壊す。named export なら
エディタの自動 import と一括リネームがそのまま効く。

導入時点で `src/` 配下に default export は 1 つも無く、修正は発生しなかった。
TanStack Router のファイルベースルーティングは `createFileRoute()` の結果を
`Route` という named export で返す設計なので、`src/routes/` でも default export は要らない。

例外はツールの規約で default export が必須になる 3 ファイルだけで、`overrides` で外している。

- `vite.config.ts` — Vite の設定ファイル規約
- `eslint.config.js` — ESLint の flat config 規約
- `oxlint-plugin/index.ts` — oxlint の `jsPlugins` 規約

`overrides.files` は `ignorePatterns` と同じ癖があり、**パスを含むパターンは先頭に `**/` が必要**。
`"oxlint-plugin/index.ts"` ではマッチせず `"**/oxlint-plugin/index.ts"` と書く必要がある。
`*.config.ts` のようなファイル名だけのパターンはそのまま効く。

`unicorn/no-anonymous-default-export` ではなく `import/no-anonymous-default-export` を
併用している。禁止の対象外にしたファイルの中では引き続き効くため。
`vite.config.ts` の `export default defineConfig({…})` は CallExpression なので既定で許容される。

将来 `React.lazy()` を使う場合は default export を持つモジュールが必要になるので、
`lazy(() => import("#/…").then((m) => ({ default: m.Home })))` と書くことになる。

## 設定に書いていないが有効になっているルール

`categories` で `correctness` / `suspicious` / `perf` を error にしているため、
これらのカテゴリに属するルールは `.oxlintrc.json` に書かなくても効いている。
次の 2 つはこの 1 年で suspicious に追加されたもので、意図せず有効になっている点に注意。

- `no-underscore-dangle` — `const _cache = ...` が弾かれる。ただし関数引数は対象外なので、
  未使用引数を `_unused` とする慣習は問題ない
- `no-shadow` — 外側スコープと同名の変数を禁止する。`map((value) => ...)` のような
  素直な命名が弾かれるため、煩わしければ個別に off にする

unicorn も同様で、有効な 119 件のうち 28 件は categories 由来。そのうち次の 3 件は
unopinionated に入っていないが、カテゴリの指定で結果的に効いている。

- `consistent-function-scoping` — 内側の関数を可能な限り外のスコープへ出させる
- `no-confusing-array-with` — `Array.prototype.with` の紛らわしい使い方を弾く
- `require-post-message-target-origin` — `postMessage` に targetOrigin を要求する

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
- **`no-restricted-syntax` 自体が未実装**。設定ファイルに AST セレクタを書くだけで
  独自ルールを足すことはできない。ただし JS plugin（後述）で代替できる

## JS plugin による自前ルール

`jsPlugins` に指定したファイルから、ESLint v9 互換の API で独自ルールを実装できる。
実装は `oxlint-plugin/` に置き、`local/*` として設定から参照する。

- AST traversal / セレクタ / fix / rule options / SourceCode API / スコープ解析 /
  `// oxlint-disable` / LSP のいずれも動く。**型情報を必要とするルールだけは書けない**
  （型認識ルールは oxlint-tsgolint の担当）
- 型は `@oxlint/plugins` から取る。`oxlint/plugins-dev` は `RuleTester` しか
  export しておらず、`Rule` や `Context` は参照できない。
  `@oxlint/plugins` は oxlint と同一バージョンである必要があるため、更新時は両者を揃えること
- セレクタ文字列（`"BinaryExpression[operator=/^>=?$/]"`）でハンドラを書くと、
  引数が全ノードのユニオンになって型が付かない。ノード名のハンドラを使い、
  条件は本体で判定するほうが型の恩恵を受けられる
- `jsPlugins` は alpha で semver の対象外。oxlint の更新時は動作を確認すること

実装済みのルール:

- `local/prefer-less-than` — 比較演算子の向きを `<` / `<=` に統一する。
  `eslint-plugin-etc` の `etc/prefer-less-than` 相当（本家は v2.0.3（2023-05-10）が最新で
  ほぼ更新が止まっており、導入するには ESLint 側に TypeScript パーサごと持ち込む必要があった）。
  自動修正は付けていない。オペランドの入れ替えは評価順序を変え、
  副作用のある式では意味が変わってしまうため

## 次の見直しの材料

`categories` の設定上、correctness / suspicious / perf は自動的に有効になるため、
検討が必要なのは pedantic / style / restriction / nursery の未設定ルールに限られる。

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
