// テスト設定は vite.config.ts から分離している。
// テスト対象は oxlint-plugin/ と scripts/、つまり Node が直接実行するコード
// （tsconfig.node.json の担当）であり、Vite のプラグインを一つも必要としない。
// vite.config.ts にまとめると tanstackRouter が routeTree.gen.ts を生成しようと
// 動き出すなど、テストと無関係な副作用を毎回持ち込むことになる。
//
// 将来 src/ のコンポーネントテストを足す場合は、ここに projects を定義して
// node 環境と jsdom 環境を分けること。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["oxlint-plugin/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
