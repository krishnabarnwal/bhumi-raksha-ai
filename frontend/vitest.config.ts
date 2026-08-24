import { defineConfig } from "vitest/config";

// F9 tests run in Node with a fake IndexedDB (registered via the setup file),
// so the outbox store and the pure sync engine are both exercised without a
// browser. App-component/build type-checking stays with `tsc -b` (npm run
// build); vitest only runs the offline unit tests.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["fake-indexeddb/auto"],
    include: ["src/**/*.test.ts"],
  },
});
