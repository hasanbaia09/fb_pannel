const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('🌟 FB Admin Panel Bot is running!');
});

app.listen(3000, () => {
    console.log('✅ Server started on port 3000');
});

const TelegramBot = require('node-telegram-bot-api');

// ============= কনফিগারেশন =============
const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';  //8772316564:AAF6Buvm_XAT3QyClTNKp9nVuop2KSVSb0U
const MASTER_ADMIN_ID = 'YOUR_TELEGRAM_ID'; // 7659779887

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ============= ডাটাবেস =============
let allowedUsers = {};      // { user_id: { name, approved, link, isAdmin, blocked, visibleCount } }
let pendingUsers = [];       // অনুমতি চাওয়া ইউজারদের লিস্ট
let fbAccounts = [];         // ফেসবুক অ্যাকাউন্টের কুকি (সম্পূর্ণ লিস্ট, শুধু অ্যাডমিন দেখবে)

// ইউজার কতোগুলো অ্যাকাউন্ট দেখতে পাবে (ডিফল্ট ৩০)
const DEFAULT_VISIBLE_COUNT = 30;

// ============= স্টার্টিং এ FB অ্যাকাউন্ট লোড =============
const DEFAULT_ACCOUNTS = [
    {
        id: "61572065871152",
        name: "📘 Account 1",
        cookie: "datr=QLbUaeSnpG512iVwQ7BwPrQb; sb=QLbUaXMDItmSRbViC0das8O8; c_user=61572065871152; xs=13%3AHaTcUYJHIKezMg%3A2%3A1775547993%3A-1%3A-1"
    },
    {
        id: "61572102352313",
        name: "📘 Account 2",
        cookie: "datr=Z8DUaavuKPkq27JxUxTrg5-7; sb=a8DUaXm1HmM0UWjPMZjCrJws; c_user=61572102352313; xs=40%3A-fmA0wokeyoufg%3A2%3A1775550581%3A-1%3A-1"
    }
];
fbAccounts = [...DEFAULT_ACCOUNTS];

// ============= ফাংশন =============
function randomDelay() {
    let min = 4, max = 7;
    return (Math.random() * (max - min) + min) * 1000;
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
                'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: params.toString()
        });
        const text = await response.text();
        return text.includes('success') || text.includes('confirm');
    } catch(e) {
        return false;
    }
}

// ইউজারের জন্য ভিজিবল অ্যাকাউন্ট লিস্ট বের করা
function getUserVisibleAccounts(userId) {
    const user = allowedUsers[userId];
    const visibleCount = user?.visibleCount || DEFAULT_VISIBLE_COUNT;
    return fbAccounts.slice(0, visibleCount);
}

// ============= চেক ফাংশন =============
function isMasterAdmin(userId) {
    return userId.toString() === MASTER_ADMIN_ID.toString();
}

function isAdmin(userId) {
    return isMasterAdmin(userId) || (allowedUsers[userId] && allowedUsers[userId].isAdmin === true);
}

function isAllowed(userId) {
    return allowedUsers[userId] && allowedUsers[userId].approved === true && allowedUsers[userId].blocked !== true;
}

// ============= মেনু বাটন =============

// সাধারণ ইউজারের মেনু
function getUserMenu(userId) {
    const visibleAccounts = getUserVisibleAccounts(userId);
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📝 লিংক যোগ করুন", callback_data: "add_link" }],
                [{ text: "🚀 রিকোয়েস্ট পাঠান", callback_data: "send_req" }],
                [{ text: "📊 স্ট্যাটাস", callback_data: "user_status" }],
                [{ text: "❓ হেল্প", callback_data: "help" }]
            ]
        }
    };
}

// অ্যাডমিন মেনু (সম্পূর্ণ কন্ট্রোল)
const adminMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "👥 ইউজার লিস্ট", callback_data: "admin_users" }],
            [{ text: "➕ FB অ্যাকাউন্ট যোগ", callback_data: "admin_add_fb" }],
            [{ text: "📋 FB অ্যাকাউন্ট লিস্ট", callback_data: "admin_list_fb" }],
            [{ text: "🗑️ FB অ্যাকাউন্ট ডিলিট", callback_data: "admin_del_fb" }],
            [{ text: "✅ পেন্ডিং ইউজার", callback_data: "admin_pending" }],
            [{ text: "👑 অ্যাডমিন বানাও", callback_data: "admin_make_admin" }],
            [{ text: "🚫 ইউজার ব্লক", callback_data: "admin_block_user" }],
            [{ text: "🔓 ইউজার আনব্লক", callback_data: "admin_unblock_user" }],
            [{ text: "🔢 ভিজিবল কাউন্ট সেট", callback_data: "admin_set_visible" }],
            [{ text: "🔙 মেইন মেনু", callback_data: "main_menu" }]
        ]
    }
};

