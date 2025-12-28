/* ========= Number Bot (Hybrid: MongoDB for Numbers + MongoDB/GitHub for Users) =========== */

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { exec } = require('child_process'); // এই লাইনটি অবশ্যই যুক্ত করবেন
const request = require('request');
const countryEmoji = require('country-emoji');
const mongoose = require('mongoose');

// ===============================================
// ✅ কনফিগারেশন (EDIT HERE)
// ===============================================
const BOT_TOKEN = '7142079092:AAGRrSPa3su8iuGG4r9n5x1LZOwsFPaFoQ0';
const AUTHORIZED_BOT_ID = 7142079092;
const OTP_GROUP_URL = "https://t.me/RX_ALL_OTP_GROUP";

// 🔴🔴 আপনার গিটহাবের তথ্য এখানে দিন (অবশ্যই পূরণ করবেন) 🔴🔴
const GITHUB_USERNAME = "yeiemwpshyienga"; // যেমন: alif123
const GITHUB_REPO_NAME = "smszone";      // যেমন: number-bot-repo
const GITHUB_FILE_PATH = "users.json";          // ফাইলের নাম

// 📁 ডাটাবেস কানেকশন স্ট্রিং
const NUMBER_DB_URI = "mongodb+srv://rakibkhan625162_db_user:sabbir123@number.qdza7vx.mongodb.net/Number?retryWrites=true&w=majority";


const USER_DB_URI = "mongodb+srv://sabbirrehman905_db_user:sabbir123@userjson.f0vppgx.mongodb.net/UserDB?appName=Userjson";



const USER_LIST_FILE = 'users.json'; 

// যে চ্যানেলগুলোতে জয়েন থাকা বাধ্যতামূলক
const REQUIRED_CHANNELS = [
    { id: -1003009541400, url: "https://t.me/techzonebd61" }, 
    { id: -1002383249427, url: "https://t.me/+SGQCjEiIu_ZlY2Vl" },
    { id: -1002245233356, url: "https://t.me/+9rmkIBmkZ3M0ZWVl" },
];

// 🚨 অ্যাডমিন আইডি:
const ADMIN_IDS = [1817149496, 6135656510, 7802680600, 6006322754];
const SUPPORT_USERNAME = "unknown15x";
const COOLDOWN_TIME = 2; // সেকেন্ড

// ===============================================
// 🆕 মেসেজ টেমপ্লেট
// ===============================================
const NEW_FOOTER_QUOTE = "<blockquote>📢 এই নাম্বারে ওটিপি পাঠানোর পর বটেই ওটিপি পাবেন। যদি বটে ওটিপি না আসে তাহলে ওটিপি গ্রুপ চেক করেন।ওটিপি গ্রুপে ওটিপি পেয়ে যাবেন।🌸 ধন্যবাদ।💖</blockquote>";

const ASSIGNMENT_MESSAGE_TEMPLATE = (flag, country_name, number, action_text, footer) => `\
${flag} <b>${country_name}</b> Fresh Number ${action_text}:

📱 Your Number:
┗━━ <code>${number}</code> ━━┛


╭─────────────────────╮
│     ⏳ Waiting for OTP...     │
╰─────────────────────╯
━━━━━━━━━━━━
${footer}
`;

// ===============================================
// 🗄️ DATABASE CONNECTION SETUP
// ===============================================

// কানেকশন অপশন
const dbOptions = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    family: 4,
    maxPoolSize: 100,
    minPoolSize: 5,
    connectTimeoutMS: 10000,
};

// 1. Numbers Database Connection (Existing)
const numberConn = mongoose.createConnection(NUMBER_DB_URI, dbOptions);
numberConn.on('connected', () => console.log("✅ Number DB Connected!"));

// 2. Users & Config Database Connection (New)
const userConn = mongoose.createConnection(USER_DB_URI, dbOptions);
userConn.on('connected', () => {
    console.log("✅ User & Config DB Connected!");
    syncSystem(); // কানেক্ট হলে সিঙ্ক শুরু করবে
});

// --- Schemas ---

// Number Schema (DB 1)
const numberSchema = new mongoose.Schema({
    number: { type: String, unique: true, required: true },
    country: { type: String, required: true },
    flag: { type: String, default: "🌍" },
    status: { type: String, enum: ['Available', 'Used', 'Used_History'], default: 'Available' },
    assigned_to: { type: Number, default: null },
    created_at: { type: Date, default: Date.now }
});
const NumberModel = numberConn.model('Number', numberSchema);

// User Schema (DB 2)
const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true, required: true },
    joined_at: { type: Date, default: Date.now }
});
const UserModel = userConn.model('User', userSchema);

// Config Schema (DB 2 - For GitHub Token)
const configSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true }, // e.g., "github_token"
    value: { type: String, required: true }
});
const ConfigModel = userConn.model('Config', configSchema);

// --- ভেরিয়েবল ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===============================================
// 🛡️ ERROR HANDLING (FIXED HERE)
// ===============================================
// পোলিং এরর হ্যান্ডলার (নেটওয়ার্ক সমস্যা বা এপিআই এরর ঠেকানোর জন্য)
bot.on('polling_error', (error) => {
    console.log(`[Polling Error] ${error.code}: ${error.message}`);
});

