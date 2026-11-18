const fs = require("fs");
const path = require("path");

const X = require("../src/builder/codegen.js");
const GM = require("../src/builder/model.js");
require("../src/builder/templates.js");

const dir = path.join(__dirname, "..", "src", "builder", "langs");
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
    if (!X.langs[path.basename(f, ".js")]) new Function("X", fs.readFileSync(path.join(dir, f), "utf8"))(X);
  }
}

const docs = () => GM.LAYOUTS.map((l) => [l.name, l.make()]);

module.exports = { X, GM, docs };
