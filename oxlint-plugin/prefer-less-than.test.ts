// prefer-less-than の単体テスト。
//
// oxlint 本体にも @oxlint/plugins にも RuleTester は無いが、oxlint の JS plugin は
// ESLint v9 互換の API を持つため、ESLint 本体の RuleTester でそのまま検証できる。
// eslint は yaml のチェック用に既に devDependency にあり、テストのための追加依存は無い。
//
// パーサは ESLint 既定の espree のままとする。このルールが見るのは BinaryExpression
// だけで TypeScript 固有の構文を必要としないため、TS パーサを足す理由が無い。
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { preferLessThan } from "#oxlint-plugin/prefer-less-than.ts";

// RuleTester は describe / it をグローバルから探すが、vitest は globals を有効に
// しない限りグローバルを生やさないため、明示的に注入する。
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
});

// oxlint の Rule 型と ESLint の RuleDefinition 型は互いに代入できない。oxlint 側の
// Context が ESLint v10 で削除された getFilename() などを持ち、meta.fixable も null を
// 許す、といった型の差分によるもの。一方 RuleTester が実行時に渡すのは ESLint の
// context であり、このルールが触るのは context.report だけなので実害は無い。
// 型の橋渡しのためだけの変換であることを明示するため、ここでのみ二重アサーションを使う
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const rule = preferLessThan as unknown as Parameters<RuleTester["run"]>[1];

ruleTester.run("prefer-less-than", rule, {
  // 各 errors がメッセージと data を必ず検証するよう強制する。
  // 件数だけ合っていて中身を見ていないテストを防ぐため
  assertionOptions: { requireMessage: "messageId", requireData: "error" },

  valid: [
    "a < b;",
    "a <= b;",
    "a === b;",
    "a !== b;",
    // ルールの狙いである「小さいほうが左」の形
    "min <= value && value <= max;",
    // シフト演算子は operator が ">>" / ">>>" であり比較ではない
    "a >> b;",
    "a >>> b;",
    // 代入形のシフトは BinaryExpression ですらない
    "a >>= b;",
  ],

  invalid: [
    {
      code: "a > b;",
      // 自動修正は提供しないため、出力が入力と変わらないことを固定する
      output: null,
      errors: [
        {
          messageId: "preferLessThan",
          data: { operator: ">", flipped: "<" },
          // 報告範囲は比較式全体
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 6,
        },
      ],
    },
    {
      code: "a >= b;",
      output: null,
      errors: [
        {
          messageId: "preferLessThan",
          data: { operator: ">=", flipped: "<=" },
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 7,
        },
      ],
    },
    // 一つの式に複数含まれる場合はすべて報告する
    {
      code: "a > b && c >= d;",
      output: null,
      errors: [
        { messageId: "preferLessThan", data: { operator: ">", flipped: "<" } },
        { messageId: "preferLessThan", data: { operator: ">=", flipped: "<=" } },
      ],
    },
  ],
});
