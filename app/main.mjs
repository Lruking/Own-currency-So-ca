import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
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
  const user = interaction.user;
  const userRef = db.ref(`users/${userId}`);

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0];

  try {
    const snapshot = await userRef.once('value');
    const data = snapshot.val();
    const avatarUrl = user.displayAvatarURL({ dynamic: true, size: 1024 });

    if (!data) {
      await userRef.set({
        balance: 1000,
        lastLogin: today
      });

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("ログイン成功！")
        .setDescription(`@everyone\n${user.username} さんが初めてログインし、1000ソーカを受け取りました！\n現在の残高：1000 ソーカ`)
        .setFooter({
          text: user.username,
          iconURL: avatarUrl
        })
        .setThumbnail(avatarUrl);

      return await interaction.reply({ embeds: [embed], allowedMentions: { parse: ['everyone'] } });
    }

    if (data.lastLogin === today) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("ログイン済")
        .setDescription(`今日のログボは既に受け取っています。\nまた受け取れる明日までお待ちください。`)
        .setFooter({
          text: user.username,
          iconURL: avatarUrl
        })
        .setThumbnail(avatarUrl);
      return await interaction.reply({ embeds: [embed]});
    }

    const newBalance = data.balance + 1000;
    await userRef.set({
      balance: newBalance,
      lastLogin: today
    });

    const embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("ログイン成功！")
      .setDescription(`@everyone\n${user.username} さんが今日ログインし、1000ソーカを受け取りました！\n現在の残高：${newBalance} ソーカ`)
      .setFooter({
        text: user.username,
        iconURL: avatarUrl
      })
      .setThumbnail(avatarUrl);

    return await interaction.reply({ embeds: [embed], allowedMentions: { parse: ['everyone'] } });

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
          const embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("残高確認")
      .setDescription(`あなたの現在の残高：0 ソーカ`)
      .setFooter({
      })
        await interaction.reply({
      embeds: [embed],
      ephemeral: true // ←これを忘れずに！
    });
      } else {
        const money = data.balance;
          const embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("残高確認")
      .setDescription(`あなたの現在の残高：${money} ソーカ`)
      .setFooter({
      })
        await interaction.reply({
      embeds: [embed],
      ephemeral: true // ←これを忘れずに！
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
