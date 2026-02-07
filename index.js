// Load .env locally, but Railway provides vars automatically
if (!process.env.DISCORD_TOKEN) {
  require('dotenv').config();
}

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Config
const CONFIG = {
  twitchChannel: process.env.TWITCH_CHANNEL || 'Kymera_Gaming',
  announcementChannel: process.env.ANNOUNCEMENT_CHANNEL_ID,
  welcomeChannel: process.env.WELCOME_CHANNEL_ID,
  twitchClientId: process.env.TWITCH_CLIENT_ID,
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET
};

// Role message ID (will be set when created)
let roleMessageId = null;

let isLive = false;
let lastStreamId = null;

// Bot ready
client.on('ready', async () => {
  console.log(`✅ ${client.user.tag} is online!`);
  client.user.setActivity('Warframe | !help', { type: 'PLAYING' });
  
  // Create role message if it doesn't exist
  await createRoleMessage();
  
  // Check Twitch every 2 minutes
  if (CONFIG.twitchClientId && CONFIG.twitchClientId !== 'esxex3tcfso8mnbauccx47o5calegp') {
    setInterval(checkTwitch, 120000);
    console.log('🔴 Twitch alerts enabled');
  }
});

// Create reaction role message
async function createRoleMessage() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    
    const channel = guild.channels.cache.get(CONFIG.welcomeChannel);
    if (!channel) return;
    
    // Check if message already exists
    const messages = await channel.messages.fetch({ limit: 10 });
    const existingMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === 'Get Your Roles!');
    
    if (existingMsg) {
      roleMessageId = existingMsg.id;
      console.log('✅ Role message exists');
      return;
    }
    
    // Create new role message
    const embed = new EmbedBuilder()
      .setColor(0xDC143C)
      .setTitle('Get Your Roles!')
      .setDescription('React to get access to channels:\n\n🎮 **Warframe** - Warframe discussion & LFG\n💻 **Coder** - Bot development & coding\n🎨 **Artist** - Fashion Frame & creative')
      .setFooter({ text: 'Click the emoji below!' });
    
    const msg = await channel.send({ embeds: [embed] });
    await msg.react('🎮');
    await msg.react('💻');
    await msg.react('🎨');
    
    roleMessageId = msg.id;
    console.log('✅ Role message created');
  } catch (error) {
    console.error('Role message error:', error);
  }
}

// Reaction add
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.message.id !== roleMessageId) return;
  
  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);
  
  const roleMap = {
    '🎮': 'Warframe',
    '💻': 'Coder',
    '🎨': 'Artist'
  };
  
  const roleName = roleMap[reaction.emoji.name];
  if (!roleName) return;
  
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (role) {
    await member.roles.add(role);
    console.log(`Added ${roleName} to ${user.tag}`);
  }
});

// Reaction remove
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.message.id !== roleMessageId) return;
  
  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);
  
  const roleMap = {
    '🎮': 'Warframe',
    '💻': 'Coder',
    '🎨': 'Artist'
  };
  
  const roleName = roleMap[reaction.emoji.name];
  if (!roleName) return;
  
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (role) {
    await member.roles.remove(role);
    console.log(`Removed ${roleName} from ${user.tag}`);
  }
});

// Welcome message
client.on('guildMemberAdd', async (member) => {
  const channel = member.guild.channels.cache.get(CONFIG.welcomeChannel);
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
    message.reply('Commands: !ping, !drop [item], !wiki [search], !live, !roles');
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

  if (command === 'live') {
    message.reply('🔴 Check if Kymera is live: https://twitch.tv/Kymera_Gaming');
  }

  if (command === 'roles') {
    const embed = new EmbedBuilder()
      .setColor(0xDC143C)
      .setTitle('Available Roles')
      .setDescription('🎮 Warframe - Warframe players\n💻 Coder - Developers\n🎨 Artist - Content creators');
    message.reply({ embeds: [embed] });
  }
});

// TWITCH LIVE CHECK
async function checkTwitch() {
  try {
    const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: CONFIG.twitchClientId,
        client_secret: CONFIG.twitchClientSecret,
        grant_type: 'client_credentials'
      }
    });
    
    const accessToken = tokenRes.data.access_token;

    const streamRes = await axios.get('https://api.twitch.tv/helix/streams', {
      headers: {
        'Client-ID': CONFIG.twitchClientId,
        'Authorization': `Bearer ${accessToken}`
      },
      params: {
        user_login: CONFIG.twitchChannel
      }
    });

    const channel = client.channels.cache.get(CONFIG.announcementChannel);
    if (!channel) return;

    if (streamRes.data.data.length > 0) {
      const stream = streamRes.data.data[0];
      
      if (stream.id !== lastStreamId) {
        lastStreamId = stream.id;
        isLive = true;
        
        const embed = new EmbedBuilder()
          .setColor(0x9146FF)
          .setTitle('🔴 Kymera is LIVE!')
          .setURL(`https://twitch.tv/${CONFIG.twitchChannel}`)
          .setDescription(`**${stream.title}**`)
          .addFields(
            { name: 'Game', value: stream.game_name || 'Just Chatting', inline: true },
            { name: 'Viewers', value: String(stream.viewer_count), inline: true }
          )
          .setImage(stream.thumbnail_url.replace('{width}', '1280').replace('{height}', '720'))
          .setTimestamp();

        channel.send({ content: '@here', embeds: [embed] });
        console.log(`🔴 Announced stream: ${stream.title}`);
      }
    } else {
      if (isLive) {
        console.log('⚫ Stream ended');
      }
      isLive = false;
      lastStreamId = null;
    }
  } catch (error) {
    console.error('Twitch check error:', error.message);
  }
}

client.login(process.env.DISCORD_TOKEN);