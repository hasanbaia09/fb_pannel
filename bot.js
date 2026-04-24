const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('🌟 Ultimate FB Bot is running!');
});

app.listen(3000, () => {
    console.log('✅ Server started on port 3000');
});

const TelegramBot = require('node-telegram-bot-api');

// ============= কনফিগারেশন =============
const BOT_TOKEN = '8772316564:AAF6Buvm_XAT3QyClTNKp9nVuop2KSVSb0U';
const SUPER_ADMIN_ID = '7659779887';
const BKASH_NUMBER = '01865598733';
const PER_REQUEST_COST = 2;
const REFERRAL_BONUS = 10;
const MIN_DEPOSIT = 20;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ============= ডাটাবেস =============
let allowedUsers = {};
let pendingUsers = [];
let fbAccounts = [];
let userLinks = {};
let userBalance = {};
let userStats = {};
let userHistory = {};
let pendingDeposits = [];

// ============= ডিফল্ট FB অ্যাকাউন্ট =============
fbAccounts = [
    { id: "61572065871152", name: "📘 Account 1", cookie: "datr=xxx; c_user=xxx; xs=xxx" }
];

// ============= ফাংশন =============
function randomDelay() {
    return (Math.random() * (7 - 4) + 4) * 1000;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendFriendRequest(cookie, targetId) {
    const url = `https://www.facebook.com/ajax/add_friend/action.php?dpr=1`;
    const params = new URLSearchParams();
    params.append('to_friend', targetId);
    params.append('action', 'add_friend');
    params.append('__a', '1');
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Cookie': cookie,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36'
            },
            body: params.toString()
        });
        const text = await response.text();
        return text.includes('success') || text.includes('confirm');
    } catch(e) {
        return false;
    }
}

function isSuperAdmin(userId) {
    return userId.toString() === SUPER_ADMIN_ID.toString();
}

function isAdmin(userId) {
    if (isSuperAdmin(userId)) return true;
    const user = allowedUsers[userId];
    return user && user.isAdmin === true && user.blocked !== true;
}

function isAllowed(userId) {
    const user = allowedUsers[userId];
    return user && user.approved === true && user.blocked !== true;
}

function getUserVisibleAccounts(userId) {
    const user = allowedUsers[userId];
    const visibleCount = user?.visibleCount || 30;
    return fbAccounts.slice(0, visibleCount);
}

function getReferralLink(userId) {
    return `https://t.me/fbfhelppanel_bot?start=ref_${userId}`;
}

// ============= মেনু বাটন (নিচের দিকে) =============
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "📝 লিংক যোগ করুন", callback_data: "add_link" }],
            [{ text: "🚀 রিকোয়েস্ট পাঠান", callback_data: "send_req" }],
            [{ text: "👤 প্রোফাইল", callback_data: "profile" }],
            [{ text: "💸 ডিপোজিট", callback_data: "deposit" }],
            [{ text: "🔗 রেফার", callback_data: "referral" }],
            [{ text: "📊 স্ট্যাটাস", callback_data: "user_status" }],
            [{ text: "🛎️ সাপোর্ট", callback_data: "support" }]
        ]
    }
};

const adminMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "👥 ইউজার ম্যানেজমেন্ট", callback_data: "admin_user_section" }],
            [{ text: "📘 FB অ্যাকাউন্ট ম্যানেজ", callback_data: "admin_fb_section" }],
            [{ text: "💰 পেমেন্ট ম্যানেজ", callback_data: "admin_payment_section" }],
            [{ text: "📊 অ্যানালিটিক্স", callback_data: "admin_analytics" }],
            [{ text: "⚙️ সেটিংস", callback_data: "admin_settings" }],
            [{ text: "🔙 হোম", callback_data: "main_menu" }]
        ]
    }
};

function backButton(data) {
    return {
        reply_markup: {
            inline_keyboard: [[{ text: "🔙 ব্যাক", callback_data: data }]]
        }
    };
}

