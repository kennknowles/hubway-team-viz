   
/* Colors found in sass/viz.scss but if there's a clever way to automate extraction */
var positive_color = '#36ac9c';
var negative_color = '#f9a72b';
var neutral_color = '#c7bb79';
// by hand darkend in the gimp '#c0c29d';

//With 25% opacity the mix is this: "#d1d3b1";//"#ac9faa"
var acc_y_ax_pad = 50;
var highlighted_color = '#ff0000';
var selected_color = '#fddf24';
var excessFactor = 0.1;
var plotNegativeDepartures = false;

var hourMap = ["12pm",  "1am",  "2am",  "3am",  "4am",  "5am", "6am",
	       "7am",  "8am",  "9am",  "10am", "11am",
	       "noon",  "1pm",  "2pm",  "3pm", "4pm",  "5pm",  "6pm",
	       "7pm",  "8pm",  "9pm",  "10pm",  "11pm",
	       "12pm",  "1am",  "2am",  "3am",  "4am"]

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
     * Precomputed fields
     */
    
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

    var precomputed_station_arrivals = {};
    var precomputed_station_departures = {};
    _(stations).each(function(station) { 
        precomputed_station_arrivals[station.id] = one_station_data(self.hourly_data, function(d) { return d.arrivals; }, station.id);
        precomputed_station_departures[station.id] = one_station_data(self.hourly_data, function(d) { return d.departures; }, station.id);
    });

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
        var hour = _(highlighted_hour).isNumber() ? highlighted_hour : selected_hour;
        console.log('Computing new accumulation data for hour', hour);

        if (_(hour).isNumber()) {
            return _.chain(hourly_data)
                .filter(function(d) { return d.hour == hour; })
                .sortBy(function(d) { return -d.accumulation; })
                .value();
        } else {
            // moderate hack: no hour selected: add them all up
            var result = _.chain(hourly_data)
		.filter(function(d) { return d.hour <24;}) // added filter since hacking hour wrap by repeating data with higher hour numbers
                .groupBy(function(d) { return d.station.id; })
                .map(function(ds, station_id) {
                    var template = _(ds).first();
                    template.accumulation = _(ds).reduce(function(accum, d) { return accum + d.accumulation; }, 0);
                    return template;
                })
                .sortBy(function(d) { return -d.accumulation; })
                .value();
            return result;
        }
    });
    

    // HELP I can't figure out why this data is switched
    // The code looked right, but I made it look wrong
    // so that the data would be right!! -- Zia
    self.one_station_arrivals = ko.computed(function() {
        //return precomputed_station_arrivals[self.station_chart_station()];
        return one_station_data(self.hourly_data, function(d) { return (plotNegativeDepartures?-d.departures:d.departures); }, self.station_chart_station());
    });
    // note representing departures as negative for line graph
    self.one_station_departures = ko.computed(function() {
        //return precomputed_station_departures[self.station_chart_station()];
        return one_station_data(self.hourly_data, function(d) { return d.arrivals; }, self.station_chart_station());
    });
}

