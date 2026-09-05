// routes-structure の単体テスト。
//
// このルールが見るのは context.filename だけでコードの中身は見ないため、code は空にして
// filename だけを変えたケースを並べる。RuleTester の使い方の前提は
// prefer-less-than.test.ts のコメントを参照。
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { routesStructure } from "#oxlint-plugin/routes-structure.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
});

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const rule = routesStructure as unknown as Parameters<RuleTester["run"]>[1];

/** src/routes/ からの相対パスを、検査対象になる絶対パスに直す */
function routes(relative: string): string {
  return `/project/src/routes/${relative}`;
}

const ROUTE_FILES = "route.tsx / index.tsx";

ruleTester.run("routes-structure", rule, {
  assertionOptions: { requireMessage: "messageId", requireData: "error" },

  valid: [
    { code: "", filename: routes("__root.tsx") },
    { code: "", filename: routes("(root)/index.tsx") },
    { code: "", filename: routes("(root)/route.tsx") },
    // `.` つなぎと `$` 付きの動的セグメント
    { code: "", filename: routes("posts.$postId/route.tsx") },
    // `-` 始まりのディレクトリの直下はファイルなら何でもよい
    { code: "", filename: routes("(root)/-components/Home.tsx") },
    { code: "", filename: routes("posts/-hooks/use-posts.ts") },
    // routes の外は対象外
    { code: "", filename: "/project/src/main.tsx" },
    { code: "", filename: "/project/src/components/ui/button.tsx" },
    // ディレクトリ名の一部が routes でも起点にはしない
    { code: "", filename: "/project/src/routes-helper/index.ts" },
  ],

  invalid: [
    // routes 直下のファイルは __root.tsx のみ
    {
      code: "",
      filename: routes("index.tsx"),
      output: null,
      errors: [
        {
          messageId: "unexpectedTopLevelFile",
          data: {
            rootFile: "__root.tsx",
            routeFiles: ROUTE_FILES,
            name: "index.tsx",
          },
        },
      ],
    },
    // 共有部品の置き場を routes 直下に作らせない
    {
      code: "",
      filename: routes("-components/Shared.tsx"),
      output: null,
      errors: [
        {
          messageId: "unexpectedTopLevelDirectory",
          data: { name: "-components" },
        },
      ],
    },
    // route ディレクトリの直下にルート定義以外を置いた
    {
      code: "",
      filename: routes("posts/Card.tsx"),
      output: null,
      errors: [
        {
          messageId: "unexpectedRouteFile",
          data: { routeFiles: ROUTE_FILES, name: "Card.tsx" },
        },
      ],
    },
    // route ディレクトリの入れ子
    {
      code: "",
      filename: routes("posts/detail/route.tsx"),
      output: null,
      errors: [
        {
          messageId: "nestedRouteDirectory",
          data: { suggestion: "posts.detail" },
        },
      ],
    },
    // 入れ子が深い場合も、まず入れ子であることを報告する
    {
      code: "",
      filename: routes("posts/detail/-components/Card.tsx"),
      output: null,
      errors: [
        {
          messageId: "nestedRouteDirectory",
          data: { suggestion: "posts.detail" },
        },
      ],
    },
    // `-` 始まりのディレクトリの中の入れ子
    {
      code: "",
      filename: routes("posts/-components/parts/Card.tsx"),
      output: null,
      errors: [
        {
          messageId: "tooDeep",
          data: { path: "parts/Card.tsx" },
        },
      ],
    },
  ],
});
