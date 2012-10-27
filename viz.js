$(document).ready(function() {

    stations = _(stations).filter(function(station) { return !station.temporary });

    // Center coords, and zoomlevel 13
    var map = L.map('map');
    map.on('moveend', function(e) {
        console.log(map.getCenter());
    });

    var layer = new L.MAPCTileLayer("basemap");
    map.addLayer(layer);
    
    var stations_by_id = {};
    _(stations).each(function(station) {
        station.flow = { in: 0, out: 0 };
        stations_by_id[station.id] = station;
    });

    var min_lat = _.chain(stations).map(function(s) { return s.lat }).min().value();
    var max_lat = _.chain(stations).map(function(s) { return s.lat }).max().value();
    var min_lng = _.chain(stations).map(function(s) { return s.lng }).min().value();
    var max_lng = _.chain(stations).map(function(s) { return s.lng }).max().value();

    map.fitBounds(L.latLngBounds([min_lat, min_lng], [max_lat, max_lng]));

    var fake_data = _.chain(stations)
        .map(function(station) {
            return _(_.range(0, 23)).map(function(hour) {
                return {
                    lat: station.lat,
                    lng: station.lng,
                    station: station,
                    station_id: station.id,
                    station_name: station.name,
                    hour: hour,
                    arrivals: Math.floor(100 * Math.random()),
                    departures: Math.floor(100 * Math.random()),
                }
            });
        })
        .flatten()
        .value();

    var current_hour_data = _.chain(fake_data)
        .filter(function(item) { return item.hour == 0; })
        .map(function(d) { 
            d.accumulation = d.arrivals - d.departures;
            return d;
        })
        .sortBy(function(d) { return d.accumulation; })
        .value();

    var fake_one_station_data = _.range(0, 23).map(function(d) {
        return Math.min(d, Math.abs(11 - d), Math.abs(23 - d));
    });

    var circle_scale = 0.5;

    _(current_hour_data).each(function(d) {
        d.circle = L.circle([d.lat, d.lng], 
                            100, //circle_scale * Math.sqrt(Math.abs(d.arrivals - d.departures)),
                            {color: '#ff0000', weight: 2, opacity: 1.0, fillOpacity: 0.5})
            .addTo(map)
            .bindPopup(d.station_name);
    });

var width = $('#aggregates').width() 
    height = 200; //$('#aggregate').height() 

var x0 = 100; //Math.max(-d3.min(_(fake_data).map(function(data) { } )), d3.max(data));

var y = d3.scale.linear()
    .domain([-x0, x0])
    .range([0, height])
    .nice();

var x = d3.scale.ordinal()
    .domain(_(current_hour_data).map(function(d) { return d.station_id; }))
    .rangeRoundBands([0, width], .2);

var yAxis = d3.svg.axis()
    .scale(y)
    .orient("top");

var svg = d3.select("#aggregates").append("svg")
    .attr("width", width)
    .attr("height", height)

svg.selectAll(".bar")
    .data(current_hour_data)
  .enter().append("rect")
    .attr("class", function(d) { return d.accumulation > 0 ? "bar negative" : "bar positive"; })
    .attr("data-station", function(d) { return d.station_id; })
    .attr("data-accum", function(d) { return d.accumulation; })
    .attr("x", function(d, i) { return x(d.station_id); })
    .attr("y", function(d) { return y(Math.min(0, d.accumulation)) })
    .attr("width", x.rangeBand())
    .attr("height", function(d) { return Math.abs(y(d.accumulation) - y(0)); });

svg.selectAll("text")
    .data(current_hour_data)
  .enter()
    //.append("g").attr("transform", function(d) { return "rotate(270, " + x(d.station_id) + "," + -y(Math.min(0, (d.arrivals - d.departures))) + ")" })
  .append("text")
    .attr("class", "label")
    .text(function(d) { return d.station_name })
    .attr("x", function(d, i) { return x(d.station_id); })
    .attr("y", function(d, i) { return -y(Math.min(0, (d.arrivals - d.departures))); })
    .attr("width", x.rangeBand())
    .attr("height", 100)

    
var chart_svg = d3.select('#station-chart').append('svg').attr('width', '100%').attr('height', 600);

chart_svg.selectAll();

    var x = d3.scale.ordinal()
        .domain(_.range(0, 23))
        .rangeRoundBands([0, 250]);

    var y = d3.scale.linear() 
        .domain([0, 50])
        .range([500, 100]);

    var line = d3.svg.line()
        .x(function(d, i) { return x(i); })
        .y(function(d) { return y(d); });

    console.log(line);

    chart_svg.append("path")
        .datum(fake_one_station_data)
        .attr("class", "line")
        .attr("d", line);
});
