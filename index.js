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
const time_check = false;
const send_msgs = false;

// api const's
const base = new Airtable({apiKey: auth.airtable_token}).base(auth.airtable_base_token);
const client = new Discord.Client();

// lambda is bad with timezones (forces gmt), timezones must be converted manually
const to_est = ts => ts.isDST() ? ts.subtract(4, 'hours') : ts.subtract(5, 'hours');
const get_et_tz = () => moment().isDST() ? "-04:00" : "-05:00"
// this version of ts_to_str adds the est timezone, but airtable is currently using GMT
// const ts_to_str = ts => `DATETIME_PARSE("${ts.format('MM-DD-YYYY HH:mm')} ${get_et_tz()}", 'MM-DD-YYYY HH:mm Z')`;
const ts_to_str = ts => `DATETIME_PARSE("${ts.format('MM-DD-YYYY HH:mm')}$", 'MM-DD-YYYY HH:mm Z')`;

// helper function to sleep the process
const sleep = ms => new Promise(r => setTimeout(r, ms));

// error handler callback
const err_handle = err => { console.error(err); fail(); return; };

// statuses
var status = {
    statusCode: 200,
    body: JSON.stringify('No message sent'),
};
var completed = false;

function success(){
    status['body'] =JSON.stringify('Message sent');
    completed = true;
}

function fail(){
    status['body'] = JSON.stringify('Message failed to send');
    completed = true;
}

var guild;
var preshift_channel;

// discord client ready handler
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!\n`);

    // find our server and pre shift channel
    guild = client.guilds.find(g => g.name === "CrimsonEMS");
    if (guild && guild.channels.find(ch => ch.name === 'pre-shift-reminders')){
        preshift_channel = guild.channels.find(ch => ch.name === 'pre-shift-reminders');
    } else {
        throw `Crimson EMS server or pre-shift-reminders channel not found`;
    }

    // get shift info, emt info, and send messages
    var shifts = await get_shifts().catch(err_handle);
    await send_preshift_messages(shifts).catch(err_handle);
});

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

// grab tomorrow's shifts from airtable
// if today is 1/1/2019, tomorrow defined as [1/2 5:00 am, 1/3 5:00 am)
// NOTE: we write down ET dates on airtable, but airtable configured to use GMT
async function get_shifts(){
    var shifts = [];
    var shift_promises = [];
    // Note that moment() returns the GMT time in Lambda, so we manually convert to EST
    // first shift of tomorrow
    var first_tomorrow = to_est(moment()).add(1, "day").set('hour', 4).set('minute', 29);
    // last shift of tomorrow
    var last_tomorrow = to_est(moment()).add(2, "day").set('hour', 4).set('minute', 30);

    if (!live_mode) {  
        // months are 0 indexed   
        first_tomorrow = to_est(moment()).set('month', 1).set('date', 15).set('year', 2020).set('hour', 4).set('minute', 30);         
        last_tomorrow = to_est(moment()).set('month', 1).set('date', 16).set('year', 2020).set('hour', 4).set('minute', 30);   
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

// emt record should be of the form [emt name, discord tag]
function get_discord_tag(emt_record, guild_members) {
    const get_member = (dtag) => guild_members.find(member => member.user.tag.toLowerCase() === dtag.toLowerCase());
    const get_name = (name) => `${name.substr(name.indexOf(",")+2)} ${name.substr(0, name.indexOf(","))}`;
    if (emt_record[1]) {
        dtag = get_member(emt_record[1]);
        return dtag ? dtag : get_name(emt_record[0])
    }
    return get_name(emt_record[0]);
}

// generate the messages
// only to be called after client is ready (through client.on(ready))
async function send_preshift_messages(shifts) {
    // handle no shifts
    if (!shifts || !shifts.length) {
        if (send_msgs) {
            await preshift_channel.send("No shifts tomorrow!").catch(err_handle);
        }
        success();
        return;
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

    var disclaimer = `Note: The pre-shift bot is still in beta-testing, so please do not solely rely on this resource!`;
    messages.push(disclaimer);
    status["messages"] = messages;

    var message_promises = messages.map(message => send_msgs ? preshift_channel.send(message) : undefined);
    await Promise.all(message_promises).catch(err_handle);
    success();
    return;
}

// in case of failure, switch completed to true
process.on('exit', () => completed = true);

// AWS Lambda trigger handler
exports.handler = async (event) => {
    // store time stamp info 
    status['utc_timestamp'] = moment().format();
    status['et_timestamp'] = to_est(moment()).format();
    status['correct_Time'] = to_est(moment()).hours() == 18;

    // Since there are two triggers one for EST and another for EDT
    if (time_check && !(to_est(moment()).hours() == 18)) {
        console.log(status, "\n");
        return status;
    }

    // deploy the bot
    client.login(auth.discord_token);    
    // short-poll until client.on(ready) handler completes
    while(true) {
        if(completed) {
            break;
        }
        await sleep(100);
    }
    // destroy the bot
    await client.destroy().catch(err_handle)

    console.log(status, "\n")
    return status;
};