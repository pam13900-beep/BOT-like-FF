const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ==========================================
// GANTI BAGIAN INI DENGAN MILIK LO
// ==========================================
const bot = new Telegraf('8937253409:AAHm1EeqHvHbzMzX12vK7ILLB12Z6JPEzV0');
const OWNER_ID = 6515922538;

const pendingRequests = {};
const isLocked = {}; // Status kunci grup

// ==========================================
// DATABASE (VIP, LIMIT, USER, POIN)
// ==========================================
const DB_FILE = path.join(__dirname, 'database.json');
let db = { vipUsers: [], dailyLimit: {}, users: [], points: {} };

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.vipUsers) db.vipUsers = [];
    if (!db.dailyLimit) db.dailyLimit = {};
    if (!db.users) db.users = [];
    if (!db.points) db.points = {};
  } catch (err) {}
}

function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (err) {}
}
function getToday() { return new Date().toISOString().split('T')[0]; }

// ==========================================
// COMMAND OWNER & USER
// ==========================================
bot.start((ctx) => ctx.reply('Wih, bot nyala! Kirim /like [UID] di grup buat request like 😎'));

// -- FITUR VIP --
bot.command('addvip', (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  const id = ctx.message.text.split(' ')[1];
  if (!id) return ctx.reply('Format: /addvip [id]');
  if (!db.vipUsers.includes(parseInt(id))) { db.vipUsers.push(parseInt(id)); saveDB(); }
  ctx.reply(`✅ User ${id} jadi VIP!`);
});

bot.command('delvip', (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  const id = ctx.message.text.split(' ')[1];
  db.vipUsers = db.vipUsers.filter(v => v !== parseInt(id)); saveDB();
  ctx.reply(`✅ User ${id} bukan VIP lagi.`);
});

bot.command('listvip', (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  ctx.reply(`👑 VIP: \n${db.vipUsers.join('\n') || 'Kosong'}`);
});

// -- FITUR POIN --
bot.command('addpoin', (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  const args = ctx.message.text.split(' ');
  const targetId = args[1];
  const amount = parseInt(args[2]);
  if (!targetId || !amount) return ctx.reply('Format: /addpoin [ID_Telegram] [Jumlah]');
  
  db.points[targetId] = (db.points[targetId] || 0) + amount;
  saveDB();
  ctx.reply(`✅ Berhasil nambahin ${amount} poin ke user ${targetId}.`);
});

bot.command('cekpoin', (ctx) => {
  const myPoints = db.points[ctx.from.id] || 0;
  ctx.reply(`💰 *Poin Lo:* ${myPoints}\n\nMau like tambahan? Ketik:\n\`/likepoint [UID]\``, { parse_mode: 'Markdown' });
});

// -- FITUR STATUS --
bot.command('status', (ctx) => {
  if (ctx.chat.type !== 'private') return;
  const isVip = db.vipUsers.includes(ctx.from.id);
  const used = db.dailyLimit[ctx.from.id] === getToday();
  const pts = db.points[ctx.from.id] || 0;
  ctx.reply(`👑 VIP: ${isVip ? 'Ya' : 'Tidak'}\n📅 Like hari ini: ${used ? 'Udah' : 'Belum'}\n💰 Poin: ${pts}`);
});

// -- FITUR BROADCAST --
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  const msg = ctx.message.text.replace('/broadcast ', '');
  if (!msg) return ctx.reply('Format: /broadcast [pesan]');

  await ctx.reply(`📢 Mulai broadcast ke ${db.users.length} user...`);
  let success = 0, failed = 0;
  for (const userId of db.users) {
    try {
      await bot.telegram.sendMessage(userId, `📢 *PENGUMUMAN*\n\n${msg}`, { parse_mode: 'Markdown' });
      success++;
    } catch (e) { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
  ctx.reply(`✅ Selesai! Berhasil: ${success}, Gagal: ${failed}`);
});

