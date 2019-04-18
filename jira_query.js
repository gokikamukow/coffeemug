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


function get_jira_info(board_name, on_update) {
    var jira = {};

    jira_call("https://confluence.dolby.net/kb/rest/jiraanywhere/1.0/servers", function(msg) {
        AJS.$.each(msg, function(key, val) {
            if (val.name && val.name.indexOf('Dolby Issue System') > -1) {
                var jira_url = "https://confluence.dolby.net/kb/plugins/servlet/applinks/proxy?appId=" + val.id + "&path=" + val.url + "&maxResults=1000";

                jira_call(jira_url + "/rest/agile/1.0/board", function(msg) {
                    for (var i = 0; i < msg.values.length; i++) {
                        if (msg.values[i].name === board_name) {
                            jira.board = msg.values[i];
                            break;
                        }
                    }
                    jira.issues = [];
                    var issues_results = [];
                    var updated = false;

                    function get_next(startAt, maxResults, on_update) {
                        jira_call(jira_url + "/rest/agile/1.0/board/" + jira.board.id + "/backlog?jql=issuetype!%3DSub-task&startAt=" + startAt + "&maxResults=" + maxResults + "&fields=summary,customfield_10262,epic,fixVersions", function(msg) {
                            issues_results.push(msg);
                            issues_results.sort(function(a, b) {
                                return a.startAt - b.startAt
                            });
                            var issues = []
                            jira.issues = [];
                            for (var i = 0; i < issues_results.length; i++) {
                                var start = issues.length - issues_results[i].startAt;
                                start = start < 0 ? 0 : start;
                                issues = issues.concat(issues_results[i].issues.slice(start));
                            }
                            jira.issues = issues;
                            if ((issues.length == msg.total) && !updated) {
                                updated = true;
                                on_update(jira);
                            }
                        });
                    }

                    for (var i = 0; i < 1000; i+=1000) {
                        get_next(i, 1000, on_update);    
                    }
                });
            }
        });
    });
}