// আনহ্যান্ডেলড রিজেকশন হ্যান্ডলার (403 Forbidden বা ব্লক করা ইউজার এরর ঠেকানোর জন্য)
process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.response && reason.response.statusCode === 403) {
        console.log("⚠️ User blocked the bot. Message failed (Ignored to prevent crash).");
    } else {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    }
});

// আনকট এক্সেপশন হ্যান্ডলার
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
// ===============================================

let bot_users = new Set(); // মেমোরিতে ইউজার লিস্ট
let admin_country_temp_data = {};
let last_action_time = {};
let user_details_cache = {};
let country_data_cache = {}; 
let user_states = {};
let admin_file_buffer = {};
let last_change_time = {};

// ===============================================
// 🆕 GLOBAL VARIABLES FOR ADD NOTIFICATION (HERE)
// ===============================================
let bot_username = ""; // বটের ইউজারনেম এখানে জমা হবে
let add_session_data = []; // ৩০ মিনিটের ডাটা এখানে থাকবে
let last_add_timestamp = 0; // শেষ কখন এড করা হয়েছে
let last_channel_msg_ids = {}; // কোন চ্যানেলে লাস্ট মেসেজ আইডি কত ছিল

// বটের ইউজারনেম অটোমেটিক নেওয়ার জন্য
bot.getMe().then((me) => {
    bot_username = me.username;
    console.log(`✅ Bot Username Detected: @${bot_username}`);
});

// ===============================================
// 🔄 GITHUB & DB SYNC LOGIC (CORE)
// ===============================================

async function getGitHubToken() {
    const conf = await ConfigModel.findOne({ key: "github_token" });
    return conf ? conf.value : null;
}

// GitHub থেকে users.json নামানো
async function fetchGithubUsers(token) {
    if (!token) return null;
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO_NAME}/contents/${GITHUB_FILE_PATH}`;

    return new Promise((resolve) => {
        request({
            url: url,
            headers: { 'User-Agent': 'NodeBot', 'Authorization': `token ${token}` }
        }, (err, res, body) => {
            if (err || res.statusCode !== 200) {
                console.log("GitHub Fetch Error or 404 (File might not exist yet).");
                resolve(null);
            } else {
                try {
                    const json = JSON.parse(body);
                    const content = Buffer.from(json.content, 'base64').toString('utf8');
                    resolve({ content: JSON.parse(content), sha: json.sha });
                } catch (e) {
                    resolve(null);
                }
            }
        });
    });
}

// GitHub এ users.json আপলোড করা
async function uploadToGithub(usersArray, token, sha = null) {
    if (!token) return;
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO_NAME}/contents/${GITHUB_FILE_PATH}`;
    const contentEncoded = Buffer.from(JSON.stringify(usersArray, null, 2)).toString('base64');

    const bodyData = {
        message: "Update users.json via Bot",
        content: contentEncoded,
        sha: sha 
    };

    request({
        url: url,
        method: 'PUT',
        headers: { 
            'User-Agent': 'NodeBot', 
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        },
        json: true,
        body: bodyData
    }, (err, res, body) => {
        if (err) console.error("GitHub Upload Error:", err);
        else console.log("✅ GitHub Updated Successfully.");
    });
}

// 🔥 মাস্টার সিঙ্ক ফাংশন (MongoDB <-> GitHub)
async function syncSystem() {
    console.log("🔄 Starting Sync System...");
    const token = await getGitHubToken();

    // ১. MongoDB থেকে ইউজার লোড
    const mongoUsersDocs = await UserModel.find({});
    const mongoUserIds = new Set(mongoUsersDocs.map(u => u.userId));

    // ২. GitHub থেকে ইউজার লোড
    let githubData = await fetchGithubUsers(token);
    let githubUserIds = new Set();
    if (githubData && Array.isArray(githubData.content)) {
        githubUserIds = new Set(githubData.content);
    }

    // ৩. মার্জ করা (Union)
    const allUsers = new Set([...mongoUserIds, ...githubUserIds, ...bot_users]);
    // অ্যাডমিনদের নিশ্চিত করা
    ADMIN_IDS.forEach(id => allUsers.add(id));

    bot_users = allUsers; // মেমোরি আপডেট

    // ৪. MongoDB তে মিসিং ইউজার এড করা
    const newForMongo = [];
    allUsers.forEach(uid => {
        if (!mongoUserIds.has(uid)) {
            newForMongo.push({ userId: uid });
        }
    });

    if (newForMongo.length > 0) {
        await UserModel.insertMany(newForMongo, { ordered: false }).catch(() => {});
        console.log(`📥 Added ${newForMongo.length} users to MongoDB from Sync.`);
    }

    // ৫. GitHub এ আপডেট করা (যদি ডাটা আলাদা হয়)
    if (token) {
        const finalArray = Array.from(allUsers);
        if (finalArray.length !== githubUserIds.size || newForMongo.length > 0) {
            await uploadToGithub(finalArray, token, githubData ? githubData.sha : null);
        }
    }

    // ৬. লোকাল ফাইলে সেভ রাখা (Backup)
    try {
        fs.writeFileSync(USER_LIST_FILE, JSON.stringify(Array.from(allUsers), null, 4));
    } catch (e) {}

    console.log(`✅ Sync Complete. Total Users: ${allUsers.size}`);
}

