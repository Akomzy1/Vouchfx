/**
 * GET /api/telegram/channels
 *
 * Returns the list of Telegram channels and groups the authenticated user
 * belongs to, by connecting a temporary GramJS client with their stored session.
 *
 * Only channels (broadcast) and supergroups/groups are returned.
 * Direct messages and bots are excluded.
 *
 * Response: { channels: TelegramDialog[] }
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/telegram/auth-user";
import {
  requireTelegramEnv,
  createGramJsClient,
  loadUserSession,
} from "@/lib/telegram/gramjs";

export const runtime = "nodejs";

export interface TelegramDialog {
  chatId: string;
  title: string;
  isChannel: boolean;
  isMegagroup: boolean;
  participantsCount: number | null;
}

export async function GET() {
  const userResult = await requireUser();
  if (userResult instanceof NextResponse) return userResult;
  const { userId } = userResult;

  let env: ReturnType<typeof requireTelegramEnv>;
  try {
    env = requireTelegramEnv();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const session = await loadUserSession(userId, env.encryptionKey);
  if (!session) {
    return NextResponse.json({ error: "Telegram not connected" }, { status: 400 });
  }

  const client = createGramJsClient(
    { apiId: session.apiId, apiHash: env.apiHash },
    session.sessionString
  );

  try {
    await client.connect();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dialogs: any[] = await client.getDialogs({ limit: 200 });

    const channels: TelegramDialog[] = [];

    for (const dialog of dialogs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entity = dialog.entity as any;
      if (!entity) continue;

      // Include only channels and groups; skip DMs, bots, etc.
      const className: string = entity.className ?? "";
      if (className !== "Channel" && className !== "Chat") continue;

      // dialog.id is the full peer ID (negative for channels/groups)
      const chatId = dialog.id?.toString() ?? entity.id?.toString();
      if (!chatId) continue;

      channels.push({
        chatId,
        title: (dialog.title ?? entity.title ?? "Unknown") as string,
        isChannel: entity.broadcast === true,
        isMegagroup: entity.megagroup === true,
        participantsCount:
          typeof entity.participantsCount === "number"
            ? entity.participantsCount
            : null,
      });
    }

    return NextResponse.json({ channels });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
}
