// コンポーネントのファイル名と、そのファイルが export する名前を一致させるルール。
//
// ファイル名が PascalCase であることは unicorn/filename-case が担保する。このルールは
// その一歩先で、`Card.tsx` なら `Card` が export されていることを要求する。両者が
// ずれていると、JSX に現れる `<Card />` から実体のファイルへたどれなくなり、
// grep でもエディタのファイル検索でも探せる場所が二重になる。
//
// 見るのは「ファイル名と同じ名前が export されているか」だけで、それがコンポーネントか
// どうかは判定しない。コンポーネント以外を export していないことは
// react/only-export-components が、関数宣言で書かれていることは
// react/function-component-definition が別途担保している。
//
// 対象を絞るのは .oxlintrc.json の overrides の役目とし、このルール自身はパスを見ない。
// ただしファイル名が PascalCase でない場合は何も報告しない。`my-button.tsx` に対して
// 「`my-button` を export せよ」と言っても直しようがなく、その形は
// unicorn/filename-case が「PascalCase にせよ」と報告する担当だからである。
//
// default export はここでは名前を拾わないため「何も export していない」扱いになるが、
// そもそも import/no-default-export がリポジトリ全体で禁止しているため実害は無い。
import type { ESTree, Rule } from "@oxlint/plugins";

/** ファイル名に許す形。unicorn/filename-case の pascalCase と同じ範囲を意図している */
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/u;

/** パスからファイル名を取り出し、拡張子を落とす */
function getBaseName(filename: string): string {
  const base = filename.split(/[/\\]/u).at(-1) ?? "";
  return base.replace(/\.[^.]+$/u, "");
}

/** export 宣言から、値として export されている名前を取り出す */
function getExportedNames(node: ESTree.ExportNamedDeclaration): string[] {
  // `export type { Card }` の形
  if (node.exportKind === "type") {
    return [];
  }

  const names: string[] = [];
  const { declaration } = node;

  if (declaration === null) {
    // `export { Card }` / `export { Card as Default }` / 他モジュールからの再 export
    for (const specifier of node.specifiers) {
      const { exported } = specifier;
      if (specifier.exportKind !== "type" && exported.type === "Identifier") {
        names.push(exported.name);
      }
    }
  } else if (declaration.type === "VariableDeclaration") {
    // `export const Card = …`。分割代入で受けた名前はコンポーネントにならないので拾わない
    for (const { id } of declaration.declarations) {
      if (id.type === "Identifier") {
        names.push(id.name);
      }
    }
  } else if (
    (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") &&
    declaration.id !== null
  ) {
    // 型エイリアスや interface はこのどちらにも当たらないため、値の export だけが集まる
    names.push(declaration.id.name);
  }

  return names;
}

/** ファイル名と同じ名前が export されていることを要求するルール */
export const componentFileName: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "コンポーネントのファイル名と export 名を一致させる",
    },
    messages: {
      noExport:
        "ファイル名と同じ名前の '{{ expected }}' を export してください。このファイルは何も export していません",
      missingMatchingExport:
        "ファイル名と同じ名前の '{{ expected }}' を export してください。export しているのは {{ exported }} です",
    },
    schema: [],
  },
  create(context) {
    const expected = getBaseName(context.filename);
    if (!PASCAL_CASE.test(expected)) {
      return {};
    }

    return {
      // export 宣言はトップレベルにしか書けないため、Program の直下だけを見れば漏れは無い
      Program(node) {
        const names = node.body.flatMap((statement) =>
          statement.type === "ExportNamedDeclaration" ? getExportedNames(statement) : [],
        );

        if (names.includes(expected)) {
          return;
        }

        if (names.length === 0) {
          context.report({ node, messageId: "noExport", data: { expected } });
          return;
        }

        context.report({
          node,
          messageId: "missingMatchingExport",
          data: { expected, exported: names.join(", ") },
        });
      },
    };
  },
};
