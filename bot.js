const Discord = require('discord.js');
const client = new Discord.Client();
const auth = require('./auth.json');

const preshift_channel_id = 663998916018176012

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('ready', () => {
    setTimeout(function(){ // in leftToEight() milliseconds run this:
        sendMessage(); // send the message once
        var dayMillseconds = 1000 * 60 * 60 * 24;
        setInterval(function(){ // repeat this every 24 hours
            sendMessage();
        }, dayMillseconds)
    }, leftToEight())
})

function timeLeft(){
    var d = new Date();
    return (-d + d.setHours(8,0,0,0));
}

setInterval(function() {
    var d = new Date();
    if(Math.floor((d.getTime() - START_TIME) / 3600000) % INTERVAL_HOURS > 0) return; // Return if hour is not the correct interval
    if(d.getMinutes() !== NOTIFY_MINUTE) return; // Return if current minute is not the notify minute
    NOTIFY_CHANNEL.sendMessage('The chests refresh in ' + OFFSET + ' minutes!');
}, 60 * 1000);

function sendMessage(){
    var guild = client.guilds.get('guildid');
    if(guild && guild.channels.get('channelid')){
        guild.channels.get('channelid').send("Good Morning");
    }

}


client.login(auth.token);