require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Bot ready
client.on('ready', () => {
  console.log(`✅ ${client.user.tag} is online!`);
  client.user.setActivity('Warframe | !help', { type: 'PLAYING' });
});

// Welcome message
client.on('guildMemberAdd', async (member) => {
  const channel = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xDC143C)
    .setTitle('Welcome to Kymera_Gaming! 🎮')
    .setDescription(`Hey ${member}, welcome!`)
    .addFields(
      { name: 'Schedule', value: 'Mon/Wed/Fri 2PM EST', inline: true },
      { name: 'Twitch', value: 'twitch.tv/Kymera_Gaming', inline: true }
    )
    .setTimestamp();

  channel.send({ embeds: [embed] });
});

// Commands
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'help') {
    message.reply('Commands: !ping, !drop [item], !wiki [search]');
  }

  if (command === 'ping') {
    message.reply(`🏓 Pong! ${Date.now() - message.createdTimestamp}ms`);
  }

  if (command === 'drop') {
    if (!args.length) return message.reply('Usage: !drop [item]');
    const item = args.join(' ');
    message.reply(`🔍 https://warframe.fandom.com/wiki/Special:Search?search=${encodeURIComponent(item)}`);
  }

  if (command === 'wiki') {
    if (!args.length) return message.reply('Usage: !wiki [search]');
    const search = args.join(' ');
    message.reply(`📚 https://warframe.fandom.com/wiki/Special:Search?search=${encodeURIComponent(search)}`);
  }
});

client.login(process.env.DISCORD_TOKEN);