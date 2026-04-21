/* Developer: BANGDET.MD */
import { Events, GuildMember } from "discord.js"
import { handleMemberJoinRole } from "@/features/roles/role-handler.js"
import { PrettyLog } from "@/lib/pretty-log.js"

export const name = Events.GuildMemberAdd

export async function execute(member: GuildMember): Promise<void> {
    try {
        await handleMemberJoinRole(member)
    } catch (e) {
        PrettyLog.error(`[Roles] Gagal beri role join ke ${member.user.username}: ${e}`)
    }
}
