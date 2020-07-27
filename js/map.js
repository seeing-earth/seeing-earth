// #################################################
// ## To-Do:                                      ##
// ##   + node clicks activate all nodes          ##
// ##   + node hovers activate all edges          ##
// ##   + optimize geojson -> 6-decimal precision ##
// ##   + switch from tilelayer source to geojson ##
// #################################################

mapboxgl.accessToken = 'pk.eyJ1IjoiYmdvYmxpcnNjaCIsImEiOiJjaXpuazEyZWowMzlkMzJvN3M3cThzN2ZkIn0.B0gMS_CvyKc_NHGmWejVqw';
var map = new mapboxgl.Map({
  container: 'map', // Container ID
  style: 'mapbox://styles/mapbox/streets-v11', // Map style to use
  zoom: 1.9, // Starting zoom level
});

// Geocoder object
var geocoder = new MapboxGeocoder({ // Initialize the geocoder
  accessToken: mapboxgl.accessToken, // Set the access token
  placeholder: 'Search anywhere',
  mapboxgl: mapboxgl, // Set the mapbox-gl instance
  marker: false, // Do not use the default marker style
});

// Add the geocoder to the map
map.addControl(geocoder, 'top-left');

var priorityAreaLayer = {
  "id": "priorityAreaLayer",
  "type": "fill",
  "source": "priorityAreaSource",
  "paint": {
    "fill-color": "green",
    "fill-opacity": [
      "case",
      ["boolean", ["feature-state", "active"], false],
      0.8,
      0.5
    ]
  }
};

// Due to a technical limitation of WebGL, outlines cannot be rendered with a
// width > 1, so a seperate outline layer is needed
var priorityAreaOutlines = {
  "id": "priorityAreaOutlines",
  "type": "line",
  "source": "priorityAreaSource",
  "paint": {
    "line-color": ["get", "CO2_trend"],
    "line-width": ["get", "stroke-width"],
    "line-opacity": ["get", "stroke-opacity"]
  }
}

// The lines layer; starts hidden
//    ###############################################################
//    ## Currently visibility is controlled with layout.visibility ##
//    ## This functionality should be done with filters instead    ##
//    ## once we have more data                                    ##
//    ###############################################################
var causeVectorLayer = {
  "id": "causeVectorLayer",
  "type": "line",
  "source": "causeVectorSource",
  "layout": {
    "visibility": "none"
  },
  "paint": {
    "line-color": "red",
    "line-width": ["*", 20, ["get", "weight"]]
  }
};

// for tracking the current hovered/selected edges and nodes
var hoveredNodeId = null;
var hoveredEdgeId = null;
var activeNodeId = null;
var activeEdgeId = null;

