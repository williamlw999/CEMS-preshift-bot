const Discord = require('discord.js');
const auth = require('./auth.json');
// Create a client
const client = new Discord.Client();

// This code will run once the bot has started up.

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
  if (msg.content === 'ping') {
    msg.reply('Pong!');
    guild = client.guilds.find(g => g.name === "Crimson EMS")
    preshift_channel = guild.channels.find(ch => ch.name === 'pre-shift-reminders')
    preshift_channel.send(guild.members.find(member => member.user.tag === "wlw#8168") + " I'm in!");
  }
  console.log("msg received")
});

// Login (replace these auth details with your bot's)
console.log(auth.token);
client.login(auth.token);
