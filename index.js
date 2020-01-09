const Discord = require('discord.js');
const client = new Discord.Client();
const auth = require('./auth.json');


var status = {
    statusCode: 200,
    body: JSON.stringify('Hello from Lambda!'),
};

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    if (send_preshift_message()) {
        status = {
            statusCode: 200,
            body: JSON.stringify('Success from Lambda!'),
        };
    } else {
        status = {
            statusCode: 200,
            body: JSON.stringify('Failed from Lambda!'),
        };
    }

    client.destroy();
});
    

function send_preshift_message(){
    guild = client.guilds.find(g => g.name === "Crimson EMS")
    if (!guild){
            return false;
    }

    preshift_channel = guild.channels.find(ch => ch.name === 'pre-shift-reminders')
    if (!preshift_channel){
        return false;
    }

    preshift_channel.send(guild.members.find(member => member.user.tag === "wlw#8168") + " I'm in!");
    return true;
}

function delay(t, val) {
   return new Promise(function(resolve) {
       setTimeout(function() {
           resolve(val);
       }, t);
   });
}

exports.handler = async (event) => {
    client.login(auth.token);
    await delay(2000);
    return status;
};