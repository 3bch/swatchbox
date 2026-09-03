# oxlint ルール調査メモ

`.oxlintrc.json` の設定にあたって実施した調査の記録。判断の前提を残し、
次の見直し（boundaries / project structure）でも同じ調査を繰り返さずに済むようにする。
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

プリセットを基準に選定する場合は、readme のルール表ではなく設定オブジェクトの実体を見る。
非推奨化されたルールや別名で実装されているルールがあり、表と実体がずれるため。

```sh
# typescript-eslint の場合。configs.strictTypeChecked は flat config の配列なので、
# 各要素の rules をマージしてから "off" のものを落とす
npm install typescript-eslint
node --input-type=module -e '
  import tseslint from "typescript-eslint";
  const rules = Object.assign({}, ...tseslint.configs.strictTypeChecked.map((c) => c.rules ?? {}));
  console.log(Object.entries(rules).filter(([, v]) => v !== "off").map(([k]) => k));
'
```

なお `configs.all` には非推奨のルールが含まれないため、あるルールが現行かどうかは
`all` に入っているかで判定できる。

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

## react の見直し結果

- 調査日: 2026-09-02
- 比較対象: eslint-plugin-react-hooks 7.1.1（React Compiler 由来ルールの preset 判定）

oxlint の react プラグインは 89 件（react_perf 4 件を含む）。うち 67 件が有効で、
内訳は明示 21 件と categories 由来 46 件。明示 off が 4 件、未設定のまま無効が 18 件。
unicorn と同じく、categories で自動的に有効になるものは `.oxlintrc.json` に書かない。

### 関数コンポーネントの書き方

`react/function-component-definition` で **関数宣言に固定**した。
`unnamedComponents` はアロー関数と関数式の両方を許す（HOC に渡す無名コンポーネント向け。
既定の `"function-expression"` のみだと `forwardRef(({ id }, ref) => …)` が弾かれる）。

判断の根拠は実測で確かめた次の 3 点。

- **ジェネリック** — 関数宣言は `function G<T>(props: Props<T>)` と素直に書ける。
  アローは `.tsx` で山括弧が JSX と衝突するため `<T,>` とダミーのカンマが要る。
  `FC` は型引数を束縛できず `Props<unknown>` に潰すしかなく、呼び出し側で型が失われる
  （`<G3 items={["a"]} render={(s) => s.toUpperCase()} />` が TS18046 になることを確認）
- **名前が残る** — 関数宣言は常に名前を持つ。`const A = () => {}` の名前は変数からの推論に
  依存し、HOC でラップすると匿名になって `display-name` に頼ることになる
- **巻き上げ** — 定義順に縛られない。ただしこれは条件付きで、`no-use-before-define` は
  既定で関数宣言も検出する。将来このルールを入れるなら `{ "functions": false }` が必要

アロー側の利点も実測で洗ったが、いずれも本リポジトリでは効きにくい。

- `satisfies` は式にしか付けられないため関数宣言では書けない。ただし用途が限られる
- HOC でラップするとき、宣言だと中身に別名を付けて再代入する形になり識別子が 2 つ要る。
  ただし `memo` は `no-restricted-imports` で禁止済み、`forwardRef` は React 19 で
  ref が通常の prop になったため不要で、HOC 自体がほぼ出てこない
- 「関数はすべて `const`」という一貫性は好みの問題

一方、次の 2 つはアロー側の主張として挙がるが、実測で否定された。

- **再代入・再宣言の防止** — TypeScript は関数宣言の重複も弾く（TS2393 / TS2323）。
  `const` でなければ防げないというのは成り立たない
- **async コンポーネント** — React 18 までは `ReactNode` に Promise が含まれず
  `const A: FC = async () => …` が書けなかったが、React 19 の `@types/react` は
  `ReactNode` に `Promise<AwaitedReactNode>` を含むため、宣言・アロー・FC のいずれでも通る

ヘルパー関数はこれまでどおりアロー関数でよい。`eslint/func-style` は
`["error", "declaration", { "allowArrowFunctions": true }]` のまま据え置き、
コンポーネントだけを `function-component-definition` で縛る形にしている。

### React Compiler 由来のルール

