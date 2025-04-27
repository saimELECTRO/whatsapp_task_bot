import * as Baileys from "@whiskeysockets/baileys";
import qr from "qrcode-terminal";
import { MongoClient } from "mongodb";  // <-- MongoDB Import

const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = Baileys;
// Your MongoDB URI (replace inside quotes)
const uri = "mongodb+srv://saimwhatsappbot:gulazi1are@cluster0.muffqsn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";


const client = new MongoClient(uri);
let tasksCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    const db = client.db("whatsappBot");
    tasksCollection = db.collection("tasks");
    console.log("✅ Connected to MongoDB Atlas!");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
  }
}

async function startWhatsApp() {
  await connectDB();   // Connect to database first

  const { state, saveCreds } = await useMultiFileAuthState("./auth_info_baileys");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using WA v${version.join(".")}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: (qrString) => {
      qr.generate(qrString, { small: true });
    },
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    console.log("Connection update:", connection);
    if (connection === "close") {
      console.log("Disconnected — reconnecting...");
      if (lastDisconnect.error && lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut) {
        startWhatsApp();
      }
    } else if (connection === "open") {
      console.log("✅ Connection opened!");
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;
    const msg = m.messages[0];
    const jid = msg.key.remoteJid;
    const messageText = msg.message?.conversation?.toLowerCase() || "";

    if (jid && !msg.key.fromMe) {
      console.log("Incoming:", msg.message);

      if (messageText.startsWith('!addtask')) {
        const task = messageText.replace('!addtask', '').trim();
        if (task) {
          await tasksCollection.insertOne({ task });
          sock.sendMessage(jid, { text: `Task added: ${task}` });
        } else {
          sock.sendMessage(jid, { text: "Please specify a task after the !addtask command." });
        }
      }

      else if (messageText.startsWith('!removetask')) {
        const taskToRemove = messageText.replace('!removetask', '').trim();
        if (taskToRemove) {
          await tasksCollection.deleteOne({ task: taskToRemove });
          sock.sendMessage(jid, { text: `Task removed: ${taskToRemove}` });
        } else {
          sock.sendMessage(jid, { text: "Please specify the task to remove." });
        }
      }

      else if (messageText.startsWith('!tello')) {
        const tasks = await tasksCollection.find().toArray();
        if (tasks.length === 0) {
          sock.sendMessage(jid, { text: "No tasks available." });
        } else {
          let taskListMessage = "Current Task List:\n";
          tasks.forEach((task, index) => {
            taskListMessage += `${index + 1}. ${task.task}\n`;
          });
          sock.sendMessage(jid, { text: taskListMessage });
        }
      }

      else if (messageText.startsWith('!reset') || messageText.startsWith('!resettask')) {
        await tasksCollection.deleteMany({});
        sock.sendMessage(jid, { text: "All tasks have been reset." });
      }

      const keywords = ['submit', 'submitted', 'compensation class', 'check', 'checked', 'cep', 'oel', 'task', 'assessment'];
      const isKeywordMatch = keywords.some(keyword => messageText.includes(keyword));
      if (isKeywordMatch) {
        const autoTask = `Auto Task: ${messageText}`;
        await tasksCollection.insertOne({ task: autoTask });
        sock.sendMessage(jid, { text: `Task automatically added: ${autoTask}` });
      }
    }
  });
}

startWhatsApp();