// ============= স্টার্ট কমান্ড =============
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = chatId.toString();
    const firstName = msg.from.first_name || "ভাই";
    const username = msg.from.username || "N/A";
    
    const text = msg.text;
    const refMatch = text.match(/ref_(\d+)/);
    if (refMatch && !allowedUsers[userId]) {
        const referrerId = refMatch[1];
        if (referrerId !== userId && allowedUsers[referrerId]) {
            userBalance[referrerId] = (userBalance[referrerId] || 0) + REFERRAL_BONUS;
            userStats[referrerId] = userStats[referrerId] || {};
            userStats[referrerId].referralCount = (userStats[referrerId].referralCount || 0) + 1;
            bot.sendMessage(referrerId, `🎉 নতুন রেফারাল! ${firstName} আপনার লিংকে জয়েন করেছে। ${REFERRAL_BONUS} টাকা আপনার ব্যালেন্সে যোগ হয়েছে।`);
        }
    }
    
    if (isSuperAdmin(userId) || isAdmin(userId)) {
        bot.sendMessage(chatId, 
            "👑 **অ্যাডমিন প্যানেল** 👑\n\n" +
            "স্বাগতম! নিচের সেকশন থেকে বেছে নাও:",
            { parse_mode: 'Markdown', ...adminMenu }
        );
        return;
    }
    
    if (isAllowed(userId)) {
        const visibleAccounts = getUserVisibleAccounts(userId);
        const balance = userBalance[userId] || 0;
        const referralCount = userStats[userId]?.referralCount || 0;
        
        bot.sendMessage(chatId,
            `🌟 হ্যালো ${firstName}! 🌟\n\n` +
            `📊 আপনার স্ট্যাটাস:\n` +
            `✅ স্ট্যাটাস: অনুমোদিত\n` +
            `📘 অ্যাকাউন্ট: ${visibleAccounts.length}/${fbAccounts.length}টি\n` +
            `💰 ব্যালেন্স: ${balance} টাকা\n` +
            `🔗 রেফারাল: ${referralCount} জন\n\n` +
            `🔽 নিচের মেনু ব্যবহার করো 🔽`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
        return;
    }
    
    pendingUsers.push({ userId, name: firstName, username, timestamp: new Date().toLocaleString() });
    bot.sendMessage(chatId, `⏳ হ্যালো ${firstName}! আপনার অনুরোধ অ্যাডমিনের কাছে পাঠানো হয়েছে। অনুমোদন পেলে আবার /start দিন।`);
    
    for (const [uid, data] of Object.entries(allowedUsers)) {
        if (data.isAdmin === true || uid === SUPER_ADMIN_ID) {
            bot.sendMessage(uid, `🆕 নতুন ইউজার: ${firstName}\n🆔 ${userId}\n/approve_${userId} দিয়ে অনুমোদন দাও`);
        }
    }
});

// ============= অ্যাডমিন কমান্ড =============
bot.onText(/\/approve_(\d+)/, async (msg, match) => {
    const adminId = msg.chat.id;
    if (!isAdmin(adminId)) return;
    
    const userId = match[1];
    const pending = pendingUsers.find(p => p.userId === userId);
    if (!pending) {
        bot.sendMessage(adminId, "❌ ইউজার পাওয়া যায়নি।");
        return;
    }
    
    allowedUsers[userId] = {
        name: pending.name,
        approved: true,
        isAdmin: false,
        blocked: false,
        approvedAt: new Date().toLocaleString(),
        visibleCount: 30,
        link: null,
        username: pending.username
    };
    
    userBalance[userId] = 0;
    userStats[userId] = { totalSpent: 0, totalDeposits: 0, referralCount: 0 };
    userHistory[userId] = [];
    
    pendingUsers = pendingUsers.filter(p => p.userId !== userId);
    bot.sendMessage(adminId, `✅ ${pending.name} কে অনুমোদন দেওয়া হয়েছে।`);
    bot.sendMessage(userId, "✅ আপনার অনুরোধ অনুমোদন করা হয়েছে! এখন /start দিয়ে বট ব্যবহার করুন।");
});

