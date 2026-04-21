/* Developer: BANGDET.MD */
import { addLocalisationToCommand } from "@/lib/localization.js"
import { PrettyLog, drawProgressBar } from "@/lib/pretty-log.js"
import { REST, RESTPostAPIChatInputApplicationCommandsJSONBody, Routes, SlashCommandBuilder, Snowflake } from "discord.js"
import fs from "fs"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let rest: REST | undefined

const commands: { cache: RESTPostAPIChatInputApplicationCommandsJSONBody[], expired: boolean } = { cache: [], expired: true }


async function getCommands() {
    if (!commands.expired) {
        return commands.cache
    }

    PrettyLog.info('Loading commands for deployment...', false)

    const commandsList: RESTPostAPIChatInputApplicationCommandsJSONBody[] = []
    const commandsPath = path.join(__dirname, 'commands')
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'))

    const commandsCount = commandFiles.length

    if (commandsCount === 0) {
        PrettyLog.error('No command files found.', false)
        process.exit(1)
    }

    PrettyLog.info(`Found ${commandsCount} command files.`, false)

    PrettyLog.info('Processing command files...', false)

    for (const [index, file] of commandFiles.entries()) {
        const filePath = path.join(commandsPath, file)
        const command = await import(pathToFileURL(filePath).href)
        
        if (!(command.data instanceof SlashCommandBuilder)) {
            PrettyLog.warn(`The command at ${filePath} is not a valid SlashCommandBuilder instance.`, false)
            continue
        }

        commandsList.push(await addLocalisationToCommand(command.data))
            
        drawProgressBar(((index + 1) / commandsCount) * 100)
    }
    drawProgressBar(100)
    console.log('')

    PrettyLog.info('All command files processed.', false)

    commands.cache = commandsList
    commands.expired = false
    return commandsList
}

export async function appDeployCommands() { 
    try {
        await getRest().put(Routes.applicationCommands(getClientId()), { body: await getCommands() })

        PrettyLog.success('Successfully registered application commands.', false)
        return true
    } catch (e) {
        PrettyLog.error('Failed to deploy commands', false)
        console.error(e)

        return false
    }
}


export async function appDeleteCommands() {
    try {    
        await getRest().put(Routes.applicationCommands(getClientId()), { body: [] })
        
        PrettyLog.success('Successfully deleted application commands.', false)
        return true
    }
    catch (e) {
        PrettyLog.error('Failed to deploy commands', false)
        console.error(e)

        return false
    }   
}

export async function guildDeployCommands(guildId: Snowflake) {
    try {
        await getRest().put(Routes.applicationGuildCommands(getClientId(), guildId), { body: await getCommands() })

        PrettyLog.success('Successfully registered all guild commands.', false)
        return true       
    }
    catch (e) {
        PrettyLog.error('Failed to deploy commands', false)
        console.error(e)

        return false
    }
}

export async function guildDeleteCommands(guildId: Snowflake) {
    try {    
        await getRest().put(Routes.applicationGuildCommands(getClientId(), guildId), { body: [] })
        
        PrettyLog.success('Successfully deleted all guild commands.', false)
        return true
    }
    catch (e) {
        PrettyLog.error('Failed to deploy commands', false)
        console.error(e)

        return false
    }
}


async function main() {
    const flag = process.argv[2]
    const guildId = process.argv[3]


    switch (flag) {
        case '/a':
            appDeployCommands()
            break

        case '/ad':
            appDeleteCommands()
            break

        case '/g':
            if (!guildId) {
                PrettyLog.error('Please specify a guild id', false)
                break
            }
            guildDeployCommands(guildId)
            break 
            
        case '/gd':
            if (!guildId) {
                PrettyLog.error('Please specify a guild id', false)
                break
            }
            guildDeleteCommands(guildId)
            break 

        default:
            PrettyLog.error('Please specify one of these flags: \n\n    /a  : Deploy App Commands\n    /ad : Delete App Commands\n    /g  : Deploy Guild Commands\n    /gd : Delete Guild Commands\n', false)
            process.exit(1)
    }
}


if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main()
}



function getRest() {
    if (rest !== undefined) return rest

    const token = getToken()

    if (!getClientId() || !token) {
        PrettyLog.error('Missing DISCORD_CLIENT_ID or DISCORD_TOKEN in .env', false)
        process.exit(1)
    }

    rest = new REST({ version: '10' }).setToken(token)
    
    return rest
}

function getClientId() {
    const clientId = process.env["DISCORD_CLIENT_ID"]

    if (!clientId) {
        PrettyLog.error('Missing DISCORD_CLIENT_ID environment variable')
        process.exit(1)
    }

    return clientId
}

function getToken() {
    const token = process.env["DISCORD_TOKEN"]

    if (!token) {
        PrettyLog.error('Missing DISCORD_TOKEN environment variable')
        process.exit(1)
    }

    return token
}