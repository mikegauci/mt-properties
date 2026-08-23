import { NextResponse } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function requireApiSecret(request: Request): NextResponse | null {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return null;
  if (request.headers.get("x-revalidate-secret") === secret) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function rateLimit(
  request: Request,
  key: string,
  limit = 20,
  windowMs = 60_000,
): NextResponse | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const current = buckets.get(bucketKey);
  if (!current || now >= current.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (current.count >= limit) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  current.count += 1;
  return null;
}
