function formatObjTable(table, exclude, cls) {
    var str = [];
    for (var p in table) {
        if (table.hasOwnProperty(p) && exclude.indexOf(p) < 0) {
            str.push('<td><b>' + p + ': </b></td><td>' + [table[p]].join('') + '</td>');
        }
    }
    str = '<table class="' + cls + '" style=color:#fff><tr>' + str.join('</tr><tr>') + '</tr></table>';
    return str;
}

function get_issue_data(jira_data) {
    backlog = jira_data.issues.map(function(issue) {
        return [{
            x: 0,
            y: issue.fields.customfield_10262 ? issue.fields.customfield_10262 : 10,
            Key: issue.key,
            Summary: issue.fields.summary,
            "Story Points": issue.fields.customfield_10262,
            Version: (issue.fields.fixVersions && issue.fields.fixVersions.length > 0) ? issue.fields.fixVersions[0].name : "",
            Epic: issue.fields.epic ? issue.fields.epic.name : ""
        }]
    });

    var cumsum = 0;
    var epics = {};
    backlog.map(function(issue) {
        issue = issue[0];
        var key = issue.Epic + " (" + issue.Version + ")";
        if (!epics.hasOwnProperty(key)) {
            epics[key] = {
                start: cumsum,
                end: cumsum + issue.y
            };
        } else {
            epics[key].end = cumsum + issue.y;
        }
        cumsum += issue.y;
    });

    var epic_list = [];
    for (epic in epics) {
        if (epics.hasOwnProperty(epic)) {
            epic_list.push({
                epic: epic,
                start: epics[epic].start,
                end: epics[epic].end,
                idx: idx
            });
        }
    }

    epic_list.sort(function(a, b) {
        return a.start - b.start
    });
    for (var idx = 0; idx < epic_list.length; idx++) {
        epic_list[idx].idx = idx;
    }

    return [backlog, epic_list];
}

function analyse_issues(issues) {
    var breakdown = {
        epics: {},
        versions: {}
    };
    issues.map(function(issue) {
        issue = issue[0];
        breakdown.epics[issue.Epic] = (breakdown.epics[issue.Epic] || 0) + issue.y;
        breakdown.versions[issue.Version] = (breakdown.versions[issue.Version] || {});
        breakdown.versions[issue.Version][issue.Epic] = (breakdown.versions[issue.Version][issue.Epic] || 0) + issue.y;
        breakdown.versions[issue.Version].Total = (breakdown.versions[issue.Version].Total || 0) + issue.y;
    })

    for (var p in breakdown.versions) {
        if (breakdown.versions.hasOwnProperty(p)) {
            blank = breakdown.versions[p][''];
            delete breakdown.versions[p][''];
            if (blank > 0) {
                breakdown.versions[p]['No epic'] = blank;
            }

            total = breakdown.versions[p].Total;
            delete breakdown.versions[p].Total
            breakdown.versions[p].Total = total;
        }
    }

    return breakdown;
}