// ইউজার এড করা (Triggered on every message)
async function addUserToLocalDb(userId) {
    if (!bot_users.has(userId)) {
        bot_users.add(userId);

        // ১. MongoDB তে সেভ
        try {
            await new UserModel({ userId: userId }).save();
        } catch (e) {}

        // ২. লোকাল ফাইল সেভ
        try {
            fs.writeFileSync(USER_LIST_FILE, JSON.stringify(Array.from(bot_users), null, 4));
        } catch (e) {}

        // ৩. গিটহাবে পুশ (ব্যাকগ্রাউন্ডে)
        // প্রতি ইউজারে পুশ করলে এপিআই লিমিট খেতে পারে, তাই আমরা এখানে সরাসরি পুশ না করে
        // নির্দিষ্ট সময় পর পর syncSystem() কল করতে পারি অথবা লাইভ করতে পারি।
        // ব্যবহারকারীর রিকোয়ারমেন্ট অনুযায়ী "অটো ফিল আপ" চাই, তাই এখানে কল করে দিচ্ছি।
        const token = await getGitHubToken();
        if (token) {
            const ghData = await fetchGithubUsers(token);
            await uploadToGithub(Array.from(bot_users), token, ghData ? ghData.sha : null);
        }
    }
}

// ===============================================
// ⚙️ Helper Functions
// ===============================================

async function rebuildCountryCache() {
    try {
        const result = await NumberModel.aggregate([
            {
                $group: {
                    _id: "$country",
                    flag: { $first: "$flag" },
                    total: { $sum: 1 },
                    available: { $sum: { $cond: [{ $eq: ["$status", "Available"] }, 1, 0] } }
                }
            }
        ]);
        country_data_cache = {};
        result.forEach(r => {
            country_data_cache[r._id] = { flag: r.flag, available: r.available, total: r.total };
        });
    } catch (e) {
        console.error("Cache rebuild error:", e);
    }
}

function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

async function isUserMember(userId) {
    if (isAdmin(userId)) return true;
    const validStatuses = ['member', 'administrator', 'creator'];
    for (const channel of REQUIRED_CHANNELS) {
        try {
            const member = await bot.getChatMember(channel.id, userId);
            if (!validStatuses.includes(member.status)) return false;
        } catch (e) { return false; }
    }
    return true;
}

function getAvailableCountriesData() {
    const countryData = {};
    for (const [country, data] of Object.entries(country_data_cache)) {
        if (data.available > 0) countryData[country] = { flag: data.flag, count: data.available };
    }
    return countryData;
}

function getAllCountryList() {
    const countryData = {};
    for (const [country, data] of Object.entries(country_data_cache)) {
        countryData[country] = { flag: data.flag, count: data.total };
    }
    return countryData;
}

function isUserAllowedAction(userId) {
    if (isAdmin(userId)) return { allowed: true, remaining: 0 };
    const currentTime = Date.now() / 1000;
    if (last_action_time[userId] && (currentTime - last_action_time[userId]) < COOLDOWN_TIME) {
        const remaining = (COOLDOWN_TIME - (currentTime - last_action_time[userId])).toFixed(1);
        return { allowed: false, remaining: remaining };
    }
    last_action_time[userId] = currentTime;
    return { allowed: true, remaining: 0 };
}

// ===============================================
// ⌨️ Keyboards
// ===============================================

function getMainMenuKeyboard(userId) {
    const keyboard = [
        [{ text: "📲 Get Number" }, { text: "🌍 Available Country" }],
        [{ text: "✅ Active Number" }, { text: "☎️ Support" }]
    ];
    if (isAdmin(userId)) keyboard.push([{ text: "🔑 Admin Menu" }]);
    return { keyboard: keyboard, resize_keyboard: true };
}

function getAdminMenuKeyboard(inSession = false) {
    if (inSession) return { keyboard: [[{ text: "🛑 Stop" }]], resize_keyboard: true };
    return {
        keyboard: [
            [{ text: "➕ ADD" }, { text: "📢 Broadcast" }],
            [{ text: "📊 Status" }, { text: "🔑 Ass Token" }],  
            [{ text: "🔄 Restart" }],
            [{ text: "🗑️ Delete" }, { text: "➡️ Main Menu" }]
        ],
        resize_keyboard: true
    };
}

function getNumberControlKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "View OTP 📩", url: OTP_GROUP_URL }],
            [
                { text: "🔄 Change Number", callback_data: `change_number_req` },
                { text: "🌍 Change Country", callback_data: 'change_country_start' }
            ]
        ]
    };
}

function getDeleteCountryKeyboard() {
    const allCountries = getAllCountryList();
    const buttons = [];
    const keys = Object.keys(allCountries).sort();
    for (let i = 0; i < keys.length; i += 2) {
        const row = [];
        // 'select_delete_country:' এর বদলে 'sdc:' ব্যবহার করা হয়েছে (Short Form)
        row.push({ text: `${allCountries[keys[i]].flag} ${keys[i]}`, callback_data: `sdc:${keys[i]}` });
        if (i + 1 < keys.length) {
            row.push({ text: `${allCountries[keys[i + 1]].flag} ${keys[i + 1]}`, callback_data: `sdc:${keys[i + 1]}` });
        }
        buttons.push(row);
    }
    buttons.push([{ text: "❌ Cancel", callback_data: 'cancel_delete' }]);
    return { inline_keyboard: buttons };
}

