// dependencies
const Airtable = require('airtable');
const Discord = require('discord.js');
const moment = require('moment-timezone');

// auth file
const auth = require('./auth.json');

// Switches app functionality
// live mode false sends to bot-test channel
// real_time false allows you to set custom time range in code
// time_check false allows bot to run at any time (ie. not just 6:30 pm eastern)
// send_msgs false prevents message sending
const live_mode = false;
const time_check = false;
const real_time = false;
const send_msgs = false;

const first_test_date = moment("3/7/2020 04:30", "MM/DD/YYYY HH:mm");
const last_test_date = moment("3/9/2020 04:30", "MM/DD/YYYY HH:mm");

// message constants
const no_shifts = "No shifts tomorrow!"
const disclaimer = "Note: The pre-shift bot is still in beta-testing, so please do not solely rely on this resource!";
const contact = "If there is a problem within 24 hours of your shift, please contact the Crew Officer at (720) 454-9113";

// error handling
const err_handle = (err) => { console.error(err); return ; };

// AWS Lambda trigger handler
exports.handler = async (event) => {
    // instance context
    // currently airtable uses GMT times, so we do not need to convert times as lambda system is in GMT
    const first_date = real_time ? moment().add(1, "day").set('hour', 4).set('minute', 29) : first_test_date;
    const last_date = real_time ? moment().add(2, "day").set('hour', 4).set('minute', 30) : last_test_date;
    const time_msg = `\`\`\`ini\n[Preshift Messages for ${first_date.format('LLL')} - ${last_date.format('LLL')}!!!]\`\`\``;
    const context = {
        start : first_date,
        end : last_date,
        live_mode : live_mode,
        time_check : time_check,
        real_time : real_time,
        send_msgs : send_msgs,
    };
    console.log(JSON.stringify(context));

    // initial status
    const now = moment.tz("America/New_York");
    let status = {
        utc_timestamp : moment().format(),
        et_timestamp : now.format(),
        correct_time : now.hour() == 18 && now.minute() == 30,
        time_check : time_check,
        real_time : real_time,
        send_msgs : send_msgs,
    };

    // Since there are two triggers one for EST and another for EDT
    if (time_check && !status["correct_time"]) {
        console.log("Time check failed. Returning");
        console.log(status, "\n");

        return status;
    }

    // api consts
    const base = new Airtable({apiKey: auth.airtable_token}).base(auth.airtable_base_token);
    const client = new Discord.Client();

    // deploy the bot
    client.login(auth.discord_token);
    await new Promise(resolve => client.on('ready', resolve));
    console.log("Discord ready.");

    // find our server and pre shift channel
    console.log("Discord ready");
    const guild = client.guilds.cache.find(g => g.id == auth.server);
    if (!guild) {
        await client.destroy();
        throw `${auth.server} server not found`;
    }
    const channelName = live_mode ? auth.channel : auth.bot_channel;
    const preshift_channel = guild.channels.cache.find(ch => ch.name == channelName);
    if (!preshift_channel) {
        await client.destroy();
        throw `${channelName} channel not found`;
    }

    // get shifts and generate messages
    const shifts = await get_shifts(status, context, base).catch(err_handle);
    status["shifts"] = shifts
    const messages = await send_preshift_messages(shifts, guild).catch(err_handle);
    status["messages"] = messages;

    // send messages
    if (send_msgs) {
        console.log("Sending messages");
        await preshift_channel.send(time_msg);
        if (!messages.length) {
            await preshift_channel.send(no_shifts);
        } else {
            const message_promises = messages.map(message => preshift_channel.send(message));
            await Promise.all(message_promises);
        }
        console.log("Messages sent!")
    } else { console.log("Not sending messages"); }

    // destroy the bot
    await client.destroy()

    console.log(status, "\n")
    return status;
};


// grab tomorrow's shifts from airtable
// if today is 1/1/2019, tomorrow defined as [1/2/19 4:30 am, 1/3/19 4:30 am)
// NOTE: we write down ET dates on airtable, but airtable configured to use GMT
async function get_shifts(status, context, base) {
    // compose date range formula
    const airtableTimeStr = ts => `DATETIME_PARSE("${ts.format('MM-DD-YYYY HH:mm')}$", 'MM-DD-YYYY HH:mm')`;
    const after_first = `IS_AFTER({DATE}, ${airtableTimeStr(context["start"])})`;
    const before_last = `IS_BEFORE({DATE}, ${airtableTimeStr(context["end"])})`;
    const date_range = `IF(AND(${after_first}, ${before_last}), 1, 0)`;
    console.log(date_range);

    // get shifts within date_range
    const records = await new Promise((resolve, reject) => {
        base('Shift Tracker').select({
            filterByFormula: date_range,
            fields: ["Date", "Shift", "Shift Type", "Hours", "Rider Shift Record", "Location"],
            view: "Grid view",
            sort: [{field: "Date", direction: "asc"}, {field: "Hours", direction: "desc"}]
        }).firstPage((err, records) => {
            if (err) reject(err);
            if (!records) reject("get_shifts pages are undefined");
            resolve(records);
        });
    });

    // process shifts
    let shifts = []; 
    const shift_promises = records.map(async (record) => {
        shifts.push(await process_shift_record(record, base));
    });
    await Promise.all(shift_promises).catch(err => { throw err; });
    console.table(shifts)
    return shifts;
}


// process records to create message json
async function process_shift_record(record, base) {
    await retrieve_link_data(record, 'Rider Shift Record', 'Rider Shift Record', ["EMT"], base, true);
    await retrieve_link_data(record, 'Rider Shift Record', 'Master Roster', ["Name", "Discord Tag"], base);
    console.log(record.get('Rider Shift Record'));

    return new Promise((resolve, reject) => resolve({
        Shift: record.get('Shift'),
        Date: record.get('Date'),
        Hours: record.get('Hours'),
        Location: record.get('Location'),
        EMTs: record.get('Rider Shift Record')
    }));
}


// replaces linked_field with list fields from linked_table
function retrieve_link_data(record, linked_field, linked_table, fields, base, flatten=false) {
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
async function send_preshift_messages(shifts, guild) {
    let messages = [];

    // handle no shifts
    if (!shifts || !shifts.length) {
        return messages;
    }
    // generate messages
    shifts = shifts.sort((a,b) => moment(a["Date"]) - moment(b["Date"]));
    shifts.forEach(function(shift){
        // shift["EMTs"] contains a list of [EMT name, discord tag]
        const members = (!shift["EMTs"]  || shift["EMTs"].length == 0)
            ? "No EMTs assigned on record"
            : shift["EMTs"].map(id => get_discord_tag(id, guild.members)).join(", ");
         date = moment(shift["Date"]).utc().format('MMMM DD, YYYY kk:mm')
        message = `**Pre-Shift Notification!**\n` +
        `**EMTs:** ${members}\n` +
        `**Name:** ${shift["Shift"] ? shift["Shift"] : "No shift name on record"}\n`+
        `**Date:** ${date}     **Hours:** ${shift["Hours"]}\n` +
        `**Location:** ${shift["Location"] ? shift["Location"] : "No location on record"}\n\u200b`;
        messages.push(message);
    });
    console.log("messages generated");

    messages.push(disclaimer + "\n" + contact);
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