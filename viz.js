   
/* Colors found in sass/viz.scss but if there's a clever way to automate extraction */
var positive_color = '#36ac9c';
var negative_color = '#f9a72b';
var highlighted_color = '#fddf24';
var selected_color = '#fddf24';

/* Abstract representation of the state of the UI (a la Model-View-ViewModel) */
function ViewModel(stations, hourly_data) {
    var self = this;

    /* Static data, attaching to this object */
    self.stations = stations;
    self.hourly_data = hourly_data;

    /* Key view state */
    self.selected_station = ko.observable();
    self.selected_hour = ko.observable();

    self.highlighted_hour = ko.observable();
    self.highlighted_map_station = ko.observable();
    self.highlighted_accum_station = ko.observable();

    /* 
     * Derived fields 
     */

    /* Just one or the other of the highlighted stations from different UI controls */
    self.highlighted_station = ko.computed(function() {
        var map_station = self.highlighted_map_station();
        var accum_station = self.highlighted_accum_station();
        return map_station || accum_station;
    });

    /* And now the highlighted station or the selected station for appearance in the chart */
    self.station_chart_station = ko.computed(function() {
        var highlighted_station = self.highlighted_station();
        var selected_station = self.selected_station();
        return highlighted_station || selected_station;
    });

    /* Accumulation computed from the highlighted/selected hour, otherwise overall. */
    self.accumulation_data = ko.computed(function() {
        var selected_hour = self.selected_hour();
        var highlighted_hour = self.highlighted_hour();
        var hour = _(selected_hour).isNumber() ? selected_hour : highlighted_hour;
        console.log('Computing new accumulation data for hour', hour);

        if (_(hour).isNumber()) {
            return _.chain(hourly_data)
                .filter(function(d) { return d.hour == hour; })
                .sortBy(function(d) { return d.accumulation; })
                .value();
        } else {
            // moderate hack: no hour selected: add them all up
            var result = _.chain(hourly_data)
                .groupBy(function(d) { return d.station.id; })
                .map(function(ds, station_id) {
                    var template = _(ds).first();
                    template.accumulation = _(ds).reduce(function(accum, d) { return accum + d.accumulation; }, 0);
                    return template;
                })
                .sortBy(function(d) { return d.accumulation; })
                .value();
            return result;
        }
    });
    
    /* Extracts either the arrival or departure data for a particular station id */
    function one_station_data(hourly_data, accessor, station_id) {
        if (!station_id) {
            return null
        } else {
            return _.chain(hourly_data)
                .filter(function(d) { return d.station_id == station_id;})
                .sortBy(function(d) { return d.hour })
                .map(accessor) // Either d.arrivals or d.departures, basically
                .value();
        }
    }

    self.one_station_arrivals = ko.computed(function() {
        return one_station_data(self.hourly_data, function(d) { return d.arrivals; }, self.station_chart_station());
    });
    
    self.one_station_departures = ko.computed(function() {
        return one_station_data(self.hourly_data, function(d) { return d.departures; }, self.station_chart_station());
    });
}


var acc_y_ax_pad = 50

/* The station accumulation bars */
function set_up_station_accumulations() {
    var width = $('#aggregates').width() - acc_y_ax_pad;
    var height = $('#aggregates').height();

    var svg = d3.select("#aggregates").append("svg")
	  .attr("width", width+acc_y_ax_pad)
	.attr("height", height)
	.append("g")
	.attr("transform", "translate(" + acc_y_ax_pad + ",0)");

    return svg;
}

