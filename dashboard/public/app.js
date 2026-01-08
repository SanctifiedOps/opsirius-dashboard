const state = {
  platform: "bonkfun",
  jobs: [],
  selectedJobId: null,
};

const metricsEls = {
  mainWallet: document.getElementById("metric-main-wallet"),
  mainBalance: document.getElementById("metric-main-balance"),
  walletCount: document.getElementById("metric-wallet-count"),
  walletsSol: document.getElementById("metric-wallets-sol"),
  totalSol: document.getElementById("metric-total-sol"),
  mint: document.getElementById("metric-mint"),
  tokenHoldings: document.getElementById("metric-token-holdings"),
  tokenValue: document.getElementById("metric-token-value"),
  tokenPrice: document.getElementById("metric-token-price"),
  pl: document.getElementById("metric-pl"),
  baseline: document.getElementById("metric-baseline"),
};

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const walletsTable = document.getElementById("wallets-table");
const walletTag = document.getElementById("wallet-tag");
const walletKeysInput = document.getElementById("wallets-private-keys");
const walletsAddBtn = document.getElementById("wallets-add-btn");
const walletsReplaceInput = document.getElementById("wallets-replace");
const walletsAddStatus = document.getElementById("wallets-add-status");
const configForm = document.getElementById("config-form");
const saveConfigBtn = document.getElementById("save-config");
const refreshBtn = document.getElementById("refresh-btn");
const baselineBtn = document.getElementById("baseline-btn");
const jobsRefreshBtn = document.getElementById("jobs-refresh");
const jobsToggleBtn = document.getElementById("jobs-toggle");
const jobsList = document.getElementById("jobs-list");
const logOutput = document.getElementById("log-output");
const logTitle = document.getElementById("log-title");
const logStop = document.getElementById("log-stop");
const tradeMintInput = document.getElementById("trade-mint");
const tradeResult = document.getElementById("trade-result");
const autoSellPercent = document.getElementById("auto-sell-percent");
const autoSellStart = document.getElementById("auto-sell-start");
const autoSellStop = document.getElementById("auto-sell-stop");
const autoSellStatus = document.getElementById("auto-sell-status");
const bundleMintInput = document.getElementById("bundle-mint");
const bundleCreatorInput = document.getElementById("bundle-creator");
const bundleTotalSolInput = document.getElementById("bundle-total-sol");
const bundleWalletCountInput = document.getElementById("bundle-wallet-count");
const bundleWalletMinSolInput = document.getElementById("bundle-wallet-min-sol");
const bundleExistingRun = document.getElementById("bundle-existing-run");
const bundleExistingResult = document.getElementById("bundle-existing-result");
const logoUploadInput = document.getElementById("logo-upload");
const logoPathInput = document.getElementById("logo-path");
const logoUploadStatus = document.getElementById("logo-upload-status");

const platformTabs = document.querySelectorAll(".tab[data-platform]");
const actionButtons = document.querySelectorAll(".action[data-action]");
const testButton = document.getElementById("action-test");
const tradeButtons = document.querySelectorAll(".trade-btn");

const configInputs = configForm ? Array.from(configForm.querySelectorAll("[data-key]")) : [];

const JOBS_PREVIEW_COUNT = 4;
let showAllJobs = false;

function setStatus(text, color) {
  if (statusText) {
    statusText.textContent = text;
  }
  if (color && statusDot) {
    statusDot.style.background = color;
  }
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatSol(value) {
  const num = toNumber(value);
  if (num === null) return "--";
  return `${num.toFixed(4)} SOL`;
}

function formatUsd(value) {
  const num = toNumber(value);
  if (num === null) return "--";
  return `$${num.toFixed(2)}`;
}

function formatShortKey(value) {
  if (!value) return "--";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function parseWalletKeys(raw) {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,\s]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

let authToken = null;

function promptForToken() {
  const input = window.prompt("Enter dashboard token");
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed || null;
}

function getAuthToken() {
  if (authToken) return authToken;
  const token = promptForToken();
  if (!token) return null;
  authToken = token;
  return authToken;
}

async function fetchJson(url, options = {}) {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing dashboard token");
  }
  const headers = { ...(options.headers || {}), "X-Opsirius-Token": token };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    authToken = null;
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error("Request failed");
  }
  return res.json();
}

