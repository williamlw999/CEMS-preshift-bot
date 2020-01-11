// dependencies
const Airtable = require('airtable');
const Discord = require('discord.js');
const moment = require('moment-timezone');

// auth file
const auth = require('./auth.json');

// api const's
const base = new Airtable({apiKey: auth.airtable_token}).base(auth.airtable_base_token);
const client = new Discord.Client();

// lambda is stupid about timezones, don't try to convert timezones
const ts = () => moment().isDST() ? moment().subtract(4, 'hours') : moment().subtract(5, 'hours');

// statuses
var status = {
    statusCode: 200,
    body: JSON.stringify('No message sent'),
};
var completed = false;

function success(){
    status = {
        statusCode: 200,
        body: JSON.stringify('Message sent'),
    };
    completed = true;
}

function fail(){
    status = {
        statusCode: 200,
        body: JSON.stringify('Message failed to send'),
    };
    completed = true;
}

// helper function to sleep ()
const sleep = ms => new Promise(r => setTimeout(r, ms));

// discord client ready handler
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    msg_sent = await send_preshift_message();
    msg_sent ? success() : fail();
});

async function send_preshift_message(){
    guild = client.guilds.find(g => g.name === "Crimson EMS")
    if (guild && guild.channels.find(ch => ch.name === 'pre-shift-reminders')){
        preshift_channel = guild.channels.find(ch => ch.name === 'pre-shift-reminders');
        await preshift_channel.send(guild.members.find(member => member.user.tag === "wlw#8168") + " I'm in!");
        return true;
    }
    return false;
}

exports.handler = async (event) => {
    client.login(auth.discord_token);
    send_preshift_message()

    // short-poll until client.on(ready) handler completes
    while(true) {
        console.log(completed, "\n")
        if(completed) {
            break;
        }
        await sleep(100);
    }
    client.destroy()
    status['utc_timestamp'] = moment().format();
    status['et_timestamp'] = ts().format();
    status['correct_Time'] = ts().hours() == 18;

    console.log(status, "\n")
    return status;
};