// ============= কলব্যাক হ্যান্ডলার =============
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = chatId.toString();
    const data = query.data;
    const messageId = query.message.message_id;
    
    // মেইন মেনু
    if (data === 'main_menu') {
        if (isAdmin(userId)) {
            bot.editMessageText("👑 অ্যাডমিন প্যানেল", { chat_id: chatId, message_id: messageId, reply_markup: adminMenu.reply_markup });
        } else if (isAllowed(userId)) {
            const balance = userBalance[userId] || 0;
            const visibleAccounts = getUserVisibleAccounts(userId);
            bot.editMessageText(
                `🌟 হ্যালো! 🌟\n\n📊 স্ট্যাটাস:\n✅ অনুমোদিত\n📘 অ্যাকাউন্ট: ${visibleAccounts.length}/${fbAccounts.length}\n💰 ব্যালেন্স: ${balance} টাকা`,
                { chat_id: chatId, message_id: messageId, reply_markup: mainMenu.reply_markup }
            );
        }
    }
    
    // প্রোফাইল
    else if (data === 'profile') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        const balance = userBalance[userId] || 0;
        const stats = userStats[userId] || {};
        const history = userHistory[userId] || [];
        
        let historyText = "";
        history.slice(-5).forEach(h => {
            historyText += `• ${h.type}: ${h.amount} টাকা (${h.date})\n`;
        });
        
        bot.editMessageText(
            `👤 **প্রোফাইল** 👤\n\n` +
            `🆔 আইডি: ${userId}\n` +
            `💰 ব্যালেন্স: ${balance} টাকা\n` +
            `💸 মোট খরচ: ${stats.totalSpent || 0} টাকা\n` +
            `💵 মোট ডিপোজিট: ${stats.totalDeposits || 0} টাকা\n` +
            `🔗 রেফারাল: ${stats.referralCount || 0} জন\n\n` +
            `📜 **ইতিহাস:**\n${historyText || "কোনো ইতিহাস নেই"}`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
    }
    
    // ডিপোজিট
    else if (data === 'deposit') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        bot.editMessageText(
            `💸 **ডিপোজিট** 💸\n\n` +
            `bKash নাম্বার: ${BKASH_NUMBER}\n` +
            `⚠️ এজেন্ট নোট অ্যালাউড নয়!\n\n` +
            `ন্যূনতম ডিপোজিট: ${MIN_DEPOSIT} টাকা\n\n` +
            `টাকা পাঠানোর পর নিচের ফরম্যাটে TXID দিন:\n` +
            `টাকার_পরিমাণ|ট্রানজাকশন_আইডি\n` +
            `উদাহরণ: 50|TXID12345`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
        
        bot.once('message', async (msg) => {
            if (msg.chat.id !== chatId) return;
            const parts = msg.text.split('|');
            if (parts.length === 2) {
                const amount = parseInt(parts[0]);
                const txid = parts[1];
                if (amount >= MIN_DEPOSIT) {
                    pendingDeposits.push({ userId, amount, txid, timestamp: new Date().toLocaleString() });
                    bot.sendMessage(chatId, "✅ ডিপোজিট রিকোয়েস্ট পাঠানো হয়েছে! অ্যাডমিন এপ্রুভ করবেন।");
                    for (const [uid, data] of Object.entries(allowedUsers)) {
                        if (data.isAdmin === true || uid === SUPER_ADMIN_ID) {
                            bot.sendMessage(uid, `💰 নতুন ডিপোজিট!\n👤 ${allowedUsers[userId]?.name}\n💸 ${amount} টাকা\n🆔 TXID: ${txid}\n/deposit_approve_${userId}_${amount} দিয়ে অনুমোদন দাও`);
                        }
                    }
                } else {
                    bot.sendMessage(chatId, `❌ ন্যূনতম ডিপোজিট ${MIN_DEPOSIT} টাকা!`);
                }
            } else {
                bot.sendMessage(chatId, "❌ ভুল ফরম্যাট! টাকা|TXID দিন।");
            }
        });
    }
    
    // রেফারাল
    else if (data === 'referral') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        const referralLink = getReferralLink(userId);
        const referralCount = userStats[userId]?.referralCount || 0;
        
        let leaderboard = "🏆 **লিডারবোর্ড** 🏆\n\n";
        const sorted = Object.entries(userStats)
            .sort((a, b) => (b[1].referralCount || 0) - (a[1].referralCount || 0))
            .slice(0, 5);
        
        sorted.forEach(([uid, stats], i) => {
            const name = allowedUsers[uid]?.name || uid;
            leaderboard += `${i+1}. ${name}: ${stats.referralCount || 0} জন\n`;
        });
        
        bot.editMessageText(
            `🔗 **রেফার লিংক** 🔗\n\n` +
            `🔗 লিংক: ${referralLink}\n` +
            `👥 রেফারাল কাউন্ট: ${referralCount} জন\n` +
            `💰 প্রতি রেফারালে বোনাস: ${REFERRAL_BONUS} টাকা\n\n` +
            `${leaderboard}`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
    }
    
    // সাপোর্ট
    else if (data === 'support') {
        bot.editMessageText(
            "🛎️ **সাপোর্ট** 🛎️\n\n" +
            "📞 **অ্যাডমিন:** @hasanbaia9\n\n" +
            "⏰ অনলাইন: ২৪/৭\n\n" +
            "কোনো সমস্যা হলে যোগাযোগ করুন।",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
    }
    
    // লিংক যোগ করা
    else if (data === 'add_link') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        bot.editMessageText("🔗 ফেসবুক প্রোফাইল লিংক দিন:\n\nউদাহরণ: `https://facebook.com/username`", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        bot.once('message', (msg) => {
            userLinks[userId] = msg.text;
            bot.sendMessage(chatId, "✅ লিংক সেভ হয়েছে!", { reply_markup: mainMenu.reply_markup });
        });
    }
    
    // স্ট্যাটাস
    else if (data === 'user_status') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        const visibleAccounts = getUserVisibleAccounts(userId);
        const balance = userBalance[userId] || 0;
        bot.editMessageText(
            `📊 **স্ট্যাটাস** 📊\n\n` +
            `✅ স্ট্যাটাস: অনুমোদিত\n` +
            `📘 অ্যাকাউন্ট: ${visibleAccounts.length}/${fbAccounts.length}টি\n` +
            `💰 ব্যালেন্স: ${balance} টাকা\n` +
            `⏱️ ডেলি টাইম: ৪-৭ সেকেন্ড\n` +
            `💰 প্রতি রিকোয়েস্ট খরচ: ${PER_REQUEST_COST} টাকা`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
    }
    
    // রিকোয়েস্ট পাঠানো
    else if (data === 'send_req') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        
        const link = userLinks[userId];
        if (!link) {
            bot.answerCallbackQuery(query.id, { text: '❌ আগে লিংক যোগ করুন!', show_alert: true });
            return;
        }
        
        const balance = userBalance[userId] || 0;
        if (balance < PER_REQUEST_COST) {
            bot.answerCallbackQuery(query.id, { text: `❌ ব্যালেন্স কম! ${PER_REQUEST_COST} টাকা দরকার। ডিপোজিট করুন।`, show_alert: true });
            return;
        }
        
        const match = link.match(/facebook\.com\/([^\/?]+)/);
        if (!match) {
            bot.sendMessage(chatId, "❌ ভুল লিংক!");
            return;
        }
        
        const targetId = match[1];
        const visibleAccounts = getUserVisibleAccounts(userId);
        
        userBalance[userId] = balance - PER_REQUEST_COST;
        if (!userStats[userId]) userStats[userId] = { totalSpent: 0, totalDeposits: 0, referralCount: 0 };
        userStats[userId].totalSpent = (userStats[userId].totalSpent || 0) + PER_REQUEST_COST;
        if (!userHistory[userId]) userHistory[userId] = [];
        userHistory[userId].push({ type: "খরচ", amount: PER_REQUEST_COST, date: new Date().toLocaleString(), target: targetId });
        
        bot.editMessageText(
            `🚀 রিকোয়েস্ট পাঠানো শুরু...\n📌 টার্গেট: ${targetId}\n📊 অ্যাকাউন্ট: ${visibleAccounts.length}টি\n💰 খরচ: ${PER_REQUEST_COST} টাকা\n💸 বাকি: ${userBalance[userId]} টাকা`,
            { chat_id: chatId, message_id: messageId }
        );
        
        let success = 0;
        for (let i = 0; i < visibleAccounts.length; i++) {
            const acc = visibleAccounts[i];
            const result = await sendFriendRequest(acc.cookie, targetId);
            if (result) success++;
            bot.sendMessage(chatId, `${result ? '✅' : '❌'} ${acc.name}`);
            if (i < visibleAccounts.length - 1) await sleep(randomDelay());
        }
        
        bot.sendMessage(chatId, `🎉 সম্পন্ন! ${success}/${visibleAccounts.length} সফল।`, { reply_markup: mainMenu.reply_markup });
    }
    
    // === অ্যাডমিন সেকশন ===
    else if (data === 'admin_user_section') {
        if (!isAdmin(userId)) return;
        bot.editMessageText(
            "👥 **ইউজার ম্যানেজমেন্ট**\n\n" +
            "/users - সব ইউজার দেখো\n" +
            "/pending - পেন্ডিং ইউজার\n" +
            "/approve_আইডি - অনুমোদন দাও\n" +
            "/block_আইডি - ব্লক করো\n" +
            "/unblock_আইডি - আনব্লক করো\n" +
            "/make_admin আইডি - অ্যাডমিন বানাও",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminMenu.reply_markup }
        );
    }
    
    else if (data === 'admin_fb_section') {
        if (!isAdmin(userId)) return;
        bot.editMessageText(
            "📘 **FB অ্যাকাউন্ট ম্যানেজ**\n\n" +
            "/add_fb আইডি|নাম|কুকি\n" +
            "/list_fb - সব অ্যাকাউন্ট দেখো\n" +
            "/del_fb নাম্বার - অ্যাকাউন্ট ডিলিট\n" +
            "/set_visible আইডি|কাউন্ট - ইউজারের ভিজিবল সেট",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminMenu.reply_markup }
        );
    }
    
    else if (data === 'admin_payment_section') {
        if (!isAdmin(userId)) return;
        bot.editMessageText(
            "💰 **পেমেন্ট ম্যানেজ**\n\n" +
            "/pending_deposits - পেন্ডিং ডিপোজিট\n" +
            "/deposit_approve_আইডি_টাকা - ডিপোজিট অনুমোদন\n" +
            "/add_balance আইডি|টাকা - ব্যালেন্স যোগ\n" +
            "/stats - ইনকাম স্ট্যাটাস",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminMenu.reply_markup }
        );
    }
    
    else if (data === 'admin_analytics') {
        if (!isAdmin(userId)) return;
        const totalUsers = Object.keys(allowedUsers).length;
        const totalIncome = Object.values(userStats).reduce((sum, s) => sum + (s.totalSpent || 0), 0);
        const totalDeposits = Object.values(userStats).reduce((sum, s) => sum + (s.totalDeposits || 0), 0);
        
        bot.editMessageText(
            "📊 **অ্যানালিটিক্স** 📊\n\n" +
            `👥 মোট ইউজার: ${totalUsers}\n` +
            `💰 মোট ইনকাম: ${totalIncome} টাকা\n` +
            `💵 মোট ডিপোজিট: ${totalDeposits} টাকা\n` +
            `📘 FB অ্যাকাউন্ট: ${fbAccounts.length}টি\n` +
            `⏳ পেন্ডিং ইউজার: ${pendingUsers.length}টি`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminMenu.reply_markup }
        );
    }
    
    else if (data === 'admin_settings') {
        if (!isSuperAdmin(userId)) return;
        bot.editMessageText(
            "⚙️ **সেটিংস** ⚙️\n\n" +
            `/set_bkash নাম্বার - bKash নাম্বার চেঞ্জ\n` +
            `/set_cost টাকা - প্রতি রিকোয়েস্ট খরচ\n` +
            `/set_bonus টাকা - রেফারাল বোনাস\n` +
            `/restart - বট রিস্টার্ট`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminMenu.reply_markup }
        );
    }
    
    bot.answerCallbackQuery(query.id);
});

