---
name: update-deps
description: mise のツールチェーンと pnpm の npm 依存をまとめて更新する。「依存を更新」「アップデート」「outdated を解消」といった依頼で使う。更新の適用と検証を段階的に行い、メジャー跨ぎはユーザーの選択を経てから 1 つずつ適用する。
allowed-tools: Bash(mise:*) Bash(pnpm:*) Bash(node:*) Bash(git:*)
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
node --run check   # lint / format / type / yaml
node --run build   # 依存更新はバンドル時に初めて壊れることがある
pnpm peers check --lockfile-only
```

失敗したら、その手順で入れた変更が原因である。まとめて先に進めず、その場でユーザーに報告する。

## 手順 1: mise の更新

```bash
mise outdated
mise upgrade
```

`mise upgrade` は `mise.toml` のバージョン指定（`latest` や `lts`）はそのままに、
`mise.lock` の実バージョンを更新する。指定自体を書き換えたい場合のみ `--bump` を使う。

更新後、node のメジャーバージョンが変わっていないか確認する。変わっていれば手順 3 で
`@types/node` を追随させる。

```bash
node --version
```

検証する。

## 手順 2: pnpm のレンジ内更新

```bash
pnpm update
```

`package.json` の `^` レンジ内で最新に上げる。レンジを超えるものはここでは上がらないので、
手順 4 で扱う。

検証する。

## 手順 3: @types/node を node に合わせる

`@types/node` は Node 本体のバージョンに対応した型定義なので、**ユーザーに確認せず自動で判別する**。
`node --version` のメジャーと `@types/node` のメジャーが一致していなければ、node 側に合わせる。
ダウングレードになる場合もそのまま実施してよい。

```bash
node --version
node -e 'console.log(require("./node_modules/@types/node/package.json").version)'
# 不一致なら node のメジャーに合わせる（例: node が v24 系なら）
pnpm add -D "@types/node@^24"
```

メジャーが一致していれば何もしない。検証する。

## 手順 4: メジャー跨ぎの個別更新

ここまでで上がらなかったものを一覧にする。

```bash
mise outdated
pnpm outdated
```

残った候補を**まとめて一覧で提示し、どれを上げるかユーザーに一度で回答してもらう**。
確認のたびに往復するのは避ける。

回答を得たら、**選ばれたものを 1 つずつ適用し、そのつど検証する**。まとめて上げてはいけない。
壊れたときにどの更新が原因か切り分けられなくなるため。

```bash
# mise のツールなら mise.toml のバージョン指定を書き換えてから
mise install
# npm 依存なら
pnpm add -D "<package>@<version>"
```

## 手順 5: コミット

差分をユーザーに報告し、コミットメッセージ案を提示する。承認を得てからコミットする
（CLAUDE.md の第 3 原則）。

```bash
git status --short
git diff --stat
```

## 注意

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
古い系列を指していても、mise は新しいメジャーを提案することがある。どちらが正しいという話では
ないので、メジャー跨ぎとして手順 4 でユーザーに判断してもらう。

### frozenLockfile

`pnpm-workspace.yaml` で `frozenLockfile: true` が有効なため、素の `pnpm install` は
lockfile を書き換えない。更新は `pnpm update` や `pnpm add` を使うこと。
