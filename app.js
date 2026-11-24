(() => {
  "use strict";

  const DEFAULT_CODES = ["USD", "EUR", "CNY", "KZT"];
  const STORAGE_KEY = "malovafin-selected-currencies";
  const MAX_LOOKBACK_DAYS = 14;
  const API_REQUEST_INTERVAL_MS = 1000;
  const rateFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  const moneyFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const els = {
    date: document.querySelector("#rate-date"), load: document.querySelector("#load-rates"),
    status: document.querySelector("#status"), statusText: document.querySelector("#status-text"),
    actualDate: document.querySelector("#actual-date"), cards: document.querySelector("#rate-cards"),
    customize: document.querySelector("#customize-rates"), picker: document.querySelector("#currency-picker"),
    closePicker: document.querySelector("#close-picker"), options: document.querySelector("#currency-options"),
    apply: document.querySelector("#apply-currencies"), amount: document.querySelector("#amount"),
    amountError: document.querySelector("#amount-error"), from: document.querySelector("#from-currency"),
    fromName: document.querySelector("#from-currency-name"), to: document.querySelector("#to-currency"),
    toName: document.querySelector("#to-currency-name"), swap: document.querySelector("#swap-currencies"),
    result: document.querySelector("#result-value"), explanation: document.querySelector("#result-explanation")
  };

  let currentRates = {};
  let currentMeta = null;
  let selectedCodes = readSelectedCodes();
  let requestController = null;
  const textMeasureCanvas = document.createElement("canvas");
  const textMeasureContext = textMeasureCanvas.getContext("2d");

  function readSelectedCodes() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) && saved.length ? saved.filter(code => typeof code === "string") : [...DEFAULT_CODES];
    } catch (_) {
      return [...DEFAULT_CODES];
    }
  }

  function setStatus(type, message) {
    els.status.className = `status ${type}`;
    els.statusText.textContent = message;
  }

  function parseApiDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function currencyLabel(code, item) {
    return code === "RUB" ? "Российский рубль" : item.Name;
  }

  async function loadRates() {
    const selectedDate = els.date.value;
    if (!selectedDate) {
      setStatus("error", "Выберите дату, чтобы загрузить курсы.");
      return;
    }
    if (selectedDate > CurrencyCore.isoLocalDate(new Date())) {
      setStatus("error", "Курс на будущую дату ещё не опубликован.");
      return;
    }

    if (requestController) requestController.abort();
    requestController = new AbortController();
    setStatus("loading", "Загружаем официальные курсы…");
    els.load.disabled = true;

    try {
      const { data, actualIsoDate } = await fetchRatesWithFallback(selectedDate, requestController.signal);

      currentRates = data.Valute;
      currentMeta = data;
      selectedCodes = selectedCodes.filter(code => currentRates[code]);
      if (!selectedCodes.length) selectedCodes = DEFAULT_CODES.filter(code => currentRates[code]);
      renderAll();

      const actual = parseApiDate(data.Date);
      const shownDate = actual ? dateFormat.format(actual) : selectedDate;
      if (actualIsoDate !== selectedDate) {
        setStatus("success", `На выбранную дату новый курс не публиковался. Используется последний действовавший курс ЦБ РФ от ${shownDate}`);
      } else {
        setStatus("success", `Курсы ЦБ РФ загружены на ${shownDate}`);
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      currentRates = {};
      currentMeta = null;
      els.cards.innerHTML = "";
      els.actualDate.textContent = "";
      updateConverter();
      if (error.message === "NO_RATE") {
        setStatus("error", `В архиве нет курса на выбранную дату и за предыдущие ${MAX_LOOKBACK_DAYS} дней. Курсы не подставлялись.`);
      } else if (error.message === "ARCHIVE_UNAVAILABLE_OR_EMPTY") {
        setStatus("error", `Архив API недоступен или не содержит данных за выбранную дату и предыдущие ${MAX_LOOKBACK_DAYS} дней. Курсы не подставлялись.`);
      } else {
        setStatus("error", "Не удалось получить данные. Проверьте интернет-соединение и попробуйте ещё раз.");
      }
    } finally {
      els.load.disabled = false;
    }
  }

  async function fetchRatesWithFallback(selectedDate, signal) {
    const candidates = CurrencyCore.lookbackDates(selectedDate, MAX_LOOKBACK_DAYS);
    let unavailableCandidates = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      if (index > 0) await waitForNextApiRequest(signal);
      const candidateDate = candidates[index];
      let response;
      try {
        response = await fetch(CurrencyCore.archiveUrl(candidateDate), {
          signal,
          headers: { "Accept": "application/json" },
          cache: "default"
        });
      } catch (error) {
        if (error.name === "AbortError") throw error;
        unavailableCandidates += 1;
        continue;
      }

      if (response.status === 404) continue;
      if (!response.ok) throw new Error(`HTTP_${response.status}`);

      const data = await response.json();
      if (!data || !data.Valute || !Object.keys(data.Valute).length) throw new Error("INVALID_DATA");
      const actualIsoDate = String(data.Date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(actualIsoDate)) throw new Error("INVALID_DATA_DATE");
      if (actualIsoDate > selectedDate) throw new Error("FUTURE_RATE_REJECTED");
      return { data, actualIsoDate };
    }
    if (unavailableCandidates === candidates.length) throw new Error("ARCHIVE_UNAVAILABLE_OR_EMPTY");
    throw new Error("NO_RATE");
  }

  function waitForNextApiRequest(signal) {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Запрос отменён", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, API_REQUEST_INTERVAL_MS);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function renderAll() {
    renderCards();
    renderPicker();
    renderSelects();
    updateConverter();
    const actual = parseApiDate(currentMeta.Date);
    if (actual) {
      const selected = new Date(`${els.date.value}T12:00:00`);
      const actualIsoDate = String(currentMeta.Date || "").slice(0, 10);
      els.actualDate.textContent = actualIsoDate === els.date.value
        ? `Фактическая дата курса: ${dateFormat.format(actual)}`
        : `Выбрано: ${dateFormat.format(selected)} · фактическая дата курса: ${dateFormat.format(actual)}`;
    } else {
      els.actualDate.textContent = "";
    }
  }

  function renderCards() {
    els.cards.innerHTML = selectedCodes.map(code => {
      const item = currentRates[code];
      const unitRate = CurrencyCore.rublesPerUnit(code, currentRates);
      return `<article class="rate-card">
        <div class="rate-card-top"><span class="currency-code">${escapeHtml(code)}</span><span class="nominal-badge">за 1 единицу</span></div>
        <p class="currency-name">${escapeHtml(item.Name)}</p>
        <strong class="rate-value">${rateFormat.format(unitRate)} ₽</strong>
        <span class="rate-unit">за 1 ${escapeHtml(code)}</span>
      </article>`;
    }).join("");
  }

  function renderPicker() {
    const entries = Object.entries(currentRates).sort(([a], [b]) => a.localeCompare(b));
    els.options.innerHTML = entries.map(([code, item]) => `<label class="currency-option" title="${escapeHtml(item.Name)}">
      <input type="checkbox" value="${escapeHtml(code)}" ${selectedCodes.includes(code) ? "checked" : ""}>
      <strong>${escapeHtml(code)}</strong><span>${escapeHtml(item.Name)}</span>
    </label>`).join("");
  }

  function renderSelects() {
    const previousFrom = els.from.value || "USD";
    const previousTo = els.to.value || "RUB";
    const all = [["RUB", { Name: "Российский рубль" }], ...Object.entries(currentRates)];
    const options = all.map(([code, item]) => `<option value="${escapeHtml(code)}">${escapeHtml(code)} — ${escapeHtml(currencyLabel(code, item))}</option>`).join("");
    els.from.innerHTML = options;
    els.to.innerHTML = options;
    els.from.value = all.some(([code]) => code === previousFrom) ? previousFrom : "USD";
    els.to.value = all.some(([code]) => code === previousTo) ? previousTo : "RUB";
    updateCurrencyNames();
  }

  function updateCurrencyNames() {
    const fromText = els.from.selectedOptions[0]?.textContent || "";
    const toText = els.to.selectedOptions[0]?.textContent || "";
    els.fromName.textContent = fromText;
    els.toName.textContent = toText;
    els.from.title = fromText;
    els.to.title = toText;
    requestAnimationFrame(() => {
      updateCurrencyNameVisibility(els.from, els.fromName, fromText);
      updateCurrencyNameVisibility(els.to, els.toName, toText);
    });
  }

  function updateCurrencyNameVisibility(select, helper, text) {
    if (!textMeasureContext || !select.clientWidth) {
      helper.classList.remove("is-visible");
      return;
    }
    const style = getComputedStyle(select);
    textMeasureContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const availableWidth = select.clientWidth - 52;
    const textWidth = textMeasureContext.measureText(text).width;
    helper.classList.toggle("is-visible", textWidth > availableWidth);
  }

  function updateConverter() {
    if (!Object.keys(currentRates).length) {
      els.result.textContent = "—";
      els.explanation.textContent = "Сначала загрузите курсы.";
      return;
    }
    const amount = CurrencyCore.normalizeAmount(els.amount.value);
    if (!Number.isFinite(amount) || amount < 0) {
      els.amountError.textContent = "Введите положительное число";
      els.result.textContent = "—";
      els.explanation.textContent = "";
      return;
    }
    els.amountError.textContent = "";
    const converted = CurrencyCore.convert(amount, els.from.value, els.to.value, currentRates);
    if (!Number.isFinite(converted)) {
      els.result.textContent = "—";
      els.explanation.textContent = "Для выбранной валюты нет курса.";
      return;
    }
    els.result.textContent = `${moneyFormat.format(converted)} ${els.to.value}`;
    els.explanation.textContent = `${moneyFormat.format(amount)} ${els.from.value} → RUB → ${els.to.value}`;
  }

  function togglePicker(force) {
    const shouldOpen = typeof force === "boolean" ? force : els.picker.hidden;
    els.picker.hidden = !shouldOpen;
    els.customize.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) renderPicker();
  }

  function applyCurrencies() {
    const checked = [...els.options.querySelectorAll("input:checked")].map(input => input.value);
    if (!checked.length) {
      setStatus("error", "Выберите хотя бы одну валюту для показа.");
      return;
    }
    selectedCodes = [
      ...DEFAULT_CODES.filter(code => checked.includes(code)),
      ...checked.filter(code => !DEFAULT_CODES.includes(code))
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedCodes));
    renderCards();
    togglePicker(false);
    setStatus("success", "Набор валют обновлён.");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  els.load.addEventListener("click", loadRates);
  els.date.addEventListener("change", loadRates);
  els.customize.addEventListener("click", () => togglePicker());
  els.closePicker.addEventListener("click", () => togglePicker(false));
  els.apply.addEventListener("click", applyCurrencies);
  els.amount.addEventListener("input", updateConverter);
  els.from.addEventListener("change", () => { updateCurrencyNames(); updateConverter(); });
  els.to.addEventListener("change", () => { updateCurrencyNames(); updateConverter(); });
  window.addEventListener("resize", updateCurrencyNames);
  els.swap.addEventListener("click", () => {
    const from = els.from.value;
    els.from.value = els.to.value;
    els.to.value = from;
    updateCurrencyNames();
    updateConverter();
  });

  const today = CurrencyCore.isoLocalDate(new Date());
  els.date.max = today;
  els.date.value = today;
  loadRates();
})();
