import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

// 環境変数
const token = process.env.TOKEN;
const clientId = process.env.APPLICATION_ID;
const guildId = process.env.TEST_SERVER; // 👈 ここ追加！

// エラーチェック
if (!token || !clientId || !guildId) {
  console.error('❌ TOKEN / APPLICATION_ID / TEST_SERVER のいずれかが未定義です');
  process.exit(1);
}

// スラッシュコマンドの定義
const commands = [
  new SlashCommandBuilder()
    .setName('greet')
    .setDescription('greet you!'),
].map(command => command.toJSON());

// RESTクライアントでギルドコマンドを登録
const rest = new REST({ version: '10' }).setToken(token);

async function registerCommands() {
  try {
    console.log('🔁 ギルドコマンドを登録中...');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId), // ← 即反映！
      { body: commands },
    );

    console.log('✅ ギルドコマンド登録完了');
  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
  }
}

registerCommands();

// Discordクライアントの起動
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`🤖 Botログイン完了: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'greet') {
    await interaction.reply('Nice meeting you!');
  }
});

client.login(token);


// BotをDiscordにログインさせる（これが必須）
client.login(token);

