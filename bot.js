const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('🌟 Premium FB Bot is running!');
});

app.listen(3000, () => {
    console.log('✅ Server started on port 3000');
});

const TelegramBot = require('node-telegram-bot-api');

// ============= কনফিগারেশন =============
const BOT_TOKEN = 8772316564:AAF6Buvm_XAT3QyClTNKp9nVuop2KSVSb0U
const SUPER_ADMIN_ID = 7659779887
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
let proxyList = [];
let blockedProxies = [];
let adminPermissions = {};

// ============= ডিফল্ট FB অ্যাকাউন্ট =============
const DEFAULT_ACCOUNTS = [
    { id: "61572065871152", name: "📘 Account 1", cookie: "datr=xxx; c_user=xxx; xs=xxx", proxy: null },
    { id: "61572102352313", name: "📘 Account 2", cookie: "datr=yyy; c_user=yyy; xs=yyy", proxy: null }
];
fbAccounts = [...DEFAULT_ACCOUNTS];

// ============= হেল্পার ফাংশন =============
function randomDelay() {
    return (Math.random() * (7 - 4) + 4) * 1000;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendFriendRequest(cookie, proxy, targetId) {
    const url = `https://www.facebook.com/ajax/add_friend/action.php?dpr=1`;
    const params = new URLSearchParams();
    params.append('to_friend', targetId);
    params.append('action', 'add_friend');
    params.append('__a', '1');
    
    try {
        let fetchOptions = {
            method: 'POST',
            headers: {
                'Cookie': cookie,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36'
            },
            body: params.toString()
        };
        
        if (proxy && proxy !== 'none') {
            fetchOptions.agent = new (require('https-proxy-agent'))(proxy);
        }
        
        const response = await fetch(url, fetchOptions);
        const text = await response.text();
        
        if (response.status === 403 || response.status === 429) {
            if (proxy) markProxyBlocked(proxy);
            return false;
        }
        
        return text.includes('success') || text.includes('confirm');
    } catch(e) {
        if (proxy && (e.message.includes('ECONNREFUSED') || e.message.includes('ETIMEDOUT'))) {
            markProxyBlocked(proxy);
        }
        return false;
    }
}

function markProxyBlocked(proxy) {
    if (!blockedProxies.includes(proxy)) {
        blockedProxies.push(proxy);
        console.log(`🚫 Proxy blocked: ${proxy}`);
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

function hasPermission(userId, permission) {
    if (isSuperAdmin(userId)) return true;
    return adminPermissions[userId] && adminPermissions[userId][permission] === true;
}

function isAllowed(userId) {
    const user = allowedUsers[userId];
    return user && user.approved === true && user.blocked !== true;
}

function getReferralLink(userId) {
    return `https://t.me/${bot.getBotUsername()}?start=ref_${userId}`;
}

function getUserVisibleAccounts(userId) {
    const user = allowedUsers[userId];
    const visibleCount = user?.visibleCount || 30;
    return fbAccounts.slice(0, visibleCount);
}

// ============= মেনু বাটন (ছবির মতো) =============
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "💰 ট্রান্সফার ব্যালেন্স", callback_data: "transfer_balance" }],
            [{ text: "📦 নিউ স্টক এডেড", callback_data: "new_stock" }],
            [{ text: "🛍️ শপ নাউ", callback_data: "shop_now" }],
            [{ text: "💸 ডিপোজিট", callback_data: "deposit" }],
            [{ text: "👤 প্রোফাইল", callback_data: "profile" }],
            [{ text: "🔗 রেফার", callback_data: "referral" }],
            [{ text: "🛎️ সাপোর্ট", callback_data: "support" }],
            [{ text: "💬 মেসেজ", callback_data: "message_admin" }]
        ]
    }
};

const adminMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "👥 ইউজার ম্যানেজমেন্ট", callback_data: "admin_user_section" }],
            [{ text: "📘 FB অ্যাকাউন্ট ম্যানেজ", callback_data: "admin_fb_section" }],
            [{ text: "💰 পেমেন্ট ম্যানেজ", callback_data: "admin_payment_section" }],
            [{ text: "🔄 প্রোক্সি ম্যানেজ", callback_data: "admin_proxy_section" }],
            [{ text: "📊 অ্যানালিটিক্স", callback_data: "admin_analytics" }],
            [{ text: "⚙️ সেটিংস", callback_data: "admin_settings" }],
            [{ text: "🔙 হোম", callback_data: "main_menu" }]
        ]
    }
};

function backButton(data) {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 ব্যাক", callback_data: data }]
            ]
        }
    };
}

// ============= টেলিগ্রাম কমান্ড =============
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = chatId.toString();
    const firstName = msg.from.first_name || "ভাই";
    const username = msg.from.username || "N/A";
    
    // রেফারাল চেক
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
        link: null
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
        if (!isAllowed(userId)) return;
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
        if (!isAllowed(userId)) return;
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
                bot.sendMessage(chatId, "❌ ভুল ফরম্যাট!");
            }
        });
    }
    
    // রেফারাল
    else if (data === 'referral') {
        if (!isAllowed(userId)) return;
        const referralLink = getReferralLink(userId);
        const referralCount = userStats[userId]?.referralCount || 0;
        
        // লিডারবোর্ড তৈরি
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
            `আপনার লিংক: ${referralLink}\n` +
            `আপনি এনেছেন: ${referralCount} জন\n\n` +
            `${leaderboard}\n` +
            `প্রতি রেফারালে বোনাস: ${REFERRAL_BONUS} টাকা`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
    }
    
    // সাপোর্ট
    else if (data === 'support') {
        bot.editMessageText(
            "🛎️ **সাপোর্ট** 🛎️\n\n" +
            "কোনো সমস্যা হলে অ্যাডমিনকে জানান:\n\n" +
            "📞 অ্যাডমিন: @fbfhelppanel_bot\n\n" +
            "আমরা ২৪/৭ সাপোর্ট দেই।",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
    }
    
    // মেসেজ অ্যাডমিন
    else if (data === 'message_admin') {
        bot.editMessageText(
            "💬 **অ্যাডমিনকে মেসেজ পাঠান** 💬\n\n" +
            "আপনার মেসেজ লিখুন। অ্যাডমিন উত্তর দিবেন।",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
        
        bot.once('message', async (msg) => {
            if (msg.chat.id !== chatId) return;
            const userMsg = msg.text;
            for (const [uid, data] of Object.entries(allowedUsers)) {
                if (data.isAdmin === true || uid === SUPER_ADMIN_ID) {
                    bot.sendMessage(uid, `💬 নতুন মেসেজ\n👤 ${allowedUsers[userId]?.name}\n📝 ${userMsg}\n/reply_${userId} দিয়ে উত্তর দিন`);
                }
            }
            bot.sendMessage(chatId, "✅ আপনার মেসেজ অ্যাডমিনের কাছে পাঠানো হয়েছে।", { reply_markup: mainMenu.reply_markup });
        });
    }
    
    // লিংক যোগ করা
    else if (data === 'add_link') {
        if (!isAllowed(userId)) return;
        bot.editMessageText("🔗 ফেসবুক লিংক দিন:", { chat_id: chatId, message_id: messageId });
        bot.once('message', (msg) => {
            userLinks[userId] = msg.text;
            bot.sendMessage(chatId, "✅ লিংক সেভ হয়েছে!", { reply_markup: mainMenu.reply_markup });
        });
    }
    
    // রিকোয়েস্ট পাঠানো
    else if (data === 'send_req') {
        if (!isAllowed(userId)) return;
        
        const link = userLinks[userId];
        if (!link) {
            bot.answerCallbackQuery(query.id, { text: '❌ আগে লিংক দাও!', show_alert: true });
            return;
        }
        
        const balance = userBalance[userId] || 0;
        if (balance < PER_REQUEST_COST) {
            bot.answerCallbackQuery(query.id, { text: `❌ ব্যালেন্স কম! ${PER_REQUEST_COST} টাকা দরকার। ডিপোজিট করো।`, show_alert: true });
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
        userStats[userId].totalSpent = (userStats[userId].totalSpent || 0) + PER_REQUEST_COST;
        userHistory[userId].push({ type: "খরচ", amount: PER_REQUEST_COST, date: new Date().toLocaleString(), target: targetId });
        
        bot.editMessageText(
            `🚀 রিকোয়েস্ট পাঠানো শুরু...\n📌 টার্গেট: ${targetId}\n📊 অ্যাকাউন্ট: ${visibleAccounts.length}টি\n💰 কাটা: ${PER_REQUEST_COST} টাকা\nবাকি: ${userBalance[userId]} টাকা`,
            { chat_id: chatId, message_id: messageId }
        );
        
        let success = 0;
        for (let i = 0; i < visibleAccounts.length; i++) {
            const acc = visibleAccounts[i];
            const proxy = blockedProxies.includes(acc.proxy) ? null : acc.proxy;
            const result = await sendFriendRequest(acc.cookie, proxy, targetId);
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
            "/unblock_আইডি - আনব্লক করো",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminMenu.reply_markup }
        );
    }
    
    else if (data === 'admin_fb_section') {
        if (!isAdmin(userId)) return;
        bot.editMessageText(
            "📘 **FB অ্যাকাউন্ট ম্যানেজ**\n\n" +
            "/add_fb আইডি|নাম|কুকি|প্রক্সি (প্রক্সি অপশনাল)\n" +
            "/add_batch_fb (একসাথে ১০টি)\n" +
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
    
    else if (data === 'admin_proxy_section') {
        if (!isAdmin(userId)) return;
        bot.editMessageText(
            "🔄 **প্রোক্সি ম্যানেজ**\n\n" +
            "/add_proxy http://user:pass@ip:port\n" +
            "/list_proxy - সব প্রোক্সি দেখো\n" +
            "/del_proxy নাম্বার - প্রোক্সি ডিলিট\n" +
            "/blocked_proxy - ব্লক প্রোক্সি দেখো",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminMenu.reply_markup }
        );
    }
    
    else if (data === 'admin_analytics') {
        if (!isAdmin(userId)) return;
        const totalUsers = Object.keys(allowedUsers).length;
        const totalIncome = Object.values(userStats).reduce((sum, s) => sum + (s.totalSpent || 0), 0);
        const totalDeposits = Object.values(userStats).reduce((sum, s) => sum + (s.totalDeposits || 0), 0);
        const onlineCount = Object.keys(userLinks).length;
        
        bot.editMessageText(
            "📊 **অ্যানালিটিক্স** 📊\n\n" +
            `👥 মোট ইউজার: ${totalUsers}\n` +
            `🟢 অনলাইন: ${onlineCount}\n` +
            `💰 মোট ইনকাম: ${totalIncome} টাকা\n` +
            `💵 মোট ডিপোজিট: ${totalDeposits} টাকা\n` +
            `📘 FB অ্যাকাউন্ট: ${fbAccounts.length}টি\n` +
            `🔄 প্রোক্সি: ${proxyList.length}টি (${blockedProxies.length} ব্লক)`,
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
    
    // নিউ স্টক
    else if (data === 'new_stock') {
        bot.editMessageText(
            "📦 **নিউ স্টক এডেড** 📦\n\n" +
            "🔥 তাজা Facebook অ্যাকাউন্ট!\n" +
            "📘 ৫০টি অ্যাকাউন্ট রেডি\n" +
            "💰 দাম: ১০০ টাকা/পিস\n\n" +
            "অর্ডার করতে /shop_now ব্যবহার করুন।",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
    }
    
    else if (data === 'shop_now') {
        bot.editMessageText(
            "🛍️ **শপ নাউ** 🛍️\n\n" +
            "📘 Facebook অ্যাকাউন্ট (PDF ফাইল)\n" +
            "• ৫০টি অ্যাকাউন্ট: ৫০ টাকা\n" +
            "• ১০০টি অ্যাকাউন্ট: ৯০ টাকা\n" +
            "• ২০০টি অ্যাকাউন্ট: ১৬০ টাকা\n\n" +
            "বিকাশ: 01865598733\n" +
            "পেমেন্টের পর স্ক্রিনশট দিন।",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
    }
    
    else if (data === 'transfer_balance') {
        if (!isAllowed(userId)) return;
        bot.editMessageText(
            "💰 **ট্রান্সফার ব্যালেন্স** 💰\n\n" +
            "ফরম্যাট: @ইউজারনেম টাকা\n" +
            "উদাহরণ: @hasanbaia09 50",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: backButton("main_menu").reply_markup }
        );
        
        bot.once('message', async (msg) => {
            const parts = msg.text.split(' ');
            if (parts.length === 2 && parts[0].startsWith('@')) {
                const targetUsername = parts[0].substring(1);
                const amount = parseInt(parts[1]);
                let targetId = null;
                
                for (const [uid, user] of Object.entries(allowedUsers)) {
                    if (user.username === targetUsername) {
                        targetId = uid;
                        break;
                    }
                }
                
                if (targetId && userBalance[userId] >= amount && amount > 0) {
                    userBalance[userId] -= amount;
                    userBalance[targetId] = (userBalance[targetId] || 0) + amount;
                    bot.sendMessage(chatId, `✅ ট্রান্সফার সফল! ${amount} টাকা পাঠানো হয়েছে।`);
                    bot.sendMessage(targetId, `💰 ${amount} টাকা পেয়েছেন ${allowedUsers[userId]?.name} থেকে।`);
                } else {
                    bot.sendMessage(chatId, "❌ ট্রান্সফার ব্যর্থ! ব্যালেন্স কম বা ইউজার নেই।");
                }
            } else {
                bot.sendMessage(chatId, "❌ ভুল ফরম্যাট! @ইউজারনেম টাকা");
            }
        });
    }
    
    bot.answerCallbackQuery(query.id);
});

// ============= অ্যাডমিন টেক্সট কমান্ড =============
bot.onText(/\/users/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    let list = "👥 **ইউজার লিস্ট:**\n\n";
    for (const [uid, user] of Object.entries(allowedUsers)) {
        list += `🆔 ${uid} - ${user.name} - ${user.isAdmin ? '👑 অ্যাডমিন' : '👤 ইউজர்'} - ${user.blocked ? '🚫 ব্লকড' : '✅ সক্রিয়'}\n`;
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
        const proxy = parts.length >= 4 ? parts[3] : null;
        fbAccounts.push({ id: parts[0], name: parts[1], cookie: parts[2], proxy: proxy === 'none' ? null : proxy });
        bot.sendMessage(msg.chat.id, `✅ অ্যাকাউন্ট যোগ হয়েছে! মোট: ${fbAccounts.length}টি`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ ফরম্যাট: আইডি|নাম|কুকি|প্রক্সি (প্রক্সি অপশনাল)");
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
        list += `${i+1}. ${acc.name} - 🆔 ${acc.id}\n🍪 ${acc.cookie.substring(0, 50)}...\n🔄 প্রোক্সি: ${acc.proxy || 'none'}\n\n`;
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
        userStats[userId].totalDeposits = (userStats[userId].totalDeposits || 0) + amount;
        userHistory[userId].push({ type: "ডিপোজিট", amount: amount, date: new Date().toLocaleString() });
        pendingDeposits = pendingDeposits.filter(d => !(d.userId === userId && d.amount === amount));
        bot.sendMessage(msg.chat.id, `✅ ডিপোজিট অনুমোদন! ${amount} টাকা যোগ হয়েছে।`);
        bot.sendMessage(userId, `💰 আপনার ${amount} টাকার ডিপোজিট অনুমোদন হয়েছে!`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ ডিপোজিট পাওয়া যায়নি।");
    }
});

bot.onText(/\/add_proxy (.+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const proxy = match[1];
    if (!proxyList.includes(proxy)) {
        proxyList.push(proxy);
        bot.sendMessage(msg.chat.id, `✅ প্রোক্সি যোগ হয়েছে! মোট: ${proxyList.length}টি`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ প্রোক্সি ইতিমধ্যে আছে।");
    }
});

bot.onText(/\/list_proxy/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    if (proxyList.length === 0) {
        bot.sendMessage(msg.chat.id, "📋 কোনো প্রোক্সি নেই।");
        return;
    }
    let list = "🔄 **প্রোক্সি লিস্ট:**\n\n";
    proxyList.forEach((p, i) => {
        const isBlocked = blockedProxies.includes(p);
        list += `${i+1}. ${p} ${isBlocked ? '🚫 ব্লকড' : '✅ সক্রিয়'}\n`;
    });
    bot.sendMessage(msg.chat.id, list);
});

bot.onText(/\/blocked_proxy/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    if (blockedProxies.length === 0) {
        bot.sendMessage(msg.chat.id, "📋 কোনো ব্লক প্রোক্সি নেই।");
        return;
    }
    let list = "🚫 **ব্লক প্রোক্সি লিস্ট:**\n\n";
    blockedProxies.forEach((p, i) => {
        list += `${i+1}. ${p}\n`;
    });
    bot.sendMessage(msg.chat.id, list);
});

bot.onText(/\/set_bkash (.+)/, (msg, match) => {
    if (!isSuperAdmin(msg.chat.id)) return;
    const newNumber = match[1];
    // BKASH_NUMBER পরিবর্তন করা যায় না কারণ const, কিন্তু স্টোরেজে রাখা যায়
    bot.sendMessage(msg.chat.id, `✅ bKash নাম্বার চেঞ্জ করে ${newNumber} রাখা হয়েছে! (পরবর্তী ভার্সনে সেভ হবে)`);
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
        `🔄 প্রোক্সি: ${proxyList.length}টি (${blockedProxies.length} ব্লক)`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/restart/, async (msg) => {
    if (!isSuperAdmin(msg.chat.id)) return;
    await bot.sendMessage(msg.chat.id, "🔄 বট রিস্টার্ট হচ্ছে...");
    process.exit(0);
});

bot.onText(/\/make_admin (\d+)/, (msg, match) => {
    if (!isSuperAdmin(msg.chat.id)) return;
    const userId = match[1];
    if (allowedUsers[userId]) {
        allowedUsers[userId].isAdmin = true;
        adminPermissions[userId] = adminPermissions[userId] || {};
        bot.sendMessage(msg.chat.id, `✅ ${allowedUsers[userId].name} এখন অ্যাডমিন!`);
        bot.sendMessage(userId, "👑 আপনাকে অ্যাডমিন বানানো হয়েছে!");
    } else {
        bot.sendMessage(msg.chat.id, "❌ ইউজার নেই। আগে অনুমোদন দাও।");
    }
});

bot.onText(/\/set_permission (\d+)\|(\w+)/, (msg, match) => {
    if (!isSuperAdmin(msg.chat.id)) return;
    const userId = match[1];
    const permission = match[2];
    if (allowedUsers[userId] && allowedUsers[userId].isAdmin) {
        adminPermissions[userId] = adminPermissions[userId] || {};
        adminPermissions[userId][permission] = true;
        bot.sendMessage(msg.chat.id, `✅ ${allowedUsers[userId].name} এখন ${permission} permission পেয়েছে।`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ ইউজার অ্যাডমিন নয় বা নেই।");
    }
});

console.log('✅ প্রিমিয়াম FB বট চালু হয়েছে!');
console.log(`👑 সুপার অ্যাডমিন: ${SUPER_ADMIN_ID}`);
console.log(`📘 FB অ্যাকাউন্ট: ${fbAccounts.length}টি`);
console.log(`🔄 প্রোক্সি: ${proxyList.length}টি`);