// TODO: merge with set_up_station_accumulations and pass only the view_model, no svg or data
function bind_station_accumulation_data(svg, data, view_model) {
    var width = $('#aggregates').width() - acc_y_ax_pad;
    var height = $('#aggregates').height();
    
    var min_acc = _.min(_(data).map(function(d) { return d.accumulation;} ))
    var max_acc = _.max(_(data).map(function(d) { return d.accumulation;} ))
    var y_max = Math.max(-min_acc, max_acc);

    // Y scale keep 0 at exactly the midpoint of the SVG canvas
    var y = d3.scale.linear()
	    .domain([-y_max, y_max])
	    .range([height, 0])
	    .nice();

    // X scale allocates fixed-size rectangles for stations in order. 
    // FIXME: I think it should be by index, not station id, since it stays sorted. We'll see when things get dynamic
    var x = d3.scale.ordinal()
	    .domain(_(data).map(function(d) { return d.station_id; }))
	    .rangeRoundBands([0, width]);

    // FIXME: I don't see this appearing
    var yAxis = d3.svg.axis()
	    .scale(y)
	    .orient("left");

    // Actually bind the data
    svg.selectAll(".station-accumulation").remove();
    var svg_data = svg.selectAll(".station-accumulation")
        .data(data) 

    svg_data.exit().remove();

    var accumulation_enter = svg_data.enter() 
        .append("g").attr("class", "station-accumulation");
    
    /* The visible bar */
    accumulation_enter.append("rect")
	    .attr("class", function(d) { return d.accumulation < 0 ? "bar negative" : "bar positive"; })
	    .attr("data-station", function(d) { return d.station_id; })
	    .attr("data-accum", function(d) { return d.accumulation; })
	    .attr("x", function(d, i) { return x(d.station_id); })
	.attr("y", function(d) { return y(Math.max(0, d.accumulation)); })
	    .attr("width", x.rangeBand())
	.attr("height", function(d) { return Math.abs( y(d.accumulation)-y(0));});

    svg.selectAll('g.axis').
	remove();
    svg.append("g")
	.attr("class", "bar axis")// TODO: create a style for this
	.attr("transform", "rotate(0)")
    	.attr("transform", "translate(0,0)")
	.call(yAxis)
    	.append("text")
	.attr("transform", "rotate(-90)")
        .attr("y", -40)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text("# of bikes");


    /* The station name*/
    accumulation_enter.append("g").attr("transform", function(d) { return "translate(" + ( x(d.station_id) + x.rangeBand()*2/3 )+ ", " + y(0) + ")," + "rotate(270)" })
	    .append("text")
          .attr("class", function(d) { return d.accumulation < 0 ? "bar-label negative" : "bar-label positive"; })
          .attr("dx", function(d) { return d.accumulation < 0 ? "0.6em" : "-0.6em" })
	      .text(function(d) { return d.station.short_name });

    /* An invisible rectangle over everything to receive selection */
    accumulation_enter.append("rect")
	    .attr("class", "activator")
	    .attr("data-station", function(d) { return d.station_id; })
	    .attr("data-accum", function(d) { return d.accumulation; })
	    .attr("x", function(d, i) { return x(d.station_id); })
	    .attr("y", 0)
	    .attr("width", x.rangeBand())
	    .attr("height", height);

    /* In order to always catch events from dynamically generated content, the parent div is where we bind */
    $('#aggregates').on("mouseover mouseout click", "rect", function(event) {
        if (event.type == "mouseover") {
            $(this).attr("class", "activator active");
	        view_model.highlighted_accum_station( $(this).attr("data-station") );
        } else if (event.type == "mouseout") {
	        view_model.highlighted_accum_station( null );
            $(this).attr("class", "activator");
        } else if (event.type == "click") {
            var selected_station = view_model.selected_station();
            var this_station = $(this).attr('data-station');
            
            if ( this_station == selected_station ) {
                view_model.selected_station( null );
            } else {
                view_model.selected_station( $(this).attr("data-station") );
            }
        }
    });
}

function accumulation_data_for_hour(hour) {
    if (_(hour).isNumber()) {
        return _.chain(hourly_data)
            .filter(function(d) { return d.hour == hour; })
            .sortBy(function(d) { return d.accumulation; })
            .value();
    } else {
        // moderate hack: no hour selected: add them all up
        var result = _.chain(hourly_data)
            .groupBy(function(d) { return d.station.id; })
            .map(function(ds, station_id) {
                var template = _(ds).first();
                template.accumulation = _(ds).reduce(function(accum, d) { return accum + d.accumulation; }, 0);
                return template;
            })
            .sortBy(function(d) { return d.accumulation; })
            .value();
        return result;
    }
}

