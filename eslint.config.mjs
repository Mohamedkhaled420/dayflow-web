import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// Dayflow drift guard — `dayflow/no-raw-colors` (PRD §5.2)
// ------------------------------------------------------------
// Fails the build on raw hex / rgb() / hsl() string literals in
// component code. Allowed locations (DESIGN.md §1.3):
//   - src/styles/theme.css   (the token home — not linted here)
//   - src/styles/palette.ts  (category colors are DATA)
// Chained into `pnpm build` (see package.json).
// Auth pages were restyled onto tokens in Phase 2 — the exemption
// is gone; they are guarded like every other component.
// ============================================================

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(\s*\d|\boklch\(\s*\d|\boklab\(\s*\d/;

const noRawColors = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw color literals in component code — use tokens from src/styles/theme.css (PRD §5.2).",
    },
    schema: [],
    messages: {
      rawColor:
        "Raw color value '{{match}}' is not allowed in component code. Use a design token from src/styles/theme.css (PRD §5.2 / DESIGN.md §1).",
    },
  },
  create(context) {
    const check = (node, text) => {
      if (!text) return;
      const match = text.match(RAW_COLOR);
      if (match) {
        context.report({ node, messageId: "rawColor", data: { match: match[0] } });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked);
      },
    };
  },
};

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      dayflow: { rules: { "no-raw-colors": noRawColors } },
    },
    rules: {
      "dayflow/no-raw-colors": "error",
    },
  },
  {
    // Phase 0 exemption (DESIGN.md §1.3): palette.ts — category colors
    // are user-editable DATA, single-sourced there.
    files: ["src/styles/palette.ts"],
    rules: {
      "dayflow/no-raw-colors": "off",
    },
  },
  {
    rules: {
      // TypeScript rules
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/prefer-as-const": "off",
      "@typescript-eslint/no-unused-disable-directive": "off",

      // React rules
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/purity": "off",
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "react/prop-types": "off",
      "react-compiler/react-compiler": "off",

      // Next.js rules
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",

      // General JavaScript rules
      "prefer-const": "off",
      "no-unused-vars": "off",
      "no-console": "off",
      "no-debugger": "off",
      "no-empty": "off",
      "no-irregular-whitespace": "off",
      "no-case-declarations": "off",
      "no-fallthrough": "off",
      "no-mixed-spaces-and-tabs": "off",
      "no-redeclare": "off",
      "no-undef": "off",
      "no-unreachable": "off",
      "no-useless-escape": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "pnpm-install.log",
    ],
  },
];

export default eslintConfig;
