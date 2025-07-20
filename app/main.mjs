import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config'; // ← dotenvの読み込み（なければ無視）

// 環境変数
const token = process.env.TOKEN;
const clientId = process.env.APPLICATION_ID;
const guildId = process.env.TEST_SERVER;

if (!token || !clientId || !guildId) {
  console.error('❌ TOKEN / APPLICATION_ID / TEST_SERVER のいずれかが未定義です');
  process.exit(1);
}

// スラッシュコマンドの定義
const commands = [
  new SlashCommandBuilder()
    .setName('greet')
    .setDescription('Greet you!'),
].map(command => command.toJSON());

// RESTクライアントでギルドコマンドを登録
const rest = new REST({ version: '10' }).setToken(token);

async function registerCommands() {
  try {
    console.log('🔁 ギルドコマンドを登録中...');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log('✅ ギルドコマンド登録完了');
  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
  }
}

// Discordクライアント
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`🤖 Botログイン完了: ${client.user.tag}`);
  registerCommands(); // ← ログイン後に登録することでタイミングの問題を回避できることがある
});

// コマンド処理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'greet') {
    await interaction.reply('Nice meeting you!');
  }
});

client.login(token);
