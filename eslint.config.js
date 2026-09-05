import yml from "eslint-plugin-yml";
import { defineConfig, globalIgnores } from "eslint/config";

/** YAML ファイルのみを対象とする ESLint 設定 */
export default defineConfig([
  // ESLint は設定の files に関わらず js/mjs/cjs を既定で走査するため、
  // JS/TS は oxlint の担当として除外する。
  // .playwright-cli は playwright-cli がスナップショットを吐く場所で、gitignore 済み
  // だが ESLint は gitignore を見ないため、ここでも除外する
  globalIgnores(["pnpm-lock.yaml", "**/*.{js,mjs,cjs}", ".playwright-cli"], "app/ignores"),
  {
    name: "app/yaml",
    files: ["**/*.yaml", "**/*.yml"],
    extends: [yml.configs["flat/standard"]],
    languageOptions: {
      parserOptions: { defaultYAMLVersion: "1.2" },
    },
    rules: {
      "yml/file-extension": ["error", { extension: "yaml" }],
      "yml/quotes": ["error", { prefer: "single", avoidEscape: true }],
      "yml/plain-scalar": ["error", "never", { overrides: { mappingKey: "always" } }],
    },
  },
]);
