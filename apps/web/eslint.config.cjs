const baseConfig = require("@qs-pro/eslint-config");
const globals = require("globals");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const jsxA11y = require("eslint-plugin-jsx-a11y");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  ...baseConfig,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  jsxA11y.flatConfigs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // ═══════════════════════════════════════════════════════════════
      // REACT HOOKS - Critical for correctness
      // ═══════════════════════════════════════════════════════════════
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // ═══════════════════════════════════════════════════════════════
      // REACT - Best practices
      // ═══════════════════════════════════════════════════════════════
      "react/prop-types": "off",
      "react/jsx-no-leaked-render": "error",
      "react/no-array-index-key": "warn",
      "react/self-closing-comp": "error",
      "react/jsx-curly-brace-presence": ["error", { props: "never", children: "never" }],

      // ═══════════════════════════════════════════════════════════════
      // TYPE-AWARE RULES - Catch real bugs (requires projectService)
      // ═══════════════════════════════════════════════════════════════
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",

      // ═══════════════════════════════════════════════════════════════
      // PROJECT-SPECIFIC
      // ═══════════════════════════════════════════════════════════════
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              message: "Use @solar-icons/react for icons in @qs-pro/web.",
            },
            {
              name: "solar-icon-react",
              message: "Use @solar-icons/react for Solar icons in @qs-pro/web.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "eslint.config.cjs", "*.config.*"],
  },
);
