/* =========================================
   CLEARSPEND - MAIN JAVASCRIPT
   ========================================= */

// Categories offered for each transaction type
const CATEGORIES = {
    Expense: ["Food", "Travel", "Education", "Shopping", "Bills", "Health", "Entertainment", "Other"],
    Income: ["Salary", "Pocket Money", "Freelance", "Business", "Gift", "Other"]
};

// Available payment methods / wallets
const PAYMENT_METHODS = ["Cash", "JazzCash", "Easypaisa", "Bank / Card"];

/* -----------------------------------------
   UTILITIES
   ----------------------------------------- */

// A date as "YYYY-MM-DD" in the user's LOCAL time zone
function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getToday() {
    return toLocalDateString(new Date());
}

// Convert old saved dates (e.g. full ISO timestamps) to "YYYY-MM-DD"
function normalizeDate(value) {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : toLocalDateString(parsed);
}

// Convert old lowercase types ("income"/"expense") to "Income"/"Expense"
function normalizeType(value) {
    return String(value || "").toLowerCase() === "income" ? "Income" : "Expense";
}

function normalizeMethod(value) {
    const text = String(value || "").trim();
    return PAYMENT_METHODS.includes(text) ? text : "Cash";
}

function generateId() {
    return `transaction-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// Make any saved or imported transaction safe to use
function normalizeTransaction(transaction, index) {
    return {
        ...transaction,
        id: transaction.id ? String(transaction.id) : `old-${index}-${Date.now()}`,
        description: String(transaction.description ?? "").trim() || "Untitled",
        amount: Number(transaction.amount) || 0,
        type: normalizeType(transaction.type),
        category: String(transaction.category || "Other"),
        paymentMethod: normalizeMethod(transaction.paymentMethod),
        date: normalizeDate(transaction.date)
    };
}

function prepareTransactions(list) {
    const seen = new Set();

    return list
        .filter(item => item && typeof item === "object")
        .map(normalizeTransaction)
        .map(transaction => {
            let id = transaction.id;
            while (seen.has(id)) id = generateId();
            seen.add(id);
            return id === transaction.id ? transaction : { ...transaction, id };
        });
}

function formatPKR(amount) {
    return "PKR " + Number(amount || 0).toLocaleString("en-PK", {
        maximumFractionDigits: 2
    });
}

// Escape user-entered text before displaying it as HTML
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function formatDate(dateString) {
    if (!dateString) return "Date not recorded";

    const date = new Date(dateString + "T00:00:00");
    if (Number.isNaN(date.getTime())) return "Date not recorded";

    return date.toLocaleDateString("en-PK", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// Show a form message in green (success) or red (error)
function showFormMessage(element, text, isError) {
    if (!element) return;

    element.textContent = text;
    element.classList.toggle("error", Boolean(isError));
    clearTimeout(element.hideTimer);

    if (text && !isError) {
        element.hideTimer = setTimeout(() => {
            element.textContent = "";
        }, 4000);
    }
}

// Newest date first; for the same date, the most recently added comes first
function sortNewestFirst(list) {
    return list
        .map((transaction, index) => ({ transaction, index }))
        .sort((a, b) => {
            const dateA = a.transaction.date || "";
            const dateB = b.transaction.date || "";
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            return b.index - a.index;
        })
        .map(item => item.transaction);
}

// Sort transactions according to the chosen sort option
function sortTransactions(list, sortBy) {
    if (sortBy === "oldest") {
        return [...sortNewestFirst(list)].reverse();
    }
    if (sortBy === "highest") {
        return [...list].sort((a, b) => Number(b.amount) - Number(a.amount));
    }
    if (sortBy === "lowest") {
        return [...list].sort((a, b) => Number(a.amount) - Number(b.amount));
    }
    return sortNewestFirst(list);
}

function setSelectOptions(select, values, selectedValue) {
    select.innerHTML = values
        .map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`)
        .join("");

    if (values.includes(selectedValue)) select.value = selectedValue;
}

/* -----------------------------------------
   LOAD SAVED DATA
   ----------------------------------------- */

