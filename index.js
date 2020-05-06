// dependencies
const Airtable = require('airtable');
const Discord = require('discord.js');
const moment = require('moment-timezone');

// auth file
const auth = require('./auth.json');

// Switches app functionality
// live mode one checks correct time, live mode off additionally sets time for December 3, 2019 for 3 CS 50 shifts
// send_msgs controls message sending
const live_mode = false;
const test_time = false;
const time_check = false;
const send_msgs = false;

// message constants
const no_shifts = "No shifts tomorrow!"
const disclaimer = `Note: The pre-shift bot is still in beta-testing, so please do not solely rely on this resource!`;
const contact = `If there is a problem within 24 hours of your shift, please contact the Crew Officer at (720) 454-9113`;

// api const's
const base = new Airtable({apiKey: auth.airtable_token}).base(auth.airtable_base_token);
const client = new Discord.Client();

const ts_to_str = ts => `DATETIME_PARSE("${ts.format('MM-DD-YYYY HH:mm')}$", 'MM-DD-YYYY HH:mm')`;

// helper function to sleep the process
const sleep = ms => new Promise(r => setTimeout(r, ms));

// error handling
const err_handle = (err) => { console.error(err); return; };

var guild = null;
var preshift_channel = null;


// discord client ready handler
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!\n`);

    // find our server and pre shift channel
    guild = client.guilds.cache.find(g => g.name === "CrimsonEMS");
    if (guild && guild.channels.cache.find(ch => ch.name === 'pre-shift-reminders')){
        preshift_channel = guild.channels.cache.find(ch => ch.name === 'pre-shift-reminders');
    } else {
        throw `Crimson EMS server or pre-shift-reminders channel not found`;
    }
    preshift_channel = live_mode ? preshift_channel : guild.channels.cache.find(ch => ch.name === 'test-bot')
});


// AWS Lambda trigger handler
exports.handler = async (event) => {
    // initial status
    var status = {
        utc_timestamp : moment().format(),
        et_timestamp : moment.tz("America/New_York").format(),
        correct_Time : moment.tz("America/New_York").hours() == 18,
        test_time : test_time,
        time_check : time_check,
        send_msgs : send_msgs,
    };

    // Since there are two triggers one for EST and another for EDT
    if (time_check && !(moment.tz("America/New_York").hours() == 18)) {
        console.log(status, "\n");
        return status;
    }

    // deploy the bot
    client.login(auth.discord_token);    
    // short-poll until client.on(ready) handler completes
    while(guild === null) {
        await sleep(100);
    }

    // get shift info, emt info, and send messages
    var shifts = await get_shifts(status).catch(err_handle);
    status["shifts"] = shifts
    var messages = await send_preshift_messages(shifts).catch(err_handle);
    status["messages"] = messages;

    // destroy the bot
    await client.destroy()

    console.log(status, "\n")
    return status;
};


// grab tomorrow's shifts from airtable
// if today is 1/1/2019, tomorrow defined as [1/2 5:00 am, 1/3 5:00 am)
// NOTE: we write down ET dates on airtable, but airtable configured to use GMT
async function get_shifts(status){
    var shifts = [];
    var shift_promises = [];
    // currently airtable uses GMT times, so we do not need to convert times as lambda system is in GMT
    // first shift of tomorrow
    var first_tomorrow = moment().add(1, "day").set('hour', 4).set('minute', 29);
    // last shift of tomorrow
    var last_tomorrow = moment().add(2, "day").set('hour', 4).set('minute', 30);

    if (!test_time) {  
        // months are 0 indexed   
        first_tomorrow = moment().set('month', 2).set('date', 8).set('year', 2020).set('hour', 4).set('minute', 30);         
        last_tomorrow = moment().set('month', 2).set('date', 9).set('year', 2020).set('hour', 4).set('minute', 30);   
    }

    // compose date range formula (IS_AFTER and IS_BEFORE are not inclusive)
    var after_first = `IS_AFTER({DATE}, ${ts_to_str(first_tomorrow)})`;
    var before_last = `IS_BEFORE({DATE}, ${ts_to_str(last_tomorrow)})`;
    var date_range = `IF(AND(${after_first}, ${before_last}), 1, 0)`;

    var time_msg = `\`\`\`ini\n[Preshift Messages for ${first_tomorrow.format('LLL')} - ${last_tomorrow.format('LLL')}!!!]\`\`\``;

    console.log(date_range);

    send_msgs ? await preshift_channel.send(time_msg).catch(err_handle) : undefined;

    // get shifts within date_range
    await base('Shift Tracker').select({
        filterByFormula: date_range,
        fields: ["Date", "Shift", "Shift Type", "Hours", "Rider Shift Record", "Location"],
        view: "Grid view",
        sort: [{field: "Date", direction: "asc"}, {field: "Hours", direction: "desc"}]
    }).all().then(async function parse_shift_records(records) {
        // `parse_shift_records` will get called for each page of records.
        console.log("shift pages fetched");

        if (!records) throw "pages are undefined" 

        shift_promises = records.map(async function(record) {
            shifts.push(await process_shift_record(record));
        });
        await Promise.all(shift_promises).catch(err_handle);
        // `then` is called when done
        // If an error is hit, `catch` will get called
    }).then(() => console.table(shifts)).catch(err_handle);
    return shifts;
}


