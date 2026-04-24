const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('🌟 FB Premium Bot is running!');
});

app.listen(3000, () => {
    console.log('✅ Server started on port 3000');
});

const TelegramBot = require('node-telegram-bot-api');

// ============= তোমার বট টোকেন এখানে বসাও =============
const BOT_TOKEN = '8772316564:AAF6Buvm_XAT3QyClTNKp9nVuop2KSVSb0U';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ============= তোমার ফেসবুক অ্যাকাউন্টের কুকি =============
const ACCOUNTS = [
    {
        id: "61572065871152",
        name: "📘 Account 1",
        cookie: "datr=QLbUaeSnpG512iVwQ7BwPrQb; sb=QLbUaXMDItmSRbViC0das8O8; c_user=61572065871152; xs=13%3AHaTcUYJHIKezMg%3A2%3A1775547993%3A-1%3A-1"
    },
    {
        id: "61572102352313",
        name: "📘 Account 2",
        cookie: "datr=Z8DUaavuKPkq27JxUxTrg5-7; sb=a8DUaXm1HmM0UWjPMZjCrJws; c_user=61572102352313; xs=40%3A-fmA0wokeyoufg%3A2%3A1775550581%3A-1%3A-1"
    },
    {
        id: "61573288559585",
        name: "📘 Account 3",
        cookie: "datr=CMLUaT_mMAVG4ZJ5x71V0-DG; sb=DsLUaVRXeUhTfPAsY9J_cuin; c_user=61573288559585; xs=42%3AsT5KdCP_xd3VwA%3A2%3A1775551008%3A-1%3A-1"
    }
];

// ============= ইউজার ডাটা স্টোর =============
let userLinks = {};

// ============= র‍্যান্ডম ডেলি ফাংশন =============
function randomDelay() {
    let min = 4, max = 7;
    return (Math.random() * (max - min) + min) * 1000;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============= ফেসবুক ফ্রেন্ড রিকোয়েস্ট ফাংশন =============
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
                'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
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

// ============= প্রিমিয়াম মেনু বাটন (সবচেয়ে আধুনিক) =============
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: "📝 লিংক যোগ করুন", callback_data: "add_link" },
                { text: "🚀 রিকোয়েস্ট পাঠান", callback_data: "send_req" }
            ],
            [
                { text: "📋 অ্যাকাউন্ট লিস্ট", callback_data: "list_acc" },
                { text: "📈 স্ট্যাটাস", callback_data: "status" }
            ],
            [
                { text: "❓ হেল্প", callback_data: "help" },
                { text: "ℹ️ সম্পর্কে", callback_data: "about" }
            ]
        ]
    }
};

// ============= স্টার্ট কমান্ড =============
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || "ভাই";
    
    bot.sendMessage(chatId, 
        `🌟 হ্যালো ${firstName}! 🌟\n\n` +
        `🤖 **প্রিমিয়াম ফেসবুক প্যানেল বট** এ স্বাগতম!\n\n` +
        `📊 **বর্তমান স্ট্যাটাস:**\n` +
        `┏━━━━━━━━━━━━━━━━━┓\n` +
        `┃ 📘 মোট অ্যাকাউন্ট: ${ACCOUNTS.length}টি\n` +
        `┃ ⏱️ ডেলি টাইম: ৪-৭ সেকেন্ড\n` +
        `┃ 🟢 বট স্ট্যাটাস: সক্রিয়\n` +
        `┗━━━━━━━━━━━━━━━━━┛\n\n` +
        `🔽 **নিচের বাটন থেকে কাজ শুরু করো** 🔽`,
        { parse_mode: 'Markdown', ...mainMenu }
    );
});

