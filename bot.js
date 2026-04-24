const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('🌟 FB Admin Panel Bot is running!');
});

app.listen(3000, () => {
    console.log('✅ Server started on port 3000');
});

const TelegramBot = require('node-telegram-bot-api');

// ============= কনফিগারেশন (এখানে তোমার তথ্য দাও) =============
const BOT_TOKEN = '8772316564:AAF6Buvm_XAT3QyClTNKp9nVuop2KSVSb0U';
const MASTER_ADMIN_ID = '7659779887';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ============= ডাটাবেস =============
let allowedUsers = {};
let pendingUsers = [];
let fbAccounts = [];
let userLinks = {};

const DEFAULT_VISIBLE_COUNT = 30;

// ============= ডিফল্ট ফেসবুক অ্যাকাউন্ট =============
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

// ============= হেল্পার ফাংশন =============
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

function getUserVisibleAccounts(userId) {
    const user = allowedUsers[userId];
    const visibleCount = user?.visibleCount || DEFAULT_VISIBLE_COUNT;
    return fbAccounts.slice(0, visibleCount);
}

function isMasterAdmin(userId) {
    return userId.toString() === MASTER_ADMIN_ID.toString();
}

function isAdmin(userId) {
    return isMasterAdmin(userId) || (allowedUsers[userId] && allowedUsers[userId].isAdmin === true);
}

function isAllowed(userId) {
    return allowedUsers[userId] && allowedUsers[userId].approved === true && allowedUsers[userId].blocked !== true;
}