// ============= টেলিগ্রাম কমান্ড =============

// /start কমান্ড
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = chatId.toString();
    const firstName = msg.from.first_name || "ভাই";
    const username = msg.from.username || "N/A";
    
    // যদি মাস্টার অ্যাডমিন হয়
    if (isMasterAdmin(userId)) {
        bot.sendMessage(chatId, 
            "👑 **মাস্টার অ্যাডমিন প্যানেলে স্বাগতম!** 👑\n\n" +
            `📊 মোট FB অ্যাকাউন্ট: ${fbAccounts.length}টি\n` +
            `👥 অনুমোদিত ইউজার: ${Object.keys(allowedUsers).length}টি\n` +
            `⏳ পেন্ডিং ইউজার: ${pendingUsers.length}টি\n\n` +
            "নিচের মেনু থেকে অপশন নাও:",
            { parse_mode: 'Markdown', ...adminMenu }
        );
        return;
    }
    
    // যদি অ্যাডমিন হয় (মাস্টার ছাড়া অন্য অ্যাডমিন)
    if (isAdmin(userId)) {
        bot.sendMessage(chatId, 
            "👑 **অ্যাডমিন প্যানেলে স্বাগতম!** 👑\n\n" +
            "নিচের মেনু থেকে অপশন নাও:",
            { parse_mode: 'Markdown', ...adminMenu }
        );
        return;
    }
    
    // যদি ইতিমধ্যে অনুমতি পেয়ে থাকে
    if (isAllowed(userId)) {
        const visibleCount = allowedUsers[userId]?.visibleCount || DEFAULT_VISIBLE_COUNT;
        const visibleAccounts = getUserVisibleAccounts(userId);
        bot.sendMessage(chatId, 
            `🌟 হ্যালো ${firstName}! 🌟\n\n` +
            `🤖 **প্রিমিয়াম FB প্যানেল বট** এ স্বাগতম!\n\n` +
            `📊 **পরিসংখ্যান:**\n` +
            `┏━━━━━━━━━━━━━━━━━━┓\n` +
            `┃ ✅ স্ট্যাটাস: অনুমোদিত\n` +
            `┃ 📘 সক্রিয় অ্যাকাউন্ট: ${visibleAccounts.length}/${fbAccounts.length}\n` +
            `┃ ⏱️ ডেলি টাইম: ৪-৭ সেকেন্ড\n` +
            `┗━━━━━━━━━━━━━━━━━━┛\n\n` +
            `🔽 নিচের মেনু ব্যবহার করো 🔽`,
            { parse_mode: 'Markdown', ...getUserMenu(userId) }
        );
        return;
    }
    
    // নতুন ইউজার - অ্যাডমিনকে নোটিফিকেশন পাঠাও
    const pendingId = Date.now();
    pendingUsers.push({
        id: pendingId,
        userId: userId,
        name: firstName,
        username: username,
        timestamp: new Date().toLocaleString()
    });
    
    bot.sendMessage(chatId, 
        `⏳ হ্যালো ${firstName}! ⏳\n\n` +
        `আপনার অনুরোধ অ্যাডমিনের কাছে পাঠানো হয়েছে।\n` +
        `অনুমোদন পেলে আবার /start দিন।\n\n` +
        `ধন্যবাদ! 🙏`
    );
    
    // সকল অ্যাডমিনকে নোটিফিকেশন পাঠাও
    for (const [uid, data] of Object.entries(allowedUsers)) {
        if (data.isAdmin === true || uid === MASTER_ADMIN_ID) {
            bot.sendMessage(uid, 
                `🆕 **নতুন ইউজার অনুরোধ!** 🆕\n\n` +
                `👤 নাম: ${firstName}\n` +
                `🆔 আইডি: ${userId}\n` +
                `📛 ইউজারনেম: @${username}\n` +
                `🕐 সময়: ${new Date().toLocaleString()}\n\n` +
                `/approve_${userId} - অনুমোদন দিতে\n` +
                `/reject_${userId} - বাতিল করতে`,
                { parse_mode: 'Markdown' }
            );
        }
    }
});

