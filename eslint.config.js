import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ["**/dist/", "**/node_modules/", "**/*.js", "**/*.cjs", "!eslint.config.js"],
  },
  {
    files: ["**/*.ts"],
    rules: {
      // Relax rules that conflict with existing codebase patterns
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["error", "warn"] }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", minimumDescriptionLength: 10 },
      ],
    },
  },
  {
    // Bridge-plugin uses Figma globals, eval, and targets ES2015 (var)
    files: ["packages/bridge-plugin/**/*.ts"],
    rules: {
      "no-eval": "off",
      "no-var": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Test files can use any
    files: ["**/__tests__/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
