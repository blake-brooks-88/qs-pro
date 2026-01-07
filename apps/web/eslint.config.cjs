const baseConfig = require("@qs-pro/eslint-config");
const globals = require("globals");

module.exports = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
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
    ignores: ["dist/", "node_modules/"],
  },
];
