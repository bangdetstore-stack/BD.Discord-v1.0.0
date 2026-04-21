/* Developer: BANGDET.MD */
import { SlashCommandBuilder, Client, ChatInputCommandInteraction } from "discord.js"
import { handleKomplainCommand } from "@/features/warranty/claim-handler.js"

export const data = new SlashCommandBuilder()
    .setName("komplain")
    .setDescription("Ajukan komplain / klaim garansi untuk produk yang sudah dibeli")

export async function execute(_client: Client, interaction: ChatInputCommandInteraction) {
    await handleKomplainCommand(interaction)
}
