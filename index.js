// Load .env locally, but Railway provides vars automatically
if (!process.env.DISCORD_TOKEN) {
  require('dotenv').config();
}

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

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

// Stats tracking
let stats = {
  totalMessages: 0,
  totalCommands: 0,
  memberJoins: 0,
  streamsAnnounced: 0,
  startTime: Date.now()
};

if (fs.existsSync('stats.json')) {
  stats = JSON.parse(fs.readFileSync('stats.json'));
}

function saveStats() {
  fs.writeFileSync('stats.json', JSON.stringify(stats, null, 2));
}

// Role message ID
let roleMessageId = null;
let isLive = false;
let lastStreamId = null;

// Bot ready
client.on('ready', async () => {
  console.log(`✅ ${client.user.tag} is online!`);
  client.user.setActivity('Warframe | !help', { type: 'PLAYING' });
  
  await createRoleMessage();
  
  if (CONFIG.twitchClientId && CONFIG.twitchClientId !== 'esxex3cfso8mnbauccx47o5calegp') {
    setInterval(checkTwitch, 120000);
    console.log('🔴 Twitch alerts enabled');
  }
  
  console.log(`📊 Stats loaded: ${stats.totalMessages} messages, ${stats.totalCommands} commands`);
});

// Create reaction role message
async function createRoleMessage() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    
    const channel = guild.channels.cache.get(CONFIG.welcomeChannel);
    if (!channel) return;
    
    const messages = await channel.messages.fetch({ limit: 10 });
    const existingMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === 'Get Your Roles!');
    
    if (existingMsg) {
      roleMessageId = existingMsg.id;
      return;
    }
    
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

// Reaction handlers
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot || reaction.message.id !== roleMessageId) return;
  
  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);
  
  const roleMap = { '🎮': 'Warframe', '💻': 'Coder', '🎨': 'Artist' };
  const roleName = roleMap[reaction.emoji.name];
  if (!roleName) return;
  
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (role) await member.roles.add(role);
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot || reaction.message.id !== roleMessageId) return;
  
  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);
  
  const roleMap = { '🎮': 'Warframe', '💻': 'Coder', '🎨': 'Artist' };
  const roleName = roleMap[reaction.emoji.name];
  if (!roleName) return;
  
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (role) await member.roles.remove(role);
});

// Track messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  stats.totalMessages++;
  saveStats();
  
  if (!message.content.startsWith('!')) return;
  
  stats.totalCommands++;
  saveStats();

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'help') {
    message.reply('Commands: !ping, !drop [item], !wiki [search], !live, !roles, !stats, !serverinfo');
  }

  if (command === 'ping') {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    message.reply(`🏓 Pong! ${Date.now() - message.createdTimestamp}ms\n⏱️ Bot uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`);
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

  if (command === 'stats') {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    const embed = new EmbedBuilder()
      .setColor(0xDC143C)
      .setTitle('📊 KymeraBot Stats')
      .addFields(
        { name: '💬 Messages', value: String(stats.totalMessages), inline: true },
        { name: '⌨️ Commands', value: String(stats.totalCommands), inline: true },
        { name: '👋 Members Joined', value: String(stats.memberJoins), inline: true },
        { name: '🔴 Streams', value: String(stats.streamsAnnounced), inline: true },
        { name: '⏱️ Uptime', value: `${hours}h ${minutes}m`, inline: true }
      )
      .setTimestamp();
    
    message.reply({ embeds: [embed] });
  }

  if (command === 'serverinfo') {
    const guild = message.guild;
    const totalMembers = guild.memberCount;
    const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
    const roles = guild.roles.cache.size - 1;
    
    const embed = new EmbedBuilder()
      .setColor(0xDC143C)
      .setTitle(`📈 ${guild.name} Server Info`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: '👥 Members', value: String(totalMembers), inline: true },
        { name: '💬 Text', value: String(textChannels), inline: true },
        { name: '🔊 Voice', value: String(voiceChannels), inline: true },
        { name: '🏷️ Roles', value: String(roles), inline: true },
        { name: '📅 Created', value: guild.createdAt.toDateString(), inline: true }
      )
      .setTimestamp();
    
    message.reply({ embeds: [embed] });
  }
});

// Track member joins
client.on('guildMemberAdd', async (member) => {
  stats.memberJoins++;
  saveStats();
  
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

// Twitch check
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
      params: { user_login: CONFIG.twitchChannel }
    });

    const channel = client.channels.cache.get(CONFIG.announcementChannel);
    if (!channel) return;

    if (streamRes.data.data.length > 0) {
      const stream = streamRes.data.data[0];
      
      if (stream.id !== lastStreamId) {
        lastStreamId = stream.id;
        isLive = true;
        stats.streamsAnnounced++;
        saveStats();
        
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
      }
    } else {
      isLive = false;
      lastStreamId = null;
    }
  } catch (error) {
    console.error('Twitch check error:', error.message);
  }
}

client.login(process.env.DISCORD_TOKEN);