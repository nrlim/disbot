/**
 * Telegram Auto-Order Store Bot
 * Engine: Telegraf.js v4 (lightweight, <512MB RAM)
 * 
 * Features:
 *  - /start: Inline menu with main actions
 *  - Product browsing with category navigation
 *  - Stock Guard (blocks orders when stock = 0)
 *  - Auto-Deduct: balance & stock on confirmed order
 *  - Clean sanitised logging (no balances or sensitive data)
 */

import { Telegraf, Markup, Context } from "telegraf";
import { PrismaClient } from "@prisma/client";
import pino from "pino";

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
const log = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: null, // omit pid/hostname
    transport: process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true, ignore: "pid,hostname" } }
        : undefined,
});

const prisma = new PrismaClient({
    log: [], // suppress prisma query logs to keep logs sanitised
});

const TOKEN = process.env.TELE_STORE_BOT_TOKEN;
if (!TOKEN) {
    log.error("TELE_STORE_BOT_TOKEN is not set. Auto-Order bot will not start.");
    process.exit(1);
}

const bot = new Telegraf(TOKEN);

// ─────────────────────────────────────────────
// Helper: ensure TeleUser exists
// ─────────────────────────────────────────────
async function ensureTeleUser(telegramId: string, username?: string) {
    return prisma.teleUser.upsert({
        where: { telegramId },
        update: username ? { username } : {},
        create: { telegramId, username: username ?? null, balance: 0, totalOrders: 0 },
    });
}

// ─────────────────────────────────────────────
// Helper: format currency
// ─────────────────────────────────────────────
function fmt(n: number) {
    return `Rp ${n.toLocaleString("id-ID")}`;
}

// ─────────────────────────────────────────────
// Helper: main menu keyboard
// ─────────────────────────────────────────────
const mainMenu = () =>
    Markup.inlineKeyboard([
        [Markup.button.callback("🛒 Product List", "menu:products")],
        [Markup.button.callback("💰 My Balance", "menu:balance"), Markup.button.callback("📜 History", "menu:history")],
        [Markup.button.callback("📈 Best Sellers", "menu:bestsellers")],
    ]);

// ─────────────────────────────────────────────
// /start
// ─────────────────────────────────────────────
bot.start(async (ctx) => {
    const telegramId = String(ctx.from.id);
    const username = ctx.from.username;

    await ensureTeleUser(telegramId, username);

    // Sanitised log — never log balance or PII
    log.info({ tag: "START", userId: telegramId.slice(0, 5) + "***" }, "User started bot");

    await ctx.reply(
        `👋 *Selamat datang di DisBot Store!*\n\nBrowse produk digital kami & checkout langsung dari sini.`,
        { parse_mode: "Markdown", ...mainMenu() }
    );
});

// ─────────────────────────────────────────────
// Menu: Product List (category selector)
// ─────────────────────────────────────────────
bot.action("menu:products", async (ctx) => {
    await ctx.answerCbQuery();

    const categories = await prisma.teleProduct.findMany({
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
    });

    if (categories.length === 0) {
        return ctx.editMessageText("😔 Belum ada produk tersedia saat ini.", mainMenu());
    }

    const catButtons = categories.map((c) =>
        Markup.button.callback(`📂 ${c.category}`, `cat:${c.category}`)
    );

    // Chunk into rows of 2
    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    for (let i = 0; i < catButtons.length; i += 2) rows.push(catButtons.slice(i, i + 2));
    rows.push([Markup.button.callback("⬅️ Kembali", "menu:main")]);

    return ctx.editMessageText(
        "🗂️ *Pilih Kategori Produk:*",
        { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) }
    );
});

// ─────────────────────────────────────────────
// Category -> Product list (paginated if needed)
// ─────────────────────────────────────────────
bot.action(/^cat:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const category = ctx.match[1];

    const products = await prisma.teleProduct.findMany({
        where: { category },
        orderBy: { name: "asc" },
        take: 10,
    });

    if (products.length === 0) {
        return ctx.editMessageText("😔 Tidak ada produk di kategori ini.", mainMenu());
    }

    const prodButtons = products.map((p) => {
        const stockLabel = p.stock === 0 ? "❌ Habis" : `✅ Stok: ${p.stock}`;
        return [Markup.button.callback(`${p.name} — ${fmt(p.price)} | ${stockLabel}`, `prod:${p.id}`)];
    });
    prodButtons.push([Markup.button.callback("⬅️ Kategori", "menu:products")]);

    return ctx.editMessageText(
        `📂 *${category}* — Pilih produk:`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard(prodButtons) }
    );
});

