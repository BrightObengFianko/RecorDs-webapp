const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "search-date-utils.js"),
    "utf8"
);
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "search-date-utils.js" });

const dateUtils = context.window.RecordSearchDate;

assert.strictEqual(dateUtils.format("10012025"), "10-01-2025");
assert.strictEqual(dateUtils.format("05061990"), "05-06-1990");
assert.strictEqual(dateUtils.format("10012025extra"), "10-01-2025");
assert.strictEqual(dateUtils.format("10-01"), "10-01");
assert.strictEqual(dateUtils.format(""), "");

assert.strictEqual(dateUtils.toIso("10-01-2025"), "2025-01-10");
assert.strictEqual(dateUtils.toIso("05-06-1990"), "1990-06-05");
assert.strictEqual(dateUtils.toIso("32-01-2025"), null);
assert.strictEqual(dateUtils.toIso("31-04-2025"), null);
assert.strictEqual(dateUtils.toIso("29-02-2025"), null);
assert.strictEqual(dateUtils.toIso("10-01-25"), null);
assert.strictEqual(dateUtils.toIso("10-01-2025x"), null);

assert.strictEqual(dateUtils.caretPosition("10012025", 8), 10);
assert.strictEqual(dateUtils.caretPosition("10012025", 2), 2);
assert.strictEqual(dateUtils.caretPosition("10012025", 4), 5);

console.log("SEARCH_DATE_CHECK_OK");