function loadSavedTransactions() {
    try {
        const saved = JSON.parse(localStorage.getItem("transactions"));
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function loadCategoryBudgets() {
    try {
        const saved = JSON.parse(localStorage.getItem("clearSpendCategoryBudgets"));
        return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch (error) {
        return {};
    }
}

let transactions = prepareTransactions(loadSavedTransactions());
let monthlyBudget = Number(localStorage.getItem("monthlyBudget")) || 0;
let categoryBudgets = loadCategoryBudgets();
let editingId = null;

function saveTransactions() {
    localStorage.setItem("transactions", JSON.stringify(transactions));
}

function saveCategoryBudgets() {
    localStorage.setItem("clearSpendCategoryBudgets", JSON.stringify(categoryBudgets));
}

saveTransactions();

/* -----------------------------------------
   MONTH SELECTION (view past months)
   ----------------------------------------- */

function getCurrentMonthKey() {
    return getToday().slice(0, 7);
}

function isValidMonthKey(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");
}

function shiftMonth(monthKey, step) {
    const [year, month] = monthKey.split("-").map(Number);
    return toLocalDateString(new Date(year, month - 1 + step, 1)).slice(0, 7);
}

function formatMonth(monthKey) {
    if (!isValidMonthKey(monthKey)) return monthKey;
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-PK", {
        month: "long",
        year: "numeric"
    });
}

let selectedMonth = getCurrentMonthKey();

try {
    const savedMonth = sessionStorage.getItem("clearSpendMonth");
    if (isValidMonthKey(savedMonth)) selectedMonth = savedMonth;
} catch (error) {
    // sessionStorage unavailable - just use the current month
}

function setSelectedMonth(monthKey) {
    selectedMonth = monthKey;

    try {
        sessionStorage.setItem("clearSpendMonth", selectedMonth);
    } catch (error) {
        // ignore
    }

    refreshApp();
}

function setupMonthPicker() {
    document.querySelectorAll("[data-month-step]").forEach(button => {
        button.addEventListener("click", () => {
            setSelectedMonth(shiftMonth(selectedMonth, Number(button.dataset.monthStep)));
        });
    });

    document.querySelectorAll("[data-month-reset]").forEach(button => {
        button.addEventListener("click", () => setSelectedMonth(getCurrentMonthKey()));
    });

    document.querySelectorAll("[data-print-report]").forEach(button => {
        button.addEventListener("click", () => window.print());
    });
}

function updateMonthLabels() {
    const isCurrentMonth = selectedMonth === getCurrentMonthKey();
    const label = formatMonth(selectedMonth);

    document.querySelectorAll(".month-label").forEach(element => {
        element.textContent = label;
    });

    document.querySelectorAll(".month-tag").forEach(element => {
        element.textContent = isCurrentMonth ? "THIS MONTH" : label.toUpperCase();
    });

    document.querySelectorAll("[data-month-reset]").forEach(button => {
        button.hidden = isCurrentMonth;
    });
}

function getMonthTransactions(type, monthKey = selectedMonth) {
    return transactions.filter(transaction =>
        transaction.type === type &&
        (transaction.date || "").slice(0, 7) === monthKey
    );
}

function getSelectedMonthSpent() {
    return getMonthTransactions("Expense").reduce(
        (total, transaction) => total + Number(transaction.amount), 0
    );
}

function getTotalByType(type) {
    return transactions
        .filter(transaction => transaction.type === type)
        .reduce((total, transaction) => total + Number(transaction.amount), 0);
}

function getCategoryTotals(list) {
    const totals = {};

    list.forEach(transaction => {
        const category = transaction.category || "Other";
        totals[category] = (totals[category] || 0) + Number(transaction.amount);
    });

    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

/* -----------------------------------------
   THEME
   ----------------------------------------- */

function setupTheme() {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem("clearSpendTheme") || "light";
    root.classList.toggle("dark-mode", savedTheme === "dark");

    const topbar = document.querySelector(".topbar");
    if (!topbar) return;

    let button = document.getElementById("theme-toggle");

    if (!button) {
        button = document.createElement("button");
        button.id = "theme-toggle";
        button.className = "theme-toggle";
        button.type = "button";

        const actions = topbar.querySelector(".topbar-actions");
        if (actions) {
            actions.insertBefore(button, actions.firstChild);
        } else {
            topbar.appendChild(button);
        }
    }

    function updateButtonText() {
        button.textContent = root.classList.contains("dark-mode")
            ? "☀️ Light Mode"
            : "🌙 Dark Mode";
    }

    updateButtonText();

    button.addEventListener("click", () => {
        root.classList.toggle("dark-mode");
        localStorage.setItem("clearSpendTheme", root.classList.contains("dark-mode") ? "dark" : "light");
        updateButtonText();
    });
}

/* -----------------------------------------
   DASHBOARD
   ----------------------------------------- */

function updateDashboard() {
    const income = getTotalByType("Income");
    const expenses = getTotalByType("Expense");

    const balanceElement = document.getElementById("balance");
    const incomeElement = document.getElementById("income");
    const expensesElement = document.getElementById("expenses");

    if (balanceElement) balanceElement.textContent = formatPKR(income - expenses);
    if (incomeElement) incomeElement.textContent = formatPKR(income);
    if (expensesElement) expensesElement.textContent = formatPKR(expenses);

    updateSpendingChart();
    updateDashboardBudget();
    displayRecentTransactions();
}

function updateSpendingChart() {
    const chart = document.getElementById("spending-chart");
    if (!chart) return;

    const entries = getCategoryTotals(getMonthTransactions("Expense")).slice(0, 6);

    if (entries.length === 0) {
        chart.innerHTML = `<p class="empty-state">No expenses recorded for ${escapeHTML(formatMonth(selectedMonth))}.</p>`;
        return;
    }

    const maximum = Math.max(...entries.map(entry => entry[1]));

    chart.innerHTML = entries.map(([category, amount]) => {
        const percentage = maximum > 0 ? (amount / maximum) * 100 : 0;

        return `
            <div class="chart-row">
                <span class="chart-category">${escapeHTML(category)}</span>
                <div class="chart-track">
                    <div class="chart-fill" style="width:${percentage}%"></div>
                </div>
                <span class="chart-value">${formatPKR(amount)}</span>
            </div>
        `;
    }).join("");
}

function renderTransactionItem(transaction, showActions) {
    const isIncome = transaction.type === "Income";
    const isEditing = showActions && transaction.id === editingId;
    const safeId = escapeHTML(transaction.id);
    const method = transaction.paymentMethod || "Cash";

    return `
        <div class="transaction-item${isEditing ? " is-editing" : ""}">
            <div class="transaction-main">
                <div class="transaction-symbol">${isIncome ? "↗" : "↘"}</div>
                <div>
                    <h3>${escapeHTML(transaction.description)}</h3>
                    <p>
                        <span>${escapeHTML(transaction.category)}</span>
                        <span>·</span>
                        <span class="method-badge">${escapeHTML(method)}</span>
                        <span>·</span>
                        <span>${formatDate(transaction.date)}</span>
                    </p>
                </div>
            </div>
            <div class="transaction-right">
                <span class="transaction-amount ${isIncome ? "income-text" : "expense-text"}">
                    ${isIncome ? "+" : "−"}${formatPKR(transaction.amount)}
                </span>
                ${showActions ? `
                    <div class="transaction-actions">
                        <button class="edit-button" type="button" data-edit-id="${safeId}">Edit</button>
                        <button class="delete-button" type="button" data-delete-id="${safeId}">Delete</button>
                    </div>
                ` : ""}
            </div>
        </div>
    `;
}

function displayRecentTransactions() {
    const container = document.getElementById("recent-transactions");
    if (!container) return;

    const recent = sortNewestFirst(transactions).slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = '<p class="empty-state">No transactions yet. Add your first transaction or click "Load demo data" above to explore.</p>';
        return;
    }

    container.innerHTML = recent.map(transaction => renderTransactionItem(transaction, false)).join("");
}

/* -----------------------------------------
   TRANSACTIONS PAGE
   ----------------------------------------- */

// Category dropdown in the form changes with the selected type
function populateCategoryOptions(type, categoryToSelect) {
    const select = document.getElementById("category");
    if (!select) return;

    const options = [...(CATEGORIES[type] || CATEGORIES.Expense)];

    if (categoryToSelect && !options.includes(categoryToSelect)) {
        options.push(categoryToSelect);
    }

    setSelectOptions(select, options, categoryToSelect || select.value);
}

// Category filter only lists categories that match the type filter
function populateFilterCategories() {
    const select = document.getElementById("filter-category");
    if (!select) return;

    const typeFilter = document.getElementById("filter-type");
    const type = typeFilter ? typeFilter.value : "All";

    const baseCategories = type === "All"
        ? [...CATEGORIES.Expense, ...CATEGORIES.Income]
        : CATEGORIES[type] || [];

    const usedCategories = transactions
        .filter(transaction => type === "All" || transaction.type === type)
        .map(transaction => transaction.category);

    const categories = [...new Set([...baseCategories, ...usedCategories])];
    const current = select.value;

    setSelectOptions(select, ["All", ...categories], current);
    select.options[0].textContent = "All categories";

    if (!categories.includes(current)) select.value = "All";
}

// Month filter lists all months present in saved transactions
function populateFilterMonths() {
    const select = document.getElementById("filter-month");
    if (!select) return;

    const months = [...new Set(
        transactions
            .map(transaction => (transaction.date || "").slice(0, 7))
            .filter(isValidMonthKey)
    )].sort((a, b) => b.localeCompare(a));

    const current = select.value;
    select.innerHTML = '<option value="All">All months</option>' +
        months.map(monthKey => `<option value="${escapeHTML(monthKey)}">${escapeHTML(formatMonth(monthKey))}</option>`).join("");

    if (months.includes(current)) {
        select.value = current;
    } else {
        select.value = "All";
    }
}

function displayTransactions() {
    const list = document.getElementById("transaction-list");
    if (!list) return;

    populateFilterCategories();
    populateFilterMonths();

    const searchInput = document.getElementById("transaction-search");
    const typeFilter = document.getElementById("filter-type");
    const categoryFilter = document.getElementById("filter-category");
    const methodFilter = document.getElementById("filter-method");
    const monthFilter = document.getElementById("filter-month");
    const sortBySelect = document.getElementById("sort-by");

    const search = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const selectedType = typeFilter ? typeFilter.value : "All";
    const selectedCategory = categoryFilter ? categoryFilter.value : "All";
    const selectedMethod = methodFilter ? methodFilter.value : "All";
    const selectedMonthFilter = monthFilter ? monthFilter.value : "All";
    const sortBy = sortBySelect ? sortBySelect.value : "newest";

    const filtered = sortTransactions(transactions.filter(transaction => {
        const method = transaction.paymentMethod || "Cash";
        const matchesSearch =
            transaction.description.toLowerCase().includes(search) ||
            transaction.category.toLowerCase().includes(search) ||
            method.toLowerCase().includes(search);

        const matchesType = selectedType === "All" || transaction.type === selectedType;
        const matchesCategory = selectedCategory === "All" || transaction.category === selectedCategory;
        const matchesMethod = selectedMethod === "All" || method === selectedMethod;
        const matchesMonth = selectedMonthFilter === "All" || (transaction.date || "").slice(0, 7) === selectedMonthFilter;

        return matchesSearch && matchesType && matchesCategory && matchesMethod && matchesMonth;
    }), sortBy);

    const filteredCount = document.getElementById("filtered-count");
    if (filteredCount) filteredCount.textContent = `${filtered.length} RECORDS`;

    if (transactions.length === 0) {
        list.innerHTML = '<p class="empty-state">No transactions yet. Add your first transaction above or click "Load sample data" below.</p>';
        return;
    }

    if (filtered.length === 0) {
        list.innerHTML = '<p class="empty-state">No matching transactions found.</p>';
        return;
    }

    list.innerHTML = filtered.map(transaction => renderTransactionItem(transaction, true)).join("");
}

function updateTransactionSummary() {
    const count = document.getElementById("transaction-count");
    const income = document.getElementById("transaction-income");
    const expenses = document.getElementById("transaction-expenses");

    if (count) count.textContent = transactions.length;
    if (income) income.textContent = formatPKR(getTotalByType("Income"));
    if (expenses) expenses.textContent = formatPKR(getTotalByType("Expense"));
}

/* ---------- Add / edit form ---------- */

const transactionForm = document.getElementById("transaction-form");

function setFormMode(isEditing) {
    const title = document.getElementById("form-title");
    const subtitle = document.getElementById("form-subtitle");
    const submitButton = document.getElementById("form-submit");
    const cancelButton = document.getElementById("cancel-edit");

    if (title) title.textContent = isEditing ? "Edit transaction" : "Add a transaction";
    if (subtitle) {
        subtitle.textContent = isEditing
            ? "Update the details below and save your changes."
            : "Enter the details below to record your activity.";
    }
    if (submitButton) submitButton.textContent = isEditing ? "✓ Save changes" : "＋ Save transaction";
    if (cancelButton) cancelButton.hidden = !isEditing;
}

function resetTransactionForm() {
    if (!transactionForm) return;

    transactionForm.reset();

    const typeSelect = document.getElementById("type");
    const dateInput = document.getElementById("transaction-date");
    const methodSelect = document.getElementById("payment-method");

    populateCategoryOptions(typeSelect ? typeSelect.value : "Expense");
    if (methodSelect) methodSelect.value = "Cash";
    if (dateInput) dateInput.value = getToday();
}

function startEditing(id) {
    const transaction = transactions.find(item => item.id === id);
    if (!transaction || !transactionForm) return;

    editingId = id;

    document.getElementById("description").value = transaction.description;
    document.getElementById("amount").value = transaction.amount;
    document.getElementById("type").value = transaction.type;
    populateCategoryOptions(transaction.type, transaction.category);

    const methodSelect = document.getElementById("payment-method");
    if (methodSelect) methodSelect.value = transaction.paymentMethod || "Cash";

    document.getElementById("transaction-date").value = transaction.date || getToday();

    setFormMode(true);
    showFormMessage(document.getElementById("form-message"), "", false);
    displayTransactions();

    const panel = transactionForm.closest(".panel") || transactionForm;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("description").focus({ preventScroll: true });
}

function stopEditing() {
    editingId = null;
    setFormMode(false);
    resetTransactionForm();
    displayTransactions();
}

if (transactionForm) {
    const typeSelect = document.getElementById("type");
    const cancelButton = document.getElementById("cancel-edit");

    resetTransactionForm();

    if (typeSelect) {
        typeSelect.addEventListener("change", () => populateCategoryOptions(typeSelect.value));
    }

    if (cancelButton) {
        cancelButton.addEventListener("click", () => {
            stopEditing();
            showFormMessage(document.getElementById("form-message"), "", false);
        });
    }

    transactionForm.addEventListener("submit", function(event) {
        event.preventDefault();

        const description = document.getElementById("description").value.trim();
        const amount = Number(document.getElementById("amount").value);
        const type = normalizeType(document.getElementById("type").value);
        const category = document.getElementById("category").value || "Other";
        const methodSelect = document.getElementById("payment-method");
        const paymentMethod = normalizeMethod(methodSelect ? methodSelect.value : "Cash");
        const date = document.getElementById("transaction-date").value;
        const message = document.getElementById("form-message");

        if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
            showFormMessage(message, "Please enter valid transaction details.", true);
            return;
        }

        if (editingId) {
            const index = transactions.findIndex(item => item.id === editingId);

            if (index === -1) {
                stopEditing();
                showFormMessage(message, "That transaction no longer exists.", true);
                return;
            }

            transactions[index] = {
                ...transactions[index],
                description,
                amount,
                type,
                category,
                paymentMethod,
                date
            };
            saveTransactions();
            stopEditing();
            showFormMessage(message, "Transaction updated successfully!", false);
        } else {
            transactions.push({
                id: generateId(),
                description,
                amount,
                type,
                category,
                paymentMethod,
                date
            });
            saveTransactions();
            resetTransactionForm();
            showFormMessage(message, "Transaction saved successfully!", false);
        }

        refreshApp();
    });
}