function getVerificationMarkup() {
    const buttons = REQUIRED_CHANNELS.map((ch, i) => [{ text: `Join Channel ${i + 1}`, url: ch.url }]);
    buttons.push([{ text: "✅ Verify", callback_data: 'verify_check' }]);
    return { inline_keyboard: buttons };
}

async function sendVerificationPrompt(userId, messageId = null) {
    const text = `⚠️ **Access Denied!**\nPlease join our channels to use the bot.`;
    const markup = getVerificationMarkup();
    if (messageId) {
        try { await bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: markup }); } catch {}
    } else {
        // Safe send
        try {
            await bot.sendMessage(userId, text, { parse_mode: 'Markdown', reply_markup: markup });
        } catch (e) {
            // Ignored blocked user
        }
    }
}

// ===============================================
// 📩 COMMAND HANDLER
// ===============================================

bot.on('message', async (msg) => {
    if (!msg.from) return;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    // ১. ইউজার ডাটাবেস হ্যান্ডলিং (Dual Sync)
    addUserToLocalDb(userId);

    // ২. মেম্বারশিপ চেক
    if (!isAdmin(userId)) {
        if (!(await isUserMember(userId))) {
            sendVerificationPrompt(userId);
            return;
        }
    }

    // ৩. স্টেট মেশিন (Token, Broadcast, Add Number)
    if (user_states[userId]) {
        if (text === '🛑 Stop' || text === 'stop') {
            delete user_states[userId];
            delete admin_file_buffer[userId];
            bot.sendMessage(chatId, "✅ Action cancelled.", { reply_markup: getAdminMenuKeyboard() });
            return;
        }

        // --- PASSWORD CHECK FOR TOKEN ---
        if (user_states[userId] === 'AWAITING_PASS_FOR_TOKEN') {
            if (text === 'alif') {
                user_states[userId] = 'AWAITING_GITHUB_TOKEN';
                bot.sendMessage(chatId, "🔓 **Password Accepted!**\n\nPlease upload ur github Repo token:", { parse_mode: 'Markdown', reply_markup: getAdminMenuKeyboard(true) });
            } else {
                bot.sendMessage(chatId,
  "❌ ভুল পাসওয়ার্ড দিলে কিন্তু চলবে না চাচা! 😴\nপাসওয়ার্ড ভুলে গেলে গুগল না, সোজা আলিফ ভাইয়ের কাছে মেসেজ দেন 📩\nবেশি না—মাত্র 5$ দিলেই ঝটপট চেঞ্জ করে দিবে 😂👍\n👉 @alifhosson", { reply_markup: getAdminMenuKeyboard() });
                delete user_states[userId];
            }
            return;
        }

        // --- SAVING TOKEN ---
        if (user_states[userId] === 'AWAITING_GITHUB_TOKEN') {
            const newToken = text.trim();
            try {
                // আগের টোকেন মুছে নতুনটা সেট করা (Update if exists, Insert if not)
                await ConfigModel.findOneAndUpdate(
                    { key: "github_token" },
                    { value: newToken },
                    { upsert: true, new: true }
                );

                bot.sendMessage(chatId, "✅ **GitHub Token Saved Successfully!**\nSyncing system now...", { parse_mode: 'Markdown', reply_markup: getAdminMenuKeyboard() });
                syncSystem(); // নতুন টোকেন পাওয়ার সাথে সাথে সিঙ্ক
            } catch (e) {
                bot.sendMessage(chatId, "❌ Database Error saving token.", { reply_markup: getAdminMenuKeyboard() });
            }
            delete user_states[userId];
            return;
        }

        if (user_states[userId] === 'ADDING_NUMBER_STEP_1') {
            if (msg.document) {
                admin_file_buffer[userId] = { file_id: msg.document.file_id };
                user_states[userId] = 'ADDING_NUMBER_STEP_2';
                bot.sendMessage(chatId, "📂 **File Received!**\nCountry Name:", { parse_mode: 'Markdown' });
                return;
            } else {
                bot.sendMessage(chatId, "❌ Please send Excel file.", { reply_markup: getAdminMenuKeyboard(true) });
                return;
            }
        }
        if (user_states[userId] === 'ADDING_NUMBER_STEP_2') {
            if (text) {
                processUploadedFile(userId, admin_file_buffer[userId].file_id, text.trim());
                delete user_states[userId];
                delete admin_file_buffer[userId];
                return;
            }
        }
        if (user_states[userId] === 'BROADCASTING') {
            processBroadcast(msg);
            return;
        }
    }

    if (!text) return;

    // --- Commands ---
    if (text === '/start') {
        bot.sendMessage(chatId, "Welcome! Choose your option:", { reply_markup: getMainMenuKeyboard(userId) });

        } else if ((text === '/restart' || text === '🔄 Restart') && isAdmin(userId)) {
            bot.sendMessage(
                chatId,
                "🔄 **Connecting to GitHub...**\n⏳ Checking for updates...",
                { parse_mode: 'Markdown' }
            );

            // কমান্ড: গিট পুল করবে এবং সফল হলে PM2 রিস্টার্ট দিবে
            // 'pm2 restart all' ব্যবহার করা হয়েছে যাতে প্রসেসের নাম যা-ই হোক রিস্টার্ট নেয়।
            exec('git pull origin main && npm install', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Update Error: ${error}`);
                    bot.sendMessage(chatId, `❌ **Update Failed!**\nError: \`${error.message}\`\n\nCheck VPS Console.`, { parse_mode: 'Markdown' });
                    return;
                }

                if (stdout.includes('Already up to date.')) {
                    bot.sendMessage(chatId, "✅ **System is Already Updated!**\nNo restart required.");
                } else {
                    bot.sendMessage(chatId, `✅ **Update Successful!**\n📄 Log:\n\`${stdout.substring(0, 100)}...\`\n\n♻️ **Restarting Bot in 3s...**`, { parse_mode: 'Markdown' });

                    // ৩ সেকেন্ড পর রিস্টার্ট কমান্ড
                    setTimeout(() => {
                        exec('pm2 restart all', (err) => {
                            if (err) {
                                // যদি pm2 কমান্ড কাজ না করে, প্রসেস ফোর্স এক্সিট করবে (PM2 অটো রিস্টার্ট করবে)
                                process.exit(0); 
                            }
                        });
                    }, 3000);
                }
            });
        }

    else if ((text === '🔑 Admin Menu' || text === '/admin') && isAdmin(userId)) {
        delete user_states[userId];
        bot.sendMessage(chatId, "🔑 **Admin Panel**", { parse_mode: 'Markdown', reply_markup: getAdminMenuKeyboard() });
    } else if (text === '➡️ Main Menu') {
        delete user_states[userId];
        bot.sendMessage(chatId, "Returning to Main Menu...", { reply_markup: getMainMenuKeyboard(userId) });
    } else if ((text === '/status' || text === '📊 Status') && isAdmin(userId)) {
        sendStatus(chatId);
    } 
    // --- NEW BUTTON HANDLER ---
    else if (text === '🔑 Ass Token' && isAdmin(userId)) {
        user_states[userId] = 'AWAITING_PASS_FOR_TOKEN';
        bot.sendMessage(chatId, "🔒 **Enter Password:**", { reply_markup: getAdminMenuKeyboard(true) });
    }
    else if (text === '☎️ Support') {
         const markup = { inline_keyboard: [[{ text: "✉️ Contact Admin", url: `https://t.me/${SUPPORT_USERNAME}` }]] };
         bot.sendMessage(chatId, "☎️ Contact support:", { parse_mode: 'Markdown', reply_markup: markup });
    } else if (text === '➕ ADD' && isAdmin(userId)) {
        user_states[userId] = 'ADDING_NUMBER_STEP_1';
        bot.sendMessage(chatId, "➕ **Add Number**\nSend file.", { reply_markup: getAdminMenuKeyboard(true) });
    } else if (text === '📢 Broadcast' && isAdmin(userId)) {
        user_states[userId] = 'BROADCASTING';
        bot.sendMessage(chatId, "📢 **Broadcast**\nSend message.", { reply_markup: getAdminMenuKeyboard(true) });
    } else if (text === '🗑️ Delete' && isAdmin(userId)) {
        await rebuildCountryCache();
        const allCountries = getAllCountryList();
        if (Object.keys(allCountries).length === 0) {
            bot.sendMessage(chatId, "❌ Empty DB.", { reply_markup: getAdminMenuKeyboard() });
        } else {
            bot.sendMessage(chatId, "🗑️ **Delete:**", { parse_mode: 'Markdown', reply_markup: getDeleteCountryKeyboard() });
        }
    } else if (text === '📲 Get Number' || text === '🌍 Available Country') {
        handleNumberSelectionStart(userId, text);
    } else if (text === '✅ Active Number') {
        showActiveNumber(userId);
    }
});

