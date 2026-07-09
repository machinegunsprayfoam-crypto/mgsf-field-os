import nextConfig from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    rules: {
      // React Compiler rules — these fire on the common async data-fetching pattern
      // (useEffect → async function → setState). Downgraded to warn because the pattern
      // is correct and doesn't cause actual bugs; React Compiler optimizations are optional.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default config;
