import { Telegraf, Markup, Context } from "telegraf";
import { PrismaClient } from "@prisma/client";
import pino from "pino";
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const log = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: null,
    transport: process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true, ignore: "pid,hostname" } }
        : undefined,
});

const prisma = new PrismaClient({ log: [] });

function fmt(n: number) { return `Rp ${n.toLocaleString("id-ID")}`; }

// ─────────────────────────────────────────────
// Bot Instance Class (One per User/Store)
// ─────────────────────────────────────────────
class TeleStoreBot {
    private bot: Telegraf;
    private userId: string;

    constructor(private config: any) {
        this.userId = config.userId;
        this.bot = new Telegraf(config.botToken);
        this.setupRoutes();
    }

    private mainMenu() {
        return Markup.inlineKeyboard([
            [Markup.button.callback(`🛒 ${this.config.cmdMenu}`, "menu:products")],
            [Markup.button.callback(`💰 ${this.config.cmdBalance}`, "menu:balance"), Markup.button.callback(`📜 ${this.config.cmdHistory}`, "menu:history")],
            [Markup.button.callback("📈 Top Terlaris", "menu:bestsellers")],
        ]);
    }

    private async ensureUser(telegramId: string, username?: string) {
        return prisma.teleUser.upsert({
            where: { telegramId },
            update: username ? { username } : {},
            create: { telegramId, username: username ?? null, balance: 0, totalOrders: 0 },
        });
    }

    private async generateWelcomeMsg(user: any) {
        // Build the date string manually to match 'Jumat, 20 Maret 2026 12.26.54'
        const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
        const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;

        // Get Store-wide stats (total users who bought, total transactions)
        const [txsStats, buyersStats] = await Promise.all([
            prisma.teleTransaction.aggregate({ _count: { id: true }, where: { storeOwnerId: this.userId } }),
            prisma.teleTransaction.groupBy({ by: ['teleUserId'], where: { storeOwnerId: this.userId } })
        ]);

        return `Hallo 🖐 ${user.username ?? user.telegramId}\n` +
            `${this.config.welcomeMsg}\n` +
            `_${dateStr}_\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `👨‍💼 *User Info*\n` +
            `⇒ *ID :* \`${user.telegramId}\`\n` +
            `⇒ *Username :* ${user.username ?? '-'}\n` +
            `⇒ *Saldo :* ${fmt(user.balance)}\n` +
            `⇒ *Total Transaksi :* ${user.totalOrders}\n\n` +
            `📈 *Stats Bot*\n` +
            `⇒ *Total User :* ${buyersStats.length}\n` +
            `⇒ *Total Transaksi :* ${txsStats._count.id}`;
    }

    private async sendMainMenu(ctx: Context, user: any) {
        const msg = await this.generateWelcomeMsg(user);
        const markup = { parse_mode: "Markdown" as const, ...this.mainMenu() };

        if (this.config.welcomeImageUrl) {
             return ctx.replyWithPhoto(this.config.welcomeImageUrl, { caption: msg, ...markup });
        }
        return ctx.reply(msg, markup);
    }

    private async editOrResend(ctx: Context, text: string, markup: any) {
        // If the current message has a photo, we can't edit text directly. 
        // We must delete the photo message and send a new text message.
        if (ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message) {
            await ctx.deleteMessage().catch(() => {});
            return ctx.reply(text, markup);
        }
        return ctx.editMessageText(text, markup).catch(() => {});
    }

