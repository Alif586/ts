function safeRequire(path) {
  try {
    delete require.cache[require.resolve(path)]; // old cache clear
    require(path);
    console.log(`✅ ${path} loaded successfully.`);
  } catch (err) {
    console.log(`\n❌ ERROR in file: ${path}`);
    console.log("📛 Error Message:", err.message);
    console.log("📄 Error Stack:\n", err.stack);

    console.log(`🔁 Retrying ${path} in 5 seconds...\n`);

    setTimeout(() => safeRequire(path), 5000);
  }
}

// বটগুলো লোড করুন


console.log('Bot1, Bot2, are running...');






/**
 * ======================================
 * 🤖 Bot Loader System
 * Made By : Alif Hosson
 * ======================================
 */

// ===============================
// 🎨 Console Colors
// ===============================

const COLOR = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
};

// ===============================
// 📦 Package Info
// ===============================

const pkg = require('./package.json');
const BOT_VERSION = pkg.version || "0.0.0";
const NODE_VERSION = process.version;
const ENV = process.env.NODE_ENV || "production";

// ===============================
// 🧾 Branding Banner
// ===============================

function branding() {
  console.log(COLOR.cyan + "========================================" + COLOR.reset);
  console.log(
    COLOR.green +
    "   Bot Made By : Alif Hosson\n" +
    "   Powered By  : Node.js\n" +
    `   Version    : ${BOT_VERSION}\n` +
    `   Node       : ${NODE_VERSION}\n` +
    `   Mode       : ${ENV.toUpperCase()}` +
    COLOR.reset
  );
  console.log(COLOR.cyan + "========================================" + COLOR.reset);
}

// ===============================
// 🧠 Logger
// ===============================

function logger(level, message, color = COLOR.cyan) {
  const time = new Date().toISOString().replace("T", " ").split(".")[0];
  console.log(`${color}[${level}] ${time} | ${message}${COLOR.reset}`);
}

// ===============================
// 🔁 Safe Require Loader
// ===============================

function safeRequire(path, retryDelay = 5000) {
  try {
    delete require.cache[require.resolve(path)];
    require(path);

    logger("SUCCESS", `Module loaded → ${path}`, COLOR.green);
  } catch (err) {
    logger("ERROR", `Module failed → ${path}`, COLOR.red);
    logger("DETAILS", err.message, COLOR.red);
    logger("RETRY", `Retrying in ${retryDelay / 1000}s`, COLOR.yellow);

    setTimeout(() => safeRequire(path, retryDelay), retryDelay);
  }
}

// ===============================
// 🚀 App Start
// ===============================

branding();
logger("SYSTEM", "Bot service starting...", COLOR.blue);

// ===============================
// 📂 Load Bot Modules
// ===============================

safeRequire('./main');
/*safeRequire('./Number/d-grup');
//safeRequire('./Number/d-grup1');
safeRequire('./Number/d-grup2');
safeRequire('./Number/d-grup3');
safeRequire('./Number/d-grup4');
safeRequire('./Number/d-grup5');
safeRequire('./Number/imss');
safeRequire('./Number/imss1');*/

logger("SYSTEM", "All modules are now being monitored", COLOR.blue);
