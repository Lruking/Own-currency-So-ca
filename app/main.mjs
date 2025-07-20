import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';
import admin from 'firebase-admin';

const token = process.env.TOKEN;
const clientId = process.env.APPLICATION_ID;
const guildId = process.env.TEST_SERVER;

// main.mjs の例
let rawData = process.env.FIREBASE_SERVICE_ACCOUNT_JSON; // ← env から取得しているならここが undefined の可能性

if (!rawData) {
  console.error("環境変数が設定されていません");
  process.exit(1); // graceful に終了
}

let data;
try {
  data = JSON.parse(rawData);
} catch (err) {
  console.error("JSONのパースに失敗しました:", err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://own-currency-so-ca-default-rtdb.firebaseio.com/',  // ご自身のFirebaseのRealtime Database URLに変えてください。
});

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Ping Pong!'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    // ギルドコマンドとして登録（即時反映）
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    // Firebase Realtime Databaseの例（自由に変えてください）
    const db = admin.database();
    const ref = db.ref('test/message');

    await ref.set('pong was called');

    const snapshot = await ref.once('value');
    const value = snapshot.val();

    await interaction.reply(`pong! DB says: ${value}`);
  }
});

client.login(token);