// ============= মেনু =============
function getUserMenu(userId) {
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

// ============= /start কমান্ড =============
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = chatId.toString();
    const firstName = msg.from.first_name || "ভাই";
    const username = msg.from.username || "N/A";
    
    if (isMasterAdmin(userId)) {
        bot.sendMessage(chatId, 
            "👑 মাস্টার অ্যাডমিন প্যানেলে স্বাগতম!\n\n" +
            `📊 FB অ্যাকাউন্ট: ${fbAccounts.length}টি\n` +
            `👥 ইউজার: ${Object.keys(allowedUsers).length}টি\n` +
            `⏳ পেন্ডিং: ${pendingUsers.length}টি`,
            adminMenu
        );
        return;
    }
    
    if (isAdmin(userId)) {
        bot.sendMessage(chatId, "👑 অ্যাডমিন প্যানেলে স্বাগতম!", adminMenu);
        return;
    }
    
    if (isAllowed(userId)) {
        const visibleAccounts = getUserVisibleAccounts(userId);
        bot.sendMessage(chatId, 
            `🌟 হ্যালো ${firstName}!\n\n` +
            `✅ স্ট্যাটাস: অনুমোদিত\n` +
            `📘 সক্রিয় অ্যাকাউন্ট: ${visibleAccounts.length}/${fbAccounts.length}\n` +
            `⏱️ ডেলি টাইম: ৪-৭ সেকেন্ড`,
            getUserMenu(userId)
        );
        return;
    }
    
    pendingUsers.push({
        userId: userId,
        name: firstName,
        username: username,
        timestamp: new Date().toLocaleString()
    });
    
    bot.sendMessage(chatId, `⏳ হ্যালো ${firstName}! আপনার অনুরোধ অ্যাডমিনের কাছে পাঠানো হয়েছে। অনুমোদন পেলে আবার /start দিন।`);
    
    for (const [uid, data] of Object.entries(allowedUsers)) {
        if (data.isAdmin === true || uid === MASTER_ADMIN_ID) {
            bot.sendMessage(uid, `🆕 নতুন ইউজর: ${firstName}\n🆔 ${userId}\n/approve_${userId} দিয়ে অনুমোদন দাও`);
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
    bot.sendMessage(adminId, `✅ ${pending.name} কে অনুমোদন দেওয়া হয়েছে।`);
    bot.sendMessage(userId, `✅ আপনার অনুরোধ অনুমোদন করা হয়েছে! এখন /start দিয়ে বট ব্যবহার করুন।`);
});

bot.onText(/\/reject_(\d+)/, async (msg, match) => {
    const adminId = msg.chat.id;
    if (!isAdmin(adminId)) return;
    
    const userId = match[1];
    pendingUsers = pendingUsers.filter(p => p.userId !== userId);
    bot.sendMessage(adminId, `❌ ইউজার বাতিল করা হয়েছে।`);
});

// ============= কলব্যাক হ্যান্ডলার =============
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = chatId.toString();
    const data = query.data;
    const messageId = query.message.message_id;
    
    // অ্যাডমিন মেনু
    if (data === 'admin_users') {
        if (!isAdmin(userId)) return;
        let msg = "👥 ইউজার লিস্ট:\n\n";
        for (const [uid, u] of Object.entries(allowedUsers)) {
            msg += `👤 ${u.name}\n🆔 ${uid}\n👑 ${u.isAdmin ? 'অ্যাডমিন' : 'ইউজার'}\n🚫 ${u.blocked ? 'ব্লকড' : 'সক্রিয়'}\n\n`;
        }
        bot.editMessageText(msg || "কোনো ইউজার নেই।", { chat_id: chatId, message_id: messageId, reply_markup: adminMenu.reply_markup });
    }
    
    else if (data === 'admin_pending') {
        if (!isAdmin(userId)) return;
        let msg = "⏳ পেন্ডিং ইউজার:\n\n";
        for (const p of pendingUsers) {
            msg += `👤 ${p.name}\n🆔 ${p.userId}\n💡 /approve_${p.userId}\n\n`;
        }
        bot.editMessageText(msg || "কোনো পেন্ডিং ইউজার নেই।", { chat_id: chatId, message_id: messageId, reply_markup: adminMenu.reply_markup });
    }
    
    else if (data === 'admin_list_fb') {
        if (!isAdmin(userId)) return;
        let msg = "📘 FB অ্যাকাউন্ট লিস্ট:\n\n";
        fbAccounts.forEach((acc, i) => {
            msg += `${i+1}. ${acc.name}\n🆔 ${acc.id}\n🍪 ${acc.cookie.substring(0, 50)}...\n\n`;
        });
        bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, reply_markup: adminMenu.reply_markup });
    }
    
    else if (data === 'admin_add_fb') {
        if (!isAdmin(userId)) return;
        bot.editMessageText("🔧 ফরম্যাট: আইডি|নাম|কুকি\nউদাহরণ: 123|Acc1|datr=xxx", { chat_id: chatId, message_id: messageId });
        bot.once('message', (msg) => {
            const parts = msg.text.split('|');
            if (parts.length === 3) {
                fbAccounts.push({ id: parts[0], name: parts[1], cookie: parts[2] });
                bot.sendMessage(chatId, `✅ যোগ হয়েছে! মোট: ${fbAccounts.length}টি`, adminMenu);
            } else {
                bot.sendMessage(chatId, "❌ ভুল ফরম্যাট!", adminMenu);
            }
        });
    }
    
    else if (data === 'admin_del_fb') {
        if (!isAdmin(userId)) return;
        let msg = "🗑️ নম্বর দাও:\n";
        fbAccounts.forEach((acc, i) => msg += `${i+1}. ${acc.name}\n`);
        bot.editMessageText(msg, { chat_id: chatId, message_id: messageId });
        bot.once('message', (msg) => {
            const num = parseInt(msg.text);
            if (num >= 1 && num <= fbAccounts.length) {
                fbAccounts.splice(num-1, 1);
                bot.sendMessage(chatId, `✅ ডিলিট! বাকি: ${fbAccounts.length}টি`, adminMenu);
            } else {
                bot.sendMessage(chatId, "❌ ভুল নম্বর!", adminMenu);
            }
        });
    }
    
    else if (data === 'admin_make_admin') {
        if (!isAdmin(userId)) return;
        bot.editMessageText("👑 ইউজার আইডি পাঠান:", { chat_id: chatId, message_id: messageId });
        bot.once('message', (msg) => {
            const targetId = msg.text.trim();
            if (allowedUsers[targetId]) {
                allowedUsers[targetId].isAdmin = true;
                bot.sendMessage(chatId, `✅ অ্যাডমিন বানানো হয়েছে!`, adminMenu);
                bot.sendMessage(targetId, "👑 আপনাকে অ্যাডমিন বানানো হয়েছে!");
            } else {
                bot.sendMessage(chatId, "❌ ইউজার নেই। আগে অনুমোদন দাও।", adminMenu);
            }
        });
    }
    
    else if (data === 'admin_block_user') {
        if (!isAdmin(userId)) return;
        bot.editMessageText("🚫 ব্লক করার আইডি দাও:", { chat_id: chatId, message_id: messageId });
        bot.once('message', (msg) => {
            const targetId = msg.text.trim();
            if (allowedUsers[targetId]) {
                allowedUsers[targetId].blocked = true;
                bot.sendMessage(chatId, `✅ ব্লক করা হয়েছে।`, adminMenu);
                bot.sendMessage(targetId, "🚫 আপনি ব্লক হয়েছেন!");
            } else {
                bot.sendMessage(chatId, "❌ ইউজার নেই।", adminMenu);
            }
        });
    }
    
    else if (data === 'admin_unblock_user') {
        if (!isAdmin(userId)) return;
        bot.editMessageText("🔓 আনব্লক করার আইডি দাও:", { chat_id: chatId, message_id: messageId });
        bot.once('message', (msg) => {
            const targetId = msg.text.trim();
            if (allowedUsers[targetId]) {
                allowedUsers[targetId].blocked = false;
                bot.sendMessage(chatId, `✅ আনব্লক করা হয়েছে।`, adminMenu);
                bot.sendMessage(targetId, "🔓 আপনি আনব্লক হয়েছেন!");
            } else {
                bot.sendMessage(chatId, "❌ ইউজার নেই।", adminMenu);
            }
        });
    }
    
    else if (data === 'admin_set_visible') {
        if (!isAdmin(userId)) return;
        bot.editMessageText("🔢 ফরম্যাট: আইডি|কাউন্ট\nউদাহরণ: 123456789|20", { chat_id: chatId, message_id: messageId });
        bot.once('message', (msg) => {
            const parts = msg.text.split('|');
            if (parts.length === 2) {
                const targetId = parts[0];
                const count = parseInt(parts[1]);
                if (allowedUsers[targetId] && count >= 1 && count <= fbAccounts.length) {
                    allowedUsers[targetId].visibleCount = count;
                    bot.sendMessage(chatId, `✅ সেট করা হয়েছে!`, adminMenu);
                } else {
                    bot.sendMessage(chatId, `❌ ভুল! 1-${fbAccounts.length} এর মধ্যে দাও।`, adminMenu);
                }
            } else {
                bot.sendMessage(chatId, "❌ ভুল ফরম্যাট!", adminMenu);
            }
        });
    }
    
    else if (data === 'main_menu') {
        if (isAdmin(userId)) {
            bot.editMessageText("👑 অ্যাডমিন প্যানেল", { chat_id: chatId, message_id: messageId, reply_markup: adminMenu.reply_markup });
        } else {
            bot.editMessageText("🌟 মেইন মেনু", { chat_id: chatId, message_id: messageId, reply_markup: getUserMenu(userId).reply_markup });
        }
    }
    
    // ইউজার মেনু
    else if (data === 'user_status') {
        if (!isAllowed(userId)) return;
        const visible = getUserVisibleAccounts(userId);
        bot.editMessageText(`📊 স্ট্যাটাস:\nদেখতে পাচ্ছেন: ${visible.length}/${fbAccounts.length}টি\nলুকানো: ${fbAccounts.length - visible.length}টি`, { chat_id: chatId, message_id: messageId, reply_markup: getUserMenu(userId).reply_markup });
    }
    
    else if (data === 'help') {
        if (!isAllowed(userId)) return;
        bot.editMessageText("❓ হেল্প:\n1. লিংক যোগ করুন\n2. রিকোয়েস্ট পাঠান\n3. ফলাফল দেখুন", { chat_id: chatId, message_id: messageId, reply_markup: getUserMenu(userId).reply_markup });
    }
    
    else if (data === 'add_link') {
        if (!isAllowed(userId)) return;
        bot.editMessageText("🔗 ফেসবুক লিংক দাও:", { chat_id: chatId, message_id: messageId });
        bot.once('message', (msg) => {
            userLinks[userId] = msg.text;
            bot.sendMessage(chatId, "✅ লিংক সেভ!", getUserMenu(userId));
        });
    }
    
    else if (data === 'send_req') {
        if (!isAllowed(userId)) return;
        const link = userLinks[userId];
        if (!link) {
            bot.answerCallbackQuery(query.id, { text: '❌ আগে লিংক দাও!', show_alert: true });
            return;
        }
        
        const match = link.match(/facebook\.com\/([^\/?]+)/);
        if (!match) {
            bot.sendMessage(chatId, "❌ ভুল লিংক!", getUserMenu(userId));
            return;
        }
        
        const targetId = match[1];
        const visible = getUserVisibleAccounts(userId);
        bot.editMessageText(`🚀 শুরু... টার্গেট: ${targetId}\n📊 ব্যবহারযোগ্য: ${visible.length}/${fbAccounts.length}`, { chat_id: chatId, message_id: messageId });
        
        let success = 0;
        for (let i = 0; i < visible.length; i++) {
            const res = await sendFriendRequest(visible[i].cookie, targetId);
            if (res) success++;
            bot.sendMessage(chatId, `${res ? '✅' : '❌'} ${visible[i].name}`);
            if (i < visible.length - 1) await sleep(randomDelay());
        }
        bot.sendMessage(chatId, `🎉 সম্পন্ন! ${success}/${visible.length} সফল।`, getUserMenu(userId));
    }
    
    bot.answerCallbackQuery(query.id);
});

console.log('✅ প্রিমিয়াম অ্যাডমিন প্যানেল বট চালু!');
console.log(`👑 মাস্টার অ্যাডমিন: ${MASTER_ADMIN_ID}`);
console.log(`📘 FB অ্যাকাউন্ট: ${fbAccounts.length}টি`);