// ============= হেল্প =============
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    // হেল্প বাটন
    if (data === 'help') {
        bot.editMessageText(
            `❓ **হেল্প গাইড** ❓\n\n` +
            `📌 **কিভাবে ব্যবহার করবে:**\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `1️⃣ 📝 **লিংক যোগ করুন** বাটনে ক্লিক করো\n` +
            `2️⃣ ফেসবুক প্রোফাইলের লিংক দাও\n` +
            `3️⃣ 🚀 **রিকোয়েস্ট পাঠান** বাটনে ক্লিক করো\n` +
            `4️⃣ ফলাফলের জন্য অপেক্ষা করো\n\n` +
            `⚙️ **বিশেষ ফিচার:**\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `✅ অটো র‍্যান্ডম ডেলি (৪-৭ সেকেন্ড)\n` +
            `✅ লাইভ প্রগ্রেস দেখা\n` +
            `✅ মাল্টিপল অ্যাকাউন্ট সাপোর্ট\n\n` +
            `🔙 মেনুতে ফিরে যেতে /start দাও।`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...mainMenu }
        );
        bot.answerCallbackQuery(query.id);
    }
    
    // সম্পর্কে বাটন
    else if (data === 'about') {
        bot.editMessageText(
            `ℹ️ **বট সম্পর্কে তথ্য** ℹ️\n\n` +
            `📛 **নাম:** প্রিমিয়াম FB প্যানেল বট\n` +
            `🔢 **ভার্সন:** 2.0.0\n` +
            `👑 **টাইপ:** প্রিমিয়াম\n` +
            `📅 **রিলিজ:** ২০২৬\n\n` +
            `⚡ **ফিচার:**\n` +
            `• অটো ফ্রেন্ড রিকোয়েস্ট\n` +
            `• মাল্টিপল অ্যাকাউন্ট\n` +
            `• র‍্যান্ডম ডেলি সিস্টেম\n` +
            `• লাইভ প্রগ্রেস ট্র্যাকিং\n\n` +
            `🔙 মেনুতে ফিরে যেতে /start দাও।`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...mainMenu }
        );
        bot.answerCallbackQuery(query.id);
    }
    
    // স্ট্যাটাস বাটন
    else if (data === 'status') {
        const totalAccounts = ACCOUNTS.length;
        const activeCookies = ACCOUNTS.filter(a => a.cookie && a.cookie.length > 10).length;
        
        bot.editMessageText(
            `📈 **বট স্ট্যাটাস** 📈\n\n` +
            `┏━━━━━━━━━━━━━━━━━━━━━━┓\n` +
            `┃ 📘 মোট অ্যাকাউন্ট: ${totalAccounts}\n` +
            `┃ 🍪 সক্রিয় কুকি: ${activeCookies}\n` +
            `┃ ⏱️ ডেলি টাইম: ৪-৭ সেকেন্ড\n` +
            `┃ 🟢 বট: চলমান\n` +
            `┃ 📊 ইউজার: ${Object.keys(userLinks).length}\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
            `🔄 মেনু রিফ্রেশ করতে /start দাও।`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...mainMenu }
        );
        bot.answerCallbackQuery(query.id);
    }
    
    // ============= লিংক যোগ করা =============
    else if (data === 'add_link') {
        bot.editMessageText(
            `🔗 **ফেসবুক লিংক পাঠান** 🔗\n\n` +
            `নিচের ফরম্যাটে লিংক দাও:\n` +
            `\`https://facebook.com/username\`\n\n` +
            `অথবা:\n` +
            `\`https://www.facebook.com/profile.php?id=123456789\``,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
        
        bot.once('message', (msg) => {
            const link = msg.text;
            userLinks[chatId] = link;
            bot.sendMessage(chatId, 
                `✅ **লিংক সংরক্ষিত হয়েছে!** ✅\n\n` +
                `📌 টার্গেট: \`${link}\`\n\n` +
                `🚀 এখন "রিকোয়েস্ট পাঠান" বাটনে ক্লিক করো।`,
                { parse_mode: 'Markdown', ...mainMenu }
            );
        });
        bot.answerCallbackQuery(query.id);
    }
    
    // ============= রিকোয়েস্ট পাঠানো =============
    else if (data === 'send_req') {
        const link = userLinks[chatId];
        
        if (!link) {
            bot.answerCallbackQuery(query.id, { text: '❌ আগে লিংক যোগ করুন!', show_alert: true });
            return;
        }
        
        let match = link.match(/facebook\.com\/([^\/?]+)/);
        if (!match) {
            bot.answerCallbackQuery(query.id, { text: '❌ ভুল লিংক ফরম্যাট!', show_alert: true });
            return;
        }
        
        const targetId = match[1];
        
        bot.editMessageText(
            `🚀 **রিকোয়েস্ট পাঠানো শুরু হচ্ছে...** 🚀\n\n` +
            `📌 টার্গেট আইডি: \`${targetId}\`\n` +
            `📊 মোট অ্যাকাউন্ট: ${ACCOUNTS.length}টি\n` +
            `⏱️ ডেলি টাইম: ৪-৭ সেকেন্ড\n\n` +
            `⏳ প্রক্রিয়া চলছে, দয়া করে অপেক্ষা করুন...`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
        
        let success = 0;
        let fail = 0;
        let results = [];
        
        for (let i = 0; i < ACCOUNTS.length; i++) {
            const acc = ACCOUNTS[i];
            const result = await sendFriendRequest(acc.cookie, targetId);
            
            if (result) {
                success++;
                results.push(`✅ ${acc.name}: সফল`);
            } else {
                fail++;
                results.push(`❌ ${acc.name}: ব্যর্থ`);
            }
            
            // আপডেট মেসেজ (প্রতি ২টি রিকোয়েস্টে)
            if ((i + 1) % 2 === 0 || i === ACCOUNTS.length - 1) {
                const progressMsg = 
                    `🚀 **রিকোয়েস্ট পাঠানো হচ্ছে...**\n\n` +
                    `📌 টার্গেট: \`${targetId}\`\n` +
                    `📊 অগ্রগতি: ${i+1}/${ACCOUNTS.length}\n` +
                    `✅ সফল: ${success} | ❌ ব্যর্থ: ${fail}\n\n` +
                    `⏳ চলমান...`;
                try {
                    await bot.editMessageText(progressMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    });
                } catch(e) {}
            }
            
            if (i < ACCOUNTS.length - 1) {
                await sleep(randomDelay());
            }
        }
        
        // ফাইনাল রিপোর্ট
        let reportMsg = 
            `🎉 **রিকোয়েস্ট পাঠানো সম্পন্ন!** 🎉\n\n` +
            `📊 **ফাইনাল রিপোর্ট:**\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `✅ সফল: ${success}\n` +
            `❌ ব্যর্থ: ${fail}\n` +
            `📊 মোট: ${ACCOUNTS.length}\n\n` +
            `📋 **বিস্তারিত:**\n` +
            results.slice(0, 10).join('\n') +
            (results.length > 10 ? `\n...এবং আরও ${results.length - 10}টি` : '') +
            `\n\n━━━━━━━━━━━━━━━━━━━\n` +
            `🔄 নতুন কাজ করতে /start দাও।`;
        
        bot.sendMessage(chatId, reportMsg, { parse_mode: 'Markdown', ...mainMenu });
        bot.answerCallbackQuery(query.id);
    }
    
    // ============= অ্যাকাউন্ট লিস্ট =============
    else if (data === 'list_acc') {
        let msg = `📋 **তোমার অ্যাকাউন্ট লিস্ট** 📋\n\n`;
        ACCOUNTS.forEach((acc, i) => {
            msg += `${i+1}. ${acc.name}\n`;
            msg += `   🆔 আইডি: \`${acc.id}\`\n`;
            msg += `   🍪 কুকি: ${acc.cookie.substring(0, 30)}...\n\n`;
        });
        msg += `━━━━━━━━━━━━━━━━━━━\n📊 মোট: ${ACCOUNTS.length}টি অ্যাকাউন্ট`;
        
        bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            ...mainMenu
        });
        bot.answerCallbackQuery(query.id);
    }
});

// ============= কাস্টম টেক্সট রিপ্লাই =============
bot.onText(/\/menu/, (msg) => {
    bot.sendMessage(msg.chat.id, '🔽 নিচের মেনু ব্যবহার করো:', mainMenu);
});

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        `❓ **কমান্ড লিস্ট:**\n\n` +
        `/start - বট চালু করো\n` +
        `/menu - মেনু দেখাও\n` +
        `/status - বট স্ট্যাটাস\n` +
        `/help - এই হেল্প বার্তা`,
        { parse_mode: 'Markdown', ...mainMenu }
    );
});

bot.onText(/\/status/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `📊 **বট স্ট্যাটাস**\n\n` +
        `📘 মোট অ্যাকাউন্ট: ${ACCOUNTS.length}\n` +
        `🟢 বট: চলমান\n` +
        `⏱️ ডেলি: ৪-৭ সেকেন্ড`,
        { parse_mode: 'Markdown', ...mainMenu }
    );
});

console.log('✅ প্রিমিয়াম FB প্যানেল বট চালু হয়েছে!');
console.log(`📊 মোট অ্যাকাউন্ট লোড: ${ACCOUNTS.length}টি`);
console.log(`🎨 প্রিমিয়াম মেনু লোড হয়েছে!`);
