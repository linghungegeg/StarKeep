import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { dashboard } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  return NextResponse.json(await dashboard(userId, page));
}
