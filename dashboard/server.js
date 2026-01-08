const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Connection, Keypair, PublicKey, VersionedTransaction } = require("@solana/web3.js");
const bs58 = require("bs58");
const bs58Codec = bs58.default || bs58;

const app = express();
const PORT = process.env.PORT || 4545;
const HOST = "127.0.0.1";
const DASHBOARD_ENV_PATH = path.join(__dirname, ".env");

function stripEnvQuotes(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readDashboardToken() {
  try {
    if (!fs.existsSync(DASHBOARD_ENV_PATH)) return "";
    const raw = fs.readFileSync(DASHBOARD_ENV_PATH, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== "DASHBOARD_TOKEN") continue;
      const value = trimmed.slice(eq + 1).trim();
      return stripEnvQuotes(value);
    }
    return "";
  } catch (error) {
    return "";
  }
}

const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || readDashboardToken();

const ROOT = path.resolve(__dirname, "..");
const BUNDLER_ROOT = path.join(
  ROOT,
  "solana-token-bundler-pumpfun-pump.fun-bonkfun-bonk.fun"
);
const DATA_DIR = path.join(__dirname, "data");
const LOG_DIR = path.join(DATA_DIR, "logs");
const JOBS_PATH = path.join(DATA_DIR, "jobs.json");
const BASELINE_PATH = path.join(DATA_DIR, "baselines.json");

const JUPITER_BASE = "https://quote-api.jup.ag/v6";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SLIPPAGE_BPS = 50;
const RESERVE_LAMPORTS = 5_000_000;
const MIN_TRADE_LAMPORTS = 5000;
const MAX_PARALLEL_TRADES = 3;
const PRIORITY_FEE_STEPS = [20_000, 60_000, 120_000, 240_000, 400_000];

const PLATFORM_DIRS = {
  bonkfun: "Bonkfun",
  pumpfun: "pumpfun",
};

const ACTIONS = {
  start: ["start"],
  "deploy-only": ["run", "deploy-only"],
  "bundle-existing": ["run", "bundle-existing"],
  single: ["run", "single"],
  close: ["run", "close"],
  gather: ["run", "gather"],
  status: ["run", "status"],
  test: ["run", "test"],
};

const ENV_KEYS = new Set([
  "PRIVATE_KEY",
  "RPC_ENDPOINT",
  "RPC_WEBSOCKET_ENDPOINT",
  "LIL_JIT_ENDPOINT",
  "LIL_JIT_WEBSOCKET_ENDPOINT",
  "LIL_JIT_MODE",
  "SWAP_AMOUNT",
  "DISTRIBUTION_WALLETNUM",
  "JITO_FEE",
  "TOKEN_NAME",
  "TOKEN_SYMBOL",
  "DESCRIPTION",
  "TOKEN_SHOW_NAME",
  "TOKEN_CREATE_ON",
  "TWITTER",
  "TELEGRAM",
  "WEBSITE",
  "FILE",
  "VANITY_MODE",
  "BUYER_WALLET",
  "BUYER_AMOUNT",
  "SKIP_DISTRIBUTION",
  "REUSE_WALLETS",
  "WALLET_MIN_SOL",
  "UNDERFUNDED_MODE",
  "WALLET_LIMIT",
  "TARGET_MINT",
  "TARGET_CREATOR",
  "KEYS_DIR",
  "BUNDLE_TOTAL_SOL",
]);

const metricsCache = new Map();
const activeJobs = new Map();
const autoSellWatchers = new Map();