map.on('load', function() {
  // Source mapbox tile layers
  loadGeojsonSources();
  // map.addSource("nodes", {
  //   type: "vector",
  //   url: "mapbox://bgoblirsch.ckd2nk5qo1qdx26mh5dkjsvu9-2xtiv"
  // });
  // map.addSource("edges", {
  //   type: "vector",
  //   url: "mapbox://bgoblirsch.ckd2nkhxu1mbu2dmheqdzke6e-0rgxk"
  // })

  // Create the layer objects
  map.addLayer(priorityAreaLayer);
  map.addLayer(priorityAreaOutlines);
  map.addLayer(causeVectorLayer);

  // Create Mapbox popup object
  var popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  // nodes.features.forEach(function(node) {
  //   console.log(node);
  // });

  // On Priority Area hover: darken Priority Area and show its children Cause Vectors
  map.on("mousemove", "priorityAreaLayer", function(e) {
    console.log(e.features[0])
    // Change cursor to "select"
    map.getCanvas().style.cursor = "pointer";

    if (e.features.length > 0) {
      // if something is already hovered: make it not active and hide its children
      if (hoveredNodeId) {
        map.setFeatureState({
            source: "priorityAreaSource",
            id: hoveredNodeId
          },
          { active: false }
        );
        // hide edges
        map.setLayoutProperty("causeVectorLayer", "visibility", "none")
      }

      // mapbox's unique feature Id, not our custom property
      hoveredNodeId = e.features[0].id;

      // set node to active (darken)
      map.setFeatureState({
          source: "priorityAreaSource",
          id: hoveredNodeId
        },
        { active: true }
      );

      // show edges - filter will work better for managing which edges to show
      map.setLayoutProperty("causeVectorLayer", "visibility", "visible")

      // if a node is not active: populate popup box
      if (activeNodeId == null) {
        var coordinates = e.lngLat;
        var name = e.features[0].properties.name;
        var description = e.features[0].properties.headline;

        // This helps prevent the popup box from overflowing outside the viewport
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        popup
          .setLngLat(coordinates)
          .setHTML(`<h2>${name}</h2><p>${description}</p>`)
          .addTo(map);
      }
    }
  });

  // remove "hover" styling
  map.on("mouseleave", "priorityAreaLayer", function() {
    console.log("mouse leave PA")
    // reset cursor
    map.getCanvas().style.cursor = '';
    popup.remove();
    if (hoveredNodeId >= 0 && !activeNodeId) {
      console.log("ckpt1")
      map.setFeatureState({
          source: "priorityAreaSource",
          id: hoveredNodeId
        },
        { active: false }
      );
      map.setLayoutProperty("causeVectorLayer", "visibility", "none");
    }
    hoveredNodeId = null;
  });

  // On Cause Vector hover: display its info
  // #### To-do: show its Cause Vector Children ####
  map.on("mouseenter", "causeVectorLayer", function(e) {
    map.getCanvas().style.cursor = 'pointer';
    var coordinates = e.lngLat;
    var name = e.features[0].properties.name;
    var description = e.features[0].properties.headline;
    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }
    popup
      .setLngLat(coordinates)
      .setHTML(`<h3>${name}</h3><p>${description}</p>`)
      .addTo(map);
  })

  // remove Cause Vector hover styling
  map.on("mouseleave", "causeVectorLayer", function() {
    // reset cursor
    map.getCanvas().style.cursor = '';
    popup.remove();
    hoveredEdgeId = null;
  });

  // On node click: set it to active (darken and keep its edges drawn) and zoom
  // to its edges' bbox
  map.on("click", "priorityAreaLayer", function(e) {
    if (e.features.length > 0) {
      if (activeNodeId == e.features[0].id) {
        map.setFeatureState({
          source: "priorityAreaSource",
          id: activeNodeId
          },
          { active: false }
        );
        map.setLayoutProperty("causeVectorLayer", "visibility", "none");
        activeNodeId = null;
      } else {
        popup.remove();
        activeNodeId = e.features[0].id;
        zoomTo();
        map.setLayoutProperty("causeVectorLayer", "visibility", "visible");
        map.setFeatureState({
            source: "priorityAreaSource",
            id: hoveredNodeId
          },
          { active: true }
        );
      }
    }
  })

  // Listen for the `result` event from the Geocoder
  // `result` event is triggered when a user makes a selection
  //  Add a marker at the result's coordinates
  geocoder.on('result', function(e) {
    map.getSource('single-point').setData(e.result.geometry);

    var acc = document.getElementsByClassName("categoryPanel");
    var searchPrompts = document.getElementsByClassName("searchPrompt");
    var subCategories = document.getElementsByClassName("subCategories");
    var i;

    for (i = 0; i < acc.length; i++) {
      acc[i].classList.add('searched');
      searchPrompts[i].setAttribute('style', 'display: none;');
      subCategories[i].setAttribute('style', 'display: block;');
    }
  });
});