/* The station accumulation bars */
function set_up_station_accumulations(view_model) {
    var width = $('#accumulation-chart').width() - acc_y_ax_pad;
    var height = $('#accumulation-chart').height();

    var svg = d3.select("#accumulation-chart").append("svg")
        .attr("width", width+acc_y_ax_pad)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(" + acc_y_ax_pad + ",0)");

    var width = $('#accumulation-chart').width() - acc_y_ax_pad;
    var height = $('#accumulation-chart').height();
    
    ko.computed(function() {
        var data = view_model.accumulation_data();

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
        
        var yAxis = d3.svg.axis()
	        .scale(y)
	        .ticks(5)
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
	        .attr("class", function(d) {
                return (d.accumulation > excessFactor * d.traffic) ? "bar positive" :
		            (-d.accumulation > excessFactor * d.traffic) ? "bar negative":
		            "bar neutral";
	        })
	        .attr("data-station", function(d) { return d.station_id; })
	        .attr("data-accum", function(d) { return d.accumulation; })
	        .attr("x", function(d, i) { return x(d.station_id); })
	        .attr("y", function(d) { return y(Math.max(0, d.accumulation)); })
	        .attr("width", x.rangeBand())
	        .attr("height", function(d) { return Math.abs( y(d.accumulation)-y(0));});
        
        svg.selectAll('g.axis').remove();
        svg.append("g")
	        .attr("class", "bary axis")// TODO: create a style for this
	      .call(yAxis)
    	    .append("text")
            .attr("y",-40)
	        .attr("x", -50)
            .attr("dy", ".71em")
            .style("text-anchor", "end")
	        .attr("transform", "rotate(-90)")
            .text("# of bikes");

        svg.append("g")
    	    .attr("class", "bary axis")// TODO: create a style for this
    	    .append("line")
    	    .attr("x1", 0)
    	    .attr("x2", width - 100) // hack not sure why it extends too far
    	    .attr("y1", y(0))
    	    .attr("y2", y(0));
        
        /* The station name*/
        accumulation_enter
          .append("g")
            .attr("transform", function(d) { return "translate(" + ( x(d.station_id) + x.rangeBand()*2/3 )+ ", " + y(0) + ")," + "rotate(270)" })
	      .append("text")
            .attr("class", function(d) { return d.accumulation < 0 ? "bar-label negative" : "bar-label positive"; })
            .attr("dx", function(d) { return d.accumulation < 0 ? "0.6em" : "-0.6em" })
	        .text(function(d) { return d.station.short_name });

        /* An invisible rectangle over everything to receive selection */
        var selected_station = view_model.selected_station();
        accumulation_enter.append("rect")
	        .attr("class", function(d) { return selected_station == d.station_id ? "activator selected" : "activator" })
	        .attr("data-station", function(d) { return d.station_id; })
	        .attr("data-accum", function(d) { return d.accumulation; })
	        .attr("x", function(d, i) { return x(d.station_id); })
	        .attr("y", 0)
	        .attr("width", x.rangeBand())
	        .attr("height", height);
    });

    function highlight_accum_station(station_id) {
        var highlighted_station = view_model.highlighted_accum_station();

        /* Only cause recomputation if needed,which it generally will be */
        if (highlighted_station != station_id) {
	        view_model.highlighted_accum_station( station_id );
        }
    }

    function unhighlight_accum_station(station_id) {
        var highlighted_station = view_model.highlighted_accum_station();

        /* If the station already changed, do not wipe it */
        if (highlighted_station == station_id) {
	        view_model.highlighted_accum_station( null );
        }
    }

    function mouse_handler(event) {
        var this_station = $(this).attr("data-station");

        if (event.type == "mouseover") {
            highlight_accum_station(this_station);
        } else if (event.type == "mouseout") {
            $.debounce(100, unhighlight_accum_station)(this_station);
        } else if (event.type == "click") {
            $('#accumulation-chart .activator.selected').attr("class", "activator");
            $(this).attr("class", "activator selected");
            view_model.selected_station( this_station );
        }
    }
    
    var throttled_mouse_handler = mouse_handler; //$.throttle(100, mouse_handler);
    
    /* In order to always catch events from dynamically generated content, the parent div is where we bind */
    $('#accumulation-chart').on("mouseover mouseout click", "rect", throttled_mouse_handler);
}

function set_up_map(view_model) {
    var circle_scale = 60;

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
        circle.on('mouseout', function() { 
            var highlighted_map_staiton = view_model.highlighted_map_station();

            /* Only clear the selection if another has not already been entered */
            if (highlighted_map_station == station.id) {
                view_model.highlighted_map_station(null); 
            }
        });
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
	var black = "#000000";
	var gray = "#5f5e5e";
	_(data).each(function(d) {

	    var fillColor =
		    (d.accumulation > excessFactor * d.traffic) ? positive_color :
		    (-d.accumulation > excessFactor * d.traffic) ?  negative_color:
		    neutral_color;
        var color =
		    (d.station.id == highlighted_station) ? gray:
		    (d.station.id == selected_station) ? black :
		    fillColor;
	    var weight = 
                (d.station.id == highlighted_station) ? 4 : 2;
	    var fillOpacity =
		(d.station.id == selected_station) ? 1.0: 0.5;
                

            circles[d.station.id].setRadius(circle_scale * Math.sqrt(Math.abs(d.arrivals + d.departures)));
            
            circles[d.station.id].setStyle({
                color: color, fillColor: fillColor,
                weight: weight, opacity: 1.0, fillOpacity: fillOpacity
            });
        });
    });
}