app.use(express.json({ limit: "6mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", (req, res, next) => {
  if (!DASHBOARD_TOKEN) {
    return res.status(500).json({ error: "Dashboard token not configured" });
  }
  const token = req.get("x-opsirius-token") || "";
  if (token !== DASHBOARD_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function platformDir(platform) {
  const dirName = PLATFORM_DIRS[platform];
  if (!dirName) return null;
  const directPath = path.join(ROOT, dirName);
  if (fs.existsSync(directPath)) return directPath;
  const nestedPath = path.join(BUNDLER_ROOT, dirName);
  if (fs.existsSync(nestedPath)) return nestedPath;
  return null;
}

function envPath(platform) {
  const dir = platformDir(platform);
  if (!dir) return null;
  return path.join(dir, ".env");
}

function stripQuotes(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(raw) {
  const result = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    result[key] = stripQuotes(value);
  }
  return result;
}

function readEnv(platform) {
  const filePath = envPath(platform);
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return parseEnvFile(raw);
}

function formatEnvValue(value) {
  if (value === null || value === undefined) return '""';
  const stringValue = String(value);
  if (stringValue === "") return '""';
  const isNumber = /^-?\d+(\.\d+)?$/.test(stringValue);
  const isBool = /^(true|false)$/i.test(stringValue);
  if ((isNumber || isBool) && !/[\s#"]/.test(stringValue)) {
    return stringValue.toLowerCase();
  }
  const escaped = stringValue.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function updateEnv(platform, updates) {
  const filePath = envPath(platform);
  if (!filePath) throw new Error("Unknown platform");
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
  const lines = existing.split(/\r?\n/);
  const updated = new Set();

  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq).trim();
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    updated.add(key);
    return `${key}=${formatEnvValue(updates[key])}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (updated.has(key)) continue;
    nextLines.push(`${key}=${formatEnvValue(value)}`);
  }

  const output = nextLines.join("\n").replace(/\n+$/, "\n");
  fs.writeFileSync(filePath, output);
}

function keysDir(platform) {
  const dir = platformDir(platform);
  if (!dir) return null;
  const env = readEnv(platform);
  const resolvedDir = env.KEYS_DIR || "keys";
  return path.isAbsolute(resolvedDir) ? resolvedDir : path.join(dir, resolvedDir);
}

function keysFilePath(platform, fileName) {
  const dir = keysDir(platform);
  if (!dir) return null;
  return path.join(dir, fileName);
}

function readKeys(platform, fileName) {
  const filePath = keysFilePath(platform, fileName);
  if (!filePath) return [];
  return readJson(filePath, []);
}

function writeKeys(platform, fileName, keys) {
  const filePath = keysFilePath(platform, fileName);
  if (!filePath) throw new Error("Unknown platform");
  ensureDir(path.dirname(filePath));
  writeJson(filePath, keys);
}

function safeKeypair(secret) {
  try {
    return Keypair.fromSecretKey(bs58Codec.decode(secret));
  } catch (error) {
    return null;
  }
}

function getBundlerWallets(platform) {
  const secrets = readKeys(platform, "data.json");
  return secrets
    .map((secret) => safeKeypair(secret))
    .filter((kp) => Boolean(kp));
}

function getDevWallet(platform) {
  const env = readEnv(platform);
  if (!env.PRIVATE_KEY) return null;
  return safeKeypair(env.PRIVATE_KEY);
}

function getMintPublicKey(platform) {
  const secrets = readKeys(platform, "mint.json");
  if (!secrets.length) return null;
  const kp = safeKeypair(secrets[0]);
  return kp ? kp.publicKey.toBase58() : null;
}

function getMainWallet(platform) {
  const env = readEnv(platform);
  if (!env.PRIVATE_KEY) return null;
  const kp = safeKeypair(env.PRIVATE_KEY);
  return kp ? kp.publicKey.toBase58() : null;
}

function getConnection(platform) {
  const env = readEnv(platform);
  const endpoint = env.RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
  return new Connection(endpoint, "confirmed");
}

async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getTokenAmountForOwner(connection, owner, mint) {
  const response = await connection.getTokenAccountsByOwner(
    owner,
    { mint },
    "jsonParsed"
  );
  let total = 0;
  for (const item of response.value) {
    const parsed = item.account?.data?.parsed;
    const amount = parsed?.info?.tokenAmount?.uiAmount;
    if (typeof amount === "number") {
      total += amount;
    }
  }
  return total;
}

async function getTokenAmountRawForOwner(connection, owner, mint) {
  const response = await connection.getTokenAccountsByOwner(
    owner,
    { mint },
    "jsonParsed"
  );
  let total = 0n;
  for (const item of response.value) {
    const parsed = item.account?.data?.parsed;
    const amount = parsed?.info?.tokenAmount?.amount;
    if (typeof amount === "string") {
      total += BigInt(amount);
    }
  }
  return total;
}

async function buildSwapTransaction({
  wallet,
  mint,
  side,
  amount,
  priorityFeeLamports,
}) {
  const inputMint = side === "buy" ? SOL_MINT : mint.toBase58();
  const outputMint = side === "buy" ? mint.toBase58() : SOL_MINT;
  const amountParam = typeof amount === "bigint" ? amount.toString() : String(amount);
  const quoteUrl = `${JUPITER_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountParam}&slippageBps=${SLIPPAGE_BPS}`;

  const quoteResponse = await (await fetch(quoteUrl)).json();
  if (!quoteResponse || quoteResponse.error) {
    throw new Error("Quote failed");
  }

  const swapResponse = await (
    await fetch(`${JUPITER_BASE}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports,
      }),
    })
  ).json();

  if (!swapResponse?.swapTransaction) {
    throw new Error("Swap build failed");
  }

  const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  transaction.sign([wallet]);
  return transaction;
}

async function sendSignedTransaction(connection, transaction) {
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

async function executeSwapWithEscalation({
  connection,
  wallet,
  mint,
  side,
  amount,
}) {
  let lastError = null;
  for (const feeLamports of PRIORITY_FEE_STEPS) {
    try {
      const transaction = await buildSwapTransaction({
        wallet,
        mint,
        side,
        amount,
        priorityFeeLamports: feeLamports,
      });
      const signature = await sendSignedTransaction(connection, transaction);
      return { signature, feeLamports };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Swap failed after fee escalation");
}

async function executeTradeForWallets({ platform, side, percent, tokenMint, wallets, scope }) {
  const connection = getConnection(platform);
  if (!wallets.length) {
    throw new Error("No wallets available");
  }

  const mintAddress = tokenMint || getMintPublicKey(platform);
  if (!mintAddress) {
    throw new Error("No mint available");
  }
  const mint = new PublicKey(mintAddress);

  const tasks = [];
  if (side === "buy") {
    const balances = await mapWithLimit(wallets, 5, (wallet) =>
      connection.getBalance(wallet.publicKey)
    );
    balances.forEach((lamports, index) => {
      const spendable = Math.max(0, lamports - RESERVE_LAMPORTS);
      const amount = Math.floor(spendable * (percent / 100));
      if (amount >= MIN_TRADE_LAMPORTS) {
        tasks.push({ wallet: wallets[index], amount });
      }
    });
  } else {
    const tokenBalances = await mapWithLimit(wallets, 4, (wallet) =>
      getTokenAmountRawForOwner(connection, wallet.publicKey, mint)
    );
    tokenBalances.forEach((rawAmount, index) => {
      const amount = (rawAmount * BigInt(percent)) / 100n;
      if (amount > 0n) {
        tasks.push({ wallet: wallets[index], amount });
      }
    });
  }

  const results = await mapWithLimit(tasks, MAX_PARALLEL_TRADES, async (task) => {
    try {
      const result = await executeSwapWithEscalation({
        connection,
        wallet: task.wallet,
        mint,
        side,
        amount: task.amount,
      });
      return {
        wallet: task.wallet.publicKey.toBase58(),
        signature: result.signature,
        feeLamports: result.feeLamports,
      };
    } catch (error) {
      return {
        wallet: task.wallet.publicKey.toBase58(),
        error: error?.message || "Swap failed",
      };
    }
  });

  const succeeded = results.filter((item) => item.signature).length;
  const failed = results.filter((item) => item.error).length;
  const skipped = wallets.length - tasks.length;

  return {
    scope,
    platform,
    side,
    percent,
    mint: mint.toBase58(),
    attempted: tasks.length,
    succeeded,
    failed,
    skipped,
    results,
  };
}

async function executeTrade({ platform, side, percent, tokenMint }) {
  const wallets = getBundlerWallets(platform);
  return executeTradeForWallets({
    platform,
    side,
    percent,
    tokenMint,
    wallets,
    scope: "bundler",
  });
}

async function fetchTokenPrice(mint) {
  try {
    const url = `https://price.jup.ag/v4/price?ids=${mint}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.data?.[mint]?.price;
    return typeof price === "number" ? price : null;
  } catch (error) {
    return null;
  }
}

function stopAutoSell(platform) {
  const watcher = autoSellWatchers.get(platform);
  if (watcher?.intervalId) {
    clearInterval(watcher.intervalId);
  }
  autoSellWatchers.delete(platform);
}

async function startAutoSell({ platform, targetPercent, tokenMint }) {
  stopAutoSell(platform);

  const mintAddress = tokenMint || getMintPublicKey(platform);
  if (!mintAddress) {
    throw new Error("No mint available for auto-sell");
  }

  const baselinePrice = await fetchTokenPrice(mintAddress);
  if (!baselinePrice) {
    throw new Error("Price unavailable for auto-sell");
  }

  const targetPrice = baselinePrice * (1 + targetPercent / 100);
  const devWallet = getDevWallet(platform);
  if (!devWallet) {
    throw new Error("Dev wallet not configured");
  }

  const watcher = {
    platform,
    mint: mintAddress,
    baselinePrice,
    targetPrice,
    targetPercent,
    lastPrice: baselinePrice,
    startedAt: new Date().toISOString(),
    status: "watching",
    intervalMs: 15000,
    intervalId: null,
  };

  watcher.intervalId = setInterval(async () => {
    try {
      const price = await fetchTokenPrice(mintAddress);
      if (!price) return;
      watcher.lastPrice = price;
      if (price >= targetPrice) {
        watcher.status = "triggered";
        await executeTradeForWallets({
          platform,
          side: "sell",
          percent: 100,
          tokenMint: mintAddress,
          wallets: [devWallet],
          scope: "dev",
        });
        watcher.status = "sold";
        stopAutoSell(platform);
      }
    } catch (error) {
      watcher.status = "error";
    }
  }, watcher.intervalMs);

  autoSellWatchers.set(platform, watcher);
  return watcher;
}

function readBaseline(platform) {
  const baselines = readJson(BASELINE_PATH, {});
  return baselines[platform] || null;
}

function saveBaseline(platform, baseline) {
  const baselines = readJson(BASELINE_PATH, {});
  baselines[platform] = baseline;
  writeJson(BASELINE_PATH, baselines);
}

function summarizeEnv(env) {
  const sanitized = { ...env };
  delete sanitized.PRIVATE_KEY;
  return {
    env: sanitized,
    hasPrivateKey: Boolean(env.PRIVATE_KEY),
  };
}

async function buildMetrics(platform) {
  const connection = getConnection(platform);
  const walletKeypairs = getBundlerWallets(platform);
  const walletPubkeys = walletKeypairs.map((kp) => kp.publicKey);
  const mainWallet = getMainWallet(platform);
  const mainPubkey = mainWallet ? new PublicKey(mainWallet) : null;

  const walletBalances = await mapWithLimit(walletPubkeys, 5, async (pubkey) => {
    const balance = await connection.getBalance(pubkey);
    return balance / 1e9;
  });

  let mainSol = null;
  if (mainPubkey) {
    const balance = await connection.getBalance(mainPubkey);
    mainSol = balance / 1e9;
  }

  const wallets = walletPubkeys.map((pubkey, index) => ({
    publicKey: pubkey.toBase58(),
    sol: walletBalances[index] || 0,
  }));

  const walletsSol = walletBalances.reduce((acc, val) => acc + (val || 0), 0);
  const combinedSol = walletsSol + (mainSol || 0);

  const mintAddress = getMintPublicKey(platform);
  let tokenStats = null;

  if (mintAddress) {
    const mint = new PublicKey(mintAddress);
    const owners = [...walletPubkeys];
    if (mainPubkey) owners.push(mainPubkey);
    const tokenBalances = await mapWithLimit(owners, 4, (owner) =>
      getTokenAmountForOwner(connection, owner, mint)
    );
    const totalTokens = tokenBalances.reduce((acc, val) => acc + (val || 0), 0);
    const priceUsd = await fetchTokenPrice(mintAddress);
    tokenStats = {
      mint: mintAddress,
      totalTokens,
      priceUsd,
      totalValueUsd: priceUsd ? totalTokens * priceUsd : null,
    };
  }

  const baseline = readBaseline(platform);
  const delta = baseline
    ? {
        combinedSol: combinedSol - baseline.combinedSol,
        walletsSol: walletsSol - baseline.walletsSol,
        mainSol: mainSol !== null ? mainSol - baseline.mainSol : null,
      }
    : null;

  return {
    platform,
    mainWallet: mainWallet ? { publicKey: mainWallet, sol: mainSol } : null,
    wallets,
    totals: {
      walletsSol,
      mainSol,
      combinedSol,
    },
    tokenStats,
    baseline,
    delta,
    timestamp: new Date().toISOString(),
  };
}

function cacheKey(platform) {
  return `metrics:${platform}`;
}

async function getMetrics(platform) {
  const key = cacheKey(platform);
  const cached = metricsCache.get(key);
  if (cached && Date.now() - cached.timestamp < 15000) {
    return cached.data;
  }
  const data = await buildMetrics(platform);
  metricsCache.set(key, { timestamp: Date.now(), data });
  return data;
}

function saveJobs(jobs) {
  writeJson(JOBS_PATH, jobs);
}

function reconcileJobs(jobs) {
  let changed = false;
  const now = new Date().toISOString();
  jobs.forEach((job) => {
    if (job.status === "running" && !activeJobs.has(job.id)) {
      job.status = "stale";
      job.endedAt = job.endedAt || now;
      job.error = job.error || "Process not running";
      changed = true;
    }
  });
  if (changed) {
    saveJobs(jobs);
  }
  return jobs;
}

function loadJobs() {
  const jobs = readJson(JOBS_PATH, []);
  return reconcileJobs(jobs);
}

function appendLog(logPath, chunk) {
  ensureDir(path.dirname(logPath));
  fs.appendFileSync(logPath, chunk);
}

function tailLog(logPath, maxChars = 6000) {
  if (!fs.existsSync(logPath)) return "";
  const data = fs.readFileSync(logPath, "utf-8");
  if (data.length <= maxChars) return data;
  return data.slice(data.length - maxChars);
}

function startJob(platform, action, envOverrides = {}) {
  if (!ACTIONS[action]) {
    throw new Error("Unknown action");
  }
  const dir = platformDir(platform);
  if (!dir) {
    throw new Error("Unknown platform");
  }

  ensureDir(LOG_DIR);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logPath = path.join(LOG_DIR, `${id}.log`);
  appendLog(
    logPath,
    `[${new Date().toISOString()}] Starting ${action} for ${platform}\n`
  );
  const overrideKeys = Object.keys(envOverrides);
  if (overrideKeys.length) {
    appendLog(logPath, `Overrides: ${overrideKeys.join(", ")}\n`);
  }
  const job = {
    id,
    platform,
    action,
    status: "running",
    startedAt: new Date().toISOString(),
    logPath,
  };

  const jobs = loadJobs();
  jobs.unshift(job);
  saveJobs(jobs.slice(0, 50));

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  let child;
  try {
    child = spawn(npmCmd, ACTIONS[action], {
      cwd: dir,
      env: { ...process.env, ...envOverrides },
      shell: process.platform === "win32",
    });
  } catch (error) {
    appendLog(logPath, `Spawn error: ${error.message}\n`);
    const updatedJobs = loadJobs();
    const match = updatedJobs.find((item) => item.id === id);
    if (match) {
      match.status = "failed";
      match.endedAt = new Date().toISOString();
      match.error = error.message;
    }
    saveJobs(updatedJobs);
    throw error;
  }
  activeJobs.set(id, child);
  appendLog(logPath, `Spawned PID: ${child.pid}\n`);

  child.stdout.on("data", (data) => appendLog(logPath, data.toString()));
  child.stderr.on("data", (data) => appendLog(logPath, data.toString()));
  child.on("error", (error) => {
    appendLog(logPath, `Spawn error: ${error.message}\n`);
    activeJobs.delete(id);
    const updatedJobs = loadJobs();
    const match = updatedJobs.find((item) => item.id === id);
    if (match) {
      match.status = "failed";
      match.endedAt = new Date().toISOString();
      match.error = error.message;
    }
    saveJobs(updatedJobs);
  });
  child.on("close", (code, signal) => {
    appendLog(logPath, `Exited with code ${code ?? "null"} signal ${signal ?? "null"}\n`);
    activeJobs.delete(id);
    const updatedJobs = loadJobs();
    const match = updatedJobs.find((item) => item.id === id);
    if (match) {
      match.status = code === 0 ? "finished" : "failed";
      match.endedAt = new Date().toISOString();
      match.exitCode = code;
      match.signal = signal;
    }
    saveJobs(updatedJobs);
  });

  return job;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/platforms", (req, res) => {
  res.json({
    platforms: Object.keys(PLATFORM_DIRS).map((name) => ({
      name,
      path: platformDir(name),
    })),
  });
});

app.get("/api/config", (req, res) => {
  const platform = req.query.platform;
  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  const env = readEnv(platform);
  res.json(summarizeEnv(env));
});

app.post("/api/config", (req, res) => {
  const platform = req.query.platform;
  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  const updates = {};
  for (const [key, value] of Object.entries(req.body || {})) {
    if (!ENV_KEYS.has(key)) continue;
    if (key === "PRIVATE_KEY" && !value) continue;
    updates[key] = value;
  }
  updateEnv(platform, updates);
  res.json({ ok: true });
});

app.post("/api/upload-logo", (req, res) => {
  const platform = req.body?.platform;
  const fileName = req.body?.fileName || "";
  const dataUrl = req.body?.dataUrl || "";

  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: "Invalid image data" });
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const extFromName = path.extname(fileName).toLowerCase();
  const extFromMime = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
  }[mimeType] || ".png";
  const ext = extFromName || extFromMime;
  const safeName = `logo-${Date.now()}${ext}`;

  const dir = platformDir(platform);
  const imageDir = path.join(dir, "image");
  ensureDir(imageDir);
  const filePath = path.join(imageDir, safeName);

  try {
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(filePath, buffer);
    const relativePath = `./image/${safeName}`;
    updateEnv(platform, { FILE: relativePath });
    res.json({ ok: true, path: relativePath });
  } catch (error) {
    res.status(500).json({ error: "Failed to save logo" });
  }
});

app.get("/api/wallets", (req, res) => {
  const platform = req.query.platform;
  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  const wallets = getBundlerWallets(platform).map((kp, index) => ({
    index,
    publicKey: kp.publicKey.toBase58(),
  }));
  res.json({
    wallets,
    mint: getMintPublicKey(platform),
    mainWallet: getMainWallet(platform),
  });
});

app.post("/api/wallets", (req, res) => {
  const platform = req.body?.platform;
  const keys = req.body?.keys;
  const replace = Boolean(req.body?.replace);

  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  if (!Array.isArray(keys)) {
    return res.status(400).json({ error: "Keys must be an array" });
  }

  const trimmedKeys = keys
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!trimmedKeys.length) {
    return res.status(400).json({ error: "No keys provided" });
  }
  if (trimmedKeys.length > 50) {
    return res.status(400).json({ error: "Too many keys" });
  }

  const existing = replace ? [] : readKeys(platform, "data.json");
  const existingList = Array.isArray(existing) ? existing.filter((item) => typeof item === "string") : [];
  const existingMap = new Map();
  existingList.forEach((secret) => {
    const kp = safeKeypair(secret);
    if (kp) {
      existingMap.set(kp.publicKey.toBase58(), secret);
    }
  });

  let added = 0;
  let skipped = 0;
  let invalid = 0;
  const seen = new Set();
  const normalizedNew = [];

  for (const secret of trimmedKeys) {
    const kp = safeKeypair(secret);
    if (!kp) {
      invalid += 1;
      continue;
    }
    const pubkey = kp.publicKey.toBase58();
    if (existingMap.has(pubkey) || seen.has(pubkey)) {
      skipped += 1;
      continue;
    }
    const normalizedSecret = bs58Codec.encode(kp.secretKey);
    normalizedNew.push(normalizedSecret);
    seen.add(pubkey);
    added += 1;
  }

  const finalKeys = replace ? normalizedNew : existingList.concat(normalizedNew);
  writeKeys(platform, "data.json", finalKeys);

  res.json({
    ok: true,
    total: trimmedKeys.length,
    added,
    skipped,
    invalid,
    walletCount: finalKeys.length,
  });
});

app.delete("/api/wallets", (req, res) => {
  const platform = req.body?.platform;
  const publicKey = String(req.body?.publicKey || "").trim();

  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  if (!publicKey) {
    return res.status(400).json({ error: "Public key is required" });
  }

  const existing = readKeys(platform, "data.json");
  const existingList = Array.isArray(existing)
    ? existing.filter((item) => typeof item === "string")
    : [];

  let removed = 0;
  const remaining = [];

  existingList.forEach((secret) => {
    const kp = safeKeypair(secret);
    if (kp && kp.publicKey.toBase58() === publicKey) {
      removed += 1;
      return;
    }
    remaining.push(secret);
  });

  if (!removed) {
    return res.status(404).json({ error: "Wallet not found" });
  }

  writeKeys(platform, "data.json", remaining);
  res.json({ ok: true, removed, walletCount: remaining.length });
});

app.get("/api/metrics", async (req, res) => {
  const platform = req.query.platform;
  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  try {
    const data = await getMetrics(platform);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to load metrics" });
  }
});

app.post("/api/metrics/baseline", async (req, res) => {
  const platform = req.query.platform;
  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  try {
    const metrics = await getMetrics(platform);
    const baseline = {
      timestamp: new Date().toISOString(),
      mainSol: metrics.totals.mainSol || 0,
      walletsSol: metrics.totals.walletsSol || 0,
      combinedSol: metrics.totals.combinedSol || 0,
    };
    saveBaseline(platform, baseline);
    res.json({ ok: true, baseline });
  } catch (error) {
    res.status(500).json({ error: "Failed to save baseline" });
  }
});

app.post("/api/run", (req, res) => {
  const platform = req.body?.platform;
  const action = req.body?.action;
  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  if (!ACTIONS[action]) {
    return res.status(400).json({ error: "Invalid action" });
  }
  try {
    const job = startJob(platform, action);
    res.json({ ok: true, job });
  } catch (error) {
    res.status(500).json({ error: "Failed to start job" });
  }
});

app.post("/api/bundle-existing", (req, res) => {
  const platform = req.body?.platform;
  const tokenMint = req.body?.tokenMint;
  const totalSol = Number(req.body?.totalSol);
  const walletCount = Number(req.body?.walletCount);
  const walletMinSol = Number(req.body?.walletMinSol);
  const tokenCreator = req.body?.tokenCreator;

  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  if (!tokenMint) {
    return res.status(400).json({ error: "Token mint is required" });
  }
  try {
    new PublicKey(tokenMint);
  } catch (error) {
    return res.status(400).json({ error: "Invalid token mint" });
  }
  if (!Number.isFinite(totalSol) || totalSol <= 0) {
    return res.status(400).json({ error: "Invalid total SOL" });
  }
  if (tokenCreator) {
    try {
      new PublicKey(tokenCreator);
    } catch (error) {
      return res.status(400).json({ error: "Invalid token creator" });
    }
  }

  const envOverrides = {
    TARGET_MINT: tokenMint,
    TARGET_CREATOR: tokenCreator || "",
    BUNDLE_TOTAL_SOL: String(totalSol),
    SKIP_DISTRIBUTION: "true",
    REUSE_WALLETS: "true",
    BUNDLE_EXISTING_MODE: "true",
  };

  if (Number.isFinite(walletCount) && walletCount > 0) {
    envOverrides.WALLET_LIMIT = String(walletCount);
  }
  if (Number.isFinite(walletMinSol) && walletMinSol > 0) {
    envOverrides.WALLET_MIN_SOL = String(walletMinSol);
  }

  try {
    const job = startJob(platform, "bundle-existing", envOverrides);
    res.json({ ok: true, job });
  } catch (error) {
    res.status(500).json({ error: "Failed to start bundle" });
  }
});

app.post("/api/trade", async (req, res) => {
  const platform = req.body?.platform;
  const side = req.body?.side;
  const percent = Number(req.body?.percent);
  const tokenMint = req.body?.tokenMint;

  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  if (!["buy", "sell"].includes(side)) {
    return res.status(400).json({ error: "Invalid side" });
  }
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return res.status(400).json({ error: "Invalid percent" });
  }
  if (tokenMint) {
    try {
      new PublicKey(tokenMint);
    } catch (error) {
      return res.status(400).json({ error: "Invalid token mint" });
    }
  }

  try {
    const result = await executeTrade({ platform, side, percent, tokenMint });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Trade failed" });
  }
});

app.post("/api/auto-sell/start", async (req, res) => {
  const platform = req.body?.platform;
  const targetPercent = Number(req.body?.targetPercent);
  const tokenMint = req.body?.tokenMint;

  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  if (!Number.isFinite(targetPercent) || targetPercent <= 0) {
    return res.status(400).json({ error: "Invalid target percent" });
  }
  if (tokenMint) {
    try {
      new PublicKey(tokenMint);
    } catch (error) {
      return res.status(400).json({ error: "Invalid token mint" });
    }
  }

  try {
    const watcher = await startAutoSell({ platform, targetPercent, tokenMint });
    res.json({ ok: true, watcher });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Auto-sell failed" });
  }
});

app.post("/api/auto-sell/stop", (req, res) => {
  const platform = req.body?.platform;
  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  stopAutoSell(platform);
  res.json({ ok: true });
});

app.get("/api/auto-sell/status", (req, res) => {
  const platform = req.query.platform;
  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  const watcher = autoSellWatchers.get(platform);
  res.json({ watcher: watcher || null });
});

app.post("/api/trade/dev", async (req, res) => {
  const platform = req.body?.platform;
  const side = req.body?.side;
  const percent = Number(req.body?.percent);
  const tokenMint = req.body?.tokenMint;

  if (!platformDir(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  if (side !== "sell") {
    return res.status(400).json({ error: "Dev wallet trades are sell-only" });
  }
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return res.status(400).json({ error: "Invalid percent" });
  }
  if (tokenMint) {
    try {
      new PublicKey(tokenMint);
    } catch (error) {
      return res.status(400).json({ error: "Invalid token mint" });
    }
  }

  const devWallet = getDevWallet(platform);
  if (!devWallet) {
    return res.status(400).json({ error: "Dev wallet not configured" });
  }

  try {
    const result = await executeTradeForWallets({
      platform,
      side,
      percent,
      tokenMint,
      wallets: [devWallet],
      scope: "dev",
    });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Trade failed" });
  }
});

app.get("/api/jobs", (req, res) => {
  const platform = req.query.platform;
  const jobs = loadJobs().filter((job) =>
    platform ? job.platform === platform : true
  );
  res.json({ jobs });
});

app.get("/api/jobs/:id", (req, res) => {
  const jobId = req.params.id;
  const jobs = loadJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job) return res.status(404).json({ error: "Not found" });
  res.json({
    job,
    log: tailLog(job.logPath),
  });
});

app.post("/api/jobs/:id/stop", (req, res) => {
  const jobId = req.params.id;
  const child = activeJobs.get(jobId);
  if (!child) {
    return res.status(404).json({ error: "Job not running" });
  }
  child.kill();
  res.json({ ok: true });
});

ensureDir(DATA_DIR);
ensureDir(LOG_DIR);

app.listen(PORT, HOST, () => {
  console.log(`Dashboard running on http://${HOST}:${PORT}`);
});