本家 eslint-plugin-react-hooks はコンパイラの診断カテゴリ 26 件それぞれに preset を
持たせている。バンドルから抽出したところ **Recommended 14 / RecommendedLatest 1 / Off 11**
という内訳で、oxlint のカテゴリ分けとは一致しない。

以前の設定で error にしていた 5 件は、いずれも本家では off だった。

| ルール                           | 判断 | 理由                                                                 |
| -------------------------------- | ---- | -------------------------------------------------------------------- |
| `hooks`                          | off  | `rules-of-hooks` と役割が重複。本体実装のほうが枯れている            |
| `capitalized-calls`              | off  | 大文字始まりの関数呼び出しを構文だけで弾き、ファクトリ関数を巻き込む |
| `memo-dependencies`              | off  | 手動メモ化を `no-restricted-imports` で禁止済みで対象コードが無い    |
| `exhaustive-effect-dependencies` | 継続 | effect の依存漏れを拾う。他ルールと重複しない                        |
| `no-deriving-state-in-effects`   | 継続 | 派生 state のアンチパターンを拾う。React 公式が戒めている内容        |

いずれも oxlint では suspicious / perf に属して自動的に有効になるため、
off にする 3 件は明示的に落とす必要がある。継続する 2 件は書かなくても効く。

逆に本家 Recommended の 14 件のうち、oxlint で有効にならないのは
`unsupported-syntax`（Compiler が対応しない構文）だけだったので明示的に足した。
残る 12 件（`immutability` / `purity` / `static-components` / `set-state-in-render` /
`set-state-in-effect` / `refs` / `globals` / `preserve-manual-memoization` /
`error-boundaries` / `incompatible-library` / `use-memo` / `void-use-memo`）は
oxlint の correctness に入っており設定なしで効いている。
`config` と `gating` は oxlint 未実装、`fbt` は Meta 社内向けなので対象外。

`syntax` / `todo` / `invariant` / `rule-suppression` は本家も off。ルールというより
コンパイラの内部診断の露出で、利用者が直せる問題を指すとは限らない。

### 追加したルール

未設定だった 34 件のうち 16 件を採用した。既存コードに当てて誤検知が出ないことは確認済み。

| 分類              | ルール                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 書き方の統一      | `function-component-definition` / `prefer-function-component` / `hook-use-state` / `jsx-pascal-case`                                                   |
| 冗長な JSX の除去 | `jsx-boolean-value` / `jsx-curly-brace-presence` / `jsx-fragments`                                                                                     |
| バグ・事故の検出  | `display-name` / `no-unknown-property` / `no-unescaped-entities` / `checked-requires-onchange-or-readonly` / `button-has-type` / `jsx-no-target-blank` |
| 非推奨 API        | `no-clone-element` / `no-react-children`                                                                                                               |
| React Compiler    | `unsupported-syntax`                                                                                                                                   |

### 見送ったルールと理由

| ルール                                                                                                                                               | 理由                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `no-set-state` / `prefer-es6-class` / `state-in-constructor` / `no-redundant-should-component-update` / `require-render-return`                      | クラスコンポーネント前提。`prefer-function-component` を入れたので不要          |
| `forbid-component-props` / `forbid-dom-props` / `forbid-elements` / `jsx-no-literals` / `jsx-props-no-spreading` / `jsx-max-depth` / `no-multi-comp` | 主張が強く、対象を列挙しないと使えないか、書き方を過度に縛る                    |
| `jsx-handler-names`                                                                                                                                  | `onClick={handleClick}` のような命名を強制する。煩わしさに見合わない            |
| `jsx-filename-extension`                                                                                                                             | 既定が `.jsx` のみ許可で、`.tsx` を通すにはオプション指定が要る。得るものが無い |
| `syntax` / `todo` / `invariant` / `rule-suppression`                                                                                                 | 上記のとおり本家も off                                                          |

## typescript の見直し結果

- 調査日: 2026-09-03
- 比較対象: typescript-eslint 8.69.0

### 方針

`strict-type-checked` をベースに、`stylistic-type-checked` から書き方を固定するものを
足した構成にした。unicorn で `unopinionated` を選んだのと同じ考え方で、プリセットの
線引きをそのまま借り、ルール単位の好みを持ち込まないようにする。