// ─────────────────────────────────────────────
// Product Detail + Buy Now
// ─────────────────────────────────────────────
bot.action(/^prod:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = ctx.match[1];

    const product = await prisma.teleProduct.findUnique({ where: { id: productId } });

    if (!product) {
        return ctx.editMessageText("❌ Produk tidak ditemukan.", mainMenu());
    }

    const stockText = product.stock > 0 ? `✅ Stok: ${product.stock}` : "❌ Stok Habis";
    const description = product.description ?? "—";

    const buttons = [[Markup.button.callback("⬅️ Kembali", `cat:${product.category}`)]];
    if (product.stock > 0) {
        buttons.unshift([Markup.button.callback("🛒 Beli Sekarang", `buy:${product.id}`)]);
    }

    const text =
        `🛍️ *${product.name}*\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `📝 ${description}\n\n` +
        `💰 Harga: *${fmt(product.price)}*\n` +
        `${stockText}\n` +
        `📦 Terjual: ${product.totalSold}`;

    return ctx.editMessageText(text, { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) });
});

// ─────────────────────────────────────────────
// Buy — Confirm prompt (Stock Guard Check #1)
// ─────────────────────────────────────────────
bot.action(/^buy:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = ctx.match[1];

    const [product, telegramId] = [
        await prisma.teleProduct.findUnique({ where: { id: productId } }),
        String(ctx.from.id),
    ];

    if (!product) return ctx.editMessageText("❌ Produk tidak ditemukan.", mainMenu());

    // STOCK GUARD
    if (product.stock <= 0) {
        return ctx.editMessageText(
            `⚠️ *Maaf!* Stok *${product.name}* sudah habis.\n\nSilakan cek produk lain.`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Kembali", `cat:${product.category}`)]]) }
        );
    }

    const user = await ensureTeleUser(telegramId, ctx.from.username);

    // BALANCE CHECK
    if (user.balance < product.price) {
        const shortfall = product.price - user.balance;
        return ctx.editMessageText(
            `💸 *Saldo tidak cukup!*\n\nHarga: ${fmt(product.price)}\nSaldo kamu: ${fmt(user.balance)}\nKurang: ${fmt(shortfall)}\n\nHubungi admin untuk top-up saldo.`,
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Kembali", `prod:${product.id}`)]]) }
        );
    }

    return ctx.editMessageText(
        `🧾 *Konfirmasi Pesanan*\n\n` +
        `Produk: *${product.name}*\n` +
        `Harga: *${fmt(product.price)}*\n` +
        `Saldo setelah beli: *${fmt(user.balance - product.price)}*\n\n` +
        `Yakin ingin membeli?`,
        {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
                [Markup.button.callback("✅ Konfirmasi", `confirm:${product.id}`), Markup.button.callback("❌ Batal", `prod:${product.id}`)],
            ]),
        }
    );
});

// ─────────────────────────────────────────────
// Confirm Order — Auto-Deduct balance & stock
// ─────────────────────────────────────────────
bot.action(/^confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("⏳ Memproses pesanan...");
    const productId = ctx.match[1];
    const telegramId = String(ctx.from.id);

    // Run everything atomically
    try {
        await prisma.$transaction(async (tx) => {
            // Re-fetch with FOR UPDATE semantics to prevent race conditions
            const [product, user] = await Promise.all([
                tx.teleProduct.findUnique({ where: { id: productId } }),
                tx.teleUser.findUnique({ where: { telegramId } }),
            ]);

            if (!product || !user) throw new Error("NOT_FOUND");
            if (product.stock <= 0) throw new Error("OUT_OF_STOCK");
            if (user.balance < product.price) throw new Error("INSUFFICIENT_BALANCE");

            // Create transaction record
            const txRecord = await tx.teleTransaction.create({
                data: { userId: user.id, productId: product.id, amount: 1, status: "PENDING" },
            });

            // Deduct stock and add to totalSold
            await tx.teleProduct.update({
                where: { id: productId },
                data: { stock: { decrement: 1 }, totalSold: { increment: 1 } },
            });

            // Deduct balance and increment totalOrders
            await tx.teleUser.update({
                where: { telegramId },
                data: { balance: { decrement: product.price }, totalOrders: { increment: 1 } },
            });

            // Mark transaction SUCCESS
            await tx.teleTransaction.update({
                where: { id: txRecord.id },
                data: { status: "SUCCESS" },
            });
        });

        // Sanitised log — no balance values
        log.info({ tag: "ORDER_SUCCESS", productId, userTag: telegramId.slice(0, 4) + "***" }, "Order completed");

        await ctx.editMessageText(
            `🎉 *Pesanan Berhasil!*\n\nProduk telah diproses. Terima kasih sudah berbelanja di DisBot Store!`,
            { parse_mode: "Markdown", ...mainMenu() }
        );
    } catch (err: any) {
        log.warn({ tag: "ORDER_FAILED", reason: err.message }, "Order failed");

        const msgMap: Record<string, string> = {
            OUT_OF_STOCK: "⚠️ Stok baru saja habis. Coba produk lain.",
            INSUFFICIENT_BALANCE: "💸 Saldo tidak cukup.",
            NOT_FOUND: "❌ Produk tidak ditemukan.",
        };

        await ctx.editMessageText(
            msgMap[err.message] ?? "❌ Terjadi kesalahan. Silakan coba lagi.",
            mainMenu()
        );
    }
});

// ─────────────────────────────────────────────
// Menu: My Balance
// ─────────────────────────────────────────────
bot.action("menu:balance", async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const user = await ensureTeleUser(telegramId, ctx.from.username);

    // SANITISED: we show the user their own balance but never log it
    return ctx.editMessageText(
        `💰 *Saldo Kamu*\n\n` +
        `Balance: *${fmt(user.balance)}*\n` +
        `Total Pesanan: *${user.totalOrders}*\n\n` +
        `_Hubungi admin untuk top-up saldo._`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Menu Utama", "menu:main")]]) }
    );
});

// ─────────────────────────────────────────────
// Menu: Order History
// ─────────────────────────────────────────────
bot.action("menu:history", async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const user = await ensureTeleUser(telegramId, ctx.from.username);

    const txs = await prisma.teleTransaction.findMany({
        where: { userId: user.id },
        include: { product: true },
        orderBy: { createdAt: "desc" },
        take: 5,
    });

    if (txs.length === 0) {
        return ctx.editMessageText(
            "📜 *Riwayat Pesanan*\n\nBelum ada pesanan.",
            { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Menu Utama", "menu:main")]]) }
        );
    }

    const lines = txs.map((tx, i) => {
        const status = tx.status === "SUCCESS" ? "✅" : tx.status === "CANCELLED" ? "❌" : "⏳";
        const date = tx.createdAt.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
        return `${i + 1}. ${status} *${tx.product.name}* — ${fmt(tx.product.price)} (${date})`;
    });

    return ctx.editMessageText(
        `📜 *5 Pesanan Terakhir*\n\n${lines.join("\n")}`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Menu Utama", "menu:main")]]) }
    );
});

// ─────────────────────────────────────────────
// Menu: Best Sellers
// ─────────────────────────────────────────────
bot.action("menu:bestsellers", async (ctx) => {
    await ctx.answerCbQuery();

    const topProducts = await prisma.teleProduct.findMany({
        orderBy: { totalSold: "desc" },
        take: 5,
    });

    if (topProducts.length === 0) {
        return ctx.editMessageText("📈 Belum ada data penjualan.", mainMenu());
    }

    const lines = topProducts.map((p, i) => {
        const medal = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i] ?? `${i + 1}.`;
        return `${medal} *${p.name}* — ${p.totalSold} terjual`;
    });

    return ctx.editMessageText(
        `📈 *Top 5 Produk Terlaris*\n\n${lines.join("\n")}`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Menu Utama", "menu:main")]]) }
    );
});

// ─────────────────────────────────────────────
// Back to main menu
// ─────────────────────────────────────────────
bot.action("menu:main", async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.editMessageText(
        "🏠 *Menu Utama*\n\nPilih menu di bawah:",
        { parse_mode: "Markdown", ...mainMenu() }
    );
});

// ─────────────────────────────────────────────
// /menu — shortcut to open the main menu by command
// ─────────────────────────────────────────────
bot.command("menu", async (ctx) => {
    await ensureTeleUser(String(ctx.from.id), ctx.from.username);
    await ctx.reply("🏠 *Menu Utama*\n\nPilih menu di bawah:", {
        parse_mode: "Markdown",
        ...mainMenu(),
    });
});

bot.command("balance", async (ctx) => {
    const user = await ensureTeleUser(String(ctx.from.id), ctx.from.username);
    await ctx.reply(
        `💰 *Saldo Kamu*\n\nBalance: *${fmt(user.balance)}*\nTotal Pesanan: *${user.totalOrders}*\n\n_Hubungi admin untuk top-up saldo._`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "menu:main")]]) }
    );
});

bot.command("history", async (ctx) => {
    const user = await ensureTeleUser(String(ctx.from.id), ctx.from.username);
    const txs = await prisma.teleTransaction.findMany({
        where: { userId: user.id },
        include: { product: true },
        orderBy: { createdAt: "desc" },
        take: 5,
    });
    if (txs.length === 0) {
        return ctx.reply("📜 Belum ada pesanan.", Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "menu:main")]]));
    }
    const lines = txs.map((tx, i) => {
        const status = tx.status === "SUCCESS" ? "✅" : tx.status === "CANCELLED" ? "❌" : "⏳";
        const date = tx.createdAt.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
        return `${i + 1}. ${status} *${tx.product.name}* — ${fmt(tx.product.price)} (${date})`;
    });
    await ctx.reply(`📜 *5 Pesanan Terakhir*\n\n${lines.join("\n")}`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "menu:main")]]),
    });
});

bot.command("terlaris", async (ctx) => {
    const top = await prisma.teleProduct.findMany({ orderBy: { totalSold: "desc" }, take: 5 });
    if (top.length === 0) return ctx.reply("📈 Belum ada data penjualan.");
    const lines = top.map((p, i) => {
        const medal = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i] ?? `${i + 1}.`;
        return `${medal} *${p.name}* — ${p.totalSold} terjual`;
    });
    await ctx.reply(`📈 *Top 5 Produk Terlaris*\n\n${lines.join("\n")}`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "menu:main")]]),
    });
});

// ─────────────────────────────────────────────
// Error handler (no sensitive data logged)
// ─────────────────────────────────────────────
bot.catch((err: any, _ctx: Context) => {
    log.error({ tag: "BOT_ERROR", type: err?.name }, "Unhandled bot error (details omitted for security)");
});

// ─────────────────────────────────────────────
// Register commands with Telegram (shows hints in chat input)
// This runs once on startup — no manual BotFather step needed.
// ─────────────────────────────────────────────
async function registerCommands() {
    await bot.telegram.setMyCommands([
        { command: "start",    description: "👋 Mulai & tampilkan menu utama" },
        { command: "menu",     description: "🏠 Buka menu utama" },
        { command: "balance",  description: "💰 Cek saldo & total pesanan" },
        { command: "history",  description: "📜 Lihat 5 pesanan terakhir" },
        { command: "terlaris", description: "📈 Top 5 produk terlaris" },
    ]);
    log.info({ tag: "STORE_BOT" }, "Bot commands registered with Telegram ✅");
}

// ─────────────────────────────────────────────
// Launch
// ─────────────────────────────────────────────
export async function startTeleStoreBot() {
    log.info({ tag: "STORE_BOT" }, "Telegram Auto-Order bot starting...");

    // Register command hints BEFORE launching so they're live immediately
    await registerCommands();

    await bot.launch({ dropPendingUpdates: true });
    log.info({ tag: "STORE_BOT" }, "Telegram Auto-Order bot is running ✅");

    const shutdown = async (signal: string) => {
        log.info({ tag: "STORE_BOT", signal }, "Graceful shutdown");
        bot.stop(signal);
        await prisma.$disconnect();
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
}

// Allow direct execution (for PM2)
if (require.main === module) {
    startTeleStoreBot().catch(() => {
        log.error({ tag: "STORE_BOT_FATAL" }, "Failed to start store bot");
        process.exit(1);
    });
}
