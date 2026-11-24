(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CurrencyCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function normalizeAmount(value) {
    const normalized = String(value).trim().replace(/\s+/g, "").replace(",", ".");
    if (!normalized) return NaN;
    return Number(normalized);
  }

  function rublesPerUnit(code, rates) {
    if (code === "RUB") return 1;
    const rate = rates[code];
    if (!rate || !Number.isFinite(rate.Value) || !Number.isFinite(rate.Nominal) || rate.Nominal <= 0) return NaN;
    return rate.Value / rate.Nominal;
  }

  function convert(amount, fromCode, toCode, rates) {
    const numericAmount = typeof amount === "number" ? amount : normalizeAmount(amount);
    const fromRub = rublesPerUnit(fromCode, rates);
    const toRub = rublesPerUnit(toCode, rates);
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || !Number.isFinite(fromRub) || !Number.isFinite(toRub)) return NaN;
    return numericAmount * fromRub / toRub;
  }

  function archiveUrl(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error("Некорректная дата");
    const [year, month, day] = isoDate.split("-");
    return `https://www.cbr-xml-daily.ru/archive/${year}/${month}/${day}/daily_json.js`;
  }

  function isoLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function shiftIsoDate(isoDate, dayOffset) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isInteger(dayOffset)) throw new Error("Некорректная дата");
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function lookbackDates(isoDate, maxDays) {
    if (!Number.isInteger(maxDays) || maxDays < 0) throw new Error("Некорректный период поиска");
    return Array.from({ length: maxDays + 1 }, (_, index) => shiftIsoDate(isoDate, -index));
  }

  return { normalizeAmount, rublesPerUnit, convert, archiveUrl, isoLocalDate, shiftIsoDate, lookbackDates };
});
