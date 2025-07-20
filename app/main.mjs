import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import 'dotenv/config';
import admin from 'firebase-admin';

const token = process.env.TOKEN;
const clientId = process.env.APPLICATION_ID;
const guildId = process.env.TEST_SERVER;

// FirebaseサービスアカウントのJSON文字列を環境変数から取得！
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
    .setName('login')
    .setDescription('一日一回1000ソーカが手に入ります。やったね！'),
  new SlashCommandBuilder()
    .setName('money')
    .setDescription('所持しているソーカを確認します'),
  new SlashCommandBuilder()
    .setName('create')
    .setDescription('新しい口座を作成します')
    .addStringOption(option =>
      option.setName('account')
        .setDescription('作成する口座名（ユニークな名前）')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('password')
        .setDescription('共有用パスワード（省略可能）')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('transfer')
  .setDescription('口座にソーカを送金します')
  .addStringOption(option =>
    option.setName('account')
      .setDescription('送金先の口座')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('amount')
      .setDescription('送金するソーカ')
      .setRequired(true)
  )

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

// Discordクライアント作成
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Bot起動時のログ
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// コマンド処理
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const db = admin.database();
  const userId = interaction.user.id;
  const user = interaction.user;

  if (interaction.commandName === 'login') {
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
        return await interaction.reply({ embeds: [embed] });
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

  else if (interaction.commandName === 'money') {
    const userRef = db.ref(`users/${userId}`);

    try {
      const snapshot = await userRef.once('value');
      const data = snapshot.val();

      let embed;

      if (!data) {
        embed = new EmbedBuilder()
          .setColor("#FFD700")
          .setTitle("残高確認")
          .setDescription(`あなたの現在の残高：0 ソーカ`);
      } else {
        const money = data.balance;
        embed = new EmbedBuilder()
          .setColor("#FFD700")
          .setTitle("残高確認")
          .setDescription(`あなたの現在の残高：${money} ソーカ`);
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

    } catch (error) {
      console.error(error);
      return await interaction.reply({
        content: '残高の取得中にエラーが発生しました。',
        ephemeral: true
      });
    }
  }

else if (interaction.commandName === 'create') {
  const accountName = interaction.options.getString('account', true);
  const password = interaction.options.getString('password') ?? null;
  const accountRef = db.ref(`accounts/${accountName}`);

  try {
    const snapshot = await accountRef.once('value');

    if (snapshot.exists()) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("口座を作成できませんでした。")
        .setDescription(`口座「${accountName}」はすでに存在しています。他の名前をお試しください。`);
      return await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    await accountRef.set({
      owner: userId,
      password: password,
      balance: 0,
      createdAt: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString()
    });

    // embed本文を構築
    let description = `口座「${accountName}」を作成しました！`;
    if (password) {
      description += `\n共有パスワード：\`${password}\``;
    }

    const embed = new EmbedBuilder()
      .setColor("#2ecc70")
      .setTitle("口座作成完了")
      .setDescription(description);

    return await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

  } catch (err) {
    console.error(err);
    return await interaction.reply({
      content: '口座の作成中にエラーが発生しました。',
      ephemeral: true
    });
  }
}
  
else if (interaction.commandName === 'transfer') {
  const userId = interaction.user.id;
  const accountName = interaction.options.getString('account');
  const amount = interaction.options.getInteger('amount');

  const userRef = db.ref(`users/${userId}`);
  const accountRef = db.ref(`accounts/${accountName}`);

  // データ取得
  const [userSnap, accountSnap] = await Promise.all([userRef.get(), accountRef.get()]);
  const userData = userSnap.val();
  const accountData = accountSnap.val();

  // バリデーション
  if (amount <= 0 || !Number.isInteger(amount)) {
    const nature_embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription(`金額は自然数で入力してください。`);
    return await interaction.reply({
      embeds: [nature_embed],
      ephemeral: true
    });
  }

  if (!userData || userData.balance == null) {
    const nodata_embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription(`あなたのデータがありません。/login してください。`);
    return await interaction.reply({
      embeds: [nodata_embed],
      ephemeral: true
    });
  }

  if (!accountData) {
    const notexist_embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription(`指定された口座は存在しません。`);
    return await interaction.reply({
      embeds: [notexist_embed],
      ephemeral: true
    });
  }

  if (userData.balance < amount) {
    const lessmoney_embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription(`残高が足りません。`);
    return await interaction.reply({
      embeds: [lessmoney_embed],
      ephemeral: true
    });
  }

  // 残高更新
  await userRef.update({ balance: userData.balance - amount });
  const newBalance = (accountData.balance || 0) + amount;
  await accountRef.update({ balance: newBalance });

  // DM送信
  const accountOwnerId = accountData.owner;
  try {
    const accountOwner = await client.users.fetch(accountOwnerId);
    const dm_embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("口座に入金されました")
      .setDescription(`${interaction.user.username} から ${accountName} に ${amount} ソーカ入金されました！\n口座の残高：${newBalance} ソーカ`);
    await accountOwner.send({ embeds: [dm_embed] });
  } catch (err) {
    console.error('DM送信に失敗しました:', err);
  }

  // 成功メッセージ
  const success_embed = new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle("送金成功")
    .setDescription(`${accountName} に ${amount} ソーカを入金しました！`);
  return await interaction.reply({
    embeds: [success_embed],
    ephemeral: true
  });
}
}
// Botログイン
client.login(token);

