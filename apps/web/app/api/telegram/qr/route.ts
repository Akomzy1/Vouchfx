/**
 * GET /api/telegram/qr
 * Server-Sent Events stream for QR-code Telegram login.
 *
 * Events:
 *   data: { type: 'qr', dataUrl: string }   — show this QR image; refreshed ~30s
 *   data: { type: 'success' }               — user scanned + approved; session stored
 *   data: { type: 'error', message: string }
 *
 * The stream closes after success or error.
 * Timeout: 120s (2 QR cycles of ~30s each + buffer).
 */
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireUser } from "@/lib/telegram/auth-user";
import { requireTelegramEnv, createGramJsClient, storeSession } from "@/lib/telegram/gramjs";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const userResult = await requireUser();
  if (userResult instanceof NextResponse) return userResult;
  const { userId } = userResult;

  const env = requireTelegramEnv();
  const enc = new TextEncoder();

  function sse(payload: object): Uint8Array {
    return enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const client = createGramJsClient(env);

      try {
        await client.connect();

        // GramJS will call qrCode callback each time the QR refreshes,
        // then resolves the await when authentication completes.
        await (client as any).start({
          qrCode: async ({ token }: { token: Buffer }) => {
            const link = `tg://login?token=${token.toString("base64url")}`;
            const dataUrl = await QRCode.toDataURL(link);
            controller.enqueue(sse({ type: "qr", dataUrl }));
          },
          onError: async (err: Error) => {
            controller.enqueue(sse({ type: "error", message: err.message }));
          },
        });

        // Auth succeeded
        const sessionString = (client.session.save() as unknown as string) ?? "";
        await storeSession(userId, sessionString, env.apiId, env.apiHash.slice(0, 4), env.encryptionKey);
        controller.enqueue(sse({ type: "success" }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(sse({ type: "error", message: msg }));
      } finally {
        try { await client.disconnect(); } catch { /* ignore */ }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
