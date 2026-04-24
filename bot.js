const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('✅ FB Bot is running');
});

app.listen(3000, () => {
    console.log('Server started on port 3000');
});

const TelegramBot = require('node-telegram-bot-api');

// ============= Render Env Variable =============
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = '7659779887';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ============= ডাটাবেস =============
let users = {};
let fbCookies = [];
let pendingUsers = [];

// ============= র‍্যান্ডম ডেলি ফাংশন (৪-৭ সেকেন্ড) =============
function randomDelay() {
    const min = 4;
    const max = 7;
    return (Math.random() * (max - min) + min) * 1000;
}

// ============= আসল FB রিকোয়েস্ট ফাংশন =============
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
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://www.facebook.com/'
            },
            body: params.toString()
        });
        
        const text = await response.text();
        return text.includes('success') || text.includes('confirm');
    } catch(e) {
        return false;
    }
}

// ============= মেনু বাটন (নিচে) =============
const mainMenu = {
    reply_markup: {
        keyboard: [
            ['📝 লিংক যোগ করুন', '🚀 রিকোয়েস্ট পাঠান'],
            ['👤 প্রোফাইল', '💰 ব্যালেন্স']
        ],
        resize_keyboard: true
    }
};

// ============= স্টার্ট =============
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = chatId.toString();
    const name = msg.from.first_name;

    if (userId === ADMIN_ID) {
        bot.sendMessage(chatId, 
            `👑 হ্যালো ${name} (অ্যাডমিন)\n\n📌 কমান্ড:\n/users - ইউজার লিস্ট\n/pending - পেন্ডিং ইউজার\n/addcookie কুকি - FB কুকি যোগ\n/listcookie - কুকি লিস্ট\n/approve আইডি - ইউজার অনুমোদন\n/stats - বট স্ট্যাটাস`);
        return;
    }

    if (users[userId] && users[userId].approved) {
        bot.sendMessage(chatId, `🌟 হ্যালো ${name}!\nস্বাগতম। নিচের মেনু ব্যবহার করো।`, mainMenu);
    } else {
        if (!users[userId]) {
            users[userId] = { name, approved: false };
            pendingUsers.push(userId);
            bot.sendMessage(ADMIN_ID, `🆕 নতুন ইউজার: ${name}\n🆔 ${userId}\n/approve ${userId} দিয়ে অনুমোদন দাও`);
        }
        bot.sendMessage(chatId, `⏳ হ্যালো ${name}! আপনার অনুরোধ অ্যাডমিনের কাছে পাঠানো হয়েছে। অনুমোদন পেলে আবার /start দিন।`);
    }
});

// ============= অ্যাডমিন: ইউজার অনুমোদন =============
bot.onText(/\/approve (\d+)/, (msg, match) => {
    if (msg.chat.id.toString() !== ADMIN_ID) return;
    const userId = match[1];
    if (users[userId]) {
        users[userId].approved = true;
        pendingUsers = pendingUsers.filter(id => id !== userId);
        bot.sendMessage(msg.chat.id, `✅ ${users[userId].name} অনুমোদিত।`);
        bot.sendMessage(userId, `✅ আপনি অনুমোদিত! এখন /start দিয়ে বট ব্যবহার করতে পারবেন।`);
    } else {
        bot.sendMessage(msg.chat.id, `❌ ইউজার ${userId} নেই।`);
    }
});

// ============= অ্যাডমিন: ইউজার লিস্ট =============
bot.onText(/\/users/, (msg) => {
    if (msg.chat.id.toString() !== ADMIN_ID) return;
    let list = "👥 ইউজার লিস্ট:\n\n";
    for (const [id, user] of Object.entries(users)) {
        list += `🆔 ${id} - ${user.name} - ${user.approved ? '✅ অনুমোদিত' : '⏳ পেন্ডিং'}\n`;
    }
    bot.sendMessage(msg.chat.id, list || "কোনো ইউজার নেই।");
});

// ============= অ্যাডমিন: পেন্ডিং লিস্ট =============
bot.onText(/\/pending/, (msg) => {
    if (msg.chat.id.toString() !== ADMIN_ID) return;
    if (pendingUsers.length === 0) {
        bot.sendMessage(msg.chat.id, "📋 কোনো পেন্ডিং ইউজার নেই।");
        return;
    }
    let list = "⏳ পেন্ডিং ইউজার:\n\n";
    for (const id of pendingUsers) {
        list += `🆔 ${id} - ${users[id]?.name}\n`;
    }
    bot.sendMessage(msg.chat.id, list);
});

// ============= অ্যাডমিন: কুকি যোগ =============
bot.onText(/\/addcookie (.+)/, (msg, match) => {
    if (msg.chat.id.toString() !== ADMIN_ID) return;
    const cookie = match[1];
    fbCookies.push(cookie);
    bot.sendMessage(msg.chat.id, `✅ কুকি যোগ হয়েছে! মোট: ${fbCookies.length}টি`);
});

