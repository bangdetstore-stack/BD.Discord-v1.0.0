/* Developer: BANGDET.MD */
import {
    ChatInputCommandInteraction,
    Client,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js"
import {
    handleStockAddStart,
    handleStockView,
    handleStockClearStart,
} from "@/features/shops/stock-handler.js"

export const data = new SlashCommandBuilder()
    .setName("stock")
    .setDescription("Kelola stok produk digital")
    .addSubcommand(sub => sub
        .setName("add")
        .setDescription("Tambah item stok ke produk")
    )
    .addSubcommand(sub => sub
        .setName("view")
        .setDescription("Lihat jumlah stok semua produk")
    )
    .addSubcommand(sub => sub
        .setName("clear")
        .setDescription("Hapus semua stok dari produk tertentu")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

export async function execute(_client: Client, interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand()

    switch (sub) {
        case "add":
            await handleStockAddStart(interaction)
            break
        case "view":
            await handleStockView(interaction)
            break
        case "clear":
            await handleStockClearStart(interaction)
            break
    }
}
