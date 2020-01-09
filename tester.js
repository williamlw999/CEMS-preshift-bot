const Discord = require('discord.js');
const client = new Discord.Client();
const auth = require('./auth.json');


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    var success = send_preshift_message();
    client.destroy();

    if (success) {
        return {
            statusCode: 200,
            body: JSON.stringify('Hello from Lambda!'),
        };
    } else {
        return {
            statusCode: 100,
            body: JSON.stringify('Failed from Lambda!'),
        };
    }
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

function fake_timeout(r){
    return setTimeout(r, 1000)
}

var tester = false;
setTimeout(() => tester = true, 5000);


async function test() {
    console.log("hello\n");
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    while(true) {
        console.log(tester)
        if(tester) {
            break;
        }
        await sleep(1000);
    }
    // the set interval short poll is currently broken
    // const short_poll = setInterval(() => tester ? clearInterval(short_poll) : await sleep(100), 0)

    console.log("hello again\n");
}

test();
client.login(auth.token);