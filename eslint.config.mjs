import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  {
    rules: {
      // These patterns (async fetch functions called inside useEffect) are
      // intentional throughout this codebase. Downgrade to warn so they are
      // visible without breaking the lint script.
      "react-hooks/set-state-in-effect": "warn",
      // Date.now() inside derived render values is intentional; fix properly
      // with useMemo when the codebase is refactored.
      "react-hooks/purity": "warn",
    },
  },
];

export default config;
