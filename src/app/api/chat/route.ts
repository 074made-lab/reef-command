/** POST { message } → ChatResponse. Thin HTTP shim over the router —
 *  swap routeChat for the LLM agent runtime and this file doesn't change. */

import { NextResponse } from "next/server";
import { routeChat } from "@/lib/router";

export async function POST(req: Request) {
  let message = "";
  try {
    const body = (await req.json()) as { message?: unknown };
    message = typeof body.message === "string" ? body.message : "";
  } catch {
    // empty body → fallback route
  }
  const response = await routeChat(message);
  return NextResponse.json(response);
}