`strict-type-checked` は `recommended-type-checked` を包含し、型情報を使って
「型としては通るが意図と食い違う」コードを弾く。`stylistic-type-checked` のほうは
バグを見つけるルールではなく同じ意味の書き方を 1 つに固定するもので、
「会話が変われば書き方が揺れる」というこのリポジトリの前提と目的が一致する。

型情報を使うルールも oxlint では `categories` で有効になるため、前提条件は
`options.typeAware: true` だけで済む。設定ファイルを「type aware かどうか」で
分けておく意味がなくなったので、役割ごとの分類に組み直した。

### 突き合わせ

| 区分                            | strict-type-checked | stylistic-type-checked |
| ------------------------------- | ------------------- | ---------------------- |
| プリセットのルール数            | 68                  | 21                     |
| oxlint 1.80.0 が実装            | 64                  | 20                     |
| └ categories により自動で有効   | 33                  | 1                      |
| └ error にした（pedantic 以下） | 28                  | 17                     |
| └ 採用しなかった                | 3                   | 2                      |
| oxlint 未実装                   | 4                   | 1                      |

これに加えてプリセット外から 6 件を明示的に error にしており、5 件が categories 由来で
効いている。oxlint の typescript ルール 110 件のうち、有効なのは 90 件になった。

`.oxlintrc.json` に書くのは categories で有効にならないもの（pedantic / style /
restriction / nursery）だけ、という unicorn / react と同じ方針を typescript にも広げた。
これに伴い、これまで明示していた `await-thenable` / `no-floating-promises` /
`unbound-method` など correctness / suspicious の 13 件は設定から落とした。有効な状態は
変わらない（`--print-config` の差分で確認済み）。

### 追加したルール（15 件）

| 分類                       | ルール                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 型安全性の穴を塞ぐ         | `ban-ts-comment` / `no-dynamic-delete` / `use-unknown-in-catch-callback-variable`                                                                                         |
| 型が示す前提の検証         | `related-getter-setter-pairs`                                                                                                                                             |
| 書き方の統一               | `consistent-generic-constructors` / `consistent-type-assertions` / `class-literal-property-style` / `unified-signatures`                                                  |
| モダンな API・冗長さの除去 | `prefer-includes` / `prefer-find` / `prefer-string-starts-ends-with` / `prefer-regexp-exec` / `prefer-reduce-type-parameter` / `prefer-return-this-type` / `dot-notation` |

いずれも既存コードに違反は出なかった。

`ban-ts-comment` は `@ts-ignore` を禁じて `@ts-expect-error` と 3 文字以上の理由を要求する。
前者は対象行のエラーが消えても黙って残り続けるため、型エラーの抑止が古びていることに
気づけなくなる。deprecated になった `prefer-ts-expect-error` の役割もこのルールが引き取っている。

### oxlint 未実装の 5 件は eslint 本体のルールで埋まっている

typescript-eslint には「ESLint 本体のルールを型情報付きで置き換える」拡張ルールがあり、
oxlint はこの 5 件を typescript プラグインとして実装していない。ただし本体側のルールは
すべて oxlint にあり、categories か設定で有効になっている。

| プリセットのルール                          | oxlint での代替                 | 有効になる経路              |
| ------------------------------------------- | ------------------------------- | --------------------------- |
| `@typescript-eslint/no-unused-vars`         | `eslint/no-unused-vars`         | correctness                 |
| `@typescript-eslint/no-unused-expressions`  | `eslint/no-unused-expressions`  | correctness                 |
| `@typescript-eslint/no-useless-constructor` | `eslint/no-useless-constructor` | suspicious                  |
| `@typescript-eslint/no-array-constructor`   | `eslint/no-array-constructor`   | pedantic（設定で error）    |
| `@typescript-eslint/no-empty-function`      | `eslint/no-empty-function`      | restriction（設定で error） |

型情報を使わないぶん検出の精度は落ちるが、プリセットに対する穴は空いていない。
なお `no-unused-vars` は tsconfig の `noUnusedLocals` / `noUnusedParameters` とも重なる。

### プリセットに含まれるが採用しなかったルール

| ルール                                                           | 理由                                                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `non-nullable-type-assertion-style`                              | `no-non-null-assertion` と正面から衝突する（後述）                                                                                                     |
| `no-mixed-enums` / `prefer-literal-enum-member` / `no-namespace` | tsconfig の `erasableSyntaxOnly` が `enum` と `namespace` の構文自体を禁じており（TS1294）、対象コードが生まれない。実際に書いて弾かれることを確認した |
| `ban-tslint-comment`                                             | TSLint は 2019 年に非推奨化されており、`/* tslint:disable */` が新しく書かれることはない                                                               |