function set_up_hours(view_model) {

    function highlight_hour(hour) {
        var highlighted_hour = view_model.highlighted_hour();
       
        if (highlighted_hour != hour) {
            view_model.highlighted_hour(hour);
        }
    }

    function unhighlight_hour(hour) {
        var highlighted_hour = view_model.highlighted_hour();
            
        /* Only unhighlight if another hour has not been chosen */
        if (highlighted_hour == hour) {
            view_model.highlighted_hour(null);
        }
    }

    function mouse_handler(event) {
        var this_hour = parseInt($(this).attr('data-hour'));

        if (event.type == "mouseover") {
            highlight_hour(this_hour);
        } else if (event.type == "mouseout") {
            $.debounce(100, unhighlight_hour)(this_hour); // Prevent jitters from immediate deselection
        } else if (event.type == "click") {
            view_model.selected_hour(this_hour);
            $('#hour-controls .selected').removeClass('selected');
            $(this).addClass('selected');
        }
    }
    
    var throttled_mouse_handler = mouse_handler; //$.throttle(50, mouse_handler);
    $('#hour-controls').on('mouseover mouseout click', '.hour', throttled_mouse_handler);

    $('#hour-deselect').click(function() {
        view_model.selected_hour(null);
        $('#hours .selected').removeClass('selected');
    })
}

function set_up_station_chart() {
    // Begin Graphical Elements for Station Chart
    // sc for station_chart
    // Margin convention from here: http://bl.ocks.org/3019563
    var width = $('#station-chart').width();    // TODO how to make width '100%' again dynamically?, use width of parent?
    var height = $('#station-chart').height();
    var margin_bottom = 30; // This has to be within the SVG, to make room for x axis labels, but nothing else does

    var chart_svg = d3.select('#station-chart').append('svg')
        //.attr('style', 'border: 1px solid red') // For debugging
        .attr('width', width)
        .attr('height', height);
    
    chart_svg.append("path")
        .attr("class", "line arrivals")
    
    chart_svg.append("path")
        .attr("class", "line departures")

    chart_svg.append("path")
        .attr("class", "area arrivals")
    
    chart_svg.append("path")
        .attr("class", "area departures")


    return chart_svg;
}
    
function bind_station_chart_data(chart_svg, one_station_departures, one_station_arrivals, capacity) {
    var width = $('#station-chart').width();    // TODO how to make width '100%' again dynamically?, use width of parent?
    var height = $('#station-chart').height();
    var margin_bottom = 30; // This has to be within the SVG, to make room for x axis labels, but nothing else does

    var negValues = (_.min(one_station_departures) < 0);
    if (negValues){	
	var one_station_max =	
	Math.max( Math.abs(_.min(one_station_departures)),
		  _.max(one_station_arrivals))
    }else{
	var one_station_max = Math.max(
	
	Math.max(_.max(one_station_departures)),
	    _.max(one_station_arrivals))
    }
    //one_station_max = Math.max(capacity+1, one_station_max);
     //console.log("max = " +_.min(one_station_departures) + " " +_.max(one_station_arrivals))

    var x_scale = d3.scale.ordinal()
        .domain(_.range(-1,30))
        .rangeRoundBands([0, width]);
    
    var y_scale = d3.scale.linear() 
        .domain([(negValues? -one_station_max: 0), one_station_max])
        .range([height-margin_bottom, 5]);

    var interp = "monotone";
    var line = d3.svg.line()
        .x(function(d, i) { return x_scale(i); })
        .y(function(d) { return y_scale(d); })
	.interpolate(interp); // curve the lines a little bit

    var area = d3.svg.area()
	.interpolate(interp) // curve the lines a little bit
	.x(function(d, i) { return x_scale(i); })
        .y1(function(d) { return y_scale(d); })
	.y0(function(d) { return y_scale(0);})
    
    // TODO: a smooth transition
    chart_svg.selectAll("path.line.arrivals")
        .datum(one_station_arrivals)
        .attr("d", line);
    
    chart_svg.selectAll("path.line.departures")
        .datum(one_station_departures)
        .attr("d", line);
    
    chart_svg.selectAll("path.area.departures")
        .datum(one_station_departures)
        .attr("d", area);
    chart_svg.selectAll("path.area.arrivals")
        .datum(one_station_arrivals)
        .attr("d", area);
    
    sc_x_axis = d3.svg.axis()
	.scale(x_scale)
	.orient("bottom")
//	.tickValues([0,4,8,12,16, 20]); 
	//.tickValues([2,6,10,14,18,22]);
	.tickValues([0, 4, 8, 12, 16, 20, 24, 28])
	.tickSubdivide(4);
    sc_y_axis = d3.svg.axis()
	    .scale(y_scale)
	    .orient("right")
	    .ticks(5);

    // // Add horizontal line for 9/30 station capacity
    // chart_svg.append("g")
    // 	.attr("class", "path.line.arrivals")
    // 	.append("line")
    // 	.attr("x1", x_scale(0))
    // 	.attr("x2", x_scale(24))
    // 	.attr("y1", y_scale(capacity))
    // 	.attr("y2", y_scale(capacity));

    // TODO: mutate axis if it is too ugly
    chart_svg.selectAll('g.axis').remove();

    chart_svg.append("g")
	    .attr("class", "axis")
	.attr("transform","translate(0, " + y_scale(0) + ")")
 	//    .attr("transform", "translate(0,"+ (height - margin_bottom) + ")")
	    .call(sc_x_axis);

    chart_svg.selectAll(".axis text")
	.text(function(d){
	    return hourMap[parseInt(d)];
	});
   
    chart_svg.append("g")
	.attr("class", "y axis")
	.call(sc_y_axis)
	.append("text")
	.attr("transform", "rotate(-90)")
        .attr("y", 30) // Does this make sense?
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text("Arriving and Departing Bikes per Day");
}