function set_up_map(view_model) {
    var circle_scale = 45;

    // Center coords, and zoomlevel 13
    var map = L.map('map', {
        scrollWheelZoom: false
    });

    var layer = new L.MAPCTileLayer("basemap");
    map.addLayer(layer);
    
    var min_lat = _.chain(stations).map(function(s) { return s.lat }).min().value();
    var max_lat = _.chain(stations).map(function(s) { return s.lat }).max().value();
    var min_lng = _.chain(stations).map(function(s) { return s.lng }).min().value();
    var max_lng = _.chain(stations).map(function(s) { return s.lng }).max().value();

    // Currently this zooms out too far: map.fitBounds(L.latLngBounds([min_lat, min_lng], [max_lat, max_lng]));
    map.setView([42.355, -71.095], 13);

    /* Initialize circles - mouseover to highlight the station, click to select it */
    var circles = {};
    _(view_model.stations).each(function(station) {
        var circle = L.circle([station.lat, station.lng], 0).addTo(map);

        circle.on('mouseover', function() { view_model.highlighted_map_station(station.id); });
        circle.on('mouseout', function() { view_model.highlighted_map_station(null); });
        circle.on('click', function() { 
            var selected_station = view_model.selected_station();
            if (station.id == selected_station) {
                view_model.selected_station(null);
            } else {
                view_model.selected_station(station.id); 
            }
        });

        circles[station.id] = circle;
    });

    /* Make circles always reflect the current data */
    ko.computed(function() {
        var highlighted_station = view_model.highlighted_station();
        var selected_station = view_model.selected_station();
        var data = view_model.accumulation_data();

        _(data).each(function(d) {
            var color = 
                (d.station.id == highlighted_station) ? highlighted_color : 
                (d.station.id == selected_station) ? selected_color :
                (d.arrivals > d.departures) ? positive_color : negative_color;

            circles[d.station.id].setRadius(circle_scale * Math.sqrt(Math.abs(d.arrivals + d.departures)));

            circles[d.station.id].setStyle({
                color: color,
			    weight: 2, opacity: 1.0, fillOpacity: 0.5
            });
        });
    });
}

function set_up_station_chart() {
    // Begin Graphical Elements for Station Chart
    // sc for station_chart
    // Margin convention from here: http://bl.ocks.org/3019563
    var width = $('#line-chart').width();    // TODO how to make width '100%' again dynamically?, use width of parent?
    var height = $('#line-chart').height();
    var margin_bottom = 30; // This has to be within the SVG, to make room for x axis labels, but nothing else does

    var chart_svg = d3.select('#line-chart').append('svg')
        //.attr('style', 'border: 1px solid red') // For debugging
        .attr('width', width)
        .attr('height', height);
    
    chart_svg.append("path")
        .attr("class", "line arrivals")
    
    chart_svg.append("path")
        .attr("class", "line departures")
    

    return chart_svg;
}
    