// অ্যাডমিন কমান্ড - ইউজার অনুমোদন
bot.onText(/\/approve_(\d+)/, async (msg, match) => {
    const adminId = msg.chat.id;
    if (!isAdmin(adminId)) return;
    
    const userId = match[1];
    const pending = pendingUsers.find(p => p.userId === userId);
    
    if (!pending) {
        bot.sendMessage(adminId, `❌ ইউজার ${userId} পাওয়া যায়নি।`);
        return;
    }
    
    allowedUsers[userId] = {
        name: pending.name,
        approved: true,
        isAdmin: false,
        blocked: false,
        approvedAt: new Date().toLocaleString(),
        visibleCount: DEFAULT_VISIBLE_COUNT,
        link: null
    };
    
    pendingUsers = pendingUsers.filter(p => p.userId !== userId);
    
    bot.sendMessage(adminId, `✅ ${pending.name} (${userId}) কে অনুমোদন দেওয়া হয়েছে।`);
    bot.sendMessage(userId, 
        `✅ **অভিনন্দন!** ✅\n\n` +
        `আপনার অনুরোধ অনুমোদন করা হয়েছে।\n` +
        `এখন /start দিয়ে বট ব্যবহার করতে পারেন৷\n\n` +
        `শুভকামনা! 🎉`,
        { parse_mode: 'Markdown' }
    );
});

// ইউজার বাতিল
bot.onText(/\/reject_(\d+)/, async (msg, match) => {
    const adminId = msg.chat.id;
    if (!isAdmin(adminId)) return;
    
    const userId = match[1];
    const pending = pendingUsers.find(p => p.userId === userId);
    
    if (!pending) {
        bot.sendMessage(adminId, `❌ ইউজার ${userId} পাওয়া যায়নি।`);
        return;
    }
    
    pendingUsers = pendingUsers.filter(p => p.userId !== userId);
    bot.sendMessage(adminId, `❌ ${pending.name} (${userId}) কে বাতিল করা হয়েছে।`);
});

