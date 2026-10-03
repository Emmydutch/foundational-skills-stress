import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vercel deploy helper scripts (CommonJS, invoked directly with node):
    ".vercel-tmp/**",
    // Python virtualenv and the Streamlit edition (Python-only, not JS):
    ".venv/**",
    "streamlit_app/**",
    // Agent tooling cache:
    ".qoder/**",
  ]),
]);

export default eslintConfig;
