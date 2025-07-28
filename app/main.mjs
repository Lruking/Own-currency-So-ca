import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import 'dotenv/config';
import admin from 'firebase-admin';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

const token = process.env.TOKEN;
const clientId = process.env.APPLICATION_ID;
const guildId = process.env.TEST_SERVER;
const app = express();
const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API,  // .envの変数を渡す
});

const ask_soka = async (content) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `あなたの名前は「ソーカ」です。あなたは仮想通貨「ソーカ」の公式Discordボットです。一人称は「ソーカ」、または自分の名前「ソーカ」としてください。次のようなルールに従って応答してください：1. 「あなたの名前は何ですか？」のような、明示的にカッコで囲まれたメッセージ **のみ** に反応してください。2. カッコ【外】のメッセージには **絶対に反応しないでください**。3. 指示されたカッコ内の内容だけに基づいて、ソーカとして返答してください。それ以外のメッセージは無視してください。「${content}」`,
  });
  return response.text();
};

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
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('送金するソーカ')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('口座から残高を引き出します')
    .addStringOption(option =>
      option.setName('account')
        .setDescription('口座名')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('引き出す金額')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('password')
        .setDescription('共有パスワード（任意）')
        .setRequired(false)),
  new SlashCommandBuilder()
  .setName('check')
  .setDescription('口座の残高を確認します。')
  .addStringOption(option =>
    option.setName('name')
      .setDescription('確認する口座名')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('password')
    .setDescription('（任意）パスワード')
    .setRequired(false)
    ),
