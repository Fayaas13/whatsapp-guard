const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const express = require('express')
const QRCode = require('qrcode')

const app = express()
const PORT = process.env.PORT || 8000
let qrImage = null
let connected = false
const history = {}

// Spam Detect Logic
function isSpam(sender, text) {
    const now = Date.now()
    if (!history[sender]) history[sender] = []
    history[sender] = history[sender].filter(x => now - x.t < 15000)
    history[sender].push({ t: now, txt: text })
    if (history[sender].length > 5) return true
    if (history[sender].filter(x => x.txt === text).length >= 3) return true
    if (text.includes('http') && /win|prize|lottery|click|offer|free/i.test(text)) return true
    return false
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({ auth: state, printQRInTerminal: false })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u
        if (qr) {
            qrImage = await QRCode.toDataURL(qr)
            connected = false
        }
        if (connection === 'open') {
            connected = true
            qrImage = null
            console.log("BOT CONNECTED")
        }
        if (connection === 'close') {
            connected = false
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
            if (shouldReconnect) setTimeout(startBot, 3000)
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0]
        if (!m.message || m.key.fromMe) return
        const sender = m.key.remoteJid
        const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || ""
        if (!text) return

        if (isSpam(sender, text)) {
            console.log(`SPAM BLOCKED: ${sender}`)
            try {
                await sock.sendMessage(sender, { text: "🚫 Spam Bot Detected. You are blocked by Guard Bot." })
                await sock.updateBlockStatus(sender, "block")
            } catch (e) { console.log(e) }
        }
    })
}

// Web Routes
app.get('/ping', (req, res) => res.send('Alive - 24/7 Guard Running'))

app.get('/', (req, res) => {
    if (connected) {
        return res.send(`<body style="background:#0a0a0a;color:#25D366;font-family:sans-serif;text-align:center;padding-top:80px;"><h1>✅ Guard Bot 24/7 Online</h1><p>Spam bot ලා දැන් auto-block වෙනවා. මේ tab එක close කරන්න එපා, minimize කරලා තියන්න.</p><p>Log: ${Object.keys(history).length} numbers checked</p></body>`)
    }
    if (qrImage) {
        return res.send(`
        <body style="font-family:sans-serif;text-align:center;background:#f0f2f5;margin:0">
            <div style="background:white;max-width:380px;margin:40px auto;padding:25px;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.1)">
                <h2 style="margin:0">WhatsApp Guard 24/7</h2>
                <p style="color:#555">WhatsApp > Linked Devices > Link a Device</p>
                <img src="${qrImage}" style="width:100%;border-radius:15px;border:4px solid #25D366" />
                <p style="font-size:12px;color:#888">QR එක තත්පර 30න් expire වෙනවා. Auto refresh වෙනවා.</p>
            </div>
            <script>setTimeout(()=>location.reload(),25000)</script>
        </body>`)
    }
    res.send(`<h2 style="text-align:center;margin-top:100px;font-family:sans-serif;">Bot Starting...<br>තත්පර 5න් refresh වෙනවා</h2><script>setTimeout(()=>location.reload(),5000)</script>`)
})

app.listen(PORT, () => console.log("Running on " + PORT))
startBot()