### プリセット外で採用しなかったルール

oxlint が実装する typescript ルールのうち、プリセットにも入らず今回も見送ったもの。

| ルール                                                                            | 理由                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ban-types` / `no-empty-interface` / `no-var-requires` / `prefer-ts-expect-error` | typescript-eslint v8 で削除済み。役割は `no-restricted-types` / `no-empty-object-type` / `no-require-imports` / `ban-ts-comment` が引き継いでおり、後ろ 3 つは採用済み |
| `explicit-function-return-type` / `explicit-module-boundary-types`                | 戻り値の型推論を捨てることになる。型注釈は表現したい制約がある場所にだけ書きたい                                                                                       |
| `explicit-member-accessibility` / `parameter-properties` / `prefer-readonly`      | class 前提のルール。React コンポーネントは関数で書く方針なので対象がほぼ無い                                                                                           |
| `prefer-readonly-parameter-types`                                                 | すべての引数に `readonly` を要求する。得られる保証に対して型の記述量が見合わない                                                                                       |
| `no-restricted-types`                                                             | 禁止したい型を自分で列挙しない限り何もしない。禁止したい型が出てきたら設定する                                                                                         |
| `promise-function-async`                                                          | Promise を返す関数に `async` を強制する。`async` を付けない委譲（`return fetch(…)`）を書けなくする                                                                     |
| `no-unnecessary-qualifier` / `prefer-enum-initializers`                           | `enum` / `namespace` 前提。上と同じ理由で対象コードが無い                                                                                                              |
| `strict-void-return`                                                              | `no-misused-promises` とほぼ重複する（後述）                                                                                                                           |

### 重複・衝突するルールの判定

いずれも実際に oxlint へ通して検出位置を確かめた。

- `non-nullable-type-assertion-style` × `no-non-null-assertion` — **前者を採用しない**。
  `maybe as string` に対して前者が「`!` を使え」と言い、`maybe!` に対して後者が「`!` を使うな」と言う。
  同じ probe で 8 行目と 9 行目に交互にエラーが出て、どちらの書き方も残せなくなった。
  `no-non-null-assertion` と `no-unsafe-type-assertion` を優先し、非 null の絞り込みは
  型ガードで書く方針を取る
- `typescript/prefer-includes` × `unicorn/prefer-includes` — **typescript 版に寄せ、unicorn 版を off**。
  `arr.indexOf("x") !== -1` は両方が検出したが、`/foo/.test(s)` を `String#includes()` に
  寄せられるのは型情報を持つ typescript 版だけだった。上位互換なので併用する意味がない
- `strict-void-return` × `no-misused-promises` — **`strict-void-return` を採用しない**。
  Promise を返す関数を void 期待の位置に渡すケース（`cb(async () => …)`、JSX の
  `onClick={async () => …}`、`forEach(async …)`）で検出行が完全に一致した。
  差が出たのは `cb(() => num())` のような Promise 以外の非 void 戻り値だけで、
  そのために同じ箇所へ 2 つのエラーを出す構成にはしない。
  typescript-eslint 側でもまだどのプリセットにも入っていないため、収録されたら再検討する
- `typescript/dot-notation` × tsconfig の `noPropertyAccessFromIndexSignature` — **衝突しない**。
  index signature 経由の `rec["key"]` は指摘せず、宣言済みプロパティの `obj["known"]` だけを
  指摘した。既定のオプションのままで両立する
- `typescript/require-array-sort-compare` — categories（correctness）で有効になっている。
  unicorn の同名ルールを入れていないのは unicorn の節に書いたとおり

### プリセット外から残しているルール（6 件）

- `consistent-type-imports` / `consistent-type-exports` / `no-import-type-side-effects` —
  tsconfig の `verbatimModuleSyntax` と組で、型の import / export を `type` 付きに固定する。
  トランスパイル時に消える import が構文から一目で分かる状態を保つ
- `method-signature-style` — インタフェースのメソッドをプロパティ形式に統一する。
  メソッド形式は引数の型が bivariant に扱われ、型検査が緩くなる
