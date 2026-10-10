// Marks dist/cjs as CommonJS so Node resolves .js files there as CJS
// while the package root stays ESM ("type": "module").
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "dist", "cjs");
fs.writeFileSync(
  path.join(dir, "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n"
);
console.log("finalized dist/cjs/package.json");