// Fit the bounds of a node and its edges
// #########################################################################
// ## Need to pass a Priority Area or Cause Vector as a parameter to this ##
// ## function and make it work for any node                              ##
// #########################################################################
function zoomTo() {
  let edge_extent = map.getSource("nodes").bounds;
  let node_extent = map.getSource("edges").bounds;
  let bounds = new mapboxgl.LngLatBounds();
  bounds.extend(edge_extent);
  bounds.extend(node_extent);
  map.fitBounds(bounds, { padding: 40 })
}

// Loading geojson locally in the js file for testing purposes only
function loadGeojsonSources() {
  let priorityAreas = {
    "type": "FeatureCollection",
    "name": "priorityAreas",
    "features": [
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 2.0, "stroke-opacity": 1.0, "fill": "#00cfeb", "fill-opacity": 0.5, "name": "Amazon Rainforest", "id": "amazonRainforest", "graph_type": "footprint", "headline": "The Amazon is one of the world's greatest carbon sinks and one of the world's most important homes of biodiversity.  In the late 20th Century, the Amazon would sequester about 2 billion tons of CO2 every year (almost half the USA's annual carbon footprint).  Due to deforestation, the Amazon now only sequesters approximately 1.1 billion tons of CO2 per year, and approximately 20% of the rainforest is actively emitting carbon.  The Amazon is currently 18% deforested, and research has indicated at 25% deforestation, it may reach a tipping point where the rainforest no longer becomes a carbon sink -- and starts becoming a savannah.  More than half of Amazon's deforestation is comes from the production of beef, soy, wood, and palm oil, which is driven by Brazil's current national policy and president Jair Bolsanaro, and likewise driven by consumption in countries like China, the United States, Indian, Germany, and Spain.  One potential strategy for improvement is eliminating the most destructive production taking place in the Amazon, and replacing it with sustainable logging practices, which can allow the rainforest to continue supporting local livelihoods while remaining an important resource of logging materials for the rest of the world. ", "entity": "natural", "CO2_impact": "-1,100,000,000", "CO2_trend": "red", "parentIDs": null, "products": null, "weight": null }, "geometry": { "type": "Polygon", "coordinates": [ [ [ -64.599609375, -15.28418511407642 ], [ -44.560546875, -2.635788574166607 ], [ -45.615234375, -1.933226826477111 ], [ -47.98828125, -0.439448816413964 ], [ -50.361328125, -0.703107352436478 ], [ -52.294921875, -1.669685500986571 ], [ -50.009765625, 1.142502403706165 ], [ -50.88867187499999, 2.81137119333114 ], [ -52.55859375, 5.00339434502215 ], [ -54.404296875, 6.140554782450308 ], [ -56.25, 5.528510525692801 ], [ -58.359375, 6.926426847059551 ], [ -60.1171875, 8.320212289522944 ], [ -61.69921875, 9.535748998133627 ], [ -63.6328125, 10.31491928581316 ], [ -67.763671875, 10.228437266155943 ], [ -71.630859375, 5.878332109674327 ], [ -79.189453125, -2.02106511876699 ], [ -78.662109375, -4.214943141390639 ], [ -73.828125, -13.068776734357694 ], [ -64.599609375, -15.28418511407642 ] ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 3.0, "stroke-opacity": 1.0, "fill": "#ff0000", "fill-opacity": 0.5, "name": "2020 United States Election", "id": "usElection2020", "graph_type": "footprint", "headline": "The 2020 US Election will influence environmental outcomes for the entire world.  Candidate Joe Biden has announced a $2 trillion Climate Infrastructure plan.  Conversely, the current administration has appointed fossil fuel lobbyists to high-level positions, and deliberately rolled back environmental protections.", "entity": "state", "CO2_impact": "7,000,000,000", "CO2_trend": "red", "parentIDs": null, "products": null, "weight": null }, "geometry": { "type": "Polygon", "coordinates": [ [ [ -124.453125, 49.03786794532644 ], [ -124.62890625, 48.253941144634311 ], [ -123.969726562499986, 46.103708755980257 ], [ -124.5849609375, 42.908160071960538 ], [ -124.1455078125, 41.96765920367816 ], [ -124.277343749999986, 40.513799155044133 ], [ -124.013671874999986, 40.145289295676598 ], [ -123.706054687500014, 39.061849134291542 ], [ -122.431640625, 37.544577320855822 ], [ -121.9921875, 36.633162095586577 ], [ -120.410156249999986, 34.524661471771722 ], [ -118.30078125, 34.016241889667015 ], [ -116.982421874999986, 32.583849325656622 ], [ -114.609375, 32.879587173066305 ], [ -114.785156249999986, 32.583849325656622 ], [ -111.1376953125, 31.466153715024294 ], [ -108.2373046875, 31.42866311735861 ], [ -108.061523437499986, 31.914867503276223 ], [ -106.4794921875, 31.765537409484374 ], [ -104.765625, 30.410781790845888 ], [ -104.6337890625, 29.764377375163129 ], [ -103.095703125, 29.113775395114391 ], [ -102.568359375, 29.916852233070173 ], [ -101.4697265625, 29.80251790576445 ], [ -99.66796875, 27.722435918973432 ], [ -98.9208984375, 26.431228064506438 ], [ -97.2509765625, 25.918526162075153 ], [ -97.470703125, 27.449790329784214 ], [ -96.6796875, 28.613459424004414 ], [ -95.7568359375, 28.806173508854776 ], [ -93.955078125, 29.80251790576445 ], [ -92.0654296875, 29.688052749856801 ], [ -91.8017578125, 29.80251790576445 ], [ -90.703125, 29.34387539941801 ], [ -89.7802734375, 29.611670115197377 ], [ -89.7802734375, 29.954934549656144 ], [ -90.4833984375, 30.29701788337205 ], [ -88.242187499999986, 30.448673679287559 ], [ -88.0224609375, 30.675715404167743 ], [ -87.7587890625, 30.372875188118016 ], [ -87.3193359375, 30.486550842588485 ], [ -86.1328125, 30.448673679287559 ], [ -84.990234375, 29.764377375163129 ], [ -84.0234375, 30.145127183376129 ], [ -82.6171875, 29.075375179558346 ], [ -82.7490234375, 28.07198030177986 ], [ -82.5732421875, 27.644606381943326 ], [ -81.9580078125, 26.902476886279832 ], [ -81.6943359375, 26.07652055985697 ], [ -80.8154296875, 25.284437746983055 ], [ -80.375976562499986, 25.403584973186703 ], [ -80.068359375, 27.059125784374068 ], [ -80.5517578125, 27.761329874505233 ], [ -81.03515625, 29.228890030194229 ], [ -81.6064453125, 30.826780904779774 ], [ -81.123046875, 31.690781806136822 ], [ -80.4638671875, 32.43561304116276 ], [ -79.9365234375, 32.805744732906881 ], [ -79.277343749999986, 33.284619968887675 ], [ -78.442382812499986, 33.943359946578823 ], [ -77.9150390625, 34.125447565116126 ], [ -77.431640625, 34.633207911379593 ], [ -76.4208984375, 34.88593094075317 ], [ -76.728515625, 35.424867919305584 ], [ -76.1572265625, 35.424867919305584 ], [ -75.849609375, 35.92464453144099 ], [ -76.46484375, 35.995785386420323 ], [ -76.11328125, 36.703659597194559 ], [ -76.5087890625, 37.753344013106563 ], [ -75.8056640625, 37.649034021578657 ], [ -74.00390625, 40.044437584608559 ], [ -73.65234375, 40.680638025214563 ], [ -72.3779296875, 41.013065787006298 ], [ -72.24609375, 41.376808565702355 ], [ -69.9609375, 41.836827860727141 ], [ -70.6640625, 41.96765920367816 ], [ -71.059570312499986, 42.358543917497052 ], [ -70.7958984375, 42.617791432823459 ], [ -70.7958984375, 43.133061162406122 ], [ -70.048828125, 43.929549935614595 ], [ -68.9501953125, 44.150681159780937 ], [ -68.818359375, 44.465151013519616 ], [ -66.796875, 44.746733240246783 ], [ -67.4560546875, 45.182036837015886 ], [ -67.5, 45.614037411350928 ], [ -67.8515625, 45.736859547360488 ], [ -67.8515625, 46.98025235521883 ], [ -68.8623046875, 47.070121823833091 ], [ -69.2138671875, 47.398349200359263 ], [ -70.0048828125, 46.649436163350245 ], [ -70.400390625, 45.890008158661843 ], [ -71.103515625, 45.274886437048913 ], [ -71.89453125, 44.99588261816546 ], [ -74.926757812499986, 45.120052841530544 ], [ -76.2451171875, 44.056011695785251 ], [ -76.025390625, 43.675818093283411 ], [ -77.080078125, 43.357138222110528 ], [ -79.013671875, 43.197167282501276 ], [ -78.837890625, 42.714732185394581 ], [ -82.3974609375, 41.343824581185686 ], [ -83.3203125, 41.804078144272339 ], [ -82.44140625, 42.811521745097899 ], [ -83.0126953125, 44.024421519659342 ], [ -83.8037109375, 43.802818719047202 ], [ -83.4521484375, 45.213003555993964 ], [ -84.7705078125, 45.706179285330855 ], [ -85.95703125, 45.089035564831036 ], [ -86.1328125, 43.197167282501276 ], [ -88.242187499999986, 41.640078384678937 ], [ -87.1875, 45.828799251921339 ], [ -83.671875, 45.951149686691402 ], [ -83.84765625, 46.800059446787316 ], [ -87.71484375, 46.437856895024204 ], [ -88.59375, 47.159840013044317 ], [ -91.58203125, 46.800059446787316 ], [ -89.296875, 47.989921667414194 ], [ -94.39453125, 49.03786794532644 ], [ -124.453125, 49.03786794532644 ] ] ] } }
    ]
  };

  let causeVectors = {
    "type": "FeatureCollection",
    "name": "causeVectors",
    "features": [
      { "type": "Feature", "properties": { "stroke": "#f50000", "stroke-width": 4.0, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Brazil exports to China", "edge_id": "brazil_china_exports", "graph_type": "cause", "headline": "Beef and soy production are two of the main drivers of Amazon deforestation.  China (and Hong Kong) purchases 55% of all beef from the Amazon, and China purchases 82% of all soybeans from the Amazon.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "amazonRainforest" ], "products": [ { "name": "beef", "amount_USD": "2,700,000,000", "pct_total": "0.55", "weight": "0.25" }, { "name": "soy", "amount_USD": "28,306,000,000", "pct_total": "0.82", "weight": "0.3" } ], "weight": 0.55 }, "geometry": { "type": "LineString", "coordinates": [ [ -44.6484375, -2.460181181020993 ], [ 116.3671875, 40.713955826286046 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 3.0, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Brazil National Policy", "edge_id": "brazil_national_policy", "graph_type": "cause", "headline": "President Jair Bolsanaro has made it a national policy to extract value from the Amazon at the expense of the rainforest's future.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "amazonRainforest" ], "products": null, "weight": 0.25 }, "geometry": { "type": "LineString", "coordinates": [ [ -57.22046875, -11.000607953624762 ], [ -46.6259765625, -23.503551897424121 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 2.0, "stroke-opacity": 0.7, "fill": null, "fill-opacity": null, "name": "Brazil exports to United States", "edge_id": "brazil_USA_exports", "graph_type": "cause", "headline": "Logging is one of the main drivers of Amazon deforestation, and the United States purchases about 1\/3rd of all of Brazil's wood products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "amazonRainforest" ], "products": [ { "name": "wood", "amount_USD": "1,270,000,000", "pct_total": "0.33", "weight": "0.25" } ], "weight": 0.15 }, "geometry": { "type": "LineString", "coordinates": [ [ -65.390625, 10.833305983642491 ], [ -77.0361328125, 38.92522904714054 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 0.5, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Brazil exports to Italy", "edge_id": "brazil_italy_exports", "graph_type": "cause", "headline": "Beef is one of the main drivers of Amazon deforestation, and Italy purchases about ~3.5% of all of Brazil's beef products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "amazonRainforest" ], "products": [ { "name": "beef", "amount_USD": "160,000,000", "pct_total": "0.0349", "weight": "0.25" } ], "weight": 0.02 }, "geometry": { "type": "LineString", "coordinates": [ [ -51.15234375, 4.039617826768437 ], [ 12.54638671875, 42.000325148316207 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 0.5, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Brazil exports to Spain", "edge_id": "brazil_spain_exports", "graph_type": "cause", "headline": "Soy is one of the main drivers of Amazon deforestation, and Spain purchases ~2% of all of Brazil's soy products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "amazonRainforest" ], "products": [ { "name": "soy", "amount_USD": "742,000,000", "pct_total": "0.02", "weight": "0.25" } ], "weight": 0.015 }, "geometry": { "type": "LineString", "coordinates": [ [ -52.20703125, 5.441022303717974 ], [ -3.69140625, 40.547200234410489 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 0.5, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Brazil exports to Colombia", "edge_id": "brazil_colombia_exports", "graph_type": "cause", "headline": "Palm oil is one of the main drivers of Amazon deforestation, and Colombia purchases ~44% of all Brazil's palm oil products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "amazonRainforest" ], "products": [ { "name": "palm_oil", "amount_USD": "10,000,000", "pct_total": "0.42", "weight": "0.25" } ], "weight": 0.045 }, "geometry": { "type": "LineString", "coordinates": [ [ -73.476562499999986, 4.171115454867424 ], [ -73.959960937499986, 4.609278084409835 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 0.5, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Brazil exports to India", "edge_id": "brazil_india_exports", "graph_type": "cause", "headline": "Soy is one of the main drivers of Amazon deforestation, and India purchases ~52% of all of Brazil's soybean oil.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "amazonRainfores" ], "products": [ { "name": "soybean_oil", "amount_USD": "535,000,000", "pct_total": "0.52", "weight": "0.25" } ], "weight": 0.04 }, "geometry": { "type": "LineString", "coordinates": [ [ -44.12109375, -3.162455530237848 ], [ 77.255859375, 28.613459424004414 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 0.5, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Brazil exports to Germany", "edge_id": "brazil_germany_exports", "graph_type": "cause", "headline": "Palm oil is one of the main drivers of Amazon deforestation, and Germany purchases ~30.1% of all Brazil's palm oil products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "amazonRainforest" ], "products": [ { "name": "palm_oil", "amount_USD": "6,800,000", "pct_total": "0.301", "weight": "0.25" } ], "weight": 0.04 }, "geometry": { "type": "LineString", "coordinates": [ [ -51.861328125, 4.496727241761671 ], [ 11.46435546875, 48.166085419012532 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 5.0, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing State: Florida", "edge_id": "florida_election_2020", "graph_type": "cause", "headline": "Florida is one of the most important swing states, with 29 electoral votes of the ~137 electoral votes most up for grabs. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "usElection2020" ], "products": null, "weight": 0.18 }, "geometry": { "type": "LineString", "coordinates": [ [ -96.50390625, 39.095962936305476 ], [ -82.265625, 29.840643899834411 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 2.0, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing State: Michigan", "edge_id": "michigan_election_2020", "graph_type": "cause", "headline": "Michigan is one of the most important swing states, with 16 electoral votes of the ~137 electoral votes most up for grabs. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "usElection2020" ], "products": null, "weight": 0.07 }, "geometry": { "type": "LineString", "coordinates": [ [ -96.591796875, 39.26628442213066 ], [ -83.408203125, 42.391008609205045 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 1.5, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing State: Wisconsin", "edge_id": "wisconsin_election_2020", "graph_type": "cause", "headline": "Wisconsin is one of the most important swing states, with 10 electoral votes of the ~137 electoral votes most up for grabs. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "usElection2020" ], "products": null, "weight": 0.06 }, "geometry": { "type": "LineString", "coordinates": [ [ -96.5478515625, 39.26628442213066 ], [ -89.3408203125, 43.068887774169625 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 3.5, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing State: Pennsylvania", "edge_id": "pennsylvania_election_2020", "graph_type": "cause", "headline": "Pennsylvania is one of the most important swing states, with 20 electoral votes of the ~137 electoral votes most up for grabs. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "usElection2020" ], "products": null, "weight": 0.11 }, "geometry": { "type": "LineString", "coordinates": [ [ -96.591796875, 39.26628442213066 ], [ -75.157470703125, 39.960280354295698 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 1.4, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing State: Arizona", "edge_id": "arizona_election_2020", "graph_type": "cause", "headline": "Arizona is one of the most important swing states, with 11 electoral votes of the ~137 electoral votes most up for grabs. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "usElection2020" ], "products": null, "weight": 0.065 }, "geometry": { "type": "LineString", "coordinates": [ [ -96.7236328125, 39.26628442213066 ], [ -112.0166015625, 33.46810795527896 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 1.4, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing State: North Carolina", "edge_id": "northcarolina_election_2020", "graph_type": "cause", "headline": "North Carolina is one of the most important swing states, with 15 electoral votes of the ~137 electoral votes most up for grabs. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "usElection2020" ], "products": null, "weight": 0.07 }, "geometry": { "type": "LineString", "coordinates": [ [ -96.61376953125, 39.317300373271024 ], [ -79.34326171875, 35.906849306771207 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 4.0, "stroke-opacity": 0.7, "fill": null, "fill-opacity": null, "name": "Amazon Logging Imports", "edge_id": "brazil_USA_exports_amazon", "graph_type": "cause", "headline": "Amazon is one of the companies which buy the majority of Brazilian logging products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "brazil_USA_exports" ], "products": [ { "name": "wood", "amount_USD": "1,270,000,000", "pct_total": "0.33", "weight": "0.25" } ], "weight": 0.25 }, "geometry": { "type": "LineString", "coordinates": [ [ -74.619140625, 34.089061315849939 ], [ -122.32177734375, 47.613569753973977 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 3.0, "stroke-opacity": 0.7, "fill": null, "fill-opacity": null, "name": "Home Depot Logging Imports", "edge_id": "brazil_USA_exports_homedepot", "graph_type": "cause", "headline": "Home Depot is one of the companies which buy the majority of Brazilian logging products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "brazil_USA_exports" ], "products": [ { "name": "wood", "amount_USD": "1,270,000,000", "pct_total": "0.33", "weight": "0.25" } ], "weight": 0.18 }, "geometry": { "type": "LineString", "coordinates": [ [ -74.70703125, 34.016241889667015 ], [ -84.375, 33.760882000869167 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 2.0, "stroke-opacity": 0.7, "fill": null, "fill-opacity": null, "name": "Acme Corp. Logging Imports", "edge_id": "brazil_USA_exports_acme", "graph_type": "cause", "headline": "Acme is one of the companies which buy the majority of Brazilian logging products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "brazil_USA_exports" ], "products": [ { "name": "wood", "amount_USD": "1,270,000,000", "pct_total": "0.33", "weight": "0.25" } ], "weight": 0.1 }, "geometry": { "type": "LineString", "coordinates": [ [ -75.5859375, 35.995785386420323 ], [ -74.4873046875, 40.34654412118006 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 6.0, "stroke-opacity": 0.7, "fill": null, "fill-opacity": null, "name": "Shanghai Corp Beef Imports", "edge_id": "brazil_USA_exports_shanghaicorp", "graph_type": "cause", "headline": "Shanghai Corp is one of the companies which buy the majority of Brazilian beef products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "brazil_china_exports" ], "products": [ { "name": "wood", "amount_USD": "1,270,000,000", "pct_total": "0.33", "weight": "0.25" } ], "weight": 0.33 }, "geometry": { "type": "LineString", "coordinates": [ [ 91.93359375, 35.02999636902566 ], [ 121.640625, 31.128199299111959 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 4.0, "stroke-opacity": 0.7, "fill": null, "fill-opacity": null, "name": "Hong Kong Corp Beef Imports", "edge_id": "brazil_china_exports_hongkongcorp", "graph_type": "cause", "headline": "Hong Kong Corp Corp is one of the companies which buy the majority of Brazilian beef products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "brazil_china_exports" ], "products": [ { "name": "wood", "amount_USD": "1,270,000,000", "pct_total": "0.33", "weight": "0.25" } ], "weight": 0.2 }, "geometry": { "type": "LineString", "coordinates": [ [ 92.460937499999986, 35.101934057246062 ], [ 114.169921875, 22.350075806124867 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 3.0, "stroke-opacity": 0.7, "fill": null, "fill-opacity": null, "name": "Jiangsu Corp Beef Imports", "edge_id": "brazil_china_exports_jiangsucorp", "graph_type": "cause", "headline": "Jiangsu Corp is one of the companies which buy the majority of Brazilian logging products.", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "brazil_china_exports" ], "products": [ { "name": "wood", "amount_USD": "1,270,000,000", "pct_total": "0.33", "weight": "0.25" } ], "weight": 0.1 }, "geometry": { "type": "LineString", "coordinates": [ [ 92.373046875, 34.813803317113155 ], [ 120.05859375, 33.50475906922609 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 5.0, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing City: Tampa Bay, Florida", "edge_id": "tampa_florida_election_2020", "graph_type": "cause", "headline": "Tampa Bay is one of the most important swing cities in the Florida state election. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "florida_election_2020" ], "products": null, "weight": 0.18 }, "geometry": { "type": "LineString", "coordinates": [ [ -82.72705078125, 30.240086360983426 ], [ -82.46337890625, 27.897349229684259 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 5.0, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing City: Orlando, Florida", "edge_id": "orlando_florida_election_2020", "graph_type": "cause", "headline": "Orlando is one of the most important swing cities in the Florida state election. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "florida_election_2020" ], "products": null, "weight": 0.18 }, "geometry": { "type": "LineString", "coordinates": [ [ -82.705078125, 30.154627220775971 ], [ -81.375732421875, 28.526622418648127 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 2.0, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing City: Detroit, Michigan", "edge_id": "detroit_michigan_election_2020", "graph_type": "cause", "headline": "Detroit is one of the most important swing cities in the Michigan state election. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "michigan_election_2020" ], "products": null, "weight": 0.18 }, "geometry": { "type": "LineString", "coordinates": [ [ -84.3804931640625, 42.163403424224008 ], [ -83.045654296875, 42.350425122434572 ] ] } },
      { "type": "Feature", "properties": { "stroke": "#ff0000", "stroke-width": 1.0, "stroke-opacity": 1.0, "fill": null, "fill-opacity": null, "name": "Swing City: East Lansing, Michigan", "edge_id": "eastlansing_michigan_election_2020", "graph_type": "cause", "headline": "East Lansing is one of the most important swing cities in the Michigan state election. ", "entity": null, "CO2_impact": null, "CO2_trend": null, "parentIDs": [ "michigan_election_2020" ], "products": null, "weight": 0.18 }, "geometry": { "type": "LineString", "coordinates": [ [ -84.83642578125, 42.065606754057157 ], [ -84.495849609375, 42.734909146515598 ] ] } }
    ]
  };

  map.addSource("priorityAreaSource", {
    type: "geojson",
    data: priorityAreas,
    generateId: true
  });

  map.addSource("causeVectorSource", {
    type: "geojson",
    data: causeVectors,
    generateId: true
  });
}