function sum24HrsData(trips){
    return _(trips)
	.filter(function(d, i){
	    return (i<24 ? d :0); // prevent summing up extra hours
	})
	.reduce(function(memo, num){ return memo + num;});
}
function formatStats(cap, arrivals, departures, selectedHour){

    // note arrivals and departures now have more than 24 elements
    // WATCHOUT: The arrivals and departures reversal strikes again??!
    var dSum = Math.round(sum24HrsData(arrivals));
    var aSum = Math.round(sum24HrsData(departures));
    // for selected hour:
    var sd = arrivals[selectedHour];
    var sa = departures[selectedHour];
    
    return 'Capacity: '+ cap +
	' Total Trips: ' + (aSum + dSum) +
	' dep: '+dSum +
	' arr: ' + aSum +
	' delta: ' + (aSum-dSum) +
	(selectedHour ?
	 ' at ' + hourMap[selectedHour] +
	' : ' + (sa + sd) +
	' dep: '+sd +
	' arr: ' + sa +
	 ' delta: ' + (sa+sd)    :'');

}
$(document).ready(function() {

    /* Massage the initial data to make life a little easier */
    stations = _(stations).filter(function(station) { return !station.temporary });
    
    var stations_by_id = {};
    _(stations).each(function(station) { stations_by_id[station.id] = station; });
    _(hourly_data).each(function(d) { 
        d.traffic = d.arrivals + d.departures; // vs d.accumulation which is d.arrivals - d.departures
        d.station = stations_by_id[d.station_id]; 
    });

    var station_capacity_by_id = {};
    _(station_capacity).each(function(cap){
        station_capacity_by_id[cap.station_id] = cap.capacity;
    });

    /* Set up View Model */
    var view_model = new ViewModel(stations, hourly_data);
    
    /* Set up UI components */
    set_up_station_accumulations(view_model);
    set_up_hours(view_model);
    set_up_map(view_model);

    /* Set up the station line chart header */
    ko.computed(function() {
        var station_id = view_model.station_chart_station();

        if (station_id) {
            $('#station-chart-panel header').text(stations_by_id[station_id].short_name);
            $('img#station-deselect').attr('style', 'display: normal');
        } else {
            $('#station-chart-panel header').text('Select a station to see hour-by-hour activity.');
            $('img#station-deselect').attr('style', 'display: none');
        }
    });

    $('#station-deselect').click(function() {
        view_model.selected_station(null);
        $('#accumulation-chart .activator.selected').attr("class", "activator")
        return false;
    });
    
    /* Set up the station chart and subscribe to data changes */
    var station_chart_svg = null; // This will start blank and be added when data is ready

    // TODO: this can go right into the set up
    ko.computed(function() { 
        var arrivals = view_model.one_station_arrivals();
        var departures = view_model.one_station_departures();
	var capacity = station_capacity_by_id[
	    view_model.station_chart_station()];
	var hour = view_model.selected_hour();
	
        if (arrivals && departures) {
            if (!station_chart_svg) {
                station_chart_svg = set_up_station_chart();
            }
            bind_station_chart_data(station_chart_svg, arrivals, departures, capacity);

	    $('#line-stats').text(
		formatStats(capacity, arrivals, departures, hour));

            $('#station-chart').attr('style', 'opacity: 1.0');
        } else {
            $('#station-chart').attr('style', 'opacity: 0.0');
            // TODO: hide a static div with the intro text and show the line chart via css

            // TO NOT DO:
            //$('#line-chart').text('You are seeing typical weekday activity showing the total number of bikes checked in and out of Hubway stations [above] and total station activity [right]');
        }
    });

    
    /* Now that everything is ready, load from querystring */
    //view_model.selected_station($.url().param('station'));
    view_model.selected_station(38); // force selection of North Station @ start
    view_model.selected_hour($.url().param('hour') ? parseInt($.url().param('hour')) : null);
});
