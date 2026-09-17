# スタイリングと UI 部品

## スタイリング

Tailwind CSS v4 を使う。

- shadcn/ui が Tailwind を前提にしている
- 箱の絵は SVG の属性で描くため、Tailwind は UI 部品にだけ使う
- ダークモードは作らない
- クラス名の並べ替えは oxfmt の `sortTailwindcss` で行う（`cn` の引数も対象にする）

## UI 部品

shadcn/ui を Base UI で使う。

- スタイルは、初期化した後で変えにくい
    - スタイルは CSS だけでなく、部品のコード（余白、高さ、角丸）を書き換える
    - ベースカラーとアイコンは、`migrate` で後から変えられる
- そのため、デザインシステムを決めてから導入する
- 使う部品は、画面ごとのデザインを決めてから選ぶ

### 初期化の方式

CLI の init で、スタイルを Maia にする。
shadcn は devDependencies に入れてあるので、`pnpm exec` で実行する。

- Maia は角が丸く、余白がゆったりしていて、このアプリの雰囲気に近い
- 公式サイトの create でもプリセットを作れるが、使わない
    - 色とフォントはデザインシステムの値で上書きするので、選ぶ意味が薄い
- Maia の値に揃えられるものは揃え、上書きする量を減らす

### 初期化の手順

init のあいだだけ、`tsconfig.json` に `@/*` のエイリアスを足す。

1. `tsconfig.json` に `"compilerOptions": { "paths": { "@/*": ["./src/*"] } }` を足す
2. `pnpm exec shadcn init --base base --preset maia` を実行する
3. `components.json` の aliases の `@/` を `#/` に書き換える
4. `tsconfig.json` に足した `paths` を消す

- `#/*` のままだと、init がエイリアスを読み取れず、昔の対話形式の質問に進んでしまう
    - `package.json` の imports の `#/*` も、tsconfig の paths の `#/*` も読み取れない
    - `components.json` を先に書いておいても、init は消して作り直すので使われない
- `components.json` の aliases が `#/` なら、`shadcn add` はそのまま動く
- `--template vite` は付けなくてよい（既存のプロジェクトは Vite として認識される）
- init で作られるのは `components.json` と `src/lib/utils.ts` で、`src/index.css` は書き換えられる

### init で入るもの

| 項目     | 内容                                                                   |
| -------- | ---------------------------------------------------------------------- |
| アイコン | Hugeicons（`@hugeicons/react`、`@hugeicons/core-free-icons`）          |
| フォント | Figtree（`@fontsource-variable/figtree`）                              |
| `cn`     | `cn` パッケージ（clsx と tailwind-merge の置き換え、shadcn-ui が公開） |

- アイコンは Maia の初期値の Hugeicons のままにする
    - 角が丸いやわらかい線で、このアプリの雰囲気に合う
    - 変えたくなったら `migrate icons` で変えられる
- フォントの Figtree は、デザインシステムの値（Zen Maru Gothic）に置き換える
- 部品は `cn` パッケージから直接 import するので、`src/lib/utils.ts` は使われていない
    - init で作られるファイルなので、消さずに残す

### 生成コードの扱い

| 対象                 | lint   | フォーマット | 型チェック                         |
| -------------------- | ------ | ------------ | ---------------------------------- |
| `src/components/ui/` | しない | しない       | する（引っかかったら外してもよい） |
| `src/lib/utils.ts`   | する   | する         | する                               |

- フォーマットの対象から外すと、lint と揃い、再インストールしても差分が出ない
- 型チェックは、tsconfig の exclude だけでは外せない（import されると対象になる）
    - 外すときは、別の tsconfig にするか、該当のオプションを全体で緩める

## 導入するときに確かめたこと

2026-09 に shadcn 4.21.0 で確かめた内容。

| 項目                          | 確かめたこと                                                              |
| ----------------------------- | ------------------------------------------------------------------------- |
| `@tailwindcss/vite` と Vite 8 | 4.3.3 の peer 依存が Vite 8 を含む                                        |
| Base UI と React 19           | `@base-ui/react` 1.8.0 の peer 依存が React 19 を含む                     |
| `#/` のエイリアス             | `components.json` に書けば `add` は動くが、init では読み取れない          |
| `#/lib/utils` の解決          | 部品は `cn` パッケージを直接 import するので、問題にならない              |
| Vite 向けの公式手順           | vite.config.ts の alias は要らない。paths は init のあいだだけ足す        |
| `--preset maia`               | `maia` をそのまま渡せる（`base-maia` はエラー）。`--base base` と合わせる |
