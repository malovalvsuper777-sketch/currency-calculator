const assert = require("node:assert/strict");
const core = require("./currency-core.js");

const rates = {
  USD: { Value: 80, Nominal: 1 },
  EUR: { Value: 100, Nominal: 1 },
  BOB: { Value: 70, Nominal: 10 },
  KZT: { Value: 16, Nominal: 100 },
  IRR: { Value: 43.06, Nominal: 1000000 }
};

assert.equal(core.normalizeAmount("1 234,50"), 1234.5);
assert.equal(core.rublesPerUnit("KZT", rates), 0.16);
assert.equal(core.rublesPerUnit("USD", rates), 80);
assert.equal(core.rublesPerUnit("BOB", rates), 7);
assert.ok(Math.abs(core.rublesPerUnit("IRR", rates) - 0.00004306) < 1e-12);
assert.equal(core.convert(100, "KZT", "RUB", rates), 16);
assert.equal(core.convert(16, "RUB", "KZT", rates), 100);
assert.equal(core.convert(100, "USD", "EUR", rates), 80);
assert.equal(core.convert(70, "BOB", "USD", rates), 6.125);
assert.equal(core.convert(8000, "RUB", "USD", rates), 100);
assert.equal(core.archiveUrl("2025-11-15"), "https://www.cbr-xml-daily.ru/archive/2025/11/15/daily_json.js");
assert.equal(core.shiftIsoDate("2026-11-05", -1), "2026-11-04");
assert.equal(core.shiftIsoDate("2026-01-01", -1), "2025-12-31");
assert.equal(core.shiftIsoDate("2024-03-01", -1), "2024-02-29");
assert.deepEqual(core.lookbackDates("2026-11-05", 2), ["2026-11-05", "2026-11-04", "2026-11-03"]);
assert.ok(core.lookbackDates("2026-11-05", 14).every(date => date <= "2026-11-05"));
assert.ok(Number.isNaN(core.convert("abc", "USD", "RUB", rates)));
console.log("Все проверки расчётов пройдены.");