// process records to create message json
async function process_shift_record(record) {
    await retrieve_link_data(record, 'Rider Shift Record', 'Rider Shift Record', ["EMT"], true);
    await retrieve_link_data(record, 'Rider Shift Record', 'Master Roster', ["Name", "Discord Tag"])
    console.log(record.get('Rider Shift Record'))

    return {
        Shift: record.get('Shift'),
        Date: record.get('Date'),
        Hours: record.get('Hours'),
        Location: record.get('Location'),
        EMTs: record.get('Rider Shift Record')
    }
}


// reaplces linked_field with list fields from linked_table
function retrieve_link_data(record, linked_field, linked_table, fields, flatten=false) {
    if (!fields) throw "must specify which fields from linked_field to retrive"
    const t = base.table(linked_table);
    const linkage = record.fields[linked_field];
    const linked_promises = (!linkage) ? [] : linkage.map((foreign_record_id) => {
        return t.find(foreign_record_id);
    });

    return Promise.all(linked_promises).then((values) => {
        values = (!values) ? [] : values.map((v) => {
            return fields.map(field => v._rawJson["fields"][field]);
        });
        values = flatten ? values.flat(Infinity) : values

        record.fields[linked_field] = values;
        record._rawJson.fields[linked_field] = values;
    }).catch(err_handle);
}


// generate the messages
// only to be called after client is ready (through client.on(ready))
async function send_preshift_messages(shifts) {
    // handle no shifts
    if (!shifts || !shifts.length) {
        if (send_msgs) {
            await preshift_channel.send(no_shifts + "\n" + contact).catch(err_handle);
        }
        return messages;
    }
    // generate messages
    var messages = [];
    shifts = shifts.sort((a,b) => moment(a["Date"]) - moment(b["Date"]));
    shifts.forEach(function(shift){
        // shift["EMTs"] contains a list of [EMT name, discord tag]
        if (!shift["EMTs"]  || shift["EMTs"].length == 0) {
            var members = "No EMTs assigned on record"
        } else {
            var members = shift["EMTs"].map(id => get_discord_tag(id, guild.members)).join(", ");
        }
        var date = moment(shift["Date"]).utc().format('MMMM DD, YYYY kk:mm')
        message = `**Pre-Shift Notification!**\n` +
        `**EMTs:** ${members}\n` +
        `**Name:** ${shift["Shift"] ? shift["Shift"] : "No shift name on record"}\n`+
        `**Date:** ${date}     **Hours:** ${shift["Hours"]}\n` +
        `**Location:** ${shift["Location"] ? shift["Location"] : "No location on record"}\n\u200b`;
        messages.push(message);
    });
    console.log("messages generated");

    messages.push(disclaimer + "\n" + contact);

    var message_promises = messages.map(message => send_msgs ? preshift_channel.send(message) : undefined);
    await Promise.all(message_promises).catch(err_handle);
    return messages;
}


// emt record should be of the form [emt name, discord tag]
function get_discord_tag(emt_record, guild_members) {
    const get_member = (dtag) => guild_members.cache.find(member => member.user.tag.toLowerCase() === dtag.toLowerCase());
    const get_name = (name) => `${name.substr(name.indexOf(",")+2)} ${name.substr(0, name.indexOf(","))}`;
    if (emt_record[1]) {
        dtag = get_member(emt_record[1]);
        return dtag ? dtag : get_name(emt_record[0])
    }
    return get_name(emt_record[0]);
}