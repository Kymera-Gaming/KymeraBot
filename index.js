// Load .env locally, but Railway provides vars automatically
if (!process.env.DISCORD_TOKEN) {
  require('dotenv').config();
}

const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration
  ]
});

// Config
const CONFIG = {
  twitchChannel: process.env.TWITCH_CHANNEL || 'Kymera_Gaming',
  announcementChannel: process.env.ANNOUNCEMENT_CHANNEL_ID,
  welcomeChannel: process.env.WELCOME_CHANNEL_ID,
  twitchClientId: process.env.TWITCH_CLIENT_ID,
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET,
  modLogChannel: process.env.MOD_LOG_CHANNEL_ID || process.env.WELCOME_CHANNEL_ID
};

// Stats tracking
let stats = {
  totalMessages: 0,
  totalCommands: 0,
  memberJoins: 0,
  streamsAnnounced: 0,
  kicks: 0,
  bans: 0,
  warns: 0,
  startTime: Date.now()
};

if (fs.existsSync('stats.json')) {
  stats = JSON.parse(fs.readFileSync('stats.json'));
}

function saveStats() {
  fs.writeFileSync('stats.json', JSON.stringify(stats, null, 2));
}

// Warnings storage
let warnings = {};
if (fs.existsSync('warnings.json')) {
  warnings = JSON.parse(fs.readFileSync('warnings.json'));
}