/* ---------- Edit / delete buttons in the list ---------- */

const transactionList = document.getElementById("transaction-list");

if (transactionList) {
    transactionList.addEventListener("click", function(event) {
        const editButton = event.target.closest("[data-edit-id]");
        if (editButton) {
            startEditing(editButton.dataset.editId);
            return;
        }

        const deleteButton = event.target.closest("[data-delete-id]");
        if (!deleteButton) return;

        const id = deleteButton.dataset.deleteId;
        if (!confirm("Are you sure you want to delete this transaction?")) return;

        transactions = transactions.filter(transaction => transaction.id !== id);
        saveTransactions();

        if (editingId === id) stopEditing();
        refreshApp();
    });
}

/* ---------- Search, filters, and sort ---------- */

["transaction-search", "filter-type", "filter-category", "filter-method", "filter-month", "sort-by"].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener("input", displayTransactions);
        element.addEventListener("change", displayTransactions);
    }
});

const clearFiltersButton = document.getElementById("clear-filters");

if (clearFiltersButton) {
    clearFiltersButton.addEventListener("click", () => {
        const search = document.getElementById("transaction-search");
        const type = document.getElementById("filter-type");
        const category = document.getElementById("filter-category");
        const method = document.getElementById("filter-method");
        const month = document.getElementById("filter-month");
        const sortBy = document.getElementById("sort-by");

        if (search) search.value = "";
        if (type) type.value = "All";
        if (category) category.value = "All";
        if (method) method.value = "All";
        if (month) month.value = "All";
        if (sortBy) sortBy.value = "newest";

        displayTransactions();
    });
}

