// このリポジトリ専用の oxlint プラグイン。
//
// oxlint の JS plugin は ESLint v9 互換の API を持つが、型情報を必要とするルールは
// 書けない（型認識ルールは oxlint-tsgolint の担当）。純粋な構文ルールに限って、
// oxlint 本体にも ESLint 本体にも無いものをここに置く。
//
// 型は @oxlint/plugins から取る。同パッケージは definePlugin などの関数も提供するが、
// 実行時は値を素通しするだけなので、型のみを import して実行時依存を持たない。
// oxlint と同一バージョンである必要があるため、更新時は両者を揃えること。
//
// jsPlugins は alpha であり semver の対象外のため、oxlint の更新時は
// このプラグインが動作することを確認すること。
import type { Plugin } from "@oxlint/plugins";

import { preferLessThan } from "#oxlint-plugin/prefer-less-than.ts";
import { routesStructure } from "#oxlint-plugin/routes-structure.ts";

/** .oxlintrc.json の jsPlugins から読み込まれるプラグイン定義 */
const plugin: Plugin = {
  meta: { name: "local" },
  rules: {
    "prefer-less-than": preferLessThan,
    "routes-structure": routesStructure,
  },
};

export default plugin;