// ===============================================
// 📂 UPDATED FILE PROCESSOR (IGNORE TEXT, EXTRACT 8+ DIGITS)
// ===============================================

async function processUploadedFile(userId, fileId, inputName) {
    bot.sendMessage(userId, "⏳ **Processing (Smart Extract)...**");
    const rawName = inputName.trim();
    let flag = countryEmoji.flag(rawName) || "🌍"; 
    let countryName = countryEmoji.name(rawName) || rawName;

    try {
        const fileLink = await bot.getFileLink(fileId);
        request({ url: fileLink, encoding: null }, async (err, resp, buffer) => {
            if (err) { bot.sendMessage(userId, "❌ Error.", { reply_markup: getAdminMenuKeyboard() }); return; }
            try {
                // ১. ফাইল রিড করা
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];

                // ২. পুরো ফাইলের ডাটা অ্যারে হিসেবে নেওয়া
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                let batchNumbers = [];
                let processedSet = new Set(); // ডুপ্লিকেট নাম্বার এড়ানোর জন্য

                // ৩. লুপ চালানো (প্রতিটি রো এবং প্রতিটি সেল চেক করা)
                jsonData.forEach(row => {
                    row.forEach(cell => {
                        if (cell) {
                            // সেলের ডাটাকে স্ট্রিং-এ রূপান্তর করা
                            const cellText = String(cell);

                            // রেগুলার এক্সপ্রেশন দিয়ে স্ট্রিং থেকে শুধু সংখ্যার সিরিজ বের করা
                            // \d+ মানে হলো যেকোনো ডিজিটের সমষ্টি
                            const matches = cellText.match(/\d+/g);

                            if (matches) {
                                matches.forEach(num => {
                                    // শর্ত: শুধুমাত্র ৮ বা তার বেশি ডিজিট হলে গ্রহণ করবে
                                    if (num.length >= 8) {
                                        // ডুপ্লিকেট চেক (একই ফাইলে দুইবার থাকলে একবার নিবে)
                                        if (!processedSet.has(num)) {
                                            processedSet.add(num);

                                            // ডাটাবেস অবজেক্ট তৈরি
                                            batchNumbers.push({ 
                                                number: num, 
                                                country: countryName, 
                                                flag: flag, 
                                                status: 'Available' 
                                            });
                                        }
                                    }
                                });
                            }
                        }
                    });
                });

                // ৪. ডাটাবেসে সেভ করা
                if (batchNumbers.length > 0) {
                    try {
                        const result = await NumberModel.insertMany(batchNumbers, { ordered: false });
                        await rebuildCountryCache();

                        const addedCount = result.length;

                        // ✅ এডমিনকে কনফার্মেশন মেসেজ
                        bot.sendMessage(userId, `✅ **Added Successfully!**\n📂 ${flag} ${countryName}\n🔢 Count: \`${addedCount}\``, { parse_mode: 'Markdown', reply_markup: getAdminMenuKeyboard() });

                        // =====================================================
                        // 📢 GROUP / CHANNEL UPDATE LOGIC (30 MIN SESSION)
                        // =====================================================

                        const currentTime = Date.now();
                        const sessionDuration = 30 * 60 * 1000; // 30 Minutes

                        // সেশন রিসেট চেক
                        if (currentTime - last_add_timestamp > sessionDuration) {
                            add_session_data = []; 
                        }

                        // নতুন ডাটা সেশনে পুশ
                        add_session_data.push({
                            flag: flag,
                            country: countryName,
                            count: addedCount
                        });

                        last_add_timestamp = currentTime;

                        // নোটিফিকেশন মেসেজ তৈরি
                        let notificationMsg = `✅ Added!\n`;
                        add_session_data.forEach(item => {
                            notificationMsg += `📂 ${item.flag} ${item.country}\n🔢 Count: ${item.count}\n`;
                        });
                        notificationMsg += `\n🤖 @${bot_username}`; 

                        // চ্যানেলে মেসেজ পাঠানো
                        for (const channel of REQUIRED_CHANNELS) {
                            const chatID = channel.id;
                            if (last_channel_msg_ids[chatID]) {
                                try { await bot.deleteMessage(chatID, last_channel_msg_ids[chatID]); } catch (e) { console.log("Del msg fail"); }
                            }
                            try {
                                const sentMsg = await bot.sendMessage(chatID, notificationMsg);
                                last_channel_msg_ids[chatID] = sentMsg.message_id;
                            } catch (e) { console.log("Send msg fail"); }
                        }

                    } catch (e) {
                         // যদি কিছু নাম্বার ডুপ্লিকেটের কারণে ফেইল করে, বাকিগুলো সেভ হবে
                         const count = e.insertedDocs ? e.insertedDocs.length : 0;
                         await rebuildCountryCache();
                         bot.sendMessage(userId, `⚠️ **Partial Add!**\nUnique Added: \`${count}\`\n(Duplicates ignored)`, { parse_mode: 'Markdown', reply_markup: getAdminMenuKeyboard() });
                    }
                } else {
                     bot.sendMessage(userId, `❌ No valid numbers found (Minimum 8 digits required).`, { reply_markup: getAdminMenuKeyboard() });
                }
            } catch (e) { bot.sendMessage(userId, `❌ File Read Error.`, { reply_markup: getAdminMenuKeyboard() }); }
        });
    } catch (e) { bot.sendMessage(userId, `❌ Process Error.`, { reply_markup: getAdminMenuKeyboard() }); }
}