/* -----------------------------------------
   BACKUP, RESTORE & DEMO DATA
   ----------------------------------------- */

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Quote a value for CSV, and stop Excel from treating text as a formula
function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
}

function exportBackup() {
    const backup = {
        app: "ClearSpend",
        version: 2,
        exportedAt: new Date().toISOString(),
        monthlyBudget,
        categoryBudgets,
        transactions
    };

    downloadFile(`clearspend-backup-${getToday()}.json`, JSON.stringify(backup, null, 2), "application/json");
    showFormMessage(document.getElementById("backup-message"), "Backup downloaded. Keep the file somewhere safe.", false);
}

function exportCSV() {
    const message = document.getElementById("backup-message");

    if (transactions.length === 0) {
        showFormMessage(message, "There are no transactions to export yet.", true);
        return;
    }

    const header = ["Date", "Description", "Type", "Category", "Payment Method", "Amount (PKR)"];
    const rows = sortNewestFirst(transactions).map(transaction => [
        transaction.date,
        transaction.description,
        transaction.type,
        transaction.category,
        transaction.paymentMethod || "Cash",
        transaction.amount
    ]);

    const csv = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");

    downloadFile(`clearspend-transactions-${getToday()}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
    showFormMessage(message, "CSV file downloaded. You can open it in Excel or Google Sheets.", false);
}

async function importBackup(file) {
    const message = document.getElementById("backup-message");

    let data;
    try {
        data = JSON.parse(await file.text());
    } catch (error) {
        showFormMessage(message, "This file is not a valid ClearSpend backup.", true);
        return;
    }

    const list = Array.isArray(data)
        ? data
        : data && Array.isArray(data.transactions) ? data.transactions : null;

    if (!list) {
        showFormMessage(message, "This file is not a valid ClearSpend backup.", true);
        return;
    }

    const importedTransactions = prepareTransactions(list);
    const importedBudget = !Array.isArray(data) && "monthlyBudget" in data
        ? Number(data.monthlyBudget) || 0
        : monthlyBudget;
    const importedCategoryBudgets = !Array.isArray(data) && data.categoryBudgets && typeof data.categoryBudgets === "object"
        ? data.categoryBudgets
        : categoryBudgets;

    const confirmed = confirm(
        `Restore ${importedTransactions.length} transaction(s) from "${file.name}"?\n\n` +
        `This will REPLACE the ${transactions.length} transaction(s) and budget settings currently saved in this browser.`
    );

    if (!confirmed) return;

    transactions = importedTransactions;
    monthlyBudget = importedBudget;
    categoryBudgets = importedCategoryBudgets;
    saveTransactions();
    localStorage.setItem("monthlyBudget", monthlyBudget);
    saveCategoryBudgets();

    if (editingId) stopEditing();
    refreshApp();

    showFormMessage(message, `Backup restored: ${importedTransactions.length} transaction(s) loaded.`, false);
}

function loadSampleData() {
    if (transactions.length > 0) {
        const confirmed = confirm(
            "Load sample demo data?\n\nThis will replace your current transactions and budget with sample data."
        );
        if (!confirmed) return;
    }

    const currentMonth = getCurrentMonthKey();
    const prevMonth = shiftMonth(currentMonth, -1);

    transactions = prepareTransactions([
        { description: "Monthly Salary", amount: 55000, type: "Income", category: "Salary", paymentMethod: "Bank / Card", date: `${currentMonth}-01` },
        { description: "Freelance Web Design", amount: 15000, type: "Income", category: "Freelance", paymentMethod: "JazzCash", date: `${currentMonth}-06` },
        { description: "University Semester Books", amount: 6500, type: "Expense", category: "Education", paymentMethod: "Bank / Card", date: `${currentMonth}-03` },
        { description: "Weekly Groceries & Fruit", amount: 8200, type: "Expense", category: "Food", paymentMethod: "Cash", date: `${currentMonth}-05` },
        { description: "Electricity & Internet Bill", amount: 7400, type: "Expense", category: "Bills", paymentMethod: "Easypaisa", date: `${currentMonth}-08` },
        { description: "Metro & Ride Shares", amount: 4200, type: "Expense", category: "Travel", paymentMethod: "JazzCash", date: `${currentMonth}-11` },
        { description: "Winter Jacket & Shoes", amount: 5800, type: "Expense", category: "Shopping", paymentMethod: "Bank / Card", date: `${currentMonth}-14` },
        { description: "Pharmacy & Checkup", amount: 2400, type: "Expense", category: "Health", paymentMethod: "Cash", date: `${currentMonth}-16` },
        { description: "Last Month Salary", amount: 55000, type: "Income", category: "Salary", paymentMethod: "Bank / Card", date: `${prevMonth}-01` },
        { description: "Last Month Groceries", amount: 11500, type: "Expense", category: "Food", paymentMethod: "Cash", date: `${prevMonth}-10` },
        { description: "Last Month Utility Bills", amount: 8900, type: "Expense", category: "Bills", paymentMethod: "Easypaisa", date: `${prevMonth}-12` }
    ]);

    monthlyBudget = 45000;
    categoryBudgets = {
        Food: 10000,
        Bills: 8000,
        Travel: 5000,
        Shopping: 6000
    };

    saveTransactions();
    localStorage.setItem("monthlyBudget", monthlyBudget);
    saveCategoryBudgets();

    const budgetInput = document.getElementById("monthly-budget");
    if (budgetInput) budgetInput.value = monthlyBudget;

    setSelectedMonth(currentMonth);
    showFormMessage(document.getElementById("backup-message"), "Sample demo data loaded!", false);
}

function clearAllData() {
    if (transactions.length === 0 && monthlyBudget === 0 && Object.keys(categoryBudgets).length === 0) {
        showFormMessage(document.getElementById("backup-message"), "There is no saved data to clear.", true);
        return;
    }

    if (!confirm("Are you sure you want to clear ALL transactions and budget settings? This cannot be undone unless you downloaded a backup.")) {
        return;
    }

    transactions = [];
    monthlyBudget = 0;
    categoryBudgets = {};
    saveTransactions();
    localStorage.removeItem("monthlyBudget");
    saveCategoryBudgets();

    if (editingId) stopEditing();
    refreshApp();
    showFormMessage(document.getElementById("backup-message"), "All transactions and budget settings have been cleared.", false);
}

const exportBackupButton = document.getElementById("export-json");
const exportCSVButton = document.getElementById("export-csv");
const importButton = document.getElementById("import-button");
const importFileInput = document.getElementById("import-file");
const clearAllButton = document.getElementById("clear-all-data");

if (exportBackupButton) exportBackupButton.addEventListener("click", exportBackup);
if (exportCSVButton) exportCSVButton.addEventListener("click", exportCSV);
if (clearAllButton) clearAllButton.addEventListener("click", clearAllData);

document.querySelectorAll("[data-load-sample]").forEach(button => {
    button.addEventListener("click", loadSampleData);
});

if (importButton && importFileInput) {
    importButton.addEventListener("click", () => importFileInput.click());

    importFileInput.addEventListener("change", async () => {
        const file = importFileInput.files[0];
        if (file) await importBackup(file);
        importFileInput.value = "";
    });
}

/* -----------------------------------------
   BUDGET & CATEGORY LIMITS
   ----------------------------------------- */

const budgetForm = document.getElementById("budget-form");

if (budgetForm) {
    const budgetInput = document.getElementById("monthly-budget");
    const message = document.getElementById("budget-form-message");

    if (budgetInput && monthlyBudget > 0) {
        budgetInput.value = monthlyBudget;
    }

    budgetForm.addEventListener("submit", function(event) {
        event.preventDefault();

        const amount = Number(budgetInput.value);

        if (!Number.isFinite(amount) || amount <= 0) {
            showFormMessage(message, "Please enter a valid budget amount.", true);
            return;
        }

        monthlyBudget = amount;
        localStorage.setItem("monthlyBudget", monthlyBudget);

        showFormMessage(message, "Monthly budget saved successfully!", false);
        updateBudget();
        updateDashboardBudget();
    });
}

const categoryBudgetForm = document.getElementById("category-budget-form");

if (categoryBudgetForm) {
    const categorySelect = document.getElementById("category-budget-name");
    const amountInput = document.getElementById("category-budget-amount");
    const clearCategoryButton = document.getElementById("clear-category-budget");
    const message = document.getElementById("category-budget-message");

    function syncCategoryLimitInput() {
        if (!categorySelect || !amountInput) return;
        const limit = Number(categoryBudgets[categorySelect.value]) || 0;
        amountInput.value = limit > 0 ? limit : "";
    }

    syncCategoryLimitInput();

    if (categorySelect) {
        categorySelect.addEventListener("change", syncCategoryLimitInput);
    }

    if (clearCategoryButton) {
        clearCategoryButton.addEventListener("click", () => {
            const category = categorySelect.value;
            delete categoryBudgets[category];
            saveCategoryBudgets();
            syncCategoryLimitInput();
            updateCategoryReport();
            showFormMessage(message, `Removed limit for ${category}.`, false);
        });
    }

    categoryBudgetForm.addEventListener("submit", function(event) {
        event.preventDefault();

        const category = categorySelect.value;
        const amount = Number(amountInput.value);

        if (!Number.isFinite(amount) || amount < 0) {
            showFormMessage(message, "Please enter a valid limit amount.", true);
            return;
        }

        if (amount === 0) {
            delete categoryBudgets[category];
            showFormMessage(message, `Removed limit for ${category}.`, false);
        } else {
            categoryBudgets[category] = amount;
            showFormMessage(message, `Saved ${formatPKR(amount)} monthly limit for ${category}.`, false);
        }

        saveCategoryBudgets();
        updateCategoryReport();
    });
}

function setProgressBar(element, percentage) {
    if (!element) return;

    element.style.width = Math.min(percentage, 100) + "%";
    element.classList.remove("warning", "danger");

    if (percentage >= 100) {
        element.classList.add("danger");
    } else if (percentage >= 75) {
        element.classList.add("warning");
    }
}

function updateDashboardBudget() {
    const budget = document.getElementById("dashboard-budget");
    const spentLabel = document.getElementById("dashboard-spent");
    const percentLabel = document.getElementById("dashboard-percent");
    const progress = document.getElementById("dashboard-progress-fill");

    const spent = getSelectedMonthSpent();
    const percentage = monthlyBudget > 0 ? (spent / monthlyBudget) * 100 : 0;

    if (budget) budget.textContent = formatPKR(monthlyBudget);
    if (spentLabel) spentLabel.textContent = `Spent: ${formatPKR(spent)}`;
    if (percentLabel) percentLabel.textContent = `${Math.round(percentage)}%`;

    setProgressBar(progress, percentage);
}

function getBudgetMessage(percentage) {
    const isCurrentMonth = selectedMonth === getCurrentMonthKey();

    if (monthlyBudget <= 0) return "Set a budget to start tracking your progress.";

    if (percentage >= 100) {
        return isCurrentMonth
            ? "You have reached or exceeded your monthly budget."
            : "You went over your budget in this month.";
    }

    if (percentage >= 75) {
        return isCurrentMonth
            ? "You are getting close to your budget limit. Spend carefully."
            : "You stayed within budget, but used most of it.";
    }

    return isCurrentMonth
        ? "Great work! You are within your monthly budget."
        : "Great work! You stayed within your budget this month.";
}

function updateBudget() {
    const limitElement = document.getElementById("budget-limit");
    if (!limitElement) return;

    const spent = getSelectedMonthSpent();
    const remaining = monthlyBudget - spent;
    const percentage = monthlyBudget > 0 ? (spent / monthlyBudget) * 100 : 0;

    limitElement.textContent = formatPKR(monthlyBudget);

    const spentElement = document.getElementById("budget-spent");
    const remainingElement = document.getElementById("budget-remaining");
    const percentElement = document.getElementById("budget-percent");
    const messageElement = document.getElementById("budget-message");
    const spentLabel = document.getElementById("progress-spent-label");
    const limitLabel = document.getElementById("progress-limit-label");

    if (spentElement) spentElement.textContent = formatPKR(spent);
    if (remainingElement) remainingElement.textContent = formatPKR(remaining);
    if (percentElement) percentElement.textContent = `${Math.round(percentage)}%`;
    if (messageElement) messageElement.textContent = getBudgetMessage(percentage);
    if (spentLabel) spentLabel.textContent = `Spent: ${formatPKR(spent)}`;
    if (limitLabel) limitLabel.textContent = `Limit: ${formatPKR(monthlyBudget)}`;

    setProgressBar(document.getElementById("budget-progress-fill"), percentage);
    updateCategoryReport();
}

function updateCategoryReport() {
    const report = document.getElementById("category-report");
    if (!report) return;

    const totalsMap = {};
    getMonthTransactions("Expense").forEach(transaction => {
        const category = transaction.category || "Other";
        totalsMap[category] = (totalsMap[category] || 0) + Number(transaction.amount);
    });

    // Include any category that either has spending this month OR has a set category budget
    const allCategories = [...new Set([
        ...Object.keys(totalsMap),
        ...Object.keys(categoryBudgets).filter(cat => Number(categoryBudgets[cat]) > 0)
    ])];

    const entries = allCategories
        .map(category => [category, totalsMap[category] || 0])
        .sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        report.innerHTML = `<p class="empty-state">No expenses or category limits recorded for ${escapeHTML(formatMonth(selectedMonth))}.</p>`;
        return;
    }

    const maximum = Math.max(...entries.map(entry => entry[1]), 1);

    report.innerHTML = entries.map(([category, amount]) => {
        const limit = Number(categoryBudgets[category]) || 0;
        const percentage = limit > 0
            ? Math.min((amount / limit) * 100, 100)
            : (amount / maximum) * 100;

        const ratio = limit > 0 ? (amount / limit) * 100 : 0;
        const statusClass = limit > 0
            ? (ratio >= 100 ? "danger" : ratio >= 75 ? "warning" : "")
            : "";

        const limitBadge = limit > 0
            ? `<span class="category-limit-badge ${statusClass}">Limit: ${formatPKR(limit)} (${Math.round(ratio)}%)</span>`
            : "";

        return `
            <div class="category-row">
                <span>${escapeHTML(category)}</span>
                <div class="category-track"><div class="${statusClass}" style="width:${percentage}%"></div></div>
                <div class="category-meta">
                    ${limitBadge}
                    <strong>${formatPKR(amount)}</strong>
                </div>
            </div>
        `;
    }).join("");
}

/* -----------------------------------------
   START
   ----------------------------------------- */

function refreshApp() {
    updateMonthLabels();
    updateDashboard();
    displayTransactions();
    updateTransactionSummary();
    updateBudget();
}

setupTheme();
setupMonthPicker();
refreshApp();
