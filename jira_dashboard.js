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
            y: issue.fields.customfield_10262 != null ? issue.fields.customfield_10262 : 10,
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
                end: cumsum + issue.y,
                epic: issue.Epic,
                version: issue.Version
            };
        } else {
            epics[key].end = cumsum + issue.y;
        }
        cumsum += issue.y;
    });

    var epic_list = [];
    for (key in epics) {
        if (epics.hasOwnProperty(key)) {
            epic_list.push({
                key: key,
                start: epics[key].start,
                end: epics[key].end,
                idx: idx,
                epic: epics[key].epic,
                version: epics[key].version
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

function plot_jira(target, jira_data, velocity, startDate) {
    var backlog, epic_list;
    [backlog, epic_list] = get_issue_data(jira_data);

    if (!velocity) {
        velocity = 30;
    }
    if (!startDate) {
        startDate = d3.time.thursday(new Date());
        startDate.setDate(startDate.getDate() + 7);
    }
    var velocity_per_day = velocity / 7;

    var margin = {
            top: 20,
            right: 450,
            bottom: 30,
            left: 50
        };
    width = 1200 - margin.left - margin.right;
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
    function clear_plot() {
        var elements = document.getElementsByClassName('d3-tip');
        while(elements.length > 0){
            elements[0].parentNode.removeChild(elements[0]);
        }
        document.getElementById(target).innerHTML = "";
    }
    clear_plot();

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

    toDate = function(y) {
        d = new Date(startDate);
        return new Date(d.getTime() + y / velocity_per_day * 24 * 60 * 60000);
    }

    function get_ytransform(el)
    {
        if (el.attr("transform") != "")
        {
            return parseFloat(el.attr("transform").split(",")[1].replace(/[^\d.]/g, ''));
        }
        else
        {
            return 0;
        }
    }

    var issue_moves = [];
    var above_issue;

    var drag_y = undefined;
    var curr_drag_index = undefined;
    var drag = d3.behavior.drag()
        .on("dragstart", dragstarted)
        .on("drag", dragged)
        .on("dragend", dragended)
        .origin(function(d) {return {'y': get_ytransform(d3.select(this))}})
        
    function dragstarted(d) {
        curr_drag_index = backlog.map(function(d){return d[0].Key;}).indexOf(d3.event.sourceEvent.target.__data__.Key);
        d3.event.sourceEvent.stopPropagation();
        d3.select(this).classed("dragging", true);
        d3.select(this).selectAll("rect").classed("dragging", true);
    }

    function dragged(d) {
        tip.hide();
        drag_y = d3.event.y;
        if (curr_drag_index != undefined)
        {
            new_index = backlog.map(function (d) {
                  return y(toDate(d[0].y0 + d[0].y/2));
                }).findIndex(function (d) {return d > drag_y;})
            if (curr_drag_index != new_index)
            {
                jira_data.issues.move(curr_drag_index, new_index);
                [backlog, epic_list] = get_issue_data(jira_data);
                above_issue = backlog[new_index + 1][0].Key;
                new_jira_data = backlog;
                curr_drag_index = new_index;
                plot(backlog, epic_list);
            }
        }
        d3.select(this).attr("transform", "translate(0, " + (d3.event.y) + ")");
    }

    Array.prototype.move = function(from, to) {
        this.splice(to, 0, this.splice(from, 1)[0]);
    };

    function dragended(d) {
        d3.select(this).classed("dragging", false);
        d3.select(this).selectAll("rect").classed("dragging", false);
        if (above_issue != undefined)
        {
            issue_moves.push([backlog[curr_drag_index][0].Key, above_issue]);
            jira_data.moves = issue_moves;
            console.log(issue_moves)
        }
        plot(backlog, epic_list);
        drag_y = undefined;
        curr_drag_index = undefined
        above_issue = undefined;
    }

    plot(backlog, epic_list);

    function plot(data, epic_list) {
        //svg.selectAll("g").data([]).exit().remove()

        var layers = d3.layout.stack()(data).map(function (d) {return d[0]});
        var box_marginv = 2;
        var box_marginh = 4;
        var epic_barwidth = 25;

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

        var epic_order = [];
        for (var i = 0; i < epic_list.length; i++) {
            epic_order.push(epic_list[i].key);
        }

        function colors_google(n) {
            var colors_g = ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477", "#66aa00", "#b82e2e", "#316395", "#994499", "#22aa99", "#aaaa11", "#6633cc", "#e67300", "#8b0707", "#651067", "#329262", "#5574a6", "#3b3eac"];
            return colors_g[(n + colors_g.length) % colors_g.length];
        }

        x.domain(layers.map(function(d) {
            return d.x;
        }));

        layer_base = svg.selectAll(".layer")
            .data(layers, function(d) { return d.Key; });

        layer = layer_base.enter().append("g")
            .attr("class", "layer")
            .attr("transform", function(d) {
                return "translate(0, " + (y(toDate(d.y0))) + ")"
            })
            .call(drag);

        layer_base
            /* Don't transition items being dragged */
            .select(function (d,i) {return d3.select(this).classed("dragging") ? null : this;})
            .transition()
            .attr("transform", function(d) {
                return "translate(0, " + (y(toDate(d.y0))) + ")"
            });

        boxheight = function(d) {
            return d3.max([1, y(toDate(d.y + d.y0)) - y(toDate(d.y0)) - box_marginv * 2]);
        }

        function addRow(d, i) {
            d3.select(this)
                .append("rect")
                .attr("class", "storybox");

            d3.select(this)
                .append("text")
                .attr("class", "storylabel");;

            d3.select(this)
                .append("rect")
                .attr("class", "ganttboxes");
            
            d3.select(this)
                .append("path")
                .attr("class", "milestones");
        }

        function updateRow(d, i) {
            d3.select(this)
                .selectAll(".storybox")
                .datum(d)
                .attr("x", box_marginh)
                .attr("y", box_marginv)
                .attr("height", boxheight(d))
                .attr("width", width)
                .style("fill", colors_google(versions.indexOf(d.Version)))
                .on('mouseover', function(d) {
                    d2 = d;
                    d['Ends on'] = toDate(d.y + d.y0).toDateString();
                    return tip.show(d2);
                })
                .on('mouseout', tip.hide);

            d3.select(this)
                .selectAll(".storylabel")
                .datum(d)
                .attr("x", d.x + box_marginh * 2 + 10 + 5)
                .attr("y", boxheight(d)/2 + box_marginv)
                .attr("opacity", boxheight(d) > 14 ? 1 : 0)
                .text(d.Key + ": " + d.Summary + " (" + (d['Story Points'] != null ? d['Story Points'] : 'unestimated') + ")");

            d3.select(this)
                .selectAll(".ganttboxes")
                .datum(d)
                .attr("x", function(d) {
                    return (box_marginh * 2 + 10 + width) + box_marginh + epic_order.indexOf(d.Epic + " (" + d.Version + ")") * epic_barwidth + 2
                })
                .attr("y", box_marginv)
                .attr("height", boxheight)
                .attr("width", epic_barwidth - box_marginh - 4);
            
            d3.select(this)
                .selectAll(".milestones")
                .datum(d)
                .attr("opacity", d.Summary.toLowerCase().startsWith('milestone:') ? 1 : 0)
                .attr("d", d3.svg.symbol().type("diamond"))
                .attr("transform", "translate(0, " + (boxheight(d)/2) + ")")
                .on('mouseover', function (d) {
                    tip.show({'Date': toDate(d.y + d.y0).toDateString()})
                })
                .on('mouseout', tip.hide);
        }

        layer.each(addRow)
        layer_base.each(updateRow)

        svg.selectAll(".axis").data([0]).enter().append("g")
            .attr("class", "axis axis--y")
            .call(yAxis);

        var epiclayers_base = svg.selectAll(".epiclayers")
            .data(epic_list, function(d) {return d.key});

        var epiclayers = epiclayers_base.enter()
            .append("g")
            .attr("class", "epiclayers");

        epicboxheight = function(d) {
            return d3.max([1, y(toDate(d.end)) - y(toDate(d.start)) - box_marginv * 2]);
        }

        epiclayers.append("rect")
            .attr("class", "epicboxes")
            .attr("x", function(d) {
                return (box_marginh * 2 + 10 + width) + box_marginh + d.idx * epic_barwidth;
            })
            .attr("y", function(d) {
                return y(toDate(d.start));
            })
            .attr("height", function(d) {
                return epicboxheight(d) + box_marginv * 2
            })
            .attr("width", epic_barwidth - box_marginh)
            .style("stroke", '#000')
            .style("fill", '#fff');

        epiclayers_base.select(".epicboxes").transition()
            .attr("x", function(d) {
                return (box_marginh * 2 + 10 + width) + box_marginh + d.idx * epic_barwidth;
            })
            .attr("y", function(d) {
                return y(toDate(d.start));
            })
            .attr("height", function(d) {
                return epicboxheight(d) + box_marginv * 2
            })

        epiclayers.append("text")
            .attr("class", "epictext")
            .text(function(d) {
                return d.key
            })
            .attr("transform", function(d) {
                return "translate(" + ((box_marginh * 2 + 10 + width) + box_marginh + d.idx * epic_barwidth + 6) + "," + (y(toDate(d.start)) + 10) + ")rotate(90)"
            });

        epiclayers_base.select(".epictext").transition()
            .text(function(d) {
                return d.key
            })
            .attr("transform", function(d) {
                return "translate(" + ((box_marginh * 2 + 10 + width) + box_marginh + d.idx * epic_barwidth + 6) + "," + (y(toDate(d.start)) + 10) + ")rotate(90)"
            });

        var legendlayers = svg.selectAll(".legendlayers")
            .data(versions)
            .enter()
            .append("g")
            .attr("class", "legendlayers");

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