// ============= কোলব্যাক হ্যান্ডলার =============
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = chatId.toString();
    const data = query.data;
    const messageId = query.message.message_id;
    
    // === অ্যাডমিন মেনু অপশন ===
    
    // ইউজার লিস্ট
    if (data === 'admin_users') {
        if (!isAdmin(userId)) return;
        
        const users = Object.entries(allowedUsers);
        if (users.length === 0) {
            bot.editMessageText("📋 কোনো অনুমোদিত ইউজার নেই।", {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: adminMenu.reply_markup
            });
        } else {
            let msg = "👥 **ইউজার লিস্ট:**\n\n";
            users.forEach(([uid, u], i) => {
                msg += `${i+1}. 👤 ${u.name}\n`;
                msg += `   🆔 ${uid}\n`;
                msg += `   👑 ${u.isAdmin ? 'অ্যাডমিন' : 'ইউজার'}\n`;
                msg += `   🚫 ${u.blocked ? 'ব্লকড' : 'সক্রিয়'}\n`;
                msg += `   🔢 দেখছে: ${u.visibleCount || DEFAULT_VISIBLE_COUNT}টি\n`;
                msg += `   📅 ${u.approvedAt}\n\n`;
            });
            bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
        }
    }
    
    // পেন্ডিং ইউজার
    else if (data === 'admin_pending') {
        if (!isAdmin(userId)) return;
        
        if (pendingUsers.length === 0) {
            bot.editMessageText("📋 কোনো পেন্ডিং ইউজার নেই।", {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: adminMenu.reply_markup
            });
        } else {
            let msg = "📋 **পেন্ডিং ইউজার লিস্ট:**\n\n";
            pendingUsers.forEach((p, i) => {
                msg += `${i+1}. 👤 ${p.name}\n`;
                msg += `   🆔 ${p.userId}\n`;
                msg += `   🕐 ${p.timestamp}\n`;
                msg += `   📛 @${p.username}\n`;
                msg += `   💡 /approve_${p.userId} দিয়ে অনুমোদন দাও\n\n`;
            });
            bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
        }
    }
    
    // অ্যাডমিন বানানো
    else if (data === 'admin_make_admin') {
        if (!isAdmin(userId)) return;
        
        bot.editMessageText(
            "👑 **অ্যাডমিন বানানোর নিয়ম** 👑\n\n" +
            "ইউজারের আইডি পাঠান যাকে অ্যাডমিন বানাতে চাও।\n\n" +
            "উদাহরণ: `7123456789`",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
        
        bot.once('message', (msg) => {
            const targetId = msg.text.trim();
            if (allowedUsers[targetId]) {
                allowedUsers[targetId].isAdmin = true;
                bot.sendMessage(chatId, `✅ ${allowedUsers[targetId].name} (${targetId}) এখন অ্যাডমিন!`, { reply_markup: adminMenu.reply_markup });
                bot.sendMessage(targetId, "👑 আপনাকে অ্যাডমিন বানানো হয়েছে! /start দিয়ে অ্যাডমিন প্যানেল দেখুন।");
            } else {
                bot.sendMessage(chatId, `❌ ইউজার ${targetId} পাওয়া যায়নি। আগে অনুমোদন দিন।`, { reply_markup: adminMenu.reply_markup });
            }
        });
    }
    
    // ইউজার ব্লক
    else if (data === 'admin_block_user') {
        if (!isAdmin(userId)) return;
        
        bot.editMessageText(
            "🚫 **ইউজার ব্লক করার নিয়ম** 🚫\n\n" +
            "ইউজারের আইডি পাঠান যাকে ব্লক করতে চাও।",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
        
        bot.once('message', (msg) => {
            const targetId = msg.text.trim();
            if (allowedUsers[targetId]) {
                allowedUsers[targetId].blocked = true;
                bot.sendMessage(chatId, `✅ ${allowedUsers[targetId].name} (${targetId}) কে ব্লক করা হয়েছে।`, { reply_markup: adminMenu.reply_markup });
                bot.sendMessage(targetId, "🚫 আপনি ব্লক হয়ে গেছেন! বিস্তারিত জানতে অ্যাডমিনের সাথে যোগাযোগ করুন।");
            } else {
                bot.sendMessage(chatId, `❌ ইউজার ${targetId} পাওয়া যায়নি।`, { reply_markup: adminMenu.reply_markup });
            }
        });
    }
    
    // ইউজার আনব্লক
    else if (data === 'admin_unblock_user') {
        if (!isAdmin(userId)) return;
        
        bot.editMessageText(
            "🔓 **ইউজার আনব্লক করার নিয়ম** 🔓\n\n" +
            "ইউজারের আইডি পাঠান যাকে আনব্লক করতে চাও।",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
        
        bot.once('message', (msg) => {
            const targetId = msg.text.trim();
            if (allowedUsers[targetId]) {
                allowedUsers[targetId].blocked = false;
                bot.sendMessage(chatId, `✅ ${allowedUsers[targetId].name} (${targetId}) কে আনব্লক করা হয়েছে।`, { reply_markup: adminMenu.reply_markup });
                bot.sendMessage(targetId, "🔓 আপনি আনব্লক হয়েছেন! এখন আবার বট ব্যবহার করতে পারবেন।");
            } else {
                bot.sendMessage(chatId, `❌ ইউজার ${targetId} পাওয়া যায়নি।`, { reply_markup: adminMenu.reply_markup });
            }
        });
    }
    
    // ভিজিবল কাউন্ট সেট (ইউজার কতো অ্যাকাউন্ট দেখবে)
    else if (data === 'admin_set_visible') {
        if (!isAdmin(userId)) return;
        
        bot.editMessageText(
            "🔢 **ইউজারের ভিজিবল অ্যাকাউন্ট সেট করুন** 🔢\n\n" +
            "ফরম্যাট: `আইডি|কাউন্ট`\n" +
            "উদাহরণ: `7123456789|30`\n\n" +
            "এটি সেট করলে ঐ ইউজার কেবল নির্ধারিত সংখ্যক অ্যাকাউন্ট দেখতে পাবে।\n" +
            "বাকি অ্যাকাউন্ট লুকানো থাকবে।",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
        
        bot.once('message', (msg) => {
            const parts = msg.text.split('|');
            if (parts.length === 2) {
                const targetId = parts[0];
                const count = parseInt(parts[1]);
                if (allowedUsers[targetId] && count >= 1 && count <= fbAccounts.length) {
                    allowedUsers[targetId].visibleCount = count;
                    bot.sendMessage(chatId, `✅ ${allowedUsers[targetId].name} এখন ${count}টি অ্যাকাউন্ট দেখতে পাবে।`, { reply_markup: adminMenu.reply_markup });
                } else {
                    bot.sendMessage(chatId, `❌ ভুল আইডি বা কাউন্ট! কাউন্ট 1-${fbAccounts.length} এর মধ্যে হতে হবে।`, { reply_markup: adminMenu.reply_markup });
                }
            } else {
                bot.sendMessage(chatId, "❌ ভুল ফরম্যাট!", { reply_markup: adminMenu.reply_markup });
            }
        });
    }
    
    // FB অ্যাকাউন্ট যোগ
    else if (data === 'admin_add_fb') {
        if (!isAdmin(userId)) return;
        
        bot.editMessageText(
            "🔧 **FB অ্যাকাউন্ট যোগ করুন** 🔧\n\n" +
            "নিচের ফরম্যাটে পাঠান:\n\n" +
            "`আইডি|নাম|কুকি`\n\n" +
            "উদাহরণ:\n" +
            "`61572065871152|Account 4|datr=xxx; c_user=xxx; xs=xxx`",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
        
        bot.once('message', async (msg) => {
            const text = msg.text;
            const parts = text.split('|');
            if (parts.length === 3) {
                fbAccounts.push({
                    id: parts[0],
                    name: parts[1],
                    cookie: parts[2]
                });
                bot.sendMessage(chatId, `✅ অ্যাকাউন্ট যোগ হয়েছে! মোট: ${fbAccounts.length}টি`, { reply_markup: adminMenu.reply_markup });
            } else {
                bot.sendMessage(chatId, "❌ ভুল ফরম্যাট! আইডি|নাম|কুকি ফরম্যাটে দাও।", { reply_markup: adminMenu.reply_markup });
            }
        });
    }
    
    // FB অ্যাকাউন্ট লিস্ট (শুধু অ্যাডমিন দেখতে পাবে)
    else if (data === 'admin_list_fb') {
        if (!isAdmin(userId)) return;
        
        if (fbAccounts.length === 0) {
            bot.editMessageText("📋 কোনো FB অ্যাকাউন্ট নেই।", {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: adminMenu.reply_markup
            });
        } else {
            let msg = "📘 **সম্পূর্ণ FB অ্যাকাউন্ট লিস্ট (অ্যাডমিন only):**\n\n";
            fbAccounts.forEach((acc, i) => {
                msg += `${i+1}. ${acc.name}\n`;
                msg += `   🆔 ${acc.id}\n`;
                msg += `   🍪 ${acc.cookie.substring(0, 50)}...\n\n`;
            });
            bot.editMessageText(msg, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
        }
    }
    
    // FB অ্যাকাউন্ট ডিলিট
    else if (data === 'admin_del_fb') {
        if (!isAdmin(userId)) return;
        
        let msg = "🗑️ **নম্বর দাও কোন অ্যাকাউন্ট ডিলিট করবে:**\n\n";
        fbAccounts.forEach((acc, i) => {
            msg += `${i+1}. ${acc.name}\n`;
        });
        bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
        });
        
        bot.once('message', (msg) => {
            const num = parseInt(msg.text);
            if (num >= 1 && num <= fbAccounts.length) {
                const removed = fbAccounts.splice(num-1, 1);
                bot.sendMessage(chatId, `✅ ${removed[0].name} ডিলিট করা হয়েছে। বাকি: ${fbAccounts.length}টি`, { reply_markup: adminMenu.reply_markup });
            } else {
                bot.sendMessage(chatId, "❌ ভুল নম্বর! আবার চেষ্টা করুন।", { reply_markup: adminMenu.reply_markup });
            }
        });
    }
    
    // মেইন মেনু
    else if (data === 'main_menu') {
        if (isAdmin(userId)) {
            bot.editMessageText(
                "👑 **অ্যাডমিন প্যানেল** 👑\n\n" +
                "নিচের মেনু থেকে অপশন নাও:",
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminMenu.reply_markup }
            );
        } else {
            bot.editMessageText(
                "🌟 **মেইন মেনু** 🌟\n\n" +
                "নিচের বাটন থেকে কাজ শুরু করো:",
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getUserMenu(userId) }
            );
        }
    }
    
    // === ইউজার মেনু অপশন ===
    
    else if (data === 'user_status') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        const visibleAccounts = getUserVisibleAccounts(userId);
        const user = allowedUsers[userId];
        bot.editMessageText(
            `📊 **ইউজার স্ট্যাটাস** 📊\n\n` +
            `┏━━━━━━━━━━━━━━━━━━━━━━┓\n` +
            `┃ ✅ স্ট্যাটাস: অনুমোদিত\n` +
            `┃ 📘 দেখতে পাচ্ছেন: ${visibleAccounts.length}/${fbAccounts.length}টি\n` +
            `┃ 🔒 লুকানো: ${fbAccounts.length - visibleAccounts.length}টি\n` +
            `┃ ⏱️ ডেলি টাইম: ৪-৭ সেকেন্ড\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
            `💡 প্রশাসক আরও অ্যাকাউন্ট আনলক করে দিতে পারেন।`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getUserMenu(userId) }
        );
    }
    
    else if (data === 'help') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        bot.editMessageText(
            "❓ **হেল্প গাইড** ❓\n\n" +
            "1️⃣ 📝 লিংক যোগ করুন বাটনে ক্লিক করো\n" +
            "2️⃣ ফেসবুক প্রোফাইলের লিংক দাও\n" +
            "3️⃣ 🚀 রিকোয়েস্ট পাঠান বাটনে ক্লিক করো\n" +
            "4️⃣ ফলাফলের জন্য অপেক্ষা করো\n\n" +
            "📊 স্ট্যাটাস বাটনে চাপলে দেখতে পারবে কতো অ্যাকাউন্ট সক্রিয় আছে।",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getUserMenu(userId) }
        );
    }
    
    else if (data === 'add_link') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        bot.editMessageText(
            "🔗 **ফেসবুক লিংক পাঠান** 🔗\n\n" +
            "উদাহরণ: `https://facebook.com/username`",
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
        bot.once('message', (msg) => {
            const link = msg.text;
            if (!allowedUsers[userId]) allowedUsers[userId] = {};
            allowedUsers[userId].link = link;
            bot.sendMessage(chatId, "✅ লিংক সংরক্ষিত হয়েছে! 'রিকোয়েস্ট পাঠান' বাটন চাপো।", getUserMenu(userId));
        });
    }
    
    else if (data === 'send_req') {
        if (!isAllowed(userId)) {
            bot.answerCallbackQuery(query.id, { text: '❌ আপনার অনুমোদন নেই!', show_alert: true });
            return;
        }
        
        const link = allowedUsers[userId]?.link;
        if (!link) {
            bot.answerCallbackQuery(query.id, { text: '❌ আগে লিংক যোগ করুন!', show_alert: true });
            return;
        }
        
        let match = link.match(/facebook\.com\/([^\/?]+)/);
        if (!match) {
            bot.sendMessage(chatId, "❌ ভুল লিংক!", getUserMenu(userId));
            return;
        }
        
        const targetId = match[1];
        const visibleAccounts = getUserVisibleAccounts(userId);
        
        bot.editMessageText(
            `🚀 শুরু হচ্ছে... টার্গেট: ${targetId}\n📊 ব্যবহারযোগ্য অ্যাকাউন্ট: ${visibleAccounts.length}/${fbAccounts.length}`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
        
        let success = 0;
        for (let i = 0; i < visibleAccounts.length; i++) {
            const result = await sendFriendRequest(visibleAccounts[i].cookie, targetId);
            if (result) success++;
            bot.sendMessage(chatId, `${result ? '✅' : '❌'} ${visibleAccounts[i].name}`);
            if (i < visibleAccounts.length - 1) await sleep(randomDelay());
        }
        bot.sendMessage(chatId, `🎉 সম্পন্ন! ${success}/${visibleAccounts.length} সফল।`, getUserMenu(userId));
    }
    
    bot.answerCallbackQuery(query.id);
});

console.log('✅ অ্যাডমিন প্যানেল বট চালু হয়েছে!');
console.log(`👑 মাস্টার অ্যাডমিন আইডি: ${MASTER_ADMIN_ID}`);
console.log(`📘 মোট FB অ্যাকাউন্ট: ${fbAccounts.length}টি`);