function bind_station_chart_data(chart_svg, one_station_departures, one_station_arrivals) {
    var width = $('#line-chart').width();    // TODO how to make width '100%' again dynamically?, use width of parent?
    var height = $('#line-chart').height();
    var margin_bottom = 30; // This has to be within the SVG, to make room for x axis labels, but nothing else does

    var one_station_max = Math.max(_.max(one_station_departures),
				                   _.max(one_station_arrivals))
    
    var x_scale = d3.scale.ordinal()
        .domain(_.range(24))
        .rangeRoundBands([0, width]);
    
    var y_scale = d3.scale.linear() 
        .domain([0, one_station_max])
        .range([height-margin_bottom, 0]);
    
    var line = d3.svg.line()
        .x(function(d, i) { return x_scale(i); })
        .y(function(d) { return y_scale(d); });

    // TODO: a smooth transition
    chart_svg.selectAll("path.line.arrivals")
        .datum(one_station_arrivals)
        .attr("d", line);
    
    chart_svg.selectAll("path.line.departures")
        .datum(one_station_departures)
        .attr("d", line);
    
    sc_x_axis = d3.svg.axis()
	    .scale(x_scale)
	    .orient("bottom")
      	    .tickValues([0,4,8,12,16, 20]); // TODO, should wrap data so that you can see continuity over midnight - 2am?
    
    sc_y_axis = d3.svg.axis()
	    .scale(y_scale)
	    .orient("right")
	    .ticks(5);

    // TODO: mutate axis if it is too ugly
    chart_svg.selectAll('g.axis').remove();

    chart_svg.append("g")
	    .attr("class", "axis")
	    .attr("transform", "translate(0,"+ (height - margin_bottom) + ")")
	    .call(sc_x_axis);
    
    chart_svg.append("g")
	    .attr("class", "y axis")
	    .call(sc_y_axis)
	    .append("text")
	    .attr("transform", "rotate(-90)")
        .attr("y", 30) // Does this make sense?
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text("Average Weekday Trips");
}

$(document).ready(function() {

    /* Page View State Variables */
    current_station_id = ko.observable();
    current_hour_selected = ko.observable();

    /* Massage the initial data to make life a little easier */
    stations = _(stations).filter(function(station) { return !station.temporary });
    
    var stations_by_id = {};
    _(stations).each(function(station) {
        //station.flow = { in: 0, out: 0 };
        stations_by_id[station.id] = station;
    });

    _(hourly_data).each(function(d) {
        d.station = stations_by_id[d.station_id];
    });

    /* Set up View Model */
    var view_model = new ViewModel(stations, hourly_data);
    ko.computed(function() { 
        console.log('Current ViewModel:', ko.toJSON(_(view_model).pick("selected_station",
                                                                       "selected_hour",
                                                                       "highlighted_station")));
    });

    $('#hours').on('mouseover mouseout click', '.hour', function(event) {
        console.log('event on hour');
    });

    /* Set up the station accumulation chart and subscribe to data changes */
    var accumulations_svg = set_up_station_accumulations();
    ko.computed(function() { 
        bind_station_accumulation_data(accumulations_svg, view_model.accumulation_data(), view_model); 
    });
    
    /* Set up the Map and subscribe to data changes */
    var map = set_up_map(view_model);

    /* Set up the station line chart header */
    ko.computed(function() {
        var station_id = view_model.station_chart_station();
        if (station_id) {
            $('#title-hourly').text('Hourly Traffic for '+ stations_by_id[station_id].short_name);
            $('img#station-deselect').attr('style', 'display: normal');
        } else {
            $('#title-hourly').text('Click around to explore hour-by-hour activity.');
            $('img#station-deselect').attr('style', 'display: none');
        }
    });

    $('#station-deselect-href').click(function() {
        view_model.selected_station(null);
        return false;
    });
    
    /* Set up the station chart and subscribe to data changes */
    var station_chart_svg = null; // This will start blank and be added when data is ready

    // TODO: this can go right into the set up
    ko.computed(function() { 
        var arrivals = view_model.one_station_arrivals();
        var departures = view_model.one_station_departures();

        if (arrivals && departures) {
            if (!station_chart_svg) {
                station_chart_svg = set_up_station_chart();
            }
            bind_station_chart_data(station_chart_svg, arrivals, departures);
            $('#line-chart').attr('style', 'opacity: 1.0');
        } else {
            $('#line-chart').attr('style', 'opacity: 0.0');
            // TODO: hide a static div with the intro text and show the line chart via css

            // TO NOT DO:
            //$('#line-chart').text('You are seeing typical weekday activity showing the total number of bikes checked in and out of Hubway stations [above] and total station activity [right]');
        }
    });

    /* Now that everything is ready, load from querystring */
    view_model.selected_station($.url().param('station'));
    view_model.selected_hour($.url().param('hour'));
});