// ============= অ্যাডমিন টেক্সট কমান্ড =============
bot.onText(/\/users/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    let list = "👥 **ইউজার লিস্ট:**\n\n";
    for (const [uid, user] of Object.entries(allowedUsers)) {
        list += `🆔 ${uid} - ${user.name} - ${user.isAdmin ? '👑 অ্যাডমিন' : '👤 ইউজার'} - ${user.blocked ? '🚫 ব্লকড' : '✅ সক্রিয়'}\n`;
    }
    bot.sendMessage(msg.chat.id, list || "কোনো ইউজার নেই।", { parse_mode: 'Markdown' });
});

bot.onText(/\/pending/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    if (pendingUsers.length === 0) {
        bot.sendMessage(msg.chat.id, "📋 কোনো পেন্ডিং ইউজার নেই।");
        return;
    }
    let list = "⏳ **পেন্ডিং ইউজার:**\n\n";
    pendingUsers.forEach(p => {
        list += `👤 ${p.name} - 🆔 ${p.userId}\n/approve_${p.userId}\n\n`;
    });
    bot.sendMessage(msg.chat.id, list);
});

bot.onText(/\/block_(\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    if (allowedUsers[userId]) {
        allowedUsers[userId].blocked = true;
        bot.sendMessage(msg.chat.id, `✅ ${allowedUsers[userId].name} ব্লক করা হয়েছে।`);
        bot.sendMessage(userId, "🚫 আপনি ব্লক হয়েছেন!");
    } else {
        bot.sendMessage(msg.chat.id, "❌ ইউজার নেই।");
    }
});