function saveWarnings() {
  fs.writeFileSync('warnings.json', JSON.stringify(warnings, null, 2));
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

// MODERATION LOG FUNCTION
async function logAction(guild, action, target, moderator, reason) {
  const logChannel = guild.channels.cache.get(CONFIG.modLogChannel);
  if (!logChannel) return;
  
  const embed = new EmbedBuilder()
    .setColor(action === 'ban' ? 0xFF0000 : action === 'kick' ? 0xFFA500 : 0xFFFF00)
    .setTitle(`🛡️ ${action.toUpperCase()}`)
    .addFields(
      { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
      { name: 'Moderator', value: moderator.tag, inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: false }
    )
    .setTimestamp();
  
  logChannel.send({ embeds: [embed] });
}

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

  // ==================== HELP COMMAND ====================
  if (command === 'help') {
    const isMod = message.member.permissions.has(PermissionsBitField.Flags.KickMembers);
    
    let helpText = '**User Commands:**\n';
    helpText += '`!ping` - Check bot latency\n';
    helpText += '`!drop [item]` - Search Warframe drops\n';
    helpText += '`!wiki [search]` - Search Warframe wiki\n';
    helpText += '`!live` - Check Twitch stream\n';
    helpText += '`!roles` - Show available roles\n';
    helpText += '`!stats` - Bot statistics\n';
    helpText += '`!serverinfo` - Server information\n';
    
    if (isMod) {
      helpText += '\n**Mod Commands:**\n';
      helpText += '`!kick @user [reason]` - Kick user\n';
      helpText += '`!ban @user [reason]` - Ban user\n';
      helpText += '`!unban @user` - Unban user\n';
      helpText += '`!warn @user [reason]` - Warn user\n';
      helpText += '`!warnings @user` - Show user warnings\n';
      helpText += '`!clearwarnings @user` - Clear user warnings\n';
      helpText += '`!mute @user [time] [reason]` - Mute user\n';
      helpText += '`!unmute @user` - Unmute user\n';
      helpText += '`!clear [number]` - Delete messages\n';
    }
    
    message.reply(helpText);
  }

  // ==================== USER COMMANDS ====================
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
        { name: '👢 Kicks', value: String(stats.kicks), inline: true },
        { name: '🔨 Bans', value: String(stats.bans), inline: true },
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

  // ==================== MODERATION COMMANDS ====================
  
  // Check if user is mod
  const isMod = message.member.permissions.has(PermissionsBitField.Flags.KickMembers);
  if (!isMod) return;

  // KICK
  if (command === 'kick') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mention a user to kick!');
    if (!target.kickable) return message.reply('❌ I cannot kick this user!');
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    try {
      await target.kick(reason);
      stats.kicks++;
      saveStats();
      await logAction(message.guild, 'kick', target.user, message.author, reason);
      message.reply(`👢 Kicked ${target.user.tag} | Reason: ${reason}`);
    } catch (error) {
      message.reply('❌ Failed to kick user!');
    }
  }

  // BAN
  if (command === 'ban') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mention a user to ban!');
    if (!target.bannable) return message.reply('❌ I cannot ban this user!');
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    try {
      await target.ban({ reason });
      stats.bans++;
      saveStats();
      await logAction(message.guild, 'ban', target.user, message.author, reason);
      message.reply(`🔨 Banned ${target.user.tag} | Reason: ${reason}`);
    } catch (error) {
      message.reply('❌ Failed to ban user!');
    }
  }

  // UNBAN
  if (command === 'unban') {
    const userId = args[0];
    if (!userId) return message.reply('❌ Provide a user ID to unban!');
    
    try {
      await message.guild.members.unban(userId);
      message.reply(`✅ Unbanned user ${userId}`);
    } catch (error) {
      message.reply('❌ Failed to unban user! Make sure the ID is correct.');
    }
  }

  // WARN
  if (command === 'warn') {
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Mention a user to warn!');
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    if (!warnings[target.id]) warnings[target.id] = [];
    warnings[target.id].push({
      reason: reason,
      moderator: message.author.tag,
      date: new Date().toISOString()
    });
    saveWarnings();
    stats.warns++;
    saveStats();
    
    message.reply(`⚠️ Warned ${target.tag} | Reason: ${reason}\nThey now have ${warnings[target.id].length} warning(s).`);
  }

  // SHOW WARNINGS
  if (command === 'warnings') {
    const target = message.mentions.users.first() || message.author;
    const userWarnings = warnings[target.id] || [];
    
    if (userWarnings.length === 0) {
      return message.reply(`${target.tag} has no warnings.`);
    }
    
    const embed = new EmbedBuilder()
      .setColor(0xFFFF00)
      .setTitle(`⚠️ Warnings for ${target.tag}`)
      .setDescription(userWarnings.map((w, i) => 
        `${i + 1}. ${w.reason} (by ${w.moderator}, ${new Date(w.date).toLocaleDateString()})`
      ).join('\n'));
    
    message.reply({ embeds: [embed] });
  }

  // CLEAR WARNINGS
  if (command === 'clearwarnings') {
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Mention a user to clear warnings!');
    
    delete warnings[target.id];
    saveWarnings();
    message.reply(`✅ Cleared all warnings for ${target.tag}`);
  }

  // MUTE (Timeout)
  if (command === 'mute') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mention a user to mute!');
    if (!target.moderatable) return message.reply('❌ I cannot mute this user!');
    
    const timeArg = args[1];
    if (!timeArg || isNaN(timeArg)) return message.reply('❌ Provide time in minutes! Example: `!mute @user 10 spam`');
    
    const timeMs = parseInt(timeArg) * 60 * 1000;
    const reason = args.slice(2).join(' ') || 'No reason provided';
    
    try {
      await target.timeout(timeMs, reason);
      await logAction(message.guild, 'mute', target.user, message.author, `${reason} (${timeArg} min)`);
      message.reply(`🔇 Muted ${target.user.tag} for ${timeArg} minutes | Reason: ${reason}`);
    } catch (error) {
      message.reply('❌ Failed to mute user!');
    }
  }

  // UNMUTE (Remove timeout)
  if (command === 'unmute') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mention a user to unmute!');
    
    try {
      await target.timeout(null);
      message.reply(`🔊 Unmuted ${target.user.tag}`);
    } catch (error) {
      message.reply('❌ Failed to unmute user!');
    }
  }

  // CLEAR MESSAGES
  if (command === 'clear') {
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return message.reply('❌ Provide a number between 1-100!');
    
    try {
      await message.channel.bulkDelete(amount + 1);
      message.channel.send(`🗑️ Cleared ${amount} messages!`).then(m => setTimeout(() => m.delete(), 3000));
    } catch (error) {
      message.reply('❌ Failed to clear messages! (Messages older than 14 days cannot be bulk deleted)');
    }
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