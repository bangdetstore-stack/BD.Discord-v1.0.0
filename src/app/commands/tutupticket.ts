/* Developer: BANGDET.MD */
import { SlashCommandBuilder, Client, ChatInputCommandInteraction } from "discord.js"
import { handleTutupticketCommand } from "@/features/warranty/claim-handler.js"

export const data = new SlashCommandBuilder()
    .setName("tutupticket")
    .setDescription("Tutup tiket komplain garansi yang sedang aktif (gunakan di dalam thread tiket)")

export async function execute(_client: Client, interaction: ChatInputCommandInteraction) {
    await handleTutupticketCommand(interaction)
}
