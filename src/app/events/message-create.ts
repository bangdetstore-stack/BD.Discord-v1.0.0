/* Developer: BANGDET.MD */
import { Events, Message, ChannelType } from "discord.js"
import { handleScreenshotDm } from "@/features/warranty/warranty-flow.js"
import { handleStickyMessage } from "@/features/sticky/sticky-handler.js"

export const name = Events.MessageCreate

export async function execute(message: Message): Promise<void> {
    if (message.author.bot) return

    // ── DM: tangani screenshot garansi ───────────────────────────────────────
    if (message.channel.type === ChannelType.DM) {
        if (message.attachments.size) await handleScreenshotDm(message)
        return
    }

    // ── Guild: proses sticky message ─────────────────────────────────────────
    await handleStickyMessage(message).catch(() => {})
}
