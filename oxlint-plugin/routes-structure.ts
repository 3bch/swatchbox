// src/routes/ 以下のディレクトリ構成を縛るルール。
//
// TanStack Router のファイルベースルーティングは、`.` つなぎのフラットな書き方と
// ディレクトリの入れ子のどちらでも同じ URL を表現できる。両方が混ざるとルートの実体を
// 探すのに routes/ を上から下まで見ることになるため、次の形だけを許す。
//
//     src/routes/
//     ├── __root.tsx                  ← ジェネレータが要求する唯一の直下ファイル
//     └── posts.$postId/              ← URL は `.` つなぎで表し、ディレクトリは入れ子にしない
//         ├── route.tsx               ← route.tsx / index.tsx のどちらか（両方でもよい）
//         └── -components/            ← ルートにならない置き場。`-` 始まりのみ
//             └── PostCard.tsx        ← 直下にファイルのみ。さらなる入れ子は不可
//
// ページ本体をルートファイルに直書きするか `-components/` へ分けるかは規模を見て決める。
// `-components/` は「このページを構成する部品」の置き場という位置づけ。
// 一方 routes 直下に `-` 始まりのディレクトリを許すと、複数ルートで使う部品の置き場が
// src/components/ と二重になるため、そちらは禁止している。
//
// 検査するのは context.filename だけで、ファイルの中身も AST も見ない。そのため oxlint が
// lint する .ts / .tsx だけが対象になり、`-` 始まりのディレクトリに置いた .css などは
// 検査されない。全拡張子を見るには ESLint 側にダミーパーサを立てる必要がある。
import type { Rule } from "@oxlint/plugins";

// ルートの起点。Windows 由来の `\` 区切りも受けられるようにしている
const ROUTES_DIR_PATTERN = /(?:^|[/\\])src[/\\]routes[/\\](.+)$/u;

/** ジェネレータが要求する、routes 直下に置ける唯一のファイル */
const ROOT_ROUTE_FILE = "__root.tsx";

/** route ディレクトリの直下に置けるルート定義ファイル */
const ROUTE_FILES = ["route.tsx", "index.tsx"];

/** ファイルパスを src/routes/ からの相対セグメントに分解する。 routes 配下でなければ null を返す。 */
function getRouteSegments(filename: string): string[] | null {
  const relative = ROUTES_DIR_PATTERN.exec(filename)?.[1];
  if (relative === undefined) {
    return null;
  }

  return relative.split(/[/\\]/u);
}

/** src/routes/ 以下のディレクトリ構成を統一するルール */
export const routesStructure: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "src/routes/ 以下のディレクトリ構成を統一する",
    },
    messages: {
      unexpectedTopLevelFile:
        "routes 直下に置けるファイルは {{ rootFile }} だけです。'{{ name }}' はディレクトリを作ってその中の {{ routeFiles }} にしてください",
      unexpectedTopLevelDirectory:
        "routes 直下に '-' 始まりのディレクトリは置けません。'{{ name }}' の中身は、使うルートのディレクトリの下か、複数のルートで使うなら src/components/ へ移してください",
      unexpectedRouteFile:
        "route ディレクトリの直下に置けるのは {{ routeFiles }} だけです。'{{ name }}' は '-' 始まりのディレクトリへ移してください",
      nestedRouteDirectory:
        "route ディレクトリの入れ子は禁止です。'{{ suggestion }}' のように '.' でつないだ 1 つのディレクトリにしてください",
      tooDeep:
        "'-' 始まりのディレクトリの中は入れ子にできません。'{{ path }}' を直下へ移してください",
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const segments = getRouteSegments(context.filename);
        if (segments === null) {
          return;
        }

        const [routeDir, child, grandchild] = segments;
        // 正規表現が 1 文字以上にマッチしている以上 undefined にはならないが、
        // noUncheckedIndexedAccess のため型の上では起こりうる
        if (routeDir === undefined) {
          return;
        }

        // routes 直下のファイル
        if (child === undefined) {
          if (routeDir !== ROOT_ROUTE_FILE) {
            context.report({
              node,
              messageId: "unexpectedTopLevelFile",
              data: {
                rootFile: ROOT_ROUTE_FILE,
                routeFiles: ROUTE_FILES.join(" / "),
                name: routeDir,
              },
            });
          }
          return;
        }

        if (routeDir.startsWith("-")) {
          context.report({
            node,
            messageId: "unexpectedTopLevelDirectory",
            data: { name: routeDir },
          });
          return;
        }

        // route ディレクトリの直下
        if (grandchild === undefined) {
          if (!ROUTE_FILES.includes(child)) {
            context.report({
              node,
              messageId: "unexpectedRouteFile",
              data: { routeFiles: ROUTE_FILES.join(" / "), name: child },
            });
          }
          return;
        }

        if (!child.startsWith("-")) {
          context.report({
            node,
            messageId: "nestedRouteDirectory",
            data: { suggestion: `${routeDir}.${child}` },
          });
          return;
        }

        // `-` 始まりのディレクトリの中はファイルのみ
        if (3 < segments.length) {
          context.report({
            node,
            messageId: "tooDeep",
            data: { path: segments.slice(2).join("/") },
          });
        }
      },
    };
  },
};
