// #########################################
// ## Immediate To-Do:                    ##
// ##   + node clicks activate all nodes  ##
// ##   + node hovers activate all edges  ##
// #########################################

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

var node_layer = {
  "id": "node_layer",
  "type": "fill",
  "source": "nodes",
  "source-layer": "home_nodes",
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
var node_outlines = {
  "id": "node_outlines",
  "type": "line",
  "source": "nodes",
  "source-layer": "home_nodes",
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
var edge_layer = {
  "id": "edge_layer",
  "type": "line",
  "source": "edges",
  "source-layer": "home_edges",
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
  map.addSource("nodes", {
    type: "vector",
    url: "mapbox://bgoblirsch.ckd2nk5qo1qdx26mh5dkjsvu9-2xtiv"
  });
  map.addSource("edges", {
    type: "vector",
    url: "mapbox://bgoblirsch.ckd2nkhxu1mbu2dmheqdzke6e-0rgxk"
  })

  // Create the layer objects
  map.addLayer(node_layer);
  map.addLayer(node_outlines);
  map.addLayer(edge_layer);

  // Create Mapbox popup object
  var popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  // On node hover: darken node and show its edges
  map.on("mousemove", "node_layer", function(e) {
    console.log(e.features[0]);
    // Change cursor to "select"
    map.getCanvas().style.cursor = 'pointer';

    if (e.features.length > 0) {
      // if something is already hovered: make it not active and hide its children
      if (hoveredNodeId) {
        map.setFeatureState({
            source: "nodes",
            id: hoveredNodeId,
            sourceLayer: "home_nodes"
          },
          { active: false }
        );
        map.setLayoutProperty("edge_layer", "visibility", "none")
      }

      // mapbox's unique feature Id, not our custom property
      hoveredNodeId = e.features[0].id;

      // set node to active (darken)
      map.setFeatureState({
          source: "nodes",
          id: hoveredNodeId,
          sourceLayer: "home_nodes"
        },
        { active: true }
      );

      // show edges - filter will work better for managing which edges to show
      map.setLayoutProperty("edge_layer", "visibility", "visible")

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
  map.on("mouseleave", "node_layer", function() {
    // reset cursor
    map.getCanvas().style.cursor = '';
    popup.remove();
    if (hoveredNodeId && !activeNodeId) {
      map.setFeatureState({
          source: "nodes",
          id: hoveredNodeId,
          sourceLayer: "home_nodes"
        },
        { active: false }
      );
      map.setLayoutProperty("edge_layer", "visibility", "none");
    }
    hoveredNodeId = null;
  });

  // On edge hover: display its info
  map.on("mouseenter", "edge_layer", function(e) {
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

  // remove edge hover styling
  map.on("mouseleave", "edge_layer", function() {
    // reset cursor
    map.getCanvas().style.cursor = '';
    popup.remove();
    hoveredEdgeId = null;
  });

  // On node click: set it to active (darken and keep its edges drawn) and zoom
  // to its edges' bbox
  map.on("click", "node_layer", function(e) {
    if (e.features.length > 0) {
      if (activeNodeId == e.features[0].id) {
        map.setFeatureState({
          source: "nodes",
          id: activeNodeId,
          sourceLayer: "home_nodes"
          },
          { active: false }
        );
        map.setLayoutProperty("edge_layer", "visibility", "none");
        activeNodeId = null;
      } else {
        popup.remove();
        activeNodeId = e.features[0].id;
        zoomTo();
        map.setLayoutProperty("edge_layer", "visibility", "visible");
        map.setFeatureState({
            source: "nodes",
            id: hoveredNodeId,
            sourceLayer: "home_nodes"
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
// ################################################
// ## Need to pass a node as a parameter to this ##
// ## function and make it work for any node     ##
// ################################################
function zoomTo() {
  var edge_extent = map.getSource("nodes").bounds;
  var node_extent = map.getSource("edges").bounds;
  var bounds = new mapboxgl.LngLatBounds();
  bounds.extend(edge_extent);
  bounds.extend(node_extent);
  map.fitBounds(bounds, { padding: 40 })
}