    private setupRoutes() {
        const { bot, userId } = this;

        bot.start(async (ctx) => {
            const telegramId = String(ctx.from.id);
            const user = await this.ensureUser(telegramId, ctx.from.username);
            log.info({ tag: "START", store: userId.slice(0, 5) }, `User ${telegramId.slice(-4)} started`);
            await this.sendMainMenu(ctx, user);
        });

        // Register commands to mirror inline buttons
        bot.command("menu", async (ctx) => {
            const user = await this.ensureUser(String(ctx.from.id), ctx.from.username);
            await this.sendMainMenu(ctx, user);
        });

        bot.command("balance", async (ctx) => {
            const user = await this.ensureUser(String(ctx.from.id), ctx.from.username);
            await ctx.reply(`💰 *${this.config.cmdBalance}*\n\nBalance: *${fmt(user.balance)}*\nTotal Pesanan: *${user.totalOrders}*\n\n_Hubungi admin untuk top-up saldo._`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "menu:main")]]) });
        });

        bot.command("history", async (ctx) => {
            const user = await this.ensureUser(String(ctx.from.id), ctx.from.username);
            const txs = await prisma.teleTransaction.findMany({
                where: { storeOwnerId: userId, teleUserId: user.id },
                include: { product: true },
                orderBy: { createdAt: "desc" },
                take: 5,
            });
            if (txs.length === 0) return ctx.reply("📜 Belum ada pesanan.", Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "menu:main")]]));
            
            const lines = txs.map((tx, i) => {
                const status = tx.status === "SUCCESS" ? "✅" : tx.status === "CANCELLED" ? "❌" : "⏳";
                const date = tx.createdAt.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
                return `${i + 1}. ${status} *${tx.product.name}* — ${fmt(tx.product.price)} (${date})`;
            });
            await ctx.reply(`📜 *5 Pesanan Terakhir*\n\n${lines.join("\n")}`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "menu:main")]]) });
        });

        // Actions
        bot.action("menu:main", async (ctx) => {
            await ctx.answerCbQuery();
            const user = await this.ensureUser(String(ctx.from.id), ctx.from.username);
            
            if (this.config.welcomeImageUrl || (ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message)) {
                await ctx.deleteMessage().catch(() => {});
                return this.sendMainMenu(ctx, user);
            }

            const msg = await this.generateWelcomeMsg(user);
            return ctx.editMessageText(msg, { parse_mode: "Markdown", ...this.mainMenu() }).catch(() => {});
        });

        bot.action("menu:products", async (ctx) => {
            await ctx.answerCbQuery();
            const categories = await prisma.teleProduct.findMany({
                where: { userId },
                select: { category: true },
                distinct: ["category"],
                orderBy: { category: "asc" },
            });

            if (categories.length === 0) return this.editOrResend(ctx, "😔 Belum ada produk tersedia saat ini.", { parse_mode: 'Markdown', ...this.mainMenu() });

            const catButtons = categories.map((c) => Markup.button.callback(`📂 ${c.category}`, `cat:${c.category}`));
            const rows: any[][] = [];
            for (let i = 0; i < catButtons.length; i += 2) rows.push(catButtons.slice(i, i + 2));
            rows.push([Markup.button.callback("⬅️ Kembali", "menu:main")]);

            return this.editOrResend(ctx, `🗂️ *Pilih Kategori Produk:*`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
        });

        bot.action(/^cat:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const category = ctx.match[1];
            const products = await prisma.teleProduct.findMany({ where: { userId, category }, orderBy: { name: "asc" }, take: 20 });
            if (products.length === 0) return this.editOrResend(ctx, "😔 Tidak ada produk.", { parse_mode: "Markdown", ...this.mainMenu() });

            const prodButtons = products.map((p) => [Markup.button.callback(`${p.name} — ${fmt(p.price)} | ${p.stock === 0 ? "❌ Habis" : `✅ Stok: ${p.stock}`}`, `prod:${p.id}`)]);
            prodButtons.push([Markup.button.callback("⬅️ Kategori", "menu:products")]);

            return this.editOrResend(ctx, `📂 *${category}* — Pilih produk:`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(prodButtons) });
        });

        bot.action(/^prod:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const product = await prisma.teleProduct.findUnique({ where: { id: ctx.match[1] } });
            if (!product || product.userId !== userId) return this.editOrResend(ctx, "❌ Produk tidak ditemukan.", { parse_mode: "Markdown", ...this.mainMenu() });

            const buttons = [[Markup.button.callback("⬅️ Kembali", `cat:${product.category}`)]];
            if (product.stock > 0) buttons.unshift([Markup.button.callback("🛒 Beli Sekarang", `buy:${product.id}`)]);

            const text = `🛍️ *${product.name}*\n━━━━━━━━━━━━━━━━━\n📝 ${product.description ?? "—"}\n\n💰 Harga: *${fmt(product.price)}*\n${product.stock > 0 ? `✅ Stok: ${product.stock}` : "❌ Stok Habis"}\n📦 Terjual: ${product.totalSold}`;
            
            // If the product itself has an image, we could theoretically show it here, but keeping text is safer for flow.
            return this.editOrResend(ctx, text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) });
        });

        bot.action(/^buy:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const product = await prisma.teleProduct.findUnique({ where: { id: ctx.match[1] } });
            if (!product || product.userId !== userId) return this.editOrResend(ctx, "❌ Produk tidak ditemukan.", { parse_mode: "Markdown", ...this.mainMenu() });

            if (product.stock <= 0) {
                return this.editOrResend(ctx, `⚠️ *Maaf!* Stok terlanjur habis.`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Kembali", `cat:${product.category}`)]]) });
            }

            const user = await this.ensureUser(String(ctx.from.id), ctx.from.username);
            if (user.balance < product.price) {
                return this.editOrResend(ctx, `💸 *Saldo tidak cukup!*\n\nHarga: ${fmt(product.price)}\nSaldo kamu: ${fmt(user.balance)}\nKurang: ${fmt(product.price - user.balance)}\n\nHubungi admin toko untuk top-up saldo via dashboard.`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Kembali", `prod:${product.id}`)]]) });
            }

            return this.editOrResend(ctx, `🧾 *Konfirmasi Pesanan*\n\nProduk: *${product.name}*\nHarga: *${fmt(product.price)}*\nSaldo sisa: *${fmt(user.balance - product.price)}*\n\nYakin?`, {
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([[Markup.button.callback("✅ Konfirmasi", `confirm:${product.id}`), Markup.button.callback("❌ Batal", `prod:${product.id}`)]])
            });
        });

        bot.action(/^confirm:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery("⏳ Memproses...");
            const productId = ctx.match[1];
            const telegramId = String(ctx.from.id);

            try {
                await prisma.$transaction(async (tx) => {
                    const [product, user] = await Promise.all([
                        tx.teleProduct.findUnique({ where: { id: productId } }),
                        tx.teleUser.findUnique({ where: { telegramId } }),
                    ]);

                    if (!product || product.userId !== userId || !user) throw new Error("NOT_FOUND");
                    if (product.stock <= 0) throw new Error("OUT_OF_STOCK");
                    if (user.balance < product.price) throw new Error("INSUFFICIENT_BALANCE");

                    const txRecord = await tx.teleTransaction.create({
                        data: { storeOwnerId: userId, teleUserId: user.id, productId: product.id, amount: 1, status: "PENDING" },
                    });

                    await tx.teleProduct.update({ where: { id: productId }, data: { stock: { decrement: 1 }, totalSold: { increment: 1 } } });
                    await tx.teleUser.update({ where: { telegramId }, data: { balance: { decrement: product.price }, totalOrders: { increment: 1 } } });
                    await tx.teleTransaction.update({ where: { id: txRecord.id }, data: { status: "SUCCESS" } });
                });

                log.info({ tag: "ORDER_SUCCESS", store: userId.slice(0, 5), buyer: telegramId.slice(-4) }, "Order success");
                
                const userObj = await this.ensureUser(telegramId, ctx.from.username);
                if (this.config.welcomeImageUrl || (ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message)) {
                    await ctx.deleteMessage().catch(()=>{});
                    return this.sendMainMenu(ctx, userObj);
                }

                const msg = await this.generateWelcomeMsg(userObj);
                await ctx.editMessageText(msg, { parse_mode: "Markdown", ...this.mainMenu() }).catch(()=>{});
                await ctx.reply(`🎉 *Pesanan Berhasil!*\n\nTerima kasih sudah berbelanja!`); // send a small toast msg
            } catch (err: any) {
                const msgMap: Record<string, string> = { OUT_OF_STOCK: "⚠️ Habis.", INSUFFICIENT_BALANCE: "💸 Saldo kurang.", NOT_FOUND: "❌ Error." };
                await this.editOrResend(ctx, msgMap[err.message] ?? "❌ Kesalahan sistem.", { parse_mode: "Markdown", ...this.mainMenu() });
            }
        });

        bot.action("menu:balance", async (ctx) => {
            await ctx.answerCbQuery();
            const user = await this.ensureUser(String(ctx.from.id), ctx.from.username);
            return this.editOrResend(ctx, `💰 *${this.config.cmdBalance}*\n\nBalance: *${fmt(user.balance)}*\nTotal Pesanan: *${user.totalOrders}*\n\n_Hubungi admin toko untuk top-up._`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Kembali", "menu:main")]]) });
        });

        bot.action("menu:history", async (ctx) => {
            await ctx.answerCbQuery();
            const user = await this.ensureUser(String(ctx.from.id), ctx.from.username);
            const txs = await prisma.teleTransaction.findMany({
                where: { storeOwnerId: userId, teleUserId: user.id },
                include: { product: true },
                orderBy: { createdAt: "desc" },
                take: 5,
            });
            if (txs.length === 0) return this.editOrResend(ctx, "📜 Belum ada pesanan.", { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Kembali", "menu:main")]]) });
            
            const lines = txs.map((tx, i) => {
                const status = tx.status === "SUCCESS" ? "✅" : tx.status === "CANCELLED" ? "❌" : "⏳";
                return `${i + 1}. ${status} *${tx.product.name}* — ${fmt(tx.product.price)}`;
            });
            return this.editOrResend(ctx, `📜 *5 Pesanan Terakhir*\n\n${lines.join("\n")}`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Kembali", "menu:main")]]) });
        });

        bot.action("menu:bestsellers", async (ctx) => {
            await ctx.answerCbQuery();
            const topProducts = await prisma.teleProduct.findMany({ where: { userId }, orderBy: { totalSold: "desc" }, take: 5 });
            if (topProducts.length === 0) return this.editOrResend(ctx, "📈 Belum ada data.", { parse_mode: "Markdown", ...this.mainMenu() });

            const lines = topProducts.map((p, i) => `${["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i] ?? i + 1} *${p.name}* — ${p.totalSold} terjual`);
            return this.editOrResend(ctx, `📈 *Top 5 Produk Terlaris*\n\n${lines.join("\n")}`, { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Kembali", "menu:main")]]) });
        });

        bot.catch((err: any) => log.error({ tag: "BOT_ERROR", store: userId.slice(0, 5) }, err?.message || "Unknown error"));
    }

    public async registerCommands() {
        try {
            await this.bot.telegram.setMyCommands([
                { command: "start",    description: "👋 Mulai & tampilkan menu utama" },
                { command: "menu",     description: `🏠 ${this.config.cmdMenu}` },
                { command: "balance",  description: `💰 ${this.config.cmdBalance}` },
                { command: "history",  description: `📜 ${this.config.cmdHistory}` },
            ]);
        } catch (err: any) {
            log.warn({ tag: "STORE_BOT", error: err.message }, "Could not set commands (token might be invalid)");
        }
    }

    public async start() {
        await this.registerCommands();
        await this.bot.launch({ dropPendingUpdates: true });
        log.info({ tag: "STORE_BOT", store: this.userId.slice(0, 5) }, "Store bot running");
    }

    public async stop() {
        try { this.bot.stop(); } catch {}
    }
}

// ─────────────────────────────────────────────
// Manager class
// ─────────────────────────────────────────────
class TeleStoreManager {
    private bots = new Map<string, TeleStoreBot>();
    private syncInterval: NodeJS.Timeout | null = null;

    async start() {
        log.info({ tag: "MANAGER" }, "TeleStoreManager starting...");
        await prisma.$connect();
        
        await this.sync();
        this.syncInterval = setInterval(() => this.sync(), 30000);

        process.once("SIGINT", () => this.shutdown("SIGINT"));
        process.once("SIGTERM", () => this.shutdown("SIGTERM"));
    }

    private async sync() {
        try {
            const configs = await prisma.storeConfig.findMany({ where: { active: true, botToken: { not: null, notIn: [''] } } });
            const activeIds = new Set(configs.map(c => c.userId));

            // Start new bots / Restart updated bots (in a perfect world, we'd hash config to restart if changed, but polling is okay for now)
            // Just basic start/stop is fine since the user restarts via PM2 in production.
            for (const conf of configs) {
                if (!this.bots.has(conf.userId)) {
                    log.info({ tag: "MANAGER", store: conf.userId.slice(0, 5) }, "Booting new bot");
                    try {
                        const bot = new TeleStoreBot(conf);
                        await bot.start();
                        this.bots.set(conf.userId, bot);
                    } catch (err: any) {
                        log.error({ tag: "MANAGER", store: conf.userId.slice(0, 5), err: err.message }, "Failed to start bot");
                    }
                }
            }

            // Stop disabled bots
            for (const [userId, bot] of this.bots.entries()) {
                if (!activeIds.has(userId)) {
                    log.info({ tag: "MANAGER", store: userId.slice(0, 5) }, "Stopping bot (deactivated)");
                    await bot.stop();
                    this.bots.delete(userId);
                }
            }
        } catch (err: any) {
            log.error({ tag: "MANAGER", err: err.message }, "Sync loop failed");
        }
    }

    private async shutdown(signal: string) {
        log.info({ tag: "MANAGER", signal }, "Shutting down all store bots");
        if (this.syncInterval) clearInterval(this.syncInterval);
        
        for (const bot of this.bots.values()) {
            await bot.stop();
        }
        await prisma.$disconnect();
        process.exit(0);
    }
}

if (require.main === module) {
    new TeleStoreManager().start().catch((err) => {
        log.fatal({ err: err.message }, "Fatal manager error");
        process.exit(1);
    });
}
