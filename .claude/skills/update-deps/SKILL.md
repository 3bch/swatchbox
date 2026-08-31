---
name: update-deps
description: 明示的に update-deps という名前で指定された場合のみ起動する。
disable-model-invocation: true
---

# 依存の更新

mise が管理するツールチェーン（node / pnpm / lefthook など）と、pnpm が管理する npm 依存を
更新する。mise が node と pnpm 自体を管理しているため、**必ず mise から先に更新する**。
古い pnpm で lockfile を書き換えてしまうのを避けるため。

## 前提

作業ツリーが clean であることを確認する。更新差分だけをコミットしたいため。

```bash
git status --short
```

clean でなければユーザーに報告し、指示を仰ぐ。

## 検証

以降の各手順で「検証する」と書かれている箇所では、次の 3 つをこの順で実行する。

```bash
mise exec -- node --run check   # lint / format / type / yaml
mise exec -- node --run build   # 依存更新はバンドル時に初めて壊れることがある
mise exec -- pnpm peers check --lockfile-only
```

失敗したら、その手順で入れた変更が原因である。まとめて先に進めず、その場でユーザーに報告する。

手順 1 以降はすべてのコマンドを `mise exec --` 経由で実行すること。理由は下の注意を参照。

## 手順 1: mise の更新

```bash
mise outdated
mise upgrade
```

`mise upgrade` は `mise.toml` のバージョン指定（`latest` や `lts`）はそのままに、
`mise.lock` の実バージョンを更新する。指定自体を書き換えたい場合のみ `--bump` を使う。

`latest` 指定のツールは**メジャー跨ぎでもそのまま上がる**。それが `latest` 指定の意図なので、
事前確認はしない。上がったものは更新後の報告に含めること。

### lefthook が更新されたらフックを再生成する

`.git/hooks/*` には lefthook の実体への**絶対パスが埋め込まれている**。mise は旧バージョンの
ディレクトリを削除するため、再生成しないとフックが動かなくなる。

```bash
mise exec -- lefthook install
grep -n 'installs/lefthook' .git/hooks/pre-commit   # 新しいバージョンを指しているか確認
```

### node のメジャー確認

```bash
mise exec -- node --version
```

メジャーが変わっていれば手順 3 で `@types/node` を追随させる。

検証する。

## 手順 2: pnpm のレンジ内更新

```bash
mise exec -- pnpm update
```

`package.json` の `^` レンジ内で最新に上げる。レンジを超えるものはここでは上がらないので、
手順 4 で扱う。

検証する。

## 手順 3: @types/node を node に合わせる

`@types/node` は Node 本体のバージョンに対応した型定義なので、**ユーザーに確認せず自動で判別する**。
`node --version` のメジャーと `@types/node` のメジャーが一致していなければ、node 側に合わせる。
ダウングレードになる場合もそのまま実施してよい。

```bash
mise exec -- node --version
mise exec -- node -e 'console.log(require("./node_modules/@types/node/package.json").version)'
# 不一致なら node のメジャーに合わせる（例: node が v24 系なら）
mise exec -- pnpm add -D "@types/node@^24"
```

メジャーが一致していれば何もしない。検証する。

## 手順 4: 自動で上がらなかったものの個別更新

ここまでで上がらなかったものを一覧にする。

```bash
mise outdated
mise exec -- pnpm outdated
```

`@types/node` は手順 3 で node に合わせているため、node より新しい版が残り続ける。
**これは意図した状態なので確認対象から除外する**。

残った候補を**まとめて一覧で提示し、どれを上げるかユーザーに一度で回答してもらう**。
確認のたびに往復するのは避ける。

回答を得たら、**選ばれたものを 1 つずつ適用し、そのつど検証する**。まとめて上げてはいけない。
壊れたときにどの更新が原因か切り分けられなくなるため。

```bash
# npm 依存なら
mise exec -- pnpm add -D "<package>@<version>"
```

## 手順 5: コミット

差分をユーザーに報告し、コミットメッセージ案を提示する。承認を得てからコミットする
（CLAUDE.md の第 3 原則）。コミットも `mise exec --` 経由で行う。lefthook がフックから
呼ばれるため、PATH が古いままだとフックが失敗する。

```bash
git status --short
git diff --stat
mise exec -- git commit -m "..."
```

## 注意

### mise upgrade 後は PATH が古いディレクトリを指したままになる

mise は更新時に旧バージョンのディレクトリを削除するが、実行中のシェルの `PATH` は
起動時に解決されたパスを保持している。そのため更新後は `pnpm: command not found` の
ように、更新したツールが軒並み見つからなくなる。

```bash
# PATH が指している先（削除済み）
/home/vscode/.local/share/mise/installs/pnpm/11.24.0
```

シェルを起動し直せない環境が多いので、**手順 1 以降はすべて `mise exec --` を経由する**。
`git commit` も例外ではない（フックから lefthook を呼ぶため）。

### outdated が示す Latest は更新可能なバージョンそのもの

このリポジトリはリリース直後のバージョンを避ける設定を 3 箇所に持つ。

| 設定                         | 場所                  |
| ---------------------------- | --------------------- |
| `minimum_release_age = "2d"` | `mise.toml`           |
| `minimumReleaseAge: 2880`    | `pnpm-workspace.yaml` |
| `min-release-age=2`          | `.npmrc`              |

`mise outdated` と `pnpm outdated` はこの設定を**適用したうえで** Latest 列を表示する。
つまり表示されたバージョンはそのまま更新でき、registry の実際の最新版とは異なることがあるが、
それは意図した除外である。「outdated に出ているのに上がらない」という状況にはならない。

### mise と npm でバージョンの見え方が食い違うことがある

mise はツールごとに backend が異なる（`mise registry <tool>` で確認できる）。例えば pnpm は
`aqua:pnpm/pnpm`（GitHub releases）を第一候補とするため、npm の dist-tag `latest` がまだ
古い系列を指していても、mise は新しいメジャーを提案することがある。どちらかが誤りという話では
ないので、mise 側の判断に従ってよい。

### frozenLockfile

`pnpm-workspace.yaml` で `frozenLockfile: true` が有効なため、素の `pnpm install` は
lockfile を書き換えない。更新は `pnpm update` や `pnpm add` を使うこと。
