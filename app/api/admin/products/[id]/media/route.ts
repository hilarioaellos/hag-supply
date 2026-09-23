import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const BUCKET = "product-media";
const MAX_IMAGES = 5;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
  };
  return map[mime] ?? ".bin";
}

// POST /api/admin/products/[id]/media — upload a file
export const POST = withAdmin(async (req: NextRequest, context: unknown) => {
  const params = await (context as { params: Promise<{ id: string }> }).params;
  const productId = params.id;

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "File type not allowed. Use jpg, png, webp, mp4 or webm." },
      { status: 400 }
    );
  }

  const existing = await db.productMedia.findMany({
    where: { productId },
    select: { type: true, order: true },
  });

  if (isImage) {
    const imageCount = existing.filter((m) => m.type === "IMAGE").length;
    if (imageCount >= MAX_IMAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_IMAGES} images per product.` },
        { status: 400 }
      );
    }
  }

  if (isVideo) {
    const videoCount = existing.filter((m) => m.type === "VIDEO").length;
    if (videoCount >= 1) {
      return NextResponse.json(
        { error: "Only 1 video per product allowed." },
        { status: 400 }
      );
    }
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { error: "Video exceeds 50MB limit." },
        { status: 400 }
      );
    }
  }

  const ext = extFromMime(file.type);
  const folder = isImage ? "images" : "video";
  const storagePath = `${productId}/${folder}/${randomUUID()}${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseAdmin();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  const nextOrder = isImage
    ? existing.filter((m) => m.type === "IMAGE").length
    : 0;

  const media = await db.productMedia.create({
    data: {
      productId,
      type: isImage ? "IMAGE" : "VIDEO",
      url: publicUrlData.publicUrl,
      storagePath,
      order: nextOrder,
      size: file.size,
    },
  });

  return NextResponse.json(media, { status: 201 });
});

// DELETE /api/admin/products/[id]/media?mediaId=xxx
export const DELETE = withAdmin(async (req: NextRequest, context: unknown) => {
  const params = await (context as { params: Promise<{ id: string }> }).params;
  const mediaId = req.nextUrl.searchParams.get("mediaId");

  if (!mediaId) {
    return NextResponse.json({ error: "mediaId required" }, { status: 400 });
  }

  const media = await db.productMedia.findFirst({
    where: { id: mediaId, productId: params.id },
  });

  if (!media) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  await supabase.storage.from(BUCKET).remove([media.storagePath]);
  await db.productMedia.delete({ where: { id: mediaId } });

  return NextResponse.json({ ok: true });
});

// PATCH /api/admin/products/[id]/media — reorder [{ id, order }]
export const PATCH = withAdmin(async (req: NextRequest, context: unknown) => {
  const params = await (context as { params: Promise<{ id: string }> }).params;
  const body = await req.json();
  const items: { id: string; order: number }[] = body?.items ?? [];

  await Promise.all(
    items.map((item) =>
      db.productMedia.updateMany({
        where: { id: item.id, productId: params.id },
        data: { order: item.order },
      })
    )
  );

  return NextResponse.json({ ok: true });
});
