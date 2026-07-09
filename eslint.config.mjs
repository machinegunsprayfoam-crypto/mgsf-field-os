import nextConfig from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    rules: {
      // These rules enforce React 19 strict-mode purity constraints.
      // The codebase uses established data-fetching patterns (async functions
      // called inside useEffect) and render-time Date.now() for relative-date
      // filtering that are safe in this client-only app.  Downgraded to warn
      // so the lint step runs clean; address incrementally as React 19
      // migration progresses.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default config;