function setPlatform(platform) {
  state.platform = platform;
  platformTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.platform === platform);
  });
  if (testButton) {
    testButton.style.display = platform === "bonkfun" ? "inline-flex" : "none";
  }
  if (tradeMintInput) tradeMintInput.value = "";
  if (tradeResult) tradeResult.textContent = "No trades yet.";
  if (bundleExistingResult) bundleExistingResult.textContent = "No bundle started.";
  if (autoSellStatus) autoSellStatus.textContent = "Auto-sell idle.";
  if (walletKeysInput) walletKeysInput.value = "";
  if (walletsReplaceInput) walletsReplaceInput.checked = false;
  if (walletsAddStatus) walletsAddStatus.textContent = "No wallet changes.";
  loadAll();
}

function getFormValue(el) {
  if (el.type === "checkbox") {
    return el.checked ? "true" : "false";
  }
  return el.value.trim();
}

function setFormValue(el, value) {
  if (el.type === "checkbox") {
    el.checked = String(value).toLowerCase() === "true";
    return;
  }
  el.value = value || "";
}

async function loadConfig() {
  if (!configInputs.length) return;
  const data = await fetchJson(`/api/config?platform=${state.platform}`);
  const env = data.env || {};
  configInputs.forEach((input) => {
    const key = input.dataset.key;
    if (key === "PRIVATE_KEY") {
      input.value = "";
      return;
    }
    setFormValue(input, env[key]);
  });
}