function plot_jira(target, issues, epic_list, velocity, startDate) {
    if (!velocity) {
        velocity = 30;
    }
    if (!startDate) {
        startDate = d3.time.thursday(new Date());
        startDate.setDate(startDate.getDate() + 7);
    }
    var velocity_per_day = velocity / 7;
    var parseDate = d3.time.format("%m/%Y").parse;

    var margin = {
            top: 20,
            right: 450,
            bottom: 30,
            left: 50
        },
        width = 1200 - margin.left - margin.right,
        height = 2000 - margin.top - margin.bottom;

    var endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7 * 26)

    var x = d3.scale.ordinal()
        .rangeRoundBands([0, width]);

    var y = d3.time.scale()
        .domain([startDate, endDate])
        .range([0, height]);

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left")
        .ticks(d3.time.thursdays, 2)
        .tickFormat(d3.time.format("%b %d"));
    
    // Clear all plot elements
    var elements = document.getElementsByClassName('d3-tip');
    while(elements.length > 0){
        elements[0].parentNode.removeChild(elements[0]);
    }
    document.getElementById(target).innerHTML = "";

    var svg = d3.select("#" + target).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var tip = d3.tip()
        .attr('class', 'd3-tip')
        .offset([-10, 0])
        .html(function(d) {
            return formatObjTable(d, ['x', 'y', 'y0'], 'tooltip')
        })

    svg.call(tip);

    plot(issues, epic_list);

    function plot(data, epic_list) {
        var layers = d3.layout.stack()(data);
        var box_marginv = 2;
        var box_marginh = 4;

        var versions = [];
        data.map(function(d) {
            if (versions.indexOf(d[0].Version) < 0) {
                versions.push(d[0].Version)
            }
        });
        versions.sort();

        var epics = [];
        data.map(function(d) {
            if (epics.indexOf(d[0].Epic) < 0) {
                epics.push(d[0].Epic)
            }
        });
        epics.sort();

        function colors_google(n) {
            var colors_g = ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477", "#66aa00", "#b82e2e", "#316395", "#994499", "#22aa99", "#aaaa11", "#6633cc", "#e67300", "#8b0707", "#651067", "#329262", "#5574a6", "#3b3eac"];
            return colors_g[(n + colors_g.length) % colors_g.length];
        }

        toDate = function(y) {
            d = new Date(startDate);
            d.setDate(d.getDate() + y / velocity_per_day);
            return d
        }

        x.domain(layers[0].map(function(d) {
            return d.x;
        }));

        var layer = svg.selectAll(".layer")
            .data(layers)
            .enter().append("g")
            .attr("class", "layer");

        boxheight = function(d) {
            return d3.max([1, y(toDate(d.y + d.y0)) - y(toDate(d.y0)) - box_marginv * 2]);
        }

        boxes = layer.selectAll("rect")
            .data(function(d) {
                return d;
            })
            .enter();

        boxes.append("rect")
            .attr("class", "boxes")
            .attr("x", function(d) {
                return box_marginh;
            })
            .attr("y", function(d) {
                return y(toDate(d.y0)) + box_marginv;
            })
            .attr("height", boxheight)
            .attr("width", width)
            .style("fill", function(d, i) {
                return colors_google(versions.indexOf(d.Version));
            })
            .on('mouseover', function(d) {
                x = tip.show(d);
                return x
            })
            .on('mouseout', tip.hide);

        boxes.append("text")
            .attr("class", "labels")
            .attr("x", function(d) {
                return d.x + box_marginh * 2 + 10 + 5;
            })
            .attr("y", function(d) {
                return y(toDate((d.y + 2 * d.y0) / 2)) + 1;
            })
            .attr("opacity", function(d) {
                return (boxheight(d) > 14 ? 1 : 0);
            })
            .text(function(d) {
                return d.Key + ": " + d.Summary + " (" + d.y + ")"
            });

        svg.append("g")
            .attr("class", "axis axis--y")
            .call(yAxis);

        var epiclayers = svg.append("g")
            .selectAll("g")
            .data(epic_list)
            .enter();

        var epicbarwidth = 25;
        epicboxheight = function(d) {
            return d3.max([1, y(toDate(d.end)) - y(toDate(d.start)) - box_marginv * 2]);
        }

        var ganttkeys = []
        for (var i = 0; i < epic_list.length; i++) {
            ganttkeys.push(epic_list[i].epic);
        }

        epiclayers.append("rect")
            .attr("class", "epicboxes")
            .attr("x", function(d) {
                return (box_marginh * 2 + 10 + width) + box_marginh + d.idx * epicbarwidth;
            })
            .attr("y", function(d) {
                return y(toDate(d.start));
            })
            .attr("height", function(d) {
                return epicboxheight(d) + box_marginv * 2
            })
            .attr("width", epicbarwidth - box_marginh)
            .style("stroke", '#000')
            .style("fill", '#fff');

        epiclayers.append("text")
            .attr("class", "epictext")
            .text(function(d) {
                return d.epic
            })
            .attr("transform", function(d) {
                return "translate(" + ((box_marginh * 2 + 10 + width) + box_marginh + d.idx * epicbarwidth + 6) + "," + (y(toDate(d.start)) + 10) + ")rotate(90)"
            });

        var epic_order = [];
        for (var i = 0; i < epic_list.length; i++) {
            epic_order.push(epic_list[i].epic);
        }

        boxes.append("rect")
            .attr("class", "ganttboxes")
            .attr("x", function(d) {
                return (box_marginh * 2 + 10 + width) + box_marginh + ganttkeys.indexOf(d.Epic + " (" + d.Version + ")") * epicbarwidth + 2;
            })
            .attr("y", function(d) {
                return y(toDate(d.y0)) + box_marginv;
            })
            .attr("height", boxheight)
            .attr("width", epicbarwidth - box_marginh - 4);


        var legendlayers = svg.append("g")
            .selectAll("g")
            .data(versions)
            .enter();

        var legend_spacing = 150;
        legendlayers.append("rect")
            .attr("class", "legendboxes")
            .attr("x", function(d) {
                return versions.indexOf(d) * legend_spacing;
            })
            .attr("y", function(d) {
                return -15;
            })
            .attr("height", function(d) {
                return 10
            })
            .attr("width", 10)
            .style("stroke", '#000')
            .style("fill", function(d, i) {
                return colors_google(versions.indexOf(d));
            });

        legendlayers.append("text")
            .attr("class", "legendtext")
            .attr("x", function(d) {
                return versions.indexOf(d) * legend_spacing + 15;
            })
            .attr("y", function(d) {
                return -5;
            })
            .text(function(d) {
                if (d)
                {
                    return d;
                }
                else
                {
                    return "None"
                }
            });
    }
}
