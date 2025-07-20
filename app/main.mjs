import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', message => {
  if (message.author.bot) return;
  if (message.content === '!ping') {
    message.channel.send('Pong Pong!');
  }
});

// Koyebの環境変数は process.env.TOKEN に入る
client.login(process.env.TOKEN);

