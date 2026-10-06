import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import globals from "globals";

export default defineConfig(
  { ignores: ["dist/", ".astro/", ".wrangler/", "public/vendor/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Loose row types are tracked as a separate refactor (typed schemas).
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: {
        gsap: "readonly",
        ScrollTrigger: "readonly",
        Lenis: "readonly",
      },
    },
  },
);
