// Load .env locally, but Railway provides vars automatically
if (!process.env.DISCORD_TOKEN) {
  require('dotenv').config();
}

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const axios = require('axios');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates
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
  songsPlayed: 0,
  startTime: Date.now()
};

if (fs.existsSync('stats.json')) {
  stats = JSON.parse(fs.readFileSync('stats.json'));
}

function saveStats() {
  fs.writeFileSync('stats.json', JSON.stringify(stats, null, 2));
}

// Music queue
const queue = new Map();

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

// MUSIC FUNCTIONS
async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }
  
  const player = createAudioPlayer();
  const stream = ytdl(song.url, { filter: 'audioonly', highWaterMark: 1 << 25 });
  const resource = createAudioResource(stream);
  
  player.play(resource);
  serverQueue.connection.subscribe(player);
  
  stats.songsPlayed++;
  saveStats();
  
  player.on(AudioPlayerStatus.Idle, () => {
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });
  
  player.on('error', error => {
    console.error('Music error:', error);
    serverQueue.textChannel.send('❌ Error playing song. Skipping...');
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });
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

  // MUSIC COMMANDS
  if (command === 'play' || command === 'p') {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('❌ You need to be in a voice channel!');
    
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
      return message.reply('❌ I need permissions to join and speak in your voice channel!');
    }
    
    const searchQuery = args.join(' ');
    if (!searchQuery) return message.reply('❌ Provide a song name or YouTube URL!');
    
    message.channel.send(`🔍 Searching for: **${searchQuery}**...`);
    
    try {
      let songInfo;
      
      if (ytdl.validateURL(searchQuery)) {
        songInfo = await ytdl.getInfo(searchQuery);
      } else {
        const searchResults = await ytSearch(searchQuery);
        if (!searchResults.videos.length) return message.reply('❌ No results found!');
        songInfo = await ytdl.getInfo(searchResults.videos[0].url);
      }
      
      const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
        duration: songInfo.videoDetails.lengthSeconds,
        thumbnail: songInfo.videoDetails.thumbnails[0].url,
        requester: message.author.tag
      };
      
      let serverQueue = queue.get(message.guild.id);
      
      if (!serverQueue) {
        const queueConstruct = {
          textChannel: message.channel,
          voiceChannel: voiceChannel,
          connection: null,
          songs: [],
          volume: 5,
          playing: true
        };
        
        queue.set(message.guild.id, queueConstruct);
        queueConstruct.songs.push(song);
        
        try {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
          });
          
          queueConstruct.connection = connection;
          playSong(message.guild, queueConstruct.songs[0]);
          
          const embed = new EmbedBuilder()
            .setColor(0xDC143C)
            .setTitle('🎵 Now Playing')
            .setDescription(`[${song.title}](${song.url})`)
            .setThumbnail(song.thumbnail)
            .addFields(
              { name: 'Duration', value: `${Math.floor(song.duration / 60)}:${(song.duration % 60).toString().padStart(2, '0')}`, inline: true },
              { name: 'Requested by', value: song.requester, inline: true }
            );
          
          message.channel.send({ embeds: [embed] });
        } catch (err) {
          console.error(err);
          queue.delete(message.guild.id);
          return message.reply('❌ Could not join voice channel!');
        }
      } else {
        serverQueue.songs.push(song);
        
        const embed = new EmbedBuilder()
          .setColor(0xDC143C)
          .setTitle('🎵 Added to Queue')
          .setDescription(`[${song.title}](${song.url})`)
          .setThumbnail(song.thumbnail)
          .addFields(
            { name: 'Position', value: `#${serverQueue.songs.length}`, inline: true },
            { name: 'Requested by', value: song.requester, inline: true }
          );
        
        return message.channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error(error);
      return message.reply('❌ Error finding song!');
    }
  }

  if (command === 'skip' || command === 's') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue) return message.reply('❌ Nothing is playing!');
    if (!message.member.voice.channel) return message.reply('❌ You need to be in a voice channel!');
    
    serverQueue.connection.destroy();
    message.reply('⏭️ Skipped!');
  }

  if (command === 'stop') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue) return message.reply('❌ Nothing is playing!');
    if (!message.member.voice.channel) return message.reply('❌ You need to be in a voice channel!');
    
    serverQueue.songs = [];
    serverQueue.connection.destroy();
    queue.delete(message.guild.id);
    message.reply('⏹️ Stopped and cleared queue!');
  }

  if (command === 'queue' || command === 'q') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue || !serverQueue.songs.length) return message.reply('❌ Queue is empty!');
    
    const embed = new EmbedBuilder()
      .setColor(0xDC143C)
      .setTitle('🎵 Music Queue')
      .setDescription(serverQueue.songs.map((song, index) => 
        `${index === 0 ? '▶️' : `${index + 1}.`} [${song.title}](${song.url}) - ${song.requester}`
      ).join('\n').substring(0, 4000));
    
    message.channel.send({ embeds: [embed] });
  }

  if (command === 'np' || command === 'nowplaying') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue || !serverQueue.songs.length) return message.reply('❌ Nothing is playing!');
    
    const song = serverQueue.songs[0];
    const embed = new EmbedBuilder()
      .setColor(0xDC143C)
      .setTitle('🎵 Now Playing')
      .setDescription(`[${song.title}](${song.url})`)
      .setThumbnail(song.thumbnail)
      .addFields(
        { name: 'Requested by', value: song.requester, inline: true }
      );
    
    message.channel.send({ embeds: [embed] });
  }

  // OTHER COMMANDS
  if (command === 'help') {
    message.reply('Commands: !play [song], !skip, !stop, !queue, !np, !ping, !drop, !wiki, !live, !roles, !stats, !serverinfo');
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
        { name: '🎵 Songs Played', value: String(stats.songsPlayed), inline: true },
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

    const channel = client.channels.cache.get(CONFIG.announcement_CHANNEL_ID);
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