// component-file-name の単体テスト。
//
// このルールは filename と Program 直下の export 宣言だけを見るため、code は
// export の形のバリエーションを並べ、filename と組み合わせて検証する。
// RuleTester の使い方の前提は prefer-less-than.test.ts のコメントを参照。
//
// パーサは ESLint 既定の espree のままとしたため、`export type { Card }` のような
// TypeScript 固有の形は書けない。ルール側の exportKind の分岐はここでは覆えないが、
// 型エイリアスや interface が拾われないことは declaration の種別による分岐で
// 担保されており、そちらは `export class` などの分岐と同じ経路を通る。
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { componentFileName } from "#oxlint-plugin/component-file-name.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
});

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const rule = componentFileName as unknown as Parameters<RuleTester["run"]>[1];

/** コンポーネント置き場に見立てた絶対パスを組み立てる */
function component(name: string): string {
  return `/project/src/components/${name}`;
}

ruleTester.run("component-file-name", rule, {
  assertionOptions: { requireMessage: "messageId", requireData: "error" },

  valid: [
    { code: "export function Card() {}", filename: component("Card.tsx") },
    { code: "export const Card = () => {};", filename: component("Card.tsx") },
    { code: "export class Card {}", filename: component("Card.tsx") },
    // 同名のものが 1 つあれば、ほかに何を export していてもよい
    {
      code: "export function CardHeader() {} export function Card() {}",
      filename: component("Card.tsx"),
    },
    // 宣言と export を分けて書く形
    { code: "function Card() {} export { Card };", filename: component("Card.tsx") },
    { code: "function C() {} export { C as Card };", filename: component("Card.tsx") },
    // 他モジュールからの再 export
    { code: 'export { Card } from "#/components/Card.tsx";', filename: component("Card.tsx") },
    // ディレクトリで分けても、見るのはファイル名だけ
    { code: "export function Card() {}", filename: component("layout/Card.tsx") },
    // PascalCase でないファイル名は unicorn/filename-case の担当なので何も言わない
    { code: "export function Card() {}", filename: component("my-button.tsx") },
    { code: "export function usePosts() {}", filename: component("use-posts.ts") },
  ],

  invalid: [
    // export はあるが同名のものが無い
    {
      code: "export function Foo() {}",
      filename: component("Card.tsx"),
      output: null,
      errors: [
        {
          messageId: "missingMatchingExport",
          data: { expected: "Card", exported: "Foo" },
        },
      ],
    },
    {
      code: "export const Foo = 1; export class Bar {}",
      filename: component("Card.tsx"),
      output: null,
      errors: [
        {
          messageId: "missingMatchingExport",
          data: { expected: "Card", exported: "Foo, Bar" },
        },
      ],
    },
    // as で別名を付けると、export される側の名前で判定する
    {
      code: "const Card = 1; export { Card as Default };",
      filename: component("Card.tsx"),
      output: null,
      errors: [
        {
          messageId: "missingMatchingExport",
          data: { expected: "Card", exported: "Default" },
        },
      ],
    },
    // export が 1 つも無い
    {
      code: "function Card() {}",
      filename: component("Card.tsx"),
      output: null,
      errors: [{ messageId: "noExport", data: { expected: "Card" } }],
    },
    // 分割代入で受けた名前は拾わないため、export が無いのと同じ扱いになる
    {
      code: "const o = {}; export const { Card } = o;",
      filename: component("Card.tsx"),
      output: null,
      errors: [{ messageId: "noExport", data: { expected: "Card" } }],
    },
    // default export は名前を持たないものとして扱う（import/no-default-export の担当）
    {
      code: "export default function Card() {}",
      filename: component("Card.tsx"),
      output: null,
      errors: [{ messageId: "noExport", data: { expected: "Card" } }],
    },
  ],
});