// ============= অ্যাডমিন: কুকি লিস্ট =============
bot.onText(/\/listcookie/, (msg) => {
    if (msg.chat.id.toString() !== ADMIN_ID) return;
    if (fbCookies.length === 0) {
        bot.sendMessage(msg.chat.id, "📋 কোনো কুকি নেই। /addcookie দিয়ে যোগ করো।");
        return;
    }
    let list = "🍪 কুকি লিস্ট:\n\n";
    fbCookies.forEach((c, i) => {
        list += `${i+1}. ${c.substring(0, 50)}...\n`;
    });
    bot.sendMessage(msg.chat.id, list);
});

// ============= অ্যাডমিন: স্ট্যাটাস =============
bot.onText(/\/stats/, (msg) => {
    if (msg.chat.id.toString() !== ADMIN_ID) return;
    const totalUsers = Object.keys(users).length;
    const approvedUsers = Object.values(users).filter(u => u.approved).length;
    bot.sendMessage(msg.chat.id, 
        `📊 বট স্ট্যাটাস:\n\n` +
        `👥 মোট ইউজার: ${totalUsers}\n` +
        `✅ অনুমোদিত: ${approvedUsers}\n` +
        `⏳ পেন্ডিং: ${pendingUsers.length}\n` +
        `🍪 মোট কুকি: ${fbCookies.length}`);
});

// ============= ইউজার: লিংক যোগ করা =============
bot.onText(/📝 লিংক যোগ করুন/, (msg) => {
    const userId = msg.chat.id.toString();
    if (!users[userId]?.approved) {
        bot.sendMessage(msg.chat.id, "❌ আপনি অনুমোদিত নন।");
        return;
    }
    bot.sendMessage(msg.chat.id, "🔗 ফেসবুক প্রোফাইলের লিংক পাঠান:\nউদাহরণ: https://facebook.com/username");
    bot.once('message', (m) => {
        const link = m.text;
        users[userId].link = link;
        bot.sendMessage(msg.chat.id, `✅ লিংক সেভ হয়েছে!\nলিংক: ${link}\nএখন "🚀 রিকোয়েস্ট পাঠান" চাপুন।`);
    });
});

// ============= ইউজার: রিকোয়েস্ট পাঠানো =============
bot.onText(/🚀 রিকোয়েস্ট পাঠান/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = chatId.toString();

    if (!users[userId]?.approved) {
        bot.sendMessage(chatId, "❌ আপনি অনুমোদিত নন।");
        return;
    }

    const link = users[userId]?.link;
    if (!link) {
        bot.sendMessage(chatId, "❌ আগে লিংক যোগ করুন। '📝 লিংক যোগ করুন' বাটনে চাপো।");
        return;
    }

    const match = link.match(/facebook\.com\/([^\/?]+)/);
    if (!match) {
        bot.sendMessage(chatId, "❌ ভুল লিংক ফরম্যাট! সঠিক লিংক দিন।");
        return;
    }

    const targetId = match[1];
    
    if (fbCookies.length === 0) {
        bot.sendMessage(chatId, "❌ কোনো কুকি নেই। অ্যাডমিন কুকি যোগ করুন।");
        return;
    }

    bot.sendMessage(chatId, `🚀 রিকোয়েস্ট পাঠানো শুরু...\n📌 টার্গেট: ${targetId}\n📊 মোট কুকি: ${fbCookies.length}টি`);

    let success = 0;
    for (let i = 0; i < fbCookies.length; i++) {
        const result = await sendFriendRequest(fbCookies[i], targetId);
        if (result) success++;
        bot.sendMessage(chatId, `${result ? '✅' : '❌'} কুকি ${i+1}`);
        
        if (i < fbCookies.length - 1) {
            const delay = randomDelay();
            bot.sendMessage(chatId, `⏳ ${(delay/1000).toFixed(1)} সেকেন্ড অপেক্ষা...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    bot.sendMessage(chatId, `🎉 সম্পন্ন!\n✅ সফল: ${success}\n❌ ব্যর্থ: ${fbCookies.length - success}`);
});

// ============= ইউজার: প্রোফাইল =============
bot.onText(/👤 প্রোফাইল/, (msg) => {
    const userId = msg.chat.id.toString();
    if (!users[userId]?.approved) {
        bot.sendMessage(msg.chat.id, "❌ আপনি অনুমোদিত নন।");
        return;
    }
    bot.sendMessage(msg.chat.id, `👤 প্রোফাইল:\n🆔 আইডি: ${userId}\n📛 নাম: ${users[userId].name}\n✅ স্ট্যাটাস: অনুমোদিত\n🔗 লিংক: ${users[userId].link || 'সেট করা নেই'}`);
});

// ============= ইউজার: ব্যালেন্স =============
bot.onText(/💰 ব্যালেন্স/, (msg) => {
    const userId = msg.chat.id.toString();
    if (!users[userId]?.approved) {
        bot.sendMessage(msg.chat.id, "❌ আপনি অনুমোদিত নন।");
        return;
    }
    bot.sendMessage(msg.chat.id, `💰 ব্যালেন্স: ০ টাকা\n💸 প্রতি রিকোয়েস্ট খরচ: ২ টাকা\n💳 ডিপোজিট: bKash 01865598733`);
});

console.log('✅ বট চালু হয়েছে!');
console.log(`👑 অ্যাডমিন আইডি: ${ADMIN_ID}`);
console.log(`🍪 কুকি: ${fbCookies.length}টি`);
