var jiraq = {

    preparedom : function (target_id) {
        ip = document.createElement('input');
        ip.text = 'Reload data from JIRA'
        document.getElementById(target_id).appendChild(ip)
    }

};



function jira_call(url, on_success) {
    AJS.$.ajax({
        url: url,
        type: "GET",
        async: true,
        dataType: "json"
    }).done(on_success).fail(function(jqXHR, textStatus) {
        data = {
            'textStatus': textStatus,
            'url': url
        };
        alert("Request failed: " + JSON.stringify(data, null, 4));
    });
}


function jira_get_all(query_url, fieldname, on_update) {
    var updated = false;
    var messages = [];
    var n_issued = -1;
    var max_results = 50;
    
    jira_call(query_url + "&maxResults=0", function(msg) {
        var nvals = msg.total;

        function get_single(start_at, on_update) {
            n_issued = n_issued + 1;
            jira_call(query_url + "&startAt=" + start_at + "&maxResults=" + max_results, function(msg) {
                messages.push(msg);
                messages.sort(function(a, b) {
                    return a.startAt - b.startAt
                });
                var has_gaps = false;
                for (var i = 1; i < messages.length; i++) {
                    if (messages[i].startAt != (messages[i-1].startAt + messages[i-1][fieldname].length))
                    {
                        has_gaps = true;
                    }
                }
                if ((messages[0].startAt == 0 && messages[messages.length - 1].startAt + messages[messages.length - 1].issues.length >= nvals) && !updated && !has_gaps) {
                    updated = true;
                    console.log("got all " + nvals + " results, last total was " + messages[messages.length - 1].total);
                    var results = [];
                    for (var i = 0; i < messages.length; i++) {
                        results = results.concat(messages[i][fieldname])
                    }
                    on_update(messages, results);
                }
            });
        };

        for (var start_at = 0; start_at < nvals; start_at = start_at + max_results) {
            get_single(start_at, on_update, fieldname);
        }
    });
}


function get_jira_info(startAt, board_name, jql, restrict_fields, on_update) {
    var jira = {};
    jira.board_name = board_name;

    base_url = window.location.href.toString().split('/').slice(0, 4).join('/')

    jira_call(base_url + "/rest/jiraanywhere/1.0/servers", function(msg) {
        AJS.$.each(msg, function(key, val) {
            if (val.name && val.name.indexOf('Issue System') > -1) {
                var jira_url = base_url + "/plugins/servlet/applinks/proxy?appId=" + val.id + "&path=" + val.url;

                jira_call(jira_url + "/rest/greenhopper/1.0/rapidviews/viewsData", function(msg) {
                    for (var i = 0; i < msg.views.length; i++) {
                        if (msg.views[i].name === board_name) {
                            jira.board = msg.views[i];
                            break;
                        }
                    }
                    jira_call(jira_url + "/rest/agile/1.0/board/" + jira.board.id + "/configuration", function(msg) {
                        jira.board.config = msg;

                        console.log("Board ID is " + jira.board);

                        var prefix = "?"
                        var query_url = jira_url + "/rest/agile/1.0/board/" + jira.board.id + "/backlog"
                        if (jql != undefined)
                        {
                            query_url = query_url + prefix + "jql=" + encodeURIComponent(jql);
                            prefix = "&";
                        }
                        if (restrict_fields != undefined)
                        {
                            
                            query_url = query_url + prefix + "fields=" + restrict_fields.join(",");
                            prefix = "&";
                        }
                        jira_get_all(query_url, "issues", function (messages, issues) {
                            jira.issues = issues;
                            jira.messages = messages;
                            console.log(jira);
                            on_update(jira);
                        });
                    });
                });
            }
        });
    });
}

function jira_moves_to_clipboard(rankCustomFieldId, moves) {
    const el = document.createElement('textarea');
    el.value = JSON.stringify([rankCustomFieldId].concat(moves));
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
}

bookmarklet = String.raw`javascript: function do_moves(rankCustomFieldId, moves) {AJS.$.ajax({data: JSON.stringify({'issues': [moves[0][0]], 'rankBeforeIssue': moves[0][1], "rankCustomFieldId":rankCustomFieldId}), url: 'https://jira.dolby.net/jira/rest/agile/1.0/issue/rank', type: "PUT", async: true, datatype: 'json', contentType: 'application/json'}).done(function() {data = JSON.parse(this.data); console.log('Succeeded in moving ' + data.issues[0] + ' before ' + data.rankBeforeIssue); if (moves.length > 1) {do_moves(rankCustomFieldId, moves.slice(1))} else {alert('Success')}}).fail(function() {console.log(this); alert('Failed')})}; var reply = window.prompt("Paste your issue moves here: "); moves = JSON.parse(reply); if ((moves != null) && (moves != undefined) && (moves.length > 1) && (moves.slice(1).map(function (move) {return move.length == 2;})).reduce(function(a, b) {return a && b;})) {do_moves(moves[0], moves.slice(1))} else {alert("Invalid move syntax, must be [rankCustomFieldId, [issueToMove, aboveThisIssue], ...]")};`
