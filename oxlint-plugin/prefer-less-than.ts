// 比較演算子の向きを `<` / `<=` に統一するルール。
// eslint-plugin-etc の etc/prefer-less-than 相当を oxlint の JS plugin として実装したもの。
//
// `a > b` と `b < a` は同じ意味だが、向きが混在すると読み手が毎回どちらに大小が
// 開いているかを考えることになる。数直線と同じ「小さいほうが左」に揃えると、
// `min <= value && value <= max` のように範囲が視覚的に読み取れる。
//
// 自動修正は提供しない。`f() > g()` を `g() < f()` に機械的に置き換えると
// オペランドの評価順序が入れ替わり、副作用のある式では意味が変わってしまう。
// また式にコメントが含まれる場合はコメントの位置も動く。報告のみに留め、
// 書き換えは人（またはエージェント）の判断に委ねる。
import type { Rule } from "@oxlint/plugins";

/** `>` / `>=` を検出し、`<` / `<=` での記述を促すルール */
export const preferLessThan: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "比較演算子の向きを `<` / `<=` に統一する",
    },
    messages: {
      preferLessThan:
        "'{{ operator }}' ではなくオペランドを入れ替えて '{{ flipped }}' を使ってください",
    },
    schema: [],
  },
  create(context) {
    return {
      // TypeScript の型引数や JSX の閉じ括弧は BinaryExpression にならないため、
      // ここで拾われるのは値の比較だけになる。
      BinaryExpression(node) {
        if (node.operator !== ">" && node.operator !== ">=") {
          return;
        }
        context.report({
          node,
          messageId: "preferLessThan",
          data: {
            operator: node.operator,
            flipped: node.operator === ">" ? "<" : "<=",
          },
        });
      },
    };
  },
};