bot.onText(/\/unblock_(\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    if (allowedUsers[userId]) {
        allowedUsers[userId].blocked = false;
        bot.sendMessage(msg.chat.id, `✅ ${allowedUsers[userId].name} আনব্লক করা হয়েছে।`);
        bot.sendMessage(userId, "🔓 আপনি আনব্লক হয়েছেন!");
    } else {
        bot.sendMessage(msg.chat.id, "❌ ইউজার নেই।");
    }
});

bot.onText(/\/add_fb (.+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const parts = match[1].split('|');
    if (parts.length >= 3) {
        fbAccounts.push({ id: parts[0], name: parts[1], cookie: parts[2] });
        bot.sendMessage(msg.chat.id, `✅ অ্যাকাউন্ট যোগ হয়েছে! মোট: ${fbAccounts.length}টি`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ ফরম্যাট: আইডি|নাম|কুকি");
    }
});

bot.onText(/\/list_fb/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    if (fbAccounts.length === 0) {
        bot.sendMessage(msg.chat.id, "📋 কোনো FB অ্যাকাউন্ট নেই।");
        return;
    }
    let list = "📘 **FB অ্যাকাউন্ট লিস্ট:**\n\n";
    fbAccounts.forEach((acc, i) => {
        list += `${i+1}. ${acc.name} - 🆔 ${acc.id}\n🍪 ${acc.cookie.substring(0, 50)}...\n\n`;
    });
    bot.sendMessage(msg.chat.id, list);
});