- `strict-boolean-expressions` — 条件式に boolean 以外を書かせない。空文字や `0` が
  暗黙に falsy になる事故を潰す。`strict-type-checked` にも入っていない主張の強いルールだが、
  前回までの方針を引き継いで残した
- `switch-exhaustiveness-check` — ユニオン型に対する `switch` の網羅性を要求する。
  tsconfig の `noFallthroughCasesInSwitch` は網羅性までは見ない

### 検討時に確認した挙動

- `no-confusing-void-expression`（設定済み）は `onClick={() => setCount(1)}` を弾く。
  `setCount` の戻り値が void でも、アロー関数の省略記法で void 式を返す形が対象になるため。
  React のイベントハンドラで頻出する書き方なので、本家の `ignoreArrowShorthand` を
  付けるかどうかを検討したが、**付けないことにした**。詳細は次節
- `consistent-type-assertions` は既定で `assertionStyle: "as"`。`<string>x` は `.tsx` で
  そもそも書けないため、実質 `.ts` 側の統一に効く
- `no-dynamic-delete` は `delete rec[s]` のような動的キーの削除を弾く。
  キーが動的な入れ物は `Map` / `Set` で持つ、という設計上の指針として入れた

### `no-confusing-void-expression` を既定のまま使う理由

React のイベントハンドラを `onClick={() => { setCount(1); }}` と書かせるのは
煩わしいのではないか、という点を実測で検討した。結論は既定のまま使う。

**1. `--fix` が波括弧を付けてくれる**

このルールには自動修正がある。省略記法で書いても `fix:lint` が機械的に直す。

```diff
-export const cb = () => setCount(2);
+export const cb = () =>{  setCount(2); };
```

インデントは崩れるが、これは他のルールと同じで `fix:format` が整える。
「冗長な生成コードは `--fix` で機械的に潰し、レビューの目を本質に向ける」という
このリポジトリの方針にそのまま乗るため、手で直す場面が生じない。
オプションを付ける動機だった煩わしさが、そもそも成立しなかった。

**2. オプションは危険なケースまで一緒に通す**

`ignoreArrowShorthand` はアロー関数の省略記法かどうかしか見ないため、
許したいものと弾いてほしいものを選り分けられない。

| コード                                  | 既定 | `ignoreArrowShorthand` |
| --------------------------------------- | ---- | ---------------------- |
| `onClick={() => setCount(1)}`           | 検出 | 通る                   |
| `useEffect(() => setCount(1), [])`      | 検出 | 通る                   |
| `[1, 2].map((n) => log(n))`（`void[]`） | 検出 | 通る                   |

`useEffect` の戻り値は React がクリーンアップ関数と解釈する位置であり、
`map` のほうは使い道のない `void[]` を作る。どちらも残しておきたい指摘だった。

**3. 代替オプションでも的を絞れない**

- `ignoreVoidReturningFunctions` — 上の 3 ケースすべてを通す。呼び出し先が void を
  返す関数かどうかだけを見るため、省略記法以外の位置でも緩む。`ignoreArrowShorthand`
  より広い
- `ignoreVoidOperator` — メッセージが「`void` 演算子で明示せよ」に変わるだけで、
  対象は減らない。`() => void setCount(1)` は波括弧より読みにくい

**4. 型チェックとの守備範囲の切り分け**

本当に事故になる `useEffect(() => setTimeout(f, 100))` は tsc が弾く。

```
error TS2322: Type 'number' is not assignable to type 'void | Destructor'.
```

つまりこのルールが担うのは、型としては合法な範囲での読みやすさと事故防止になる。
自動修正がある以上、この守備範囲は維持しておく価値がある。

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

typescript は有効な 90 件のうち 39 件が categories 由来。うち 5 件
（`consistent-return` / `no-unnecessary-parameter-property-assignment` /
`no-unsafe-type-assertion` / `no-useless-empty-export` / `require-array-sort-compare`）は
strict / stylistic のどちらのプリセットにも入っていないが、カテゴリの指定で効いている。

react はこの傾向がさらに強く、有効な 67 件のうち 46 件が categories 由来。
React Compiler 由来のルールの多くが correctness に入っているためで、
`purity` や `immutability` のように設定に一度も現れないまま効いているものがある。

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