new SlashCommandBuilder()
  .setName('pay')
  .setDescription('他のユーザーにソーカを送ります')
  .addUserOption(option =>
    option.setName('user') // ← ここを "target" から "user" に修正！
      .setDescription('送金先のユーザー')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('amount')
      .setDescription('送金するソーカの金額')
      .setRequired(true)),
  new SlashCommandBuilder()
  .setName('claim')
  .setDescription('他のユーザーにソーカの支払いを請求します')
  .addUserOption(option =>
    option.setName('target')
      .setDescription('請求するユーザー')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('amount')
      .setDescription('請求額')
      .setRequired(true)),
  new SlashCommandBuilder()
  .setName('ask')
  .setDescription('geminiに質問します')
  .addStringOption(option =>
    option.setName('contents')
      .setDescription('質問内容')
      .setRequired(true)
  ),
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
  const commandName = interaction.commandName;

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
    .setTitle("入金成功")
    .setDescription(`${accountName} に ${amount} ソーカを入金しました！`);
  return await interaction.reply({
    embeds: [success_embed],
    ephemeral: true
  });
}
else if (interaction.commandName === 'withdraw') {
  const accountName = interaction.options.getString('account', true);
  const amount = interaction.options.getInteger('amount', true);
  const inputPassword = interaction.options.getString('password') ?? null;
  const userId = interaction.user.id;
  const userName = interaction.user.username;

  if (amount <= 0 || !Number.isInteger(amount)) {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("金額は自然数で入力してください。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (inputPassword === 'null') {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("無効なパスワードです。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const userRef = db.ref(`users/${userId}`);
  const accountRef = db.ref(`accounts/${accountName}`);

  try {
    const [userSnap, accountSnap] = await Promise.all([userRef.get(), accountRef.get()]);
    const userData = userSnap.val();
    const accountData = accountSnap.val();

    if (!userData || userData.balance == null) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("エラー")
        .setDescription("あなたのデータがありません。/login してください。");
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!accountData) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("エラー")
        .setDescription("指定された口座は存在しません。");
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // パスワードチェック
    if (accountData.password) {
      if (userId !== accountData.owner && inputPassword !== accountData.password) {
        const embed = new EmbedBuilder()
          .setColor("#E74D3C")
          .setTitle("エラー")
          .setDescription("パスワードが違います。");
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } else {
      if (userId !== accountData.owner) {
        const embed = new EmbedBuilder()
          .setColor("#E74D3C")
          .setTitle("エラー")
          .setDescription("この口座はパスワードが設定されていないため、作成者のみが引き出せます。");
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    // newBalanceをここで計算してチェック
    const newBalance = (accountData.balance || 0) - amount;
    if (newBalance < 0) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("エラー")
        .setDescription("口座の残高が不足しています。");
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 残高更新
    await userRef.update({ balance: userData.balance + amount });
    await accountRef.update({ balance: newBalance });

    if (userId !== accountData.owner) {
      try {
        const ownerUser = await client.users.fetch(accountData.owner);
        const dmEmbed = new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle("口座から引き出しがありました")
          .setDescription(`${userName} さんが口座「${accountName}」から ${amount} ソーカ引き出しました！\n口座の残高：${newBalance} ソーカ`);
        await ownerUser.send({ embeds: [dmEmbed] });
      } catch (err) {
        console.error("DM送信失敗:", err);
      }
    }

    const successEmbed = new EmbedBuilder()
      .setColor("#2ecc70")
      .setTitle("引き出し成功")
      .setDescription(`口座「${accountName}」から ${amount} ソーカを引き出しました。\n残高：${newBalance} ソーカ`);
    return await interaction.reply({ embeds: [successEmbed], ephemeral: true });

  } catch (error) {
    console.error(error);
    return await interaction.reply({
      content: "エラーが発生しました。もう一度試してください。",
      ephemeral: true,
    });
  }
}
  
else if (interaction.commandName === 'check') {
  const name = interaction.options.getString('name');
  const password = interaction.options.getString('password') ?? null;

  const accountRef = db.ref(`accounts/${name}`);
  const snapshot = await accountRef.once('value');

  if (!snapshot.exists()) {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("指定した口座は存在しません。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const data = snapshot.val();

  if (data.password && data.password !== password) {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("入力した共有パスワードが違います。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }
  if ((data.password && data.password === password) || (!data.password && interaction.user.id === data.ownerId)) {
  const embed = new EmbedBuilder()
    .setColor("#2ecc70")
    .setTitle("口座の残高")
    .setDescription(`口座 **${name}** の残高は **${data.balance} ソーカ** です。`);
  return await interaction.reply({ embeds: [embed], ephemeral: true });
} else {
  const embed = new EmbedBuilder()
    .setColor("#E74D3C")
    .setTitle("エラー")
    .setDescription(`あなたはこの口座の作成者ではないため確認できません。`);
  return await interaction.reply({ embeds: [embed], ephemeral: true });
}
}
  
if (commandName === "pay") {
  const targetUser = interaction.options.getUser("user");
  const amount = interaction.options.getInteger("amount");

  if (!targetUser || targetUser.bot) {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("有効なユーザーを指定してください。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (amount <= 0 || !Number.isInteger(amount)) {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("正の整数を指定してください。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const senderId = interaction.user.id;
  const recipientId = targetUser.id;

  const senderRef = db.ref(`users/${senderId}`);
  const recipientRef = db.ref(`users/${recipientId}`);

  // senderのデータ取得
  let senderData;
  try {
    const snapshot = await senderRef.once('value');
    senderData = snapshot.val();
  } catch (err) {
    console.error("RealtimeDB エラー:", err);
    return await interaction.reply({
      content: "データベース接続に失敗しました。",
      ephemeral: true,
    });
  }

  if (!senderData || (senderData.balance || 0) < amount) {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("残高が不足しています。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor("#F1C40F")
    .setTitle("確認")
    .setDescription(`本当に <@${recipientId}> に ${amount} ソーカを送金しますか？`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("confirm")
      .setLabel("支払う")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("cancel")
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

  const filter = (i) => i.user.id === interaction.user.id;
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });

  collector.on("collect", async (i) => {
    if (i.customId === "confirm") {
      try {
        const recipientSnapshot = await recipientRef.once('value');
        const recipientData = recipientSnapshot.val();

        // 送金元残高更新
        await senderRef.update({ balance: (senderData.balance || 0) - amount });

        if (recipientData) {
          // 受取人が存在すれば残高加算
          await recipientRef.update({ balance: (recipientData.balance || 0) + amount });
        } else {
          // 受取人がまだデータを持ってなければ新規作成
          await recipientRef.set({ balance: amount });
        }

        const embed = new EmbedBuilder()
          .setColor("#2ECC71")
          .setTitle("送金完了")
          .setDescription(`<@${recipientId}> に ${amount} ソーカを送金しました。`);

        await i.update({ embeds: [embed], components: [] });
      } catch (err) {
        console.error("送金処理エラー:", err);
        const embed = new EmbedBuilder()
          .setColor("#E74D3C")
          .setTitle("エラー")
          .setDescription("送金処理中にエラーが発生しました。");

        await i.update({ embeds: [embed], components: [] });
      }
      collector.stop();
    } else if (i.customId === "cancel") {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("キャンセル")
        .setDescription("送金をキャンセルしました。");

      await i.update({ embeds: [embed], components: [] });
      collector.stop();
    }
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("タイムアウト")
        .setDescription("タイムアウトにより送金はキャンセルされました。");

      try {
        await interaction.editReply({
          embeds: [embed],
          components: [],
          ephemeral: true,
        });
      } catch (err) {
        console.error("タイムアウト応答に失敗:", err);
      }
    }
  });
}
  
else if (interaction.commandName === "claim") {
  const targetUser = interaction.options.getUser("target");
  const amount = interaction.options.getInteger("amount");

  if (!targetUser || targetUser.bot) {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("有効なユーザーを指定してください。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (amount <= 0 || !Number.isInteger(amount)) {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("正の整数を指定してください。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const claimantId = interaction.user.id;
  const debtorId   = targetUser.id;
  const dbRef      = admin.database().ref();
  const claimantRef= dbRef.child(`users/${claimantId}`);
  const debtorRef  = dbRef.child(`users/${debtorId}`);

  const claimEmbed = new EmbedBuilder()
    .setColor("#F1C40F")
    .setTitle("支払い請求")
    .setDescription(`<@${claimantId}> さんから ${amount} ソーカの支払い請求が届きました。`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_confirm_${claimantId}_${amount}`)
      .setLabel("支払う")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("claim_cancel")
      .setLabel("拒否")
      .setStyle(ButtonStyle.Danger),
  );

  try {
    // ① Ephemeral で請求通知（ここだけ reply）
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#F1C40F")
          .setTitle("請求通知")
          .setDescription(`<@${debtorId}> に、${amount}ソーカ請求しました。`)
      ],
      ephemeral: true
    });

    // ② DM 送信してメッセージオブジェクト取得
    const dmMessage = await targetUser.send({ embeds: [claimEmbed], components: [row] });

    // ④ DM 上でのボタン反応を待機
    const filter = i => i.user.id === debtorId &&
      (i.customId.startsWith("claim_confirm_") || i.customId === "claim_cancel");
    const collector = dmMessage.createMessageComponentCollector({ filter, time: 30000 });

    collector.on("collect", async i => {
      if (i.customId === "claim_cancel") {
        const cancelEmbed = new EmbedBuilder()
          .setColor("#E74D3C")
          .setTitle("請求拒否")
          .setDescription(`<@${debtorId}> さんが請求を拒否しました。`);
        await i.update({ embeds: [cancelEmbed], components: [] });

        try {
          const claimantUser = await client.users.fetch(claimantId);
          const notifyEmbed = new EmbedBuilder()
            .setColor("#E74D3C")
            .setTitle("請求が拒否されました")
            .setDescription(`<@${debtorId}> さんがあなたの請求を拒否しました。`);
          await claimantUser.send({ embeds: [notifyEmbed] });
        } catch (err) {
          console.error("請求者へのDM送信失敗:", err);
        }
        collector.stop();
        return;
      }

      if (i.customId.startsWith("claim_confirm_")) {
        const [, , cid, amt] = i.customId.split("_");
        if (cid !== claimantId || Number(amt) !== amount) {
          const mismatchEmbed = new EmbedBuilder()
            .setColor("#E74D3C")
            .setTitle("エラー")
            .setDescription("請求情報が一致しません。");
          await i.update({ embeds: [mismatchEmbed], components: [] });
          collector.stop();
          return;
        }

        const [debtorSnap, claimantSnap] = await Promise.all([
          debtorRef.once('value'),
          claimantRef.once('value')
        ]);
        const debtorData   = debtorSnap.val()   || { balance: 0 };
        const claimantData = claimantSnap.val() || { balance: 0 };

        if (debtorData.balance < amount) {
          const insufficientEmbed = new EmbedBuilder()
            .setColor("#E74D3C")
            .setTitle("残高不足")
            .setDescription("残高が不足しています。支払いできません。");
          await i.update({ embeds: [insufficientEmbed], components: [] });
          collector.stop();
          return;
        }

        await debtorRef.update({   balance: debtorData.balance - amount });
        await claimantRef.update({ balance: claimantData.balance + amount });

        const paidEmbed = new EmbedBuilder()
          .setColor("#2ECC71")
          .setTitle("支払い完了")
          .setDescription(`${amount} ソーカを <@${claimantId}> さんに送金しました。`);
        await i.update({ embeds: [paidEmbed], components: [] });

        try {
          const claimantUser = await client.users.fetch(claimantId);
          const notifyEmbed = new EmbedBuilder()
            .setColor("#2ECC71")
            .setTitle("請求が支払われました")
            .setDescription(`<@${debtorId}> さんから ${amount} ソーカの支払いがありました。`);
          await claimantUser.send({ embeds: [notifyEmbed] });
        } catch (err) {
          console.error("請求者へのDM送信失敗:", err);
        }

        collector.stop();
      }
    });

    collector.on("end", async collected => {
      if (collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor("#E74D3C")
          .setTitle("タイムアウト")
          .setDescription("請求の回答がありませんでした。請求はキャンセルされました。");
        try { await targetUser.send({ embeds: [timeoutEmbed] }); } catch {}
        try {
          const claimantUser = await client.users.fetch(claimantId);
          const notifyEmbed = new EmbedBuilder()
            .setColor("#E74D3C")
            .setTitle("請求がタイムアウトしました")
            .setDescription(`<@${debtorId}> さんが請求に応答しませんでした。請求はキャンセルされました。`);
          await claimantUser.send({ embeds: [notifyEmbed] });
        } catch (err) {
          console.error("請求者へのDM送信失敗:", err);
        }
      }
    });

  } catch (err) {
    const errorEmbed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("請求先にDMを送信できませんでした。DMが開いているか確認してください。");
    // 既に reply 済みなので followUp でエラー通知
    return await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
  }
}
else if (interaction.commandName === 'ask') {
  const contents = interaction.options.getString('contents');
  await interaction.deferReply();
  try {
    const response = await ask_soka(contents);
    await interaction.editReply(response);
  } catch (err) {
    await interaction.editReply('エラーが発生しました。すまん');
    console.error(err);
  }
}

}); // これが interactionCreate のイベントリスナー閉じ
// Botログイン
client.login(token);

app.get('/', (req, res) => {
  res.send('Bot is alive!');
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});
