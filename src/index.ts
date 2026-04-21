/* Developer: BANGDET.MD */
import "@/utils/strings.js"
import "@/lib/localization.js"
import "dotenv/config"

import { startClient } from "./app/client/client.js"
import { PrettyLog } from "./lib/pretty-log.js"



if (process.env["NODE_ENV"] && process.env.NODE_ENV === "development") {
	PrettyLog.warn("Development mode enabled")
	PrettyLog.warn("Errors won\"t be caught by the error handler")
}
else {
	process.on("unhandledRejection", (reason: unknown) => PrettyLog.error(`${reason}`))
	process.on("uncaughtException", (reason: unknown) => PrettyLog.error(`${reason}`))
	process.on("uncaughtExceptionMonitor", (reason: unknown) => PrettyLog.error(`${reason}`))
}

import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import fs from "node:fs/promises"
import path from "node:path"
import { drawProgressBar } from "./lib/pretty-log.js"

async function showCoolBanner() {
    console.clear()
    const _0xabc123 = Buffer.from('Clx4MWJbMzZt4paI4paI4paI4paI4paI4paI4pWXICDilojilojilojilojilojilZcg4paI4paI4paI4pWXICAg4paI4paI4pWXIOKWiOKWiOKWiOKWiOKWiOKWiOKVlyDilojilojilojilojilojilojilZcg4paI4paI4paI4paI4paI4paI4paI4pWX4paI4paI4paI4paI4paI4paI4paI4paI4pWXICAg4paI4paI4paI4pWXICAg4paI4paI4paI4pWX4paI4paI4paI4paI4paI4paI4pWXIFx4MWJbMG0KXHgxYlszNm3ilojilojilZTilZDilZDilojilojilZfilojilojilZTilZDilZDilojilojilZfilojilojilojilojilZcgIOKWiOKWiOKVkeKWiOKWiOKVlOKVkOKVkOKVkOKVkOKVnSDilojilojilZTilZDilZDilojilojilZfilojilojilZTilZDilZDilZDilZDilZ3ilZrilZDilZDilojilojilZTilZDilZDilZ0gICDilojilojilojilojilZcg4paI4paI4paI4paI4pWR4paI4paI4pWU4pWQ4pWQ4paI4paI4pWXXHgxYlswbQpceDFiWzM2beKWiOKWiOKWiOKWiOKWiOKWiOKVlOKVneKWiOKWiOKWiOKWiOKWiOKWiOKWiOKVkeKWiOKWiOKVlOKWiOKWiOKVlyDilojilojilZHilojilojilZEgIOKWiOKWiOKWiOKVl+KWiOKWiOKVkSAg4paI4paI4pWR4paI4paI4paI4paI4paI4pWXICAgICDilojilojilZEgICAgICDilojilojilZTilojilojilojilojilZTilojilojilZHilojilojilZEgIOKWiOKWiOKVkVx4MWJbMG0KXHgxYlszNm3ilojilojilZTilZDilZDilojilojilZfilojilojilZTilZDilZDilojilojilZHilojilojilZHilZrilojilojilZfilojilojilZHilojilojilZEgICDilojilojilZHilojilojilZEgIOKWiOKWiOKVkeKWiOKWiOKVlOKVkOKVkOKVnSAgICAg4paI4paI4pWRICAgICAg4paI4paI4pWR4pWa4paI4paI4pWU4pWd4paI4paI4pWR4paI4paI4pWRICDilojilojilZFceDFiWzBtClx4MWJbMzZt4paI4paI4paI4paI4paI4paI4pWU4pWd4paI4paI4pWRICDilojilojilZHilojilojilZEg4pWa4paI4paI4paI4paI4pWR4pWa4paI4paI4paI4paI4paI4paI4pWU4pWd4paI4paI4paI4paI4paI4paI4pWU4pWd4paI4paI4paI4paI4paI4paI4paI4pWXICAg4paI4paI4pWRICAgICAg4paI4paI4pWRIOKVmuKVkOKVnSDilojilojilZHilojilojilojilojilojilojilZTilZ1ceDFiWzBtClx4MWJbMzZt4pWa4pWQ4pWQ4pWQ4pWQ4pWQ4pWdIOKVmuKVkOKVnSAg4pWa4pWQ4pWd4pWa4pWQ4pWdICDilZrilZDilZDilZDilZ0g4pWa4pWQ4pWQ4pWQ4pWQ4pWQ4pWdIOKVmuKVkOKVkOKVkOKVkOKVkOKVnSDilZrilZDilZDilZDilZDilZDilZDilZ0gICDilZrilZDilZ0gICAgICDilZrilZDilZ0gICAgIOKVmuKVkOKVneKVmuKVkOKVkOKVkOKVkOKVkOKVnSBceDFiWzBtCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKXHgxYlszNW0+Pj4gREVWRUxPUEVEIEJZOiBCQU5HREVULk1EIDw8PFx4MWJbMG0KXHgxYls5MG09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1ceDFiWzBtCg==', 'base64').toString('utf8');
    console.log(_0xabc123)

    for (let i = 0; i <= 100; i += 5) {
        drawProgressBar(i, 40)
        await new Promise(r => setTimeout(r, 40))
    }
    console.log("\n\x1b[32m[SYSTEM] Bot is initializing...\x1b[0m\n")
}

async function checkAndPromptEnv() {
    const requiredKeys = [
        { key: "DISCORD_TOKEN", label: "Discord Bot Token", link: "https://discord.com/developers/applications" },
        { key: "DISCORD_CLIENT_ID", label: "Discord Client ID", link: "https://discord.com/developers/applications" }
    ]

    let envContent = ""
    try {
        envContent = await fs.readFile(path.join(process.cwd(), ".env"), "utf8")
    } catch {
        // ignore if not exists
    }

    let modified = false
    let rl: readline.Interface | null = null

    for (const req of requiredKeys) {
        const val = process.env[req.key]
        if (!val || val.trim() === "") {
            if (!rl) rl = readline.createInterface({ input, output })
            
            console.log(`\n\x1b[33m[!] Peringatan: ${req.key} belum diisi!\x1b[0m`)
            console.log(`\x1b[36m💡 Tutorial: Dapatkan dari ${req.link}\x1b[0m`)
            const answer = await rl.question(`\x1b[32m>>> Masukkan ${req.label} kamu: \x1b[0m`)
            
            if (answer.trim()) {
                process.env[req.key] = answer.trim()
                const regex = new RegExp(`^${req.key}=.*`, 'm')
                if (regex.test(envContent)) {
                    envContent = envContent.replace(regex, `${req.key}=${answer.trim()}`)
                } else {
                    envContent += `\n${req.key}=${answer.trim()}`
                }
                modified = true
            } else {
                console.log(`\n\x1b[31m[X] Sistem tidak bisa berjalan tanpa ${req.key}. Bot dihentikan.\x1b[0m`)
                process.exit(1)
            }
        }
    }

    if (rl) rl.close()

    if (modified) {
        await fs.writeFile(path.join(process.cwd(), ".env"), envContent.trim() + '\n')
        console.log(`\x1b[32m[✓] Kredensial berhasil disimpan otomatis ke file .env!\x1b[0m\n`)
    }
}

async function bootstrap() {
    await showCoolBanner()
    await checkAndPromptEnv()
    startClient()
}

bootstrap().catch(e => PrettyLog.error(`Bootstrap error: ${e}`))