async function processBroadcast(msg) {
    const userId = msg.from.id;
    const totalUsers = bot_users.size;
    bot.sendMessage(userId, `📡 **Broadcasting to ${totalUsers}...**`, { parse_mode: 'Markdown' });

    let success = 0, fail = 0;
    const usersArray = Array.from(bot_users);

    for (const targetId of usersArray) {
        if (ADMIN_IDS.includes(targetId)) continue;
        try {
            await bot.copyMessage(targetId, msg.chat.id, msg.message_id);
            success++;
            await new Promise(r => setTimeout(r, 40)); 
        } catch (e) { fail++; }
    }
    bot.sendMessage(userId, `✅ **Done!**\n🟢 Success: ${success}\n🔴 Failed: ${fail}`, { parse_mode: 'Markdown', reply_markup: getAdminMenuKeyboard() });
    delete user_states[userId];
}

async function sendStatus(chatId) {
    await rebuildCountryCache();
    const total = await NumberModel.countDocuments({});
    const avail = await NumberModel.countDocuments({ status: 'Available' });
    const users = bot_users.size;
    const mongoUsers = await UserModel.countDocuments({});

   const text = `🤖 **System Status**\n---\n👥 Users (Hybrid): \`${users}\`\n💾 Users (DB2): \`${mongoUsers}\n➡️ Numbers: \`${total}\`\n🟢 Available: \`${avail}\`\n🔴 Used: \`${total - avail}\`\n⚫ History: \`${await NumberModel.countDocuments({ status: 'Used_History' })}\``;



    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: getAdminMenuKeyboard() });
}

