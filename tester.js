// dependencies
const Airtable = require('airtable');
const Discord = require('discord.js');
const moment = require('moment-timezone');

// auth file
const auth = require('./auth.json');

// api const's
const table = new Airtable({apiKey: auth.airtable_token}).base(auth.airtable_base_token);
const client = new Discord.Client();

// lambda is stupid about timezones (forces gmt), timezones must be converted manually
const to_est = ts => ts.isDST() ? ts.subtract(4, 'hours') : ts.subtract(5, 'hours');
const et_to_gmt = () => moment().isDST() ? "-04:00" : "-05:00"
const ts_to_str = ts => `DATETIME_PARSE("${ts.format('MM-DD-YYYY HH:mm')} ${et_to_gmt()}", 'MM-DD-YYYY HH:mm Z')`;

// helper function to sleep the process
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// discord client ready handler
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    send_preshift_messages(client)
});

// process records to create message json
function process_shift_record(record) {
    return {
        Shift: record.get('Shift'),
        Date: record.get('Date'),
        Hours: record.get('Hours'),
        EMTs: record.get('Rider Shift Record')
    }
}

// grab tomorrow's shifts from airtable
// if today is 1/1/2019, tomorrow defined as [1/2 5:00 am, 1/3 5:00 am)
// NOTE: we write down ET dates on airtable, but airtable configured to use GMT
async function get_shifts(){
    var shifts = [];
    // first shift of tomorrow
    var first_tomorrow = to_est(moment()).add(1, "day").set('hour', 4).set('minute', 59);
    first_tomorrow = to_est(moment()).set('month', 11).set('date', 3).set('hour', 4).set('minute', 59).set('year', 2019);
    // last shift of tomorrow
    var last_tomorrow = to_est(moment()).add(2, "day").set('hour', 5).set('minute', 0);
    last_tomorrow = to_est(moment()).set('month', 11).set('date', 4).set('hour', 5).set('minute', 0).set('year', 2019);
    
    // compose date range formula (IS_AFTER and IS_EFORE are not inclusive)
    var after_first = `IS_AFTER({DATE}, ${ts_to_str(first_tomorrow)})`;
    var before_last = `IS_BEFORE({DATE}, ${ts_to_str(last_tomorrow)})`;
    var date_range = `IF(AND(${after_first}, ${before_last}), 1, 0)`;

    console.log(date_range)

    // get shifts within date_range
    await table('Shift Tracker').select({
        filterByFormula: date_range,
        fields: ["Date", "Shift", "Shift Type", "Hours", "Rider Shift Record"],
        view: "Grid view",
        sort: [{field: "Date", direction: "asc"}, {field: "Hours", direction: "desc"}]
    }).eachPage(function parse_shift_records(records, fetchNextPage) {
        // `parse_shift_records` will get called for each page of records.
        console.log("pages fetched");
        records.forEach(function(record) {
            shifts.push(process_shift_record(record));
        });
        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `parse_shift_records` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();
    // }, function done(err) {
    //     if (err) { console.error(err); } return;
    });
    return shifts;
}

// grab crew discord tags
async function get_discord_tags(shifts) {
    // get all user ids
    var user_ids = new Set([]);
    shifts.forEach(shift => shift["EMTs"].forEach(uid => user_ids.add(uid)));
    var users_string = Array.from(user_ids).toString();
    console.log(users_string);

    var uId_to_tempId = {};
    var temp_ids = new Set([]);
    user_filter = `SEARCH(RECORD_ID(), "${users_string}") != ""`;
    console.log(user_filter)
    await table('Rider Shift Record').select({
        filterByFormula: user_filter,
        fields: ["Name", "EMT"]
    }).eachPage(function page(records, fetchNextPage) {
        // This function (`page`) will get called for each page of records.
        console.log("pages fetched");
        records.forEach(function(record) {
            console.log('Retrieved', record.get('Name'), record.getId(), record.get("EMT"));
            uId_to_tempId[record.getId()] = record.get("EMT")
            temp_ids.add(record.get("EMT"))
        });
        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();
    // }, function done(err) {
    //     if (err) { console.error(err); return; }
    });

    var tempId_string = Array.from(temp_ids).toString();
    var tempId_to_dTag = {};
    var tempId_to_name = {};
    user_filter = `SEARCH(RECORD_ID(), "${tempId_string}") != ""`;
    console.log(user_filter)
    await table('Master Roster').select({
        filterByFormula: user_filter,
        fields: ["Name", "Discord Tag"]
    }).eachPage(function page(records, fetchNextPage) {
        // This function (`page`) will get called for each page of records.
        console.log("pages fetched");
        records.forEach(function(record) {
            console.log('Retrieved', record.get('Name'), record.getId(), record.get("Discord Tag"));
            tempId_to_dTag[record.getId()] = record.get("Discord Tag")
            tempId_to_name[record.getId()] = record.get("Name")
        });
        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();
    // }, function done(err) {
    //     if (err) { console.error(err); return; }
    });
    console.log(uId_to_tempId)
    console.log(tempId_to_name)
    console.log(tempId_to_dTag)

    // .eachPage(function parse_dtag_records(records, fetchNextPage) {
    //     // `parse_dtag_records` will get called for each page of records.
    //     // records.forEach(record => uid_to_dtag[record.getId()] = record["Discord Tag"]);
    //     // To fetch the next page of records, call `fetchNextPage`.
    //     // If there are more records, `parse_dtag_records` will get called again.
    //     // If there are no more records, `done` will get called.
    //     // Note: `done` was removed due to not needing it, check airtable api for `done`
    //     fetchNextPage();
    // });
    return uid_to_dtag
}

// generate the messages
function generate_preshift_messages(guild, shifts, discord_tags) {

}

// send message:
// for each shift, generate a preshift message:
// [@crew1 @crew2 ... ] Pre-shift notification!
// Date: [date + time]
// Name: 
// Location:

function send_preshift_messages(client){
    guild = client.guilds.find(g => g.name === "Crimson EMS")
    if (guild && guild.channels.find(ch => ch.name === 'pre-shift-reminders')){
        preshift_channel = guild.channels.find(ch => ch.name === 'pre-shift-reminders');
        preshift_channel.send(guild.members.find(member => member.user.tag === "wlw#8168") + " I'm in!");
        return true;
    }
    return false;
}

// timeout tester
var tester = false;
setTimeout(() => tester = true, 5000);

async function test() {
    console.log("hello\n");
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    while(true) {
        console.log(tester);
        if(tester) {
            break;
        }
        await sleep(1000);
    }
    // the set interval short poll is currently broken
    // const short_poll = setInterval(() => tester ? clearInterval(short_poll) : await sleep(100), 0)

    console.log("hello again\n");
}

async function test_runner() {
    shifts = await get_shifts();
    console.log(shifts)
    uid_to_dtag = await get_discord_tags(shifts);
    console.log(uid_to_dtag)
}

test_runner();
// client.login(auth.discord_token);
// test();
// client.destroy();
// console.log(status)