bot.onText(/\/del_fb (\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const num = parseInt(match[1]) - 1;
    if (num >= 0 && num < fbAccounts.length) {
        const removed = fbAccounts.splice(num, 1);
        bot.sendMessage(msg.chat.id, `✅ ${removed[0].name} ডিলিট করা হয়েছে। বাকি: ${fbAccounts.length}টি`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ ভুল নম্বর!");
    }
});

bot.onText(/\/set_visible (\d+)\|(\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const count = parseInt(match[2]);
    if (allowedUsers[userId] && count >= 1 && count <= fbAccounts.length) {
        allowedUsers[userId].visibleCount = count;
        bot.sendMessage(msg.chat.id, `✅ ${allowedUsers[userId].name} এখন ${count}টি অ্যাকাউন্ট দেখতে পাবে।`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ ভুল আইডি বা কাউন্ট!");
    }
});

bot.onText(/\/add_balance (\d+)\|(\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const amount = parseInt(match[2]);
    if (allowedUsers[userId]) {
        userBalance[userId] = (userBalance[userId] || 0) + amount;
        if (!userStats[userId]) userStats[userId] = { totalSpent: 0, totalDeposits: 0, referralCount: 0 };
        userStats[userId].totalDeposits = (userStats[userId].totalDeposits || 0) + amount;
        bot.sendMessage(msg.chat.id, `✅ ${allowedUsers[userId].name} কে ${amount} টাকা দেওয়া হয়েছে।`);
        bot.sendMessage(userId, `💰 ${amount} টাকা আপনার ব্যালেন্সে যোগ হয়েছে!`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ ইউজার নেই।");
    }
});

bot.onText(/\/pending_deposits/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    if (pendingDeposits.length === 0) {
        bot.sendMessage(msg.chat.id, "📋 কোনো পেন্ডিং ডিপোজিট নেই।");
        return;
    }
    let list = "💰 **পেন্ডিং ডিপোজিট:**\n\n";
    pendingDeposits.forEach((d, i) => {
        const user = allowedUsers[d.userId];
        list += `${i+1}. 👤 ${user?.name || d.userId}\n💸 ${d.amount} টাকা\n🆔 TXID: ${d.txid}\n🕐 ${d.timestamp}\n/deposit_approve_${d.userId}_${d.amount}\n\n`;
    });
    bot.sendMessage(msg.chat.id, list);
});

bot.onText(/\/deposit_approve_(\d+)_(\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const amount = parseInt(match[2]);
    const deposit = pendingDeposits.find(d => d.userId === userId && d.amount === amount);
    if (deposit) {
        userBalance[userId] = (userBalance[userId] || 0) + amount;
        if (!userStats[userId]) userStats[userId] = { totalSpent: 0, totalDeposits: 0, referralCount: 0 };
        userStats[userId].totalDeposits = (userStats[userId].totalDeposits || 0) + amount;
        if (!userHistory[userId]) userHistory[userId] = [];
        userHistory[userId].push({ type: "ডিপোজিট", amount: amount, date: new Date().toLocaleString() });
        pendingDeposits = pendingDeposits.filter(d => !(d.userId === userId && d.amount === amount));
        bot.sendMessage(msg.chat.id, `✅ ডিপোজিট অনুমোদন! ${amount} টাকা যোগ হয়েছে।`);
        bot.sendMessage(userId, `💰 আপনার ${amount} টাকার ডিপোজিট অনুমোদন হয়েছে!`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ ডিপোজিট পাওয়া যায়নি।");
    }
});

bot.onText(/\/stats/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const totalUsers = Object.keys(allowedUsers).length;
    const totalIncome = Object.values(userStats).reduce((sum, s) => sum + (s.totalSpent || 0), 0);
    const totalDeposits = Object.values(userStats).reduce((sum, s) => sum + (s.totalDeposits || 0), 0);
    bot.sendMessage(msg.chat.id, 
        `📊 **বট স্ট্যাটাস** 📊\n\n` +
        `👥 মোট ইউজার: ${totalUsers}\n` +
        `💰 মোট ইনকাম: ${totalIncome} টাকা\n` +
        `💵 মোট ডিপোজিট: ${totalDeposits} টাকা\n` +
        `📘 FB অ্যাকাউন্ট: ${fbAccounts.length}টি\n` +
        `⏳ পেন্ডিং ইউজার: ${pendingUsers.length}টি`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/make_admin (\d+)/, (msg, match) => {
    if (!isSuperAdmin(msg.chat.id)) return;
    const userId = match[1];
    if (allowedUsers[userId]) {
        allowedUsers[userId].isAdmin = true;
        bot.sendMessage(msg.chat.id, `✅ ${allowedUsers[userId].name} এখন অ্যাডমিন!`);
        bot.sendMessage(userId, "👑 আপনাকে অ্যাডমিন বানানো হয়েছে!");
    } else {
        bot.sendMessage(msg.chat.id, "❌ ইউজার নেই। আগে অনুমোদন দিন।");
    }
});

bot.onText(/\/set_bkash (.+)/, (msg, match) => {
    if (!isSuperAdmin(msg.chat.id)) return;
    const newNumber = match[1];
    bot.sendMessage(msg.chat.id, `✅ bKash নাম্বার চেঞ্জ করে ${newNumber} রাখা হয়েছে!`);
});

bot.onText(/\/set_cost (\d+)/, (msg, match) => {
    if (!isSuperAdmin(msg.chat.id)) return;
    const newCost = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, `✅ প্রতি রিকোয়েস্ট খরচ ${newCost} টাকা সেট করা হয়েছে!`);
});

bot.onText(/\/set_bonus (\d+)/, (msg, match) => {
    if (!isSuperAdmin(msg.chat.id)) return;
    const newBonus = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, `✅ রেফারাল বোনাস ${newBonus} টাকা সেট করা হয়েছে!`);
});

bot.onText(/\/restart/, async (msg) => {
    if (!isSuperAdmin(msg.chat.id)) return;
    await bot.sendMessage(msg.chat.id, "🔄 বট রিস্টার্ট হচ্ছে...");
    process.exit(0);
});

console.log('✅ প্রিমিয়াম FB বট চালু হয়েছে!');
console.log(`👑 সুপার অ্যাডমিন: ${SUPER_ADMIN_ID}`);
console.log(`📘 FB অ্যাকাউন্ট: ${fbAccounts.length}টি`);
console.log(`💰 প্রতি রিকোয়েস্ট খরচ: ${PER_REQUEST_COST} টাকা`);
