import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { name, price, stock, description, image, category } = body;

        const product = await prisma.teleProduct.update({
            where: { id: params.id, userId: session.user.id },
            data: {
                ...(name !== undefined && { name: String(name).trim() }),
                ...(price !== undefined && { price: parseFloat(price) }),
                ...(stock !== undefined && { stock: parseInt(stock, 10) }),
                ...(description !== undefined && { description: String(description).trim() }),
                ...(image !== undefined && { image: String(image).trim() }),
                ...(category !== undefined && { category: String(category).trim() }),
            },
        });

        return NextResponse.json({ product });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await prisma.teleProduct.delete({ where: { id: params.id, userId: session.user.id } });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
