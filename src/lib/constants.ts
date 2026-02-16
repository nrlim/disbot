export const PLAN_LIMITS: Record<string, number> = {
    FREE: 1,
    STARTER: 6,
    PRO: 20,
    ELITE: 50
};

export const PLAN_PLATFORMS: Record<string, string[]> = {
    FREE: ['DISCORD'],
    STARTER: ['DISCORD'],
    PRO: ['DISCORD', 'TELEGRAM'],
    ELITE: ['DISCORD', 'TELEGRAM'],
};

export const DISCORD_ADMIN_LINK = "https://discord.com/users/1216488049199026359";

export const PLAN_DETAILS = [
    {
        name: "STARTER",
        price: 75000,
        priceLabel: "Rp 75.000",
        normalPrice: 99000,
        normalPriceLabel: "Rp 99.000",
        limit: PLAN_LIMITS.STARTER,
        message: "Halo admin DISBOT, saya tertarik berlangganan Paket Starter seharga Rp 75.000/bulan.",
        weight: 1,
        features: ["6 Mirror Paths", "Discord Only"]
    },
    {
        name: "PRO",
        price: 199000,
        priceLabel: "Rp 199.000",
        limit: PLAN_LIMITS.PRO,
        message: "Halo admin DISBOT, saya ingin upgrade ke Paket Pro seharga Rp 199.000/bulan untuk 20 mirror paths.",
        weight: 2,
        features: ["20 Mirror Paths", "Discord + Telegram", "Custom Watermark"]
    },
    {
        name: "ELITE",
        price: 499000,
        priceLabel: "Rp 499.000",
        normalPrice: 749000,
        normalPriceLabel: "Rp 749.000",
        label: "FLASH SALE",
        limit: PLAN_LIMITS.ELITE,
        message: "Halo admin DISBOT, saya ingin berlangganan Paket Elite seharga Rp 499.000/bulan (Flash Sale). Saya butuh Dedicated Instance, Custom Blur, dan Ghost Mirroring.",
        weight: 3,
        features: ["50 Mirror Paths", "Smart Custom Blur", "Ghost Mirroring (MTProto)", "Dedicated Stream Process", "Custom Watermark"]
    }
];
