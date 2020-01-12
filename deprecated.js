// This file contains deprecated code from index.js
// May be useful for future Tech Officers to read through when stuck
// Code blocks are functional albeit nothing is imported in this file

// create dictionaries for id -> tempId -> name + discord tag
async function get_translators(shifts) {
    // get all EMT ids (airtable id link to Rider Shift Record)
    var user_ids = new Set([]);
    shifts.forEach(shift => shift["EMTs"].forEach(uid => user_ids.add(uid)));
    var users_string = Array.from(user_ids).toString();

    // get all EMT ids part 2 (airtable id link to Master Roster)
    var uId_to_tempId = {};
    var temp_ids = new Set([]);
    user_filter = `SEARCH(RECORD_ID(), "${users_string}") != ""`;
    await base('Rider Shift Record').select({
        filterByFormula: user_filter,
        fields: ["Name", "EMT"]
    }).eachPage(function page(records, fetchNextPage) {
        // This function (`page`) will get called for each page of records.
        console.log("rider shift record pages fetched");
        records.forEach(function(record) {
            uId_to_tempId[record.getId()] = record.get("EMT")
            temp_ids.add(record.get("EMT"))
        });
        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();
    //  uncomment for debugging purposes, it seems to mess with the async promises, unclear (fixed in index.js)
    // }, function done(err) {
    //     if (err) { console.error(err); return; }
    });

    // get all discord tags and names from Master Roster
    var tempId_string = Array.from(temp_ids).toString();
    var tempId_to_dTag = {};
    var tempId_to_name = {};
    user_filter = `SEARCH(RECORD_ID(), "${tempId_string}") != ""`;
    await base('Master Roster').select({
        filterByFormula: user_filter,
        fields: ["Name", "Discord Tag"]
    }).eachPage(function page(records, fetchNextPage) {
        // This function (`page`) will get called for each page of records.
        console.log("master roster pages fetched");
        records.forEach(function(record) {
            var name = record.get("Name")
            var first_name = name.substr(name.indexOf(",")+2)
            var last_name = name.substr(0, name.indexOf(","))
            tempId_to_dTag[record.getId()] = record.get("Discord Tag")
            tempId_to_name[record.getId()] =  `${first_name} ${last_name}`
        });
        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();
    //  uncomment for debugging purposes, it seems to mess with the async promises, unclear (fixed in index.js)
    // }, function done(err) {
    //     if (err) { console.error(err); return; }
    });

    return {
        "get_tempId": uId_to_tempId,
        "get_dTag": tempId_to_dTag,
        "get_name": tempId_to_name
    };
}


// translates the 2 level user_id to a discord member or name
function translate_id(user_id, translators, members){
    var err;
    try {
        err = `First layer translation failed`
        var tempId = translators["get_tempId"][user_id]
        err = `Second layer translation failed`
        dTag = translators["get_dTag"][tempId]
        return dTag ? members.find(member => member.user.tag === dTag) : translators["get_name"][tempId]
    } catch(e) {
        console.log(e)
        console.log(uesr_id, translators)
        throw err;
    }
} 

// generate the messages
// only to be called after client is ready (through client.on(ready))
async function send_preshift_messages(shifts, translators) {
    // crew room assignment function
    var counter = -1;
    rooms = 5;
    const room = () => {
        counter++;
        return counter % rooms + 1;
    } 

    // handle no shifts
    if (!shifts || !shifts.length) {
        // await preshift_channel.send("No shifts tomorrow!");
        success();
        return;
    }
    // generate messages
    var messages = [];
    shifts.forEach(function(shift){
        members = shift["EMTs"].map(id => translate_id(id, translators, guild.members)).join(", ");
        message = `**Pre-Shift Notification!**\n${members}\n` +
        `**Name:** ${shift["Shift"]}\n`+
        `**Date:** ${moment(shift["Date"]).format('LLL')}     **Hours:** ${shift["Hours"]}\n` +
        `**Crew Room:** ${room()}\n\u200b`;
        messages.push(message);
    });
    console.log(messages)

    // var message_promises = messages.map(message => preshift_channel.send(message));
    // await Promise.all(message_promises);
    success();
    return;
}