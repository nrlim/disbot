import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const products = await prisma.teleProduct.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            include: { _count: { select: { transactions: true } } },
        });

        return NextResponse.json({ products });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { name, price, stock, description, image, category } = body;

        if (!name || price === undefined || stock === undefined) {
            return NextResponse.json({ error: "name, price and stock are required" }, { status: 400 });
        }

        const product = await prisma.teleProduct.create({
            data: {
                userId: session.user.id,
                name: String(name).trim(),
                price: parseFloat(price),
                stock: parseInt(stock, 10),
                description: description ? String(description).trim() : null,
                image: image ? String(image).trim() : null,
                category: category ? String(category).trim() : "General",
            },
        });

        return NextResponse.json({ product }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