// -- FITUR LOCK GRUP --
bot.command('lock', async (ctx) => {
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
  const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
  const isAdmin = member.status === 'creator' || member.status === 'administrator';
  if (ctx.from.id !== OWNER_ID && !isAdmin) return ctx.reply('❌ Cuma Admin yang bisa ngunci!');

  try {
    await ctx.telegram.setChatPermissions(ctx.chat.id, { can_send_messages: false });
    ctx.reply('🔒 *Grup resmi DITUTUP!* Semua member ga bisa ngetik.', { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ Gagal! Pastiin bot udah jadi Admin dan punya izin "Kelola Grup".');
  }
});

bot.command('unlock', async (ctx) => {
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
  const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
  const isAdmin = member.status === 'creator' || member.status === 'administrator';
  if (ctx.from.id !== OWNER_ID && !isAdmin) return ctx.reply('❌ Cuma Admin yang bisa buka kunci!');

  try {
    await ctx.telegram.setChatPermissions(ctx.chat.id, { 
      can_send_messages: true, can_send_media_messages: true, can_send_polls: true, can_send_other_messages: true, can_add_web_page_previews: true 
    });
    ctx.reply('🔓 *Grup resmi DIBUKA!*', { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.reply('❌ Gagal: ' + err.message);
  }
});

// ==========================================
// FUNGSI PROSES LIKE (BIAR NGGAK DOBEL KODE)
// ==========================================
async function prosesRequestLike(ctx, targetUid, isPakePoin) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const isVip = db.vipUsers.includes(userId);

  if (isPakePoin) {
    const sisaPoin = db.points[userId] || 0;
    if (sisaPoin < 1) return ctx.reply(`❌ Poin lo abis! Sisa poin: ${sisaPoin}`, { reply_to_message_id: ctx.message.message_id });
    db.points[userId] -= 1; saveDB();
  } else {
    if (!isVip && db.dailyLimit[userId] === getToday()) {
      const sisaPoin = db.points[userId] || 0;
      return ctx.reply(`⚠️ Limit harian lo abis!\n\n💰 Poin lo: ${sisaPoin}\n\nMau like lagi? Ketik:\n/likepoint ${targetUid}`, { reply_to_message_id: ctx.message.message_id });
    }
    if (!isVip) { db.dailyLimit[userId] = getToday(); }
  }

  if (!db.users.includes(userId)) { db.users.push(userId); saveDB(); }

  const replyMsg = await ctx.reply(`🤖 *Bot sending like...*\n🎯 Target UID: \`${targetUid}\``, { parse_mode: 'Markdown', reply_to_message_id: ctx.message.message_id });
  const notifMsg = await bot.telegram.sendMessage(OWNER_ID, 
    `🔔 REQUEST LIKE\n👤 User: ${ctx.from.username || ctx.from.first_name}\n🎯 Target: ${targetUid}\n💳 Pake Poin: ${isPakePoin ? 'Ya' : 'Tidak'}\n\n👉 *Reply pesan ini* sambil paste teks bukti dari FF.`, { parse_mode: 'Markdown' }
  );

  pendingRequests[notifMsg.message_id] = { userId, chatId, uid: targetUid, groupReplyMsgId: replyMsg.message_id };
}

// ==========================================
// COMMAND REQUEST LIKE
// ==========================================
bot.command('like', async (ctx) => {
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
  const targetUid = ctx.message.text.split(' ')[1];
  if (!targetUid) return ctx.reply('Mana UID-nya? Contoh: /like 12345678', { reply_to_message_id: ctx.message.message_id });
  prosesRequestLike(ctx, targetUid, false);
});

bot.command('likepoint', async (ctx) => {
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
  const targetUid = ctx.message.text.split(' ')[1];
  if (!targetUid) return ctx.reply('Mana UID-nya? Contoh: /likepoint 12345678', { reply_to_message_id: ctx.message.message_id });
  prosesRequestLike(ctx, targetUid, true);
});

// ==========================================
// TERIMA BUKTI (FIX ANTI ERROR SIMBOL)
// ==========================================
bot.on('text', async (ctx, next) => {
  if (ctx.from.id !== OWNER_ID) return next();
  if (ctx.message.text.startsWith('/')) return next();
  if (ctx.chat.type !== 'private') return next(); // Cuma respon di private

  const replyTo = ctx.message.reply_to_message;
  if (!replyTo || !pendingRequests[replyTo.message_id]) {
    return ctx.reply('⚠️ *Reply pesan request-nya* sambil paste bukti ya.', { parse_mode: 'Markdown' });
  }

  const req = pendingRequests[replyTo.message_id];
  const text = ctx.message.text;
  const isLimit = /limit|reached|refunded/i.test(text);

  // PERBAIKAN: Menghapus format Markdown dan simbol (━) agar tidak error saat nama player ada simbol unik
  let finalMessage = isLimit 
    ? `⚠️ LIMIT REACHED FOR TODAY!\n\n${text}`
    : `✅ LIKES SENT SUCCESSFULLY!\n\n${text}`;

  try {
    // PENGIRIMAN TANPA PARSE_MODE
    await bot.telegram.sendMessage(req.chatId, finalMessage, { 
      reply_to_message_id: req.groupReplyMsgId 
    });
    
    try { await bot.telegram.deleteMessage(req.chatId, req.groupReplyMsgId); } catch(e) {}
    ctx.reply('✅ Bukti sukses terkirim ke grup!');
    delete pendingRequests[replyTo.message_id];
  } catch (err) {
    ctx.reply('❌ Gagal kirim: ' + err.message);
  }
});

// ==========================================
// SENSOR CHAT KALO GRUP LAGI DI-LOCK
// ==========================================
bot.on('message', async (ctx, next) => {
  if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
    if (isLocked[ctx.chat.id]) {
      try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        const isAdmin = member.status === 'creator' || member.status === 'administrator';
        
        if (ctx.from.id !== OWNER_ID && !isAdmin) {
          await ctx.deleteMessage();
        }
      } catch (err) {}
    }
  }
  return next();
});

bot.launch();
console.log('Bot Telegram jalan... 🚀');
