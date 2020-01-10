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
const ts = moment().isDST() ? moment().subtract(4, 'hours') : moment().subtract(5, 'hours');

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
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    if (send_preshift_message()) {
        success();
    } else {
        failed();
    }
});
    
// grab tomorrow's shifts from airtable
// if today is 1/1/2019, tomorrow defined as 1/2 5:30 am to 1/3 5:30 am
function get_shifts(){
    // get today's date

    // find all shifts happening tomorrow
    //      say notification at 1/1/2019 6:30pm
    //      we want shifts between 1/2/2019 5:30am - 1/3/2019 5:30 am

    // get top 20 shifts
    // order shifts by time desc
    // find when last shift of "tomorrow" is (ie. day+2 5:30 am)
    // record all shifts until first shift (ie. day+1 5:30 am)
    //      if day+1 5:30 am is not hit, retry with top 40 shifts

    // return array of shifts 
}

// send message:
// for each shift, generate a preshift message:
// [@crew1 @crew2 ... ] Pre-shift notification!
// Date: [date + time]
// Name: 
// Location:

function send_preshift_message(){
    guild = client.guilds.find(g => g.name === "Crimson EMS")
    if (guild && guild.channels.find(ch => ch.name === 'pre-shift-reminders')){
        preshift_channel = guild.channels.find(ch => ch.name === 'pre-shift-reminders');
        preshift_channel.send(guild.members.find(member => member.user.tag === "wlw#8168") + " I'm in!");
        return true;
    }
    return false;
}

exports.handler = async (event) => {

    client.login(auth.discord_token);
    send_preshift_message()

    // short-poll until client.on(ready) handler completes
    while(true) {
        console.log(completed)
        if(completed) {
            break;
        }
        await sleep(100);
    }

    client.destroy();

    status['utc_timestamp'] = moment();
    status['et_timestamp'] = ts;
    status['correct_Time'] = ts.hours() == 18;

    return status;
};