// ===============================================
// 🟢 USER ACTIONS & CALLBACKS
// ===============================================

async function handleNumberSelectionStart(userId, text) {
    const { allowed, remaining } = isUserAllowedAction(userId);
    if (!allowed) { bot.sendMessage(userId, `Wait **${remaining}**s.`, { parse_mode: 'Markdown' }); return; }

    const currentNumber = await NumberModel.findOne({ assigned_to: userId, status: 'Used' });
    if (text === '📲 Get Number' && currentNumber) {
        bot.sendMessage(userId, `❌ You have an active number:\n${currentNumber.flag} \`${currentNumber.number}\``, { parse_mode: 'Markdown', reply_markup: getNumberControlKeyboard() });
        return;
    }

    await rebuildCountryCache();
    const availData = getAvailableCountriesData();
    if (Object.keys(availData).length === 0) { bot.sendMessage(userId, "Sorry! No numbers."); return; }

    const buttons = [];
    Object.keys(availData).sort().forEach(country => {
        buttons.push([{ text: `${availData[country].flag} ${country} (${availData[country].count})`, callback_data: `assign_number:${country}` }]);
    });
    bot.sendMessage(userId, "🌍 **Select Country:**", { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
}

async function showActiveNumber(userId) {
    const data = await NumberModel.findOne({ assigned_to: userId, status: 'Used' });
    if (data) {
        bot.sendMessage(userId, `✅ **Active Number**\n${data.flag} ${data.country}\n\`${data.number}\``, { parse_mode: 'Markdown', reply_markup: getNumberControlKeyboard() });
    } else {
        bot.sendMessage(userId, "❌ No active number.", { parse_mode: 'Markdown' });
    }
}

bot.on('callback_query', async (call) => {
    const userId = call.from.id;
    const data = call.data;
    const msgId = call.message.message_id;
    const chatId = call.message.chat.id;

    if (data === 'verify_check') {
        if (await isUserMember(userId)) {
            bot.editMessageText("✅ Verified!", { chat_id: chatId, message_id: msgId });
            bot.sendMessage(userId, "Menu:", { reply_markup: getMainMenuKeyboard(userId) });
        } else {
            bot.answerCallbackQuery(call.id, { text: "❌ Join channels!", show_alert: true });
        }
        return;
    }

   // ... আগের কোড ...

    if (data === 'cancel_delete' && isAdmin(userId)) {
        bot.editMessageText("✅ Cancelled.", { chat_id: chatId, message_id: msgId });
        bot.sendMessage(userId, "Menu:", { reply_markup: getAdminMenuKeyboard() });
        return;
    }

    // 🔥 পরিবর্তন ১: 'select_delete_country:' এর বদলে 'sdc:' চেক করা হচ্ছে
    if (data.startsWith('sdc:') && isAdmin(userId)) {
        const country = data.split(':')[1];
        admin_country_temp_data[userId] = country;
        const count = await NumberModel.countDocuments({ country: country });
        const markup = {
            inline_keyboard: [
                // 🔥 পরিবর্তন ২: 'confirm_delete_country:' এর বদলে 'cdc:' ব্যবহার করা হয়েছে
                [{ text: `✅ DELETE ALL (${count})`, callback_data: `cdc:${country}` }],
                [{ text: "❌ CANCEL", callback_data: 'cancel_delete' }]
            ]
        };
        bot.editMessageText(`⚠️ Delete **${country}**?`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: markup });
        return;
    }

   // 🔥 পরিবর্তন ৩: 'confirm_delete_country:' বা 'cdc:' এর কোড (Available নাম্বারের ব্যাকআপ সব এডমিনকে পাঠানো + মেসেজ ডিলিট)
    if (data.startsWith('cdc:') && isAdmin(userId)) {
        const country = data.split(':')[1];
        if (admin_country_temp_data[userId] !== country) return;

        // ১. কনফার্মেশন মেসেজটি (⚠️ Delete [Country]?) ডিলিট করে দেওয়া
        try {
            await bot.deleteMessage(chatId, msgId);
        } catch (e) {
            console.log("Message delete failed or already deleted");
        }

        bot.sendMessage(userId, "⏳ **Backing up FRESH numbers & Deleting...**");

        try {
            // ২. শুধুমাত্র 'Available' (ফ্রেশ) নাম্বারগুলো খুঁজে বের করা
            const freshNumbers = await NumberModel.find({ country: country, status: 'Available' });

            if (freshNumbers.length > 0) {
                // ৩. ফাইলের ভেতরের লেখা তৈরি করা
                let fileContent = "";
                freshNumbers.forEach(item => {
                    fileContent += `${item.number}\n`; // শুধু নাম্বার থাকবে
                });

                // ৪. ফাইল বাফার তৈরি করা
                const fileBuffer = Buffer.from(fileContent, 'utf8');
                const fileName = `${country.replace(/\s/g, '_')}_Fresh_Backup.txt`;

                // ৫. ✅ সব এডমিনকে ফাইলটি পাঠানো (Loop through ADMIN_IDS)
                for (const adminId of ADMIN_IDS) {
                    try {
                        await bot.sendDocument(adminId, fileBuffer, {
                            caption: `🗑️ **Country Deleted: ${country}**\n👤 Action by: ${userId}\n📂 Backup of Fresh Numbers: ${freshNumbers.length}\n(Used numbers are ignored)`
                        }, {
                            filename: fileName,
                            contentType: 'text/plain'
                        });
                    } catch (err) {
                        console.log(`Failed to send backup to admin ${adminId}:`, err.message);
                    }
                }
            } else {
                bot.sendMessage(userId, "⚠️ No fresh numbers found to backup (All used or empty).");
            }

            // ৬. ডাটাবেস থেকে ওই দেশের **সব** (Used + Available) নাম্বার ডিলিট করে দেওয়া
            const result = await NumberModel.deleteMany({ country: country });

            // ৭. ক্যাশ আপডেট করা
            await rebuildCountryCache();

            bot.sendMessage(userId, `✅ **Success!**\nDeleted Total: ${result.deletedCount} numbers from DB.`, { reply_markup: getAdminMenuKeyboard() });

        } catch (error) {
            console.error("Delete Error:", error);
            bot.sendMessage(userId, "❌ Error during process.", { reply_markup: getAdminMenuKeyboard() });
        }
        return;
    }

    // ... বাকি কোড ...

    if (!isAdmin(userId) && !(await isUserMember(userId))) return;
    const { allowed, remaining } = isUserAllowedAction(userId);
    if (!allowed) { bot.answerCallbackQuery(call.id, { text: `Wait ${remaining}s`, show_alert: true }); return; }

    if (data.startsWith('assign_number:')) {
        const country = data.split(':')[1];
        await NumberModel.updateMany({ assigned_to: userId, status: 'Used' }, { $set: { status: 'Used_History', assigned_to: null } });
        const randomNum = await NumberModel.aggregate([{ $match: { country: country, status: 'Available' } }, { $sample: { size: 1 } }]);

        if (randomNum.length > 0) {
            const updated = await NumberModel.findByIdAndUpdate(randomNum[0]._id, { status: 'Used', assigned_to: userId }, { new: true });
            let displayNum = updated.number.startsWith('+') ? updated.number : '+' + updated.number;
            bot.editMessageText(ASSIGNMENT_MESSAGE_TEMPLATE(updated.flag, updated.country, displayNum, "Assigned", NEW_FOOTER_QUOTE), 
                { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: getNumberControlKeyboard() });
        } else {
            await rebuildCountryCache();
            bot.editMessageText(`❌ Sold Out.`, { chat_id: chatId, message_id: msgId });
        }
    }

    else if (data === 'change_number_req') {
        const currentTime = Date.now() / 1000;
        const lastTime = last_change_time[userId] || 0;
        const timeDiff = currentTime - lastTime;
        const cooldownTime = 3;

        if (timeDiff < cooldownTime) {
            const remaining = Math.ceil(cooldownTime - timeDiff);
            bot.answerCallbackQuery(call.id, { text: `⏳ Please wait ${remaining} seconds before changing again!`, show_alert: true });
            return;
        }

        last_change_time[userId] = currentTime;

        try {
            await bot.editMessageText("🔄 <b>Changing Number...</b>\n━━━━━━━━━━━━\n⏳ Searching fresh number for you...", { 
                chat_id: chatId, 
                message_id: msgId, 
                parse_mode: 'HTML' 
            });
            await new Promise(resolve => setTimeout(resolve, 0));
        } catch (e) {}

        const current = await NumberModel.findOne({ assigned_to: userId, status: 'Used' });
        if (current) {
            current.status = 'Used_History'; current.assigned_to = null; await current.save();
            const randomNum = await NumberModel.aggregate([{ $match: { country: current.country, status: 'Available' } }, { $sample: { size: 1 } }]);
            if (randomNum.length > 0) {
                const updated = await NumberModel.findByIdAndUpdate(randomNum[0]._id, { status: 'Used', assigned_to: userId }, { new: true });
                let displayNum = updated.number.startsWith('+') ? updated.number : '+' + updated.number;
                bot.editMessageText(ASSIGNMENT_MESSAGE_TEMPLATE(updated.flag, updated.country, displayNum, "Changed", NEW_FOOTER_QUOTE), 
                    { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: getNumberControlKeyboard() });
            } else {
                 bot.editMessageText(`❌ No numbers left in ${current.country}.`, { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [[{text: "🌍 Change Country", callback_data: 'change_country_start'}]] } });
            }
        } else {
            bot.editMessageText("❌ No active number.", { chat_id: chatId, message_id: msgId });
        }
    }

    else if (data === 'change_country_start') {
        await NumberModel.updateMany({ assigned_to: userId, status: 'Used' }, { $set: { status: 'Used_History', assigned_to: null } });
        await rebuildCountryCache();
        const availData = getAvailableCountriesData();
        const buttons = [];
        Object.keys(availData).sort().forEach(c => {
            buttons.push([{ text: `${availData[c].flag} ${c} (${availData[c].count})`, callback_data: `assign_number:${c}` }]); // Reusing assign_number logic
        });
        bot.editMessageText("🌍 **Select New Country:**", { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
    }
});

// Start Sync
try {
    if (fs.existsSync(USER_LIST_FILE)) {
        bot_users = new Set(JSON.parse(fs.readFileSync(USER_LIST_FILE)));
    }
} catch (e) {}

console.log("🚀 Bot is running...");