async function saveConfig() {
  if (!configInputs.length) return;
  const payload = {};
  configInputs.forEach((input) => {
    const key = input.dataset.key;
    const value = getFormValue(input);
    if (key === "PRIVATE_KEY" && !value) return;
    payload[key] = value;
  });
  await fetchJson(`/api/config?platform=${state.platform}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function loadMetrics() {
  const data = await fetchJson(`/api/metrics?platform=${state.platform}`);
  const totals = data.totals || {};
  const wallets = Array.isArray(data.wallets) ? data.wallets : [];
  const tokenStats = data.tokenStats || null;
  const deltaValue = toNumber(data.delta?.combinedSol);
  const totalTokens = toNumber(tokenStats?.totalTokens);
  const priceUsd = toNumber(tokenStats?.priceUsd);

  metricsEls.mainWallet.textContent = formatShortKey(data.mainWallet?.publicKey);
  metricsEls.mainBalance.textContent = formatSol(totals.mainSol);
  metricsEls.walletCount.textContent = String(wallets.length);
  metricsEls.walletsSol.textContent = formatSol(totals.walletsSol);
  metricsEls.totalSol.textContent = formatSol(totals.combinedSol);
  metricsEls.mint.textContent = formatShortKey(tokenStats?.mint);
  metricsEls.tokenHoldings.textContent = tokenStats
    ? totalTokens === null
      ? "Token balance unavailable"
      : `${totalTokens.toFixed(2)} tokens`
    : "No mint yet";
  metricsEls.tokenValue.textContent = formatUsd(tokenStats?.totalValueUsd);
  metricsEls.tokenPrice.textContent =
    priceUsd === null ? "Price unavailable" : `Price: $${priceUsd.toFixed(6)}`;

  if (tradeMintInput && tokenStats?.mint && !tradeMintInput.value) {
    tradeMintInput.value = tokenStats.mint;
  }

  metricsEls.pl.textContent = deltaValue === null ? "--" : `${deltaValue.toFixed(4)} SOL`;
  metricsEls.pl.classList.toggle("positive", deltaValue !== null && deltaValue > 0);
  metricsEls.pl.classList.toggle("negative", deltaValue !== null && deltaValue < 0);
  if (data.baseline?.timestamp) {
    const baselineDate = new Date(data.baseline.timestamp);
    metricsEls.baseline.textContent = Number.isNaN(baselineDate.valueOf())
      ? "Baseline not set"
      : `Baseline: ${baselineDate.toLocaleString()}`;
  } else {
    metricsEls.baseline.textContent = "Baseline not set";
  }

  renderWallets(wallets);
}

function renderWallets(wallets) {
  if (!walletsTable || !walletTag) return;
  clearElement(walletsTable);

  const headerRow = document.createElement("div");
  headerRow.className = "wallet-row header";
  ["#", "Public key", "SOL", "Copy", "Delete"].forEach((label) => {
    const cell = document.createElement("div");
    cell.textContent = label;
    headerRow.appendChild(cell);
  });
  walletsTable.appendChild(headerRow);

  if (!wallets.length) {
    const emptyRow = document.createElement("div");
    emptyRow.className = "wallet-row";
    emptyRow.textContent = "No wallets yet.";
    walletsTable.appendChild(emptyRow);
    walletTag.textContent = "0 wallets";
    return;
  }

  wallets.forEach((wallet, index) => {
    const row = document.createElement("div");
    row.className = "wallet-row";

    const indexCell = document.createElement("div");
    indexCell.textContent = String(index + 1);

    const keyCell = document.createElement("div");
    keyCell.textContent = wallet.publicKey || "--";

    const solCell = document.createElement("div");
    solCell.textContent = formatSol(wallet.sol);

    const copyCell = document.createElement("div");
    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy";
    if (wallet.publicKey) {
      copyButton.addEventListener("click", () => {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(wallet.publicKey);
          setStatus("Public key copied", "#1d7874");
        } else {
          setStatus("Clipboard unavailable", "#b9382f");
        }
      });
    } else {
      copyButton.disabled = true;
    }
    copyCell.appendChild(copyButton);

    const deleteCell = document.createElement("div");
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.className = "danger";
    if (wallet.publicKey) {
      deleteButton.addEventListener("click", async () => {
        deleteButton.disabled = true;
        try {
          await deleteWallet(wallet.publicKey);
        } finally {
          deleteButton.disabled = false;
        }
      });
    } else {
      deleteButton.disabled = true;
    }
    deleteCell.appendChild(deleteButton);

    row.append(indexCell, keyCell, solCell, copyCell, deleteCell);
    walletsTable.appendChild(row);
  });

  walletTag.textContent = `${wallets.length} wallets`;
}

async function deleteWallet(publicKey) {
  if (!publicKey) return;
  const confirmed = window.confirm(`Delete wallet ${formatShortKey(publicKey)}?`);
  if (!confirmed) return;

  setStatus("Deleting wallet...", "#f26b3a");
  if (walletsAddStatus) walletsAddStatus.textContent = "Deleting wallet...";
  try {
    await fetchJson("/api/wallets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: state.platform, publicKey }),
    });
    if (walletsAddStatus) {
      walletsAddStatus.textContent = `Deleted wallet ${formatShortKey(publicKey)}.`;
    }
    await loadMetrics();
    setStatus("Wallet deleted", "#1d7874");
  } catch (error) {
    if (walletsAddStatus) walletsAddStatus.textContent = "Failed to delete wallet.";
    setStatus("Delete failed", "#b9382f");
  }
}

async function addWallets() {
  if (!walletKeysInput) return;
  const keys = parseWalletKeys(walletKeysInput.value);
  if (!keys.length) {
    if (walletsAddStatus) walletsAddStatus.textContent = "Paste at least one private key.";
    return;
  }
  if (keys.length > 50) {
    if (walletsAddStatus) walletsAddStatus.textContent = "Too many keys (max 50 per upload).";
    return;
  }

  if (walletsAddStatus) walletsAddStatus.textContent = "Adding wallets...";
  if (walletsAddBtn) walletsAddBtn.disabled = true;
  setStatus("Adding wallets...", "#f26b3a");

  try {
    const data = await fetchJson("/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: state.platform,
        keys,
        replace: Boolean(walletsReplaceInput?.checked),
      }),
    });
    const total = Number.isFinite(data.total) ? data.total : keys.length;
    const added = Number.isFinite(data.added) ? data.added : 0;
    const skipped = Number.isFinite(data.skipped) ? data.skipped : 0;
    const invalid = Number.isFinite(data.invalid) ? data.invalid : 0;
    const walletCount = Number.isFinite(data.walletCount) ? data.walletCount : "--";

    if (walletsAddStatus) {
      walletsAddStatus.textContent = `Added ${added}/${total} (skipped ${skipped}, invalid ${invalid}). Total wallets: ${walletCount}.`;
    }
    walletKeysInput.value = "";
    await loadMetrics();
    setStatus("Wallets updated", "#1d7874");
  } catch (error) {
    if (walletsAddStatus) walletsAddStatus.textContent = "Failed to add wallets.";
    setStatus("Wallet update failed", "#b9382f");
  } finally {
    if (walletsAddBtn) walletsAddBtn.disabled = false;
  }
}

async function runAction(action) {
  await fetchJson("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: state.platform, action }),
  });
  await loadJobs(true);
}

async function runTrade(side, percent, scope) {
  const payload = {
    platform: state.platform,
    side,
    percent: Number(percent),
  };
  const tokenMint = tradeMintInput?.value.trim();
  if (tokenMint) payload.tokenMint = tokenMint;

  if (tradeResult) {
    tradeResult.textContent = `Submitting ${side} ${percent}% trade...`;
  }
  const endpoint = scope === "dev" ? "/api/trade/dev" : "/api/trade";
  const data = await fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const summary = data.result;
  if (tradeResult) {
    const scopeLabel = summary.scope === "dev" ? "Dev wallet" : "Bundler wallets";
    tradeResult.textContent = `Done (${scopeLabel}): ${summary.succeeded}/${summary.attempted} executed (${summary.skipped} skipped, ${summary.failed} failed).`;
  }
}

async function runBundleExisting() {
  const tokenMint = bundleMintInput?.value.trim();
  const tokenCreator = bundleCreatorInput?.value.trim();
  const totalSol = Number(bundleTotalSolInput?.value);
  const walletCount = Number(bundleWalletCountInput?.value);
  const walletMinSol = Number(bundleWalletMinSolInput?.value);

  if (!tokenMint) {
    if (bundleExistingResult) bundleExistingResult.textContent = "Token mint is required.";
    return;
  }
  if (!totalSol || totalSol <= 0) {
    if (bundleExistingResult) bundleExistingResult.textContent = "Total SOL must be greater than 0.";
    return;
  }

  if (bundleExistingResult) {
    bundleExistingResult.textContent = "Starting bundle...";
  }

  const payload = {
    platform: state.platform,
    tokenMint,
    tokenCreator: tokenCreator || undefined,
    totalSol,
    walletCount: walletCount || undefined,
    walletMinSol: walletMinSol || undefined,
  };

  await fetchJson("/api/bundle-existing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (bundleExistingResult) {
    bundleExistingResult.textContent = "Bundle started. Check Jobs for progress.";
  }
  await loadJobs(true);
}

async function loadAutoSellStatus() {
  const data = await fetchJson(`/api/auto-sell/status?platform=${state.platform}`);
  if (!autoSellStatus) return;
  if (!data.watcher) {
    autoSellStatus.textContent = "Auto-sell idle.";
    return;
  }
  const watcher = data.watcher;
  autoSellStatus.textContent = `Watching ${watcher.mint} (target +${watcher.targetPercent}%).`;
}

async function startAutoSellWatch() {
  const targetPercent = Number(autoSellPercent?.value || 0);
  if (!targetPercent || targetPercent <= 0) {
    if (autoSellStatus) autoSellStatus.textContent = "Enter a valid target percent.";
    return;
  }
  if (autoSellStatus) autoSellStatus.textContent = "Starting auto-sell...";
  await fetchJson("/api/auto-sell/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: state.platform, targetPercent }),
  });
  await loadAutoSellStatus();
}

async function stopAutoSellWatch() {
  await fetchJson("/api/auto-sell/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: state.platform }),
  });
  if (autoSellStatus) autoSellStatus.textContent = "Auto-sell stopped.";
}

async function loadJobs(selectLatest = false) {
  const data = await fetchJson(`/api/jobs?platform=${state.platform}`);
  state.jobs = Array.isArray(data.jobs) ? data.jobs : [];

  if (selectLatest && state.jobs.length) {
    state.selectedJobId = state.jobs[0].id;
    await loadJobLog(state.selectedJobId);
  }

  renderJobs();
}

function renderJobs() {
  if (!jobsList) return;
  clearElement(jobsList);

  const shouldShowAll = showAllJobs || state.jobs.length <= JOBS_PREVIEW_COUNT;
  const visibleJobs = shouldShowAll
    ? state.jobs
    : state.jobs.slice(0, JOBS_PREVIEW_COUNT);

  updateJobsToggle(visibleJobs.length);

  if (!visibleJobs.length) {
    const emptyItem = document.createElement("div");
    emptyItem.className = "job-item";
    emptyItem.textContent = "No jobs yet.";
    jobsList.appendChild(emptyItem);
    return;
  }

  visibleJobs.forEach((job) => {
    const item = document.createElement("div");
    item.className = "job-item";
    if (job.id === state.selectedJobId) {
      item.classList.add("active");
    }
    item.dataset.id = job.id;

    const title = document.createElement("div");
    title.className = "job-title";
    title.textContent = job.action || "Unknown action";

    const meta = document.createElement("div");
    meta.className = "job-meta";
    const startedAt = job.startedAt ? new Date(job.startedAt) : null;
    const when =
      startedAt && !Number.isNaN(startedAt.valueOf())
        ? startedAt.toLocaleTimeString()
        : "Unknown time";
    meta.textContent = `${when} - ${job.status || "unknown"}`;

    item.append(title, meta);
    item.addEventListener("click", async () => {
      state.selectedJobId = item.dataset.id;
      await loadJobLog(state.selectedJobId);
      renderJobs();
    });
    jobsList.appendChild(item);
  });
}

function updateJobsToggle(visibleCount) {
  if (!jobsToggleBtn) return;
  const totalCount = state.jobs.length;
  if (totalCount <= JOBS_PREVIEW_COUNT) {
    jobsToggleBtn.style.display = "none";
    return;
  }
  jobsToggleBtn.style.display = "inline-flex";
  if (showAllJobs) {
    jobsToggleBtn.textContent = `Show recent (${JOBS_PREVIEW_COUNT})`;
  } else {
    const hidden = Math.max(0, totalCount - visibleCount);
    jobsToggleBtn.textContent = `View all jobs (${hidden} more)`;
  }
}

async function loadJobLog(jobId) {
  const data = await fetchJson(`/api/jobs/${jobId}`);
  if (logTitle) {
    logTitle.textContent = `${data.job.action} - ${data.job.status}`;
  }
  if (logOutput) {
    logOutput.textContent = data.log || "No log output.";
  }
  if (logStop) {
    logStop.disabled = data.job.status !== "running";
  }
}

async function stopJob() {
  if (!state.selectedJobId) return;
  await fetchJson(`/api/jobs/${state.selectedJobId}/stop`, { method: "POST" });
  await loadJobs();
}

async function recordBaseline() {
  await fetchJson(`/api/metrics/baseline?platform=${state.platform}`, {
    method: "POST",
  });
  await loadMetrics();
}

async function loadAll() {
  try {
    setStatus("Loading...", "#f26b3a");
    await Promise.all([loadConfig(), loadMetrics(), loadJobs(true), loadAutoSellStatus()]);
    setStatus("Ready", "#1d7874");
  } catch (error) {
    setStatus("Error loading data", "#b9382f");
  }
}

platformTabs.forEach((tab) => {
  tab.addEventListener("click", () => setPlatform(tab.dataset.platform));
});

actionButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    setStatus(`Running ${btn.dataset.action}...`, "#f26b3a");
    try {
      await runAction(btn.dataset.action);
      setStatus("Ready", "#1d7874");
    } catch (error) {
      setStatus("Action failed", "#b9382f");
    }
  });
});

tradeButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const side = btn.dataset.side;
    const percent = btn.dataset.percent;
    const scope = btn.dataset.scope || "bundler";
    const scopeLabel = scope === "dev" ? "dev" : "bundler";
    setStatus(`${side} ${percent}% (${scopeLabel}) in progress...`, "#f26b3a");
    try {
      await runTrade(side, percent, scope);
      setStatus("Trade complete", "#1d7874");
    } catch (error) {
      if (tradeResult) tradeResult.textContent = "Trade failed. Check RPC or mint.";
      setStatus("Trade failed", "#b9382f");
    }
  });
});

if (bundleExistingRun) {
  bundleExistingRun.addEventListener("click", async () => {
    setStatus("Starting bundle...", "#f26b3a");
    try {
      await runBundleExisting();
      setStatus("Bundle started", "#1d7874");
    } catch (error) {
      if (bundleExistingResult) bundleExistingResult.textContent = "Failed to start bundle.";
      setStatus("Bundle failed", "#b9382f");
    }
  });
}

if (autoSellStart) {
  autoSellStart.addEventListener("click", async () => {
    setStatus("Auto-sell starting...", "#f26b3a");
    try {
      await startAutoSellWatch();
      setStatus("Auto-sell active", "#1d7874");
    } catch (error) {
      if (autoSellStatus) autoSellStatus.textContent = "Auto-sell failed to start.";
      setStatus("Auto-sell failed", "#b9382f");
    }
  });
}

if (autoSellStop) {
  autoSellStop.addEventListener("click", async () => {
    await stopAutoSellWatch();
    setStatus("Auto-sell stopped", "#1d7874");
  });
}

if (walletsAddBtn) {
  walletsAddBtn.addEventListener("click", async () => {
    await addWallets();
  });
}

if (logoUploadInput) {
  logoUploadInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (logoUploadStatus) logoUploadStatus.textContent = "Uploading logo...";
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      const response = await fetchJson("/api/upload-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: state.platform,
          fileName: file.name,
          dataUrl,
        }),
      });
      if (logoPathInput) {
        logoPathInput.value = response.path;
      }
      if (logoUploadStatus) logoUploadStatus.textContent = "Logo uploaded.";
    } catch (error) {
      if (logoUploadStatus) logoUploadStatus.textContent = "Logo upload failed.";
    }
  });
}

if (saveConfigBtn) {
  saveConfigBtn.addEventListener("click", async () => {
    setStatus("Saving config...", "#f26b3a");
    try {
      await saveConfig();
      setStatus("Config saved", "#1d7874");
    } catch (error) {
      setStatus("Failed to save config", "#b9382f");
    }
  });
}

if (refreshBtn) refreshBtn.addEventListener("click", loadAll);
if (jobsRefreshBtn) jobsRefreshBtn.addEventListener("click", () => loadJobs());
if (jobsToggleBtn) {
  jobsToggleBtn.addEventListener("click", async () => {
    showAllJobs = !showAllJobs;
    if (!showAllJobs && state.jobs.length) {
      const recentJobs = state.jobs.slice(0, JOBS_PREVIEW_COUNT);
      const stillVisible = recentJobs.some((job) => job.id === state.selectedJobId);
      if (!stillVisible) {
        state.selectedJobId = recentJobs[0].id;
        await loadJobLog(state.selectedJobId);
      }
    }
    renderJobs();
  });
}
if (baselineBtn) baselineBtn.addEventListener("click", recordBaseline);
if (logStop) logStop.addEventListener("click", stopJob);

setPlatform(state.platform);

setInterval(async () => {
  try {
    await Promise.all([loadMetrics(), loadJobs(), loadAutoSellStatus()]);
  } catch (error) {
    setStatus("Background refresh failed", "#b9382f");
  }
}, 20000);
