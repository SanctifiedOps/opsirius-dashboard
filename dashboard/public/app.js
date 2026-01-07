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
const configForm = document.getElementById("config-form");
const saveConfigBtn = document.getElementById("save-config");
const refreshBtn = document.getElementById("refresh-btn");
const baselineBtn = document.getElementById("baseline-btn");
const jobsRefreshBtn = document.getElementById("jobs-refresh");
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

const configInputs = Array.from(configForm.querySelectorAll("[data-key]"));

function setStatus(text, color) {
  statusText.textContent = text;
  if (color) {
    statusDot.style.background = color;
  }
}

function formatSol(value) {
  if (value === null || value === undefined) return "--";
  return `${value.toFixed(4)} SOL`;
}

function formatUsd(value) {
  if (value === null || value === undefined) return "--";
  return `$${value.toFixed(2)}`;
}

function formatShortKey(value) {
  if (!value) return "--";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
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
  testButton.style.display = platform === "bonkfun" ? "inline-flex" : "none";
  if (tradeMintInput) tradeMintInput.value = "";
  if (tradeResult) tradeResult.textContent = "No trades yet.";
  if (bundleExistingResult) bundleExistingResult.textContent = "No bundle started.";
  if (autoSellStatus) autoSellStatus.textContent = "Auto-sell idle.";
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
  metricsEls.mainWallet.textContent = formatShortKey(data.mainWallet?.publicKey);
  metricsEls.mainBalance.textContent = formatSol(data.totals.mainSol);
  metricsEls.walletCount.textContent = data.wallets.length;
  metricsEls.walletsSol.textContent = formatSol(data.totals.walletsSol);
  metricsEls.totalSol.textContent = formatSol(data.totals.combinedSol);
  metricsEls.mint.textContent = formatShortKey(data.tokenStats?.mint);
  metricsEls.tokenHoldings.textContent = data.tokenStats
    ? `${data.tokenStats.totalTokens.toFixed(2)} tokens`
    : "No mint yet";
  metricsEls.tokenValue.textContent = formatUsd(data.tokenStats?.totalValueUsd);
  metricsEls.tokenPrice.textContent = data.tokenStats?.priceUsd
    ? `Price: $${data.tokenStats.priceUsd.toFixed(6)}`
    : "Price unavailable";

  if (tradeMintInput && data.tokenStats?.mint && !tradeMintInput.value) {
    tradeMintInput.value = data.tokenStats.mint;
  }

  metricsEls.pl.textContent = data.delta
    ? `${data.delta.combinedSol.toFixed(4)} SOL`
    : "--";
  metricsEls.pl.classList.toggle("positive", data.delta?.combinedSol > 0);
  metricsEls.pl.classList.toggle("negative", data.delta?.combinedSol < 0);
  metricsEls.baseline.textContent = data.baseline
    ? `Baseline: ${new Date(data.baseline.timestamp).toLocaleString()}`
    : "Baseline not set";

  renderWallets(data.wallets);
}

function renderWallets(wallets) {
  const rows = wallets
    .map(
      (wallet, index) => `
        <div class="wallet-row">
          <div>${index + 1}</div>
          <div>${wallet.publicKey}</div>
          <div>${formatSol(wallet.sol)}</div>
          <div><button data-copy="${wallet.publicKey}">Copy</button></div>
        </div>
      `
    )
    .join("");
  walletsTable.innerHTML = `
    <div class="wallet-row header">
      <div>#</div>
      <div>Public key</div>
      <div>SOL</div>
      <div>Copy</div>
    </div>
    ${rows || "<div class='wallet-row'>No wallets yet.</div>"}
  `;
  walletTag.textContent = `${wallets.length} wallets`;
  walletsTable.querySelectorAll("button[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      setStatus("Public key copied", "#1d7874");
    });
  });
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
  state.jobs = data.jobs || [];
  jobsList.innerHTML = state.jobs
    .map((job) => {
      const when = new Date(job.startedAt).toLocaleTimeString();
      return `
        <div class="job-item ${job.id === state.selectedJobId ? "active" : ""}" data-id="${job.id}">
          <div class="job-title">${job.action}</div>
          <div class="job-meta">${when} - ${job.status}</div>
        </div>
      `;
    })
    .join("");

  if (selectLatest && state.jobs.length) {
    state.selectedJobId = state.jobs[0].id;
    await loadJobLog(state.selectedJobId);
  }

  jobsList.querySelectorAll(".job-item").forEach((item) => {
    item.addEventListener("click", async () => {
      state.selectedJobId = item.dataset.id;
      await loadJobLog(state.selectedJobId);
      loadJobs();
    });
  });
}

async function loadJobLog(jobId) {
  const data = await fetchJson(`/api/jobs/${jobId}`);
  logTitle.textContent = `${data.job.action} - ${data.job.status}`;
  logOutput.textContent = data.log || "No log output.";
  logStop.disabled = data.job.status !== "running";
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
    await runAction(btn.dataset.action);
    setStatus("Ready", "#1d7874");
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

saveConfigBtn.addEventListener("click", async () => {
  setStatus("Saving config...", "#f26b3a");
  try {
    await saveConfig();
    setStatus("Config saved", "#1d7874");
  } catch (error) {
    setStatus("Failed to save config", "#b9382f");
  }
});

refreshBtn.addEventListener("click", loadAll);
jobsRefreshBtn.addEventListener("click", () => loadJobs());
baselineBtn.addEventListener("click", recordBaseline);
logStop.addEventListener("click", stopJob);

setPlatform(state.platform);

setInterval(() => {
  loadMetrics();
  loadJobs();
  loadAutoSellStatus();
}, 20000);
