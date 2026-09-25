import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Kodun geneli henüz tam tiplenmedi; yeni kodda `any` kullanılmamalı ama eski
      // sayfalar kademeli temizlenecek — hata yerine uyarı.
      "@typescript-eslint/no-explicit-any": "warn",
      // Sayfalar veriyi useEffect içinde çekip state'e yazıyor (Supabase istemci deseni).
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/**",
  ]),
]);

export default eslintConfig;
