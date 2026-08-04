import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next ships native flat-config arrays (Linter.Config[]) as of
// this Next.js version, so they're imported and spread directly rather than
// bridged through the legacy FlatCompat().extends(...) API — that bridge
// expects older-style shareable configs and crashes (circular JSON) when
// handed a modern flat config here.
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript];

export default eslintConfig;
