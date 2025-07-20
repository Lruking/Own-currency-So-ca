import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';
import admin from 'firebase-admin';

const token = process.env.TOKEN;
const clientId = process.env.APPLICATION_ID;
const guildId = process.env.TEST_SERVER;

// FirebaseサービスアカウントのJSON文字列を環境変数から取得
const rawData = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!rawData) {
  console.error("環境変数が設定されていません");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(rawData);
} catch (err) {
  console.error("JSONのパースに失敗しました:", err);
  process.exit(1);
}

// Firebase初期化
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://own-currency-so-ca-default-rtdb.firebaseio.com/',
});

// Discordのスラッシュコマンド定義
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Ping Pong!'),
  new SlashCommandBuilder()
    .setName('login')
    .setDescription('一日一回1000ソーカが手に入ります。やったね！'),
  new SlashCommandBuilder()
    .setName('money')
    .setDescription('所持しているソーカを確認します'),
].map(command => command.toJSON());

// コマンド登録処理
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// Discordクライアント作成（ここがポイント！）
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Bot起動時のログ
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// コマンド受信時の処理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    const db = admin.database();
    const ref = db.ref('test/message');

    await ref.set('pong was called');

    const snapshot = await ref.once('value');
    const value = snapshot.val();

    await interaction.reply(`pong! DB says: ${value}`);
  }

  if (interaction.commandName === 'login') {
    const db = admin.database();
    const userId = interaction.user.id;
    const userRef = db.ref(`users/${userId}`);

    // JSTの日付を取得
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0];

    try {
      const snapshot = await userRef.once('value');
      const data = snapshot.val();

      if (!data) {
        await userRef.set({
          balance: 1000,
          lastLogin: today
        });
        return await interaction.reply('ログイン成功！初めての1000ソーカを受け取りました！');
      }

      if (data.lastLogin === today) {
        return await interaction.reply('今日はもうログインボーナスを受け取っています。また明日来てね！');
      }

      const newBalance = data.balance + 1000;
      await userRef.set({
        balance: newBalance,
        lastLogin: today
      });

      return await interaction.reply(`ログイン成功！1000ソーカ追加されました。現在の残高は ${newBalance} ソーカです。`);
    } catch (error) {
      console.error("エラーが発生しました:", error);
      return await interaction.reply('エラーが発生しました。もう一度試してください。');
    }
  }

  if (interaction.commandName === 'money') {
    const db = admin.database();
    const userId = interaction.user.id;
    const userRef = db.ref(`users/${userId}`);

    try {
      const snapshot = await userRef.once('value');
      const data = snapshot.val();

      if (!data) {
        await interaction.reply({
          content: `あなたの残高は 0 ソーカです。`,
          ephemeral: true
        });
      } else {
        const money = data.balance;
        await interaction.reply({
          content: `あなたの残高は ${money} ソーカです。`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error(error);
      return await interaction.reply('残高の取得中にエラーが発生しました。');
    }
  }
});

// Botログイン
client.login(token);
