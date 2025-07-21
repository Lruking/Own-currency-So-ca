import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import 'dotenv/config';
import admin from 'firebase-admin';
import express from 'express';

const token = process.env.TOKEN;
const clientId = process.env.APPLICATION_ID;
const guildId = process.env.TEST_SERVER;
const app = express();
const PORT = process.env.PORT || 3000;

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
    option.setName('target')
      .setDescription('送金先のユーザー')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('amount')
      .setDescription('送金するソーカの金額')
      .setRequired(true)),
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
    // 口座とユーザーデータ取得
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

    if (userData.balance < amount) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("エラー")
        .setDescription("残高が足りません。");
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // パスワードチェック
    // パスワードなし口座の場合、inputPasswordはnullか空文字のみ許可
    if (accountData.password) {
      // パスワードあり口座は作成者か正しいパスワードでないと拒否
      if (userId !== accountData.owner && inputPassword !== accountData.password) {
        const embed = new EmbedBuilder()
          .setColor("#E74D3C")
          .setTitle("エラー")
          .setDescription("パスワードが違います。");
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } else {
      // パスワードなし口座は作成者のみ引き出し可
      if (userId !== accountData.owner) {
        const embed = new EmbedBuilder()
          .setColor("#E74D3C")
          .setTitle("エラー")
          .setDescription("この口座はパスワードが設定されていないため、作成者のみが引き出せます。");
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    // 残高更新
    await userRef.update({ balance: userData.balance - amount });
    const newBalance = (accountData.balance || 0) - amount;
    if (newBalance < 0) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("エラー")
        .setDescription("口座の残高が不足しています。");
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    await accountRef.update({ balance: newBalance });

    // 作成者以外が引き出した場合、作成者にDMで通知
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

    // 成功メッセージ
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
  
if (interaction.commandName === 'pay') {
  const senderId = interaction.user.id;
  const senderName = interaction.user.username;
  const targetUser = interaction.options.getUser('target', true);
  const targetId = targetUser.id;
  const amount = interaction.options.getInteger('amount', true);

  if (amount <= 0 || !Number.isInteger(amount)) {
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("金額は1以上の整数で指定してください。");
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  try {
    const senderRef = db.ref(`users/${senderId}`);
    const targetRef = db.ref(`users/${targetId}`);

    const [senderSnap, targetSnap] = await Promise.all([
      senderRef.once('value'),
      targetRef.once('value'),
    ]);
    const senderData = senderSnap.val();
    const targetData = targetSnap.val() ?? { balance: 0 };

    if (!senderData || senderData.balance == null) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("エラー")
        .setDescription("あなたのアカウント情報が見つかりません。/login してください。");
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (senderData.balance < amount) {
      const embed = new EmbedBuilder()
        .setColor("#E74D3C")
        .setTitle("エラー")
        .setDescription("残高が足りません。");
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 確認用Embedとボタン
    const confirmEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("送金確認")
      .setDescription(`${targetUser.username} さんに ${amount} ソーカを送りますか？`);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_pay")
        .setLabel("支払う")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("cancel_pay")
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      embeds: [confirmEmbed],
      components: [row],
      ephemeral: true,
    });

    const filter = (i) => i.user.id === senderId;

    const collector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 15000,
      filter,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "confirm_pay") {
        // 送金前に残高再チェック（安全性のため）
        const updatedSenderSnap = await senderRef.once("value");
        const updatedSenderData = updatedSenderSnap.val();

        if (!updatedSenderData || updatedSenderData.balance < amount) {
          const embed = new EmbedBuilder()
            .setColor("#E74D3C")
            .setTitle("エラー")
            .setDescription("残高が不足しています。送金を中止します。");
          return i.update({ embeds: [embed], components: [], ephemeral: true });
        }

        // 残高更新
        const senderNewBalance = updatedSenderData.balance - amount;
        const targetNewBalance = (targetData.balance || 0) + amount;

        await senderRef.update({ balance: senderNewBalance });
        await targetRef.update({ balance: targetNewBalance });

        const successEmbed = new EmbedBuilder()
          .setColor("#2ecc71")
          .setTitle("送金完了")
          .setDescription(`${targetUser.username} さんに ${amount} ソーカを送金しました！\n現在の残高：${senderNewBalance} ソーカ`);

        await i.update({ embeds: [successEmbed], components: [], ephemeral: true });

        // DM通知（受取側）
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor("#FFD700")
            .setTitle("ソーカを受け取りました")
            .setDescription(`${senderName} さんから ${amount} ソーカを受け取りました！\n現在の残高：${targetNewBalance} ソーカ`);
          await targetUser.send({ embeds: [dmEmbed] });
        } catch (err) {
          console.error("DM送信に失敗しました:", err);
        }
      } else if (i.customId === "cancel_pay") {
        const cancelEmbed = new EmbedBuilder()
          .setColor("#E74D3C")
          .setTitle("キャンセル")
          .setDescription("送金をキャンセルしました。");

        await i.update({ embeds: [cancelEmbed], components: [], ephemeral: true });
      }
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor("#E74D3C")
          .setTitle("タイムアウト")
          .setDescription(" タイムアウトにより送金はキャンセルされました。");

        await interaction.editReply({
          embeds: [timeoutEmbed],
          components: [],
          ephemeral: true,
        });
      }
    });
  } catch (error) {
    console.error("payコマンド処理中のエラー:", error);
    const embed = new EmbedBuilder()
      .setColor("#E74D3C")
      .setTitle("エラー")
      .setDescription("送金処理中にエラーが発生しました。もう一度お試しください。");
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
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
