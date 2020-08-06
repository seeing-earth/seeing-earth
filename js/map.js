////////////////////////////////////////////////////////////////////////
// To-Do:
//  + on Cause Vector hover & click, increase other CV's opacity
//  + optimize geojson -> 6-decimal precision
//  + fix zoomTo function -> pass a parameter
//  + get popup to avoid covering its feature's children
////////////////////////////////////////////////////////////////////////

mapboxgl.accessToken = 'pk.eyJ1IjoiYmdvYmxpcnNjaCIsImEiOiJjaXpuazEyZWowMzlkMzJvN3M3cThzN2ZkIn0.B0gMS_CvyKc_NHGmWejVqw';
var map = new mapboxgl.Map({
  container: 'map', // Container ID
  style: 'mapbox://styles/mapbox/streets-v11', // Map style to use
  zoom: 1.6, // Starting zoom level
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

// global variables for tracking the current hovered/selected edges and nodes
// !!! I believe the _Num variables can be dropped if you force the non-_Num ones to use the string ID (instead of the mapbox generated one) !!!
let hoveredPAid = null;
let hoveredPAidNum = null;
let hoveredCVid = null;
let selectedPAid = null;
let selectedPAidNum = null;
let selectedCVid = null;

// global variables that will hold the geojson data
let priorityAreas;
let causeVectors;

// Create Mapbox popup object
let popup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false
});

map.on('load', function() {
  // Load the geojson data; currently local in this js file.
  // move to external site for better performance
  loadGeojsonSources();

  // Create a layer and generate listener objects for each Priority Area
  createPriorityAreaLayers();

  // Create a layer and generate listener objects for each Cause Vector
  createCauseVectorLayers();

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
  // wishing for getExtent:
  // let extent = getExtent(feature)
  // then zoomTo(feature) logic;
  let edge_extent = map.getSource("priorityAreaSource").bounds;
  let node_extent = map.getSource("causeVectorSource").bounds;
  let bounds = new mapboxgl.LngLatBounds();
  bounds.extend(edge_extent);
  bounds.extend(node_extent);
  map.fitBounds(bounds, { padding: 40 })
}

function showChildren(parentId) {
  let count = 0
  causeVectors.features.forEach(function(feature) {
    if (feature.properties.parentId == parentId) {
      map.setLayoutProperty(feature.properties.id, "visibility", "visible");

      try {
        let arcline = {
          "type": "FeatureCollection",
          "features": [
            {
              "type": "Feature",
              "geometry": {
                "type": "LineString",
                "coordinates": [[ -64.575853, -6.711117], feature.properties.center]
              }
            }
          ]
        }

        let lineDist = turf.lineDistance(arcline.features[0], "kilometers");
        let arc = [];
        let steps = 500;


        for (var i = 0; i < lineDist; i += lineDist / steps) {
          let segment = turf.along(arcline.features[0], i, "kilometers");
          arc.push(segment.geometry.coordinates);
        }

        arcline.features[0].geometry.coordinates = arc;

        count += 1;
        let sourceName = "arcline" + count;
        console.log(sourceName);
        map.addSource(sourceName, {
          "type": "geojson",
          "data": arcline
        });

        map.addLayer({
          "id": "arcline" + count,
          "source": "arcline"+count,
          "type": "line",
          "paint": {
            "line-width": feature.properties.strokeWidth,
            "line-color": "red"
          }
        });
      } catch(error) {
        console.warn(error)
      }

    }
  })
}

function hideChildren(parentId) {
  causeVectors.features.forEach(function(feature) {
    if (feature.properties.parentId == parentId) {
      map.setLayoutProperty(feature.properties.id, "visibility", "none");

    }
  });
}

function hideAllChildren() {
  causeVectors.features.forEach(function(feature) {
    map.setLayoutProperty(feature.properties.id, "visibility", "none");
  });
}

function createCauseVectorLayers() {
  causeVectors.features.forEach(function(feature) {
    let layerId = feature.properties.id;
    let parentId = feature.properties.parentId;
    let childrenId = parentId + "CauseVectors"
    if (feature.geometry.type == "MultiPolygon" || feature.geometry.type == "Polygon") {

    }
    map.addLayer({
      "id": layerId,
      "type": "line",
      "source": "causeVectorSource",
      "filter": ["==", "id", layerId],
      "layout": {
        "line-cap": "round",
        "visibility": "none"
      },
      "paint": {
        "line-color": ["get", "stroke"],
        "line-width": ["get", "strokeWidth"]
      }
    });

    map.on("mousemove", layerId, function(e) {
      showChildren(layerId);

      // Variables for popup
      var coordinates = e.lngLat;
      var name = e.features[0].properties.name;
      var description = e.features[0].properties.headline;

      // This helps prevent the popup box from overflowing outside the viewport
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      // Populate the popup
      popup
        .setLngLat(coordinates)
        .setHTML(`<h2>${name}</h2><p>${description}</p>`)
        .addTo(map);
    });

    map.on("mouseleave", layerId, function(e) {
      popup.remove();
      if (!selectedCVid || selectedCVid != layerId) {
        hideChildren(layerId);
      }
    });

    map.on("click", layerId, function(e) {
      popup.remove();
      showChildren(layerId);
      selectedCVid = e.features[0].properties.id;
    })
  });
}

// Create a layer and generate listener objects for each Priority Area
function createPriorityAreaLayers() {
  priorityAreas.features.forEach(function(feature) {
    let layerId = feature.properties.id;
    let childrenId = layerId + "CauseVectors";

    map.addLayer({
      "id": layerId,
      "type": "fill",
      "source": "priorityAreaSource",
      "filter": ["==", "id", layerId],
      "paint": {
        "fill-color": ["get", "fill"],
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "active"], false],
          0.8,
          0.5
        ]
      }
    });

    // Due to a technical limitation of WebGL, outlines cannot be rendered with a
    // width > 1, so a seperate outline layer is needed
    map.addLayer({
      "id": layerId + "Outline",
      "type": "line",
      "source": "priorityAreaSource",
      "filter": ["==", "id", layerId],
      "paint": {
        "line-color": ["get", "CO2_trend"],
        "line-width": ["get", "strokeWidth"],
        "line-opacity": ["get", "stroke-opacity"]
      }
    });

    map.on("mousemove", layerId, function(e) {
      hoveredPAid = e.features[0].properties.id;
      // mapbox generated id
      hoveredPAidNum = e.features[0].id;
      if (!selectedPAid || hoveredPAid == selectedPAid) {
        // change to "select" cursor
        map.getCanvas().style.cursor = "pointer";



        // darken the Priority Area
        map.setFeatureState({
            source: "priorityAreaSource",
            id: hoveredPAidNum
          },
          { active: true }
        );

        // display the PA's Cause Vector children
        showChildren(layerId);

        // if a node is not active: populate popup box
        // if (selectedPAidNum == null) {
        //   var coordinates = e.lngLat;
        //   var name = e.features[0].properties.name;
        //   var description = e.features[0].properties.headline;
        //
        //   // This helps prevent the popup box from overflowing outside the viewport
        //   while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        //     coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        //   }
        //
        //   // Populate the popup
        //   popup
        //     .setLngLat(coordinates)
        //     .setHTML(`<h2>${name}</h2><p>${description}</p>`)
        //     .addTo(map);
        // }
      }
    });

    map.on("mouseleave", layerId, function(e) {
      // reset the cursor type
      map.getCanvas().style.cursor = '';
      popup.remove();
      if (hoveredPAidNum != selectedPAidNum) {
        // remove the hover styling
        map.setFeatureState({
            source: "priorityAreaSource",
            id: hoveredPAidNum
          },
          { active: false }
        );

        // hide PA's Cause Vector children
        hideChildren(hoveredPAid);
      }
      hoveredPAid = null;
    });

    map.on("click", layerId, function(e) {
      if (selectedPAidNum == e.features[0].id) {
        map.setFeatureState({
          source: "priorityAreaSource",
          id: selectedPAidNum
          },
          { active: false }
        );
        hideChildren(selectedPAidNum);
        hideChildren(selectedCVid);
        selectedPAidNum = null;
        selectedPAid = null;
      } else {
        if (selectedPAidNum >= 0) {
          popup.remove();
          hideChildren(selectedPAid);
          map.setFeatureState({
              source: "priorityAreaSource",
              id: selectedPAidNum
            },
            { active: false }
          );
        }
        selectedPAid = e.features[0].properties.id;
        selectedPAidNum = e.features[0].id;
        //zoomTo();
        showChildren(layerId);
        map.setFeatureState({
            source: "priorityAreaSource",
            id: hoveredPAid
          },
          { active: true }
        );
      }
    });
  });
}

// Loading geojson locally in the js file for testing purposes only
// can later store in an S3 bucket or something similar
function loadGeojsonSources() {
  priorityAreas = {
    "type": "FeatureCollection",
    "name": "priorityAreas",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 2,
          "stroke-opacity": 1,
          "fill": "green",
          "fill-opacity": 0.5,
          "name": "Amazon Rainforest",
          "id": "amazonRainforest",
          "type": "natural",
          "headline": "The Amazon is one of the world's greatest carbon sinks and one of the world's most important homes of biodiversity.  In the late 20th Century, the Amazon would sequester about 2 billion tons of CO2 every year (almost half the USA's annual carbon footprint).  Due to deforestation, the Amazon now only sequesters approximately 1.1 billion tons of CO2 per year, and approximately 20% of the rainforest is actively emitting carbon.  The Amazon is currently 18% deforested, and research has indicated at 25% deforestation, it may reach a tipping point where the rainforest no longer becomes a carbon sink -- and starts becoming a savannah.  More than half of Amazon's deforestation is comes from the production of beef, soy, wood, and palm oil, which is driven by Brazil's current national policy and president Jair Bolsanaro, and likewise driven by consumption in countries like China, the United States, Indian, Germany, and Spain.  One potential strategy for improvement is eliminating the most destructive production taking place in the Amazon, and replacing it with sustainable logging practices, which can allow the rainforest to continue supporting local livelihoods while remaining an important resource of logging materials for the rest of the world. ",
          "CO2_impact": "-1,100,000,000",
          "CO2_trend": "red",
          "childId": ["brazil_china_exports","brazil_national_policy","brazil_USA_exports","brazil_italy_exports","brazil_spain_exports", "brazil_colombia_exports", "brazil_germany_exports", "brazil_india_exports"]
      },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ -64.599609375, -15.28418511407642 ], [ -44.560546875, -2.635788574166607 ], [ -45.615234375, -1.933226826477111 ], [ -47.98828125, -0.439448816413964 ], [ -50.361328125, -0.703107352436478 ], [ -52.294921875, -1.669685500986571 ], [ -50.009765625, 1.142502403706165 ], [ -50.88867187499999, 2.81137119333114 ], [ -52.55859375, 5.00339434502215 ], [ -54.404296875, 6.140554782450308 ], [ -56.25, 5.528510525692801 ], [ -58.359375, 6.926426847059551 ], [ -60.1171875, 8.320212289522944 ], [ -61.69921875, 9.535748998133627 ], [ -63.6328125, 10.31491928581316 ], [ -67.763671875, 10.228437266155943 ], [ -71.630859375, 5.878332109674327 ], [ -79.189453125, -2.02106511876699 ], [ -78.662109375, -4.214943141390639 ], [ -73.828125, -13.068776734357694 ], [ -64.599609375, -15.28418511407642 ] ] ] } },
      { "type": "Feature",
      "properties": {
        "stroke": "#ff0000",
        "strokeWidth": 3,
        "stroke-opacity": 1,
        "fill": "orange",
        "fill-opacity": 0.5,
        "name": "2020 United States Election",
        "id": "usElection2020",
        "headline": "The 2020 US Election will influence environmental outcomes for the entire world.  Candidate Joe Biden has announced a $2 trillion Climate Infrastructure plan.  Conversely, the current administration has appointed fossil fuel lobbyists to high-level positions, and deliberately rolled back environmental protections.",
        "type": "geopolitical",
        "CO2_impact": "7,000,000,000",
        "CO2_trend": "red",
        "childId": ["florida_election_2020", "michigan_election_2020", "pennsylvania_election_2020", "northcarolina_election_2020", "arizona_election_2020", "wisconsin_election_2020"]
      },
      "geometry": { "type": "Polygon", "coordinates": [ [ [ -124.453125, 49.03786794532644 ], [ -124.62890625, 48.253941144634311 ], [ -123.969726562499986, 46.103708755980257 ], [ -124.5849609375, 42.908160071960538 ], [ -124.1455078125, 41.96765920367816 ], [ -124.277343749999986, 40.513799155044133 ], [ -124.013671874999986, 40.145289295676598 ], [ -123.706054687500014, 39.061849134291542 ], [ -122.431640625, 37.544577320855822 ], [ -121.9921875, 36.633162095586577 ], [ -120.410156249999986, 34.524661471771722 ], [ -118.30078125, 34.016241889667015 ], [ -116.982421874999986, 32.583849325656622 ], [ -114.609375, 32.879587173066305 ], [ -114.785156249999986, 32.583849325656622 ], [ -111.1376953125, 31.466153715024294 ], [ -108.2373046875, 31.42866311735861 ], [ -108.061523437499986, 31.914867503276223 ], [ -106.4794921875, 31.765537409484374 ], [ -104.765625, 30.410781790845888 ], [ -104.6337890625, 29.764377375163129 ], [ -103.095703125, 29.113775395114391 ], [ -102.568359375, 29.916852233070173 ], [ -101.4697265625, 29.80251790576445 ], [ -99.66796875, 27.722435918973432 ], [ -98.9208984375, 26.431228064506438 ], [ -97.2509765625, 25.918526162075153 ], [ -97.470703125, 27.449790329784214 ], [ -96.6796875, 28.613459424004414 ], [ -95.7568359375, 28.806173508854776 ], [ -93.955078125, 29.80251790576445 ], [ -92.0654296875, 29.688052749856801 ], [ -91.8017578125, 29.80251790576445 ], [ -90.703125, 29.34387539941801 ], [ -89.7802734375, 29.611670115197377 ], [ -89.7802734375, 29.954934549656144 ], [ -90.4833984375, 30.29701788337205 ], [ -88.242187499999986, 30.448673679287559 ], [ -88.0224609375, 30.675715404167743 ], [ -87.7587890625, 30.372875188118016 ], [ -87.3193359375, 30.486550842588485 ], [ -86.1328125, 30.448673679287559 ], [ -84.990234375, 29.764377375163129 ], [ -84.0234375, 30.145127183376129 ], [ -82.6171875, 29.075375179558346 ], [ -82.7490234375, 28.07198030177986 ], [ -82.5732421875, 27.644606381943326 ], [ -81.9580078125, 26.902476886279832 ], [ -81.6943359375, 26.07652055985697 ], [ -80.8154296875, 25.284437746983055 ], [ -80.375976562499986, 25.403584973186703 ], [ -80.068359375, 27.059125784374068 ], [ -80.5517578125, 27.761329874505233 ], [ -81.03515625, 29.228890030194229 ], [ -81.6064453125, 30.826780904779774 ], [ -81.123046875, 31.690781806136822 ], [ -80.4638671875, 32.43561304116276 ], [ -79.9365234375, 32.805744732906881 ], [ -79.277343749999986, 33.284619968887675 ], [ -78.442382812499986, 33.943359946578823 ], [ -77.9150390625, 34.125447565116126 ], [ -77.431640625, 34.633207911379593 ], [ -76.4208984375, 34.88593094075317 ], [ -76.728515625, 35.424867919305584 ], [ -76.1572265625, 35.424867919305584 ], [ -75.849609375, 35.92464453144099 ], [ -76.46484375, 35.995785386420323 ], [ -76.11328125, 36.703659597194559 ], [ -76.5087890625, 37.753344013106563 ], [ -75.8056640625, 37.649034021578657 ], [ -74.00390625, 40.044437584608559 ], [ -73.65234375, 40.680638025214563 ], [ -72.3779296875, 41.013065787006298 ], [ -72.24609375, 41.376808565702355 ], [ -69.9609375, 41.836827860727141 ], [ -70.6640625, 41.96765920367816 ], [ -71.059570312499986, 42.358543917497052 ], [ -70.7958984375, 42.617791432823459 ], [ -70.7958984375, 43.133061162406122 ], [ -70.048828125, 43.929549935614595 ], [ -68.9501953125, 44.150681159780937 ], [ -68.818359375, 44.465151013519616 ], [ -66.796875, 44.746733240246783 ], [ -67.4560546875, 45.182036837015886 ], [ -67.5, 45.614037411350928 ], [ -67.8515625, 45.736859547360488 ], [ -67.8515625, 46.98025235521883 ], [ -68.8623046875, 47.070121823833091 ], [ -69.2138671875, 47.398349200359263 ], [ -70.0048828125, 46.649436163350245 ], [ -70.400390625, 45.890008158661843 ], [ -71.103515625, 45.274886437048913 ], [ -71.89453125, 44.99588261816546 ], [ -74.926757812499986, 45.120052841530544 ], [ -76.2451171875, 44.056011695785251 ], [ -76.025390625, 43.675818093283411 ], [ -77.080078125, 43.357138222110528 ], [ -79.013671875, 43.197167282501276 ], [ -78.837890625, 42.714732185394581 ], [ -82.3974609375, 41.343824581185686 ], [ -83.3203125, 41.804078144272339 ], [ -82.44140625, 42.811521745097899 ], [ -83.0126953125, 44.024421519659342 ], [ -83.8037109375, 43.802818719047202 ], [ -83.4521484375, 45.213003555993964 ], [ -84.7705078125, 45.706179285330855 ], [ -85.95703125, 45.089035564831036 ], [ -86.1328125, 43.197167282501276 ], [ -88.242187499999986, 41.640078384678937 ], [ -87.1875, 45.828799251921339 ], [ -83.671875, 45.951149686691402 ], [ -83.84765625, 46.800059446787316 ], [ -87.71484375, 46.437856895024204 ], [ -88.59375, 47.159840013044317 ], [ -91.58203125, 46.800059446787316 ], [ -89.296875, 47.989921667414194 ], [ -94.39453125, 49.03786794532644 ], [ -124.453125, 49.03786794532644 ] ] ] }
    },
    {
      "type": "Feature",
      "properties": {
        "stroke": "#555555",
        "strokeWidth": 2,
        "stroke-opacity": 1,
        "fill": "#555555",
        "fill-opacity": 0.5,
        "name": "Global Warming",
        "id": "globalWarming",
        "headline": "Global Warming is primarily driven by greenhouse gas (GHG) emissions since the Industrial Revolution.  Increasing temperatures affect ecosystems and natural systems around the world, including the ability for our oceans to support marine life, the ability for our forests to support biodiversity, and the ability for weather patterns (such as ocean currents and seasonal trends) to keep natural systems in balance.  As natural systems lose their ability to support marine life and forest life, they also lose the ability to support human life.  And as these ecosystems degrade, they start realising more GHG emissions than they sequester, which will acceleratethe loop of atmospheric warming, environmental degradation, and risks for all life on Earth. ",
        "type": "natural",
        "CO2_impact": "-1,100,000,000",
        "CO2_trend": "red",
        "childId": ["usa_emissions", "china_emissions", "indonesia_emissions", "india_emissions", "russia_emissions"]
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -159.2578125,
              77.61770905279676
            ],
            [
              -132.890625,
              75.58493740869223
            ],
            [
              -105.8203125,
              74.77584300649235
            ],
            [
              -62.57812500000001,
              74.68325030051861
            ],
            [
              -20.7421875,
              74.21198251594369
            ],
            [
              15.1171875,
              74.68325030051861
            ],
            [
              52.734375,
              74.95939165894974
            ],
            [
              92.10937499999999,
              76.10079606754579
            ],
            [
              102.65625,
              77.38950400539731
            ],
            [
              64.3359375,
              80.92842569282253
            ],
            [
              23.203125,
              81.72318761821155
            ],
            [
              -23.203125,
              82.07002819448267
            ],
            [
              -56.953125,
              82.26169873683153
            ],
            [
              -106.171875,
              82.1664460084773
            ],
            [
              -134.6484375,
              81.46626086056541
            ],
            [
              -161.015625,
              80.05804956215623
            ],
            [
              -175.078125,
              78.63000556774836
            ],
            [
              -159.2578125,
              77.61770905279676
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "stroke": "#ff0000",
        "strokeWidth": 2,
        "stroke-opacity": 1,
        "fill": "orange",
        "fill-opacity": 0.5,
        "name": "Adani Carmichael Coal Mine",
        "id": "adaniCoalMine",
        "headline": "The Adani Group is currently pursuing development of an international coal mine, planned to sit between the Galilee Basin and the Great Barrier Reef.  If built, this project will destroy the ancestral lands of Indigenous people, threaten 270 billion liters of Queensland groundwater, add 4.6 billion tons of CO2 to the atmosphere over the next 60 years, and pave the way for at least 8 more coal mines in the Galille Basin.  Many insurers, contractors, and project partners have stepped away from the project because of these problems -- but several corporate entities are still involved in the project, includin Marsh (insurer), Hanwha, and the Industrial Bank of Korea. www.stopadani.com is leading an effort to call on all partners and facilitators to reject this project, and other fossil fuel projects in the future.",
        "type": "fossilFuelProject",
        "CO2_impact": "-1,100,000,000",
        "CO2_trend": "red",
        "childId": ["IBK_adani_funding", "marsh_adani_funding", "adani_adani_funding"]
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              146.0302734375,
              -21.27913739410871
            ],
            [
              149.161376953125,
              -21.135745255030592
            ],
            [
              148.20556640625,
              -20.014645445341355
            ],
            [
              146.0302734375,
              -21.27913739410871
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "stroke": "#ff0000",
        "strokeWidth": 2,
        "stroke-opacity": 1,
        "fill": "orange",
        "fill-opacity": 0.5,
        "name": "Ocean Pollution",
        "id": "oceanPollution",
        "type": "plastic",
        "headline": "Around the world, ocean pollution has collected in large patches in the every major ocean.  Most famous is the Great Pacfic Garbage Patch actually exists in two locations -- one patch off the coast of California, and another patch off the coast of Japan.  The majority of global plastic waste is exported to facilities in Southeast Asia.  However, these facilities are not equipped to deal with the volume of plastic they recieve.  As a result, about 2/3rds of ocean plastic comes from overburned rivers in Asia.  Other major sources include the Nile and Niger rivers in Africa, and the Amazon river in South America.",
        "CO2_impact": "0",
        "CO2_trend": "red",
        "childId": ["yangtzeRiver_plastic", "nileRiver_plastic", "amazonRiver_plastic"]
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -214.98046875,
              41.244772343082076
            ],
            [
              -214.98046875,
              30.90222470517144
            ],
            [
              -206.54296875,
              31.353636941500987
            ],
            [
              -204.2578125,
              38.95940879245423
            ],
            [
              -138.515625,
              40.3130432088809
            ],
            [
              -135.35156249999997,
              32.99023555965106
            ],
            [
              -126.73828125,
              33.7243396617476
            ],
            [
              -127.61718749999999,
              42.5530802889558
            ],
            [
              -214.98046875,
              41.244772343082076
            ]
          ]
        ]
      }
    }]
  };

  causeVectors = {
    "type": "FeatureCollection",
    "name": "causeVectors",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "stroke": "#f50000",
          "strokeWidth": 4,
          "stroke-opacity": 1,
          "name": "Brazil exports to China",
          "id": "brazil_china_exports",
          "childId": ["brazil_china_exports_shanghaicorp", "brazil_china_exports_hongkongcorp", "brazil_china_exports_jiangsucorp"],
          "rootId":"amazonRainforest",
          "parentId": "amazonRainforest",
          "headline": "Beef and soy production are two of the main drivers of Amazon deforestation.  China (and Hong Kong) purchases 55% of all beef from the Amazon, and China purchases 82% of all soybeans from the Amazon.",
          "type": "supplychain",
          "products": "[{\"name\":\"beef\",\"amount_USD\":\"2,700,000,000\",\"pct_total\":\"0.55\",\"weight\":\"0.25\"},{\"name\":\"soy\",\"amount_USD\":\"28,306,000,000\",\"pct_total\":\"0.82\",\"weight\":\"0.3\"}]",
          "weight": 0.55,
          "center": [ 103.81907314582396, 36.561765379252655 ]
        },
        "geometry": {
          "type": "MultiPolygon",
          "coordinates": [ [ [ [ 118.183008, 24.496289 ], [ 118.149512, 24.436133 ], [ 118.090527, 24.446143 ], [ 118.08877, 24.488867 ], [ 118.076758, 24.501416 ], [ 118.092969, 24.541211 ], [ 118.103809, 24.552344 ], [ 118.170703, 24.518506 ], [ 118.183008, 24.496289 ] ] ], [ [ [ 121.862695, 31.492285 ], [ 121.780469, 31.46377 ], [ 121.519922, 31.549609 ], [ 121.336426, 31.64375 ], [ 121.226855, 31.758105 ], [ 121.211133, 31.805371 ], [ 121.338965, 31.797363 ], [ 121.46416, 31.756445 ], [ 121.491797, 31.693652 ], [ 121.542285, 31.673926 ], [ 121.576563, 31.637305 ], [ 121.808301, 31.552148 ], [ 121.843652, 31.526367 ], [ 121.862695, 31.492285 ] ] ], [ [ [ 122.295898, 29.963428 ], [ 122.281543, 29.943848 ], [ 122.157813, 30.00127 ], [ 122.024023, 30.01333 ], [ 121.977832, 30.063818 ], [ 121.969434, 30.143115 ], [ 122.110547, 30.139746 ], [ 122.284473, 30.068018 ], [ 122.322266, 30.031396 ], [ 122.295898, 29.963428 ] ] ], [ [ [ 122.172559, 29.679004 ], [ 122.169043, 29.660254 ], [ 122.083789, 29.725342 ], [ 122.042676, 29.735937 ], [ 122.062305, 29.772754 ], [ 122.119629, 29.782227 ], [ 122.165039, 29.700781 ], [ 122.172559, 29.679004 ] ] ], [ [ [ 122.403906, 29.892383 ], [ 122.394043, 29.846094 ], [ 122.367578, 29.852686 ], [ 122.331836, 29.934961 ], [ 122.350977, 29.955225 ], [ 122.401563, 29.950244 ], [ 122.403906, 29.892383 ] ] ], [ [ [ 119.820898, 25.456982 ], [ 119.74668, 25.410693 ], [ 119.700293, 25.432715 ], [ 119.699414, 25.494727 ], [ 119.723047, 25.550586 ], [ 119.695996, 25.590869 ], [ 119.722559, 25.638818 ], [ 119.77793, 25.653174 ], [ 119.797461, 25.623242 ], [ 119.828711, 25.607373 ], [ 119.838379, 25.591064 ], [ 119.838672, 25.559668 ], [ 119.809082, 25.507813 ], [ 119.832422, 25.47959 ], [ 119.820898, 25.456982 ] ] ], [ [ [ 110.385156, 21.093164 ], [ 110.422363, 21.058594 ], [ 110.521582, 21.083105 ], [ 110.539551, 21.039014 ], [ 110.538867, 21.018457 ], [ 110.503906, 20.967725 ], [ 110.421875, 21.006885 ], [ 110.339941, 20.997754 ], [ 110.280957, 21.001172 ], [ 110.264648, 21.025195 ], [ 110.309863, 21.074756 ], [ 110.385156, 21.093164 ] ] ], [ [ [ 121.251367, 28.086426 ], [ 121.164258, 28.0625 ], [ 121.131543, 28.062598 ], [ 121.133984, 28.135254 ], [ 121.205469, 28.204395 ], [ 121.234375, 28.181299 ], [ 121.250977, 28.145215 ], [ 121.251367, 28.086426 ] ] ], [ [ [ 113.555273, 22.804199 ], [ 113.563672, 22.75791 ], [ 113.485645, 22.82832 ], [ 113.463379, 22.832373 ], [ 113.426074, 22.858594 ], [ 113.404395, 22.902832 ], [ 113.464941, 22.904541 ], [ 113.520508, 22.852051 ], [ 113.555273, 22.804199 ] ] ], [ [ [ 112.790234, 21.601855 ], [ 112.771094, 21.581836 ], [ 112.741992, 21.618066 ], [ 112.733496, 21.669922 ], [ 112.712695, 21.697949 ], [ 112.760547, 21.733252 ], [ 112.782031, 21.772266 ], [ 112.839063, 21.764502 ], [ 112.862598, 21.752637 ], [ 112.812598, 21.712158 ], [ 112.800684, 21.694873 ], [ 112.790234, 21.601855 ] ] ], [ [ [ 112.64375, 21.639648 ], [ 112.545605, 21.618506 ], [ 112.525, 21.623047 ], [ 112.558984, 21.674756 ], [ 112.647656, 21.710254 ], [ 112.64375, 21.639648 ] ] ], [ [ [ 107.972656, 21.507959 ], [ 107.908398, 21.5604 ], [ 107.802051, 21.645166 ], [ 107.759277, 21.655029 ], [ 107.641016, 21.613916 ], [ 107.471387, 21.59834 ], [ 107.433496, 21.642285 ], [ 107.351172, 21.608887 ], [ 107.27207, 21.710645 ], [ 107.178516, 21.71709 ], [ 107.061621, 21.794189 ], [ 107.019824, 21.834863 ], [ 107.006445, 21.893408 ], [ 106.970996, 21.923926 ], [ 106.925195, 21.920117 ], [ 106.874512, 21.95127 ], [ 106.794141, 21.981982 ], [ 106.729492, 22.000342 ], [ 106.697656, 21.986182 ], [ 106.663574, 21.978906 ], [ 106.657715, 22.018213 ], [ 106.660059, 22.136475 ], [ 106.654199, 22.241455 ], [ 106.636523, 22.288623 ], [ 106.593164, 22.324512 ], [ 106.553613, 22.341699 ], [ 106.536328, 22.39541 ], [ 106.550391, 22.501367 ], [ 106.582422, 22.573242 ], [ 106.633105, 22.586035 ], [ 106.701563, 22.637744 ], [ 106.736328, 22.710938 ], [ 106.780273, 22.778906 ], [ 106.624023, 22.874268 ], [ 106.541797, 22.90835 ], [ 106.450879, 22.893896 ], [ 106.338086, 22.863477 ], [ 106.279004, 22.857471 ], [ 106.249414, 22.869434 ], [ 106.183984, 22.955127 ], [ 106.148438, 22.970068 ], [ 106.068457, 22.975537 ], [ 106.000977, 22.974756 ], [ 105.962305, 22.937451 ], [ 105.902637, 22.924951 ], [ 105.842969, 22.922803 ], [ 105.782324, 22.969336 ], [ 105.691211, 23.029932 ], [ 105.548145, 23.072656 ], [ 105.530859, 23.121973 ], [ 105.494531, 23.180859 ], [ 105.440137, 23.235352 ], [ 105.350488, 23.307666 ], [ 105.275391, 23.345215 ], [ 105.23877, 23.322119 ], [ 105.189063, 23.281055 ], [ 104.995703, 23.194336 ], [ 104.910156, 23.160547 ], [ 104.864746, 23.136377 ], [ 104.826563, 23.100195 ], [ 104.814746, 23.010791 ], [ 104.795703, 22.911133 ], [ 104.740039, 22.860498 ], [ 104.687305, 22.822217 ], [ 104.631738, 22.818213 ], [ 104.577539, 22.82002 ], [ 104.526855, 22.804102 ], [ 104.371777, 22.704053 ], [ 104.29834, 22.712012 ], [ 104.238281, 22.768506 ], [ 104.2125, 22.809424 ], [ 104.143066, 22.800146 ], [ 104.053906, 22.752295 ], [ 104.012695, 22.666357 ], [ 103.99082, 22.586133 ], [ 103.971387, 22.550488 ], [ 103.941504, 22.540088 ], [ 103.915039, 22.538232 ], [ 103.637305, 22.77002 ], [ 103.620215, 22.782031 ], [ 103.570703, 22.734424 ], [ 103.525391, 22.611572 ], [ 103.492969, 22.587988 ], [ 103.470996, 22.597412 ], [ 103.356055, 22.754687 ], [ 103.32666, 22.769775 ], [ 103.300586, 22.764404 ], [ 103.266309, 22.713525 ], [ 103.193359, 22.638525 ], [ 103.137598, 22.592969 ], [ 103.136328, 22.542236 ], [ 103.075879, 22.49751 ], [ 103.005371, 22.452979 ], [ 102.981934, 22.448242 ], [ 102.935156, 22.466162 ], [ 102.874219, 22.525391 ], [ 102.830078, 22.587158 ], [ 102.720996, 22.648486 ], [ 102.598535, 22.700391 ], [ 102.517188, 22.741016 ], [ 102.470898, 22.750928 ], [ 102.42793, 22.732813 ], [ 102.406445, 22.708008 ], [ 102.375781, 22.646631 ], [ 102.302246, 22.545996 ], [ 102.237012, 22.466016 ], [ 102.175977, 22.414648 ], [ 102.127441, 22.379199 ], [ 102.091504, 22.412256 ], [ 102.024414, 22.439209 ], [ 101.94541, 22.439404 ], [ 101.841797, 22.388477 ], [ 101.759961, 22.490332 ], [ 101.73877, 22.495264 ], [ 101.70752, 22.486572 ], [ 101.671484, 22.462305 ], [ 101.646191, 22.40542 ], [ 101.619922, 22.327441 ], [ 101.567871, 22.276367 ], [ 101.524512, 22.253662 ], [ 101.537305, 22.209863 ], [ 101.561816, 22.162402 ], [ 101.560254, 22.120898 ], [ 101.575781, 22.055273 ], [ 101.60293, 21.989697 ], [ 101.699609, 21.882471 ], [ 101.736523, 21.826514 ], [ 101.743945, 21.777979 ], [ 101.747266, 21.605762 ], [ 101.743457, 21.533838 ], [ 101.724219, 21.39502 ], [ 101.722949, 21.314941 ], [ 101.763086, 21.278906 ], [ 101.802051, 21.235986 ], [ 101.800586, 21.212598 ], [ 101.783496, 21.20415 ], [ 101.728125, 21.156396 ], [ 101.704785, 21.150146 ], [ 101.668555, 21.169629 ], [ 101.62168, 21.184424 ], [ 101.583887, 21.203564 ], [ 101.542383, 21.234277 ], [ 101.443555, 21.230811 ], [ 101.281445, 21.184131 ], [ 101.247852, 21.197314 ], [ 101.224414, 21.22373 ], [ 101.211816, 21.278223 ], [ 101.219922, 21.342432 ], [ 101.205566, 21.383301 ], [ 101.175391, 21.40752 ], [ 101.19668, 21.52207 ], [ 101.138867, 21.56748 ], [ 101.147266, 21.581641 ], [ 101.128125, 21.705127 ], [ 101.130859, 21.735547 ], [ 101.120703, 21.746094 ], [ 101.079785, 21.755859 ], [ 101.019336, 21.736377 ], [ 100.835156, 21.655176 ], [ 100.677148, 21.504932 ], [ 100.60459, 21.471777 ], [ 100.531348, 21.458105 ], [ 100.445703, 21.484082 ], [ 100.350586, 21.501025 ], [ 100.214746, 21.462988 ], [ 100.147656, 21.480518 ], [ 100.116797, 21.511182 ], [ 100.089258, 21.55791 ], [ 100.105762, 21.617041 ], [ 100.095508, 21.660645 ], [ 100.041211, 21.682764 ], [ 99.978223, 21.701611 ], [ 99.940723, 21.75874 ], [ 99.925586, 21.820801 ], [ 99.94043, 21.901611 ], [ 99.947852, 21.98833 ], [ 99.917676, 22.028027 ], [ 99.825391, 22.049707 ], [ 99.592676, 22.08916 ], [ 99.388672, 22.110791 ], [ 99.303125, 22.100635 ], [ 99.233398, 22.110156 ], [ 99.192969, 22.125977 ], [ 99.173438, 22.15332 ], [ 99.172363, 22.19248 ], [ 99.205371, 22.282568 ], [ 99.243066, 22.370361 ], [ 99.337695, 22.498047 ], [ 99.343164, 22.586523 ], [ 99.338281, 22.688672 ], [ 99.385156, 22.825098 ], [ 99.466797, 22.927295 ], [ 99.507129, 22.959131 ], [ 99.497266, 23.00459 ], [ 99.464551, 23.04624 ], [ 99.418066, 23.069238 ], [ 99.34082, 23.095898 ], [ 99.220313, 23.10332 ], [ 99.055078, 23.130566 ], [ 98.86377, 23.19126 ], [ 98.885547, 23.307471 ], [ 98.882617, 23.380322 ], [ 98.858887, 23.440088 ], [ 98.819727, 23.48252 ], [ 98.797852, 23.52041 ], [ 98.832227, 23.624365 ], [ 98.787695, 23.737842 ], [ 98.735059, 23.783105 ], [ 98.680859, 23.841797 ], [ 98.676758, 23.905078 ], [ 98.701563, 23.964063 ], [ 98.833984, 24.090576 ], [ 98.835059, 24.121191 ], [ 98.802344, 24.118701 ], [ 98.764355, 24.116064 ], [ 98.583398, 24.069824 ], [ 98.56416, 24.098828 ], [ 98.499414, 24.115674 ], [ 98.367285, 24.119043 ], [ 98.2125, 24.110645 ], [ 98.016895, 24.06543 ], [ 97.837695, 23.986279 ], [ 97.755664, 23.931885 ], [ 97.686035, 23.898096 ], [ 97.629687, 23.887158 ], [ 97.564551, 23.911035 ], [ 97.568262, 23.988477 ], [ 97.690625, 24.130811 ], [ 97.708203, 24.22876 ], [ 97.670703, 24.312744 ], [ 97.666602, 24.37998 ], [ 97.623633, 24.422949 ], [ 97.563281, 24.443848 ], [ 97.531445, 24.491699 ], [ 97.529395, 24.631201 ], [ 97.583301, 24.774805 ], [ 97.670703, 24.820117 ], [ 97.723828, 24.841992 ], [ 97.737891, 24.869873 ], [ 97.710742, 24.970361 ], [ 97.714941, 25.034326 ], [ 97.767383, 25.158057 ], [ 97.819531, 25.251855 ], [ 97.917969, 25.236133 ], [ 97.962012, 25.259326 ], [ 98.010742, 25.292529 ], [ 98.064063, 25.348975 ], [ 98.099609, 25.415723 ], [ 98.142871, 25.571094 ], [ 98.172559, 25.594531 ], [ 98.296582, 25.568848 ], [ 98.333789, 25.586768 ], [ 98.40166, 25.677979 ], [ 98.465527, 25.788867 ], [ 98.558398, 25.823242 ], [ 98.625391, 25.826709 ], [ 98.65625, 25.863574 ], [ 98.654688, 25.917773 ], [ 98.591016, 26.003711 ], [ 98.564063, 26.072412 ], [ 98.571973, 26.114062 ], [ 98.663184, 26.139453 ], [ 98.685547, 26.189355 ], [ 98.671875, 26.298535 ], [ 98.709473, 26.429688 ], [ 98.731836, 26.583398 ], [ 98.739355, 26.698145 ], [ 98.738477, 26.785742 ], [ 98.729492, 26.877393 ], [ 98.716504, 27.044922 ], [ 98.674805, 27.190625 ], [ 98.682422, 27.245313 ], [ 98.676758, 27.421924 ], [ 98.651172, 27.572461 ], [ 98.599805, 27.598828 ], [ 98.504492, 27.647656 ], [ 98.452539, 27.657227 ], [ 98.408887, 27.639453 ], [ 98.392383, 27.587061 ], [ 98.350488, 27.538086 ], [ 98.298828, 27.550098 ], [ 98.274219, 27.599072 ], [ 98.241016, 27.663184 ], [ 98.130469, 27.967578 ], [ 98.118359, 28.055225 ], [ 98.098926, 28.142285 ], [ 98.061621, 28.185889 ], [ 98.022266, 28.211523 ], [ 97.934082, 28.313818 ], [ 97.887598, 28.356494 ], [ 97.864941, 28.363574 ], [ 97.816504, 28.356348 ], [ 97.769043, 28.356152 ], [ 97.730078, 28.407129 ], [ 97.694629, 28.469336 ], [ 97.658887, 28.5 ], [ 97.599219, 28.517041 ], [ 97.537891, 28.510205 ], [ 97.502148, 28.456348 ], [ 97.477734, 28.425635 ], [ 97.431445, 28.353906 ], [ 97.356445, 28.254492 ], [ 97.322461, 28.217969 ], [ 97.289453, 28.236816 ], [ 97.145117, 28.340332 ], [ 97.075391, 28.368945 ], [ 96.980859, 28.337695 ], [ 96.833008, 28.362402 ], [ 96.775781, 28.367041 ], [ 96.652832, 28.449756 ], [ 96.602637, 28.459912 ], [ 96.427734, 28.406006 ], [ 96.389063, 28.36792 ], [ 96.366406, 28.367285 ], [ 96.319824, 28.386523 ], [ 96.281445, 28.412061 ], [ 96.278906, 28.428174 ], [ 96.326172, 28.468555 ], [ 96.329883, 28.496826 ], [ 96.327344, 28.525391 ], [ 96.395605, 28.606543 ], [ 96.580859, 28.763672 ], [ 96.55, 28.82959 ], [ 96.477148, 28.959326 ], [ 96.46709, 29.022266 ], [ 96.435742, 29.050684 ], [ 96.346875, 29.027441 ], [ 96.162207, 28.909717 ], [ 96.137109, 28.922607 ], [ 96.141406, 28.963477 ], [ 96.122363, 29.08208 ], [ 96.180859, 29.117676 ], [ 96.270508, 29.16123 ], [ 96.339746, 29.209814 ], [ 96.355859, 29.249072 ], [ 96.337207, 29.260986 ], [ 96.234961, 29.245801 ], [ 96.194727, 29.272461 ], [ 96.128516, 29.381396 ], [ 96.07959, 29.424121 ], [ 96.035352, 29.447168 ], [ 95.885059, 29.390918 ], [ 95.710352, 29.313818 ], [ 95.51582, 29.206348 ], [ 95.516992, 29.151172 ], [ 95.49375, 29.137012 ], [ 95.456543, 29.102295 ], [ 95.420215, 29.054297 ], [ 95.389258, 29.037402 ], [ 95.353125, 29.035889 ], [ 95.279102, 29.049561 ], [ 95.144727, 29.104053 ], [ 94.998828, 29.14917 ], [ 94.96748, 29.144043 ], [ 94.769434, 29.175879 ], [ 94.763086, 29.20127 ], [ 94.733398, 29.251611 ], [ 94.677051, 29.297021 ], [ 94.623047, 29.312402 ], [ 94.468066, 29.216211 ], [ 94.293262, 29.144629 ], [ 94.193457, 29.059912 ], [ 94.111523, 28.975879 ], [ 94.017676, 28.959521 ], [ 94.013281, 28.90752 ], [ 93.973633, 28.860791 ], [ 93.902246, 28.803223 ], [ 93.760742, 28.729785 ], [ 93.664941, 28.690234 ], [ 93.360547, 28.654053 ], [ 93.251953, 28.629492 ], [ 93.206543, 28.59082 ], [ 93.157813, 28.492725 ], [ 93.119238, 28.402295 ], [ 93.034961, 28.327637 ], [ 92.881836, 28.228125 ], [ 92.701855, 28.147119 ], [ 92.652539, 28.093359 ], [ 92.643457, 28.061523 ], [ 92.665625, 28.049854 ], [ 92.6875, 28.025732 ], [ 92.687793, 27.988965 ], [ 92.664355, 27.948926 ], [ 92.54668, 27.879199 ], [ 92.480664, 27.845947 ], [ 92.414844, 27.824609 ], [ 92.341016, 27.820752 ], [ 92.270117, 27.830225 ], [ 92.250488, 27.841504 ], [ 92.222266, 27.826953 ], [ 92.157617, 27.812256 ], [ 92.10127, 27.807617 ], [ 91.977637, 27.730371 ], [ 91.909375, 27.729688 ], [ 91.824707, 27.746436 ], [ 91.712598, 27.759814 ], [ 91.631934, 27.759961 ], [ 91.629395, 27.800879 ], [ 91.641895, 27.923242 ], [ 91.605566, 27.951709 ], [ 91.493359, 27.981787 ], [ 91.367578, 28.021631 ], [ 91.306836, 28.064014 ], [ 91.273047, 28.078369 ], [ 91.225879, 28.07124 ], [ 91.149902, 28.026758 ], [ 91.077734, 27.974463 ], [ 91.020801, 27.970068 ], [ 90.9625, 27.99458 ], [ 90.906641, 28.026514 ], [ 90.715723, 28.071729 ], [ 90.630078, 28.078564 ], [ 90.477344, 28.07085 ], [ 90.352734, 28.080225 ], [ 90.333105, 28.093994 ], [ 90.333789, 28.119141 ], [ 90.352148, 28.168164 ], [ 90.362988, 28.216504 ], [ 90.348242, 28.243945 ], [ 90.220801, 28.277734 ], [ 90.104492, 28.302051 ], [ 89.981055, 28.311182 ], [ 89.897852, 28.294141 ], [ 89.816895, 28.256299 ], [ 89.749805, 28.188184 ], [ 89.652734, 28.158301 ], [ 89.536914, 28.107422 ], [ 89.480664, 28.059961 ], [ 89.395898, 27.958154 ], [ 89.272656, 27.833154 ], [ 89.160449, 27.711279 ], [ 89.102344, 27.592578 ], [ 89.025488, 27.517871 ], [ 88.947559, 27.464014 ], [ 88.891406, 27.316064 ], [ 88.83252, 27.362842 ], [ 88.764844, 27.429883 ], [ 88.749023, 27.521875 ], [ 88.829883, 27.767383 ], [ 88.848828, 27.868652 ], [ 88.828613, 27.907275 ], [ 88.803711, 28.006934 ], [ 88.75625, 28.039697 ], [ 88.621094, 28.091846 ], [ 88.57793, 28.093359 ], [ 88.531641, 28.057373 ], [ 88.486133, 28.034473 ], [ 88.425977, 28.01167 ], [ 88.275195, 27.968848 ], [ 88.141113, 27.948926 ], [ 88.108984, 27.933008 ], [ 88.098926, 27.904541 ], [ 88.109766, 27.870605 ], [ 88.02334, 27.883398 ], [ 87.933398, 27.89082 ], [ 87.860742, 27.886084 ], [ 87.682715, 27.821387 ], [ 87.622559, 27.815186 ], [ 87.555273, 27.821826 ], [ 87.46416, 27.823828 ], [ 87.290723, 27.821924 ], [ 87.141406, 27.83833 ], [ 87.020117, 27.928662 ], [ 86.933789, 27.968457 ], [ 86.842383, 27.99917 ], [ 86.750391, 28.02207 ], [ 86.719629, 28.070654 ], [ 86.690527, 28.094922 ], [ 86.614453, 28.103027 ], [ 86.554492, 28.085205 ], [ 86.516895, 27.963525 ], [ 86.484961, 27.939551 ], [ 86.408691, 27.928662 ], [ 86.328613, 27.959521 ], [ 86.217969, 28.02207 ], [ 86.174219, 28.091699 ], [ 86.137012, 28.114355 ], [ 86.078711, 28.083594 ], [ 86.075488, 27.99458 ], [ 86.06416, 27.934717 ], [ 85.994531, 27.9104 ], [ 85.954102, 27.928223 ], [ 85.92168, 27.989697 ], [ 85.840234, 28.135352 ], [ 85.759473, 28.220654 ], [ 85.67832, 28.277441 ], [ 85.410645, 28.276025 ], [ 85.212109, 28.292627 ], [ 85.122461, 28.315967 ], [ 85.088574, 28.372266 ], [ 85.121484, 28.484277 ], [ 85.160156, 28.571875 ], [ 85.159082, 28.592236 ], [ 85.126367, 28.602637 ], [ 85.069141, 28.609668 ], [ 84.855078, 28.553613 ], [ 84.796875, 28.560205 ], [ 84.759375, 28.579248 ], [ 84.714258, 28.595557 ], [ 84.676758, 28.621533 ], [ 84.650586, 28.65957 ], [ 84.46543, 28.75293 ], [ 84.410742, 28.803906 ], [ 84.312109, 28.868115 ], [ 84.228711, 28.911768 ], [ 84.175586, 29.036377 ], [ 84.127832, 29.156299 ], [ 84.101367, 29.219971 ], [ 84.021973, 29.253857 ], [ 83.935938, 29.279492 ], [ 83.79043, 29.227441 ], [ 83.671094, 29.187598 ], [ 83.583496, 29.183594 ], [ 83.456641, 29.306348 ], [ 83.355176, 29.43916 ], [ 83.235156, 29.55459 ], [ 83.155469, 29.612646 ], [ 83.013965, 29.618066 ], [ 82.854297, 29.683398 ], [ 82.64082, 29.831201 ], [ 82.486523, 29.941504 ], [ 82.220703, 30.063867 ], [ 82.158984, 30.115186 ], [ 82.135352, 30.158984 ], [ 82.098926, 30.245068 ], [ 82.043359, 30.326758 ], [ 81.854883, 30.362402 ], [ 81.641895, 30.3875 ], [ 81.417188, 30.337598 ], [ 81.255078, 30.093311 ], [ 81.177148, 30.039893 ], [ 81.110352, 30.036816 ], [ 81.055566, 30.098975 ], [ 81.010254, 30.164502 ], [ 80.985449, 30.237109 ], [ 80.873535, 30.290576 ], [ 80.746777, 30.3604 ], [ 80.682129, 30.414844 ], [ 80.608887, 30.448877 ], [ 80.541016, 30.463525 ], [ 80.40957, 30.509473 ], [ 80.260938, 30.561328 ], [ 80.191211, 30.568408 ], [ 80.18623, 30.605322 ], [ 80.207129, 30.68374 ], [ 80.194336, 30.759229 ], [ 80.149414, 30.789844 ], [ 80.081445, 30.781934 ], [ 79.924512, 30.88877 ], [ 79.918555, 30.889893 ], [ 79.916602, 30.894189 ], [ 79.871875, 30.924609 ], [ 79.794629, 30.968262 ], [ 79.664258, 30.965234 ], [ 79.56543, 30.949072 ], [ 79.493164, 30.993701 ], [ 79.388477, 31.064209 ], [ 79.369629, 31.079932 ], [ 79.33877, 31.105713 ], [ 79.232617, 31.241748 ], [ 79.107129, 31.402637 ], [ 79.04375, 31.426221 ], [ 79.011133, 31.414111 ], [ 78.973926, 31.328613 ], [ 78.945996, 31.337207 ], [ 78.899512, 31.331348 ], [ 78.844531, 31.301514 ], [ 78.791602, 31.293652 ], [ 78.757813, 31.30249 ], [ 78.743555, 31.323779 ], [ 78.758594, 31.436572 ], [ 78.726758, 31.471826 ], [ 78.755078, 31.550293 ], [ 78.80293, 31.618066 ], [ 78.753906, 31.668359 ], [ 78.693457, 31.740381 ], [ 78.687012, 31.805518 ], [ 78.719727, 31.887646 ], [ 78.735449, 31.957959 ], [ 78.725586, 31.983789 ], [ 78.677734, 32.023047 ], [ 78.495898, 32.215771 ], [ 78.486133, 32.23623 ], [ 78.455273, 32.300342 ], [ 78.441309, 32.397363 ], [ 78.41748, 32.466699 ], [ 78.389648, 32.519873 ], [ 78.391699, 32.544727 ], [ 78.4125, 32.557715 ], [ 78.526367, 32.570801 ], [ 78.631543, 32.578955 ], [ 78.700879, 32.597021 ], [ 78.736719, 32.558398 ], [ 78.753516, 32.499268 ], [ 78.771289, 32.468066 ], [ 78.837891, 32.411963 ], [ 78.918945, 32.358203 ], [ 78.997656, 32.365137 ], [ 79.066992, 32.388184 ], [ 79.127344, 32.475781 ], [ 79.169922, 32.497217 ], [ 79.219336, 32.501074 ], [ 79.219043, 32.507568 ], [ 79.216504, 32.564014 ], [ 79.233887, 32.703076 ], [ 79.22793, 32.758789 ], [ 79.205566, 32.809033 ], [ 79.20957, 32.864844 ], [ 79.202246, 32.946045 ], [ 79.145508, 33.001465 ], [ 79.108594, 33.022656 ], [ 79.102832, 33.052539 ], [ 79.12168, 33.108105 ], [ 79.135156, 33.171924 ], [ 79.1125, 33.22627 ], [ 79.066504, 33.250391 ], [ 79.012598, 33.291455 ], [ 78.948438, 33.346533 ], [ 78.916699, 33.386768 ], [ 78.865039, 33.431104 ], [ 78.801855, 33.499707 ], [ 78.789941, 33.650342 ], [ 78.783789, 33.808789 ], [ 78.761719, 33.887598 ], [ 78.72666, 34.013379 ], [ 78.731738, 34.055566 ], [ 78.753027, 34.087695 ], [ 78.931738, 34.188965 ], [ 78.970605, 34.228223 ], [ 78.976953, 34.258105 ], [ 78.970117, 34.302637 ], [ 78.936426, 34.351953 ], [ 78.864844, 34.390332 ], [ 78.763086, 34.45293 ], [ 78.670801, 34.518164 ], [ 78.515723, 34.557959 ], [ 78.326953, 34.606396 ], [ 78.282031, 34.653906 ], [ 78.236133, 34.769824 ], [ 78.158496, 34.946484 ], [ 78.075781, 35.134912 ], [ 78.012207, 35.251025 ], [ 78.00918, 35.306934 ], [ 78.047461, 35.449414 ], [ 78.042676, 35.479785 ], [ 78.009473, 35.490234 ], [ 77.945898, 35.471631 ], [ 77.894922, 35.449023 ], [ 77.851563, 35.460791 ], [ 77.810938, 35.484521 ], [ 77.802539, 35.492773 ], [ 77.799414, 35.495898 ], [ 77.724023, 35.480566 ], [ 77.572559, 35.471826 ], [ 77.52002, 35.473438 ], [ 77.446484, 35.475586 ], [ 77.294824, 35.508154 ], [ 77.090039, 35.552051 ], [ 76.878906, 35.613281 ], [ 76.766895, 35.661719 ], [ 76.727539, 35.678662 ], [ 76.631836, 35.729395 ], [ 76.563477, 35.772998 ], [ 76.55127, 35.887061 ], [ 76.502051, 35.878223 ], [ 76.385742, 35.837158 ], [ 76.25166, 35.810938 ], [ 76.177832, 35.810547 ], [ 76.147852, 35.829004 ], [ 76.10332, 35.949219 ], [ 76.070898, 35.983008 ], [ 76.010449, 35.996338 ], [ 75.945117, 36.017578 ], [ 75.912305, 36.048975 ], [ 75.904883, 36.088477 ], [ 75.934082, 36.133936 ], [ 75.968652, 36.168848 ], [ 75.974414, 36.382422 ], [ 75.951855, 36.458105 ], [ 75.933008, 36.521582 ], [ 75.884961, 36.600732 ], [ 75.840234, 36.649707 ], [ 75.772168, 36.694922 ], [ 75.667188, 36.741992 ], [ 75.57373, 36.759326 ], [ 75.460254, 36.725049 ], [ 75.424219, 36.738232 ], [ 75.376855, 36.883691 ], [ 75.34668, 36.913477 ], [ 75.145215, 36.973242 ], [ 75.053906, 36.987158 ], [ 74.949121, 36.968359 ], [ 74.889258, 36.952441 ], [ 74.841211, 36.979102 ], [ 74.766016, 37.012744 ], [ 74.692188, 37.035742 ], [ 74.600586, 37.03667 ], [ 74.541406, 37.022168 ], [ 74.526465, 37.030664 ], [ 74.497949, 37.057227 ], [ 74.376172, 37.137354 ], [ 74.372168, 37.157715 ], [ 74.558984, 37.236621 ], [ 74.668945, 37.266699 ], [ 74.72666, 37.290723 ], [ 74.738965, 37.285645 ], [ 74.767383, 37.24917 ], [ 74.840234, 37.225049 ], [ 74.891309, 37.231641 ], [ 74.918164, 37.25 ], [ 75.008398, 37.293555 ], [ 75.079004, 37.344043 ], [ 75.11875, 37.385693 ], [ 75.097461, 37.45127 ], [ 74.986426, 37.530371 ], [ 74.91582, 37.572803 ], [ 74.894238, 37.601416 ], [ 74.912305, 37.687305 ], [ 74.938281, 37.77251 ], [ 74.921289, 37.80498 ], [ 74.900293, 37.832715 ], [ 74.89082, 37.925781 ], [ 74.84248, 38.038086 ], [ 74.789648, 38.103613 ], [ 74.775098, 38.191895 ], [ 74.77207, 38.274756 ], [ 74.835938, 38.404297 ], [ 74.812305, 38.460303 ], [ 74.74502, 38.51001 ], [ 74.514063, 38.6 ], [ 74.277441, 38.659766 ], [ 74.187305, 38.65752 ], [ 74.131348, 38.661182 ], [ 74.065332, 38.608496 ], [ 74.025586, 38.539844 ], [ 73.97002, 38.533691 ], [ 73.869141, 38.562891 ], [ 73.80166, 38.606885 ], [ 73.754102, 38.698926 ], [ 73.716797, 38.817236 ], [ 73.696094, 38.854297 ], [ 73.706836, 38.88623 ], [ 73.72998, 38.914697 ], [ 73.794531, 38.941309 ], [ 73.805273, 38.968652 ], [ 73.795605, 39.002148 ], [ 73.74375, 39.044531 ], [ 73.69043, 39.104541 ], [ 73.607324, 39.229199 ], [ 73.623145, 39.297852 ], [ 73.636328, 39.39668 ], [ 73.631641, 39.448877 ], [ 73.715723, 39.462256 ], [ 73.822949, 39.488965 ], [ 73.872754, 39.533301 ], [ 73.907129, 39.578516 ], [ 73.914648, 39.606494 ], [ 73.88252, 39.714551 ], [ 73.839746, 39.762842 ], [ 73.835352, 39.800146 ], [ 73.85625, 39.828662 ], [ 73.88457, 39.87793 ], [ 73.93877, 39.978809 ], [ 73.991602, 40.043115 ], [ 74.020508, 40.059375 ], [ 74.085156, 40.074316 ], [ 74.242676, 40.092041 ], [ 74.411914, 40.137207 ], [ 74.613086, 40.272168 ], [ 74.679883, 40.310596 ], [ 74.767773, 40.329883 ], [ 74.830469, 40.328516 ], [ 74.841797, 40.344971 ], [ 74.80127, 40.428516 ], [ 74.811133, 40.458789 ], [ 74.835156, 40.482617 ], [ 74.865625, 40.493506 ], [ 75.004492, 40.449512 ], [ 75.111328, 40.454102 ], [ 75.241016, 40.480273 ], [ 75.520801, 40.627539 ], [ 75.555566, 40.625195 ], [ 75.583496, 40.605322 ], [ 75.617383, 40.516602 ], [ 75.655957, 40.329248 ], [ 75.677148, 40.305811 ], [ 75.871973, 40.303223 ], [ 76.004297, 40.371436 ], [ 76.062305, 40.387549 ], [ 76.156641, 40.376465 ], [ 76.206055, 40.408398 ], [ 76.258301, 40.430762 ], [ 76.318555, 40.352246 ], [ 76.396387, 40.389795 ], [ 76.480176, 40.449512 ], [ 76.520898, 40.51123 ], [ 76.57793, 40.577881 ], [ 76.622168, 40.662354 ], [ 76.639844, 40.742236 ], [ 76.661133, 40.779639 ], [ 76.708398, 40.818115 ], [ 76.824023, 40.982324 ], [ 76.907715, 41.02417 ], [ 76.986621, 41.03916 ], [ 77.182031, 41.010742 ], [ 77.283984, 41.014355 ], [ 77.581738, 40.992773 ], [ 77.719336, 41.024316 ], [ 77.815234, 41.055615 ], [ 77.956445, 41.050684 ], [ 78.123438, 41.075635 ], [ 78.346289, 41.281445 ], [ 78.348828, 41.325195 ], [ 78.362402, 41.371631 ], [ 78.442871, 41.417529 ], [ 78.543164, 41.45957 ], [ 78.742578, 41.560059 ], [ 79.148438, 41.719141 ], [ 79.293555, 41.782812 ], [ 79.354395, 41.781055 ], [ 79.503906, 41.820996 ], [ 79.766113, 41.898877 ], [ 79.84043, 41.995752 ], [ 79.909668, 42.01499 ], [ 80.216211, 42.032422 ], [ 80.235156, 42.043457 ], [ 80.246191, 42.059814 ], [ 80.229199, 42.129834 ], [ 80.209375, 42.190039 ], [ 80.233008, 42.207813 ], [ 80.259082, 42.2354 ], [ 80.255078, 42.27417 ], [ 80.205762, 42.399414 ], [ 80.179297, 42.518359 ], [ 80.161914, 42.625537 ], [ 80.165039, 42.665527 ], [ 80.202246, 42.734473 ], [ 80.250293, 42.797266 ], [ 80.424023, 42.855762 ], [ 80.538965, 42.873486 ], [ 80.54375, 42.911719 ], [ 80.450684, 42.935547 ], [ 80.383398, 42.973779 ], [ 80.371289, 42.995605 ], [ 80.374512, 43.02041 ], [ 80.390234, 43.043115 ], [ 80.507031, 43.085791 ], [ 80.616992, 43.128271 ], [ 80.751172, 43.10249 ], [ 80.777734, 43.118945 ], [ 80.785742, 43.161572 ], [ 80.757031, 43.204346 ], [ 80.729785, 43.274268 ], [ 80.667773, 43.310059 ], [ 80.66543, 43.352979 ], [ 80.703809, 43.427051 ], [ 80.650781, 43.56416 ], [ 80.593457, 43.685107 ], [ 80.495996, 43.89209 ], [ 80.431543, 43.951758 ], [ 80.395801, 44.047168 ], [ 80.355273, 44.097266 ], [ 80.358984, 44.171289 ], [ 80.365332, 44.223291 ], [ 80.354883, 44.326514 ], [ 80.336328, 44.438379 ], [ 80.355078, 44.552002 ], [ 80.391016, 44.626807 ], [ 80.381445, 44.65542 ], [ 80.400586, 44.676904 ], [ 80.455469, 44.684082 ], [ 80.481543, 44.714648 ], [ 80.455469, 44.746094 ], [ 80.36084, 44.770313 ], [ 80.255078, 44.808105 ], [ 80.127832, 44.80376 ], [ 79.997168, 44.797217 ], [ 79.932129, 44.825195 ], [ 79.875293, 44.86084 ], [ 79.871875, 44.883789 ], [ 79.950195, 44.944092 ], [ 80.05918, 45.006445 ], [ 80.228223, 45.033984 ], [ 80.414941, 45.075098 ], [ 80.50918, 45.10498 ], [ 80.634766, 45.126514 ], [ 80.780078, 45.135547 ], [ 80.85332, 45.129297 ], [ 81.040332, 45.169141 ], [ 81.334766, 45.246191 ], [ 81.602051, 45.31084 ], [ 81.691992, 45.349365 ], [ 81.758887, 45.31084 ], [ 81.789648, 45.226025 ], [ 81.86748, 45.18208 ], [ 81.944922, 45.16084 ], [ 81.989258, 45.161865 ], [ 82.122754, 45.194873 ], [ 82.266602, 45.219092 ], [ 82.323438, 45.205859 ], [ 82.39668, 45.162451 ], [ 82.478711, 45.123584 ], [ 82.521484, 45.125488 ], [ 82.558984, 45.15542 ], [ 82.596973, 45.215967 ], [ 82.621094, 45.293115 ], [ 82.625781, 45.374414 ], [ 82.611621, 45.424268 ], [ 82.58252, 45.442578 ], [ 82.45166, 45.471973 ], [ 82.32666, 45.519922 ], [ 82.312207, 45.563721 ], [ 82.315234, 45.594922 ], [ 82.348145, 45.671533 ], [ 82.429688, 45.811914 ], [ 82.511719, 46.005811 ], [ 82.555078, 46.158691 ], [ 82.692187, 46.38667 ], [ 82.8, 46.624463 ], [ 82.974902, 46.966016 ], [ 83.004102, 47.033496 ], [ 83.020117, 47.141455 ], [ 83.029492, 47.185938 ], [ 83.090332, 47.209375 ], [ 83.193066, 47.186572 ], [ 83.443555, 47.108643 ], [ 83.634082, 47.043213 ], [ 83.713965, 47.021045 ], [ 83.832617, 46.997852 ], [ 84.016016, 46.970508 ], [ 84.12207, 46.978613 ], [ 84.215137, 46.994727 ], [ 84.338867, 46.996143 ], [ 84.532422, 46.975781 ], [ 84.592285, 46.974951 ], [ 84.666602, 46.972363 ], [ 84.719531, 46.939355 ], [ 84.745996, 46.864355 ], [ 84.786133, 46.830713 ], [ 84.858203, 46.843164 ], [ 85.012207, 46.909229 ], [ 85.110547, 46.96123 ], [ 85.233496, 47.036377 ], [ 85.355371, 47.046729 ], [ 85.484766, 47.063525 ], [ 85.529688, 47.100781 ], [ 85.577246, 47.188477 ], [ 85.656641, 47.254639 ], [ 85.669824, 47.338379 ], [ 85.641797, 47.397412 ], [ 85.586621, 47.493652 ], [ 85.588281, 47.558496 ], [ 85.561621, 47.746484 ], [ 85.525977, 47.915625 ], [ 85.562305, 48.051855 ], [ 85.626367, 48.204004 ], [ 85.651563, 48.250537 ], [ 85.692187, 48.311816 ], [ 85.749414, 48.385059 ], [ 85.829883, 48.408057 ], [ 86.056152, 48.42373 ], [ 86.265625, 48.454541 ], [ 86.372559, 48.48623 ], [ 86.483301, 48.505371 ], [ 86.549414, 48.528613 ], [ 86.66377, 48.635547 ], [ 86.717969, 48.697168 ], [ 86.757813, 48.860742 ], [ 86.728613, 48.939355 ], [ 86.753125, 49.008838 ], [ 86.808301, 49.049707 ], [ 86.885938, 49.090576 ], [ 86.937988, 49.097559 ], [ 87.048535, 49.109912 ], [ 87.22998, 49.105859 ], [ 87.322852, 49.085791 ], [ 87.416699, 49.076611 ], [ 87.476172, 49.091455 ], [ 87.51582, 49.122412 ], [ 87.576563, 49.132373 ], [ 87.668359, 49.147217 ], [ 87.7625, 49.16582 ], [ 87.814258, 49.162305 ], [ 87.825195, 49.116309 ], [ 87.816309, 49.080273 ], [ 87.834668, 49.031934 ], [ 87.872168, 49.000146 ], [ 87.859863, 48.965527 ], [ 87.806836, 48.945508 ], [ 87.754687, 48.918555 ], [ 87.743164, 48.881641 ], [ 87.80918, 48.835742 ], [ 87.831836, 48.79165 ], [ 87.942187, 48.765283 ], [ 88.02793, 48.735596 ], [ 88.060059, 48.707178 ], [ 88.050195, 48.675049 ], [ 88.010645, 48.64043 ], [ 87.972266, 48.60332 ], [ 87.967383, 48.581055 ], [ 87.979688, 48.555127 ], [ 88.062598, 48.537842 ], [ 88.158203, 48.509082 ], [ 88.309961, 48.47207 ], [ 88.413965, 48.403418 ], [ 88.51709, 48.384473 ], [ 88.566797, 48.317432 ], [ 88.575977, 48.220166 ], [ 88.681836, 48.170557 ], [ 88.838281, 48.101709 ], [ 88.917773, 48.089014 ], [ 88.971094, 48.049951 ], [ 89.047656, 48.002539 ], [ 89.115625, 47.987695 ], [ 89.196289, 47.980908 ], [ 89.329883, 48.024854 ], [ 89.479199, 48.029053 ], [ 89.560938, 48.003955 ], [ 89.638477, 47.909082 ], [ 89.693164, 47.87915 ], [ 89.725586, 47.85249 ], [ 89.778125, 47.827002 ], [ 89.831348, 47.823291 ], [ 89.910449, 47.844336 ], [ 89.958691, 47.886328 ], [ 90.02793, 47.877686 ], [ 90.053906, 47.850488 ], [ 90.066602, 47.803564 ], [ 90.103223, 47.74541 ], [ 90.191016, 47.7021 ], [ 90.313281, 47.676172 ], [ 90.330664, 47.655176 ], [ 90.347461, 47.596973 ], [ 90.380664, 47.556641 ], [ 90.425195, 47.504102 ], [ 90.46748, 47.408154 ], [ 90.476465, 47.328809 ], [ 90.496191, 47.285156 ], [ 90.55293, 47.214014 ], [ 90.643359, 47.100293 ], [ 90.715527, 47.003857 ], [ 90.799023, 46.985156 ], [ 90.869922, 46.954492 ], [ 90.910547, 46.883252 ], [ 90.985742, 46.749023 ], [ 90.997852, 46.661084 ], [ 91.004297, 46.595752 ], [ 91.028906, 46.566064 ], [ 91.033887, 46.529004 ], [ 90.971484, 46.387988 ], [ 90.918262, 46.324268 ], [ 90.911523, 46.270654 ], [ 90.947559, 46.177295 ], [ 90.996777, 46.10498 ], [ 91.001758, 46.035791 ], [ 90.959766, 45.985059 ], [ 90.887109, 45.921631 ], [ 90.852441, 45.8854 ], [ 90.795898, 45.853516 ], [ 90.709668, 45.730811 ], [ 90.670703, 45.595166 ], [ 90.661816, 45.525244 ], [ 90.694434, 45.474658 ], [ 90.749609, 45.418945 ], [ 90.763184, 45.370654 ], [ 90.853223, 45.262891 ], [ 90.877246, 45.196094 ], [ 90.913965, 45.193945 ], [ 90.953613, 45.215918 ], [ 91.05, 45.217432 ], [ 91.137695, 45.193945 ], [ 91.221777, 45.144531 ], [ 91.312109, 45.118115 ], [ 91.441016, 45.124756 ], [ 91.510059, 45.098242 ], [ 91.584375, 45.076514 ], [ 91.737793, 45.068945 ], [ 91.852832, 45.069336 ], [ 92.029785, 45.068506 ], [ 92.172656, 45.035254 ], [ 92.423828, 45.008936 ], [ 92.578906, 45.010986 ], [ 92.787891, 45.035742 ], [ 92.916016, 45.020166 ], [ 93.294336, 44.983154 ], [ 93.516211, 44.944482 ], [ 93.656445, 44.900977 ], [ 93.755273, 44.831934 ], [ 93.868164, 44.724219 ], [ 93.95791, 44.674951 ], [ 94.199316, 44.645166 ], [ 94.364746, 44.519482 ], [ 94.494336, 44.47251 ], [ 94.712012, 44.35083 ], [ 94.866016, 44.30332 ], [ 95.049805, 44.259424 ], [ 95.350293, 44.278076 ], [ 95.366797, 44.261523 ], [ 95.343652, 44.19541 ], [ 95.325586, 44.104883 ], [ 95.325586, 44.039355 ], [ 95.356445, 44.005957 ], [ 95.471289, 43.986182 ], [ 95.525586, 43.953955 ], [ 95.567187, 43.892236 ], [ 95.591211, 43.853613 ], [ 95.687305, 43.664063 ], [ 95.841992, 43.383691 ], [ 95.85957, 43.275977 ], [ 95.9125, 43.206494 ], [ 96.080273, 43.096143 ], [ 96.168457, 43.014502 ], [ 96.299512, 42.928711 ], [ 96.34248, 42.849316 ], [ 96.352344, 42.746777 ], [ 96.385449, 42.720361 ], [ 96.625293, 42.743848 ], [ 96.833008, 42.760254 ], [ 97.205664, 42.789795 ], [ 97.718945, 42.736279 ], [ 98.248242, 42.684521 ], [ 98.716309, 42.638721 ], [ 98.946875, 42.616211 ], [ 99.467871, 42.568213 ], [ 99.757422, 42.629443 ], [ 99.983789, 42.677344 ], [ 100.086328, 42.670752 ], [ 100.519043, 42.616797 ], [ 100.772559, 42.587793 ], [ 101.091992, 42.551318 ], [ 101.31377, 42.537891 ], [ 101.495313, 42.53877 ], [ 101.579102, 42.523535 ], [ 101.659961, 42.500049 ], [ 101.713867, 42.46582 ], [ 101.879883, 42.292334 ], [ 101.972949, 42.215869 ], [ 102.156641, 42.158105 ], [ 102.575195, 42.09209 ], [ 102.806836, 42.052002 ], [ 103.072852, 42.005957 ], [ 103.247852, 41.936572 ], [ 103.449707, 41.855859 ], [ 103.711133, 41.751318 ], [ 103.997266, 41.796973 ], [ 104.305176, 41.846143 ], [ 104.498242, 41.877002 ], [ 104.498242, 41.658691 ], [ 104.773633, 41.641162 ], [ 104.860352, 41.64375 ], [ 104.982031, 41.595508 ], [ 105.050586, 41.615918 ], [ 105.11543, 41.663281 ], [ 105.19707, 41.738037 ], [ 105.314355, 41.770898 ], [ 105.51709, 41.854736 ], [ 105.566406, 41.875098 ], [ 105.867578, 41.993994 ], [ 106.317187, 42.140576 ], [ 106.51875, 42.211572 ], [ 106.579102, 42.227344 ], [ 106.693164, 42.263574 ], [ 106.77002, 42.288721 ], [ 106.906055, 42.308887 ], [ 107.090723, 42.321533 ], [ 107.292383, 42.349268 ], [ 107.74873, 42.400977 ], [ 107.805957, 42.405859 ], [ 108.062305, 42.427197 ], [ 108.171191, 42.447314 ], [ 108.333984, 42.436768 ], [ 108.546484, 42.429297 ], [ 108.687305, 42.416113 ], [ 108.874512, 42.426465 ], [ 109.131641, 42.440576 ], [ 109.339844, 42.438379 ], [ 109.443164, 42.455957 ], [ 109.595508, 42.510547 ], [ 109.698047, 42.553809 ], [ 109.858789, 42.60625 ], [ 110.058008, 42.660596 ], [ 110.196875, 42.71001 ], [ 110.288867, 42.742725 ], [ 110.400391, 42.773682 ], [ 110.42959, 42.813574 ], [ 110.461719, 42.844141 ], [ 110.520898, 42.895264 ], [ 110.627539, 42.990527 ], [ 110.708594, 43.073877 ], [ 110.748535, 43.110791 ], [ 110.839551, 43.194092 ], [ 110.913281, 43.256885 ], [ 111.007227, 43.341406 ], [ 111.086523, 43.36875 ], [ 111.186816, 43.391992 ], [ 111.451074, 43.474902 ], [ 111.503516, 43.492773 ], [ 111.547363, 43.496289 ], [ 111.64082, 43.563184 ], [ 111.719727, 43.621143 ], [ 111.771094, 43.6646 ], [ 111.878125, 43.680176 ], [ 111.933203, 43.711426 ], [ 111.942871, 43.752441 ], [ 111.931738, 43.814941 ], [ 111.880273, 43.878906 ], [ 111.836914, 43.934668 ], [ 111.683789, 44.041113 ], [ 111.602637, 44.107129 ], [ 111.519727, 44.191895 ], [ 111.48623, 44.271631 ], [ 111.42959, 44.322363 ], [ 111.402246, 44.367285 ], [ 111.410937, 44.419189 ], [ 111.489453, 44.511572 ], [ 111.514746, 44.569824 ], [ 111.547461, 44.6729 ], [ 111.621289, 44.827148 ], [ 111.681445, 44.89917 ], [ 111.751074, 44.969531 ], [ 111.898047, 45.064062 ], [ 112.032617, 45.081641 ], [ 112.112891, 45.062939 ], [ 112.29209, 45.063037 ], [ 112.411328, 45.058203 ], [ 112.499316, 45.010937 ], [ 112.596777, 44.917676 ], [ 112.706738, 44.883447 ], [ 113.049414, 44.810352 ], [ 113.196094, 44.794824 ], [ 113.300977, 44.79165 ], [ 113.455664, 44.767432 ], [ 113.50791, 44.762354 ], [ 113.587012, 44.745703 ], [ 113.652637, 44.763477 ], [ 113.752148, 44.825928 ], [ 113.877051, 44.896191 ], [ 113.930859, 44.912305 ], [ 114.030273, 44.942578 ], [ 114.080273, 44.971143 ], [ 114.167383, 45.049854 ], [ 114.281055, 45.110889 ], [ 114.419141, 45.202588 ], [ 114.487305, 45.271729 ], [ 114.502246, 45.316309 ], [ 114.517188, 45.3646 ], [ 114.560156, 45.38999 ], [ 114.644336, 45.413281 ], [ 114.73877, 45.419629 ], [ 114.919238, 45.378271 ], [ 115.162598, 45.390234 ], [ 115.21748, 45.396191 ], [ 115.439453, 45.419971 ], [ 115.539453, 45.439502 ], [ 115.681055, 45.458252 ], [ 115.78916, 45.534814 ], [ 115.93418, 45.626172 ], [ 116.039551, 45.676953 ], [ 116.109863, 45.686719 ], [ 116.197656, 45.739355 ], [ 116.240625, 45.795996 ], [ 116.229102, 45.845752 ], [ 116.212988, 45.886914 ], [ 116.264551, 45.963037 ], [ 116.357617, 46.096582 ], [ 116.444824, 46.158789 ], [ 116.516699, 46.209082 ], [ 116.562598, 46.289795 ], [ 116.619336, 46.313086 ], [ 116.688867, 46.321973 ], [ 116.787012, 46.37666 ], [ 116.859082, 46.387939 ], [ 116.978809, 46.361768 ], [ 117.155957, 46.355078 ], [ 117.269043, 46.352246 ], [ 117.333398, 46.362012 ], [ 117.356934, 46.391309 ], [ 117.356348, 46.43667 ], [ 117.392188, 46.537598 ], [ 117.405566, 46.570898 ], [ 117.438086, 46.58623 ], [ 117.546875, 46.588281 ], [ 117.620508, 46.552002 ], [ 117.671094, 46.52207 ], [ 117.741211, 46.518164 ], [ 117.813477, 46.537695 ], [ 117.910449, 46.619336 ], [ 118.071289, 46.666602 ], [ 118.156836, 46.678564 ], [ 118.308691, 46.717041 ], [ 118.404395, 46.703174 ], [ 118.580469, 46.691895 ], [ 118.64873, 46.70166 ], [ 118.722949, 46.691895 ], [ 118.790332, 46.74707 ], [ 118.843945, 46.760205 ], [ 118.957129, 46.734863 ], [ 119.028516, 46.692188 ], [ 119.162109, 46.638672 ], [ 119.331836, 46.613818 ], [ 119.474023, 46.62666 ], [ 119.620215, 46.603955 ], [ 119.706641, 46.606006 ], [ 119.747461, 46.627197 ], [ 119.867188, 46.672168 ], [ 119.895898, 46.732861 ], [ 119.88418, 46.791455 ], [ 119.897852, 46.857813 ], [ 119.862695, 46.906592 ], [ 119.788477, 46.978809 ], [ 119.759863, 47.027002 ], [ 119.757227, 47.090039 ], [ 119.711133, 47.15 ], [ 119.600195, 47.222461 ], [ 119.526953, 47.255908 ], [ 119.37666, 47.380859 ], [ 119.325977, 47.410156 ], [ 119.308594, 47.430713 ], [ 119.29082, 47.472656 ], [ 119.235254, 47.492578 ], [ 119.162402, 47.525195 ], [ 119.122949, 47.558496 ], [ 119.097266, 47.61626 ], [ 119.081934, 47.65415 ], [ 119.017578, 47.685352 ], [ 118.953125, 47.70293 ], [ 118.880273, 47.725098 ], [ 118.759961, 47.757617 ], [ 118.690527, 47.822266 ], [ 118.567773, 47.943262 ], [ 118.498438, 47.983984 ], [ 118.239648, 47.999512 ], [ 118.14707, 48.028906 ], [ 118.041895, 48.018945 ], [ 117.979199, 47.999609 ], [ 117.84043, 47.999854 ], [ 117.768359, 47.987891 ], [ 117.67666, 47.908301 ], [ 117.555371, 47.804688 ], [ 117.455078, 47.741357 ], [ 117.383984, 47.675732 ], [ 117.350781, 47.652197 ], [ 117.285937, 47.666357 ], [ 117.19707, 47.740283 ], [ 117.069727, 47.806396 ], [ 116.95166, 47.836572 ], [ 116.901172, 47.853076 ], [ 116.760547, 47.869775 ], [ 116.651953, 47.864502 ], [ 116.513477, 47.839551 ], [ 116.378223, 47.844043 ], [ 116.317187, 47.859863 ], [ 116.231152, 47.858203 ], [ 116.074805, 47.789551 ], [ 115.993848, 47.711328 ], [ 115.898242, 47.686914 ], [ 115.811719, 47.738232 ], [ 115.711719, 47.798926 ], [ 115.616406, 47.874805 ], [ 115.557617, 47.94502 ], [ 115.525098, 48.130859 ], [ 115.639453, 48.18623 ], [ 115.785547, 48.248242 ], [ 115.796582, 48.346338 ], [ 115.791699, 48.455713 ], [ 115.820508, 48.577246 ], [ 115.953809, 48.689355 ], [ 116.025488, 48.782275 ], [ 116.034375, 48.840039 ], [ 116.098242, 48.936133 ], [ 116.159668, 49.037451 ], [ 116.243359, 49.170361 ], [ 116.402148, 49.406201 ], [ 116.589746, 49.684814 ], [ 116.683301, 49.823779 ], [ 116.888965, 49.737793 ], [ 117.02168, 49.692969 ], [ 117.245605, 49.624854 ], [ 117.477148, 49.609424 ], [ 117.698438, 49.53584 ], [ 117.812598, 49.513525 ], [ 117.873438, 49.513477 ], [ 118.186621, 49.692773 ], [ 118.451563, 49.844482 ], [ 118.755957, 49.962842 ], [ 118.979492, 49.978857 ], [ 119.147461, 50.013379 ], [ 119.259863, 50.066406 ], [ 119.326074, 50.154932 ], [ 119.346289, 50.278955 ], [ 119.301562, 50.353906 ], [ 119.191895, 50.379834 ], [ 119.163672, 50.406006 ], [ 119.216699, 50.43252 ], [ 119.255859, 50.48418 ], [ 119.280664, 50.560986 ], [ 119.344043, 50.633887 ], [ 119.445703, 50.702832 ], [ 119.501758, 50.779248 ], [ 119.512305, 50.863135 ], [ 119.573438, 50.946777 ], [ 119.684961, 51.030127 ], [ 119.745996, 51.107715 ], [ 119.756641, 51.179492 ], [ 119.813184, 51.267041 ], [ 119.966992, 51.422119 ], [ 120.066895, 51.600684 ], [ 120.237012, 51.722998 ], [ 120.510547, 51.848535 ], [ 120.681445, 51.973047 ], [ 120.749805, 52.096533 ], [ 120.744531, 52.205469 ], [ 120.66543, 52.299902 ], [ 120.650391, 52.395898 ], [ 120.699219, 52.493604 ], [ 120.656152, 52.56665 ], [ 120.521094, 52.615039 ], [ 120.360059, 52.627002 ], [ 120.172754, 52.60249 ], [ 120.067578, 52.63291 ], [ 120.044336, 52.718213 ], [ 120.094531, 52.787207 ], [ 120.218164, 52.839893 ], [ 120.421289, 52.968066 ], [ 120.704102, 53.171826 ], [ 120.985449, 53.28457 ], [ 121.405469, 53.317041 ], [ 121.743945, 53.383594 ], [ 122.088867, 53.451465 ], [ 122.337793, 53.48501 ], [ 122.380176, 53.4625 ], [ 122.51582, 53.456982 ], [ 122.744727, 53.468506 ], [ 122.957617, 53.497705 ], [ 123.154102, 53.54458 ], [ 123.30957, 53.555615 ], [ 123.424023, 53.530762 ], [ 123.489453, 53.529443 ], [ 123.534766, 53.526465 ], [ 123.559766, 53.52666 ], [ 123.607813, 53.546533 ], [ 123.740918, 53.510986 ], [ 123.994727, 53.405615 ], [ 124.154297, 53.358691 ], [ 124.219922, 53.370117 ], [ 124.291406, 53.340869 ], [ 124.369141, 53.270947 ], [ 124.465918, 53.229639 ], [ 124.639844, 53.210645 ], [ 124.812305, 53.133838 ], [ 124.882129, 53.129736 ], [ 124.906641, 53.172656 ], [ 124.970898, 53.197314 ], [ 125.075, 53.203662 ], [ 125.225586, 53.16582 ], [ 125.422461, 53.08374 ], [ 125.545996, 53.047607 ], [ 125.595996, 53.057471 ], [ 125.649023, 53.042285 ], [ 125.691699, 53.003711 ], [ 125.695313, 52.956299 ], [ 125.680762, 52.930811 ], [ 125.728125, 52.890723 ], [ 125.782813, 52.890723 ], [ 125.871875, 52.871533 ], [ 125.941602, 52.800684 ], [ 126.004297, 52.767871 ], [ 126.048145, 52.739453 ], [ 126.056055, 52.715869 ], [ 126.060156, 52.691992 ], [ 126.04707, 52.673486 ], [ 126.023242, 52.643018 ], [ 126.016016, 52.610205 ], [ 126.045898, 52.57334 ], [ 126.156641, 52.546631 ], [ 126.194434, 52.519141 ], [ 126.20293, 52.483838 ], [ 126.237598, 52.444824 ], [ 126.312891, 52.399756 ], [ 126.341699, 52.362012 ], [ 126.324219, 52.331641 ], [ 126.346289, 52.30625 ], [ 126.383496, 52.286523 ], [ 126.391504, 52.214502 ], [ 126.394824, 52.172998 ], [ 126.455566, 52.126465 ], [ 126.468066, 52.031299 ], [ 126.510547, 51.92583 ], [ 126.653711, 51.781299 ], [ 126.700781, 51.703027 ], [ 126.688672, 51.609912 ], [ 126.70918, 51.566309 ], [ 126.774512, 51.545068 ], [ 126.805469, 51.505664 ], [ 126.801758, 51.448047 ], [ 126.827344, 51.412256 ], [ 126.847754, 51.37417 ], [ 126.833789, 51.314893 ], [ 126.854395, 51.261377 ], [ 126.887695, 51.230127 ], [ 126.911523, 51.172314 ], [ 126.924805, 51.100146 ], [ 127.02041, 50.985889 ], [ 127.198242, 50.829443 ], [ 127.307031, 50.707959 ], [ 127.346875, 50.621338 ], [ 127.347168, 50.550098 ], [ 127.308203, 50.494189 ], [ 127.306055, 50.453516 ], [ 127.34082, 50.428076 ], [ 127.351172, 50.393604 ], [ 127.337207, 50.350146 ], [ 127.395313, 50.298584 ], [ 127.590234, 50.208984 ], [ 127.512305, 50.07168 ], [ 127.491797, 49.975049 ], [ 127.502441, 49.873438 ], [ 127.550781, 49.801807 ], [ 127.636719, 49.760205 ], [ 127.690137, 49.716748 ], [ 127.711133, 49.671533 ], [ 127.814258, 49.622119 ], [ 127.999609, 49.568604 ], [ 128.237109, 49.559277 ], [ 128.526758, 49.594238 ], [ 128.704004, 49.600146 ], [ 128.769043, 49.576953 ], [ 128.791016, 49.541846 ], [ 128.770313, 49.494727 ], [ 128.819336, 49.46377 ], [ 128.938281, 49.448926 ], [ 129.020313, 49.419238 ], [ 129.065137, 49.374658 ], [ 129.120117, 49.362061 ], [ 129.185156, 49.381396 ], [ 129.248438, 49.378662 ], [ 129.309863, 49.353857 ], [ 129.350098, 49.362354 ], [ 129.384668, 49.389453 ], [ 129.440723, 49.389453 ], [ 129.498145, 49.388818 ], [ 129.533691, 49.323437 ], [ 129.591406, 49.28667 ], [ 129.671094, 49.278516 ], [ 129.792578, 49.198877 ], [ 130.037109, 48.972266 ], [ 130.195996, 48.89165 ], [ 130.355273, 48.866357 ], [ 130.553125, 48.861182 ], [ 130.617188, 48.773193 ], [ 130.565625, 48.680127 ], [ 130.552148, 48.60249 ], [ 130.597266, 48.574658 ], [ 130.65918, 48.483398 ], [ 130.746875, 48.430371 ], [ 130.763477, 48.388428 ], [ 130.804297, 48.341504 ], [ 130.787207, 48.25459 ], [ 130.712109, 48.127637 ], [ 130.732617, 48.019238 ], [ 130.848633, 47.929443 ], [ 130.91543, 47.84292 ], [ 130.932813, 47.759814 ], [ 130.961914, 47.709326 ], [ 131.002734, 47.691455 ], [ 131.121875, 47.697656 ], [ 131.319336, 47.727832 ], [ 131.464258, 47.722607 ], [ 131.556738, 47.682031 ], [ 131.785254, 47.680518 ], [ 132.149805, 47.717969 ], [ 132.380176, 47.729492 ], [ 132.47627, 47.71499 ], [ 132.561914, 47.768506 ], [ 132.636914, 47.890088 ], [ 132.707227, 47.947266 ], [ 132.772852, 47.940088 ], [ 132.877148, 47.979102 ], [ 133.020117, 48.064404 ], [ 133.144043, 48.105664 ], [ 133.301172, 48.101514 ], [ 133.468359, 48.097168 ], [ 133.573242, 48.133008 ], [ 133.671777, 48.207715 ], [ 133.842188, 48.27373 ], [ 134.205859, 48.359912 ], [ 134.293359, 48.373438 ], [ 134.334961, 48.368848 ], [ 134.456152, 48.355322 ], [ 134.563574, 48.321729 ], [ 134.665234, 48.253906 ], [ 134.680859, 48.210449 ], [ 134.669336, 48.15332 ], [ 134.647266, 48.120166 ], [ 134.605371, 48.08291 ], [ 134.566016, 48.02251 ], [ 134.591309, 47.975195 ], [ 134.650293, 47.874268 ], [ 134.698633, 47.801416 ], [ 134.752344, 47.71543 ], [ 134.728125, 47.684473 ], [ 134.695801, 47.624854 ], [ 134.596191, 47.523877 ], [ 134.541895, 47.485156 ], [ 134.483496, 47.447363 ], [ 134.38252, 47.438232 ], [ 134.339453, 47.429492 ], [ 134.29082, 47.413574 ], [ 134.260059, 47.377734 ], [ 134.225195, 47.352637 ], [ 134.167676, 47.302197 ], [ 134.162988, 47.25874 ], [ 134.189258, 47.194238 ], [ 134.202148, 47.128076 ], [ 134.136914, 47.068994 ], [ 134.086426, 46.978125 ], [ 134.071387, 46.950781 ], [ 134.045996, 46.881982 ], [ 134.038574, 46.858154 ], [ 134.022656, 46.713184 ], [ 133.95752, 46.614258 ], [ 133.866602, 46.499121 ], [ 133.886719, 46.430566 ], [ 133.902734, 46.366943 ], [ 133.880273, 46.336035 ], [ 133.874805, 46.309082 ], [ 133.861328, 46.247754 ], [ 133.832813, 46.224268 ], [ 133.750195, 46.185938 ], [ 133.700684, 46.139746 ], [ 133.711133, 46.069629 ], [ 133.685742, 46.008936 ], [ 133.647852, 45.955225 ], [ 133.608008, 45.920313 ], [ 133.551172, 45.897803 ], [ 133.513086, 45.878809 ], [ 133.484668, 45.810449 ], [ 133.475781, 45.757666 ], [ 133.449121, 45.705078 ], [ 133.465625, 45.651221 ], [ 133.436426, 45.604687 ], [ 133.355469, 45.572217 ], [ 133.30957, 45.553076 ], [ 133.266992, 45.545264 ], [ 133.186035, 45.494824 ], [ 133.113379, 45.321436 ], [ 133.096875, 45.220459 ], [ 133.113477, 45.130713 ], [ 133.011719, 45.074561 ], [ 132.936035, 45.029932 ], [ 132.88877, 45.046045 ], [ 132.838672, 45.061133 ], [ 132.723145, 45.080566 ], [ 132.665625, 45.093701 ], [ 132.549023, 45.122803 ], [ 132.362988, 45.159961 ], [ 132.181348, 45.203271 ], [ 132.067383, 45.225977 ], [ 131.977539, 45.243994 ], [ 131.909277, 45.27373 ], [ 131.851855, 45.326855 ], [ 131.794922, 45.305273 ], [ 131.74209, 45.242627 ], [ 131.654004, 45.205371 ], [ 131.613965, 45.136572 ], [ 131.578711, 45.083643 ], [ 131.4875, 45.013135 ], [ 131.446875, 44.984033 ], [ 131.268262, 44.936133 ], [ 131.22793, 44.920166 ], [ 131.082324, 44.91001 ], [ 131.033008, 44.888867 ], [ 130.981641, 44.844336 ], [ 130.967773, 44.799951 ], [ 131.003906, 44.753223 ], [ 131.060645, 44.659668 ], [ 131.086914, 44.595654 ], [ 131.125781, 44.469189 ], [ 131.255273, 44.071582 ], [ 131.213281, 44.00293 ], [ 131.174219, 43.704736 ], [ 131.183594, 43.650879 ], [ 131.180078, 43.56709 ], [ 131.182422, 43.505566 ], [ 131.20918, 43.49043 ], [ 131.243945, 43.469043 ], [ 131.261816, 43.433057 ], [ 131.257324, 43.378076 ], [ 131.239355, 43.337646 ], [ 131.211914, 43.257764 ], [ 131.175586, 43.142187 ], [ 131.135547, 43.097607 ], [ 131.108984, 43.062451 ], [ 131.086133, 43.038086 ], [ 131.083496, 42.956299 ], [ 131.068555, 42.902246 ], [ 131.005566, 42.883105 ], [ 130.942871, 42.851758 ], [ 130.868555, 42.86333 ], [ 130.80332, 42.856836 ], [ 130.722461, 42.83584 ], [ 130.577246, 42.811621 ], [ 130.492969, 42.779102 ], [ 130.452734, 42.75542 ], [ 130.424805, 42.727051 ], [ 130.419922, 42.699854 ], [ 130.439258, 42.685547 ], [ 130.520605, 42.674316 ], [ 130.576563, 42.623242 ], [ 130.584473, 42.567334 ], [ 130.526953, 42.5354 ], [ 130.498242, 42.570508 ], [ 130.450293, 42.581689 ], [ 130.360742, 42.630859 ], [ 130.295605, 42.684961 ], [ 130.24668, 42.744824 ], [ 130.248828, 42.872607 ], [ 130.240332, 42.891797 ], [ 130.15127, 42.917969 ], [ 130.124805, 42.956006 ], [ 130.082617, 42.97417 ], [ 130.022266, 42.962598 ], [ 129.976953, 42.974854 ], [ 129.941211, 42.995654 ], [ 129.898242, 42.998145 ], [ 129.861035, 42.965088 ], [ 129.841504, 42.894238 ], [ 129.779199, 42.776562 ], [ 129.773438, 42.705469 ], [ 129.746484, 42.603809 ], [ 129.719727, 42.475 ], [ 129.697852, 42.448145 ], [ 129.62793, 42.444287 ], [ 129.603906, 42.435889 ], [ 129.567578, 42.39209 ], [ 129.52373, 42.384668 ], [ 129.484863, 42.410303 ], [ 129.423633, 42.435889 ], [ 129.36582, 42.439209 ], [ 129.313672, 42.413574 ], [ 129.252539, 42.357861 ], [ 129.217773, 42.312695 ], [ 129.205371, 42.270557 ], [ 129.195508, 42.218457 ], [ 129.133691, 42.168506 ], [ 129.077246, 42.142383 ], [ 128.960645, 42.068799 ], [ 128.923438, 42.038232 ], [ 128.839844, 42.037842 ], [ 128.749023, 42.040674 ], [ 128.626758, 42.02085 ], [ 128.427246, 42.010742 ], [ 128.307813, 42.025635 ], [ 128.160156, 42.011621 ], [ 128.045215, 41.9875 ], [ 128.028711, 41.951611 ], [ 128.03291, 41.898486 ], [ 128.056055, 41.86377 ], [ 128.08418, 41.840576 ], [ 128.131934, 41.769141 ], [ 128.181738, 41.700049 ], [ 128.257813, 41.655371 ], [ 128.289258, 41.607422 ], [ 128.290918, 41.562793 ], [ 128.254883, 41.506543 ], [ 128.200293, 41.433008 ], [ 128.149414, 41.387744 ], [ 128.11123, 41.389258 ], [ 128.052734, 41.415625 ], [ 128.013086, 41.448682 ], [ 127.918652, 41.461133 ], [ 127.687695, 41.43999 ], [ 127.572168, 41.454736 ], [ 127.516992, 41.481738 ], [ 127.420313, 41.483789 ], [ 127.270801, 41.519824 ], [ 127.179688, 41.531348 ], [ 127.136719, 41.554541 ], [ 127.128418, 41.607422 ], [ 127.085352, 41.643799 ], [ 127.061328, 41.687354 ], [ 127.006934, 41.742041 ], [ 126.954785, 41.769482 ], [ 126.903516, 41.781055 ], [ 126.847266, 41.747998 ], [ 126.787695, 41.718213 ], [ 126.743066, 41.724854 ], [ 126.721582, 41.716553 ], [ 126.696973, 41.691895 ], [ 126.60127, 41.640967 ], [ 126.57832, 41.594336 ], [ 126.540137, 41.495557 ], [ 126.513574, 41.393994 ], [ 126.49043, 41.358057 ], [ 126.451465, 41.351855 ], [ 126.411816, 41.321338 ], [ 126.328711, 41.225684 ], [ 126.253613, 41.137793 ], [ 126.144531, 41.078271 ], [ 126.093164, 41.023682 ], [ 126.066797, 40.974072 ], [ 125.989062, 40.904639 ], [ 125.874902, 40.892236 ], [ 125.783984, 40.872021 ], [ 125.72832, 40.866699 ], [ 125.688281, 40.838672 ], [ 125.65918, 40.795898 ], [ 125.645117, 40.778955 ], [ 125.593848, 40.778955 ], [ 125.542578, 40.742578 ], [ 125.416895, 40.659912 ], [ 125.314453, 40.644629 ], [ 125.185938, 40.589404 ], [ 125.072949, 40.547461 ], [ 125.025977, 40.523877 ], [ 125.013379, 40.497852 ], [ 124.996875, 40.464746 ], [ 124.942285, 40.458154 ], [ 124.889355, 40.459814 ], [ 124.771973, 40.38374 ], [ 124.712402, 40.319238 ], [ 124.481055, 40.181641 ], [ 124.386621, 40.104248 ], [ 124.362109, 40.004053 ], [ 124.35, 40.011572 ], [ 124.26748, 39.92417 ], [ 124.105762, 39.841016 ], [ 123.760156, 39.822412 ], [ 123.650879, 39.881592 ], [ 123.61123, 39.84082 ], [ 123.580664, 39.786133 ], [ 123.490039, 39.767871 ], [ 123.348145, 39.762939 ], [ 123.268945, 39.726904 ], [ 123.226563, 39.686621 ], [ 123.032227, 39.673535 ], [ 122.960938, 39.619922 ], [ 122.840039, 39.60083 ], [ 122.334863, 39.366113 ], [ 122.225, 39.267334 ], [ 122.120898, 39.151904 ], [ 122.047656, 39.093799 ], [ 121.982324, 39.053174 ], [ 121.922656, 39.036523 ], [ 121.864355, 38.996484 ], [ 121.805176, 38.991406 ], [ 121.744824, 39.009668 ], [ 121.677246, 39.003418 ], [ 121.632813, 38.954834 ], [ 121.67041, 38.891797 ], [ 121.649902, 38.865088 ], [ 121.517188, 38.830762 ], [ 121.320117, 38.808203 ], [ 121.236328, 38.766943 ], [ 121.207422, 38.743506 ], [ 121.163574, 38.731641 ], [ 121.12168, 38.813281 ], [ 121.106738, 38.920801 ], [ 121.188281, 38.94668 ], [ 121.263281, 38.960254 ], [ 121.679883, 39.108691 ], [ 121.627637, 39.220166 ], [ 121.664551, 39.26875 ], [ 121.757813, 39.347559 ], [ 121.818457, 39.386523 ], [ 121.785449, 39.40083 ], [ 121.5125, 39.374854 ], [ 121.355664, 39.376807 ], [ 121.275488, 39.384766 ], [ 121.299805, 39.452197 ], [ 121.286328, 39.519434 ], [ 121.26748, 39.544678 ], [ 121.406445, 39.62124 ], [ 121.469531, 39.640137 ], [ 121.517578, 39.638965 ], [ 121.514258, 39.685254 ], [ 121.474219, 39.754883 ], [ 121.517383, 39.844824 ], [ 121.800977, 39.950537 ], [ 121.868945, 40.046387 ], [ 121.982813, 40.13584 ], [ 122.190918, 40.358252 ], [ 122.20332, 40.396045 ], [ 122.263867, 40.500195 ], [ 122.275, 40.541846 ], [ 122.178711, 40.602734 ], [ 122.14043, 40.688184 ], [ 121.858789, 40.84209 ], [ 121.834863, 40.974268 ], [ 121.808594, 40.968506 ], [ 121.765625, 40.875879 ], [ 121.729297, 40.846143 ], [ 121.598926, 40.843408 ], [ 121.537109, 40.878418 ], [ 121.174512, 40.90127 ], [ 121.085938, 40.841602 ], [ 121.00293, 40.749121 ], [ 120.922266, 40.683105 ], [ 120.841309, 40.649219 ], [ 120.770703, 40.589062 ], [ 120.479102, 40.230957 ], [ 120.368945, 40.203857 ], [ 119.850391, 39.987451 ], [ 119.591113, 39.902637 ], [ 119.391113, 39.75249 ], [ 119.322363, 39.661621 ], [ 119.261328, 39.560889 ], [ 119.224609, 39.408057 ], [ 119.040137, 39.222363 ], [ 118.976953, 39.182568 ], [ 118.912305, 39.166406 ], [ 118.826465, 39.172119 ], [ 118.752441, 39.160498 ], [ 118.626367, 39.176855 ], [ 118.471973, 39.118018 ], [ 118.297852, 39.06709 ], [ 118.147852, 39.195068 ], [ 118.040918, 39.226758 ], [ 117.865723, 39.19126 ], [ 117.784668, 39.134473 ], [ 117.616699, 38.852881 ], [ 117.553809, 38.691455 ], [ 117.557813, 38.625146 ], [ 117.656055, 38.424219 ], [ 117.766699, 38.31167 ], [ 118.014941, 38.183398 ], [ 118.543262, 38.094922 ], [ 118.66709, 38.126367 ], [ 118.8, 38.12666 ], [ 118.940039, 38.042773 ], [ 119.027539, 37.904004 ], [ 119.035645, 37.80918 ], [ 119.038477, 37.776514 ], [ 119.070313, 37.748584 ], [ 119.08916, 37.700732 ], [ 119.033496, 37.661035 ], [ 118.99082, 37.641357 ], [ 118.954883, 37.494092 ], [ 118.952637, 37.331152 ], [ 118.998145, 37.2771 ], [ 119.111816, 37.201172 ], [ 119.287402, 37.138281 ], [ 119.449902, 37.124756 ], [ 119.760547, 37.155078 ], [ 119.8875, 37.253369 ], [ 119.87998, 37.295801 ], [ 119.88291, 37.35083 ], [ 120.155859, 37.49502 ], [ 120.311523, 37.622705 ], [ 120.287109, 37.656494 ], [ 120.257227, 37.679004 ], [ 120.284668, 37.69209 ], [ 120.370117, 37.701025 ], [ 120.75, 37.833936 ], [ 121.049023, 37.725195 ], [ 121.219531, 37.600146 ], [ 121.388086, 37.578955 ], [ 121.505273, 37.515039 ], [ 121.640234, 37.460352 ], [ 121.816406, 37.456641 ], [ 121.964844, 37.445313 ], [ 122.010156, 37.495752 ], [ 122.056641, 37.528906 ], [ 122.10957, 37.522314 ], [ 122.169141, 37.456152 ], [ 122.337695, 37.405273 ], [ 122.493262, 37.407959 ], [ 122.602344, 37.426416 ], [ 122.666992, 37.402832 ], [ 122.57334, 37.31792 ], [ 122.587305, 37.181104 ], [ 122.515527, 37.137842 ], [ 122.44668, 37.068115 ], [ 122.487402, 37.022266 ], [ 122.523438, 37.002637 ], [ 122.519727, 36.946826 ], [ 122.457031, 36.915137 ], [ 122.340918, 36.832227 ], [ 122.274219, 36.833838 ], [ 122.242285, 36.849854 ], [ 122.219727, 36.879541 ], [ 122.203223, 36.927197 ], [ 122.162402, 36.958643 ], [ 122.049512, 36.970752 ], [ 121.932715, 36.959473 ], [ 121.669629, 36.836377 ], [ 121.413086, 36.738379 ], [ 121.144043, 36.660449 ], [ 121.053809, 36.611377 ], [ 120.989941, 36.597949 ], [ 120.878516, 36.635156 ], [ 120.81084, 36.632813 ], [ 120.79668, 36.607227 ], [ 120.882617, 36.538916 ], [ 120.90498, 36.485303 ], [ 120.895801, 36.444141 ], [ 120.84707, 36.426074 ], [ 120.776172, 36.456299 ], [ 120.711523, 36.413281 ], [ 120.682227, 36.340723 ], [ 120.680957, 36.168359 ], [ 120.637891, 36.129932 ], [ 120.519336, 36.108691 ], [ 120.393066, 36.053857 ], [ 120.348242, 36.079199 ], [ 120.330273, 36.110107 ], [ 120.343457, 36.189453 ], [ 120.327734, 36.228174 ], [ 120.270117, 36.226172 ], [ 120.183301, 36.202441 ], [ 120.116992, 36.150293 ], [ 120.094141, 36.118896 ], [ 120.181445, 36.01748 ], [ 120.264746, 36.007227 ], [ 120.284766, 35.984424 ], [ 120.219043, 35.934912 ], [ 120.054688, 35.861133 ], [ 120.027441, 35.799365 ], [ 119.978711, 35.740234 ], [ 119.911719, 35.693213 ], [ 119.866211, 35.643652 ], [ 119.810547, 35.617725 ], [ 119.719727, 35.588721 ], [ 119.608398, 35.469873 ], [ 119.526465, 35.358594 ], [ 119.429688, 35.301416 ], [ 119.352832, 35.113818 ], [ 119.21582, 35.011768 ], [ 119.165332, 34.848828 ], [ 119.200977, 34.748438 ], [ 119.351367, 34.749414 ], [ 119.426758, 34.71416 ], [ 119.58291, 34.582227 ], [ 119.769727, 34.496191 ], [ 119.963672, 34.447803 ], [ 120.201465, 34.325684 ], [ 120.266699, 34.274023 ], [ 120.322656, 34.168994 ], [ 120.425684, 33.866309 ], [ 120.499805, 33.716455 ], [ 120.504785, 33.638184 ], [ 120.615625, 33.490527 ], [ 120.734473, 33.236621 ], [ 120.871094, 33.016504 ], [ 120.897363, 32.843213 ], [ 120.853027, 32.764111 ], [ 120.853223, 32.661377 ], [ 120.989941, 32.567041 ], [ 121.293359, 32.457324 ], [ 121.341699, 32.425049 ], [ 121.400977, 32.371924 ], [ 121.403906, 32.20625 ], [ 121.450781, 32.15332 ], [ 121.490527, 32.121094 ], [ 121.674219, 32.051025 ], [ 121.751074, 31.992871 ], [ 121.832422, 31.899756 ], [ 121.856348, 31.816455 ], [ 121.866309, 31.703564 ], [ 121.763574, 31.699512 ], [ 121.680859, 31.712158 ], [ 121.351953, 31.858789 ], [ 121.266406, 31.862695 ], [ 121.145801, 31.842334 ], [ 120.973535, 31.869385 ], [ 120.791699, 32.031738 ], [ 120.660547, 32.081055 ], [ 120.520117, 32.105859 ], [ 120.184082, 31.966162 ], [ 120.09873, 31.975977 ], [ 120.073926, 31.960254 ], [ 120.035937, 31.936279 ], [ 120.191602, 31.906348 ], [ 120.347461, 31.9521 ], [ 120.497168, 32.019824 ], [ 120.715527, 31.98374 ], [ 120.752246, 31.922852 ], [ 120.787793, 31.819775 ], [ 120.9375, 31.750195 ], [ 121.055371, 31.719434 ], [ 121.204883, 31.628076 ], [ 121.350977, 31.485352 ], [ 121.660645, 31.319727 ], [ 121.785937, 31.162891 ], [ 121.834473, 31.061621 ], [ 121.87793, 30.916992 ], [ 121.769434, 30.870361 ], [ 121.675195, 30.86377 ], [ 121.527539, 30.840967 ], [ 121.418945, 30.789795 ], [ 121.309961, 30.699707 ], [ 120.997656, 30.558252 ], [ 120.938281, 30.469727 ], [ 120.897461, 30.392627 ], [ 120.821484, 30.354639 ], [ 120.62998, 30.390869 ], [ 120.449805, 30.387842 ], [ 120.245508, 30.283545 ], [ 120.194629, 30.241309 ], [ 120.228516, 30.249561 ], [ 120.260547, 30.263037 ], [ 120.352539, 30.247412 ], [ 120.494531, 30.303076 ], [ 120.633398, 30.133154 ], [ 120.904492, 30.160645 ], [ 121.159375, 30.301758 ], [ 121.258008, 30.304102 ], [ 121.340625, 30.282373 ], [ 121.432715, 30.22666 ], [ 121.67793, 29.979102 ], [ 121.812305, 29.952148 ], [ 121.944336, 29.894092 ], [ 122.017285, 29.887695 ], [ 122.08291, 29.870361 ], [ 121.905762, 29.779688 ], [ 121.676562, 29.583789 ], [ 121.574609, 29.537012 ], [ 121.50625, 29.48457 ], [ 121.69043, 29.510986 ], [ 121.821875, 29.604639 ], [ 121.887988, 29.627783 ], [ 121.941211, 29.605908 ], [ 121.968359, 29.490625 ], [ 121.917773, 29.13501 ], [ 121.853516, 29.128906 ], [ 121.79082, 29.225684 ], [ 121.71748, 29.256348 ], [ 121.655957, 29.236133 ], [ 121.533691, 29.236719 ], [ 121.487109, 29.193164 ], [ 121.447656, 29.131348 ], [ 121.520898, 29.118457 ], [ 121.664941, 29.010596 ], [ 121.679688, 28.953125 ], [ 121.641016, 28.915918 ], [ 121.540039, 28.931885 ], [ 121.6625, 28.851416 ], [ 121.630078, 28.76792 ], [ 121.590332, 28.734814 ], [ 121.519141, 28.713672 ], [ 121.475195, 28.641406 ], [ 121.538086, 28.521094 ], [ 121.602051, 28.366602 ], [ 121.609961, 28.292139 ], [ 121.509961, 28.324268 ], [ 121.35459, 28.229883 ], [ 121.272266, 28.222119 ], [ 121.216797, 28.346191 ], [ 121.145703, 28.32666 ], [ 121.098437, 28.290527 ], [ 121.035449, 28.157275 ], [ 120.958594, 28.037012 ], [ 120.89248, 28.003906 ], [ 120.812988, 28.013379 ], [ 120.747656, 28.009961 ], [ 120.763477, 27.977441 ], [ 120.833008, 27.937793 ], [ 120.833008, 27.891455 ], [ 120.685156, 27.74458 ], [ 120.661328, 27.687891 ], [ 120.664844, 27.639453 ], [ 120.5875, 27.580762 ], [ 120.629102, 27.482129 ], [ 120.60752, 27.412402 ], [ 120.539844, 27.318359 ], [ 120.468652, 27.25625 ], [ 120.38457, 27.155518 ], [ 120.278711, 27.09707 ], [ 120.138574, 26.886133 ], [ 120.097461, 26.780664 ], [ 120.086719, 26.671582 ], [ 120.042969, 26.633838 ], [ 119.967773, 26.586377 ], [ 119.882227, 26.610449 ], [ 119.879492, 26.683008 ], [ 119.842383, 26.689307 ], [ 119.821289, 26.736914 ], [ 119.815137, 26.797607 ], [ 119.824219, 26.846387 ], [ 119.788672, 26.831494 ], [ 119.766699, 26.774707 ], [ 119.710449, 26.728662 ], [ 119.651563, 26.747266 ], [ 119.588184, 26.784961 ], [ 119.589941, 26.730469 ], [ 119.623633, 26.675879 ], [ 119.638184, 26.621191 ], [ 119.725977, 26.609424 ], [ 119.784766, 26.546631 ], [ 119.831152, 26.450195 ], [ 119.840332, 26.41416 ], [ 119.876465, 26.370947 ], [ 119.881055, 26.33418 ], [ 119.797266, 26.300146 ], [ 119.692676, 26.236426 ], [ 119.56709, 26.127344 ], [ 119.463086, 26.054688 ], [ 119.369727, 26.054053 ], [ 119.313086, 26.062549 ], [ 119.232129, 26.104395 ], [ 119.139453, 26.121777 ], [ 119.26377, 25.974805 ], [ 119.332031, 25.94873 ], [ 119.417773, 25.954346 ], [ 119.500879, 26.00918 ], [ 119.61875, 26.003564 ], [ 119.648242, 25.918701 ], [ 119.616895, 25.8229 ], [ 119.552832, 25.698682 ], [ 119.539453, 25.59126 ], [ 119.619141, 25.437451 ], [ 119.622461, 25.391162 ], [ 119.592773, 25.368018 ], [ 119.499219, 25.408643 ], [ 119.421777, 25.459619 ], [ 119.34375, 25.446289 ], [ 119.263086, 25.468018 ], [ 119.180078, 25.449805 ], [ 119.146289, 25.414307 ], [ 119.169336, 25.355713 ], [ 119.243555, 25.307031 ], [ 119.285547, 25.232227 ], [ 119.235547, 25.205957 ], [ 119.024609, 25.223437 ], [ 118.977539, 25.209277 ], [ 118.914453, 25.126807 ], [ 118.955664, 25.004785 ], [ 118.909082, 24.928906 ], [ 118.82207, 24.911133 ], [ 118.70752, 24.849805 ], [ 118.636914, 24.835547 ], [ 118.640234, 24.809082 ], [ 118.691797, 24.782324 ], [ 118.719141, 24.746143 ], [ 118.657031, 24.621436 ], [ 118.560352, 24.580371 ], [ 118.412012, 24.600732 ], [ 118.295313, 24.572754 ], [ 118.194531, 24.62583 ], [ 118.087109, 24.627002 ], [ 118.013867, 24.559912 ], [ 118.005957, 24.481982 ], [ 117.935059, 24.474219 ], [ 117.896875, 24.479834 ], [ 117.842676, 24.474316 ], [ 117.848242, 24.432471 ], [ 117.879004, 24.395898 ], [ 118.024219, 24.379639 ], [ 118.050586, 24.327148 ], [ 118.056055, 24.246094 ], [ 117.904102, 24.106445 ], [ 117.839453, 24.012305 ], [ 117.741699, 24.014795 ], [ 117.667871, 23.939258 ], [ 117.628223, 23.836719 ], [ 117.579199, 23.856982 ], [ 117.466406, 23.840576 ], [ 117.433105, 23.791699 ], [ 117.45957, 23.771484 ], [ 117.462207, 23.73623 ], [ 117.416992, 23.620996 ], [ 117.367676, 23.588623 ], [ 117.34668, 23.635742 ], [ 117.330762, 23.708789 ], [ 117.29082, 23.714355 ], [ 117.225, 23.647021 ], [ 117.148145, 23.598779 ], [ 117.08252, 23.57876 ], [ 117.032813, 23.623438 ], [ 116.910645, 23.64668 ], [ 116.860938, 23.453076 ], [ 116.75957, 23.38252 ], [ 116.712109, 23.360498 ], [ 116.629395, 23.353857 ], [ 116.682324, 23.327393 ], [ 116.698828, 23.277783 ], [ 116.669141, 23.228174 ], [ 116.586426, 23.218262 ], [ 116.538281, 23.179688 ], [ 116.519824, 23.006592 ], [ 116.470703, 22.945898 ], [ 116.345508, 22.941064 ], [ 116.251855, 22.981348 ], [ 116.22207, 22.949561 ], [ 116.206348, 22.918652 ], [ 116.157422, 22.887451 ], [ 116.062598, 22.879102 ], [ 115.852148, 22.801562 ], [ 115.755859, 22.823926 ], [ 115.64043, 22.853418 ], [ 115.561133, 22.824707 ], [ 115.534668, 22.765186 ], [ 115.49834, 22.718848 ], [ 115.38252, 22.718848 ], [ 115.289941, 22.775977 ], [ 115.195801, 22.817285 ], [ 115.091504, 22.781689 ], [ 115.012109, 22.708936 ], [ 114.914453, 22.684619 ], [ 114.896387, 22.639502 ], [ 114.853809, 22.616797 ], [ 114.750391, 22.626318 ], [ 114.711133, 22.738721 ], [ 114.65166, 22.755273 ], [ 114.592773, 22.698438 ], [ 114.571973, 22.654053 ], [ 114.544434, 22.620605 ], [ 114.554199, 22.528906 ], [ 114.496191, 22.527051 ], [ 114.420117, 22.583252 ], [ 114.340625, 22.593213 ], [ 114.266016, 22.540967 ], [ 114.228223, 22.553955 ], [ 114.188184, 22.56499 ], [ 114.122852, 22.56499 ], [ 114.097852, 22.55127 ], [ 114.050391, 22.542969 ], [ 114.018262, 22.514453 ], [ 114.01543, 22.511914 ], [ 113.931152, 22.531055 ], [ 113.82832, 22.607227 ], [ 113.754492, 22.733643 ], [ 113.661133, 22.80166 ], [ 113.619629, 22.861426 ], [ 113.603418, 22.968896 ], [ 113.586328, 23.02002 ], [ 113.592188, 23.076953 ], [ 113.620508, 23.12749 ], [ 113.519727, 23.1021 ], [ 113.445313, 23.055078 ], [ 113.460352, 22.995703 ], [ 113.441895, 22.940576 ], [ 113.331055, 22.912012 ], [ 113.337793, 22.888818 ], [ 113.344824, 22.8646 ], [ 113.432031, 22.789404 ], [ 113.449805, 22.726123 ], [ 113.484766, 22.692383 ], [ 113.553027, 22.594043 ], [ 113.551465, 22.40415 ], [ 113.588867, 22.350488 ], [ 113.576465, 22.297266 ], [ 113.549121, 22.225195 ], [ 113.546777, 22.224121 ], [ 113.527051, 22.245947 ], [ 113.494141, 22.241553 ], [ 113.481055, 22.21748 ], [ 113.478906, 22.195557 ], [ 113.473437, 22.194434 ], [ 113.415723, 22.178369 ], [ 113.367383, 22.164844 ], [ 113.327734, 22.14541 ], [ 113.266406, 22.08877 ], [ 113.149023, 22.075 ], [ 113.08877, 22.207959 ], [ 113.008203, 22.119336 ], [ 112.983789, 21.938232 ], [ 112.953906, 21.907324 ], [ 112.903809, 21.881445 ], [ 112.808594, 21.944629 ], [ 112.725391, 21.902344 ], [ 112.660742, 21.859473 ], [ 112.634082, 21.819873 ], [ 112.586328, 21.776855 ], [ 112.494727, 21.818311 ], [ 112.421289, 21.880615 ], [ 112.439453, 21.927344 ], [ 112.429297, 21.958105 ], [ 112.396094, 21.981348 ], [ 112.359668, 21.978027 ], [ 112.377441, 21.91748 ], [ 112.389746, 21.801221 ], [ 112.356445, 21.767578 ], [ 112.30498, 21.741699 ], [ 112.193359, 21.763135 ], [ 112.117188, 21.806494 ], [ 112.025195, 21.843018 ], [ 111.943945, 21.849658 ], [ 111.926465, 21.77627 ], [ 111.873438, 21.717139 ], [ 111.824609, 21.709766 ], [ 111.775977, 21.719238 ], [ 111.711914, 21.655225 ], [ 111.681641, 21.608496 ], [ 111.602734, 21.559082 ], [ 111.392383, 21.535107 ], [ 111.319141, 21.486133 ], [ 111.220605, 21.493896 ], [ 111.144238, 21.482227 ], [ 111.100586, 21.484717 ], [ 111.061133, 21.510986 ], [ 111.016895, 21.511719 ], [ 110.996777, 21.430273 ], [ 110.878027, 21.395947 ], [ 110.771094, 21.386523 ], [ 110.652148, 21.279102 ], [ 110.567187, 21.214063 ], [ 110.504297, 21.207422 ], [ 110.458008, 21.230566 ], [ 110.43457, 21.326904 ], [ 110.410937, 21.338135 ], [ 110.397461, 21.247705 ], [ 110.374609, 21.172363 ], [ 110.331152, 21.131348 ], [ 110.193555, 21.037646 ], [ 110.154004, 20.944629 ], [ 110.180371, 20.858594 ], [ 110.36543, 20.837598 ], [ 110.388477, 20.790527 ], [ 110.370508, 20.752051 ], [ 110.326172, 20.719922 ], [ 110.313086, 20.67168 ], [ 110.511523, 20.518262 ], [ 110.517578, 20.46001 ], [ 110.486914, 20.426855 ], [ 110.449512, 20.35542 ], [ 110.344727, 20.294824 ], [ 110.123145, 20.263721 ], [ 109.938477, 20.295117 ], [ 109.88252, 20.364062 ], [ 109.88584, 20.413135 ], [ 109.931641, 20.398877 ], [ 109.983887, 20.403271 ], [ 109.968359, 20.448145 ], [ 109.946387, 20.474365 ], [ 109.861035, 20.514307 ], [ 109.791992, 20.621875 ], [ 109.805273, 20.711475 ], [ 109.767383, 20.780713 ], [ 109.72627, 20.83877 ], [ 109.684766, 20.873633 ], [ 109.662598, 20.916895 ], [ 109.704492, 21.052734 ], [ 109.68125, 21.131641 ], [ 109.760156, 21.228369 ], [ 109.77959, 21.337451 ], [ 109.921094, 21.376465 ], [ 109.930762, 21.480566 ], [ 109.82959, 21.483594 ], [ 109.759375, 21.560059 ], [ 109.743359, 21.527979 ], [ 109.686914, 21.524609 ], [ 109.594336, 21.671973 ], [ 109.566406, 21.690576 ], [ 109.521484, 21.693408 ], [ 109.544043, 21.537939 ], [ 109.435547, 21.479492 ], [ 109.34668, 21.453955 ], [ 109.22041, 21.443408 ], [ 109.148633, 21.425537 ], [ 109.081543, 21.440283 ], [ 109.098145, 21.487354 ], [ 109.133496, 21.543604 ], [ 109.101758, 21.590479 ], [ 109.030566, 21.626514 ], [ 108.921777, 21.624414 ], [ 108.846387, 21.634473 ], [ 108.77168, 21.630469 ], [ 108.743945, 21.65127 ], [ 108.674512, 21.724658 ], [ 108.61582, 21.770459 ], [ 108.589355, 21.815967 ], [ 108.61582, 21.868896 ], [ 108.59375, 21.901025 ], [ 108.479883, 21.904639 ], [ 108.480859, 21.828809 ], [ 108.492578, 21.739404 ], [ 108.525684, 21.671387 ], [ 108.502148, 21.633447 ], [ 108.444336, 21.607324 ], [ 108.382813, 21.679199 ], [ 108.35459, 21.696924 ], [ 108.324805, 21.693506 ], [ 108.302148, 21.621924 ], [ 108.246289, 21.558398 ], [ 108.145605, 21.565186 ], [ 108.067383, 21.525977 ], [ 107.972656, 21.507959 ] ] ], [ [ [ 110.88877, 19.991943 ], [ 110.938281, 19.947559 ], [ 110.970703, 19.883301 ], [ 110.997656, 19.764697 ], [ 111.013672, 19.655469 ], [ 110.912695, 19.586084 ], [ 110.822266, 19.55791 ], [ 110.640918, 19.291211 ], [ 110.603125, 19.207031 ], [ 110.572168, 19.171875 ], [ 110.5625, 19.135156 ], [ 110.566016, 19.098535 ], [ 110.519336, 18.970215 ], [ 110.477637, 18.812598 ], [ 110.45127, 18.747949 ], [ 110.399512, 18.69834 ], [ 110.333691, 18.673291 ], [ 110.29082, 18.669531 ], [ 110.251758, 18.655762 ], [ 110.15625, 18.569824 ], [ 110.048535, 18.505225 ], [ 110.066406, 18.475635 ], [ 110.067383, 18.447559 ], [ 110.020215, 18.41626 ], [ 109.967676, 18.42207 ], [ 109.815625, 18.39668 ], [ 109.759766, 18.348291 ], [ 109.702734, 18.259131 ], [ 109.681055, 18.247119 ], [ 109.589551, 18.226318 ], [ 109.519336, 18.218262 ], [ 109.400098, 18.281104 ], [ 109.340918, 18.299609 ], [ 109.183203, 18.325146 ], [ 109.029883, 18.367773 ], [ 108.922266, 18.416113 ], [ 108.701563, 18.535254 ], [ 108.676074, 18.750244 ], [ 108.638086, 18.866309 ], [ 108.635645, 18.907715 ], [ 108.65, 19.265039 ], [ 108.665527, 19.304102 ], [ 108.693555, 19.338281 ], [ 108.791016, 19.418164 ], [ 108.902832, 19.481348 ], [ 109.062891, 19.613574 ], [ 109.179102, 19.674121 ], [ 109.27666, 19.761133 ], [ 109.219531, 19.757471 ], [ 109.177441, 19.768457 ], [ 109.218945, 19.842822 ], [ 109.263477, 19.882666 ], [ 109.314844, 19.904395 ], [ 109.418164, 19.888818 ], [ 109.513672, 19.904248 ], [ 109.584277, 19.970312 ], [ 109.651367, 19.984375 ], [ 109.90625, 19.962744 ], [ 110.083008, 19.99292 ], [ 110.171582, 20.053711 ], [ 110.213379, 20.056055 ], [ 110.343945, 20.038818 ], [ 110.392285, 19.975586 ], [ 110.387988, 20.018018 ], [ 110.393555, 20.059229 ], [ 110.417578, 20.054736 ], [ 110.588184, 19.976367 ], [ 110.58877, 20.072461 ], [ 110.59834, 20.097607 ], [ 110.651758, 20.137744 ], [ 110.678516, 20.137061 ], [ 110.744531, 20.059473 ], [ 110.809082, 20.014404 ], [ 110.88877, 19.991943 ] ] ] ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 3,
          "stroke-opacity": 1,
          "name": "Brazil National Policy",
          "id": "brazil_national_policy",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "amazonRainforest",
          "headline": "President Jair Bolsanaro has made it a national policy to extract value from the Amazon at the expense of the rainforest's future.",
          "type": "policy",
          "weight": 0.25
        },
        "geometry": {
          "type": "Point",
          "coordinates": [[ -46.6259765625, -23.50355189742412 ]]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 2,
          "stroke-opacity": 0.7,
          "name": "Brazil exports to United States",
          "id": "brazil_USA_exports",
          "childId": ["brazil_USA_exports_homedepot", "brazil_USA_exports_acme", "brazil_USA_exports_amazon"],
          "rootId":"amazonRainforest",
          "parentId": "amazonRainforest",
          "headline": "Logging is one of the main drivers of Amazon deforestation, and the United States purchases about 1/3rd of all of Brazil's wood products.",
          "type": "supplychain",
          "products": "[{\"name\":\"wood\",\"amount_USD\":\"1,270,000,000\",\"pct_total\":\"0.33\",\"weight\":\"0.25\"}]",
          "weight": 0.15,
          "center": [ -112.461674, 45.679547 ]
        },
        "geometry": {
          "type": "MultiPolygon",
          "coordinates": [ [ [ [ -132.746875, 56.525684 ], [ -132.757617, 56.511035 ], [ -132.884717, 56.512451 ], [ -132.930811, 56.524463 ], [ -132.948047, 56.567236 ], [ -132.93623, 56.606836 ], [ -132.906543, 56.637402 ], [ -132.870654, 56.696387 ], [ -132.842529, 56.794775 ], [ -132.655859, 56.684717 ], [ -132.598682, 56.635742 ], [ -132.567969, 56.57583 ], [ -132.634229, 56.553467 ], [ -132.714453, 56.542529 ], [ -132.746875, 56.525684 ] ] ], [ [ [ -132.779883, 56.247266 ], [ -132.830957, 56.244141 ], [ -132.891455, 56.259424 ], [ -133.03501, 56.340918 ], [ -133.037646, 56.364844 ], [ -133.01709, 56.391992 ], [ -132.935498, 56.441797 ], [ -132.902051, 56.45376 ], [ -132.706055, 56.448486 ], [ -132.643359, 56.435156 ], [ -132.629102, 56.411914 ], [ -132.632275, 56.388281 ], [ -132.652832, 56.364355 ], [ -132.657568, 56.339307 ], [ -132.646582, 56.313184 ], [ -132.669385, 56.287305 ], [ -132.779883, 56.247266 ] ] ], [ [ [ -134.312744, 58.228906 ], [ -134.319873, 58.204102 ], [ -134.45625, 58.206543 ], [ -134.593994, 58.243115 ], [ -134.661572, 58.290918 ], [ -134.647998, 58.312402 ], [ -134.519971, 58.33252 ], [ -134.398877, 58.287207 ], [ -134.312744, 58.228906 ] ] ], [ [ [ -145.118506, 60.337109 ], [ -145.150488, 60.312646 ], [ -145.237646, 60.321338 ], [ -145.284277, 60.336816 ], [ -145.128125, 60.401123 ], [ -145.102441, 60.388232 ], [ -145.118506, 60.337109 ] ] ], [ [ [ -144.565625, 59.818408 ], [ -144.613574, 59.812646 ], [ -144.541553, 59.878223 ], [ -144.444922, 59.950684 ], [ -144.353955, 59.996191 ], [ -144.235742, 60.015186 ], [ -144.248975, 59.982129 ], [ -144.403223, 59.921094 ], [ -144.565625, 59.818408 ] ] ], [ [ [ -148.021777, 60.065332 ], [ -148.07417, 60.034717 ], [ -148.271875, 60.053271 ], [ -148.230664, 60.113525 ], [ -148.07959, 60.15166 ], [ -147.914209, 60.092334 ], [ -148.021777, 60.065332 ] ] ], [ [ [ -152.020752, 60.361719 ], [ -152.069043, 60.358057 ], [ -152.004492, 60.407422 ], [ -151.959717, 60.50376 ], [ -151.899414, 60.490381 ], [ -151.887305, 60.472705 ], [ -151.986914, 60.373975 ], [ -152.020752, 60.361719 ] ] ], [ [ [ -160.329297, 55.337695 ], [ -160.343311, 55.258789 ], [ -160.480762, 55.308984 ], [ -160.51748, 55.333838 ], [ -160.49292, 55.352344 ], [ -160.362305, 55.356982 ], [ -160.329297, 55.337695 ] ] ], [ [ [ -159.362012, 54.972412 ], [ -159.394482, 54.967334 ], [ -159.421338, 54.978125 ], [ -159.458496, 55.034961 ], [ -159.461914, 55.058789 ], [ -159.39043, 55.040869 ], [ -159.363184, 54.999512 ], [ -159.362012, 54.972412 ] ] ], [ [ [ -159.515137, 55.151855 ], [ -159.52041, 55.072168 ], [ -159.534961, 55.059619 ], [ -159.561475, 55.080908 ], [ -159.617725, 55.057324 ], [ -159.648486, 55.074561 ], [ -159.6354, 55.102344 ], [ -159.639648, 55.123975 ], [ -159.597949, 55.125684 ], [ -159.588037, 55.165332 ], [ -159.595264, 55.182031 ], [ -159.574756, 55.217725 ], [ -159.545068, 55.225977 ], [ -159.515137, 55.151855 ] ] ], [ [ [ -166.209766, 53.723291 ], [ -166.223828, 53.72041 ], [ -166.249414, 53.745166 ], [ -166.250732, 53.767773 ], [ -166.234375, 53.78418 ], [ -166.187744, 53.822461 ], [ -166.154541, 53.836133 ], [ -166.113721, 53.843066 ], [ -166.102686, 53.832813 ], [ -166.138623, 53.787402 ], [ -166.18374, 53.756885 ], [ -166.209766, 53.723291 ] ] ], [ [ [ -176.008984, 51.812354 ], [ -176.093359, 51.790479 ], [ -176.204443, 51.834814 ], [ -176.193652, 51.886279 ], [ -176.071631, 51.843311 ], [ -176.008984, 51.812354 ] ] ], [ [ [ -166.109863, 66.227441 ], [ -166.148633, 66.221826 ], [ -166.146484, 66.237158 ], [ -166.03252, 66.277734 ], [ -165.822217, 66.328076 ], [ -165.829883, 66.317139 ], [ -165.942285, 66.278174 ], [ -166.109863, 66.227441 ] ] ], [ [ [ -171.463037, 63.640039 ], [ -171.447852, 63.615674 ], [ -171.343359, 63.619629 ], [ -171.196924, 63.609131 ], [ -171.034863, 63.585498 ], [ -170.874609, 63.593994 ], [ -170.67251, 63.668848 ], [ -170.551855, 63.688477 ], [ -170.43042, 63.698828 ], [ -170.299365, 63.680615 ], [ -170.171289, 63.640918 ], [ -170.121826, 63.617529 ], [ -170.082422, 63.57666 ], [ -170.056299, 63.527197 ], [ -170.017383, 63.491748 ], [ -169.777441, 63.447998 ], [ -169.624121, 63.430566 ], [ -169.587207, 63.406592 ], [ -169.554541, 63.373486 ], [ -169.427588, 63.34834 ], [ -169.295068, 63.35752 ], [ -169.221094, 63.348584 ], [ -168.996045, 63.347314 ], [ -168.716016, 63.310596 ], [ -168.761328, 63.21377 ], [ -168.852393, 63.17124 ], [ -169.109033, 63.184912 ], [ -169.364697, 63.171143 ], [ -169.47085, 63.121289 ], [ -169.559277, 63.058203 ], [ -169.571289, 62.996777 ], [ -169.622852, 62.968555 ], [ -169.676367, 62.956104 ], [ -169.719824, 62.990088 ], [ -169.777783, 63.09375 ], [ -169.818604, 63.122363 ], [ -169.863428, 63.140381 ], [ -169.988477, 63.173145 ], [ -170.115381, 63.193848 ], [ -170.1896, 63.196338 ], [ -170.243115, 63.232275 ], [ -170.272705, 63.284277 ], [ -170.323535, 63.311133 ], [ -170.42417, 63.349268 ], [ -170.5271, 63.379297 ], [ -170.848389, 63.444385 ], [ -170.954053, 63.45293 ], [ -171.06123, 63.445898 ], [ -171.176025, 63.416211 ], [ -171.287305, 63.372168 ], [ -171.401172, 63.339258 ], [ -171.519141, 63.331982 ], [ -171.631836, 63.351221 ], [ -171.737842, 63.394238 ], [ -171.790967, 63.424707 ], [ -171.819385, 63.477246 ], [ -171.81792, 63.529834 ], [ -171.803516, 63.580518 ], [ -171.746387, 63.703076 ], [ -171.646484, 63.727002 ], [ -171.463037, 63.640039 ] ] ], [ [ [ -166.135449, 60.383545 ], [ -166.043652, 60.333936 ], [ -165.994922, 60.331152 ], [ -165.840918, 60.34624 ], [ -165.784473, 60.335596 ], [ -165.729688, 60.314209 ], [ -165.695801, 60.281543 ], [ -165.689355, 60.224121 ], [ -165.714404, 60.172852 ], [ -165.706934, 60.100586 ], [ -165.712354, 60.069336 ], [ -165.630566, 60.028369 ], [ -165.605029, 59.972803 ], [ -165.591797, 59.913135 ], [ -165.769287, 59.893213 ], [ -165.946729, 59.890039 ], [ -166.099854, 59.849609 ], [ -166.131201, 59.819775 ], [ -166.106689, 59.775439 ], [ -166.14873, 59.764111 ], [ -166.187549, 59.773828 ], [ -166.261621, 59.814893 ], [ -166.342969, 59.834424 ], [ -166.627637, 59.864648 ], [ -166.985059, 59.983887 ], [ -167.138867, 60.008545 ], [ -167.295117, 60.095703 ], [ -167.436426, 60.206641 ], [ -167.344336, 60.224463 ], [ -167.251709, 60.233545 ], [ -166.836328, 60.216992 ], [ -166.784375, 60.296436 ], [ -166.730957, 60.31626 ], [ -166.598975, 60.33877 ], [ -166.475684, 60.382764 ], [ -166.420361, 60.381689 ], [ -166.363867, 60.364746 ], [ -166.246973, 60.391162 ], [ -166.184961, 60.396777 ], [ -166.135449, 60.383545 ] ] ], [ [ [ -152.898047, 57.823926 ], [ -152.89082, 57.768994 ], [ -152.850146, 57.775684 ], [ -152.69624, 57.832275 ], [ -152.616016, 57.848877 ], [ -152.511572, 57.851465 ], [ -152.42876, 57.825684 ], [ -152.411914, 57.805908 ], [ -152.419141, 57.782324 ], [ -152.4854, 57.734424 ], [ -152.482617, 57.70332 ], [ -152.411475, 57.646094 ], [ -152.236523, 57.614893 ], [ -152.215283, 57.597705 ], [ -152.216211, 57.577002 ], [ -152.33667, 57.482227 ], [ -152.380859, 57.460107 ], [ -152.412207, 57.454785 ], [ -152.630957, 57.471826 ], [ -152.831152, 57.502881 ], [ -152.912158, 57.508154 ], [ -152.940771, 57.498096 ], [ -152.997461, 57.468945 ], [ -152.956836, 57.460352 ], [ -152.781348, 57.453418 ], [ -152.719531, 57.41084 ], [ -152.692529, 57.37959 ], [ -152.679053, 57.345117 ], [ -152.714063, 57.330957 ], [ -152.789111, 57.320654 ], [ -152.879053, 57.320801 ], [ -152.990283, 57.281982 ], [ -153.051611, 57.237646 ], [ -153.274365, 57.226367 ], [ -153.443701, 57.167187 ], [ -153.503564, 57.137988 ], [ -153.524414, 57.103076 ], [ -153.588281, 57.077686 ], [ -153.732568, 57.052344 ], [ -153.646533, 57.02959 ], [ -153.633057, 57.010352 ], [ -153.631445, 56.983691 ], [ -153.643311, 56.960742 ], [ -153.757227, 56.85835 ], [ -153.972705, 56.774219 ], [ -154.027344, 56.777979 ], [ -154.050781, 56.788477 ], [ -154.07002, 56.804541 ], [ -154.07085, 56.820654 ], [ -153.793213, 56.989502 ], [ -153.804199, 56.997803 ], [ -153.879736, 57.003516 ], [ -153.999365, 57.049951 ], [ -154.083789, 57.020068 ], [ -154.102979, 57.02124 ], [ -154.080469, 57.061035 ], [ -154.025439, 57.108496 ], [ -154.035059, 57.121826 ], [ -154.065332, 57.133691 ], [ -154.134863, 57.140771 ], [ -154.24375, 57.143018 ], [ -154.324414, 57.131787 ], [ -154.376807, 57.107031 ], [ -154.381104, 57.096533 ], [ -154.269531, 57.099463 ], [ -154.239209, 57.086865 ], [ -154.209131, 57.06333 ], [ -154.19082, 57.036133 ], [ -154.184326, 57.005322 ], [ -154.207715, 56.963818 ], [ -154.260938, 56.911768 ], [ -154.338965, 56.920898 ], [ -154.498779, 57.036572 ], [ -154.569336, 57.205908 ], [ -154.705957, 57.335352 ], [ -154.712207, 57.36626 ], [ -154.673193, 57.446094 ], [ -154.535303, 57.559424 ], [ -154.387061, 57.590479 ], [ -154.281445, 57.638086 ], [ -154.179346, 57.652441 ], [ -154.116162, 57.651221 ], [ -154.029834, 57.630713 ], [ -153.99502, 57.587305 ], [ -154.015869, 57.566895 ], [ -154.00791, 57.556152 ], [ -153.947363, 57.530078 ], [ -153.881885, 57.439014 ], [ -153.80542, 57.358203 ], [ -153.75459, 57.325342 ], [ -153.687695, 57.305127 ], [ -153.756934, 57.366846 ], [ -153.797803, 57.443262 ], [ -153.818359, 57.595605 ], [ -153.838135, 57.63584 ], [ -153.799463, 57.64668 ], [ -153.690137, 57.640723 ], [ -153.693164, 57.663428 ], [ -153.808496, 57.714746 ], [ -153.879443, 57.757178 ], [ -153.906104, 57.790771 ], [ -153.904443, 57.819873 ], [ -153.841553, 57.862842 ], [ -153.805811, 57.875098 ], [ -153.768994, 57.880371 ], [ -153.695605, 57.87124 ], [ -153.662646, 57.857813 ], [ -153.568555, 57.761084 ], [ -153.524463, 57.731006 ], [ -153.487939, 57.730957 ], [ -153.454053, 57.747021 ], [ -153.422705, 57.77915 ], [ -153.39043, 57.798389 ], [ -153.357129, 57.804688 ], [ -153.252393, 57.790479 ], [ -153.21748, 57.795752 ], [ -153.200293, 57.82002 ], [ -153.201025, 57.863281 ], [ -153.175195, 57.878857 ], [ -153.168848, 57.910645 ], [ -153.225928, 57.957617 ], [ -153.160449, 57.971973 ], [ -152.943262, 57.936035 ], [ -152.850391, 57.896777 ], [ -152.898047, 57.823926 ] ] ], [ [ [ -130.025098, 55.888232 ], [ -130.074658, 55.836035 ], [ -130.111963, 55.779785 ], [ -130.137061, 55.719385 ], [ -130.146533, 55.654492 ], [ -130.14043, 55.58501 ], [ -130.12041, 55.524414 ], [ -130.059473, 55.412305 ], [ -130.039258, 55.343604 ], [ -130.036572, 55.2979 ], [ -130.171826, 55.137012 ], [ -130.218506, 55.060254 ], [ -130.214063, 55.025879 ], [ -130.312549, 54.945947 ], [ -130.493262, 54.83418 ], [ -130.575342, 54.769678 ], [ -130.61582, 54.790918 ], [ -130.849609, 54.807617 ], [ -130.934619, 54.950391 ], [ -130.979688, 55.061182 ], [ -131.047852, 55.157666 ], [ -131.045898, 55.17959 ], [ -130.983936, 55.243945 ], [ -130.750391, 55.296973 ], [ -130.748193, 55.318018 ], [ -130.835059, 55.33208 ], [ -130.855957, 55.355127 ], [ -130.879785, 55.459521 ], [ -130.873389, 55.551123 ], [ -130.879639, 55.611816 ], [ -130.918555, 55.735986 ], [ -130.977002, 55.811963 ], [ -131.127686, 55.960156 ], [ -131.140381, 55.99751 ], [ -131.074023, 56.044385 ], [ -131.032764, 56.088086 ], [ -131.287598, 56.012109 ], [ -131.635254, 55.932227 ], [ -131.78418, 55.876562 ], [ -131.815479, 55.854199 ], [ -131.826172, 55.835352 ], [ -131.799072, 55.782812 ], [ -131.803271, 55.765967 ], [ -131.833594, 55.734912 ], [ -131.869434, 55.647168 ], [ -131.94502, 55.55415 ], [ -131.983398, 55.53501 ], [ -132.118994, 55.569775 ], [ -132.15542, 55.599561 ], [ -132.223437, 55.721045 ], [ -132.20752, 55.753418 ], [ -132.157959, 55.780664 ], [ -132.090674, 55.839551 ], [ -132.005713, 55.930078 ], [ -131.843848, 56.160107 ], [ -131.738037, 56.16123 ], [ -131.551367, 56.206787 ], [ -131.844238, 56.229639 ], [ -131.887891, 56.24165 ], [ -131.927295, 56.272998 ], [ -131.962305, 56.323682 ], [ -132.021924, 56.380078 ], [ -132.133252, 56.399854 ], [ -132.182031, 56.420654 ], [ -132.255566, 56.489111 ], [ -132.30498, 56.519873 ], [ -132.332031, 56.55791 ], [ -132.33667, 56.603125 ], [ -132.357666, 56.625879 ], [ -132.434424, 56.634131 ], [ -132.475928, 56.649658 ], [ -132.487109, 56.766406 ], [ -132.639502, 56.796436 ], [ -132.701953, 56.822266 ], [ -132.802197, 56.895166 ], [ -132.829883, 56.930615 ], [ -132.838818, 56.960205 ], [ -132.814258, 57.040723 ], [ -132.824609, 57.055811 ], [ -132.913428, 57.047461 ], [ -133.465869, 57.172168 ], [ -133.43667, 57.336865 ], [ -133.538965, 57.55415 ], [ -133.64873, 57.642285 ], [ -133.626953, 57.676514 ], [ -133.603369, 57.694678 ], [ -133.554199, 57.695068 ], [ -133.342334, 57.631104 ], [ -133.142822, 57.555127 ], [ -133.117041, 57.566211 ], [ -133.435742, 57.727051 ], [ -133.515479, 57.775146 ], [ -133.535205, 57.832959 ], [ -133.536426, 57.863867 ], [ -133.511133, 57.880127 ], [ -133.212061, 57.865674 ], [ -133.194336, 57.877686 ], [ -133.497412, 57.924658 ], [ -133.559375, 57.924463 ], [ -133.625732, 57.856982 ], [ -133.657275, 57.841016 ], [ -133.722314, 57.844238 ], [ -133.744141, 57.85459 ], [ -133.821387, 57.936377 ], [ -133.894482, 57.993262 ], [ -134.031104, 58.072168 ], [ -134.056738, 58.128369 ], [ -134.06333, 58.211084 ], [ -134.045264, 58.289258 ], [ -133.933643, 58.467871 ], [ -133.888525, 58.49873 ], [ -133.876758, 58.518164 ], [ -133.911133, 58.515234 ], [ -133.943848, 58.498291 ], [ -134.036133, 58.415332 ], [ -134.131201, 58.279346 ], [ -134.208838, 58.232959 ], [ -134.257617, 58.244189 ], [ -134.331445, 58.299609 ], [ -134.485449, 58.367188 ], [ -134.663623, 58.384717 ], [ -134.776123, 58.453857 ], [ -134.942529, 58.646289 ], [ -134.964795, 58.742188 ], [ -134.986133, 58.765625 ], [ -135.076465, 58.796777 ], [ -135.131836, 58.842871 ], [ -135.217383, 59.076611 ], [ -135.330322, 59.239063 ], [ -135.358447, 59.324902 ], [ -135.348926, 59.410059 ], [ -135.363672, 59.419434 ], [ -135.402539, 59.353076 ], [ -135.412744, 59.318457 ], [ -135.484082, 59.308691 ], [ -135.416943, 59.241504 ], [ -135.400146, 59.20791 ], [ -135.43374, 59.210693 ], [ -135.502344, 59.202295 ], [ -135.386133, 59.087549 ], [ -135.334082, 58.909619 ], [ -135.257031, 58.777734 ], [ -135.20708, 58.670898 ], [ -135.18457, 58.589746 ], [ -135.151904, 58.512207 ], [ -135.062012, 58.340869 ], [ -135.049707, 58.306787 ], [ -135.060498, 58.278906 ], [ -135.090234, 58.24585 ], [ -135.141553, 58.233398 ], [ -135.302539, 58.255908 ], [ -135.363135, 58.298291 ], [ -135.449951, 58.376123 ], [ -135.571777, 58.412061 ], [ -135.873437, 58.394238 ], [ -135.897559, 58.400195 ], [ -135.896338, 58.463818 ], [ -135.861719, 58.577051 ], [ -135.889551, 58.622705 ], [ -136.045508, 58.789111 ], [ -136.043115, 58.821631 ], [ -135.826367, 58.897949 ], [ -135.931689, 58.90376 ], [ -136.016602, 58.873975 ], [ -136.049365, 58.893213 ], [ -136.100635, 58.999854 ], [ -136.133691, 59.039551 ], [ -136.150049, 59.048096 ], [ -136.159473, 58.946777 ], [ -136.123535, 58.893457 ], [ -136.118408, 58.862598 ], [ -136.12417, 58.819629 ], [ -136.146826, 58.788818 ], [ -136.186328, 58.770166 ], [ -136.22583, 58.765479 ], [ -136.299023, 58.786914 ], [ -136.380273, 58.827295 ], [ -136.451172, 58.846338 ], [ -136.477588, 58.8625 ], [ -136.511182, 58.90708 ], [ -136.566211, 58.940918 ], [ -136.830957, 58.983838 ], [ -136.989014, 59.034473 ], [ -137.002148, 59.021143 ], [ -136.952832, 58.966943 ], [ -136.948047, 58.934912 ], [ -136.987891, 58.925146 ], [ -137.059033, 58.87373 ], [ -137.038379, 58.86665 ], [ -136.963037, 58.883545 ], [ -136.879102, 58.881543 ], [ -136.740137, 58.850195 ], [ -136.613916, 58.809277 ], [ -136.568213, 58.786328 ], [ -136.549316, 58.752393 ], [ -136.533496, 58.740234 ], [ -136.410107, 58.700635 ], [ -136.404199, 58.679785 ], [ -136.48374, 58.617676 ], [ -136.319873, 58.624463 ], [ -136.224609, 58.602246 ], [ -136.102881, 58.506299 ], [ -136.061475, 58.452734 ], [ -136.055957, 58.38418 ], [ -136.08125, 58.364209 ], [ -136.129639, 58.350391 ], [ -136.462402, 58.327979 ], [ -136.582617, 58.245215 ], [ -136.607422, 58.243994 ], [ -136.698926, 58.266455 ], [ -136.86499, 58.332422 ], [ -137.071924, 58.395215 ], [ -137.543994, 58.581201 ], [ -137.556934, 58.589941 ], [ -137.5646, 58.625879 ], [ -137.59707, 58.644238 ], [ -137.661084, 58.659912 ], [ -137.75, 58.70708 ], [ -137.863721, 58.785547 ], [ -137.933984, 58.846875 ], [ -137.960889, 58.891016 ], [ -138.026904, 58.941455 ], [ -138.240723, 59.046826 ], [ -138.35249, 59.087305 ], [ -138.451318, 59.110107 ], [ -138.537158, 59.115088 ], [ -138.560303, 59.12915 ], [ -138.520703, 59.152246 ], [ -138.514893, 59.165918 ], [ -138.704199, 59.187549 ], [ -138.884326, 59.236914 ], [ -139.340967, 59.375635 ], [ -139.576807, 59.462451 ], [ -139.714453, 59.503955 ], [ -139.773291, 59.527295 ], [ -139.799121, 59.54624 ], [ -139.766064, 59.566064 ], [ -139.674121, 59.586816 ], [ -139.611621, 59.610303 ], [ -139.513037, 59.698096 ], [ -139.505566, 59.726318 ], [ -139.558496, 59.790186 ], [ -139.582178, 59.848291 ], [ -139.581152, 59.880518 ], [ -139.569141, 59.912354 ], [ -139.554102, 59.933301 ], [ -139.512305, 59.953564 ], [ -139.483008, 59.96377 ], [ -139.446875, 59.956836 ], [ -139.330957, 59.877002 ], [ -139.314648, 59.847949 ], [ -139.32002, 59.738721 ], [ -139.286719, 59.610937 ], [ -139.27627, 59.620361 ], [ -139.265625, 59.662598 ], [ -139.25874, 59.743311 ], [ -139.245703, 59.78208 ], [ -139.220801, 59.819873 ], [ -139.178857, 59.839844 ], [ -139.048291, 59.828223 ], [ -138.988086, 59.83501 ], [ -139.24248, 59.892773 ], [ -139.40249, 60.000977 ], [ -139.431445, 60.012256 ], [ -139.518945, 60.01709 ], [ -139.61167, 59.973438 ], [ -139.850195, 59.830713 ], [ -139.916895, 59.805664 ], [ -140.216748, 59.72666 ], [ -140.419824, 59.710742 ], [ -140.648389, 59.723193 ], [ -140.843164, 59.748877 ], [ -141.331934, 59.873779 ], [ -141.408301, 59.902783 ], [ -141.294629, 59.980029 ], [ -141.289941, 60.00415 ], [ -141.329541, 60.082813 ], [ -141.362158, 60.105273 ], [ -141.40874, 60.117676 ], [ -141.42168, 60.108838 ], [ -141.422168, 60.085498 ], [ -141.409717, 60.042285 ], [ -141.44707, 60.019434 ], [ -141.530176, 59.994775 ], [ -141.670166, 59.969873 ], [ -142.104102, 60.033447 ], [ -142.548584, 60.086035 ], [ -142.945654, 60.096973 ], [ -143.506104, 60.055029 ], [ -143.805078, 60.012891 ], [ -143.979492, 60.008789 ], [ -144.147217, 60.016406 ], [ -144.160937, 60.045801 ], [ -144.084277, 60.063037 ], [ -144.088525, 60.084326 ], [ -144.185498, 60.150732 ], [ -144.332617, 60.191016 ], [ -144.52998, 60.205225 ], [ -144.642969, 60.224658 ], [ -144.671582, 60.249219 ], [ -144.741406, 60.272705 ], [ -144.852441, 60.295068 ], [ -144.901318, 60.335156 ], [ -144.862451, 60.45918 ], [ -144.824414, 60.533594 ], [ -144.786572, 60.584619 ], [ -144.691113, 60.669092 ], [ -144.724414, 60.662842 ], [ -144.863086, 60.600879 ], [ -144.984033, 60.536914 ], [ -145.095996, 60.453662 ], [ -145.162695, 60.415381 ], [ -145.248291, 60.380127 ], [ -145.381787, 60.388574 ], [ -145.563135, 60.440723 ], [ -145.718457, 60.467578 ], [ -145.847754, 60.469238 ], [ -145.898877, 60.478174 ], [ -145.810645, 60.524658 ], [ -145.759814, 60.562012 ], [ -145.690234, 60.621973 ], [ -145.674902, 60.651123 ], [ -146.149023, 60.660693 ], [ -146.166406, 60.692285 ], [ -146.16709, 60.715527 ], [ -146.182324, 60.734766 ], [ -146.251025, 60.749072 ], [ -146.347168, 60.738135 ], [ -146.502979, 60.700781 ], [ -146.570459, 60.72915 ], [ -146.546387, 60.745117 ], [ -146.495508, 60.756787 ], [ -146.391992, 60.81084 ], [ -146.531934, 60.838867 ], [ -146.603564, 60.870947 ], [ -146.638428, 60.897314 ], [ -146.636035, 60.992529 ], [ -146.599121, 61.053516 ], [ -146.284912, 61.112646 ], [ -146.384375, 61.13584 ], [ -146.582715, 61.127832 ], [ -146.715918, 61.077539 ], [ -146.874023, 61.004883 ], [ -146.980176, 60.977783 ], [ -147.034326, 60.996191 ], [ -147.105957, 61.002539 ], [ -147.19502, 60.996826 ], [ -147.254883, 60.978271 ], [ -147.285596, 60.946777 ], [ -147.321094, 60.925488 ], [ -147.361377, 60.914502 ], [ -147.390576, 60.918018 ], [ -147.433398, 60.950293 ], [ -147.523291, 60.970312 ], [ -147.567285, 60.994922 ], [ -147.592578, 60.979443 ], [ -147.623291, 60.933008 ], [ -147.655664, 60.909521 ], [ -147.807617, 60.8854 ], [ -147.891113, 60.889893 ], [ -147.990771, 60.948291 ], [ -148.005127, 60.968555 ], [ -147.971191, 61.019043 ], [ -147.751855, 61.218945 ], [ -147.773779, 61.217822 ], [ -147.844824, 61.186377 ], [ -147.986377, 61.106494 ], [ -148.049414, 61.082666 ], [ -148.15791, 61.079687 ], [ -148.208691, 61.088281 ], [ -148.27002, 61.081787 ], [ -148.341895, 61.0604 ], [ -148.38877, 61.036963 ], [ -148.410742, 61.011475 ], [ -148.39585, 61.007129 ], [ -148.287402, 61.03623 ], [ -148.225879, 61.044043 ], [ -148.208691, 61.029932 ], [ -148.293164, 60.939697 ], [ -148.344434, 60.853564 ], [ -148.393311, 60.831885 ], [ -148.471045, 60.835498 ], [ -148.556152, 60.827002 ], [ -148.557373, 60.80293 ], [ -148.398682, 60.734033 ], [ -148.34126, 60.724316 ], [ -148.267871, 60.699707 ], [ -148.256738, 60.675293 ], [ -148.284229, 60.609326 ], [ -148.30498, 60.58335 ], [ -148.338428, 60.569824 ], [ -148.467773, 60.57207 ], [ -148.50957, 60.565234 ], [ -148.596631, 60.523779 ], [ -148.640137, 60.489453 ], [ -148.624268, 60.486426 ], [ -148.549121, 60.514795 ], [ -148.439844, 60.52998 ], [ -148.296387, 60.53208 ], [ -148.189453, 60.547119 ], [ -148.119189, 60.575146 ], [ -148.050684, 60.567188 ], [ -147.984033, 60.52334 ], [ -147.964111, 60.484863 ], [ -147.990967, 60.451855 ], [ -148.045996, 60.42832 ], [ -148.129199, 60.414209 ], [ -148.181689, 60.393066 ], [ -148.203564, 60.364941 ], [ -148.215869, 60.323145 ], [ -148.218652, 60.267676 ], [ -148.197607, 60.167773 ], [ -148.21377, 60.154248 ], [ -148.24502, 60.146826 ], [ -148.291357, 60.145459 ], [ -148.333105, 60.122021 ], [ -148.430713, 59.989111 ], [ -148.465088, 59.974707 ], [ -148.506055, 59.988965 ], [ -148.542383, 59.987402 ], [ -148.574072, 59.970068 ], [ -148.643604, 59.956836 ], [ -148.750879, 59.947754 ], [ -148.842725, 59.951221 ], [ -149.004248, 59.97998 ], [ -149.070117, 60.000244 ], [ -149.121582, 60.033496 ], [ -149.266602, 59.998291 ], [ -149.304932, 60.013672 ], [ -149.395264, 60.105762 ], [ -149.414844, 60.100244 ], [ -149.432227, 60.001025 ], [ -149.459717, 59.96626 ], [ -149.54917, 59.894336 ], [ -149.598047, 59.770459 ], [ -149.612891, 59.766846 ], [ -149.629639, 59.784668 ], [ -149.684668, 59.895313 ], [ -149.713867, 59.91958 ], [ -149.794775, 59.855811 ], [ -149.803662, 59.832715 ], [ -149.782471, 59.750342 ], [ -149.80127, 59.737939 ], [ -149.96499, 59.782275 ], [ -150.005322, 59.784424 ], [ -150.015967, 59.776953 ], [ -149.960156, 59.713037 ], [ -149.966504, 59.690039 ], [ -150.198047, 59.566553 ], [ -150.258496, 59.570947 ], [ -150.296484, 59.583252 ], [ -150.338135, 59.581348 ], [ -150.485352, 59.535303 ], [ -150.525977, 59.537305 ], [ -150.581543, 59.5646 ], [ -150.607373, 59.563379 ], [ -150.621143, 59.535059 ], [ -150.6229, 59.479639 ], [ -150.677441, 59.426953 ], [ -150.852783, 59.341846 ], [ -150.899316, 59.302686 ], [ -150.934521, 59.249121 ], [ -150.960742, 59.243994 ], [ -151.063574, 59.278418 ], [ -151.182764, 59.300781 ], [ -151.199219, 59.289648 ], [ -151.163037, 59.256934 ], [ -151.170703, 59.236914 ], [ -151.222266, 59.229395 ], [ -151.2875, 59.232324 ], [ -151.366357, 59.245605 ], [ -151.477002, 59.230566 ], [ -151.619385, 59.187305 ], [ -151.738184, 59.188525 ], [ -151.903857, 59.259766 ], [ -151.949512, 59.265088 ], [ -151.964063, 59.285107 ], [ -151.931689, 59.342725 ], [ -151.884619, 59.386328 ], [ -151.849951, 59.406348 ], [ -151.692578, 59.462207 ], [ -151.512695, 59.482715 ], [ -151.399609, 59.516309 ], [ -151.262109, 59.585596 ], [ -151.189404, 59.637695 ], [ -151.046484, 59.771826 ], [ -151.057324, 59.782178 ], [ -151.089453, 59.789404 ], [ -151.403662, 59.662256 ], [ -151.450098, 59.650391 ], [ -151.512598, 59.65127 ], [ -151.763818, 59.7 ], [ -151.816943, 59.720898 ], [ -151.853223, 59.78208 ], [ -151.783447, 59.921143 ], [ -151.734521, 59.98833 ], [ -151.611865, 60.092041 ], [ -151.451465, 60.202637 ], [ -151.395996, 60.274463 ], [ -151.312695, 60.466455 ], [ -151.317529, 60.553564 ], [ -151.355029, 60.659863 ], [ -151.356445, 60.722949 ], [ -151.321777, 60.74292 ], [ -150.95376, 60.841211 ], [ -150.779492, 60.914795 ], [ -150.44126, 61.023584 ], [ -150.349121, 61.022656 ], [ -150.281494, 60.985205 ], [ -150.202783, 60.955225 ], [ -150.113037, 60.932812 ], [ -149.997559, 60.935156 ], [ -149.85625, 60.962256 ], [ -149.632471, 60.952002 ], [ -149.172852, 60.88042 ], [ -149.075098, 60.876416 ], [ -149.071289, 60.885547 ], [ -149.142236, 60.935693 ], [ -149.459131, 60.964746 ], [ -149.59248, 60.993848 ], [ -149.967725, 61.121729 ], [ -150.053271, 61.171094 ], [ -150.018555, 61.194238 ], [ -149.926758, 61.213281 ], [ -149.895312, 61.231738 ], [ -149.882031, 61.263721 ], [ -149.829199, 61.30752 ], [ -149.736914, 61.36333 ], [ -149.595996, 61.417285 ], [ -149.329053, 61.497363 ], [ -149.433545, 61.500781 ], [ -149.625439, 61.486035 ], [ -149.695264, 61.470703 ], [ -149.82373, 61.413379 ], [ -149.873682, 61.372998 ], [ -149.945215, 61.294238 ], [ -149.975684, 61.279346 ], [ -150.108936, 61.26792 ], [ -150.471777, 61.259961 ], [ -150.533203, 61.300244 ], [ -150.567236, 61.306787 ], [ -150.612256, 61.301123 ], [ -150.945508, 61.198242 ], [ -151.06499, 61.145703 ], [ -151.150146, 61.08584 ], [ -151.281885, 61.041943 ], [ -151.460107, 61.014111 ], [ -151.593506, 60.979639 ], [ -151.733984, 60.910742 ], [ -151.781641, 60.857959 ], [ -151.784424, 60.833154 ], [ -151.750488, 60.754883 ], [ -151.785107, 60.740234 ], [ -151.866162, 60.734082 ], [ -151.99624, 60.682227 ], [ -152.270703, 60.528125 ], [ -152.306592, 60.472217 ], [ -152.305078, 60.453027 ], [ -152.260303, 60.409424 ], [ -152.291504, 60.381104 ], [ -152.368848, 60.336328 ], [ -152.540918, 60.26543 ], [ -152.653955, 60.238428 ], [ -152.727295, 60.237061 ], [ -152.7979, 60.247168 ], [ -152.923389, 60.292871 ], [ -153.025, 60.295654 ], [ -153.03125, 60.289258 ], [ -152.89292, 60.240381 ], [ -152.752393, 60.17749 ], [ -152.664746, 60.125293 ], [ -152.630127, 60.083789 ], [ -152.628564, 60.041113 ], [ -152.660107, 59.997217 ], [ -152.759473, 59.920898 ], [ -152.856934, 59.898096 ], [ -153.106055, 59.875049 ], [ -153.186377, 59.856885 ], [ -153.21123, 59.842725 ], [ -153.040088, 59.810498 ], [ -153.024609, 59.793994 ], [ -153.048145, 59.730029 ], [ -153.093604, 59.709131 ], [ -153.236182, 59.670947 ], [ -153.364014, 59.659863 ], [ -153.383496, 59.667187 ], [ -153.359619, 59.71748 ], [ -153.366455, 59.729834 ], [ -153.414404, 59.740137 ], [ -153.482617, 59.720947 ], [ -153.652539, 59.647021 ], [ -153.670703, 59.634814 ], [ -153.609375, 59.615039 ], [ -153.622266, 59.598486 ], [ -153.714355, 59.545264 ], [ -153.752588, 59.509863 ], [ -153.81416, 59.47373 ], [ -154.08833, 59.363281 ], [ -154.06748, 59.336377 ], [ -154.138818, 59.240137 ], [ -154.17832, 59.155566 ], [ -154.129834, 59.119873 ], [ -153.899561, 59.078027 ], [ -153.787939, 59.06792 ], [ -153.656396, 59.038672 ], [ -153.418262, 58.959961 ], [ -153.338965, 58.908545 ], [ -153.327051, 58.884326 ], [ -153.334424, 58.857861 ], [ -153.362939, 58.822217 ], [ -153.437598, 58.754834 ], [ -153.617334, 58.654736 ], [ -153.698584, 58.626367 ], [ -153.821484, 58.604102 ], [ -153.861963, 58.587842 ], [ -154.019873, 58.492969 ], [ -154.062451, 58.441748 ], [ -154.055713, 58.397168 ], [ -154.085889, 58.36582 ], [ -154.289014, 58.304346 ], [ -154.281787, 58.293457 ], [ -154.208057, 58.28877 ], [ -154.235107, 58.234619 ], [ -154.247021, 58.159424 ], [ -154.282275, 58.146777 ], [ -154.409229, 58.147314 ], [ -154.570605, 58.118066 ], [ -154.581934, 58.109766 ], [ -154.584912, 58.055664 ], [ -155.006885, 58.016064 ], [ -155.099268, 57.91333 ], [ -155.147363, 57.881836 ], [ -155.312744, 57.807129 ], [ -155.413965, 57.777051 ], [ -155.529639, 57.758887 ], [ -155.590234, 57.733594 ], [ -155.59585, 57.701074 ], [ -155.628711, 57.673047 ], [ -155.728955, 57.626611 ], [ -155.777979, 57.568213 ], [ -155.813672, 57.559033 ], [ -156.000195, 57.544971 ], [ -156.037354, 57.526514 ], [ -156.055371, 57.447559 ], [ -156.089893, 57.445068 ], [ -156.156006, 57.463428 ], [ -156.242188, 57.449219 ], [ -156.435889, 57.359961 ], [ -156.478418, 57.327881 ], [ -156.473682, 57.310693 ], [ -156.443555, 57.293652 ], [ -156.397656, 57.240576 ], [ -156.400488, 57.204834 ], [ -156.475146, 57.105176 ], [ -156.501318, 57.089795 ], [ -156.592041, 57.065088 ], [ -156.629004, 57.009961 ], [ -156.712646, 57.016064 ], [ -156.779883, 57.005615 ], [ -156.823877, 56.968848 ], [ -156.871729, 56.947656 ], [ -156.923438, 56.94209 ], [ -156.988428, 56.912939 ], [ -157.066699, 56.860205 ], [ -157.13916, 56.826563 ], [ -157.205762, 56.812061 ], [ -157.270557, 56.808496 ], [ -157.333594, 56.815869 ], [ -157.390234, 56.809814 ], [ -157.440576, 56.790332 ], [ -157.489648, 56.759766 ], [ -157.528711, 56.673193 ], [ -157.578369, 56.634473 ], [ -157.609766, 56.627686 ], [ -157.673877, 56.633447 ], [ -157.770703, 56.65166 ], [ -157.869092, 56.645215 ], [ -158.027881, 56.592139 ], [ -158.07832, 56.552051 ], [ -157.978271, 56.543164 ], [ -157.928711, 56.531689 ], [ -157.92998, 56.520459 ], [ -157.982178, 56.50957 ], [ -158.070947, 56.510352 ], [ -158.124365, 56.501025 ], [ -158.189404, 56.478174 ], [ -158.35249, 56.453516 ], [ -158.414404, 56.43584 ], [ -158.537402, 56.335449 ], [ -158.552148, 56.312695 ], [ -158.536377, 56.307666 ], [ -158.467334, 56.318262 ], [ -158.386133, 56.301563 ], [ -158.343994, 56.280322 ], [ -158.316992, 56.25415 ], [ -158.291406, 56.203662 ], [ -158.275635, 56.19624 ], [ -158.431836, 56.111475 ], [ -158.476123, 56.075488 ], [ -158.504687, 56.062109 ], [ -158.52334, 56.072461 ], [ -158.542676, 56.166846 ], [ -158.554443, 56.182861 ], [ -158.591162, 56.184521 ], [ -158.626758, 56.154688 ], [ -158.704883, 56.043115 ], [ -158.789844, 55.986914 ], [ -159.429443, 55.842725 ], [ -159.523242, 55.81001 ], [ -159.541309, 55.748486 ], [ -159.567627, 55.695215 ], [ -159.610059, 55.652783 ], [ -159.659668, 55.625928 ], [ -159.670264, 55.64502 ], [ -159.665332, 55.794873 ], [ -159.678516, 55.824658 ], [ -159.743018, 55.84375 ], [ -159.771387, 55.841113 ], [ -159.8104, 55.832715 ], [ -159.874365, 55.800293 ], [ -159.913525, 55.792187 ], [ -159.962305, 55.794873 ], [ -160.045654, 55.762939 ], [ -160.243799, 55.660547 ], [ -160.373193, 55.635107 ], [ -160.407422, 55.613818 ], [ -160.462695, 55.557812 ], [ -160.499316, 55.537305 ], [ -160.553516, 55.535498 ], [ -160.625244, 55.552393 ], [ -160.68291, 55.54043 ], [ -160.726514, 55.499658 ], [ -160.77085, 55.483545 ], [ -160.896729, 55.513623 ], [ -160.952197, 55.493066 ], [ -161.024219, 55.44043 ], [ -161.099512, 55.405713 ], [ -161.178027, 55.388867 ], [ -161.381934, 55.371289 ], [ -161.463867, 55.38252 ], [ -161.480518, 55.397803 ], [ -161.476709, 55.464893 ], [ -161.443799, 55.513281 ], [ -161.41333, 55.536133 ], [ -161.372705, 55.556299 ], [ -161.313281, 55.558643 ], [ -161.2021, 55.543555 ], [ -161.214697, 55.559766 ], [ -161.255127, 55.579004 ], [ -161.357471, 55.612207 ], [ -161.458789, 55.62915 ], [ -161.516943, 55.618408 ], [ -161.598779, 55.592822 ], [ -161.654297, 55.563379 ], [ -161.683545, 55.529932 ], [ -161.720361, 55.420703 ], [ -161.741553, 55.391162 ], [ -161.980322, 55.198633 ], [ -162.073975, 55.139307 ], [ -162.166602, 55.14375 ], [ -162.211475, 55.121338 ], [ -162.274658, 55.073242 ], [ -162.33291, 55.050244 ], [ -162.386377, 55.052344 ], [ -162.42793, 55.061475 ], [ -162.457471, 55.077686 ], [ -162.452393, 55.092822 ], [ -162.412549, 55.106885 ], [ -162.426807, 55.14541 ], [ -162.495264, 55.208447 ], [ -162.541895, 55.242725 ], [ -162.630371, 55.24668 ], [ -162.644141, 55.218018 ], [ -162.614307, 55.071484 ], [ -162.618896, 55.038428 ], [ -162.674365, 54.996582 ], [ -162.81958, 54.95 ], [ -162.865039, 54.954541 ], [ -162.995898, 55.046484 ], [ -163.119629, 55.064697 ], [ -163.127832, 55.034766 ], [ -163.100195, 54.973633 ], [ -163.131104, 54.916553 ], [ -163.220557, 54.863379 ], [ -163.288623, 54.837598 ], [ -163.335303, 54.83916 ], [ -163.337891, 54.876367 ], [ -163.296338, 54.949268 ], [ -163.285693, 55.009961 ], [ -163.305957, 55.058545 ], [ -163.303662, 55.09585 ], [ -163.278809, 55.121826 ], [ -163.114502, 55.193945 ], [ -163.045361, 55.204736 ], [ -163.008252, 55.186865 ], [ -162.961963, 55.183838 ], [ -162.906592, 55.195557 ], [ -162.871582, 55.218604 ], [ -162.857129, 55.253027 ], [ -162.78623, 55.29707 ], [ -162.658984, 55.350781 ], [ -162.513379, 55.45 ], [ -162.349365, 55.594727 ], [ -162.157129, 55.719434 ], [ -161.936621, 55.82417 ], [ -161.697314, 55.907227 ], [ -161.215625, 56.021436 ], [ -161.178613, 56.014453 ], [ -161.222559, 55.977441 ], [ -161.192529, 55.954297 ], [ -161.145166, 55.951318 ], [ -160.968652, 55.969629 ], [ -160.898633, 55.993652 ], [ -160.877832, 55.970508 ], [ -160.902393, 55.941309 ], [ -161.008398, 55.911719 ], [ -161.005371, 55.887158 ], [ -160.851318, 55.771875 ], [ -160.802832, 55.754443 ], [ -160.762598, 55.756592 ], [ -160.745508, 55.771484 ], [ -160.758398, 55.854639 ], [ -160.706348, 55.870459 ], [ -160.599707, 55.874316 ], [ -160.530225, 55.863477 ], [ -160.4979, 55.837891 ], [ -160.436914, 55.816699 ], [ -160.347314, 55.799902 ], [ -160.291699, 55.805078 ], [ -160.270117, 55.832178 ], [ -160.308496, 55.864453 ], [ -160.479883, 55.935449 ], [ -160.527441, 55.965039 ], [ -160.539063, 56.006299 ], [ -160.514697, 56.059131 ], [ -160.46084, 56.1375 ], [ -160.37749, 56.241455 ], [ -160.302051, 56.314111 ], [ -160.149268, 56.396338 ], [ -160.04624, 56.437012 ], [ -159.785059, 56.561621 ], [ -159.283105, 56.688574 ], [ -159.159033, 56.770068 ], [ -158.990381, 56.860059 ], [ -158.918018, 56.882178 ], [ -158.918018, 56.847412 ], [ -158.894873, 56.816406 ], [ -158.78208, 56.795752 ], [ -158.708838, 56.788574 ], [ -158.675146, 56.794873 ], [ -158.665918, 56.82793 ], [ -158.681055, 56.887744 ], [ -158.684814, 56.944238 ], [ -158.677246, 56.997363 ], [ -158.660791, 57.039404 ], [ -158.585596, 57.114063 ], [ -158.47373, 57.199072 ], [ -158.320947, 57.2979 ], [ -158.224512, 57.342676 ], [ -158.133545, 57.366406 ], [ -158.045703, 57.409473 ], [ -157.894336, 57.511377 ], [ -157.845752, 57.528076 ], [ -157.737207, 57.548145 ], [ -157.697412, 57.539258 ], [ -157.674023, 57.513721 ], [ -157.645557, 57.497803 ], [ -157.535303, 57.483447 ], [ -157.461914, 57.506201 ], [ -157.473877, 57.518213 ], [ -157.533496, 57.525879 ], [ -157.571631, 57.540674 ], [ -157.607568, 57.601465 ], [ -157.680664, 57.638086 ], [ -157.697217, 57.679443 ], [ -157.683984, 57.743896 ], [ -157.621191, 57.895215 ], [ -157.610889, 58.05083 ], [ -157.555029, 58.139941 ], [ -157.442676, 58.172168 ], [ -157.193701, 58.194189 ], [ -157.339404, 58.234521 ], [ -157.393604, 58.234814 ], [ -157.488379, 58.253711 ], [ -157.524414, 58.350732 ], [ -157.523633, 58.421338 ], [ -157.460889, 58.503027 ], [ -157.228857, 58.640918 ], [ -156.974658, 58.736328 ], [ -157.009033, 58.744189 ], [ -157.040479, 58.772559 ], [ -156.923242, 58.963672 ], [ -156.808887, 59.134277 ], [ -156.963379, 58.988867 ], [ -157.142041, 58.877637 ], [ -157.665723, 58.748486 ], [ -158.021924, 58.640186 ], [ -158.190918, 58.614258 ], [ -158.302588, 58.641797 ], [ -158.389648, 58.745654 ], [ -158.439307, 58.782617 ], [ -158.503174, 58.850342 ], [ -158.47627, 58.938379 ], [ -158.425635, 58.999316 ], [ -158.314502, 59.009326 ], [ -158.189209, 58.979932 ], [ -158.080518, 58.977441 ], [ -158.220605, 59.0375 ], [ -158.422803, 59.089844 ], [ -158.514404, 59.072852 ], [ -158.584473, 58.987793 ], [ -158.678271, 58.929395 ], [ -158.760596, 58.950098 ], [ -158.809473, 58.973877 ], [ -158.775537, 58.902539 ], [ -158.837744, 58.793945 ], [ -158.861377, 58.71875 ], [ -158.772119, 58.520313 ], [ -158.788623, 58.440967 ], [ -158.950684, 58.404541 ], [ -159.082666, 58.469775 ], [ -159.358203, 58.721289 ], [ -159.454199, 58.79292 ], [ -159.670264, 58.911133 ], [ -159.741455, 58.894287 ], [ -159.832227, 58.835986 ], [ -159.920215, 58.819873 ], [ -160.152588, 58.905908 ], [ -160.260791, 58.971533 ], [ -160.363135, 59.051172 ], [ -160.519922, 59.007324 ], [ -160.656641, 58.955078 ], [ -160.81709, 58.87168 ], [ -160.924268, 58.872412 ], [ -161.215918, 58.800977 ], [ -161.246826, 58.799463 ], [ -161.287891, 58.760937 ], [ -161.328125, 58.743701 ], [ -161.361328, 58.669531 ], [ -161.755469, 58.612012 ], [ -162.144922, 58.644238 ], [ -162.008691, 58.68501 ], [ -161.856494, 58.71709 ], [ -161.724365, 58.794287 ], [ -161.780518, 58.897412 ], [ -161.790283, 58.949951 ], [ -161.788672, 59.016406 ], [ -161.644385, 59.109668 ], [ -161.794482, 59.109473 ], [ -161.890771, 59.076074 ], [ -161.981055, 59.146143 ], [ -162.023291, 59.283984 ], [ -161.920117, 59.365479 ], [ -161.872217, 59.428271 ], [ -161.831689, 59.514502 ], [ -161.828711, 59.588623 ], [ -161.908643, 59.714111 ], [ -162.138135, 59.980029 ], [ -162.24248, 60.17832 ], [ -162.421338, 60.283984 ], [ -162.287793, 60.456885 ], [ -162.138867, 60.614355 ], [ -161.946582, 60.684814 ], [ -161.962012, 60.695361 ], [ -162.068262, 60.694873 ], [ -162.138037, 60.685547 ], [ -162.199902, 60.634326 ], [ -162.265039, 60.595215 ], [ -162.468701, 60.394678 ], [ -162.599707, 60.296973 ], [ -162.684961, 60.268945 ], [ -162.547705, 60.231055 ], [ -162.526953, 60.199121 ], [ -162.500488, 60.126562 ], [ -162.535645, 60.038379 ], [ -162.570752, 59.989746 ], [ -162.732617, 59.993652 ], [ -162.877832, 59.922754 ], [ -163.219385, 59.845605 ], [ -163.680371, 59.801514 ], [ -163.906885, 59.806787 ], [ -164.142822, 59.896777 ], [ -164.141113, 59.948877 ], [ -164.131543, 59.994238 ], [ -164.470508, 60.149316 ], [ -164.662256, 60.303809 ], [ -164.799951, 60.307227 ], [ -164.919727, 60.348438 ], [ -165.061133, 60.412549 ], [ -165.04873, 60.464258 ], [ -165.026514, 60.500635 ], [ -165.113281, 60.526074 ], [ -165.224512, 60.523584 ], [ -165.353809, 60.541211 ], [ -165.016016, 60.740039 ], [ -164.899805, 60.873145 ], [ -164.805176, 60.892041 ], [ -164.682373, 60.871533 ], [ -164.512939, 60.819043 ], [ -164.370068, 60.795898 ], [ -164.318506, 60.771289 ], [ -164.265674, 60.724658 ], [ -164.321387, 60.646631 ], [ -164.372363, 60.591846 ], [ -164.309668, 60.606738 ], [ -164.131836, 60.691504 ], [ -163.999561, 60.766064 ], [ -163.936133, 60.758301 ], [ -163.894922, 60.745166 ], [ -163.821387, 60.668262 ], [ -163.72998, 60.58999 ], [ -163.528711, 60.664551 ], [ -163.420947, 60.757422 ], [ -163.511865, 60.798145 ], [ -163.623047, 60.822217 ], [ -163.906543, 60.853809 ], [ -163.837305, 60.88042 ], [ -163.65542, 60.87749 ], [ -163.586914, 60.902979 ], [ -163.658936, 60.938232 ], [ -163.749023, 60.969727 ], [ -163.994629, 60.864697 ], [ -164.441553, 60.869971 ], [ -164.753955, 60.931299 ], [ -165.065625, 60.920654 ], [ -165.114844, 60.932812 ], [ -165.175488, 60.965674 ], [ -164.999902, 61.043652 ], [ -164.875586, 61.086768 ], [ -164.868994, 61.111768 ], [ -164.941211, 61.114893 ], [ -165.0771, 61.094189 ], [ -165.137695, 61.130127 ], [ -165.127783, 61.192432 ], [ -165.150049, 61.186865 ], [ -165.20376, 61.152832 ], [ -165.279785, 61.169629 ], [ -165.344873, 61.197705 ], [ -165.310791, 61.227637 ], [ -165.243945, 61.26875 ], [ -165.273633, 61.274854 ], [ -165.333691, 61.266113 ], [ -165.392041, 61.212305 ], [ -165.379297, 61.16875 ], [ -165.380762, 61.106299 ], [ -165.480469, 61.094873 ], [ -165.565869, 61.102344 ], [ -165.627588, 61.165186 ], [ -165.691357, 61.299902 ], [ -165.863965, 61.335693 ], [ -165.906299, 61.403809 ], [ -165.797119, 61.491162 ], [ -165.845313, 61.53623 ], [ -165.961328, 61.550879 ], [ -166.093994, 61.506738 ], [ -166.152734, 61.545947 ], [ -166.163525, 61.589014 ], [ -166.168115, 61.65083 ], [ -166.131152, 61.657324 ], [ -166.100488, 61.645068 ], [ -165.83457, 61.679395 ], [ -165.808936, 61.696094 ], [ -166.019922, 61.748291 ], [ -166.078809, 61.803125 ], [ -165.991406, 61.83418 ], [ -165.833838, 61.836816 ], [ -165.612793, 61.869287 ], [ -165.705811, 61.927441 ], [ -165.725244, 61.959375 ], [ -165.743945, 62.011719 ], [ -165.707275, 62.100439 ], [ -165.447656, 62.303906 ], [ -165.194531, 62.473535 ], [ -165.115625, 62.512695 ], [ -164.999707, 62.533789 ], [ -164.891846, 62.517578 ], [ -164.779199, 62.481152 ], [ -164.757861, 62.496729 ], [ -164.796094, 62.511621 ], [ -164.844385, 62.581055 ], [ -164.687988, 62.608252 ], [ -164.596289, 62.68667 ], [ -164.589453, 62.709375 ], [ -164.688965, 62.676758 ], [ -164.792676, 62.623193 ], [ -164.818652, 62.677051 ], [ -164.84541, 62.800977 ], [ -164.799658, 62.918066 ], [ -164.764062, 62.970605 ], [ -164.677441, 63.020459 ], [ -164.428125, 63.04043 ], [ -164.384229, 63.030469 ], [ -164.375098, 63.054004 ], [ -164.525195, 63.127637 ], [ -164.463281, 63.185205 ], [ -164.409033, 63.215039 ], [ -164.107617, 63.261719 ], [ -163.942871, 63.247217 ], [ -163.73623, 63.192822 ], [ -163.616309, 63.125146 ], [ -163.63374, 63.09043 ], [ -163.663574, 63.070313 ], [ -163.725732, 63.047803 ], [ -163.748975, 63.030322 ], [ -163.737842, 63.016406 ], [ -163.649365, 63.056787 ], [ -163.504346, 63.105859 ], [ -163.423193, 63.084521 ], [ -163.358838, 63.045752 ], [ -163.287842, 63.046436 ], [ -163.062256, 63.079736 ], [ -162.947705, 63.11499 ], [ -162.807764, 63.206592 ], [ -162.621484, 63.26582 ], [ -162.359814, 63.452588 ], [ -162.282813, 63.529199 ], [ -162.193311, 63.540967 ], [ -162.1125, 63.53418 ], [ -162.05625, 63.471338 ], [ -161.973975, 63.45293 ], [ -161.50542, 63.468164 ], [ -161.266016, 63.496973 ], [ -161.099707, 63.55791 ], [ -160.926709, 63.660547 ], [ -160.826514, 63.729346 ], [ -160.778564, 63.818945 ], [ -160.840479, 63.934912 ], [ -160.903955, 64.031201 ], [ -160.987549, 64.25127 ], [ -161.220117, 64.396582 ], [ -161.385693, 64.439941 ], [ -161.490723, 64.433789 ], [ -161.4146, 64.526367 ], [ -161.193066, 64.516406 ], [ -161.048779, 64.534473 ], [ -160.931934, 64.579102 ], [ -160.893701, 64.612891 ], [ -160.836035, 64.681934 ], [ -160.855908, 64.755615 ], [ -160.886963, 64.795557 ], [ -160.96748, 64.839551 ], [ -161.063232, 64.904004 ], [ -161.130176, 64.925439 ], [ -161.186914, 64.924023 ], [ -161.466357, 64.794873 ], [ -161.633984, 64.79248 ], [ -161.759375, 64.81626 ], [ -161.868311, 64.742676 ], [ -162.172266, 64.678076 ], [ -162.334619, 64.612842 ], [ -162.635742, 64.45083 ], [ -162.711084, 64.377539 ], [ -162.807031, 64.374219 ], [ -162.876416, 64.516406 ], [ -163.203906, 64.652002 ], [ -163.302832, 64.605908 ], [ -163.248291, 64.563281 ], [ -163.174072, 64.532959 ], [ -163.051758, 64.519727 ], [ -163.104492, 64.478613 ], [ -163.144336, 64.423828 ], [ -163.267041, 64.475195 ], [ -163.486182, 64.549805 ], [ -163.713086, 64.588232 ], [ -164.303955, 64.583936 ], [ -164.691846, 64.507422 ], [ -164.72749, 64.523291 ], [ -164.764941, 64.529639 ], [ -164.829541, 64.511377 ], [ -164.857275, 64.480322 ], [ -164.899512, 64.460645 ], [ -164.97876, 64.453662 ], [ -165.138135, 64.465234 ], [ -165.446191, 64.512842 ], [ -166.142773, 64.582764 ], [ -166.325098, 64.625732 ], [ -166.481396, 64.728076 ], [ -166.478125, 64.797559 ], [ -166.408691, 64.826953 ], [ -166.415234, 64.926514 ], [ -166.550879, 64.952979 ], [ -166.826953, 65.096094 ], [ -166.928418, 65.15708 ], [ -166.906396, 65.163818 ], [ -166.856787, 65.147266 ], [ -166.762549, 65.134912 ], [ -166.531006, 65.154736 ], [ -166.45166, 65.247314 ], [ -166.279687, 65.273779 ], [ -166.121484, 65.260742 ], [ -166.157031, 65.28584 ], [ -166.197412, 65.305566 ], [ -166.609375, 65.352734 ], [ -166.665381, 65.338281 ], [ -167.404004, 65.422119 ], [ -167.987256, 65.567773 ], [ -168.03501, 65.595605 ], [ -168.088379, 65.657764 ], [ -168.009668, 65.719141 ], [ -167.930566, 65.748145 ], [ -167.927002, 65.714355 ], [ -167.914355, 65.681201 ], [ -167.580029, 65.758301 ], [ -167.405322, 65.859326 ], [ -167.074219, 65.877051 ], [ -166.997217, 65.904932 ], [ -166.894434, 65.95918 ], [ -166.747656, 66.051855 ], [ -166.540137, 66.100635 ], [ -166.39873, 66.144434 ], [ -166.2146, 66.170264 ], [ -166.057422, 66.127246 ], [ -166.008936, 66.121338 ], [ -165.723682, 66.112549 ], [ -165.629932, 66.131201 ], [ -165.58999, 66.145117 ], [ -165.560205, 66.16709 ], [ -165.840234, 66.245068 ], [ -165.811865, 66.288477 ], [ -165.776172, 66.319043 ], [ -165.449414, 66.409912 ], [ -165.198291, 66.439941 ], [ -165.063965, 66.437842 ], [ -164.674121, 66.555029 ], [ -164.460498, 66.588428 ], [ -164.058252, 66.610742 ], [ -163.727686, 66.616455 ], [ -163.638232, 66.574658 ], [ -163.815723, 66.583496 ], [ -163.893945, 66.575879 ], [ -163.838232, 66.561572 ], [ -163.775488, 66.531104 ], [ -163.793701, 66.492627 ], [ -163.902881, 66.378369 ], [ -163.893945, 66.286914 ], [ -163.96499, 66.257324 ], [ -164.03374, 66.215527 ], [ -163.695361, 66.083838 ], [ -163.171436, 66.075439 ], [ -162.886475, 66.099219 ], [ -162.721777, 66.059814 ], [ -162.586865, 66.05083 ], [ -162.214258, 66.071045 ], [ -161.933691, 66.042871 ], [ -161.816309, 66.053662 ], [ -161.556836, 66.250537 ], [ -161.45542, 66.281396 ], [ -161.345068, 66.247168 ], [ -161.201074, 66.219385 ], [ -161.109229, 66.239502 ], [ -161.034277, 66.188818 ], [ -161.069531, 66.294629 ], [ -161.120313, 66.334326 ], [ -161.544434, 66.407031 ], [ -161.828174, 66.37085 ], [ -161.916895, 66.411816 ], [ -161.887598, 66.493066 ], [ -162.191162, 66.693115 ], [ -162.317725, 66.733691 ], [ -162.467432, 66.735645 ], [ -162.543652, 66.805127 ], [ -162.607422, 66.894385 ], [ -162.47832, 66.930811 ], [ -162.361621, 66.947314 ], [ -162.253564, 66.918652 ], [ -162.131396, 66.801367 ], [ -162.017627, 66.784131 ], [ -162.050732, 66.667285 ], [ -161.90957, 66.559619 ], [ -161.591016, 66.459521 ], [ -161.335938, 66.496338 ], [ -161.155811, 66.495312 ], [ -161.048145, 66.474219 ], [ -160.784473, 66.384375 ], [ -160.650537, 66.373096 ], [ -160.231689, 66.420264 ], [ -160.227344, 66.508545 ], [ -160.262549, 66.572461 ], [ -160.360889, 66.6125 ], [ -160.643799, 66.60498 ], [ -160.864014, 66.67085 ], [ -161.051465, 66.652783 ], [ -161.398047, 66.551855 ], [ -161.571729, 66.591602 ], [ -161.680908, 66.645508 ], [ -161.856689, 66.700342 ], [ -161.87876, 66.803955 ], [ -161.731299, 66.922803 ], [ -161.622217, 66.979346 ], [ -161.719922, 67.020557 ], [ -161.96543, 67.049561 ], [ -162.391553, 67.019873 ], [ -162.411572, 67.060303 ], [ -162.409424, 67.103955 ], [ -162.583105, 67.018506 ], [ -162.761426, 67.036426 ], [ -163.001709, 67.027295 ], [ -163.531836, 67.102588 ], [ -163.720557, 67.195557 ], [ -163.799805, 67.270996 ], [ -163.942676, 67.477588 ], [ -164.125195, 67.606738 ], [ -165.386035, 68.045605 ], [ -165.95957, 68.155908 ], [ -166.235938, 68.27793 ], [ -166.409131, 68.307959 ], [ -166.574463, 68.320264 ], [ -166.786279, 68.359619 ], [ -166.643896, 68.408008 ], [ -166.545898, 68.424365 ], [ -166.647852, 68.373828 ], [ -166.57041, 68.361084 ], [ -166.447021, 68.390234 ], [ -166.380518, 68.425146 ], [ -166.282959, 68.573242 ], [ -166.182031, 68.797217 ], [ -166.209082, 68.885352 ], [ -165.509473, 68.867578 ], [ -165.043945, 68.882471 ], [ -164.889697, 68.902441 ], [ -164.302344, 68.936475 ], [ -164.150195, 68.961182 ], [ -163.86792, 69.03667 ], [ -163.535693, 69.170117 ], [ -163.250537, 69.345361 ], [ -163.205176, 69.392529 ], [ -163.187109, 69.380469 ], [ -163.161475, 69.387939 ], [ -163.131006, 69.454346 ], [ -163.093555, 69.610693 ], [ -162.9521, 69.758105 ], [ -162.350391, 70.094141 ], [ -162.071143, 70.227197 ], [ -161.977979, 70.287646 ], [ -161.880957, 70.331738 ], [ -161.812598, 70.289844 ], [ -161.779932, 70.277344 ], [ -161.761084, 70.257666 ], [ -161.818408, 70.248437 ], [ -161.911963, 70.205469 ], [ -162.042383, 70.17666 ], [ -162.073877, 70.161963 ], [ -161.997412, 70.165234 ], [ -161.768164, 70.196533 ], [ -161.639014, 70.234521 ], [ -160.996289, 70.30459 ], [ -160.647656, 70.420557 ], [ -160.634131, 70.446387 ], [ -160.117139, 70.591211 ], [ -160.045605, 70.585596 ], [ -159.963135, 70.568164 ], [ -160.106396, 70.472559 ], [ -160.005566, 70.447559 ], [ -160.095068, 70.333301 ], [ -159.907568, 70.331445 ], [ -159.865674, 70.278857 ], [ -159.855225, 70.32417 ], [ -159.85752, 70.389258 ], [ -159.842627, 70.453027 ], [ -159.81499, 70.49707 ], [ -159.683301, 70.477148 ], [ -159.386768, 70.524512 ], [ -159.746191, 70.530469 ], [ -159.961816, 70.634082 ], [ -160.081592, 70.634863 ], [ -159.680908, 70.786768 ], [ -159.314502, 70.878516 ], [ -159.231738, 70.876758 ], [ -159.191748, 70.859668 ], [ -159.183154, 70.831934 ], [ -159.262207, 70.813867 ], [ -159.339844, 70.78125 ], [ -159.30415, 70.752539 ], [ -159.251172, 70.748437 ], [ -159.075049, 70.77207 ], [ -158.996289, 70.801611 ], [ -158.620947, 70.799023 ], [ -158.51084, 70.820117 ], [ -158.484375, 70.841064 ], [ -157.998486, 70.845313 ], [ -157.909375, 70.860107 ], [ -157.605615, 70.94126 ], [ -157.324756, 71.0396 ], [ -157.195313, 71.093262 ], [ -156.97334, 71.230029 ], [ -156.783301, 71.318945 ], [ -156.470215, 71.407666 ], [ -156.395264, 71.39668 ], [ -156.49668, 71.379102 ], [ -156.567236, 71.341553 ], [ -156.469971, 71.291553 ], [ -155.811133, 71.188428 ], [ -155.645605, 71.182764 ], [ -155.579443, 71.121094 ], [ -155.63457, 71.061572 ], [ -155.804346, 70.99541 ], [ -156.146582, 70.927832 ], [ -156.041943, 70.902246 ], [ -155.973535, 70.841992 ], [ -155.872217, 70.834668 ], [ -155.708057, 70.857275 ], [ -155.579395, 70.894336 ], [ -155.313379, 71.01499 ], [ -155.229736, 71.082227 ], [ -155.166846, 71.099219 ], [ -154.943799, 71.083057 ], [ -154.817529, 71.048486 ], [ -154.673682, 70.987109 ], [ -154.726318, 70.927783 ], [ -154.785205, 70.894287 ], [ -154.598633, 70.847998 ], [ -154.392188, 70.83833 ], [ -154.195215, 70.801123 ], [ -153.918213, 70.877344 ], [ -153.701367, 70.893604 ], [ -153.497705, 70.891064 ], [ -153.23291, 70.932568 ], [ -152.784912, 70.876025 ], [ -152.67085, 70.890723 ], [ -152.491211, 70.880957 ], [ -152.300391, 70.846777 ], [ -152.23291, 70.810352 ], [ -152.437256, 70.733252 ], [ -152.470605, 70.653613 ], [ -152.399219, 70.620459 ], [ -152.269678, 70.614746 ], [ -152.253369, 70.568262 ], [ -152.172949, 70.556641 ], [ -151.769043, 70.560156 ], [ -151.799902, 70.538037 ], [ -151.819629, 70.511328 ], [ -151.944678, 70.4521 ], [ -151.224805, 70.41875 ], [ -151.128027, 70.451611 ], [ -150.979053, 70.464697 ], [ -150.662646, 70.509912 ], [ -150.543506, 70.490137 ], [ -150.403223, 70.443896 ], [ -150.273633, 70.434326 ], [ -150.15249, 70.443701 ], [ -149.870117, 70.509668 ], [ -149.544043, 70.512891 ], [ -149.410596, 70.491406 ], [ -149.269434, 70.500781 ], [ -148.844775, 70.425195 ], [ -148.688379, 70.416309 ], [ -148.479199, 70.31792 ], [ -148.371143, 70.31499 ], [ -148.248779, 70.356738 ], [ -148.142725, 70.355469 ], [ -148.039063, 70.315479 ], [ -147.869531, 70.303271 ], [ -147.790576, 70.240137 ], [ -147.705371, 70.217236 ], [ -147.062939, 70.17041 ], [ -146.744873, 70.191748 ], [ -146.28125, 70.186133 ], [ -146.057666, 70.15625 ], [ -145.823145, 70.160059 ], [ -145.440088, 70.050928 ], [ -145.236816, 70.033936 ], [ -145.197363, 70.008691 ], [ -144.619189, 69.982129 ], [ -144.416895, 70.039014 ], [ -144.064111, 70.054102 ], [ -143.746436, 70.101953 ], [ -143.566406, 70.101465 ], [ -143.357031, 70.089551 ], [ -143.276465, 70.095313 ], [ -143.218311, 70.11626 ], [ -142.707861, 70.033789 ], [ -142.422119, 69.939502 ], [ -142.296973, 69.869873 ], [ -141.699219, 69.770361 ], [ -141.526367, 69.714697 ], [ -141.40791, 69.653369 ], [ -141.338623, 69.646777 ], [ -141.289648, 69.664697 ], [ -141.080811, 69.659424 ], [ -141.002148, 69.650781 ], [ -141.002148, 69.358594 ], [ -141.002148, 69.066357 ], [ -141.002148, 68.77417 ], [ -141.002148, 68.481982 ], [ -141.002148, 68.189746 ], [ -141.002148, 67.897559 ], [ -141.002148, 67.605371 ], [ -141.002148, 67.313135 ], [ -141.002148, 67.020947 ], [ -141.002148, 66.72876 ], [ -141.002148, 66.436523 ], [ -141.002148, 66.144336 ], [ -141.002148, 65.852148 ], [ -141.002148, 65.559912 ], [ -141.002148, 65.267725 ], [ -141.002148, 64.975537 ], [ -141.002148, 64.683301 ], [ -141.002148, 64.391113 ], [ -141.002148, 64.098877 ], [ -141.002148, 63.806689 ], [ -141.002148, 63.514453 ], [ -141.002148, 63.222266 ], [ -141.002148, 62.930078 ], [ -141.002148, 62.637891 ], [ -141.002148, 62.345703 ], [ -141.002148, 62.053467 ], [ -141.002148, 61.761279 ], [ -141.002148, 61.469043 ], [ -141.002148, 61.176855 ], [ -141.002148, 60.884668 ], [ -141.002148, 60.592432 ], [ -141.002148, 60.300244 ], [ -140.762744, 60.259131 ], [ -140.525439, 60.218359 ], [ -140.452832, 60.299707 ], [ -140.196924, 60.2375 ], [ -139.973291, 60.183154 ], [ -139.830664, 60.252881 ], [ -139.676318, 60.32832 ], [ -139.467969, 60.333691 ], [ -139.234766, 60.339746 ], [ -139.079248, 60.343701 ], [ -139.079248, 60.279443 ], [ -139.136963, 60.172705 ], [ -139.185156, 60.083594 ], [ -139.043457, 59.993262 ], [ -138.86875, 59.945752 ], [ -138.705469, 59.901318 ], [ -138.632275, 59.778271 ], [ -138.453613, 59.683398 ], [ -138.317627, 59.611133 ], [ -138.187451, 59.541943 ], [ -138.001123, 59.44292 ], [ -137.870557, 59.373584 ], [ -137.696631, 59.281152 ], [ -137.593311, 59.22627 ], [ -137.543701, 59.119434 ], [ -137.48418, 58.991211 ], [ -137.520898, 58.915381 ], [ -137.438574, 58.903125 ], [ -137.277539, 58.988184 ], [ -137.126221, 59.040967 ], [ -136.939307, 59.106104 ], [ -136.813281, 59.150049 ], [ -136.57876, 59.152246 ], [ -136.466748, 59.279932 ], [ -136.466357, 59.459082 ], [ -136.347852, 59.456055 ], [ -136.277979, 59.480322 ], [ -136.247119, 59.53291 ], [ -136.321826, 59.604834 ], [ -136.097168, 59.638379 ], [ -135.934668, 59.662646 ], [ -135.702588, 59.72876 ], [ -135.475928, 59.793262 ], [ -135.367871, 59.743311 ], [ -135.260791, 59.69502 ], [ -135.051025, 59.578662 ], [ -135.03667, 59.550684 ], [ -135.05083, 59.496045 ], [ -135.071289, 59.441455 ], [ -134.94375, 59.288281 ], [ -134.907227, 59.271191 ], [ -134.802393, 59.25 ], [ -134.677246, 59.199268 ], [ -134.621973, 59.155322 ], [ -134.440771, 59.085352 ], [ -134.410205, 59.05625 ], [ -134.393066, 59.00918 ], [ -134.363525, 58.96875 ], [ -134.329639, 58.939697 ], [ -134.296973, 58.898486 ], [ -134.218506, 58.849902 ], [ -134.069189, 58.795508 ], [ -133.965723, 58.757861 ], [ -133.820752, 58.705029 ], [ -133.673926, 58.597168 ], [ -133.546387, 58.503467 ], [ -133.401123, 58.410889 ], [ -133.422559, 58.337061 ], [ -133.275293, 58.222852 ], [ -133.12041, 58.077734 ], [ -133.001416, 57.948975 ], [ -132.916846, 57.877002 ], [ -132.815527, 57.772705 ], [ -132.691504, 57.645117 ], [ -132.550488, 57.499902 ], [ -132.44248, 57.406738 ], [ -132.30166, 57.276318 ], [ -132.232178, 57.198535 ], [ -132.279395, 57.145361 ], [ -132.337988, 57.079443 ], [ -132.157031, 57.048193 ], [ -132.031543, 57.026562 ], [ -132.062891, 56.953369 ], [ -132.104297, 56.856787 ], [ -131.9625, 56.818701 ], [ -131.866162, 56.792822 ], [ -131.885986, 56.742139 ], [ -131.833105, 56.684814 ], [ -131.824268, 56.58999 ], [ -131.651514, 56.596094 ], [ -131.575098, 56.598828 ], [ -131.471875, 56.556738 ], [ -131.335791, 56.501221 ], [ -131.199414, 56.449219 ], [ -131.08291, 56.404834 ], [ -130.930225, 56.378613 ], [ -130.741699, 56.34082 ], [ -130.649072, 56.263672 ], [ -130.4771, 56.230566 ], [ -130.413135, 56.12251 ], [ -130.214697, 56.082813 ], [ -130.097852, 56.109277 ], [ -130.055957, 56.065234 ], [ -130.0229, 56.014502 ], [ -130.014062, 55.950537 ], [ -130.025098, 55.888232 ] ] ], [ [ [ -163.476025, 54.980713 ], [ -163.378955, 54.815527 ], [ -163.336914, 54.783203 ], [ -163.274512, 54.765576 ], [ -163.187109, 54.747754 ], [ -163.135059, 54.723291 ], [ -163.089258, 54.686084 ], [ -163.083252, 54.668994 ], [ -163.358105, 54.735693 ], [ -163.530859, 54.63833 ], [ -163.583008, 54.625684 ], [ -164.073291, 54.620996 ], [ -164.171289, 54.603027 ], [ -164.234619, 54.571338 ], [ -164.34668, 54.482422 ], [ -164.403516, 54.447852 ], [ -164.463477, 54.427344 ], [ -164.59082, 54.404346 ], [ -164.743799, 54.407471 ], [ -164.823438, 54.419092 ], [ -164.866162, 54.461377 ], [ -164.903955, 54.544775 ], [ -164.903711, 54.567969 ], [ -164.887646, 54.607813 ], [ -164.751465, 54.662939 ], [ -164.706201, 54.691992 ], [ -164.529785, 54.880859 ], [ -164.478613, 54.906836 ], [ -164.424316, 54.913184 ], [ -164.273682, 54.900049 ], [ -164.145068, 54.955127 ], [ -163.867969, 55.039111 ], [ -163.807129, 55.049072 ], [ -163.607471, 55.05083 ], [ -163.553027, 55.037842 ], [ -163.510889, 55.014307 ], [ -163.476025, 54.980713 ] ] ], [ [ [ -133.305078, 55.54375 ], [ -133.283203, 55.515625 ], [ -133.281689, 55.497852 ], [ -133.426465, 55.431445 ], [ -133.429102, 55.417725 ], [ -133.463086, 55.37666 ], [ -133.493457, 55.36167 ], [ -133.547363, 55.317236 ], [ -133.650195, 55.269287 ], [ -133.63501, 55.41333 ], [ -133.737109, 55.496924 ], [ -133.634229, 55.539258 ], [ -133.566699, 55.527197 ], [ -133.454785, 55.522314 ], [ -133.345557, 55.559082 ], [ -133.305078, 55.54375 ] ] ], [ [ [ -131.339746, 55.079834 ], [ -131.237451, 54.949512 ], [ -131.232031, 54.90376 ], [ -131.329541, 54.887744 ], [ -131.406201, 54.894287 ], [ -131.445703, 54.909326 ], [ -131.456104, 54.930566 ], [ -131.431348, 54.996484 ], [ -131.481738, 55.035254 ], [ -131.540039, 55.048486 ], [ -131.592236, 55.025684 ], [ -131.595117, 55.090723 ], [ -131.556006, 55.137402 ], [ -131.577832, 55.20083 ], [ -131.578467, 55.248779 ], [ -131.56543, 55.264111 ], [ -131.512646, 55.262744 ], [ -131.404639, 55.21333 ], [ -131.339746, 55.079834 ] ] ], [ [ [ -132.112354, 56.109375 ], [ -132.132959, 55.943262 ], [ -132.172607, 55.952637 ], [ -132.210303, 55.952979 ], [ -132.287305, 55.929395 ], [ -132.368604, 55.939746 ], [ -132.406592, 55.958203 ], [ -132.420605, 55.979541 ], [ -132.406055, 56.028857 ], [ -132.451172, 56.056348 ], [ -132.602979, 56.066406 ], [ -132.659912, 56.078174 ], [ -132.691357, 56.130078 ], [ -132.699023, 56.198193 ], [ -132.675195, 56.223633 ], [ -132.59873, 56.24165 ], [ -132.539014, 56.32417 ], [ -132.505957, 56.335254 ], [ -132.379834, 56.498779 ], [ -132.316504, 56.4875 ], [ -132.205615, 56.387939 ], [ -132.066895, 56.244238 ], [ -132.112354, 56.109375 ] ] ], [ [ [ -130.97915, 55.48916 ], [ -131.013916, 55.379297 ], [ -131.082764, 55.266797 ], [ -131.187891, 55.206299 ], [ -131.261865, 55.219775 ], [ -131.316309, 55.268506 ], [ -131.366846, 55.26582 ], [ -131.420703, 55.275879 ], [ -131.450928, 55.316309 ], [ -131.422363, 55.368408 ], [ -131.447559, 55.408789 ], [ -131.474512, 55.373486 ], [ -131.521826, 55.341064 ], [ -131.641309, 55.298926 ], [ -131.723682, 55.218359 ], [ -131.7625, 55.16582 ], [ -131.810986, 55.223096 ], [ -131.841992, 55.358691 ], [ -131.846094, 55.41626 ], [ -131.759473, 55.503076 ], [ -131.647559, 55.585547 ], [ -131.624951, 55.831689 ], [ -131.269238, 55.955371 ], [ -131.236182, 55.948975 ], [ -131.120654, 55.856641 ], [ -130.997803, 55.727637 ], [ -130.965967, 55.669531 ], [ -130.965039, 55.568018 ], [ -130.97915, 55.48916 ] ] ], [ [ [ -133.366211, 57.003516 ], [ -133.299707, 56.972168 ], [ -133.263525, 57.00498 ], [ -133.195996, 57.003467 ], [ -133.070801, 56.974268 ], [ -132.99624, 56.93042 ], [ -132.95415, 56.880273 ], [ -132.950586, 56.850439 ], [ -132.96333, 56.782568 ], [ -132.954004, 56.713086 ], [ -132.95918, 56.677051 ], [ -132.975879, 56.647266 ], [ -133.004102, 56.62373 ], [ -133.034912, 56.620752 ], [ -133.132373, 56.683252 ], [ -133.243994, 56.79585 ], [ -133.328955, 56.830078 ], [ -133.332422, 56.818506 ], [ -133.309082, 56.78623 ], [ -133.239697, 56.725684 ], [ -133.227246, 56.689258 ], [ -133.178467, 56.644824 ], [ -133.156641, 56.611133 ], [ -133.144238, 56.566895 ], [ -133.144727, 56.528223 ], [ -133.158154, 56.495166 ], [ -133.180811, 56.473975 ], [ -133.212646, 56.4646 ], [ -133.382764, 56.473877 ], [ -133.48418, 56.451758 ], [ -133.602783, 56.464111 ], [ -133.631348, 56.484033 ], [ -133.649268, 56.516797 ], [ -133.658301, 56.596289 ], [ -133.688184, 56.71001 ], [ -133.680957, 56.79751 ], [ -133.75752, 56.87666 ], [ -133.823047, 56.924365 ], [ -133.917285, 56.96709 ], [ -133.979443, 57.00957 ], [ -133.962354, 57.043457 ], [ -133.865967, 57.068701 ], [ -133.707715, 57.062842 ], [ -133.366211, 57.003516 ] ] ], [ [ [ -132.862256, 54.894434 ], [ -132.837744, 54.880957 ], [ -132.812891, 54.89043 ], [ -132.772314, 54.926074 ], [ -132.700635, 54.919043 ], [ -132.648877, 54.90708 ], [ -132.617236, 54.892432 ], [ -132.634033, 54.840479 ], [ -132.646973, 54.756152 ], [ -132.67666, 54.726221 ], [ -132.705811, 54.68418 ], [ -132.807275, 54.709131 ], [ -132.8896, 54.762646 ], [ -133.008936, 54.854834 ], [ -133.075391, 54.921338 ], [ -133.080566, 54.949414 ], [ -133.122705, 54.969824 ], [ -133.204639, 55.084473 ], [ -133.251172, 55.175146 ], [ -133.324854, 55.185498 ], [ -133.417969, 55.210693 ], [ -133.453809, 55.260352 ], [ -133.429053, 55.303809 ], [ -133.296582, 55.325732 ], [ -133.097412, 55.213721 ], [ -133.06709, 55.166211 ], [ -132.995752, 55.110596 ], [ -132.982178, 55.033008 ], [ -132.945996, 55.002588 ], [ -132.862256, 54.894434 ] ] ], [ [ [ -146.393945, 60.449658 ], [ -146.37168, 60.422168 ], [ -146.179541, 60.42876 ], [ -146.124268, 60.423926 ], [ -146.102246, 60.411182 ], [ -146.128271, 60.392529 ], [ -146.202393, 60.368018 ], [ -146.419189, 60.325049 ], [ -146.595313, 60.268457 ], [ -146.618311, 60.273682 ], [ -146.650439, 60.335645 ], [ -146.683008, 60.360693 ], [ -146.702881, 60.395605 ], [ -146.702539, 60.408545 ], [ -146.670264, 60.432617 ], [ -146.605908, 60.467822 ], [ -146.560303, 60.480566 ], [ -146.393945, 60.449658 ] ] ], [ [ [ -147.735889, 59.813232 ], [ -147.846338, 59.798828 ], [ -147.872461, 59.828369 ], [ -147.814355, 59.901953 ], [ -147.768066, 59.94375 ], [ -147.733643, 59.953613 ], [ -147.606689, 60.036621 ], [ -147.46582, 60.097021 ], [ -147.336523, 60.185352 ], [ -147.205225, 60.311328 ], [ -147.180859, 60.358252 ], [ -147.12002, 60.363086 ], [ -147.019873, 60.332227 ], [ -146.957861, 60.288867 ], [ -146.986719, 60.254346 ], [ -147.318457, 60.075293 ], [ -147.346338, 60.051953 ], [ -147.376514, 59.991162 ], [ -147.403809, 59.969971 ], [ -147.447559, 59.960254 ], [ -147.479395, 59.933691 ], [ -147.499316, 59.890186 ], [ -147.540234, 59.867529 ], [ -147.602051, 59.865576 ], [ -147.644922, 59.853613 ], [ -147.66875, 59.831543 ], [ -147.735889, 59.813232 ] ] ], [ [ [ -147.658252, 60.450488 ], [ -147.658691, 60.424121 ], [ -147.690039, 60.398877 ], [ -147.659961, 60.35249 ], [ -147.712012, 60.272754 ], [ -147.732129, 60.22207 ], [ -147.759912, 60.190234 ], [ -147.787842, 60.17793 ], [ -147.81582, 60.185156 ], [ -147.82168, 60.202734 ], [ -147.805273, 60.230664 ], [ -147.871338, 60.229785 ], [ -147.891455, 60.299414 ], [ -147.854883, 60.321436 ], [ -147.841699, 60.35127 ], [ -147.837598, 60.371289 ], [ -147.794531, 60.459863 ], [ -147.77915, 60.466064 ], [ -147.77417, 60.444971 ], [ -147.760205, 60.43877 ], [ -147.737305, 60.447412 ], [ -147.702979, 60.486816 ], [ -147.688574, 60.491406 ], [ -147.658252, 60.450488 ] ] ], [ [ [ -147.930713, 60.826172 ], [ -148.057422, 60.81792 ], [ -148.11543, 60.830615 ], [ -148.123779, 60.844336 ], [ -148.099707, 60.894824 ], [ -148.10166, 60.916113 ], [ -148.037744, 60.924121 ], [ -147.964404, 60.900146 ], [ -147.943115, 60.875391 ], [ -147.930713, 60.826172 ] ] ], [ [ [ -153.00708, 57.124854 ], [ -153.134229, 57.092578 ], [ -153.156836, 57.093945 ], [ -153.2354, 57.028613 ], [ -153.29541, 57.000439 ], [ -153.374609, 57.051904 ], [ -153.354346, 57.131934 ], [ -153.285205, 57.185059 ], [ -152.935449, 57.167334 ], [ -152.908398, 57.152441 ], [ -152.907764, 57.139746 ], [ -152.933447, 57.129248 ], [ -153.00708, 57.124854 ] ] ], [ [ [ -152.486084, 58.48501 ], [ -152.515527, 58.478613 ], [ -152.588623, 58.509229 ], [ -152.636621, 58.541699 ], [ -152.604883, 58.566406 ], [ -152.463184, 58.618506 ], [ -152.395508, 58.619385 ], [ -152.36792, 58.611084 ], [ -152.356836, 58.594971 ], [ -152.362256, 58.57085 ], [ -152.392822, 58.540869 ], [ -152.486084, 58.48501 ] ] ], [ [ [ -153.240625, 57.850098 ], [ -153.268555, 57.822363 ], [ -153.294971, 57.829492 ], [ -153.35083, 57.861963 ], [ -153.465039, 57.909375 ], [ -153.51709, 57.941895 ], [ -153.520068, 57.955762 ], [ -153.481055, 57.971045 ], [ -153.346973, 57.932812 ], [ -153.290039, 57.8979 ], [ -153.240625, 57.850098 ] ] ], [ [ [ -155.566016, 55.821191 ], [ -155.604883, 55.789551 ], [ -155.680615, 55.791846 ], [ -155.723193, 55.802197 ], [ -155.737354, 55.829785 ], [ -155.620605, 55.913086 ], [ -155.593945, 55.924316 ], [ -155.573242, 55.921094 ], [ -155.563916, 55.88667 ], [ -155.566016, 55.821191 ] ] ], [ [ [ -154.682813, 56.435791 ], [ -154.751221, 56.412158 ], [ -154.773926, 56.420264 ], [ -154.777148, 56.439893 ], [ -154.760938, 56.471143 ], [ -154.729346, 56.502148 ], [ -154.62373, 56.561328 ], [ -154.517529, 56.600537 ], [ -154.463379, 56.598193 ], [ -154.444873, 56.573193 ], [ -154.511182, 56.521436 ], [ -154.682813, 56.435791 ] ] ], [ [ [ -154.208643, 56.514893 ], [ -154.257813, 56.512695 ], [ -154.332129, 56.539014 ], [ -154.322217, 56.570605 ], [ -154.216748, 56.60874 ], [ -154.1104, 56.60293 ], [ -154.102246, 56.581641 ], [ -154.107178, 56.557812 ], [ -154.115967, 56.543896 ], [ -154.149805, 56.52959 ], [ -154.208643, 56.514893 ] ] ], [ [ [ -160.684912, 55.314795 ], [ -160.669727, 55.314258 ], [ -160.638818, 55.321924 ], [ -160.573975, 55.378271 ], [ -160.552783, 55.380762 ], [ -160.55249, 55.363379 ], [ -160.583154, 55.307617 ], [ -160.531201, 55.233203 ], [ -160.482666, 55.197412 ], [ -160.487549, 55.184863 ], [ -160.609082, 55.159033 ], [ -160.701807, 55.177637 ], [ -160.750635, 55.171191 ], [ -160.795068, 55.145215 ], [ -160.825488, 55.173975 ], [ -160.846533, 55.311328 ], [ -160.839648, 55.3354 ], [ -160.789209, 55.383105 ], [ -160.723926, 55.404639 ], [ -160.695654, 55.39834 ], [ -160.672168, 55.379395 ], [ -160.666357, 55.359424 ], [ -160.684912, 55.314795 ] ] ], [ [ [ -162.298145, 54.847021 ], [ -162.321924, 54.842383 ], [ -162.390771, 54.872998 ], [ -162.415771, 54.895898 ], [ -162.433887, 54.931543 ], [ -162.293652, 54.982861 ], [ -162.2646, 54.983496 ], [ -162.238379, 54.954736 ], [ -162.23374, 54.932031 ], [ -162.272559, 54.867188 ], [ -162.298145, 54.847021 ] ] ], [ [ [ -162.554395, 54.401367 ], [ -162.641113, 54.379541 ], [ -162.733105, 54.402295 ], [ -162.811719, 54.444385 ], [ -162.820557, 54.494531 ], [ -162.64541, 54.462061 ], [ -162.607959, 54.446631 ], [ -162.554395, 54.401367 ] ] ], [ [ [ -159.872998, 55.12876 ], [ -159.933936, 55.106836 ], [ -159.953076, 55.078955 ], [ -159.999414, 55.067188 ], [ -160.038428, 55.044482 ], [ -160.16958, 54.941699 ], [ -160.227051, 54.922705 ], [ -160.163574, 55.010449 ], [ -160.153613, 55.03833 ], [ -160.152393, 55.056885 ], [ -160.17207, 55.123047 ], [ -160.13374, 55.120166 ], [ -160.102197, 55.133887 ], [ -160.03877, 55.192529 ], [ -159.981641, 55.197754 ], [ -159.920459, 55.267529 ], [ -159.887354, 55.272998 ], [ -159.871045, 55.263574 ], [ -159.898242, 55.221289 ], [ -159.839404, 55.182373 ], [ -159.854102, 55.144678 ], [ -159.872998, 55.12876 ] ] ], [ [ [ -165.841553, 54.070654 ], [ -165.879395, 54.053027 ], [ -165.909863, 54.04917 ], [ -165.93291, 54.05918 ], [ -166.036426, 54.047168 ], [ -166.056641, 54.054346 ], [ -166.102832, 54.113965 ], [ -166.105811, 54.144824 ], [ -166.087744, 54.169141 ], [ -166.04126, 54.19126 ], [ -165.966406, 54.211035 ], [ -165.892871, 54.206982 ], [ -165.764453, 54.1521 ], [ -165.704248, 54.119922 ], [ -165.692871, 54.099902 ], [ -165.737891, 54.081104 ], [ -165.841553, 54.070654 ] ] ], [ [ [ -165.561133, 54.136719 ], [ -165.604834, 54.12915 ], [ -165.615381, 54.139551 ], [ -165.620508, 54.183545 ], [ -165.65415, 54.25332 ], [ -165.590332, 54.278662 ], [ -165.550635, 54.284521 ], [ -165.533789, 54.273877 ], [ -165.487695, 54.221875 ], [ -165.441748, 54.208008 ], [ -165.407861, 54.196826 ], [ -165.467578, 54.180908 ], [ -165.561133, 54.136719 ] ] ], [ [ [ -160.918994, 58.5771 ], [ -160.992383, 58.561035 ], [ -161.070264, 58.569141 ], [ -161.131494, 58.668213 ], [ -161.08457, 58.671289 ], [ -160.98623, 58.736426 ], [ -160.768604, 58.789209 ], [ -160.715137, 58.795215 ], [ -160.918994, 58.5771 ] ] ], [ [ [ -172.742236, 60.457373 ], [ -172.526074, 60.391748 ], [ -172.3875, 60.398486 ], [ -172.277539, 60.343652 ], [ -172.23208, 60.299121 ], [ -172.397168, 60.331104 ], [ -172.635742, 60.328857 ], [ -172.958398, 60.462793 ], [ -173.074023, 60.493213 ], [ -173.047656, 60.568311 ], [ -172.923877, 60.606836 ], [ -172.860205, 60.505664 ], [ -172.742236, 60.457373 ] ] ], [ [ [ -170.160547, 57.183936 ], [ -170.264014, 57.136768 ], [ -170.358008, 57.154199 ], [ -170.385889, 57.188574 ], [ -170.386621, 57.203027 ], [ -170.116162, 57.241797 ], [ -170.160547, 57.183936 ] ] ], [ [ [ -169.691943, 52.847363 ], [ -169.708105, 52.807129 ], [ -169.722754, 52.792334 ], [ -169.877344, 52.81377 ], [ -169.980566, 52.806006 ], [ -169.991846, 52.829834 ], [ -169.982568, 52.851025 ], [ -169.820654, 52.883398 ], [ -169.754883, 52.883643 ], [ -169.710986, 52.866748 ], [ -169.691943, 52.847363 ] ] ], [ [ [ -170.733398, 52.581494 ], [ -170.797363, 52.549756 ], [ -170.816064, 52.561523 ], [ -170.827051, 52.600732 ], [ -170.791162, 52.63125 ], [ -170.68208, 52.697559 ], [ -170.608057, 52.685059 ], [ -170.584619, 52.667578 ], [ -170.586621, 52.642432 ], [ -170.614014, 52.609619 ], [ -170.649268, 52.593115 ], [ -170.692285, 52.592969 ], [ -170.733398, 52.581494 ] ] ], [ [ [ -172.464795, 52.272266 ], [ -172.539111, 52.257471 ], [ -172.619824, 52.272852 ], [ -172.582178, 52.325635 ], [ -172.543652, 52.353809 ], [ -172.47041, 52.388037 ], [ -172.383105, 52.372949 ], [ -172.313623, 52.32959 ], [ -172.464795, 52.272266 ] ] ], [ [ [ -169.755225, 56.635059 ], [ -169.623926, 56.615137 ], [ -169.550488, 56.628125 ], [ -169.485693, 56.617725 ], [ -169.474316, 56.594043 ], [ -169.586865, 56.542432 ], [ -169.632617, 56.545703 ], [ -169.766162, 56.607959 ], [ -169.755225, 56.635059 ] ] ], [ [ [ -176.286719, 51.791992 ], [ -176.349658, 51.733301 ], [ -176.396094, 51.759863 ], [ -176.413721, 51.840576 ], [ -176.378564, 51.861133 ], [ -176.280225, 51.802832 ], [ -176.286719, 51.791992 ] ] ], [ [ [ -176.021533, 52.002441 ], [ -176.045068, 51.972998 ], [ -176.142871, 52.004297 ], [ -176.177539, 52.029834 ], [ -176.184521, 52.056055 ], [ -176.155664, 52.099414 ], [ -176.077393, 52.099951 ], [ -176.031201, 52.082324 ], [ -175.988086, 52.049463 ], [ -175.975293, 52.028955 ], [ -176.021533, 52.002441 ] ] ], [ [ [ -177.148193, 51.716748 ], [ -177.177002, 51.703711 ], [ -177.229883, 51.693555 ], [ -177.382373, 51.704834 ], [ -177.474658, 51.70127 ], [ -177.577588, 51.694189 ], [ -177.654883, 51.676563 ], [ -177.670215, 51.701074 ], [ -177.667627, 51.721191 ], [ -177.334717, 51.776221 ], [ -177.257275, 51.804932 ], [ -177.209766, 51.84126 ], [ -177.166406, 51.909424 ], [ -177.131494, 51.929785 ], [ -177.110059, 51.92876 ], [ -177.063037, 51.901904 ], [ -177.079541, 51.866553 ], [ -177.121387, 51.835791 ], [ -177.135107, 51.806934 ], [ -177.148193, 51.716748 ] ] ], [ [ [ 178.575488, 51.91626 ], [ 178.511816, 51.899121 ], [ 178.477734, 51.942529 ], [ 178.475, 51.967725 ], [ 178.509375, 51.994678 ], [ 178.570605, 51.977539 ], [ 178.607324, 51.953027 ], [ 178.575488, 51.91626 ] ] ], [ [ [ 179.451563, 51.372607 ], [ 179.278125, 51.372217 ], [ 178.925879, 51.535059 ], [ 178.74707, 51.586719 ], [ 178.647949, 51.643896 ], [ 178.692188, 51.655957 ], [ 178.908008, 51.615576 ], [ 179.084277, 51.527686 ], [ 179.181738, 51.469922 ], [ 179.294336, 51.42085 ], [ 179.415527, 51.400879 ], [ 179.451563, 51.372607 ] ] ], [ [ [ 173.722754, 52.35957 ], [ 173.657813, 52.356641 ], [ 173.616211, 52.39126 ], [ 173.402344, 52.404785 ], [ 173.424512, 52.437646 ], [ 173.516504, 52.451416 ], [ 173.657617, 52.504102 ], [ 173.776074, 52.495117 ], [ 173.744727, 52.446631 ], [ 173.722754, 52.35957 ] ] ], [ [ [ -134.969775, 57.351416 ], [ -134.884863, 57.241699 ], [ -134.823193, 57.156543 ], [ -134.768506, 57.054199 ], [ -134.676855, 56.842285 ], [ -134.634082, 56.762109 ], [ -134.620703, 56.718311 ], [ -134.610547, 56.603418 ], [ -134.624316, 56.578711 ], [ -134.651709, 56.556055 ], [ -134.65708, 56.523242 ], [ -134.631689, 56.435645 ], [ -134.630029, 56.302441 ], [ -134.654004, 56.22749 ], [ -134.681885, 56.216162 ], [ -134.750293, 56.240771 ], [ -134.806445, 56.28125 ], [ -134.847998, 56.323486 ], [ -134.950146, 56.456836 ], [ -134.980566, 56.518945 ], [ -134.982422, 56.563623 ], [ -134.96665, 56.596143 ], [ -134.933203, 56.616357 ], [ -134.875098, 56.670459 ], [ -134.883447, 56.679053 ], [ -134.927588, 56.666992 ], [ -135.017822, 56.660156 ], [ -135.097168, 56.702832 ], [ -135.159033, 56.725391 ], [ -135.146582, 56.802344 ], [ -135.163135, 56.824121 ], [ -135.284814, 56.800342 ], [ -135.330615, 56.821875 ], [ -135.340625, 56.850781 ], [ -135.338379, 56.893994 ], [ -135.315137, 56.931836 ], [ -135.199609, 57.027344 ], [ -135.21123, 57.044922 ], [ -135.267383, 57.048877 ], [ -135.341357, 57.081592 ], [ -135.375293, 57.188428 ], [ -135.454932, 57.249414 ], [ -135.501953, 57.243848 ], [ -135.608936, 57.071436 ], [ -135.661865, 57.03374 ], [ -135.812305, 57.009521 ], [ -135.781641, 57.05752 ], [ -135.767725, 57.100391 ], [ -135.821143, 57.23042 ], [ -135.822754, 57.28042 ], [ -135.787109, 57.317285 ], [ -135.680908, 57.332568 ], [ -135.624512, 57.354395 ], [ -135.580566, 57.38999 ], [ -135.569629, 57.424707 ], [ -135.487305, 57.516504 ], [ -135.448682, 57.534375 ], [ -135.346289, 57.533105 ], [ -135.130664, 57.431641 ], [ -135.065234, 57.416699 ], [ -134.969775, 57.351416 ] ] ], [ [ [ -134.680273, 58.16167 ], [ -134.426123, 58.138818 ], [ -134.240088, 58.143994 ], [ -134.070166, 57.994531 ], [ -133.965527, 57.873779 ], [ -133.904102, 57.789209 ], [ -133.869287, 57.70752 ], [ -133.822754, 57.628662 ], [ -133.826904, 57.617578 ], [ -133.925, 57.670801 ], [ -133.995557, 57.778467 ], [ -134.031641, 57.820605 ], [ -134.067236, 57.8396 ], [ -134.104736, 57.879346 ], [ -134.177539, 57.982178 ], [ -134.180273, 58.011133 ], [ -134.212598, 58.037939 ], [ -134.249951, 58.04917 ], [ -134.292334, 58.044727 ], [ -134.306885, 58.034375 ], [ -134.300391, 57.963428 ], [ -134.26709, 57.884521 ], [ -134.083691, 57.712256 ], [ -133.961133, 57.61416 ], [ -133.937012, 57.581592 ], [ -133.92085, 57.491992 ], [ -133.97373, 57.451367 ], [ -133.908838, 57.368701 ], [ -133.911133, 57.352539 ], [ -133.925293, 57.336768 ], [ -134.100049, 57.300098 ], [ -134.260156, 57.146777 ], [ -134.435303, 57.056982 ], [ -134.516016, 57.042578 ], [ -134.554785, 57.057568 ], [ -134.591504, 57.091992 ], [ -134.613086, 57.137939 ], [ -134.619531, 57.195508 ], [ -134.575879, 57.231738 ], [ -134.489209, 57.420166 ], [ -134.486768, 57.482031 ], [ -134.594824, 57.567822 ], [ -134.659863, 57.638086 ], [ -134.695117, 57.736035 ], [ -134.754102, 57.99502 ], [ -134.781494, 58.077832 ], [ -134.820117, 58.146875 ], [ -134.869971, 58.2021 ], [ -134.907666, 58.262793 ], [ -134.933105, 58.328955 ], [ -134.923486, 58.354639 ], [ -134.836963, 58.320166 ], [ -134.733203, 58.225 ], [ -134.680273, 58.16167 ] ] ], [ [ [ -135.730371, 58.244238 ], [ -135.5875, 58.146777 ], [ -135.586279, 58.124414 ], [ -135.615381, 58.057471 ], [ -135.693115, 58.038525 ], [ -135.671143, 58.011914 ], [ -135.613232, 57.991846 ], [ -135.572021, 58.008545 ], [ -135.421191, 58.102393 ], [ -135.374707, 58.122119 ], [ -135.346631, 58.124121 ], [ -135.162842, 58.09585 ], [ -135.0021, 58.051074 ], [ -134.954688, 58.015332 ], [ -134.927979, 57.952783 ], [ -134.970654, 57.817236 ], [ -135.102588, 57.793652 ], [ -135.164746, 57.796094 ], [ -135.231201, 57.81582 ], [ -135.338477, 57.768652 ], [ -135.249561, 57.732568 ], [ -134.978857, 57.724365 ], [ -134.896631, 57.647998 ], [ -134.873096, 57.589209 ], [ -134.931494, 57.481152 ], [ -135.084863, 57.511035 ], [ -135.220215, 57.573633 ], [ -135.497852, 57.662256 ], [ -135.564209, 57.666406 ], [ -135.608545, 57.650732 ], [ -135.620654, 57.596973 ], [ -135.617822, 57.480371 ], [ -135.691943, 57.419922 ], [ -135.910791, 57.446582 ], [ -135.99668, 57.534863 ], [ -136.076611, 57.674561 ], [ -136.378223, 57.83999 ], [ -136.459912, 57.873096 ], [ -136.568604, 57.972168 ], [ -136.525098, 58.050586 ], [ -136.512305, 58.095996 ], [ -136.454395, 58.108008 ], [ -136.369531, 58.143066 ], [ -136.321973, 58.218896 ], [ -136.245703, 58.157471 ], [ -136.14375, 58.098486 ], [ -136.142334, 58.153906 ], [ -136.094385, 58.198145 ], [ -135.994385, 58.196533 ], [ -135.947412, 58.205811 ], [ -135.881738, 58.247168 ], [ -135.787061, 58.268506 ], [ -135.730371, 58.244238 ] ] ], [ [ [ -133.566113, 56.339209 ], [ -133.376611, 56.317773 ], [ -133.202979, 56.319824 ], [ -133.143701, 56.278564 ], [ -133.104492, 56.235107 ], [ -133.081738, 56.194189 ], [ -133.075439, 56.155859 ], [ -133.080127, 56.128711 ], [ -133.101221, 56.099805 ], [ -133.096631, 56.090039 ], [ -132.757568, 55.99502 ], [ -132.597607, 55.89502 ], [ -132.533789, 55.84248 ], [ -132.496973, 55.798096 ], [ -132.430176, 55.687012 ], [ -132.288867, 55.558105 ], [ -132.214746, 55.518848 ], [ -132.172705, 55.480615 ], [ -132.196338, 55.47915 ], [ -132.295898, 55.507471 ], [ -132.511279, 55.593945 ], [ -132.528857, 55.590479 ], [ -132.54834, 55.543701 ], [ -132.581738, 55.502637 ], [ -132.631299, 55.473193 ], [ -132.591602, 55.464355 ], [ -132.417871, 55.48291 ], [ -132.272021, 55.398633 ], [ -132.215283, 55.383545 ], [ -132.160254, 55.322998 ], [ -132.158398, 55.299805 ], [ -132.19043, 55.25498 ], [ -132.214893, 55.236768 ], [ -132.206689, 55.224414 ], [ -132.165967, 55.218018 ], [ -132.005078, 55.230615 ], [ -131.976416, 55.208594 ], [ -132.000391, 55.033838 ], [ -131.977588, 54.969482 ], [ -131.97793, 54.940234 ], [ -131.996582, 54.901416 ], [ -131.997217, 54.868604 ], [ -131.982715, 54.834912 ], [ -131.980859, 54.804834 ], [ -132.02168, 54.726318 ], [ -132.064746, 54.713135 ], [ -132.134326, 54.712549 ], [ -132.189258, 54.734863 ], [ -132.266309, 54.802344 ], [ -132.341309, 54.907227 ], [ -132.370215, 54.922217 ], [ -132.468652, 54.937939 ], [ -132.486475, 54.950391 ], [ -132.549365, 54.952588 ], [ -132.593848, 54.995752 ], [ -132.588477, 55.052344 ], [ -132.626953, 55.110059 ], [ -132.622168, 55.135937 ], [ -132.665332, 55.146777 ], [ -132.701758, 55.130518 ], [ -132.682861, 55.073926 ], [ -132.70415, 55.030078 ], [ -132.782324, 55.048486 ], [ -132.912598, 55.188477 ], [ -133.060596, 55.300928 ], [ -133.118555, 55.327637 ], [ -133.103027, 55.360254 ], [ -133.030029, 55.377539 ], [ -132.970801, 55.376172 ], [ -132.958887, 55.395557 ], [ -133.082471, 55.504102 ], [ -133.078418, 55.534912 ], [ -133.033398, 55.589697 ], [ -133.089648, 55.612598 ], [ -133.24375, 55.59541 ], [ -133.298242, 55.606885 ], [ -133.342822, 55.65083 ], [ -133.368994, 55.688965 ], [ -133.502734, 55.695898 ], [ -133.553271, 55.691162 ], [ -133.640479, 55.748779 ], [ -133.680176, 55.785156 ], [ -133.664404, 55.803809 ], [ -133.584082, 55.836523 ], [ -133.537158, 55.831934 ], [ -133.446973, 55.797021 ], [ -133.411719, 55.79834 ], [ -133.322119, 55.844629 ], [ -133.308496, 55.886475 ], [ -133.241504, 55.920801 ], [ -133.252148, 55.95708 ], [ -133.289209, 56.018701 ], [ -133.37124, 56.035889 ], [ -133.538623, 55.999268 ], [ -133.684229, 55.942773 ], [ -133.742529, 55.964844 ], [ -133.755176, 55.999463 ], [ -133.599219, 56.093652 ], [ -133.530859, 56.145654 ], [ -133.544092, 56.176514 ], [ -133.594434, 56.216357 ], [ -133.598633, 56.31626 ], [ -133.566113, 56.339209 ] ] ], [ [ [ -133.9896, 56.844971 ], [ -133.924805, 56.775684 ], [ -133.830859, 56.781299 ], [ -133.778125, 56.728906 ], [ -133.738379, 56.650439 ], [ -133.767285, 56.600098 ], [ -133.809033, 56.611328 ], [ -133.855273, 56.582178 ], [ -133.883594, 56.485498 ], [ -133.870459, 56.388672 ], [ -133.884619, 56.292139 ], [ -133.938525, 56.193652 ], [ -133.949707, 56.127734 ], [ -133.970801, 56.10791 ], [ -133.993994, 56.101123 ], [ -134.024023, 56.118994 ], [ -134.06748, 56.133008 ], [ -134.122412, 56.077393 ], [ -134.1896, 56.076953 ], [ -134.245068, 56.203271 ], [ -134.195459, 56.413525 ], [ -134.084375, 56.456348 ], [ -134.150488, 56.513477 ], [ -134.290234, 56.580029 ], [ -134.278369, 56.61709 ], [ -134.384424, 56.724023 ], [ -134.390625, 56.749463 ], [ -134.373682, 56.838672 ], [ -134.274414, 56.918164 ], [ -134.143262, 56.932324 ], [ -134.051807, 56.898291 ], [ -134.000586, 56.869189 ], [ -133.9896, 56.844971 ] ] ], [ [ [ -152.416943, 58.360205 ], [ -152.380762, 58.3521 ], [ -152.343018, 58.411621 ], [ -152.31626, 58.413477 ], [ -152.197949, 58.363086 ], [ -152.125244, 58.374268 ], [ -152.078516, 58.312354 ], [ -152.036621, 58.306689 ], [ -151.997754, 58.314209 ], [ -151.974365, 58.309863 ], [ -151.98252, 58.244336 ], [ -152.068896, 58.17793 ], [ -152.109082, 58.161133 ], [ -152.165479, 58.178271 ], [ -152.186523, 58.184668 ], [ -152.223584, 58.214014 ], [ -152.25166, 58.251123 ], [ -152.268359, 58.251709 ], [ -152.334375, 58.208057 ], [ -152.332666, 58.186523 ], [ -152.305225, 58.154053 ], [ -152.309229, 58.133887 ], [ -152.381152, 58.124268 ], [ -152.451611, 58.129248 ], [ -152.537646, 58.100977 ], [ -152.558203, 58.118604 ], [ -152.571338, 58.168213 ], [ -152.598242, 58.162598 ], [ -152.63877, 58.101807 ], [ -152.683057, 58.06333 ], [ -152.763867, 58.031396 ], [ -152.781543, 58.015918 ], [ -152.840723, 58.013818 ], [ -152.928418, 57.993701 ], [ -152.982568, 57.99707 ], [ -153.305469, 58.063086 ], [ -153.381348, 58.087207 ], [ -153.11582, 58.238525 ], [ -152.976123, 58.297021 ], [ -152.895361, 58.293848 ], [ -152.814551, 58.275635 ], [ -152.771875, 58.278564 ], [ -152.768701, 58.345605 ], [ -152.843945, 58.395605 ], [ -152.841113, 58.416406 ], [ -152.674658, 58.450586 ], [ -152.612305, 58.445703 ], [ -152.543555, 58.428174 ], [ -152.478467, 58.399707 ], [ -152.416943, 58.360205 ] ] ], [ [ [ -167.964355, 53.345117 ], [ -168.270703, 53.238037 ], [ -168.370117, 53.159766 ], [ -168.445996, 53.084424 ], [ -168.505615, 53.043164 ], [ -168.549023, 53.036084 ], [ -168.597412, 53.016113 ], [ -168.698535, 52.963428 ], [ -168.741016, 52.956885 ], [ -169.065918, 52.833936 ], [ -169.088916, 52.832031 ], [ -169.073096, 52.86416 ], [ -168.973877, 52.909668 ], [ -168.90918, 52.951172 ], [ -168.836084, 53.019727 ], [ -168.79585, 53.044922 ], [ -168.783008, 53.079346 ], [ -168.777783, 53.148779 ], [ -168.759619, 53.175049 ], [ -168.689844, 53.227246 ], [ -168.639014, 53.255762 ], [ -168.572168, 53.265625 ], [ -168.436621, 53.256885 ], [ -168.38042, 53.283447 ], [ -168.362988, 53.303564 ], [ -168.397266, 53.321924 ], [ -168.405322, 53.353809 ], [ -168.396436, 53.408789 ], [ -168.357227, 53.457568 ], [ -168.287695, 53.500146 ], [ -168.193066, 53.533301 ], [ -168.073291, 53.556982 ], [ -167.985693, 53.558203 ], [ -167.828076, 53.507959 ], [ -167.804688, 53.484961 ], [ -167.843115, 53.43457 ], [ -167.865137, 53.387305 ], [ -167.964355, 53.345117 ] ] ], [ [ [ -166.615332, 53.900928 ], [ -166.572168, 53.853467 ], [ -166.497461, 53.883545 ], [ -166.442773, 53.924805 ], [ -166.400049, 53.978125 ], [ -166.372314, 53.998975 ], [ -166.335645, 53.970898 ], [ -166.230859, 53.932617 ], [ -166.318994, 53.873779 ], [ -166.48877, 53.785498 ], [ -166.545605, 53.726465 ], [ -166.549219, 53.700977 ], [ -166.384717, 53.720508 ], [ -166.33877, 53.717676 ], [ -166.309473, 53.69751 ], [ -166.354541, 53.673535 ], [ -166.444189, 53.651807 ], [ -166.522021, 53.609668 ], [ -166.702197, 53.53667 ], [ -166.77041, 53.476025 ], [ -166.850977, 53.452881 ], [ -166.960742, 53.447363 ], [ -167.153662, 53.407861 ], [ -167.270801, 53.370605 ], [ -167.300439, 53.350488 ], [ -167.337256, 53.340967 ], [ -167.381299, 53.341992 ], [ -167.428809, 53.325684 ], [ -167.479834, 53.291992 ], [ -167.522461, 53.276221 ], [ -167.592187, 53.272705 ], [ -167.628613, 53.259424 ], [ -167.669434, 53.259961 ], [ -167.780859, 53.300244 ], [ -167.808789, 53.323779 ], [ -167.710107, 53.370898 ], [ -167.638721, 53.386572 ], [ -167.530176, 53.393701 ], [ -167.423535, 53.437256 ], [ -167.204102, 53.494971 ], [ -167.136084, 53.526465 ], [ -167.092334, 53.635937 ], [ -167.042432, 53.65459 ], [ -167.015723, 53.698389 ], [ -166.894141, 53.697119 ], [ -166.83833, 53.648047 ], [ -166.81875, 53.641357 ], [ -166.808984, 53.646143 ], [ -166.803662, 53.6854 ], [ -166.74126, 53.712939 ], [ -166.777246, 53.733154 ], [ -166.8896, 53.758594 ], [ -166.972949, 53.770557 ], [ -167.027246, 53.769141 ], [ -167.071484, 53.783398 ], [ -167.105615, 53.813379 ], [ -167.121143, 53.843115 ], [ -167.118164, 53.872607 ], [ -167.090479, 53.905664 ], [ -167.038086, 53.942188 ], [ -166.978076, 53.962939 ], [ -166.848682, 53.977881 ], [ -166.734033, 54.002197 ], [ -166.673291, 54.005957 ], [ -166.627393, 53.995654 ], [ -166.615332, 53.900928 ] ] ], [ [ [ -173.55332, 52.136279 ], [ -173.357227, 52.095654 ], [ -173.113281, 52.100391 ], [ -173.024316, 52.090527 ], [ -173.0229, 52.07915 ], [ -173.178857, 52.0625 ], [ -173.232227, 52.067969 ], [ -173.368408, 52.045605 ], [ -173.460986, 52.041553 ], [ -173.672559, 52.062646 ], [ -173.835791, 52.048193 ], [ -173.878955, 52.053662 ], [ -173.930225, 52.072168 ], [ -173.9896, 52.103613 ], [ -173.99248, 52.12334 ], [ -173.938916, 52.131299 ], [ -173.794092, 52.104297 ], [ -173.779004, 52.118359 ], [ -173.656836, 52.14375 ], [ -173.55332, 52.136279 ] ] ], [ [ [ -174.677393, 52.03501 ], [ -175.213867, 51.993896 ], [ -175.295557, 52.022168 ], [ -175.21416, 52.038232 ], [ -175.117676, 52.047119 ], [ -174.915918, 52.094189 ], [ -174.667773, 52.134961 ], [ -174.474268, 52.184033 ], [ -174.306152, 52.216162 ], [ -174.258838, 52.269043 ], [ -174.406494, 52.295996 ], [ -174.435547, 52.317236 ], [ -174.36543, 52.341943 ], [ -174.306885, 52.37793 ], [ -174.168896, 52.420166 ], [ -174.045605, 52.367236 ], [ -174.018359, 52.331787 ], [ -174.030078, 52.289795 ], [ -174.054883, 52.245996 ], [ -174.163232, 52.223389 ], [ -174.179395, 52.200342 ], [ -174.120654, 52.135205 ], [ -174.343555, 52.077783 ], [ -174.677393, 52.03501 ] ] ], [ [ [ -176.593311, 51.866699 ], [ -176.587939, 51.833203 ], [ -176.473389, 51.837402 ], [ -176.437451, 51.820117 ], [ -176.437354, 51.754297 ], [ -176.452344, 51.735693 ], [ -176.469775, 51.731152 ], [ -176.510986, 51.745605 ], [ -176.55752, 51.712061 ], [ -176.770947, 51.629932 ], [ -176.837109, 51.675879 ], [ -176.961621, 51.603662 ], [ -176.874414, 51.790479 ], [ -176.773633, 51.81875 ], [ -176.736426, 51.839941 ], [ -176.745117, 51.894678 ], [ -176.69834, 51.986035 ], [ -176.596826, 51.981787 ], [ -176.549902, 51.944043 ], [ -176.551611, 51.91958 ], [ -176.593311, 51.866699 ] ] ], [ [ [ -177.879053, 51.649707 ], [ -177.90127, 51.616406 ], [ -177.925342, 51.617383 ], [ -178.058887, 51.672607 ], [ -178.078467, 51.69126 ], [ -178.000049, 51.71748 ], [ -177.977246, 51.737793 ], [ -177.986377, 51.764258 ], [ -178.045117, 51.801074 ], [ -178.153467, 51.848242 ], [ -178.194531, 51.882227 ], [ -178.168262, 51.903027 ], [ -178.116602, 51.915869 ], [ -177.953809, 51.918457 ], [ -177.865869, 51.8604 ], [ -177.799609, 51.840039 ], [ -177.644482, 51.82627 ], [ -177.724951, 51.80166 ], [ -177.770654, 51.777881 ], [ -177.826953, 51.685889 ], [ -177.879053, 51.649707 ] ] ], [ [ [ 179.727734, 51.90542 ], [ 179.645215, 51.880225 ], [ 179.549609, 51.894043 ], [ 179.497656, 51.932812 ], [ 179.503906, 51.97959 ], [ 179.627148, 52.03042 ], [ 179.77998, 51.966846 ], [ 179.727734, 51.90542 ] ] ], [ [ [ 177.41543, 51.882813 ], [ 177.328516, 51.841064 ], [ 177.260645, 51.883691 ], [ 177.250293, 51.90293 ], [ 177.380664, 51.975781 ], [ 177.478418, 51.991602 ], [ 177.520508, 52.018213 ], [ 177.56377, 52.110498 ], [ 177.636523, 52.113818 ], [ 177.669629, 52.103027 ], [ 177.653027, 52.059766 ], [ 177.595996, 51.993848 ], [ 177.594141, 51.947559 ], [ 177.41543, 51.882813 ] ] ], [ [ [ 172.811816, 53.012988 ], [ 172.983984, 52.980273 ], [ 173.102148, 52.995605 ], [ 173.25166, 52.942676 ], [ 173.436035, 52.852051 ], [ 173.394727, 52.834766 ], [ 173.348242, 52.824854 ], [ 173.302539, 52.825928 ], [ 173.158691, 52.810791 ], [ 173.080273, 52.814453 ], [ 172.935156, 52.7521 ], [ 172.775586, 52.796924 ], [ 172.721777, 52.885547 ], [ 172.595117, 52.907422 ], [ 172.494824, 52.937891 ], [ 172.67793, 53.007568 ], [ 172.811816, 53.012988 ] ] ], [ [ [ -155.581348, 19.012012 ], [ -155.625635, 18.963916 ], [ -155.680762, 18.967676 ], [ -155.881299, 19.070508 ], [ -155.905615, 19.12583 ], [ -155.890723, 19.38252 ], [ -155.96582, 19.59082 ], [ -156.048682, 19.749951 ], [ -155.988428, 19.831592 ], [ -155.908887, 19.894727 ], [ -155.820313, 20.01416 ], [ -155.892773, 20.167383 ], [ -155.874268, 20.259814 ], [ -155.831641, 20.27583 ], [ -155.62207, 20.163428 ], [ -155.198779, 19.994385 ], [ -155.086084, 19.875635 ], [ -155.065918, 19.748193 ], [ -154.989014, 19.731982 ], [ -154.952588, 19.644629 ], [ -154.841357, 19.568164 ], [ -154.804199, 19.524463 ], [ -154.850293, 19.454102 ], [ -155.053467, 19.319189 ], [ -155.309619, 19.260156 ], [ -155.535254, 19.109082 ], [ -155.581348, 19.012012 ] ] ], [ [ [ -157.213623, 21.215381 ], [ -157.002295, 21.187939 ], [ -156.952344, 21.199707 ], [ -156.917188, 21.177295 ], [ -156.742188, 21.163525 ], [ -156.712158, 21.155078 ], [ -156.7479, 21.103564 ], [ -156.859863, 21.056348 ], [ -157.020898, 21.097803 ], [ -157.290332, 21.112598 ], [ -157.279492, 21.152344 ], [ -157.253809, 21.180566 ], [ -157.249951, 21.229785 ], [ -157.213623, 21.215381 ] ] ], [ [ [ -156.486816, 20.932568 ], [ -156.46084, 20.914746 ], [ -156.354395, 20.941455 ], [ -156.277539, 20.95127 ], [ -156.14834, 20.885498 ], [ -156.103516, 20.840332 ], [ -156.018652, 20.79209 ], [ -155.989844, 20.757129 ], [ -156.013574, 20.714795 ], [ -156.107129, 20.644775 ], [ -156.234766, 20.628613 ], [ -156.309961, 20.598779 ], [ -156.408789, 20.605176 ], [ -156.438232, 20.617871 ], [ -156.448877, 20.70625 ], [ -156.480078, 20.801221 ], [ -156.543848, 20.78999 ], [ -156.61543, 20.821826 ], [ -156.689697, 20.901416 ], [ -156.697754, 20.949072 ], [ -156.656885, 21.024512 ], [ -156.5854, 21.034326 ], [ -156.532324, 20.992676 ], [ -156.486816, 20.932568 ] ] ], [ [ [ -157.799365, 21.456641 ], [ -157.76499, 21.450928 ], [ -157.720898, 21.457715 ], [ -157.705518, 21.378076 ], [ -157.65415, 21.333936 ], [ -157.6354, 21.307617 ], [ -157.690869, 21.279736 ], [ -157.798779, 21.268604 ], [ -157.849316, 21.29082 ], [ -157.901758, 21.340576 ], [ -157.958447, 21.326904 ], [ -157.968311, 21.366895 ], [ -157.978418, 21.378516 ], [ -158.017285, 21.367725 ], [ -157.980957, 21.316113 ], [ -158.07915, 21.312256 ], [ -158.110352, 21.318604 ], [ -158.137842, 21.377148 ], [ -158.239111, 21.489355 ], [ -158.238672, 21.533057 ], [ -158.273145, 21.585254 ], [ -158.123096, 21.600244 ], [ -158.020361, 21.691797 ], [ -157.9625, 21.701367 ], [ -157.851514, 21.553369 ], [ -157.854346, 21.511914 ], [ -157.82959, 21.471436 ], [ -157.799365, 21.456641 ] ] ], [ [ [ -159.372754, 21.932373 ], [ -159.460693, 21.876123 ], [ -159.511865, 21.900391 ], [ -159.608838, 21.909521 ], [ -159.646387, 21.951758 ], [ -159.747998, 21.989844 ], [ -159.78916, 22.041797 ], [ -159.726611, 22.140186 ], [ -159.579199, 22.223145 ], [ -159.352051, 22.21958 ], [ -159.304785, 22.154053 ], [ -159.300684, 22.105273 ], [ -159.330176, 22.050684 ], [ -159.34375, 21.973633 ], [ -159.372754, 21.932373 ] ] ], [ [ [ -160.180029, 21.841064 ], [ -160.200244, 21.796875 ], [ -160.234717, 21.803662 ], [ -160.243457, 21.843066 ], [ -160.220898, 21.897266 ], [ -160.163867, 21.944043 ], [ -160.100635, 22.015234 ], [ -160.04873, 22.004639 ], [ -160.076709, 21.958105 ], [ -160.080029, 21.907422 ], [ -160.153418, 21.87876 ], [ -160.180029, 21.841064 ] ] ], [ [ [ -156.849609, 20.772656 ], [ -156.908887, 20.744482 ], [ -156.973389, 20.75752 ], [ -156.988428, 20.825684 ], [ -157.050586, 20.912451 ], [ -156.941797, 20.930029 ], [ -156.880566, 20.904834 ], [ -156.848291, 20.877783 ], [ -156.809375, 20.831152 ], [ -156.849609, 20.772656 ] ] ], [ [ [ -74.708887, 45.003857 ], [ -74.663232, 45.003906 ], [ -74.430371, 45.004199 ], [ -74.014258, 45.004688 ], [ -73.598145, 45.005176 ], [ -73.182031, 45.005615 ], [ -72.765918, 45.006104 ], [ -72.349756, 45.006592 ], [ -71.933643, 45.00708 ], [ -71.517529, 45.007568 ], [ -71.419043, 45.200342 ], [ -71.327295, 45.290088 ], [ -71.201611, 45.260352 ], [ -71.134668, 45.262842 ], [ -71.060254, 45.309131 ], [ -70.999902, 45.337256 ], [ -70.960156, 45.333105 ], [ -70.926221, 45.290723 ], [ -70.897998, 45.262451 ], [ -70.865039, 45.270703 ], [ -70.836816, 45.310693 ], [ -70.837793, 45.366162 ], [ -70.79917, 45.404785 ], [ -70.75332, 45.410693 ], [ -70.710938, 45.409473 ], [ -70.689795, 45.42832 ], [ -70.692139, 45.455371 ], [ -70.707422, 45.498926 ], [ -70.702246, 45.551367 ], [ -70.596387, 45.643994 ], [ -70.466602, 45.706836 ], [ -70.421094, 45.738232 ], [ -70.407861, 45.801904 ], [ -70.333447, 45.868066 ], [ -70.29624, 45.906104 ], [ -70.287158, 45.93916 ], [ -70.306445, 45.979834 ], [ -70.304492, 46.057373 ], [ -70.278906, 46.15 ], [ -70.248291, 46.250879 ], [ -70.179688, 46.341846 ], [ -70.067187, 46.441064 ], [ -70.038232, 46.571436 ], [ -70.007715, 46.708936 ], [ -69.871729, 46.84292 ], [ -69.717529, 46.994873 ], [ -69.629785, 47.081348 ], [ -69.471484, 47.238672 ], [ -69.358887, 47.350635 ], [ -69.302148, 47.402002 ], [ -69.242871, 47.462988 ], [ -69.146289, 47.444775 ], [ -69.050195, 47.426611 ], [ -69.064258, 47.338135 ], [ -69.048584, 47.273633 ], [ -69.003125, 47.236426 ], [ -68.937207, 47.21123 ], [ -68.887402, 47.202832 ], [ -68.828711, 47.20332 ], [ -68.668555, 47.253467 ], [ -68.480371, 47.285791 ], [ -68.376904, 47.316162 ], [ -68.358008, 47.344531 ], [ -68.310889, 47.354492 ], [ -68.235498, 47.345947 ], [ -68.096777, 47.274854 ], [ -67.934863, 47.167627 ], [ -67.806787, 47.082813 ], [ -67.802832, 46.935742 ], [ -67.800342, 46.779883 ], [ -67.797705, 46.615625 ], [ -67.795801, 46.498389 ], [ -67.792529, 46.337402 ], [ -67.789941, 46.209326 ], [ -67.786475, 46.042139 ], [ -67.784668, 45.952783 ], [ -67.767041, 45.927002 ], [ -67.777637, 45.891797 ], [ -67.782275, 45.87417 ], [ -67.781152, 45.860156 ], [ -67.774121, 45.842529 ], [ -67.775293, 45.817871 ], [ -67.791699, 45.795557 ], [ -67.799902, 45.769775 ], [ -67.802246, 45.727539 ], [ -67.784668, 45.701709 ], [ -67.755322, 45.686475 ], [ -67.730664, 45.686475 ], [ -67.698975, 45.671191 ], [ -67.65791, 45.644189 ], [ -67.595752, 45.620752 ], [ -67.531201, 45.612549 ], [ -67.486621, 45.618408 ], [ -67.432666, 45.603125 ], [ -67.413867, 45.565576 ], [ -67.424414, 45.53042 ], [ -67.454932, 45.513965 ], [ -67.487793, 45.501025 ], [ -67.493652, 45.474072 ], [ -67.477246, 45.445898 ], [ -67.45376, 45.42124 ], [ -67.42793, 45.37793 ], [ -67.438525, 45.340381 ], [ -67.461963, 45.308691 ], [ -67.472559, 45.275879 ], [ -67.452588, 45.247656 ], [ -67.399805, 45.210156 ], [ -67.366943, 45.173779 ], [ -67.315283, 45.153809 ], [ -67.290674, 45.16792 ], [ -67.270703, 45.186719 ], [ -67.249609, 45.200781 ], [ -67.213232, 45.192529 ], [ -67.170996, 45.181982 ], [ -67.124854, 45.169434 ], [ -67.130371, 45.139014 ], [ -67.102246, 45.087744 ], [ -67.080469, 44.98916 ], [ -67.113916, 44.944385 ], [ -67.106738, 44.885059 ], [ -67.014014, 44.867773 ], [ -66.991455, 44.849609 ], [ -66.987012, 44.827686 ], [ -67.19126, 44.675586 ], [ -67.364062, 44.696875 ], [ -67.457812, 44.656543 ], [ -67.556006, 44.644775 ], [ -67.599072, 44.576807 ], [ -67.652979, 44.562402 ], [ -67.726807, 44.566504 ], [ -67.790479, 44.585693 ], [ -67.839062, 44.57627 ], [ -67.907031, 44.453613 ], [ -67.962695, 44.464307 ], [ -67.984863, 44.420166 ], [ -68.013965, 44.400879 ], [ -68.056641, 44.384326 ], [ -68.093701, 44.438818 ], [ -68.117285, 44.490625 ], [ -68.152051, 44.502002 ], [ -68.198242, 44.515234 ], [ -68.245752, 44.514795 ], [ -68.277441, 44.507373 ], [ -68.316748, 44.473877 ], [ -68.37373, 44.445117 ], [ -68.416846, 44.469092 ], [ -68.450586, 44.507617 ], [ -68.479443, 44.445654 ], [ -68.521436, 44.380225 ], [ -68.514453, 44.303906 ], [ -68.53252, 44.258643 ], [ -68.572363, 44.27085 ], [ -68.612012, 44.310547 ], [ -68.723291, 44.342285 ], [ -68.811914, 44.339355 ], [ -68.793896, 44.381738 ], [ -68.710107, 44.442578 ], [ -68.735889, 44.454492 ], [ -68.777002, 44.446045 ], [ -68.794922, 44.454492 ], [ -68.765527, 44.509766 ], [ -68.762695, 44.570752 ], [ -68.800195, 44.549414 ], [ -68.847363, 44.485059 ], [ -68.961475, 44.433838 ], [ -68.956152, 44.348096 ], [ -69.063574, 44.172363 ], [ -69.068359, 44.097559 ], [ -69.137256, 44.037842 ], [ -69.226074, 43.986475 ], [ -69.344531, 44.000928 ], [ -69.434961, 43.956299 ], [ -69.480859, 43.905078 ], [ -69.520752, 43.897363 ], [ -69.541553, 43.962598 ], [ -69.556689, 43.982764 ], [ -69.58999, 43.886572 ], [ -69.623926, 43.880615 ], [ -69.636768, 43.948828 ], [ -69.652881, 43.993896 ], [ -69.699121, 43.955029 ], [ -69.729834, 43.852002 ], [ -69.762012, 43.860693 ], [ -69.772266, 43.899023 ], [ -69.795312, 43.910645 ], [ -69.803223, 43.866846 ], [ -69.791602, 43.805225 ], [ -69.80835, 43.772314 ], [ -69.840332, 43.789893 ], [ -69.87251, 43.819531 ], [ -69.925586, 43.797021 ], [ -69.974316, 43.787891 ], [ -69.974512, 43.818066 ], [ -69.965234, 43.855078 ], [ -70.062354, 43.834619 ], [ -70.178809, 43.766357 ], [ -70.269238, 43.671924 ], [ -70.237891, 43.656201 ], [ -70.202588, 43.626123 ], [ -70.359668, 43.480225 ], [ -70.520703, 43.348828 ], [ -70.642334, 43.134424 ], [ -70.691162, 43.109326 ], [ -70.733105, 43.07002 ], [ -70.777637, 42.940576 ], [ -70.829053, 42.825342 ], [ -70.800293, 42.774023 ], [ -70.781348, 42.72124 ], [ -70.735693, 42.669287 ], [ -70.696875, 42.6646 ], [ -70.654834, 42.673975 ], [ -70.623975, 42.671777 ], [ -70.60415, 42.649707 ], [ -70.612939, 42.623242 ], [ -70.661426, 42.61665 ], [ -70.751855, 42.570361 ], [ -70.831152, 42.552588 ], [ -70.870898, 42.496631 ], [ -70.930469, 42.431982 ], [ -71.046191, 42.331104 ], [ -70.996729, 42.3 ], [ -70.817969, 42.264941 ], [ -70.738281, 42.228857 ], [ -70.617676, 42.04043 ], [ -70.645215, 42.021582 ], [ -70.656152, 41.987061 ], [ -70.548926, 41.938623 ], [ -70.514697, 41.80332 ], [ -70.42666, 41.757275 ], [ -70.295459, 41.728955 ], [ -70.13501, 41.769873 ], [ -70.001416, 41.826172 ], [ -70.006104, 41.872314 ], [ -70.090039, 41.979687 ], [ -70.110254, 42.030127 ], [ -70.172559, 42.062793 ], [ -70.19624, 42.035107 ], [ -70.236523, 42.071045 ], [ -70.241064, 42.091211 ], [ -70.203516, 42.101025 ], [ -70.159863, 42.097119 ], [ -70.108936, 42.07832 ], [ -69.977881, 41.961279 ], [ -69.941602, 41.807861 ], [ -69.933838, 41.710449 ], [ -69.948633, 41.677148 ], [ -69.986768, 41.683984 ], [ -70.059521, 41.677344 ], [ -70.404687, 41.626904 ], [ -70.481348, 41.582471 ], [ -70.657129, 41.534229 ], [ -70.668066, 41.558301 ], [ -70.655371, 41.608105 ], [ -70.666455, 41.710107 ], [ -70.701123, 41.714844 ], [ -70.974219, 41.548535 ], [ -71.079785, 41.538086 ], [ -71.168555, 41.489404 ], [ -71.188428, 41.516406 ], [ -71.204297, 41.641113 ], [ -71.14873, 41.745703 ], [ -71.17832, 41.744043 ], [ -71.271094, 41.68125 ], [ -71.310742, 41.719873 ], [ -71.330615, 41.762256 ], [ -71.35918, 41.78623 ], [ -71.390137, 41.795313 ], [ -71.363672, 41.702734 ], [ -71.426562, 41.633301 ], [ -71.443799, 41.453711 ], [ -71.522852, 41.378955 ], [ -71.769287, 41.330908 ], [ -71.929932, 41.341064 ], [ -72.073877, 41.326123 ], [ -72.265283, 41.29165 ], [ -72.371045, 41.312158 ], [ -72.479395, 41.275781 ], [ -72.847168, 41.265869 ], [ -72.924707, 41.285156 ], [ -73.02373, 41.216455 ], [ -73.182275, 41.17583 ], [ -73.583008, 41.021875 ], [ -73.671387, 40.965869 ], [ -73.779004, 40.878418 ], [ -73.85127, 40.831396 ], [ -73.910693, 40.816113 ], [ -73.947217, 40.776953 ], [ -73.987109, 40.751367 ], [ -73.948584, 40.83877 ], [ -73.906738, 40.912451 ], [ -73.871973, 41.055176 ], [ -73.882227, 41.170605 ], [ -73.925342, 41.218066 ], [ -73.969922, 41.249707 ], [ -73.917676, 41.135791 ], [ -73.909229, 40.996094 ], [ -73.927197, 40.914258 ], [ -74.025488, 40.756396 ], [ -74.067334, 40.719629 ], [ -74.11626, 40.687305 ], [ -74.153125, 40.673242 ], [ -74.187158, 40.647998 ], [ -74.226709, 40.608008 ], [ -74.264209, 40.528613 ], [ -74.241504, 40.45625 ], [ -74.049854, 40.429834 ], [ -73.998437, 40.452148 ], [ -73.972266, 40.400342 ], [ -73.957617, 40.328369 ], [ -73.971973, 40.250537 ], [ -74.004004, 40.171338 ], [ -74.02832, 40.072998 ], [ -74.048926, 39.923047 ], [ -74.079932, 39.788135 ], [ -74.083984, 39.829102 ], [ -74.0646, 39.993115 ], [ -74.095996, 39.975977 ], [ -74.117627, 39.938135 ], [ -74.176123, 39.726611 ], [ -74.256543, 39.613867 ], [ -74.330615, 39.535889 ], [ -74.407031, 39.548779 ], [ -74.389844, 39.486816 ], [ -74.41084, 39.454541 ], [ -74.428809, 39.387207 ], [ -74.474365, 39.342578 ], [ -74.517188, 39.346875 ], [ -74.578711, 39.316113 ], [ -74.602979, 39.292578 ], [ -74.604785, 39.24751 ], [ -74.645947, 39.207861 ], [ -74.794482, 39.001904 ], [ -74.923438, 38.941113 ], [ -74.954297, 38.949951 ], [ -74.920312, 39.047168 ], [ -74.897021, 39.145459 ], [ -74.975293, 39.188232 ], [ -75.050195, 39.21084 ], [ -75.136133, 39.207861 ], [ -75.231055, 39.284277 ], [ -75.353418, 39.339844 ], [ -75.524219, 39.490186 ], [ -75.519238, 39.531885 ], [ -75.523535, 39.601855 ], [ -75.471631, 39.712402 ], [ -75.421875, 39.789697 ], [ -75.353174, 39.829736 ], [ -75.153809, 39.870508 ], [ -75.103809, 39.931836 ], [ -75.07417, 39.983496 ], [ -75.172949, 39.894775 ], [ -75.320898, 39.864697 ], [ -75.400635, 39.831592 ], [ -75.464404, 39.780957 ], [ -75.502148, 39.717383 ], [ -75.587598, 39.640771 ], [ -75.581592, 39.589453 ], [ -75.567285, 39.552979 ], [ -75.573877, 39.476953 ], [ -75.519824, 39.402832 ], [ -75.412646, 39.281396 ], [ -75.392188, 39.092773 ], [ -75.3104, 38.966553 ], [ -75.185059, 38.819385 ], [ -75.088672, 38.777539 ], [ -75.083984, 38.722803 ], [ -75.128467, 38.632422 ], [ -75.187109, 38.591113 ], [ -75.11084, 38.599365 ], [ -75.072852, 38.578711 ], [ -75.035889, 38.50332 ], [ -75.03877, 38.426367 ], [ -75.05127, 38.383008 ], [ -75.074365, 38.365723 ], [ -75.073389, 38.41001 ], [ -75.089746, 38.425391 ], [ -75.116748, 38.406201 ], [ -75.134229, 38.384326 ], [ -75.141504, 38.298145 ], [ -75.16001, 38.255078 ], [ -75.225439, 38.242285 ], [ -75.291797, 38.129199 ], [ -75.353516, 38.065039 ], [ -75.596387, 37.631201 ], [ -75.587109, 37.558691 ], [ -75.631543, 37.535352 ], [ -75.698828, 37.516357 ], [ -75.766895, 37.472998 ], [ -75.812061, 37.425195 ], [ -75.854004, 37.296631 ], [ -75.934375, 37.151904 ], [ -75.984521, 37.212207 ], [ -75.997363, 37.263818 ], [ -75.975049, 37.398438 ], [ -75.888135, 37.619141 ], [ -75.792383, 37.756348 ], [ -75.719336, 37.821387 ], [ -75.659277, 37.953955 ], [ -75.735156, 37.97373 ], [ -75.85083, 37.971582 ], [ -75.829053, 38.032764 ], [ -75.795312, 38.08667 ], [ -75.855615, 38.140381 ], [ -75.891309, 38.147217 ], [ -75.928076, 38.169238 ], [ -75.884961, 38.213965 ], [ -75.863916, 38.26123 ], [ -75.876758, 38.31875 ], [ -75.858691, 38.362061 ], [ -75.888818, 38.355518 ], [ -75.937256, 38.309668 ], [ -75.967383, 38.291357 ], [ -75.985742, 38.331934 ], [ -76.006689, 38.322754 ], [ -76.020312, 38.294873 ], [ -76.051221, 38.279541 ], [ -76.116504, 38.317676 ], [ -76.21167, 38.361328 ], [ -76.264648, 38.436426 ], [ -76.294873, 38.494629 ], [ -76.26416, 38.599951 ], [ -76.198389, 38.618652 ], [ -76.112939, 38.601563 ], [ -76.000928, 38.601709 ], [ -76.016943, 38.625098 ], [ -76.056934, 38.62124 ], [ -76.175, 38.706689 ], [ -76.212988, 38.758301 ], [ -76.27832, 38.772461 ], [ -76.308105, 38.722852 ], [ -76.341162, 38.709668 ], [ -76.300342, 38.818213 ], [ -76.246973, 38.822656 ], [ -76.168164, 38.852734 ], [ -76.191064, 38.915576 ], [ -76.24082, 38.943066 ], [ -76.330664, 38.908594 ], [ -76.32959, 38.952783 ], [ -76.312744, 39.009375 ], [ -76.24502, 39.00918 ], [ -76.185693, 38.990723 ], [ -76.135205, 39.082129 ], [ -76.132959, 39.122949 ], [ -76.216846, 39.063623 ], [ -76.235693, 39.191602 ], [ -76.153125, 39.315039 ], [ -76.074365, 39.368848 ], [ -75.975977, 39.367285 ], [ -75.875977, 39.375977 ], [ -75.938721, 39.398584 ], [ -76.003125, 39.41084 ], [ -75.954736, 39.459619 ], [ -75.913477, 39.468359 ], [ -75.872949, 39.510889 ], [ -75.97041, 39.50459 ], [ -75.958936, 39.585059 ], [ -76.006299, 39.568701 ], [ -76.062988, 39.561133 ], [ -76.085059, 39.527002 ], [ -76.080713, 39.470312 ], [ -76.097266, 39.433105 ], [ -76.141357, 39.403223 ], [ -76.21582, 39.379932 ], [ -76.223047, 39.420313 ], [ -76.247656, 39.438623 ], [ -76.256836, 39.352148 ], [ -76.276367, 39.322754 ], [ -76.330811, 39.403906 ], [ -76.347168, 39.387549 ], [ -76.345068, 39.364502 ], [ -76.358984, 39.324658 ], [ -76.405664, 39.303906 ], [ -76.402783, 39.252832 ], [ -76.420898, 39.225 ], [ -76.57041, 39.269336 ], [ -76.573926, 39.254297 ], [ -76.489355, 39.158691 ], [ -76.427588, 39.126025 ], [ -76.420068, 39.073877 ], [ -76.473096, 39.030615 ], [ -76.54624, 39.067969 ], [ -76.558545, 39.065234 ], [ -76.518799, 39.001172 ], [ -76.49375, 38.945215 ], [ -76.519531, 38.89834 ], [ -76.515527, 38.840625 ], [ -76.521094, 38.788281 ], [ -76.536865, 38.742627 ], [ -76.501318, 38.532178 ], [ -76.458496, 38.474951 ], [ -76.416406, 38.420215 ], [ -76.394092, 38.368994 ], [ -76.43877, 38.361523 ], [ -76.509912, 38.403662 ], [ -76.572412, 38.435791 ], [ -76.646875, 38.538525 ], [ -76.65918, 38.579541 ], [ -76.677344, 38.611963 ], [ -76.668555, 38.5375 ], [ -76.641992, 38.454346 ], [ -76.408789, 38.268262 ], [ -76.365723, 38.196875 ], [ -76.33291, 38.140771 ], [ -76.341162, 38.087012 ], [ -76.401953, 38.125049 ], [ -76.454395, 38.173535 ], [ -76.593604, 38.22832 ], [ -76.769141, 38.262939 ], [ -76.868115, 38.390283 ], [ -76.867773, 38.337158 ], [ -76.889746, 38.29209 ], [ -76.950244, 38.347021 ], [ -76.988379, 38.393896 ], [ -77.001172, 38.445264 ], [ -77.076709, 38.441748 ], [ -77.155908, 38.397119 ], [ -77.23252, 38.407715 ], [ -77.241602, 38.494824 ], [ -77.220898, 38.540967 ], [ -77.134912, 38.650098 ], [ -77.053906, 38.705811 ], [ -77.018164, 38.777734 ], [ -77.030371, 38.889258 ], [ -77.045605, 38.775781 ], [ -77.091895, 38.719531 ], [ -77.164648, 38.676563 ], [ -77.2604, 38.6 ], [ -77.283789, 38.529199 ], [ -77.313672, 38.396631 ], [ -77.273242, 38.351758 ], [ -77.231934, 38.340039 ], [ -77.109912, 38.370117 ], [ -77.046777, 38.356689 ], [ -76.906348, 38.19707 ], [ -76.644873, 38.133936 ], [ -76.549512, 38.094482 ], [ -76.471777, 38.011182 ], [ -76.354932, 37.963232 ], [ -76.264258, 37.893555 ], [ -76.261816, 37.848096 ], [ -76.293213, 37.794336 ], [ -76.305615, 37.721582 ], [ -76.344141, 37.675684 ], [ -76.436621, 37.67041 ], [ -76.49248, 37.682227 ], [ -76.792773, 37.937988 ], [ -76.828613, 37.961523 ], [ -76.93999, 38.095459 ], [ -77.070654, 38.167187 ], [ -77.111084, 38.165674 ], [ -76.925098, 38.033008 ], [ -76.84917, 37.940234 ], [ -76.71543, 37.810156 ], [ -76.619824, 37.755078 ], [ -76.549463, 37.669141 ], [ -76.484082, 37.628857 ], [ -76.305566, 37.571484 ], [ -76.367627, 37.530273 ], [ -76.268555, 37.495166 ], [ -76.254395, 37.430615 ], [ -76.263477, 37.357031 ], [ -76.400977, 37.386133 ], [ -76.405469, 37.331934 ], [ -76.393164, 37.299951 ], [ -76.453906, 37.273535 ], [ -76.538379, 37.309375 ], [ -76.757715, 37.50542 ], [ -76.755859, 37.479199 ], [ -76.738086, 37.448779 ], [ -76.610889, 37.322559 ], [ -76.497363, 37.246875 ], [ -76.401123, 37.212695 ], [ -76.326953, 37.149268 ], [ -76.300781, 37.110889 ], [ -76.283301, 37.052686 ], [ -76.338281, 37.013135 ], [ -76.400879, 36.991309 ], [ -76.462012, 37.030762 ], [ -76.506836, 37.072314 ], [ -76.602295, 37.142871 ], [ -76.630908, 37.221729 ], [ -76.703516, 37.217676 ], [ -77.006982, 37.317676 ], [ -77.250879, 37.329199 ], [ -77.227051, 37.309082 ], [ -77.196191, 37.295703 ], [ -77.001953, 37.271045 ], [ -76.925195, 37.225 ], [ -76.76543, 37.184131 ], [ -76.671875, 37.172949 ], [ -76.633936, 37.047412 ], [ -76.504639, 36.961035 ], [ -76.487842, 36.897021 ], [ -76.399561, 36.889844 ], [ -76.244238, 36.952637 ], [ -76.143994, 36.930615 ], [ -75.999414, 36.912646 ], [ -75.966357, 36.861963 ], [ -75.941553, 36.765527 ], [ -75.89043, 36.657031 ], [ -75.757861, 36.229248 ], [ -75.558691, 35.879346 ], [ -75.53418, 35.819092 ], [ -75.580469, 35.871973 ], [ -75.728223, 36.103711 ], [ -75.809766, 36.271045 ], [ -75.893555, 36.566504 ], [ -75.917871, 36.632666 ], [ -75.946484, 36.659082 ], [ -75.965332, 36.637598 ], [ -75.973437, 36.599951 ], [ -75.959766, 36.571045 ], [ -75.992773, 36.473779 ], [ -75.978467, 36.42915 ], [ -75.924854, 36.383008 ], [ -75.866602, 36.267871 ], [ -75.820068, 36.112842 ], [ -75.883008, 36.175684 ], [ -75.950195, 36.208984 ], [ -76.054736, 36.234521 ], [ -76.147852, 36.279297 ], [ -76.141064, 36.215088 ], [ -76.15, 36.145752 ], [ -76.221777, 36.166895 ], [ -76.270605, 36.189893 ], [ -76.227393, 36.116016 ], [ -76.321191, 36.138184 ], [ -76.383691, 36.133545 ], [ -76.424316, 36.067969 ], [ -76.478809, 36.028174 ], [ -76.559375, 36.015332 ], [ -76.678906, 36.075293 ], [ -76.717627, 36.148096 ], [ -76.733643, 36.22915 ], [ -76.740039, 36.133301 ], [ -76.71875, 36.033496 ], [ -76.726221, 35.957617 ], [ -76.611133, 35.943652 ], [ -76.503516, 35.956055 ], [ -76.358301, 35.952881 ], [ -76.263574, 35.96709 ], [ -76.206543, 35.991211 ], [ -76.069775, 35.970312 ], [ -76.060059, 35.878662 ], [ -76.075684, 35.787549 ], [ -76.083594, 35.690527 ], [ -76.045703, 35.691162 ], [ -76.001172, 35.722168 ], [ -75.978906, 35.895947 ], [ -75.853906, 35.960156 ], [ -75.812012, 35.955762 ], [ -75.772217, 35.899902 ], [ -75.758838, 35.843262 ], [ -75.744727, 35.765479 ], [ -75.773926, 35.646973 ], [ -75.965967, 35.508398 ], [ -76.103516, 35.380273 ], [ -76.173828, 35.35415 ], [ -76.275244, 35.369043 ], [ -76.390234, 35.40127 ], [ -76.446631, 35.407764 ], [ -76.489502, 35.397021 ], [ -76.515625, 35.436475 ], [ -76.532471, 35.508447 ], [ -76.577197, 35.532324 ], [ -76.611035, 35.529688 ], [ -76.634131, 35.453223 ], [ -76.741406, 35.431494 ], [ -76.887256, 35.463086 ], [ -77.03999, 35.527393 ], [ -76.974463, 35.458398 ], [ -76.595459, 35.329687 ], [ -76.552783, 35.305615 ], [ -76.512939, 35.27041 ], [ -76.565967, 35.215186 ], [ -76.60752, 35.152979 ], [ -76.613379, 35.10415 ], [ -76.628027, 35.07334 ], [ -76.77915, 34.990332 ], [ -76.861035, 35.00498 ], [ -77.070264, 35.154639 ], [ -76.974951, 35.025195 ], [ -76.898633, 34.970264 ], [ -76.744971, 34.940967 ], [ -76.456738, 34.989355 ], [ -76.362207, 34.936523 ], [ -76.439795, 34.84292 ], [ -76.516895, 34.777246 ], [ -76.618018, 34.769922 ], [ -76.70708, 34.752148 ], [ -76.733203, 34.706982 ], [ -76.79668, 34.70415 ], [ -76.895898, 34.701465 ], [ -77.049512, 34.697363 ], [ -77.133887, 34.70791 ], [ -77.251758, 34.615625 ], [ -77.29624, 34.60293 ], [ -77.358398, 34.620264 ], [ -77.384473, 34.694385 ], [ -77.412256, 34.730811 ], [ -77.412939, 34.592139 ], [ -77.402051, 34.554785 ], [ -77.379785, 34.526611 ], [ -77.517676, 34.451367 ], [ -77.649658, 34.35752 ], [ -77.696973, 34.331982 ], [ -77.750732, 34.284961 ], [ -77.86084, 34.14917 ], [ -77.888037, 34.050146 ], [ -77.927832, 33.939746 ], [ -77.932861, 33.989453 ], [ -77.926025, 34.073145 ], [ -77.953271, 34.168994 ], [ -77.970557, 33.993408 ], [ -78.01333, 33.911816 ], [ -78.405859, 33.917578 ], [ -78.577686, 33.873242 ], [ -78.841455, 33.724072 ], [ -78.920312, 33.658691 ], [ -79.138184, 33.405908 ], [ -79.193799, 33.244141 ], [ -79.238379, 33.312158 ], [ -79.227344, 33.363184 ], [ -79.226465, 33.404883 ], [ -79.281348, 33.31543 ], [ -79.229248, 33.185156 ], [ -79.276025, 33.1354 ], [ -79.419922, 33.042529 ], [ -79.498682, 33.027295 ], [ -79.587109, 33.000879 ], [ -79.614941, 32.909277 ], [ -79.73501, 32.824805 ], [ -79.80498, 32.787402 ], [ -79.933105, 32.810059 ], [ -79.893652, 32.728711 ], [ -79.940723, 32.667139 ], [ -80.021777, 32.619922 ], [ -80.122559, 32.589111 ], [ -80.180322, 32.592871 ], [ -80.229687, 32.576514 ], [ -80.268359, 32.537354 ], [ -80.362842, 32.500732 ], [ -80.460986, 32.521338 ], [ -80.572217, 32.533691 ], [ -80.63418, 32.511719 ], [ -80.530029, 32.475391 ], [ -80.474268, 32.422754 ], [ -80.485742, 32.351807 ], [ -80.513623, 32.324414 ], [ -80.579346, 32.287305 ], [ -80.608203, 32.292822 ], [ -80.62583, 32.32627 ], [ -80.647217, 32.395947 ], [ -80.677783, 32.381104 ], [ -80.683057, 32.348633 ], [ -80.709326, 32.337061 ], [ -80.802539, 32.448047 ], [ -80.7979, 32.363379 ], [ -80.765332, 32.29834 ], [ -80.733838, 32.265332 ], [ -80.702051, 32.245898 ], [ -80.694238, 32.215723 ], [ -80.758008, 32.142187 ], [ -80.79082, 32.12583 ], [ -80.849219, 32.113916 ], [ -80.88208, 32.068604 ], [ -80.872363, 32.02959 ], [ -80.923438, 31.944922 ], [ -81.045557, 31.892041 ], [ -81.082861, 31.894092 ], [ -81.113281, 31.878613 ], [ -81.095508, 31.840918 ], [ -81.065039, 31.813477 ], [ -81.066113, 31.787988 ], [ -81.098389, 31.753369 ], [ -81.162109, 31.743701 ], [ -81.1979, 31.704199 ], [ -81.186572, 31.666943 ], [ -81.165527, 31.646143 ], [ -81.169922, 31.610303 ], [ -81.242383, 31.574316 ], [ -81.259375, 31.538916 ], [ -81.223389, 31.528467 ], [ -81.195703, 31.538916 ], [ -81.175439, 31.531299 ], [ -81.218896, 31.472119 ], [ -81.25791, 31.436035 ], [ -81.294971, 31.371191 ], [ -81.380957, 31.353271 ], [ -81.377734, 31.332324 ], [ -81.32915, 31.31377 ], [ -81.288477, 31.263916 ], [ -81.364893, 31.171875 ], [ -81.412598, 31.179443 ], [ -81.441748, 31.199707 ], [ -81.460352, 31.127051 ], [ -81.453223, 31.088281 ], [ -81.471387, 31.009033 ], [ -81.500586, 30.91377 ], [ -81.52041, 30.874658 ], [ -81.516211, 30.801807 ], [ -81.503955, 30.731445 ], [ -81.457178, 30.640771 ], [ -81.385742, 30.269971 ], [ -81.337109, 30.141211 ], [ -81.249512, 29.793799 ], [ -81.104541, 29.456982 ], [ -80.9, 29.049854 ], [ -80.564307, 28.556396 ], [ -80.524121, 28.486084 ], [ -80.567822, 28.426465 ], [ -80.581152, 28.364697 ], [ -80.584961, 28.271582 ], [ -80.572852, 28.180859 ], [ -80.533154, 28.070068 ], [ -80.456885, 27.900684 ], [ -80.499561, 27.934473 ], [ -80.61001, 28.177588 ], [ -80.622852, 28.320361 ], [ -80.606934, 28.5229 ], [ -80.632861, 28.518018 ], [ -80.653906, 28.452197 ], [ -80.665479, 28.374902 ], [ -80.693506, 28.344971 ], [ -80.731738, 28.462891 ], [ -80.729053, 28.516211 ], [ -80.688477, 28.578516 ], [ -80.700244, 28.600928 ], [ -80.765918, 28.632813 ], [ -80.779883, 28.682959 ], [ -80.770996, 28.732471 ], [ -80.808691, 28.758936 ], [ -80.838184, 28.757666 ], [ -80.818408, 28.635596 ], [ -80.787207, 28.560645 ], [ -80.748633, 28.381006 ], [ -80.686377, 28.272168 ], [ -80.650098, 28.180908 ], [ -80.226123, 27.207031 ], [ -80.125781, 27.083008 ], [ -80.088672, 26.993945 ], [ -80.050049, 26.807715 ], [ -80.041309, 26.568604 ], [ -80.110596, 26.131592 ], [ -80.126367, 25.833496 ], [ -80.136279, 25.842627 ], [ -80.14292, 25.874023 ], [ -80.158936, 25.87832 ], [ -80.219092, 25.741748 ], [ -80.30083, 25.618555 ], [ -80.327734, 25.4271 ], [ -80.366943, 25.33125 ], [ -80.484668, 25.229834 ], [ -80.557617, 25.232422 ], [ -80.736523, 25.156348 ], [ -80.862207, 25.176172 ], [ -81.011963, 25.133252 ], [ -81.110498, 25.138037 ], [ -81.167383, 25.228516 ], [ -81.158691, 25.268994 ], [ -81.136035, 25.309668 ], [ -81.097656, 25.319141 ], [ -80.965381, 25.224316 ], [ -80.94043, 25.264209 ], [ -80.980371, 25.31167 ], [ -81.056836, 25.338135 ], [ -81.11333, 25.367236 ], [ -81.227148, 25.583398 ], [ -81.345068, 25.731836 ], [ -81.364941, 25.831055 ], [ -81.568262, 25.891553 ], [ -81.715479, 25.983154 ], [ -81.811475, 26.146094 ], [ -81.866553, 26.43501 ], [ -81.931494, 26.46748 ], [ -81.958936, 26.489941 ], [ -81.895508, 26.597168 ], [ -81.828662, 26.687061 ], [ -81.881543, 26.664697 ], [ -81.920557, 26.631445 ], [ -81.970166, 26.552051 ], [ -82.006396, 26.539844 ], [ -82.0396, 26.552051 ], [ -82.077881, 26.704346 ], [ -82.066943, 26.891553 ], [ -82.013281, 26.961572 ], [ -82.095703, 26.963428 ], [ -82.181104, 26.936768 ], [ -82.168604, 26.874365 ], [ -82.180664, 26.840088 ], [ -82.242871, 26.848877 ], [ -82.290039, 26.870801 ], [ -82.354053, 26.935742 ], [ -82.441357, 27.059668 ], [ -82.620459, 27.401074 ], [ -82.655371, 27.449219 ], [ -82.7146, 27.499609 ], [ -82.686719, 27.515283 ], [ -82.63584, 27.524561 ], [ -82.52085, 27.678271 ], [ -82.430518, 27.771143 ], [ -82.400537, 27.8354 ], [ -82.405762, 27.862891 ], [ -82.445703, 27.902832 ], [ -82.498145, 27.86792 ], [ -82.520605, 27.877881 ], [ -82.57959, 27.958447 ], [ -82.635937, 27.981201 ], [ -82.675195, 27.96377 ], [ -82.633789, 27.897754 ], [ -82.596582, 27.873242 ], [ -82.610986, 27.777246 ], [ -82.626025, 27.745996 ], [ -82.660889, 27.718408 ], [ -82.715332, 27.733105 ], [ -82.742871, 27.709375 ], [ -82.775293, 27.734375 ], [ -82.807568, 27.776563 ], [ -82.843506, 27.845996 ], [ -82.748535, 28.236816 ], [ -82.660645, 28.48584 ], [ -82.650586, 28.769922 ], [ -82.644043, 28.812012 ], [ -82.651465, 28.8875 ], [ -82.769336, 29.051562 ], [ -83.290479, 29.451904 ], [ -83.694385, 29.925977 ], [ -84.044238, 30.103809 ], [ -84.309668, 30.064746 ], [ -84.355615, 30.029004 ], [ -84.375342, 29.982275 ], [ -84.358691, 29.929395 ], [ -84.382813, 29.907373 ], [ -84.454053, 29.910156 ], [ -84.55, 29.897852 ], [ -84.800537, 29.773047 ], [ -84.888916, 29.777637 ], [ -84.969189, 29.745313 ], [ -85.029297, 29.721094 ], [ -85.186035, 29.70791 ], [ -85.318945, 29.680225 ], [ -85.376367, 29.695215 ], [ -85.413818, 29.767578 ], [ -85.413818, 29.84248 ], [ -85.383447, 29.785059 ], [ -85.336426, 29.740137 ], [ -85.314893, 29.758105 ], [ -85.306836, 29.797852 ], [ -85.353613, 29.875732 ], [ -85.504297, 29.975781 ], [ -85.675781, 30.121924 ], [ -85.623486, 30.11709 ], [ -85.610254, 30.148389 ], [ -85.663428, 30.189453 ], [ -85.640967, 30.236914 ], [ -85.603516, 30.286768 ], [ -85.675879, 30.279297 ], [ -85.74082, 30.244385 ], [ -85.742969, 30.20127 ], [ -85.755811, 30.166992 ], [ -85.790771, 30.171973 ], [ -85.855664, 30.214404 ], [ -86.175146, 30.33252 ], [ -86.454443, 30.399121 ], [ -86.240088, 30.429102 ], [ -86.123828, 30.405811 ], [ -86.137695, 30.441553 ], [ -86.165674, 30.464258 ], [ -86.257373, 30.493018 ], [ -86.37417, 30.48208 ], [ -86.447949, 30.495605 ], [ -86.523389, 30.46709 ], [ -86.606055, 30.424707 ], [ -86.679639, 30.402881 ], [ -86.967627, 30.372363 ], [ -87.201172, 30.339258 ], [ -87.163721, 30.374219 ], [ -87.123779, 30.39668 ], [ -86.985791, 30.430859 ], [ -86.965137, 30.501904 ], [ -86.997559, 30.570313 ], [ -87.033887, 30.553906 ], [ -87.072021, 30.500439 ], [ -87.118799, 30.538965 ], [ -87.170605, 30.53877 ], [ -87.184668, 30.453711 ], [ -87.251074, 30.39668 ], [ -87.281055, 30.339258 ], [ -87.475781, 30.294287 ], [ -87.500732, 30.309277 ], [ -87.44375, 30.363818 ], [ -87.448291, 30.394141 ], [ -87.513281, 30.368115 ], [ -87.622266, 30.264746 ], [ -88.005957, 30.230908 ], [ -87.98501, 30.254395 ], [ -87.904004, 30.259082 ], [ -87.790283, 30.291797 ], [ -87.813281, 30.346875 ], [ -87.857129, 30.407422 ], [ -87.897607, 30.41416 ], [ -87.924316, 30.449658 ], [ -87.922998, 30.561523 ], [ -87.948877, 30.626904 ], [ -88.011328, 30.694189 ], [ -88.032422, 30.68125 ], [ -88.078369, 30.566211 ], [ -88.116553, 30.415332 ], [ -88.135449, 30.366602 ], [ -88.249219, 30.363184 ], [ -88.349902, 30.373486 ], [ -88.69209, 30.355371 ], [ -88.819922, 30.406494 ], [ -88.872949, 30.416309 ], [ -88.905225, 30.415137 ], [ -89.054053, 30.368262 ], [ -89.223633, 30.332373 ], [ -89.263574, 30.343652 ], [ -89.320557, 30.345312 ], [ -89.443506, 30.223145 ], [ -89.588477, 30.165967 ], [ -89.954248, 30.26875 ], [ -90.045215, 30.351416 ], [ -90.125977, 30.369092 ], [ -90.225293, 30.379297 ], [ -90.331982, 30.277588 ], [ -90.413037, 30.140332 ], [ -90.284961, 30.065088 ], [ -90.175342, 30.029102 ], [ -89.994189, 30.059277 ], [ -89.894043, 30.125879 ], [ -89.812256, 30.123682 ], [ -89.773145, 30.137207 ], [ -89.737451, 30.171973 ], [ -89.667529, 30.144531 ], [ -89.665039, 30.117041 ], [ -89.714697, 30.07832 ], [ -89.777246, 30.045703 ], [ -89.815186, 30.007275 ], [ -89.743799, 29.929834 ], [ -89.631689, 29.903809 ], [ -89.589502, 29.915039 ], [ -89.563379, 30.0021 ], [ -89.494434, 30.058154 ], [ -89.400732, 30.046045 ], [ -89.414063, 30.010889 ], [ -89.400928, 29.977686 ], [ -89.357861, 29.920996 ], [ -89.362793, 29.839795 ], [ -89.354443, 29.820215 ], [ -89.45542, 29.784375 ], [ -89.530664, 29.772217 ], [ -89.590869, 29.725293 ], [ -89.559326, 29.698047 ], [ -89.620654, 29.674121 ], [ -89.662109, 29.683691 ], [ -89.682959, 29.674854 ], [ -89.689209, 29.646045 ], [ -89.720898, 29.619287 ], [ -89.674805, 29.538672 ], [ -89.580322, 29.486035 ], [ -89.513672, 29.420068 ], [ -89.245703, 29.333203 ], [ -89.180762, 29.335693 ], [ -89.116846, 29.248242 ], [ -89.065332, 29.218164 ], [ -89.015723, 29.202881 ], [ -89.021387, 29.142725 ], [ -89.109521, 29.098682 ], [ -89.13335, 29.046143 ], [ -89.155518, 29.016602 ], [ -89.195264, 29.054004 ], [ -89.236084, 29.081104 ], [ -89.330566, 28.998682 ], [ -89.376123, 28.981348 ], [ -89.353516, 29.070215 ], [ -89.389209, 29.105029 ], [ -89.443164, 29.194141 ], [ -89.521777, 29.249268 ], [ -89.577148, 29.267529 ], [ -89.620264, 29.302393 ], [ -89.672461, 29.316504 ], [ -89.716992, 29.312891 ], [ -89.792383, 29.333203 ], [ -89.797363, 29.380615 ], [ -89.818262, 29.416113 ], [ -89.877246, 29.458008 ], [ -90.159082, 29.537158 ], [ -90.160791, 29.504395 ], [ -90.14126, 29.479736 ], [ -90.100781, 29.46333 ], [ -90.052344, 29.431396 ], [ -90.052783, 29.336816 ], [ -90.07373, 29.296777 ], [ -90.082715, 29.239746 ], [ -90.101367, 29.181787 ], [ -90.13584, 29.136084 ], [ -90.212793, 29.104932 ], [ -90.246729, 29.131006 ], [ -90.301611, 29.255811 ], [ -90.379199, 29.295117 ], [ -90.50249, 29.299756 ], [ -90.58623, 29.271533 ], [ -90.67749, 29.150635 ], [ -90.751025, 29.130859 ], [ -91.002734, 29.193506 ], [ -91.290137, 29.288965 ], [ -91.282715, 29.320752 ], [ -91.2375, 29.330957 ], [ -91.150781, 29.31792 ], [ -91.155371, 29.350684 ], [ -91.243994, 29.457324 ], [ -91.260254, 29.505469 ], [ -91.248828, 29.564209 ], [ -91.277734, 29.562891 ], [ -91.330957, 29.513574 ], [ -91.514209, 29.555371 ], [ -91.564795, 29.605322 ], [ -91.672461, 29.746094 ], [ -91.824414, 29.750684 ], [ -91.893164, 29.836035 ], [ -92.017334, 29.800293 ], [ -92.080225, 29.760742 ], [ -92.135498, 29.699463 ], [ -92.113965, 29.667676 ], [ -92.058887, 29.617188 ], [ -92.084033, 29.592822 ], [ -92.26084, 29.556836 ], [ -92.671289, 29.59707 ], [ -92.791309, 29.634668 ], [ -92.952393, 29.71416 ], [ -93.175684, 29.778955 ], [ -93.283203, 29.789404 ], [ -93.388477, 29.776563 ], [ -93.694824, 29.769922 ], [ -93.765918, 29.752686 ], [ -93.826465, 29.725146 ], [ -93.865723, 29.755615 ], [ -93.883887, 29.81001 ], [ -93.84834, 29.818848 ], [ -93.808789, 29.85083 ], [ -93.773096, 29.914063 ], [ -93.769043, 29.952295 ], [ -93.793994, 29.977246 ], [ -93.841455, 29.979736 ], [ -93.946289, 29.81499 ], [ -93.886377, 29.722656 ], [ -93.890479, 29.689355 ], [ -94.099658, 29.67041 ], [ -94.574463, 29.484521 ], [ -94.759619, 29.384277 ], [ -94.750146, 29.418018 ], [ -94.52627, 29.547949 ], [ -94.605322, 29.567822 ], [ -94.732617, 29.535352 ], [ -94.778271, 29.547852 ], [ -94.724365, 29.655273 ], [ -94.741943, 29.75 ], [ -94.832324, 29.752588 ], [ -94.889893, 29.676953 ], [ -94.929883, 29.680176 ], [ -94.982275, 29.712598 ], [ -95.022852, 29.702344 ], [ -94.992822, 29.530957 ], [ -94.935889, 29.460449 ], [ -94.888281, 29.370557 ], [ -95.018311, 29.259473 ], [ -95.139062, 29.167822 ], [ -95.152148, 29.079248 ], [ -95.273486, 28.963867 ], [ -95.387646, 28.898438 ], [ -95.655859, 28.744629 ], [ -95.732373, 28.711719 ], [ -95.853418, 28.640332 ], [ -96.02041, 28.586816 ], [ -96.180518, 28.501855 ], [ -96.234521, 28.488965 ], [ -96.132275, 28.560889 ], [ -96.011035, 28.631934 ], [ -96.115039, 28.622217 ], [ -96.275342, 28.655127 ], [ -96.373437, 28.657031 ], [ -96.374121, 28.631104 ], [ -96.44873, 28.594482 ], [ -96.526025, 28.648291 ], [ -96.559717, 28.684473 ], [ -96.575684, 28.715723 ], [ -96.608496, 28.723291 ], [ -96.640039, 28.708789 ], [ -96.524658, 28.488721 ], [ -96.475488, 28.479199 ], [ -96.421094, 28.457324 ], [ -96.488818, 28.406055 ], [ -96.561719, 28.367139 ], [ -96.676367, 28.341309 ], [ -96.773535, 28.421631 ], [ -96.79458, 28.32085 ], [ -96.806885, 28.220215 ], [ -96.839502, 28.194385 ], [ -96.891602, 28.157568 ], [ -96.919873, 28.185352 ], [ -96.933301, 28.224268 ], [ -96.96665, 28.189551 ], [ -97.015479, 28.163477 ], [ -97.096045, 28.158252 ], [ -97.156494, 28.144336 ], [ -97.155078, 28.102637 ], [ -97.14126, 28.060742 ], [ -97.034326, 28.093848 ], [ -97.073096, 27.986084 ], [ -97.171436, 27.87959 ], [ -97.251563, 27.854443 ], [ -97.374121, 27.87002 ], [ -97.404395, 27.859326 ], [ -97.431494, 27.837207 ], [ -97.288721, 27.670605 ], [ -97.380469, 27.419336 ], [ -97.439111, 27.328271 ], [ -97.479785, 27.316602 ], [ -97.523877, 27.313965 ], [ -97.682129, 27.394922 ], [ -97.768457, 27.45752 ], [ -97.692383, 27.287158 ], [ -97.485107, 27.237402 ], [ -97.474512, 27.172949 ], [ -97.475684, 27.117871 ], [ -97.516504, 27.053223 ], [ -97.554688, 26.967334 ], [ -97.526514, 26.90752 ], [ -97.493799, 26.759619 ], [ -97.46582, 26.691748 ], [ -97.435059, 26.48584 ], [ -97.402344, 26.396533 ], [ -97.213916, 26.067871 ], [ -97.150391, 26.065332 ], [ -97.140186, 26.029736 ], [ -97.14624, 25.961475 ], [ -97.281787, 25.941602 ], [ -97.338672, 25.911182 ], [ -97.349756, 25.884766 ], [ -97.358154, 25.870508 ], [ -97.375635, 25.871826 ], [ -97.440283, 25.89082 ], [ -97.587256, 25.98418 ], [ -97.801416, 26.042041 ], [ -98.082812, 26.064453 ], [ -98.275049, 26.111182 ], [ -98.378125, 26.182373 ], [ -98.485889, 26.224561 ], [ -98.598291, 26.237842 ], [ -98.691406, 26.276465 ], [ -98.765234, 26.34043 ], [ -98.873193, 26.38125 ], [ -99.015283, 26.398975 ], [ -99.107764, 26.446924 ], [ -99.17207, 26.56416 ], [ -99.172363, 26.565918 ], [ -99.229932, 26.761914 ], [ -99.302441, 26.884717 ], [ -99.443555, 27.03667 ], [ -99.456494, 27.056641 ], [ -99.456543, 27.056689 ], [ -99.457715, 27.081689 ], [ -99.440234, 27.170117 ], [ -99.455127, 27.233691 ], [ -99.499805, 27.285498 ], [ -99.510059, 27.340332 ], [ -99.48584, 27.398047 ], [ -99.484277, 27.467383 ], [ -99.505322, 27.54834 ], [ -99.595313, 27.635889 ], [ -99.754248, 27.729932 ], [ -99.889648, 27.867285 ], [ -100.001416, 28.047852 ], [ -100.111963, 28.172949 ], [ -100.221289, 28.242627 ], [ -100.296045, 28.327686 ], [ -100.336279, 28.428125 ], [ -100.348145, 28.486426 ], [ -100.331738, 28.502539 ], [ -100.398926, 28.614209 ], [ -100.549707, 28.821338 ], [ -100.636328, 28.972803 ], [ -100.658643, 29.068555 ], [ -100.75459, 29.18252 ], [ -100.924121, 29.314697 ], [ -101.016309, 29.400684 ], [ -101.038623, 29.460303 ], [ -101.038965, 29.4604 ], [ -101.303516, 29.634082 ], [ -101.380371, 29.742578 ], [ -101.440381, 29.776855 ], [ -101.509277, 29.773145 ], [ -101.544629, 29.783545 ], [ -101.546387, 29.808057 ], [ -101.568701, 29.809229 ], [ -101.611621, 29.786963 ], [ -101.752344, 29.782471 ], [ -101.990918, 29.795703 ], [ -102.163086, 29.825244 ], [ -102.268945, 29.871191 ], [ -102.343066, 29.86499 ], [ -102.385645, 29.806641 ], [ -102.47627, 29.769092 ], [ -102.614941, 29.752344 ], [ -102.73418, 29.643945 ], [ -102.833984, 29.443945 ], [ -102.877832, 29.315332 ], [ -102.865674, 29.258008 ], [ -102.891992, 29.216406 ], [ -102.956836, 29.190381 ], [ -103.022852, 29.132227 ], [ -103.08999, 29.041895 ], [ -103.168311, 28.998193 ], [ -103.257715, 29.001123 ], [ -103.422949, 29.070703 ], [ -103.663965, 29.206885 ], [ -103.85293, 29.291064 ], [ -103.989746, 29.323145 ], [ -104.110596, 29.386133 ], [ -104.215527, 29.479883 ], [ -104.312207, 29.542432 ], [ -104.400635, 29.57373 ], [ -104.504004, 29.677686 ], [ -104.622217, 29.854297 ], [ -104.681348, 29.990527 ], [ -104.681348, 30.134375 ], [ -104.835889, 30.447656 ], [ -104.917871, 30.58335 ], [ -104.978809, 30.645947 ], [ -105.098145, 30.720557 ], [ -105.27583, 30.807275 ], [ -105.514014, 30.980762 ], [ -105.812695, 31.241016 ], [ -106.024072, 31.397754 ], [ -106.148047, 31.450928 ], [ -106.255713, 31.544678 ], [ -106.346973, 31.679004 ], [ -106.436035, 31.764453 ], [ -106.44541, 31.768408 ], [ -106.453223, 31.770166 ], [ -106.673047, 31.771338 ], [ -106.892871, 31.772461 ], [ -107.112695, 31.773633 ], [ -107.33252, 31.774756 ], [ -107.552344, 31.775879 ], [ -107.772217, 31.777051 ], [ -107.992041, 31.778174 ], [ -108.211816, 31.779346 ], [ -108.2125, 31.666846 ], [ -108.213184, 31.554395 ], [ -108.213818, 31.441895 ], [ -108.214453, 31.329443 ], [ -108.567871, 31.328809 ], [ -108.921338, 31.328125 ], [ -109.274756, 31.327441 ], [ -109.628223, 31.326807 ], [ -109.981641, 31.326172 ], [ -110.335107, 31.325537 ], [ -110.688525, 31.324854 ], [ -111.041992, 31.324219 ], [ -111.516211, 31.472266 ], [ -111.990479, 31.620215 ], [ -112.464746, 31.768262 ], [ -112.938965, 31.91626 ], [ -113.413184, 32.064307 ], [ -113.887451, 32.212305 ], [ -114.361719, 32.360303 ], [ -114.835938, 32.508301 ], [ -114.787988, 32.564795 ], [ -114.724756, 32.715332 ], [ -114.839062, 32.704736 ], [ -115.125195, 32.683301 ], [ -115.411377, 32.661865 ], [ -115.69751, 32.640479 ], [ -115.983691, 32.619043 ], [ -116.269824, 32.597607 ], [ -116.555957, 32.576221 ], [ -116.84209, 32.554785 ], [ -117.128271, 32.53335 ], [ -117.130469, 32.539746 ], [ -117.137402, 32.64917 ], [ -117.18374, 32.687891 ], [ -117.243457, 32.664014 ], [ -117.270703, 32.80625 ], [ -117.255762, 32.873389 ], [ -117.262988, 32.938867 ], [ -117.318848, 33.100049 ], [ -117.467432, 33.295508 ], [ -117.788525, 33.538477 ], [ -117.9521, 33.619629 ], [ -118.080518, 33.722168 ], [ -118.161914, 33.750684 ], [ -118.264404, 33.758594 ], [ -118.294189, 33.712305 ], [ -118.410449, 33.743945 ], [ -118.392969, 33.858301 ], [ -118.506201, 34.017383 ], [ -118.598828, 34.03501 ], [ -118.832031, 34.024463 ], [ -119.14375, 34.112012 ], [ -119.23584, 34.164111 ], [ -119.267676, 34.257422 ], [ -119.413672, 34.338574 ], [ -119.606055, 34.418018 ], [ -119.713184, 34.399658 ], [ -119.85332, 34.411963 ], [ -120.052979, 34.469287 ], [ -120.169531, 34.476465 ], [ -120.396484, 34.45957 ], [ -120.481201, 34.471631 ], [ -120.559814, 34.543896 ], [ -120.644678, 34.57998 ], [ -120.626709, 34.668945 ], [ -120.637598, 34.749365 ], [ -120.624902, 34.811963 ], [ -120.663037, 34.949268 ], [ -120.633594, 35.076465 ], [ -120.659082, 35.122412 ], [ -120.707031, 35.157666 ], [ -120.857373, 35.209668 ], [ -120.884863, 35.274951 ], [ -120.860303, 35.36543 ], [ -120.899609, 35.425098 ], [ -121.022852, 35.480762 ], [ -121.137939, 35.607129 ], [ -121.283838, 35.676318 ], [ -121.343848, 35.792236 ], [ -121.43374, 35.863867 ], [ -121.46499, 35.927393 ], [ -121.664355, 36.154053 ], [ -121.877393, 36.331055 ], [ -121.910156, 36.43291 ], [ -121.918652, 36.572363 ], [ -121.835156, 36.657471 ], [ -121.78999, 36.732275 ], [ -121.794531, 36.800977 ], [ -121.807422, 36.851221 ], [ -121.880664, 36.938916 ], [ -122.164209, 36.990967 ], [ -122.394922, 37.20752 ], [ -122.408447, 37.373145 ], [ -122.499219, 37.542627 ], [ -122.500439, 37.652783 ], [ -122.514209, 37.771973 ], [ -122.445605, 37.797998 ], [ -122.384082, 37.788525 ], [ -122.390283, 37.741064 ], [ -122.369727, 37.655859 ], [ -122.297607, 37.591846 ], [ -122.228662, 37.563916 ], [ -122.166016, 37.50166 ], [ -122.119043, 37.482813 ], [ -122.070508, 37.478271 ], [ -122.096533, 37.518213 ], [ -122.124121, 37.543799 ], [ -122.158057, 37.626465 ], [ -122.222217, 37.732031 ], [ -122.295996, 37.790332 ], [ -122.333447, 37.896582 ], [ -122.365479, 37.921191 ], [ -122.385449, 37.960596 ], [ -122.314258, 38.007324 ], [ -122.217041, 38.040625 ], [ -122.086719, 38.049609 ], [ -121.716846, 38.034082 ], [ -121.638086, 38.061279 ], [ -121.572998, 38.052393 ], [ -121.525342, 38.055908 ], [ -121.625732, 38.083936 ], [ -121.682227, 38.074805 ], [ -121.748633, 38.080469 ], [ -121.880762, 38.075 ], [ -121.93418, 38.086816 ], [ -121.993115, 38.120117 ], [ -122.031494, 38.123535 ], [ -122.15376, 38.065527 ], [ -122.208301, 38.072559 ], [ -122.337109, 38.135889 ], [ -122.393359, 38.144824 ], [ -122.483887, 38.108838 ], [ -122.494922, 37.953564 ], [ -122.466895, 37.838184 ], [ -122.521338, 37.826416 ], [ -122.58418, 37.874072 ], [ -122.680713, 37.902344 ], [ -122.7604, 37.945654 ], [ -122.872949, 38.026074 ], [ -122.931982, 38.055469 ], [ -122.998779, 37.988623 ], [ -123.001465, 38.019287 ], [ -122.968164, 38.097021 ], [ -122.977588, 38.227344 ], [ -122.876807, 38.12334 ], [ -122.908154, 38.196582 ], [ -122.986523, 38.2771 ], [ -123.046191, 38.305078 ], [ -123.121143, 38.449268 ], [ -123.289746, 38.53584 ], [ -123.424805, 38.675635 ], [ -123.701123, 38.907275 ], [ -123.719531, 39.110986 ], [ -123.820313, 39.368408 ], [ -123.777783, 39.514941 ], [ -123.783496, 39.618701 ], [ -123.83291, 39.775488 ], [ -123.884473, 39.860791 ], [ -124.108496, 40.094531 ], [ -124.324023, 40.251953 ], [ -124.356543, 40.371094 ], [ -124.37168, 40.491211 ], [ -124.324512, 40.598096 ], [ -124.283691, 40.710547 ], [ -124.253906, 40.740283 ], [ -124.242334, 40.727881 ], [ -124.250586, 40.703906 ], [ -124.22002, 40.696484 ], [ -124.208447, 40.746094 ], [ -124.190234, 40.771729 ], [ -124.22251, 40.775049 ], [ -124.219189, 40.790723 ], [ -124.199902, 40.82207 ], [ -124.133105, 40.969775 ], [ -124.140039, 41.155908 ], [ -124.068506, 41.38418 ], [ -124.071924, 41.459521 ], [ -124.117676, 41.621729 ], [ -124.163232, 41.718994 ], [ -124.244629, 41.787939 ], [ -124.20874, 41.888574 ], [ -124.21167, 41.984619 ], [ -124.355273, 42.1229 ], [ -124.41001, 42.304346 ], [ -124.420508, 42.381006 ], [ -124.406152, 42.583691 ], [ -124.443799, 42.670215 ], [ -124.539648, 42.812891 ], [ -124.498584, 42.936865 ], [ -124.454443, 43.012354 ], [ -124.346582, 43.34165 ], [ -124.320605, 43.368213 ], [ -124.275488, 43.367383 ], [ -124.196924, 43.42334 ], [ -124.233154, 43.436377 ], [ -124.287988, 43.409717 ], [ -124.239209, 43.540039 ], [ -124.184375, 43.651562 ], [ -124.14873, 43.691748 ], [ -124.130664, 44.055664 ], [ -124.09917, 44.333789 ], [ -124.047461, 44.425488 ], [ -124.06543, 44.520068 ], [ -124.044531, 44.648242 ], [ -124.05918, 44.777734 ], [ -123.948584, 45.40083 ], [ -123.963086, 45.476074 ], [ -123.929346, 45.576953 ], [ -123.96123, 45.842969 ], [ -123.947119, 46.140576 ], [ -123.975244, 46.17832 ], [ -123.989307, 46.219385 ], [ -123.962939, 46.225439 ], [ -123.91167, 46.182178 ], [ -123.673633, 46.182617 ], [ -123.521631, 46.222656 ], [ -123.466357, 46.209424 ], [ -123.402295, 46.15498 ], [ -123.321582, 46.143994 ], [ -123.220605, 46.153613 ], [ -123.251318, 46.167285 ], [ -123.298682, 46.17085 ], [ -123.404736, 46.220996 ], [ -123.464844, 46.271094 ], [ -123.650342, 46.267725 ], [ -123.688379, 46.299854 ], [ -123.895703, 46.267773 ], [ -123.959766, 46.300732 ], [ -124.072754, 46.279443 ], [ -124.045117, 46.3729 ], [ -124.050195, 46.490527 ], [ -124.044336, 46.605078 ], [ -124.016406, 46.521387 ], [ -123.946143, 46.432568 ], [ -123.912402, 46.53335 ], [ -123.88916, 46.66001 ], [ -123.957715, 46.708691 ], [ -124.07168, 46.744775 ], [ -124.112549, 46.862695 ], [ -123.842871, 46.963184 ], [ -123.986035, 46.984473 ], [ -124.042236, 47.029688 ], [ -124.111719, 47.035205 ], [ -124.116797, 47.000342 ], [ -124.139258, 46.954687 ], [ -124.163574, 47.015332 ], [ -124.170508, 47.08667 ], [ -124.198828, 47.208545 ], [ -124.309277, 47.40459 ], [ -124.376025, 47.658643 ], [ -124.460059, 47.784229 ], [ -124.621094, 47.90415 ], [ -124.663086, 47.974121 ], [ -124.70166, 48.15166 ], [ -124.67998, 48.285889 ], [ -124.709961, 48.380371 ], [ -124.632617, 48.375049 ], [ -124.429053, 48.300781 ], [ -124.175488, 48.242432 ], [ -124.098779, 48.2 ], [ -123.975781, 48.168457 ], [ -123.294434, 48.119531 ], [ -123.249902, 48.124219 ], [ -123.161865, 48.154541 ], [ -123.124414, 48.150928 ], [ -123.024219, 48.081592 ], [ -122.973877, 48.073291 ], [ -122.908887, 48.076904 ], [ -122.860889, 48.090039 ], [ -122.778613, 48.137598 ], [ -122.767529, 48.12002 ], [ -122.769092, 48.075977 ], [ -122.739746, 48.013232 ], [ -122.679492, 47.931787 ], [ -122.656641, 47.881152 ], [ -122.778418, 47.738428 ], [ -122.801758, 47.735352 ], [ -122.805371, 47.783643 ], [ -122.821387, 47.793164 ], [ -123.050635, 47.551953 ], [ -123.131055, 47.437744 ], [ -123.139062, 47.386084 ], [ -123.136328, 47.355811 ], [ -123.104199, 47.348389 ], [ -123.030908, 47.360205 ], [ -122.922168, 47.407666 ], [ -122.916895, 47.417969 ], [ -123.018213, 47.401074 ], [ -123.066797, 47.399658 ], [ -123.060156, 47.453662 ], [ -123.048633, 47.479346 ], [ -122.982471, 47.559375 ], [ -122.912891, 47.607373 ], [ -122.814063, 47.658545 ], [ -122.757129, 47.700537 ], [ -122.717871, 47.762109 ], [ -122.608154, 47.835498 ], [ -122.587891, 47.855957 ], [ -122.592676, 47.916406 ], [ -122.585742, 47.927881 ], [ -122.532813, 47.919727 ], [ -122.510791, 47.815723 ], [ -122.523926, 47.769336 ], [ -122.618408, 47.712793 ], [ -122.630176, 47.692822 ], [ -122.613623, 47.615625 ], [ -122.628271, 47.608154 ], [ -122.664307, 47.617236 ], [ -122.675488, 47.612354 ], [ -122.58584, 47.528418 ], [ -122.557422, 47.463184 ], [ -122.553564, 47.404932 ], [ -122.577881, 47.293164 ], [ -122.603906, 47.274609 ], [ -122.648633, 47.281445 ], [ -122.707715, 47.316406 ], [ -122.720898, 47.305127 ], [ -122.767773, 47.218359 ], [ -122.783301, 47.225977 ], [ -122.812549, 47.328955 ], [ -122.828467, 47.336572 ], [ -122.919531, 47.289648 ], [ -122.956201, 47.24458 ], [ -122.987646, 47.172559 ], [ -123.027588, 47.138916 ], [ -122.91416, 47.131494 ], [ -122.811963, 47.145996 ], [ -122.729883, 47.111816 ], [ -122.701953, 47.110889 ], [ -122.627051, 47.144238 ], [ -122.60415, 47.166992 ], [ -122.542187, 47.275586 ], [ -122.511084, 47.29502 ], [ -122.464844, 47.295801 ], [ -122.420117, 47.312109 ], [ -122.353809, 47.371582 ], [ -122.351123, 47.395215 ], [ -122.375244, 47.528369 ], [ -122.368359, 47.603906 ], [ -122.380762, 47.627832 ], [ -122.410498, 47.652637 ], [ -122.406787, 47.676758 ], [ -122.383643, 47.716455 ], [ -122.381982, 47.752344 ], [ -122.401807, 47.784277 ], [ -122.392871, 47.820557 ], [ -122.330322, 47.898633 ], [ -122.318457, 47.933057 ], [ -122.241992, 48.010742 ], [ -122.261279, 48.042041 ], [ -122.31748, 48.080176 ], [ -122.352979, 48.113818 ], [ -122.388672, 48.166357 ], [ -122.41582, 48.183936 ], [ -122.424707, 48.175928 ], [ -122.386621, 48.089941 ], [ -122.394775, 48.084131 ], [ -122.494043, 48.130469 ], [ -122.516992, 48.159668 ], [ -122.52915, 48.199316 ], [ -122.520312, 48.229102 ], [ -122.467041, 48.258496 ], [ -122.403369, 48.269189 ], [ -122.408545, 48.293896 ], [ -122.488428, 48.374316 ], [ -122.54165, 48.410938 ], [ -122.582568, 48.428662 ], [ -122.637793, 48.433301 ], [ -122.6625, 48.446387 ], [ -122.668994, 48.465234 ], [ -122.657275, 48.48999 ], [ -122.627979, 48.4979 ], [ -122.542676, 48.487988 ], [ -122.496777, 48.505566 ], [ -122.501074, 48.5375 ], [ -122.514795, 48.555176 ], [ -122.512744, 48.669434 ], [ -122.545117, 48.762305 ], [ -122.562012, 48.777979 ], [ -122.580176, 48.77959 ], [ -122.599414, 48.76709 ], [ -122.653027, 48.763867 ], [ -122.685937, 48.794287 ], [ -122.722461, 48.853027 ], [ -122.78877, 48.993018 ], [ -122.686377, 48.993018 ], [ -122.26001, 48.993018 ], [ -121.833594, 48.993018 ], [ -121.407227, 48.993018 ], [ -120.980859, 48.993018 ], [ -120.554492, 48.993018 ], [ -120.128076, 48.993018 ], [ -119.701709, 48.993018 ], [ -119.275342, 48.993066 ], [ -118.848926, 48.993066 ], [ -118.422559, 48.993066 ], [ -117.996191, 48.993066 ], [ -117.569775, 48.993066 ], [ -117.143408, 48.993066 ], [ -116.717041, 48.993066 ], [ -116.290625, 48.993066 ], [ -115.864258, 48.993066 ], [ -115.437891, 48.993066 ], [ -115.011523, 48.993066 ], [ -114.585107, 48.993066 ], [ -114.15874, 48.993066 ], [ -113.732373, 48.993066 ], [ -113.305957, 48.993066 ], [ -112.87959, 48.993066 ], [ -112.453223, 48.993066 ], [ -112.026807, 48.993066 ], [ -111.600439, 48.993066 ], [ -111.174072, 48.993066 ], [ -110.747656, 48.993066 ], [ -110.321289, 48.993066 ], [ -109.894922, 48.993066 ], [ -109.468555, 48.993066 ], [ -109.042139, 48.993115 ], [ -108.615771, 48.993115 ], [ -108.189404, 48.993115 ], [ -107.762988, 48.993115 ], [ -107.336621, 48.993115 ], [ -106.910254, 48.993115 ], [ -106.483838, 48.993115 ], [ -106.057471, 48.993115 ], [ -105.631104, 48.993115 ], [ -105.204688, 48.993115 ], [ -104.77832, 48.993115 ], [ -104.351953, 48.993115 ], [ -103.925586, 48.993115 ], [ -103.49917, 48.993115 ], [ -103.072803, 48.993115 ], [ -102.646436, 48.993115 ], [ -102.22002, 48.993115 ], [ -101.793652, 48.993115 ], [ -101.367285, 48.993115 ], [ -100.940869, 48.993115 ], [ -100.514502, 48.993115 ], [ -100.088135, 48.993115 ], [ -99.661719, 48.993115 ], [ -99.235352, 48.993115 ], [ -98.808984, 48.993164 ], [ -98.382617, 48.993164 ], [ -97.956201, 48.993164 ], [ -97.529834, 48.993164 ], [ -97.103467, 48.993164 ], [ -96.677051, 48.993164 ], [ -96.250684, 48.993164 ], [ -95.824316, 48.993164 ], [ -95.3979, 48.993164 ], [ -95.162061, 48.991748 ], [ -95.158252, 49.203076 ], [ -95.155273, 49.369678 ], [ -94.939355, 49.349414 ], [ -94.874805, 49.319043 ], [ -94.854346, 49.30459 ], [ -94.8604, 49.258594 ], [ -94.842578, 49.119189 ], [ -94.803467, 49.00293 ], [ -94.712793, 48.863428 ], [ -94.712549, 48.862988 ], [ -94.705078, 48.808496 ], [ -94.675342, 48.774414 ], [ -94.620898, 48.742627 ], [ -94.41416, 48.704102 ], [ -94.055176, 48.659033 ], [ -93.851611, 48.607275 ], [ -93.803564, 48.548926 ], [ -93.707715, 48.525439 ], [ -93.564258, 48.536914 ], [ -93.463623, 48.561279 ], [ -93.377881, 48.616553 ], [ -93.257959, 48.628857 ], [ -93.155225, 48.625342 ], [ -93.051709, 48.619873 ], [ -92.99624, 48.611816 ], [ -92.836719, 48.567773 ], [ -92.732666, 48.531836 ], [ -92.583252, 48.465088 ], [ -92.500586, 48.435352 ], [ -92.460889, 48.365869 ], [ -92.4146, 48.276611 ], [ -92.348437, 48.276611 ], [ -92.298682, 48.328906 ], [ -92.171777, 48.338379 ], [ -92.005176, 48.301855 ], [ -91.858398, 48.197559 ], [ -91.647314, 48.10459 ], [ -91.518311, 48.058301 ], [ -91.387207, 48.058545 ], [ -91.220654, 48.10459 ], [ -91.043457, 48.193701 ], [ -90.916064, 48.209131 ], [ -90.840332, 48.200537 ], [ -90.797314, 48.131055 ], [ -90.744385, 48.10459 ], [ -90.60708, 48.112598 ], [ -90.320117, 48.09917 ], [ -90.091797, 48.118115 ], [ -90.039941, 48.078174 ], [ -89.993652, 48.015332 ], [ -89.901025, 47.995459 ], [ -89.775391, 48.015332 ], [ -89.550586, 47.999902 ], [ -89.455664, 47.99624 ], [ -89.273193, 48.019971 ], [ -89.185645, 48.047412 ], [ -89.062598, 48.093799 ], [ -88.898682, 48.155713 ], [ -88.611768, 48.264014 ], [ -88.378174, 48.303076 ], [ -88.160645, 48.225391 ], [ -87.987451, 48.156885 ], [ -87.920508, 48.130371 ], [ -87.743896, 48.060547 ], [ -87.494238, 47.961768 ], [ -87.208008, 47.848486 ], [ -86.921826, 47.735205 ], [ -86.672168, 47.636426 ], [ -86.495557, 47.566602 ], [ -86.428564, 47.540088 ], [ -86.234473, 47.460059 ], [ -86.040381, 47.380029 ], [ -85.846338, 47.3 ], [ -85.652246, 47.219971 ], [ -85.458203, 47.139941 ], [ -85.264111, 47.059961 ], [ -85.070068, 46.979932 ], [ -84.875977, 46.899902 ], [ -84.827051, 46.766846 ], [ -84.779395, 46.637305 ], [ -84.665771, 46.543262 ], [ -84.561768, 46.457373 ], [ -84.501563, 46.461865 ], [ -84.440479, 46.498145 ], [ -84.401709, 46.515625 ], [ -84.336719, 46.518506 ], [ -84.192187, 46.549561 ], [ -84.149463, 46.542773 ], [ -84.125195, 46.527246 ], [ -84.123193, 46.50293 ], [ -84.128125, 46.483594 ], [ -84.150488, 46.444775 ], [ -84.115186, 46.370801 ], [ -84.107764, 46.288623 ], [ -84.088379, 46.226514 ], [ -84.029199, 46.147021 ], [ -83.977783, 46.084912 ], [ -83.913037, 46.0729 ], [ -83.763184, 46.109082 ], [ -83.669287, 46.122754 ], [ -83.615967, 46.116846 ], [ -83.524756, 46.058691 ], [ -83.480127, 46.02373 ], [ -83.469482, 45.994678 ], [ -83.592676, 45.817139 ], [ -83.397314, 45.729053 ], [ -83.179297, 45.632764 ], [ -82.919336, 45.517969 ], [ -82.7604, 45.447705 ], [ -82.551074, 45.347363 ], [ -82.515234, 45.204395 ], [ -82.485059, 45.08374 ], [ -82.446582, 44.915527 ], [ -82.407373, 44.743945 ], [ -82.368262, 44.572998 ], [ -82.326807, 44.391553 ], [ -82.28125, 44.192236 ], [ -82.240771, 44.015332 ], [ -82.196582, 43.822217 ], [ -82.137842, 43.570898 ], [ -82.190381, 43.474072 ], [ -82.304785, 43.263232 ], [ -82.408203, 43.072656 ], [ -82.417236, 43.017383 ], [ -82.48833, 42.739502 ], [ -82.545312, 42.624707 ], [ -82.645117, 42.558057 ], [ -82.744189, 42.493457 ], [ -82.867773, 42.385205 ], [ -83.003711, 42.331738 ], [ -83.073145, 42.300293 ], [ -83.109521, 42.250684 ], [ -83.149658, 42.141943 ], [ -83.141943, 41.975879 ], [ -83.02998, 41.832959 ], [ -82.866211, 41.753027 ], [ -82.690039, 41.675195 ], [ -82.439063, 41.674854 ], [ -82.21333, 41.778711 ], [ -81.97417, 41.888721 ], [ -81.760937, 41.986816 ], [ -81.507324, 42.103467 ], [ -81.277637, 42.20918 ], [ -81.028223, 42.247168 ], [ -80.682617, 42.299756 ], [ -80.247559, 42.366016 ], [ -80.035742, 42.441455 ], [ -79.762012, 42.538965 ], [ -79.44624, 42.651465 ], [ -79.17373, 42.748535 ], [ -79.036719, 42.802344 ], [ -78.939258, 42.863721 ], [ -78.915088, 42.909131 ], [ -78.92085, 42.935205 ], [ -78.945996, 42.961328 ], [ -78.980762, 42.980615 ], [ -79.01167, 42.997021 ], [ -79.026172, 43.017334 ], [ -79.029053, 43.061768 ], [ -79.047998, 43.087305 ], [ -79.066064, 43.106104 ], [ -79.059229, 43.278076 ], [ -79.083057, 43.331396 ], [ -79.171875, 43.466553 ], [ -79.00249, 43.527148 ], [ -78.845557, 43.58335 ], [ -78.72041, 43.624951 ], [ -78.458252, 43.631494 ], [ -78.214795, 43.630664 ], [ -77.879248, 43.629541 ], [ -77.596533, 43.628613 ], [ -77.266699, 43.62749 ], [ -77.07334, 43.626855 ], [ -76.819971, 43.628809 ], [ -76.696484, 43.784814 ], [ -76.586133, 43.924316 ], [ -76.4646, 44.057617 ], [ -76.248535, 44.214111 ], [ -76.185791, 44.242236 ], [ -76.151172, 44.303955 ], [ -76.020215, 44.362598 ], [ -75.875928, 44.416992 ], [ -75.819336, 44.468018 ], [ -75.791943, 44.49707 ], [ -75.40127, 44.772266 ], [ -75.179395, 44.899365 ], [ -74.996143, 44.970117 ], [ -74.856641, 45.003906 ], [ -74.762451, 44.999072 ], [ -74.708887, 45.003857 ] ] ], [ [ [ -72.509766, 40.986035 ], [ -72.580859, 40.921338 ], [ -72.516602, 40.914795 ], [ -72.461328, 40.933789 ], [ -72.408984, 40.972168 ], [ -72.287451, 41.024072 ], [ -72.183887, 41.046777 ], [ -72.15127, 41.051465 ], [ -72.101904, 41.015039 ], [ -72.003955, 41.044287 ], [ -71.903223, 41.060693 ], [ -72.338965, 40.894141 ], [ -72.428076, 40.875391 ], [ -72.555566, 40.825781 ], [ -72.676074, 40.790625 ], [ -72.762842, 40.777832 ], [ -73.194287, 40.654199 ], [ -73.228516, 40.651514 ], [ -73.265527, 40.663574 ], [ -73.620898, 40.599902 ], [ -73.766748, 40.592725 ], [ -73.899561, 40.570508 ], [ -73.801318, 40.621777 ], [ -73.79917, 40.640967 ], [ -73.822656, 40.655957 ], [ -73.875195, 40.651611 ], [ -73.929004, 40.598828 ], [ -74.014893, 40.581201 ], [ -74.032031, 40.638672 ], [ -74.003369, 40.683154 ], [ -73.964551, 40.725342 ], [ -73.879248, 40.79165 ], [ -73.757227, 40.833691 ], [ -73.695215, 40.87002 ], [ -73.652246, 40.838037 ], [ -73.642822, 40.88125 ], [ -73.609766, 40.906201 ], [ -73.573828, 40.919629 ], [ -73.487402, 40.919971 ], [ -73.440869, 40.926758 ], [ -73.407227, 40.941113 ], [ -73.372705, 40.943799 ], [ -73.278174, 40.924219 ], [ -73.18584, 40.929834 ], [ -73.111279, 40.956885 ], [ -73.033789, 40.965967 ], [ -72.828809, 40.97207 ], [ -72.625098, 40.991846 ], [ -72.543652, 41.027002 ], [ -72.372559, 41.125537 ], [ -72.274121, 41.153027 ], [ -72.427393, 41.038525 ], [ -72.509766, 40.986035 ] ] ], [ [ [ -68.187256, 44.332471 ], [ -68.245459, 44.312988 ], [ -68.309277, 44.321484 ], [ -68.307959, 44.268701 ], [ -68.315088, 44.249707 ], [ -68.385791, 44.276855 ], [ -68.411719, 44.294336 ], [ -68.409473, 44.364258 ], [ -68.347021, 44.430371 ], [ -68.299414, 44.456494 ], [ -68.238037, 44.438379 ], [ -68.190918, 44.364355 ], [ -68.187256, 44.332471 ] ] ], [ [ [ -74.188135, 40.522852 ], [ -74.235889, 40.518701 ], [ -74.188184, 40.6146 ], [ -74.100488, 40.658447 ], [ -74.06875, 40.649316 ], [ -74.067383, 40.61543 ], [ -74.079688, 40.586475 ], [ -74.138525, 40.541846 ], [ -74.188135, 40.522852 ] ] ], [ [ [ -70.509912, 41.376318 ], [ -70.785303, 41.327441 ], [ -70.829199, 41.358984 ], [ -70.760498, 41.373584 ], [ -70.67373, 41.448535 ], [ -70.616016, 41.457227 ], [ -70.525342, 41.414795 ], [ -70.509912, 41.376318 ] ] ], [ [ [ -71.241406, 41.491943 ], [ -71.290918, 41.4646 ], [ -71.34624, 41.469385 ], [ -71.318164, 41.506299 ], [ -71.307471, 41.560498 ], [ -71.280176, 41.62002 ], [ -71.264453, 41.638232 ], [ -71.232031, 41.654297 ], [ -71.241406, 41.491943 ] ] ], [ [ [ -69.97793, 41.265576 ], [ -70.055078, 41.249463 ], [ -70.233057, 41.286328 ], [ -70.086621, 41.317578 ], [ -70.062695, 41.328467 ], [ -70.043604, 41.374414 ], [ -70.041211, 41.397461 ], [ -69.985596, 41.298633 ], [ -69.97793, 41.265576 ] ] ], [ [ [ -75.635693, 35.855908 ], [ -75.650781, 35.835596 ], [ -75.717187, 35.946143 ], [ -75.648877, 35.9104 ], [ -75.63667, 35.880664 ], [ -75.635693, 35.855908 ] ] ], [ [ [ -75.544141, 35.240088 ], [ -75.678271, 35.212842 ], [ -75.690088, 35.221582 ], [ -75.536377, 35.278613 ], [ -75.487891, 35.479492 ], [ -75.48125, 35.572119 ], [ -75.504297, 35.7354 ], [ -75.503516, 35.769141 ], [ -75.478516, 35.716504 ], [ -75.456445, 35.56416 ], [ -75.464746, 35.448633 ], [ -75.509326, 35.280322 ], [ -75.544141, 35.240088 ] ] ], [ [ [ -75.781934, 35.190186 ], [ -75.963672, 35.118848 ], [ -75.98418, 35.123096 ], [ -75.864941, 35.174121 ], [ -75.781934, 35.190186 ] ] ], [ [ [ -76.503662, 34.642969 ], [ -76.528564, 34.631494 ], [ -76.437012, 34.756348 ], [ -76.256201, 34.914697 ], [ -76.207373, 34.938916 ], [ -76.357715, 34.803662 ], [ -76.503662, 34.642969 ] ] ], [ [ [ -82.037207, 26.453613 ], [ -82.072852, 26.427539 ], [ -82.144971, 26.44668 ], [ -82.184375, 26.480957 ], [ -82.201367, 26.548047 ], [ -82.138574, 26.477002 ], [ -82.116064, 26.460938 ], [ -82.037207, 26.453613 ] ] ], [ [ [ -82.083789, 26.552344 ], [ -82.085205, 26.493604 ], [ -82.135596, 26.591992 ], [ -82.169141, 26.700732 ], [ -82.121143, 26.665527 ], [ -82.083789, 26.552344 ] ] ], [ [ [ -80.381836, 25.142285 ], [ -80.580566, 24.954248 ], [ -80.558545, 25.001318 ], [ -80.481055, 25.101953 ], [ -80.456006, 25.149316 ], [ -80.403662, 25.179346 ], [ -80.354932, 25.233643 ], [ -80.35127, 25.296973 ], [ -80.280469, 25.34126 ], [ -80.25708, 25.347607 ], [ -80.381836, 25.142285 ] ] ], [ [ [ -91.793701, 29.500732 ], [ -91.830859, 29.486475 ], [ -91.99624, 29.573096 ], [ -92.006641, 29.610303 ], [ -91.925049, 29.643945 ], [ -91.875244, 29.640967 ], [ -91.796484, 29.596973 ], [ -91.767676, 29.584717 ], [ -91.754297, 29.566895 ], [ -91.761914, 29.539014 ], [ -91.793701, 29.500732 ] ] ], [ [ [ -97.014355, 27.901611 ], [ -97.036035, 27.89917 ], [ -96.987646, 27.981055 ], [ -96.978662, 28.013867 ], [ -96.899316, 28.11748 ], [ -96.857422, 28.13291 ], [ -96.839746, 28.088818 ], [ -96.921338, 28.016016 ], [ -97.014355, 27.901611 ] ] ], [ [ [ -96.764404, 28.152588 ], [ -96.801123, 28.148438 ], [ -96.755615, 28.202441 ], [ -96.681641, 28.229688 ], [ -96.519336, 28.333447 ], [ -96.453125, 28.340576 ], [ -96.418652, 28.376318 ], [ -96.403564, 28.381592 ], [ -96.41333, 28.337793 ], [ -96.543896, 28.275586 ], [ -96.764404, 28.152588 ] ] ], [ [ [ -97.353613, 27.300049 ], [ -97.384814, 27.242529 ], [ -97.376221, 27.328271 ], [ -97.29502, 27.523096 ], [ -97.130029, 27.77915 ], [ -97.060547, 27.822021 ], [ -97.250879, 27.541211 ], [ -97.353613, 27.300049 ] ] ], [ [ [ -95.039697, 29.145898 ], [ -95.089648, 29.136328 ], [ -94.87168, 29.290137 ], [ -94.825977, 29.341309 ], [ -94.767627, 29.339063 ], [ -94.864941, 29.252881 ], [ -95.039697, 29.145898 ] ] ], [ [ [ -97.170703, 26.159375 ], [ -97.184521, 26.112939 ], [ -97.267334, 26.329785 ], [ -97.4021, 26.820508 ], [ -97.407178, 27.100195 ], [ -97.385986, 27.196484 ], [ -97.351221, 26.801465 ], [ -97.202246, 26.299805 ], [ -97.170703, 26.159375 ] ] ], [ [ [ -120.306592, 34.024854 ], [ -120.359717, 34.022266 ], [ -120.441553, 34.03291 ], [ -120.412939, 34.056299 ], [ -120.367725, 34.073291 ], [ -120.35332, 34.060596 ], [ -120.306592, 34.024854 ] ] ], [ [ [ -119.438037, 33.217188 ], [ -119.48252, 33.215332 ], [ -119.543652, 33.224609 ], [ -119.575195, 33.27832 ], [ -119.525146, 33.282031 ], [ -119.478809, 33.274609 ], [ -119.442041, 33.232422 ], [ -119.438037, 33.217188 ] ] ], [ [ [ -118.350391, 32.827588 ], [ -118.408594, 32.818506 ], [ -118.473193, 32.838916 ], [ -118.528906, 32.935596 ], [ -118.590186, 33.011182 ], [ -118.55708, 33.032666 ], [ -118.507471, 32.959912 ], [ -118.383203, 32.849463 ], [ -118.350391, 32.827588 ] ] ], [ [ [ -120.043555, 33.918848 ], [ -120.113916, 33.904883 ], [ -120.167139, 33.918066 ], [ -120.251904, 34.013867 ], [ -120.071826, 34.026514 ], [ -119.994385, 33.984912 ], [ -119.983936, 33.97334 ], [ -120.043555, 33.918848 ] ] ], [ [ [ -119.882373, 34.079687 ], [ -119.678857, 34.028467 ], [ -119.569141, 34.052979 ], [ -119.549268, 34.028174 ], [ -119.562207, 34.006592 ], [ -119.80957, 33.967773 ], [ -119.885498, 33.994922 ], [ -119.892432, 34.032178 ], [ -119.918066, 34.067822 ], [ -119.882373, 34.079687 ] ] ], [ [ [ -118.347949, 33.385742 ], [ -118.297461, 33.312109 ], [ -118.370215, 33.32124 ], [ -118.446289, 33.31709 ], [ -118.469336, 33.357129 ], [ -118.492041, 33.412793 ], [ -118.507324, 33.427002 ], [ -118.559424, 33.431982 ], [ -118.56333, 33.437061 ], [ -118.569434, 33.46416 ], [ -118.554834, 33.4771 ], [ -118.391699, 33.415088 ], [ -118.347949, 33.385742 ] ] ], [ [ [ -122.782129, 48.672705 ], [ -122.768848, 48.650977 ], [ -122.808984, 48.629834 ], [ -122.837598, 48.626562 ], [ -122.883105, 48.660645 ], [ -122.903027, 48.664697 ], [ -122.887012, 48.612305 ], [ -122.892529, 48.594482 ], [ -122.985645, 48.626709 ], [ -123.002832, 48.652197 ], [ -122.97666, 48.67915 ], [ -122.918018, 48.706982 ], [ -122.897705, 48.710352 ], [ -122.782129, 48.672705 ] ] ], [ [ [ -123.013135, 48.500879 ], [ -122.986768, 48.468018 ], [ -123.094434, 48.489063 ], [ -123.139941, 48.507959 ], [ -123.153418, 48.526318 ], [ -123.16958, 48.586719 ], [ -123.162158, 48.606396 ], [ -123.11416, 48.613281 ], [ -123.02417, 48.538477 ], [ -123.013135, 48.500879 ] ] ], [ [ [ -122.572754, 48.156641 ], [ -122.523828, 48.025439 ], [ -122.502832, 48.080078 ], [ -122.366748, 47.985449 ], [ -122.366602, 47.938818 ], [ -122.383154, 47.923193 ], [ -122.411426, 47.917725 ], [ -122.437598, 47.931348 ], [ -122.461621, 47.964014 ], [ -122.492285, 47.981299 ], [ -122.55752, 47.99248 ], [ -122.591357, 48.029639 ], [ -122.603174, 48.055029 ], [ -122.606299, 48.128564 ], [ -122.622656, 48.151416 ], [ -122.657275, 48.156494 ], [ -122.690381, 48.173877 ], [ -122.741504, 48.225293 ], [ -122.74873, 48.239014 ], [ -122.724512, 48.280908 ], [ -122.668994, 48.351025 ], [ -122.628613, 48.384229 ], [ -122.603516, 48.380615 ], [ -122.572461, 48.35957 ], [ -122.535547, 48.321191 ], [ -122.542432, 48.293994 ], [ -122.692139, 48.241064 ], [ -122.697021, 48.228662 ], [ -122.624414, 48.21377 ], [ -122.597607, 48.200439 ], [ -122.572754, 48.156641 ] ] ], [ [ [ -71.365332, 41.485254 ], [ -71.393066, 41.466748 ], [ -71.403418, 41.515039 ], [ -71.383984, 41.570557 ], [ -71.364307, 41.571826 ], [ -71.354492, 41.542285 ], [ -71.365332, 41.485254 ] ] ], [ [ [ -74.133203, 39.680762 ], [ -74.250488, 39.529395 ], [ -74.253174, 39.558496 ], [ -74.106738, 39.746436 ], [ -74.133203, 39.680762 ] ] ], [ [ [ -75.333057, 37.888281 ], [ -75.378516, 37.87207 ], [ -75.225977, 38.072314 ], [ -75.137402, 38.240088 ], [ -75.0979, 38.298096 ], [ -75.13623, 38.180518 ], [ -75.203223, 38.072412 ], [ -75.333057, 37.888281 ] ] ], [ [ [ -76.54624, 34.654883 ], [ -76.568506, 34.652539 ], [ -76.607812, 34.663574 ], [ -76.661963, 34.684668 ], [ -76.673926, 34.700146 ], [ -76.622266, 34.694531 ], [ -76.54624, 34.654883 ] ] ], [ [ [ -81.334814, 24.650488 ], [ -81.364795, 24.629932 ], [ -81.379053, 24.636279 ], [ -81.379053, 24.66626 ], [ -81.42168, 24.732617 ], [ -81.420068, 24.75 ], [ -81.322314, 24.685059 ], [ -81.319824, 24.667627 ], [ -81.334814, 24.650488 ] ] ], [ [ [ -80.829395, 24.803662 ], [ -80.84834, 24.803662 ], [ -80.838867, 24.817871 ], [ -80.799414, 24.846289 ], [ -80.785205, 24.835254 ], [ -80.786768, 24.821045 ], [ -80.829395, 24.803662 ] ] ], [ [ [ -80.638281, 24.903174 ], [ -80.665137, 24.898438 ], [ -80.625684, 24.941113 ], [ -80.6146, 24.937939 ], [ -80.638281, 24.903174 ] ] ], [ [ [ -81.044189, 24.716797 ], [ -81.08999, 24.693115 ], [ -81.137354, 24.710498 ], [ -81.085254, 24.73418 ], [ -80.930469, 24.759473 ], [ -80.988916, 24.727881 ], [ -81.044189, 24.716797 ] ] ], [ [ [ -81.418994, 30.971436 ], [ -81.463477, 30.727783 ], [ -81.482715, 30.814062 ], [ -81.484619, 30.897852 ], [ -81.450928, 30.947412 ], [ -81.418994, 30.971436 ] ] ], [ [ [ -81.566699, 24.599902 ], [ -81.631494, 24.590039 ], [ -81.579248, 24.629395 ], [ -81.562305, 24.68916 ], [ -81.531641, 24.64248 ], [ -81.532227, 24.61416 ], [ -81.566699, 24.599902 ] ] ], [ [ [ -80.186768, 27.278418 ], [ -80.170508, 27.204785 ], [ -80.262451, 27.375586 ], [ -80.376074, 27.643408 ], [ -80.436914, 27.850537 ], [ -80.395752, 27.794531 ], [ -80.355518, 27.678613 ], [ -80.186768, 27.278418 ] ] ], [ [ [ -81.783838, 24.54458 ], [ -81.809229, 24.542334 ], [ -81.811426, 24.557813 ], [ -81.767676, 24.576709 ], [ -81.738672, 24.575439 ], [ -81.739746, 24.554492 ], [ -81.783838, 24.54458 ] ] ], [ [ [ -88.889307, 29.712598 ], [ -88.943604, 29.660254 ], [ -88.941113, 29.680225 ], [ -88.901172, 29.732617 ], [ -88.872656, 29.752979 ], [ -88.889307, 29.712598 ] ] ], [ [ [ -88.558105, 30.215918 ], [ -88.570654, 30.204785 ], [ -88.659229, 30.225586 ], [ -88.713086, 30.244922 ], [ -88.722852, 30.264258 ], [ -88.573975, 30.22915 ], [ -88.558105, 30.215918 ] ] ], [ [ [ -88.071338, 30.252344 ], [ -88.159326, 30.230908 ], [ -88.289746, 30.23291 ], [ -88.31626, 30.24043 ], [ -88.263916, 30.254736 ], [ -88.109375, 30.27373 ], [ -88.071338, 30.252344 ] ] ], [ [ [ -89.223975, 30.084082 ], [ -89.220459, 30.037598 ], [ -89.269434, 30.060742 ], [ -89.341992, 30.062842 ], [ -89.310059, 30.078711 ], [ -89.287646, 30.094189 ], [ -89.276465, 30.11084 ], [ -89.184668, 30.168652 ], [ -89.210693, 30.126221 ], [ -89.223975, 30.084082 ] ] ], [ [ [ -88.827441, 29.807715 ], [ -88.855664, 29.775879 ], [ -88.827979, 29.928369 ], [ -88.866895, 30.056738 ], [ -88.825879, 30.000391 ], [ -88.812598, 29.93335 ], [ -88.827441, 29.807715 ] ] ], [ [ [ -84.90791, 29.642627 ], [ -85.008252, 29.606641 ], [ -85.116748, 29.632813 ], [ -85.049316, 29.637793 ], [ -85.000537, 29.627197 ], [ -84.877002, 29.678662 ], [ -84.812207, 29.717627 ], [ -84.737158, 29.732422 ], [ -84.90791, 29.642627 ] ] ], [ [ [ -122.853076, 47.204736 ], [ -122.862598, 47.185059 ], [ -122.876758, 47.186133 ], [ -122.907959, 47.226123 ], [ -122.911914, 47.254346 ], [ -122.885107, 47.274707 ], [ -122.84917, 47.216309 ], [ -122.853076, 47.204736 ] ] ], [ [ [ -122.394141, 47.395264 ], [ -122.39873, 47.37251 ], [ -122.437109, 47.354785 ], [ -122.456982, 47.359326 ], [ -122.458203, 47.386133 ], [ -122.468555, 47.390234 ], [ -122.509912, 47.358008 ], [ -122.506836, 47.42168 ], [ -122.486475, 47.48877 ], [ -122.468604, 47.48999 ], [ -122.44209, 47.446143 ], [ -122.394141, 47.395264 ] ] ], [ [ [ -122.497266, 47.59458 ], [ -122.502637, 47.575439 ], [ -122.557812, 47.598291 ], [ -122.575928, 47.619482 ], [ -122.57373, 47.666846 ], [ -122.560107, 47.697754 ], [ -122.549756, 47.703955 ], [ -122.517236, 47.690576 ], [ -122.507861, 47.682666 ], [ -122.497266, 47.59458 ] ] ], [ [ [ -122.820898, 48.431348 ], [ -122.836572, 48.421533 ], [ -122.890039, 48.434668 ], [ -122.921631, 48.456934 ], [ -122.932275, 48.484766 ], [ -122.912207, 48.537988 ], [ -122.885498, 48.551611 ], [ -122.868896, 48.548633 ], [ -122.861914, 48.501855 ], [ -122.8146, 48.452344 ], [ -122.820898, 48.431348 ] ] ], [ [ [ -68.623193, 44.196045 ], [ -68.661182, 44.17627 ], [ -68.701709, 44.182666 ], [ -68.703027, 44.231982 ], [ -68.690771, 44.24873 ], [ -68.676758, 44.256201 ], [ -68.655957, 44.242334 ], [ -68.623193, 44.196045 ] ] ] ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 0.5,
          "stroke-opacity": 1,
          "name": "Brazil exports to Italy",
          "id": "brazil_italy_exports",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "amazonRainforest",
          "headline": "Beef is one of the main drivers of Amazon deforestation, and Italy purchases about ~3.5% of all of Brazil's beef products.",
          "type": "supplychain",
          "products": "[{\"name\":\"beef\",\"amount_USD\":\"160,000,000\",\"pct_total\":\"0.0349\",\"weight\":\"0.25\"}]",
          "weight": 0.02,
          "center": [ 12.070013, 42.796628 ]
        },
        "geometry": {
          "type": "MultiPolygon",
          "coordinates": [ [ [ [ 7.021094, 45.925781 ], [ 7.055762, 45.903809 ], [ 7.129004, 45.88042 ], [ 7.32793, 45.912354 ], [ 7.451563, 45.944434 ], [ 7.538574, 45.978174 ], [ 7.592578, 45.972217 ], [ 7.787891, 45.921826 ], [ 7.852344, 45.947461 ], [ 7.993164, 46.015918 ], [ 8.014258, 46.051904 ], [ 8.125195, 46.160938 ], [ 8.127246, 46.187598 ], [ 8.081543, 46.256006 ], [ 8.095703, 46.271045 ], [ 8.231934, 46.341211 ], [ 8.298535, 46.403418 ], [ 8.370703, 46.445117 ], [ 8.422559, 46.446045 ], [ 8.436816, 46.431885 ], [ 8.442969, 46.402783 ], [ 8.438477, 46.282861 ], [ 8.458398, 46.245898 ], [ 8.56543, 46.159814 ], [ 8.641699, 46.110791 ], [ 8.818555, 46.077148 ], [ 8.826758, 46.061035 ], [ 8.778027, 45.996191 ], [ 8.885156, 45.918701 ], [ 8.904297, 45.861963 ], [ 8.953711, 45.830029 ], [ 9.02373, 45.845703 ], [ 9.04668, 45.875586 ], [ 9.019141, 45.928125 ], [ 8.998926, 45.983105 ], [ 9.003027, 46.014893 ], [ 9.022363, 46.051465 ], [ 9.070996, 46.102441 ], [ 9.203418, 46.219238 ], [ 9.251074, 46.286768 ], [ 9.259766, 46.39126 ], [ 9.260156, 46.475195 ], [ 9.304395, 46.495557 ], [ 9.399316, 46.480664 ], [ 9.427637, 46.482324 ], [ 9.440625, 46.430811 ], [ 9.481055, 46.348779 ], [ 9.528711, 46.306201 ], [ 9.57959, 46.296094 ], [ 9.639453, 46.295898 ], [ 9.787793, 46.346045 ], [ 9.884473, 46.367773 ], [ 9.939258, 46.361816 ], [ 9.97168, 46.327686 ], [ 10.041016, 46.238086 ], [ 10.080566, 46.227979 ], [ 10.12832, 46.238232 ], [ 10.145215, 46.253516 ], [ 10.129883, 46.287988 ], [ 10.109668, 46.362842 ], [ 10.081934, 46.420752 ], [ 10.045605, 46.4479 ], [ 10.038281, 46.483203 ], [ 10.06123, 46.546777 ], [ 10.087012, 46.599902 ], [ 10.1375, 46.614355 ], [ 10.195508, 46.621094 ], [ 10.272266, 46.564844 ], [ 10.363086, 46.54707 ], [ 10.430664, 46.550049 ], [ 10.44248, 46.582861 ], [ 10.438281, 46.618848 ], [ 10.397949, 46.665039 ], [ 10.406055, 46.734863 ], [ 10.452832, 46.864941 ], [ 10.479395, 46.855127 ], [ 10.579785, 46.853711 ], [ 10.689258, 46.846387 ], [ 10.759766, 46.793311 ], [ 10.828906, 46.775244 ], [ 10.927344, 46.769482 ], [ 10.993262, 46.777002 ], [ 11.025098, 46.796973 ], [ 11.063477, 46.859131 ], [ 11.133887, 46.936182 ], [ 11.244434, 46.975684 ], [ 11.433203, 46.983057 ], [ 11.527539, 46.997412 ], [ 11.625488, 46.996582 ], [ 11.699414, 46.984668 ], [ 11.775684, 46.986084 ], [ 11.969531, 47.039697 ], [ 12.169434, 47.082129 ], [ 12.197168, 47.075 ], [ 12.20127, 47.060889 ], [ 12.165527, 47.028174 ], [ 12.130762, 46.984766 ], [ 12.154102, 46.935254 ], [ 12.267969, 46.835889 ], [ 12.330078, 46.759814 ], [ 12.388281, 46.702637 ], [ 12.479199, 46.67251 ], [ 12.598633, 46.654102 ], [ 12.699805, 46.647461 ], [ 12.805566, 46.625879 ], [ 13.16875, 46.572656 ], [ 13.351563, 46.55791 ], [ 13.490039, 46.555566 ], [ 13.7, 46.520264 ], [ 13.679688, 46.462891 ], [ 13.637109, 46.448535 ], [ 13.563281, 46.415088 ], [ 13.478516, 46.369189 ], [ 13.399512, 46.317529 ], [ 13.378223, 46.261621 ], [ 13.399609, 46.224951 ], [ 13.420996, 46.212305 ], [ 13.449805, 46.223535 ], [ 13.491797, 46.216602 ], [ 13.544727, 46.196582 ], [ 13.63252, 46.177051 ], [ 13.634961, 46.157764 ], [ 13.616602, 46.133105 ], [ 13.548047, 46.089111 ], [ 13.486426, 46.039551 ], [ 13.480273, 46.009229 ], [ 13.487695, 45.987109 ], [ 13.50918, 45.973779 ], [ 13.600586, 45.979785 ], [ 13.613965, 45.96167 ], [ 13.569629, 45.834131 ], [ 13.583398, 45.812354 ], [ 13.663477, 45.791992 ], [ 13.72168, 45.761279 ], [ 13.831152, 45.68042 ], [ 13.874707, 45.614844 ], [ 13.844727, 45.592871 ], [ 13.775977, 45.581982 ], [ 13.719824, 45.587598 ], [ 13.783301, 45.627246 ], [ 13.62832, 45.770947 ], [ 13.558203, 45.770703 ], [ 13.465137, 45.709961 ], [ 13.206348, 45.771387 ], [ 13.156738, 45.746582 ], [ 13.120117, 45.6979 ], [ 13.030273, 45.6375 ], [ 12.903027, 45.610791 ], [ 12.76123, 45.544287 ], [ 12.611719, 45.497217 ], [ 12.497559, 45.46167 ], [ 12.432129, 45.46792 ], [ 12.536133, 45.544922 ], [ 12.491797, 45.546289 ], [ 12.353809, 45.491992 ], [ 12.274316, 45.446045 ], [ 12.248828, 45.368848 ], [ 12.225684, 45.241504 ], [ 12.286328, 45.207715 ], [ 12.39248, 45.039795 ], [ 12.523438, 44.967969 ], [ 12.497949, 44.899414 ], [ 12.463574, 44.845215 ], [ 12.384473, 44.79834 ], [ 12.319043, 44.833105 ], [ 12.278906, 44.832227 ], [ 12.24834, 44.72251 ], [ 12.30498, 44.429443 ], [ 12.396289, 44.223877 ], [ 12.486816, 44.134229 ], [ 12.691113, 43.994727 ], [ 12.907031, 43.921191 ], [ 13.295313, 43.686084 ], [ 13.508203, 43.61167 ], [ 13.56416, 43.571289 ], [ 13.693262, 43.389893 ], [ 13.804688, 43.180371 ], [ 13.924902, 42.851563 ], [ 14.010449, 42.689551 ], [ 14.182715, 42.506445 ], [ 14.540723, 42.244287 ], [ 14.866113, 42.052539 ], [ 15.16875, 41.934033 ], [ 15.40498, 41.913232 ], [ 15.964063, 41.939453 ], [ 16.061523, 41.928125 ], [ 16.164648, 41.896191 ], [ 16.18916, 41.814014 ], [ 16.15127, 41.758496 ], [ 16.033691, 41.700781 ], [ 15.91377, 41.62085 ], [ 15.900488, 41.512061 ], [ 16.012598, 41.4354 ], [ 16.551855, 41.232031 ], [ 17.103418, 41.062158 ], [ 17.275195, 40.975439 ], [ 17.474219, 40.840576 ], [ 17.95498, 40.655176 ], [ 18.036133, 40.564941 ], [ 18.328223, 40.37085 ], [ 18.460645, 40.221045 ], [ 18.48584, 40.104834 ], [ 18.422559, 39.986865 ], [ 18.393457, 39.903613 ], [ 18.34375, 39.821387 ], [ 18.219336, 39.852539 ], [ 18.07793, 39.936963 ], [ 17.865039, 40.280176 ], [ 17.476172, 40.314941 ], [ 17.395801, 40.340234 ], [ 17.257715, 40.399072 ], [ 17.249414, 40.437891 ], [ 17.215332, 40.486426 ], [ 17.17998, 40.502783 ], [ 17.03125, 40.513477 ], [ 16.928223, 40.458057 ], [ 16.807031, 40.326465 ], [ 16.669629, 40.137207 ], [ 16.52998, 39.859668 ], [ 16.521875, 39.747559 ], [ 16.597754, 39.638916 ], [ 16.824316, 39.57832 ], [ 16.999219, 39.481592 ], [ 17.114551, 39.380615 ], [ 17.122949, 39.136572 ], [ 17.174609, 38.998096 ], [ 17.098535, 38.919336 ], [ 16.951465, 38.939795 ], [ 16.755469, 38.889697 ], [ 16.616699, 38.800146 ], [ 16.558984, 38.714795 ], [ 16.574219, 38.493555 ], [ 16.545605, 38.409082 ], [ 16.282422, 38.249561 ], [ 16.144141, 38.086377 ], [ 16.109766, 38.018652 ], [ 16.056836, 37.941846 ], [ 15.724512, 37.939111 ], [ 15.645801, 38.034229 ], [ 15.643066, 38.175391 ], [ 15.700195, 38.262305 ], [ 15.822363, 38.302979 ], [ 15.904785, 38.483496 ], [ 15.878906, 38.613916 ], [ 15.926953, 38.671729 ], [ 15.972363, 38.712598 ], [ 16.065527, 38.736426 ], [ 16.196777, 38.759229 ], [ 16.209961, 38.941113 ], [ 16.107422, 39.023828 ], [ 16.071484, 39.139453 ], [ 16.023633, 39.353613 ], [ 15.854395, 39.626514 ], [ 15.763672, 39.870068 ], [ 15.692773, 39.990186 ], [ 15.585156, 40.052832 ], [ 15.390918, 40.052148 ], [ 15.294531, 40.07002 ], [ 14.950879, 40.239014 ], [ 14.926953, 40.264746 ], [ 14.929102, 40.30957 ], [ 14.986133, 40.37749 ], [ 14.947656, 40.469336 ], [ 14.906934, 40.556055 ], [ 14.839551, 40.62998 ], [ 14.765723, 40.668408 ], [ 14.61123, 40.644775 ], [ 14.556934, 40.626416 ], [ 14.459375, 40.632715 ], [ 14.382715, 40.599854 ], [ 14.339941, 40.598828 ], [ 14.460547, 40.728711 ], [ 14.428125, 40.759326 ], [ 14.308887, 40.812646 ], [ 14.147168, 40.820703 ], [ 14.102344, 40.827148 ], [ 14.075879, 40.793945 ], [ 14.044336, 40.812256 ], [ 14.047656, 40.870312 ], [ 13.859766, 41.12998 ], [ 13.733398, 41.235645 ], [ 13.669727, 41.254492 ], [ 13.554785, 41.232178 ], [ 13.361914, 41.278516 ], [ 13.246875, 41.288867 ], [ 13.183398, 41.277686 ], [ 13.088672, 41.243848 ], [ 13.041016, 41.266211 ], [ 13.024219, 41.300928 ], [ 12.849219, 41.40874 ], [ 12.630859, 41.469678 ], [ 12.205664, 41.812646 ], [ 12.075293, 41.940869 ], [ 11.807031, 42.082031 ], [ 11.637305, 42.287549 ], [ 11.498438, 42.362939 ], [ 11.296289, 42.423291 ], [ 11.249707, 42.415723 ], [ 11.188867, 42.393115 ], [ 11.141211, 42.389893 ], [ 11.103223, 42.416602 ], [ 11.141797, 42.444092 ], [ 11.184766, 42.456592 ], [ 11.167773, 42.535156 ], [ 10.937793, 42.738721 ], [ 10.803125, 42.804297 ], [ 10.765137, 42.844678 ], [ 10.737109, 42.899951 ], [ 10.708398, 42.936328 ], [ 10.644629, 42.957178 ], [ 10.590234, 42.953613 ], [ 10.514844, 42.967529 ], [ 10.517285, 43.065137 ], [ 10.532324, 43.140137 ], [ 10.520801, 43.203809 ], [ 10.447559, 43.371191 ], [ 10.320508, 43.513086 ], [ 10.245801, 43.8521 ], [ 10.188086, 43.94751 ], [ 10.047656, 44.019971 ], [ 9.730859, 44.101172 ], [ 9.289355, 44.319238 ], [ 9.195996, 44.322998 ], [ 8.930371, 44.407764 ], [ 8.76582, 44.422314 ], [ 8.551953, 44.346143 ], [ 8.292383, 44.136523 ], [ 8.081641, 43.918945 ], [ 8.00498, 43.876758 ], [ 7.733301, 43.802588 ], [ 7.493164, 43.767139 ], [ 7.490527, 43.822949 ], [ 7.482031, 43.864893 ], [ 7.522656, 43.911084 ], [ 7.589648, 43.96543 ], [ 7.651465, 44.033643 ], [ 7.677148, 44.083154 ], [ 7.665039, 44.116016 ], [ 7.637207, 44.164844 ], [ 7.599414, 44.168359 ], [ 7.370898, 44.127393 ], [ 7.318555, 44.137988 ], [ 7.149414, 44.201709 ], [ 6.967285, 44.280029 ], [ 6.900195, 44.335742 ], [ 6.874805, 44.392041 ], [ 6.893848, 44.428174 ], [ 6.878613, 44.463281 ], [ 6.842969, 44.510693 ], [ 6.875195, 44.564551 ], [ 6.931934, 44.631641 ], [ 6.960352, 44.677148 ], [ 7.00791, 44.688965 ], [ 7.030664, 44.716699 ], [ 6.992676, 44.827295 ], [ 6.972852, 44.84502 ], [ 6.939844, 44.85874 ], [ 6.889355, 44.860303 ], [ 6.801074, 44.883154 ], [ 6.738184, 44.921387 ], [ 6.724707, 44.972998 ], [ 6.691406, 45.022607 ], [ 6.634766, 45.068164 ], [ 6.627734, 45.117969 ], [ 6.692285, 45.144287 ], [ 6.780371, 45.145313 ], [ 6.842285, 45.135645 ], [ 6.98125, 45.215576 ], [ 7.032422, 45.222607 ], [ 7.07832, 45.239941 ], [ 7.116797, 45.349023 ], [ 7.146387, 45.381738 ], [ 7.153418, 45.400928 ], [ 7.126074, 45.423682 ], [ 7.013672, 45.500488 ], [ 6.962402, 45.580566 ], [ 6.881445, 45.670361 ], [ 6.80625, 45.71001 ], [ 6.790918, 45.740869 ], [ 6.78916, 45.780078 ], [ 6.804492, 45.814551 ], [ 6.94082, 45.868359 ], [ 7.021094, 45.925781 ] ], [ [ 12.43916, 41.898389 ], [ 12.438379, 41.906201 ], [ 12.430566, 41.905469 ], [ 12.427539, 41.900732 ], [ 12.430566, 41.897559 ], [ 12.43916, 41.898389 ] ], [ [ 12.485254, 43.901416 ], [ 12.514648, 43.952979 ], [ 12.503711, 43.989746 ], [ 12.441113, 43.982422 ], [ 12.396875, 43.93457 ], [ 12.426367, 43.894092 ], [ 12.485254, 43.901416 ] ] ], [ [ [ 10.395117, 42.858154 ], [ 10.42832, 42.819189 ], [ 10.432227, 42.796582 ], [ 10.409961, 42.770996 ], [ 10.419336, 42.713184 ], [ 10.335645, 42.761133 ], [ 10.208984, 42.736914 ], [ 10.13125, 42.742041 ], [ 10.109766, 42.785059 ], [ 10.127539, 42.810303 ], [ 10.248242, 42.815771 ], [ 10.285742, 42.828076 ], [ 10.358984, 42.822314 ], [ 10.395117, 42.858154 ] ] ], [ [ [ 13.938281, 40.705615 ], [ 13.893652, 40.696973 ], [ 13.867676, 40.70874 ], [ 13.853516, 40.724072 ], [ 13.871191, 40.761816 ], [ 13.962109, 40.739404 ], [ 13.96084, 40.718164 ], [ 13.938281, 40.705615 ] ] ], [ [ [ 12.05127, 36.757031 ], [ 12.00332, 36.745996 ], [ 11.940625, 36.780371 ], [ 11.936426, 36.828613 ], [ 11.948047, 36.843066 ], [ 12.024219, 36.820947 ], [ 12.048047, 36.776367 ], [ 12.05127, 36.757031 ] ] ], [ [ [ 15.576563, 38.220312 ], [ 15.508887, 38.106641 ], [ 15.475684, 38.062939 ], [ 15.234473, 37.784814 ], [ 15.206836, 37.720557 ], [ 15.189844, 37.650732 ], [ 15.164844, 37.589551 ], [ 15.131055, 37.531885 ], [ 15.099512, 37.458594 ], [ 15.105664, 37.375488 ], [ 15.116992, 37.334717 ], [ 15.145996, 37.308008 ], [ 15.193652, 37.282861 ], [ 15.230273, 37.244336 ], [ 15.174121, 37.20918 ], [ 15.236035, 37.138721 ], [ 15.288672, 37.096924 ], [ 15.295703, 37.055176 ], [ 15.294531, 37.013281 ], [ 15.185156, 36.934814 ], [ 15.142383, 36.891602 ], [ 15.11582, 36.839258 ], [ 15.104297, 36.785254 ], [ 15.116309, 36.736475 ], [ 15.112598, 36.687842 ], [ 15.002441, 36.693896 ], [ 14.889648, 36.723535 ], [ 14.775977, 36.7104 ], [ 14.614355, 36.766602 ], [ 14.555469, 36.776758 ], [ 14.501855, 36.798682 ], [ 14.367285, 36.972852 ], [ 14.259082, 37.046436 ], [ 14.142969, 37.103662 ], [ 14.024316, 37.107129 ], [ 13.905469, 37.100635 ], [ 13.800586, 37.135889 ], [ 13.587109, 37.25415 ], [ 13.360938, 37.34873 ], [ 13.264941, 37.410352 ], [ 13.221094, 37.451807 ], [ 13.169922, 37.479297 ], [ 13.040332, 37.506543 ], [ 12.924121, 37.570508 ], [ 12.871191, 37.575195 ], [ 12.757324, 37.567383 ], [ 12.699023, 37.571826 ], [ 12.640234, 37.594336 ], [ 12.526758, 37.669531 ], [ 12.454395, 37.773779 ], [ 12.435547, 37.819775 ], [ 12.486816, 37.938721 ], [ 12.547656, 38.05293 ], [ 12.60166, 38.084961 ], [ 12.664355, 38.10791 ], [ 12.702344, 38.141699 ], [ 12.734375, 38.183057 ], [ 12.850684, 38.063721 ], [ 12.902734, 38.034863 ], [ 12.955469, 38.041309 ], [ 13.049023, 38.084082 ], [ 13.056836, 38.130908 ], [ 13.159961, 38.190332 ], [ 13.291113, 38.191455 ], [ 13.35166, 38.180518 ], [ 13.383496, 38.126807 ], [ 13.433496, 38.110254 ], [ 13.491309, 38.103125 ], [ 13.681543, 38.000732 ], [ 13.734863, 37.984033 ], [ 13.788867, 37.981201 ], [ 13.936621, 38.02417 ], [ 14.05, 38.040527 ], [ 14.287695, 38.016846 ], [ 14.416211, 38.042578 ], [ 14.505957, 38.045508 ], [ 14.636719, 38.085059 ], [ 14.737207, 38.150781 ], [ 14.789648, 38.166992 ], [ 14.845898, 38.17168 ], [ 14.981934, 38.167578 ], [ 15.11875, 38.152734 ], [ 15.176074, 38.168066 ], [ 15.224023, 38.211035 ], [ 15.27959, 38.230371 ], [ 15.340723, 38.217334 ], [ 15.49873, 38.290869 ], [ 15.568359, 38.295898 ], [ 15.634668, 38.267578 ], [ 15.576563, 38.220312 ] ] ], [ [ [ 9.632031, 40.882031 ], [ 9.682031, 40.818115 ], [ 9.794336, 40.556201 ], [ 9.805273, 40.499561 ], [ 9.782813, 40.441504 ], [ 9.754199, 40.400293 ], [ 9.642969, 40.268408 ], [ 9.659473, 40.159229 ], [ 9.700781, 40.091797 ], [ 9.706738, 40.017041 ], [ 9.686035, 39.924365 ], [ 9.616992, 39.354395 ], [ 9.583594, 39.253564 ], [ 9.5625, 39.166016 ], [ 9.486328, 39.139551 ], [ 9.388086, 39.167529 ], [ 9.26416, 39.216797 ], [ 9.206934, 39.213818 ], [ 9.149316, 39.196973 ], [ 9.101758, 39.211279 ], [ 9.056348, 39.23916 ], [ 9.022656, 39.043262 ], [ 8.966602, 38.963721 ], [ 8.881348, 38.912891 ], [ 8.801172, 38.909668 ], [ 8.718555, 38.926709 ], [ 8.648535, 38.926563 ], [ 8.59541, 38.964307 ], [ 8.55332, 39.030322 ], [ 8.48623, 39.110498 ], [ 8.418164, 39.205713 ], [ 8.410742, 39.291797 ], [ 8.399121, 39.481592 ], [ 8.418652, 39.523047 ], [ 8.44707, 39.562793 ], [ 8.461035, 39.647705 ], [ 8.451172, 39.72168 ], [ 8.471094, 39.748096 ], [ 8.510742, 39.72168 ], [ 8.540527, 39.731592 ], [ 8.538672, 39.769678 ], [ 8.547754, 39.839209 ], [ 8.495898, 39.897461 ], [ 8.407813, 39.917236 ], [ 8.399316, 39.978174 ], [ 8.408594, 40.037646 ], [ 8.455078, 40.077588 ], [ 8.470801, 40.130713 ], [ 8.471289, 40.292676 ], [ 8.40918, 40.352344 ], [ 8.385352, 40.442676 ], [ 8.353223, 40.500537 ], [ 8.295508, 40.558643 ], [ 8.230273, 40.605957 ], [ 8.189941, 40.651611 ], [ 8.180859, 40.771045 ], [ 8.203809, 40.870703 ], [ 8.224219, 40.91333 ], [ 8.245215, 40.907031 ], [ 8.310156, 40.85752 ], [ 8.363281, 40.846338 ], [ 8.468457, 40.834326 ], [ 8.571875, 40.850195 ], [ 8.698926, 40.895264 ], [ 8.821191, 40.949902 ], [ 8.998145, 41.110352 ], [ 9.107227, 41.14292 ], [ 9.163086, 41.185156 ], [ 9.182129, 41.242188 ], [ 9.228418, 41.25708 ], [ 9.283008, 41.20166 ], [ 9.350781, 41.195898 ], [ 9.455176, 41.150146 ], [ 9.500195, 41.106348 ], [ 9.53877, 41.053662 ], [ 9.575684, 41.030518 ], [ 9.615332, 41.017285 ], [ 9.621191, 41.004883 ], [ 9.589746, 40.99248 ], [ 9.553711, 40.932129 ], [ 9.574023, 40.914746 ], [ 9.632031, 40.882031 ] ] ], [ [ [ 8.478906, 39.067529 ], [ 8.421484, 38.968652 ], [ 8.360938, 39.038672 ], [ 8.358594, 39.098779 ], [ 8.366797, 39.115918 ], [ 8.440625, 39.090625 ], [ 8.478906, 39.067529 ] ] ], [ [ [ 8.286035, 41.039844 ], [ 8.252734, 40.994141 ], [ 8.205664, 40.997461 ], [ 8.224023, 41.031299 ], [ 8.267383, 41.099121 ], [ 8.320215, 41.121875 ], [ 8.34375, 41.101611 ], [ 8.318945, 41.062744 ], [ 8.286035, 41.039844 ] ] ] ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 0.5,
          "stroke-opacity": 1,
          "name": "Brazil exports to Spain",
          "id": "brazil_spain_exports",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "amazonRainforest",
          "headline": "Soy is one of the main drivers of Amazon deforestation, and Spain purchases ~2% of all of Brazil's soy products.",
          "type": "supplychain",
          "products": "[{\"name\":\"soy\",\"amount_USD\":\"742,000,000\",\"pct_total\":\"0.02\",\"weight\":\"0.25\"}]",
          "weight": 0.015,
          "center": [ -3.64755, 40.244487 ]
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [ [ [ [ 1.593945, 38.67207 ], [ 1.571191, 38.658838 ], [ 1.50498, 38.670996 ], [ 1.405762, 38.670996 ], [ 1.401953, 38.711426 ], [ 1.417188, 38.739648 ], [ 1.436328, 38.768213 ], [ 1.496875, 38.711914 ], [ 1.592676, 38.701465 ], [ 1.593945, 38.67207 ] ] ], [ [ [ 3.145313, 39.790088 ], [ 3.241113, 39.756689 ], [ 3.342188, 39.786719 ], [ 3.395898, 39.777295 ], [ 3.448926, 39.76123 ], [ 3.461816, 39.697754 ], [ 3.414648, 39.627148 ], [ 3.34873, 39.555664 ], [ 3.292969, 39.477051 ], [ 3.244727, 39.386621 ], [ 3.15459, 39.333252 ], [ 3.072852, 39.30127 ], [ 2.900098, 39.368359 ], [ 2.799805, 39.385059 ], [ 2.769824, 39.410254 ], [ 2.745996, 39.510254 ], [ 2.700586, 39.542139 ], [ 2.634082, 39.556201 ], [ 2.575879, 39.530664 ], [ 2.499512, 39.477881 ], [ 2.458789, 39.530469 ], [ 2.394336, 39.540381 ], [ 2.37002, 39.57207 ], [ 2.371289, 39.613086 ], [ 2.784961, 39.854834 ], [ 2.904785, 39.908301 ], [ 3.158691, 39.970508 ], [ 3.197559, 39.961084 ], [ 3.164453, 39.924219 ], [ 3.166992, 39.907715 ], [ 3.198633, 39.889844 ], [ 3.190918, 39.861377 ], [ 3.158691, 39.836572 ], [ 3.145313, 39.790088 ] ] ], [ [ [ 4.293652, 39.841846 ], [ 4.275293, 39.830273 ], [ 3.967676, 39.94585 ], [ 3.867188, 39.95874 ], [ 3.842676, 39.976367 ], [ 3.84541, 40.036475 ], [ 3.853418, 40.063037 ], [ 4.05918, 40.075098 ], [ 4.225781, 40.032373 ], [ 4.315137, 39.917236 ], [ 4.32207, 39.89751 ], [ 4.293652, 39.841846 ] ] ], [ [ [ 1.445215, 38.918701 ], [ 1.408984, 38.857275 ], [ 1.256934, 38.879004 ], [ 1.22334, 38.903857 ], [ 1.25625, 38.973389 ], [ 1.299805, 38.981738 ], [ 1.302539, 39.031152 ], [ 1.348633, 39.080811 ], [ 1.564453, 39.121045 ], [ 1.613184, 39.087402 ], [ 1.623633, 39.038818 ], [ 1.494531, 38.93252 ], [ 1.445215, 38.918701 ] ] ], [ [ [ -1.794043, 43.407324 ], [ -1.792725, 43.372559 ], [ -1.753271, 43.324707 ], [ -1.712842, 43.307031 ], [ -1.627148, 43.282471 ], [ -1.561475, 43.279199 ], [ -1.471729, 43.267676 ], [ -1.410693, 43.240088 ], [ -1.407324, 43.197119 ], [ -1.422607, 43.149121 ], [ -1.459424, 43.10498 ], [ -1.480469, 43.071143 ], [ -1.46084, 43.051758 ], [ -1.42876, 43.036768 ], [ -1.394043, 43.032617 ], [ -1.370508, 43.037598 ], [ -1.352734, 43.064258 ], [ -1.318848, 43.096973 ], [ -1.300049, 43.100977 ], [ -1.301562, 43.082471 ], [ -1.285449, 43.059619 ], [ -1.175439, 43.021143 ], [ -0.933838, 42.949512 ], [ -0.839209, 42.948193 ], [ -0.762646, 42.939795 ], [ -0.740186, 42.909521 ], [ -0.586426, 42.798975 ], [ -0.549805, 42.802002 ], [ -0.481152, 42.799316 ], [ -0.398438, 42.808105 ], [ -0.338574, 42.828809 ], [ -0.299316, 42.825342 ], [ -0.256055, 42.803955 ], [ -0.205322, 42.785303 ], [ -0.140039, 42.748926 ], [ -0.081494, 42.703857 ], [ -0.041162, 42.689111 ], [ 0.201367, 42.719336 ], [ 0.255469, 42.69292 ], [ 0.312891, 42.693262 ], [ 0.377246, 42.700146 ], [ 0.517676, 42.686279 ], [ 0.631641, 42.6896 ], [ 0.641992, 42.700635 ], [ 0.651758, 42.800439 ], [ 0.669824, 42.835742 ], [ 0.696875, 42.845117 ], [ 0.764453, 42.838037 ], [ 1.010059, 42.778955 ], [ 1.111133, 42.742041 ], [ 1.208301, 42.713135 ], [ 1.293262, 42.709961 ], [ 1.349414, 42.690674 ], [ 1.42832, 42.595898 ], [ 1.414844, 42.548389 ], [ 1.421973, 42.530811 ], [ 1.430273, 42.497852 ], [ 1.428125, 42.461328 ], [ 1.448828, 42.437451 ], [ 1.48623, 42.434473 ], [ 1.534082, 42.441699 ], [ 1.586426, 42.455957 ], [ 1.678516, 42.49668 ], [ 1.706055, 42.50332 ], [ 1.859766, 42.45708 ], [ 1.92793, 42.426318 ], [ 1.951465, 42.392773 ], [ 1.986523, 42.358496 ], [ 2.032715, 42.353516 ], [ 2.09834, 42.386084 ], [ 2.200391, 42.420947 ], [ 2.374414, 42.390283 ], [ 2.567969, 42.345801 ], [ 2.65166, 42.340479 ], [ 2.654785, 42.362109 ], [ 2.67002, 42.393018 ], [ 2.701855, 42.408496 ], [ 2.749414, 42.413037 ], [ 2.815625, 42.429248 ], [ 2.891406, 42.456055 ], [ 2.97002, 42.467236 ], [ 3.052637, 42.447217 ], [ 3.152148, 42.431006 ], [ 3.211426, 42.431152 ], [ 3.239844, 42.367871 ], [ 3.287891, 42.343701 ], [ 3.306738, 42.288965 ], [ 3.218652, 42.260352 ], [ 3.166406, 42.256494 ], [ 3.150391, 42.162451 ], [ 3.175195, 42.135986 ], [ 3.224609, 42.111133 ], [ 3.238086, 42.082227 ], [ 3.248047, 41.944238 ], [ 3.146875, 41.861035 ], [ 3.004883, 41.767432 ], [ 2.310938, 41.466504 ], [ 2.145605, 41.320752 ], [ 2.082617, 41.287402 ], [ 1.566602, 41.195605 ], [ 1.205859, 41.097559 ], [ 1.03291, 41.062061 ], [ 0.816895, 40.891602 ], [ 0.714648, 40.822852 ], [ 0.796094, 40.803809 ], [ 0.891113, 40.722363 ], [ 0.85918, 40.68623 ], [ 0.720605, 40.630469 ], [ 0.660059, 40.61333 ], [ 0.627148, 40.622217 ], [ 0.596094, 40.614502 ], [ 0.363672, 40.319043 ], [ 0.158398, 40.106592 ], [ 0.043066, 40.013965 ], [ -0.075146, 39.875928 ], [ -0.327002, 39.519873 ], [ -0.328955, 39.41709 ], [ -0.204932, 39.062598 ], [ -0.133789, 38.969482 ], [ -0.034131, 38.891211 ], [ 0.154883, 38.824658 ], [ 0.201563, 38.75918 ], [ 0.136328, 38.696777 ], [ -0.052734, 38.585693 ], [ -0.38125, 38.435645 ], [ -0.520801, 38.317285 ], [ -0.550684, 38.203125 ], [ -0.646777, 38.151855 ], [ -0.683203, 37.992041 ], [ -0.741553, 37.886133 ], [ -0.752734, 37.850244 ], [ -0.814648, 37.769922 ], [ -0.823096, 37.711621 ], [ -0.721582, 37.631055 ], [ -0.771875, 37.59624 ], [ -0.822168, 37.580762 ], [ -0.938086, 37.571338 ], [ -1.327539, 37.561133 ], [ -1.640967, 37.386963 ], [ -1.797607, 37.232861 ], [ -1.939307, 36.94585 ], [ -2.111523, 36.77666 ], [ -2.187695, 36.745459 ], [ -2.305566, 36.819824 ], [ -2.452832, 36.831152 ], [ -2.595703, 36.806494 ], [ -2.670605, 36.747559 ], [ -2.787549, 36.714746 ], [ -2.901855, 36.743164 ], [ -3.14917, 36.758496 ], [ -3.259131, 36.755762 ], [ -3.43125, 36.70791 ], [ -3.578809, 36.739844 ], [ -3.827783, 36.756055 ], [ -4.366846, 36.718115 ], [ -4.434863, 36.700244 ], [ -4.502246, 36.62915 ], [ -4.674121, 36.506445 ], [ -4.935303, 36.502051 ], [ -5.171484, 36.423779 ], [ -5.230518, 36.373633 ], [ -5.329687, 36.235742 ], [ -5.360937, 36.134912 ], [ -5.381592, 36.134082 ], [ -5.407227, 36.158887 ], [ -5.443604, 36.150586 ], [ -5.4625, 36.073779 ], [ -5.55127, 36.038818 ], [ -5.625488, 36.025928 ], [ -5.808398, 36.08833 ], [ -5.960693, 36.181738 ], [ -6.040674, 36.188428 ], [ -6.170459, 36.333789 ], [ -6.22627, 36.426465 ], [ -6.265918, 36.526514 ], [ -6.257715, 36.564844 ], [ -6.268945, 36.596729 ], [ -6.384131, 36.637012 ], [ -6.412256, 36.728857 ], [ -6.32832, 36.848145 ], [ -6.259424, 36.898975 ], [ -6.216797, 36.913574 ], [ -6.320947, 36.908496 ], [ -6.396191, 36.831641 ], [ -6.492432, 36.954639 ], [ -6.884619, 37.194238 ], [ -6.859375, 37.24917 ], [ -6.86377, 37.278906 ], [ -6.929492, 37.214941 ], [ -6.974658, 37.198437 ], [ -7.174951, 37.208789 ], [ -7.406152, 37.179443 ], [ -7.467187, 37.428027 ], [ -7.496045, 37.523584 ], [ -7.503516, 37.585498 ], [ -7.443945, 37.728271 ], [ -7.378906, 37.786377 ], [ -7.292236, 37.906445 ], [ -7.185449, 38.006348 ], [ -7.07251, 38.030029 ], [ -7.022852, 38.044727 ], [ -6.981104, 38.121973 ], [ -6.957568, 38.187891 ], [ -6.974805, 38.194434 ], [ -7.106396, 38.181006 ], [ -7.343018, 38.457422 ], [ -7.335791, 38.501465 ], [ -7.305957, 38.566846 ], [ -7.286377, 38.649365 ], [ -7.281543, 38.714551 ], [ -7.219922, 38.770508 ], [ -7.125488, 38.826953 ], [ -7.046045, 38.907031 ], [ -7.00625, 38.985254 ], [ -6.997949, 39.056445 ], [ -7.042969, 39.10708 ], [ -7.172412, 39.135205 ], [ -7.305762, 39.338135 ], [ -7.335449, 39.465137 ], [ -7.362695, 39.47832 ], [ -7.445117, 39.536182 ], [ -7.524219, 39.644727 ], [ -7.535693, 39.661572 ], [ -7.454102, 39.680664 ], [ -7.117676, 39.681689 ], [ -7.047412, 39.705566 ], [ -7.036719, 39.713965 ], [ -6.975391, 39.798389 ], [ -6.911182, 39.937109 ], [ -6.896094, 40.021826 ], [ -6.916406, 40.056836 ], [ -7.027832, 40.142627 ], [ -7.032617, 40.16792 ], [ -7.014697, 40.20835 ], [ -6.948437, 40.251611 ], [ -6.858887, 40.300732 ], [ -6.810156, 40.343115 ], [ -6.821777, 40.37627 ], [ -6.847949, 40.410986 ], [ -6.852051, 40.443262 ], [ -6.835693, 40.483154 ], [ -6.829834, 40.619092 ], [ -6.818359, 40.654053 ], [ -6.835889, 40.77749 ], [ -6.857715, 40.87832 ], [ -6.928467, 41.009131 ], [ -6.915527, 41.038037 ], [ -6.882813, 41.062402 ], [ -6.775781, 41.107715 ], [ -6.690137, 41.214502 ], [ -6.565918, 41.303711 ], [ -6.403125, 41.375391 ], [ -6.289355, 41.455029 ], [ -6.244336, 41.515918 ], [ -6.2125, 41.532031 ], [ -6.22168, 41.560449 ], [ -6.243115, 41.601807 ], [ -6.308057, 41.642187 ], [ -6.391699, 41.665381 ], [ -6.484668, 41.664404 ], [ -6.542187, 41.67251 ], [ -6.558984, 41.704053 ], [ -6.552588, 41.789551 ], [ -6.55752, 41.874121 ], [ -6.575342, 41.913086 ], [ -6.618262, 41.942383 ], [ -6.703613, 41.93457 ], [ -6.777295, 41.958496 ], [ -6.833203, 41.96416 ], [ -6.865527, 41.945264 ], [ -7.030469, 41.950635 ], [ -7.099121, 41.964209 ], [ -7.147119, 41.981152 ], [ -7.17793, 41.97168 ], [ -7.195361, 41.955225 ], [ -7.19834, 41.929395 ], [ -7.209619, 41.895264 ], [ -7.268555, 41.864404 ], [ -7.403613, 41.833691 ], [ -7.512598, 41.835986 ], [ -7.612598, 41.857959 ], [ -7.644678, 41.873975 ], [ -7.693066, 41.888477 ], [ -7.896387, 41.870557 ], [ -7.92085, 41.883643 ], [ -7.990967, 41.851904 ], [ -8.094434, 41.814209 ], [ -8.15249, 41.811963 ], [ -8.173535, 41.819971 ], [ -8.18125, 41.836963 ], [ -8.224756, 41.89585 ], [ -8.21333, 41.9271 ], [ -8.12998, 42.018164 ], [ -8.139307, 42.039941 ], [ -8.173584, 42.069385 ], [ -8.204199, 42.111865 ], [ -8.213086, 42.133691 ], [ -8.266064, 42.137402 ], [ -8.322559, 42.115088 ], [ -8.538086, 42.069336 ], [ -8.589648, 42.052734 ], [ -8.682959, 42.008496 ], [ -8.777148, 41.941064 ], [ -8.852344, 41.926904 ], [ -8.87832, 41.946875 ], [ -8.887207, 42.105273 ], [ -8.772461, 42.210596 ], [ -8.690918, 42.27417 ], [ -8.729199, 42.287012 ], [ -8.81582, 42.285254 ], [ -8.809961, 42.334473 ], [ -8.769385, 42.358154 ], [ -8.730029, 42.411719 ], [ -8.776172, 42.434814 ], [ -8.812109, 42.470068 ], [ -8.809912, 42.562354 ], [ -8.799902, 42.599902 ], [ -8.811523, 42.640332 ], [ -8.987793, 42.585645 ], [ -9.033105, 42.593848 ], [ -9.035059, 42.662354 ], [ -8.937207, 42.766699 ], [ -8.927197, 42.798584 ], [ -9.041602, 42.814014 ], [ -9.127197, 42.865234 ], [ -9.179443, 42.910986 ], [ -9.235205, 42.976904 ], [ -9.235645, 43.035791 ], [ -9.178076, 43.174023 ], [ -9.095557, 43.214209 ], [ -9.024512, 43.238965 ], [ -8.873682, 43.334424 ], [ -8.665625, 43.316602 ], [ -8.537061, 43.337061 ], [ -8.421582, 43.38584 ], [ -8.355469, 43.396826 ], [ -8.248926, 43.439404 ], [ -8.252295, 43.496924 ], [ -8.288867, 43.5396 ], [ -8.256738, 43.579883 ], [ -8.137158, 43.629053 ], [ -8.004687, 43.694385 ], [ -7.852734, 43.706982 ], [ -7.698145, 43.764551 ], [ -7.59458, 43.727344 ], [ -7.503613, 43.739941 ], [ -7.399316, 43.695801 ], [ -7.261963, 43.594629 ], [ -7.060986, 43.553955 ], [ -6.900684, 43.585645 ], [ -6.617285, 43.592383 ], [ -6.475684, 43.578906 ], [ -6.224121, 43.603857 ], [ -6.080127, 43.594922 ], [ -5.84668, 43.645068 ], [ -5.66582, 43.582471 ], [ -5.315723, 43.553174 ], [ -5.105273, 43.501855 ], [ -4.523047, 43.415723 ], [ -4.312793, 43.414746 ], [ -4.015332, 43.463086 ], [ -3.889355, 43.499414 ], [ -3.774023, 43.477881 ], [ -3.604639, 43.519482 ], [ -3.523633, 43.511035 ], [ -3.417871, 43.451709 ], [ -3.045605, 43.371582 ], [ -2.947705, 43.439697 ], [ -2.875049, 43.454443 ], [ -2.60708, 43.412744 ], [ -2.337109, 43.328027 ], [ -2.19668, 43.321924 ], [ -1.991309, 43.345068 ], [ -1.828516, 43.40083 ], [ -1.794043, 43.407324 ] ] ], [ [ [ -16.334473, 28.379932 ], [ -16.418213, 28.151416 ], [ -16.49624, 28.061914 ], [ -16.542773, 28.03208 ], [ -16.658008, 28.007178 ], [ -16.794727, 28.14917 ], [ -16.866016, 28.293262 ], [ -16.905322, 28.3396 ], [ -16.843066, 28.376123 ], [ -16.752051, 28.369824 ], [ -16.556836, 28.400488 ], [ -16.517432, 28.412695 ], [ -16.318994, 28.558203 ], [ -16.123633, 28.575977 ], [ -16.119141, 28.528271 ], [ -16.334473, 28.379932 ] ] ], [ [ [ -13.715967, 28.91123 ], [ -13.783984, 28.845459 ], [ -13.859912, 28.869092 ], [ -13.823633, 29.01333 ], [ -13.788184, 29.056104 ], [ -13.650098, 29.118994 ], [ -13.535059, 29.144287 ], [ -13.501416, 29.21123 ], [ -13.463574, 29.237207 ], [ -13.422949, 29.19751 ], [ -13.45376, 29.151367 ], [ -13.47793, 29.006592 ], [ -13.554688, 28.960205 ], [ -13.715967, 28.91123 ] ] ], [ [ [ -14.196777, 28.169287 ], [ -14.332617, 28.056006 ], [ -14.468604, 28.082373 ], [ -14.491797, 28.100928 ], [ -14.355566, 28.129687 ], [ -14.231982, 28.21582 ], [ -14.152588, 28.406641 ], [ -14.028369, 28.617432 ], [ -14.003369, 28.706689 ], [ -13.95415, 28.741455 ], [ -13.886279, 28.744678 ], [ -13.857227, 28.738037 ], [ -13.827148, 28.691211 ], [ -13.827588, 28.585156 ], [ -13.862988, 28.409326 ], [ -13.928027, 28.253467 ], [ -14.196777, 28.169287 ] ] ], [ [ [ -15.400586, 28.147363 ], [ -15.406689, 28.070508 ], [ -15.383154, 27.992822 ], [ -15.38916, 27.874707 ], [ -15.436768, 27.810693 ], [ -15.559375, 27.746973 ], [ -15.655762, 27.758398 ], [ -15.710303, 27.784082 ], [ -15.807324, 27.887549 ], [ -15.809473, 27.994482 ], [ -15.720947, 28.06416 ], [ -15.682764, 28.154053 ], [ -15.452783, 28.136914 ], [ -15.432715, 28.154248 ], [ -15.415479, 28.159326 ], [ -15.400586, 28.147363 ] ] ], [ [ [ -17.184668, 28.021973 ], [ -17.225391, 28.013525 ], [ -17.273926, 28.038281 ], [ -17.324902, 28.117676 ], [ -17.290332, 28.176318 ], [ -17.258594, 28.203174 ], [ -17.214355, 28.199268 ], [ -17.129639, 28.155957 ], [ -17.10376, 28.111133 ], [ -17.101074, 28.083447 ], [ -17.184668, 28.021973 ] ] ], [ [ [ -17.887939, 27.80957 ], [ -17.984766, 27.646387 ], [ -18.106592, 27.707471 ], [ -18.135937, 27.72793 ], [ -18.160547, 27.761475 ], [ -18.043359, 27.768115 ], [ -17.924512, 27.850146 ], [ -17.887939, 27.80957 ] ] ], [ [ [ -17.834277, 28.493213 ], [ -17.859375, 28.485693 ], [ -17.882129, 28.5646 ], [ -18.000781, 28.758252 ], [ -17.928809, 28.84458 ], [ -17.797559, 28.846777 ], [ -17.744531, 28.786572 ], [ -17.726563, 28.724463 ], [ -17.751611, 28.688574 ], [ -17.744385, 28.616016 ], [ -17.758008, 28.569092 ], [ -17.834277, 28.493213 ] ] ] ]
        }
      },

      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 0.5,
          "stroke-opacity": 1,
          "name": "Brazil exports to Germany",
          "id": "brazil_germany_exports",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "amazonRainforest",
          "headline": "Palm oil is one of the main drivers of Amazon deforestation, and Germany purchases ~30.1% of all Brazil's palm oil products.",
          "type": "supplychain",
          "products": "[{\"name\":\"palm_oil\",\"amount_USD\":\"6,800,000\",\"pct_total\":\"0.301\",\"weight\":\"0.25\"}]",
          "weight": 0.04,
          "center": [ 10.385781, 51.106982 ]
        },
        "geometry": {
          "type": "MultiPolygon",
          "coordinates": [ [ [ [ 9.524023, 47.524219 ], [ 9.35, 47.598926 ], [ 9.182813, 47.670703 ], [ 9.127539, 47.670703 ], [ 8.881152, 47.656396 ], [ 8.874023, 47.662695 ], [ 8.831152, 47.703613 ], [ 8.793066, 47.716553 ], [ 8.770117, 47.709912 ], [ 8.754785, 47.698047 ], [ 8.72832, 47.700049 ], [ 8.617871, 47.766113 ], [ 8.572656, 47.775635 ], [ 8.509863, 47.766895 ], [ 8.435742, 47.731348 ], [ 8.403418, 47.687793 ], [ 8.413281, 47.662695 ], [ 8.451758, 47.651807 ], [ 8.552344, 47.659131 ], [ 8.56709, 47.651904 ], [ 8.570508, 47.637793 ], [ 8.559473, 47.624023 ], [ 8.477637, 47.612695 ], [ 8.454004, 47.596191 ], [ 8.430078, 47.592139 ], [ 8.414746, 47.5896 ], [ 8.327832, 47.606934 ], [ 8.198242, 47.606934 ], [ 8.09375, 47.576172 ], [ 7.927051, 47.563867 ], [ 7.698047, 47.569873 ], [ 7.615625, 47.592725 ], [ 7.56543, 47.606543 ], [ 7.529395, 47.673877 ], [ 7.538574, 47.773633 ], [ 7.593262, 47.905664 ], [ 7.608496, 48.002588 ], [ 7.58418, 48.064307 ], [ 7.616602, 48.156787 ], [ 7.705664, 48.280029 ], [ 7.765137, 48.41001 ], [ 7.794824, 48.546826 ], [ 7.837988, 48.636035 ], [ 7.922754, 48.698535 ], [ 8.124023, 48.873291 ], [ 8.140332, 48.886426 ], [ 8.134863, 48.973584 ], [ 8.080664, 48.985889 ], [ 8.00127, 49.010937 ], [ 7.799219, 49.041895 ], [ 7.610938, 49.061768 ], [ 7.525488, 49.086377 ], [ 7.450586, 49.152197 ], [ 7.404199, 49.153076 ], [ 7.313379, 49.129541 ], [ 7.199902, 49.113623 ], [ 7.117383, 49.127539 ], [ 7.065723, 49.124854 ], [ 7.036719, 49.112695 ], [ 7.022168, 49.123438 ], [ 7.001465, 49.179883 ], [ 6.958301, 49.194629 ], [ 6.891211, 49.20752 ], [ 6.849512, 49.201953 ], [ 6.820703, 49.173926 ], [ 6.77627, 49.15415 ], [ 6.735449, 49.160596 ], [ 6.607617, 49.290869 ], [ 6.574707, 49.319678 ], [ 6.566309, 49.346191 ], [ 6.534277, 49.394678 ], [ 6.458105, 49.442871 ], [ 6.382227, 49.458154 ], [ 6.344336, 49.452734 ], [ 6.348438, 49.512695 ], [ 6.37832, 49.599609 ], [ 6.406738, 49.644971 ], [ 6.444629, 49.682031 ], [ 6.484766, 49.707813 ], [ 6.49375, 49.754395 ], [ 6.487305, 49.798486 ], [ 6.440918, 49.805322 ], [ 6.324609, 49.837891 ], [ 6.256055, 49.872168 ], [ 6.204883, 49.915137 ], [ 6.138184, 49.974316 ], [ 6.109766, 50.034375 ], [ 6.108301, 50.094238 ], [ 6.116504, 50.120996 ], [ 6.121289, 50.139355 ], [ 6.175098, 50.232666 ], [ 6.364453, 50.316162 ], [ 6.343652, 50.400244 ], [ 6.340918, 50.451758 ], [ 6.294922, 50.485498 ], [ 6.203027, 50.499121 ], [ 6.178711, 50.52251 ], [ 6.168457, 50.545361 ], [ 6.235938, 50.59668 ], [ 6.154492, 50.637256 ], [ 6.119434, 50.679248 ], [ 6.005957, 50.732227 ], [ 5.993945, 50.750439 ], [ 6.048438, 50.904883 ], [ 6.006836, 50.949951 ], [ 5.955078, 50.972949 ], [ 5.894727, 50.984229 ], [ 5.867188, 51.005664 ], [ 5.85752, 51.030127 ], [ 5.868359, 51.045313 ], [ 5.939258, 51.04082 ], [ 5.961035, 51.056689 ], [ 6.12998, 51.147412 ], [ 6.136914, 51.164844 ], [ 6.113379, 51.174707 ], [ 6.082422, 51.17998 ], [ 6.074805, 51.199023 ], [ 6.075879, 51.224121 ], [ 6.166211, 51.354834 ], [ 6.192871, 51.410596 ], [ 6.198828, 51.45 ], [ 6.193262, 51.488916 ], [ 6.141602, 51.550098 ], [ 6.091113, 51.598926 ], [ 6.089355, 51.637793 ], [ 6.052734, 51.658252 ], [ 5.948535, 51.762402 ], [ 5.94873, 51.802686 ], [ 6.007617, 51.833984 ], [ 6.089844, 51.853955 ], [ 6.117188, 51.87041 ], [ 6.166504, 51.880762 ], [ 6.29707, 51.850732 ], [ 6.355664, 51.824658 ], [ 6.372168, 51.830029 ], [ 6.425, 51.858398 ], [ 6.517578, 51.853955 ], [ 6.741797, 51.910889 ], [ 6.775195, 51.938281 ], [ 6.800391, 51.967383 ], [ 6.802441, 51.980176 ], [ 6.715625, 52.036182 ], [ 6.712988, 52.056885 ], [ 6.724512, 52.080225 ], [ 6.749023, 52.098682 ], [ 6.800391, 52.11123 ], [ 6.855078, 52.135791 ], [ 6.977246, 52.205518 ], [ 7.019629, 52.266016 ], [ 7.032617, 52.331494 ], [ 7.035156, 52.380225 ], [ 7.001855, 52.418994 ], [ 6.968164, 52.444092 ], [ 6.92207, 52.440283 ], [ 6.83252, 52.442285 ], [ 6.748828, 52.464014 ], [ 6.70293, 52.499219 ], [ 6.691602, 52.530176 ], [ 6.712402, 52.549658 ], [ 6.71875, 52.573584 ], [ 6.705371, 52.597656 ], [ 6.710742, 52.617871 ], [ 6.748438, 52.634082 ], [ 7.013184, 52.633545 ], [ 7.033008, 52.651367 ], [ 7.050879, 52.744775 ], [ 7.11709, 52.887012 ], [ 7.179492, 52.966211 ], [ 7.189941, 52.999512 ], [ 7.188965, 53.187207 ], [ 7.197266, 53.282275 ], [ 7.152051, 53.326953 ], [ 7.05332, 53.37583 ], [ 7.074316, 53.477637 ], [ 7.107129, 53.556982 ], [ 7.206445, 53.654541 ], [ 7.285254, 53.681348 ], [ 7.629199, 53.697266 ], [ 8.009277, 53.690723 ], [ 8.16709, 53.543408 ], [ 8.108496, 53.467676 ], [ 8.200781, 53.432422 ], [ 8.245215, 53.445313 ], [ 8.279004, 53.511182 ], [ 8.301563, 53.584131 ], [ 8.333887, 53.606201 ], [ 8.451367, 53.551709 ], [ 8.492676, 53.514355 ], [ 8.495215, 53.394238 ], [ 8.538477, 53.556885 ], [ 8.50625, 53.670752 ], [ 8.528418, 53.781104 ], [ 8.575586, 53.838477 ], [ 8.618945, 53.875 ], [ 8.897754, 53.835693 ], [ 9.205566, 53.855957 ], [ 9.321973, 53.813477 ], [ 9.585352, 53.600488 ], [ 9.673145, 53.565625 ], [ 9.783984, 53.554639 ], [ 9.63125, 53.600195 ], [ 9.312012, 53.859131 ], [ 9.216406, 53.891211 ], [ 9.069629, 53.900928 ], [ 8.978125, 53.926221 ], [ 8.92041, 53.965332 ], [ 8.903516, 54.000293 ], [ 8.906641, 54.260791 ], [ 8.851563, 54.299561 ], [ 8.780371, 54.313037 ], [ 8.736035, 54.295215 ], [ 8.644922, 54.294971 ], [ 8.625781, 54.353955 ], [ 8.648047, 54.397656 ], [ 8.831152, 54.427539 ], [ 8.951855, 54.467578 ], [ 8.957227, 54.53833 ], [ 8.880957, 54.593945 ], [ 8.789648, 54.695947 ], [ 8.682324, 54.791846 ], [ 8.670313, 54.903418 ], [ 8.670703, 54.90332 ], [ 8.857227, 54.901123 ], [ 8.90293, 54.896924 ], [ 9.18584, 54.844678 ], [ 9.25498, 54.808008 ], [ 9.341992, 54.806299 ], [ 9.49873, 54.84043 ], [ 9.61582, 54.85542 ], [ 9.66123, 54.834375 ], [ 9.725, 54.825537 ], [ 9.739746, 54.825537 ], [ 9.745898, 54.807178 ], [ 9.892285, 54.780615 ], [ 9.953809, 54.738281 ], [ 10.022168, 54.673926 ], [ 10.028809, 54.581299 ], [ 9.941309, 54.514648 ], [ 9.868652, 54.472461 ], [ 10.143457, 54.488428 ], [ 10.170801, 54.450195 ], [ 10.212402, 54.408936 ], [ 10.360449, 54.43833 ], [ 10.731543, 54.31626 ], [ 10.955957, 54.375684 ], [ 11.013379, 54.37915 ], [ 11.064355, 54.280518 ], [ 11.008594, 54.181152 ], [ 10.810742, 54.075146 ], [ 10.85459, 54.009814 ], [ 10.917773, 53.995312 ], [ 11.104297, 54.00918 ], [ 11.399609, 53.944629 ], [ 11.461133, 53.964746 ], [ 11.700586, 54.113525 ], [ 11.796289, 54.145459 ], [ 12.111328, 54.168311 ], [ 12.168652, 54.225879 ], [ 12.296289, 54.283789 ], [ 12.378516, 54.347021 ], [ 12.575391, 54.467383 ], [ 12.779102, 54.445703 ], [ 12.898047, 54.422656 ], [ 13.028613, 54.411035 ], [ 13.147461, 54.282715 ], [ 13.448047, 54.140869 ], [ 13.724219, 54.153223 ], [ 13.822266, 54.019043 ], [ 13.865527, 53.853369 ], [ 13.950391, 53.801367 ], [ 14.025, 53.767432 ], [ 14.25, 53.731885 ], [ 14.258887, 53.729639 ], [ 14.266113, 53.707129 ], [ 14.279883, 53.624756 ], [ 14.29873, 53.556445 ], [ 14.414551, 53.283496 ], [ 14.412305, 53.216748 ], [ 14.410938, 53.199023 ], [ 14.368555, 53.105566 ], [ 14.293164, 53.026758 ], [ 14.193652, 52.982324 ], [ 14.138867, 52.932861 ], [ 14.128613, 52.878223 ], [ 14.253711, 52.78252 ], [ 14.514063, 52.645605 ], [ 14.619434, 52.528516 ], [ 14.569727, 52.431104 ], [ 14.55459, 52.359668 ], [ 14.573926, 52.31416 ], [ 14.615625, 52.277637 ], [ 14.679883, 52.25 ], [ 14.705371, 52.207471 ], [ 14.692383, 52.150049 ], [ 14.70459, 52.110205 ], [ 14.752539, 52.081836 ], [ 14.748145, 52.070801 ], [ 14.724805, 52.030859 ], [ 14.692969, 51.958008 ], [ 14.674902, 51.904834 ], [ 14.60166, 51.832373 ], [ 14.623926, 51.770801 ], [ 14.681348, 51.698193 ], [ 14.724902, 51.661719 ], [ 14.738672, 51.627148 ], [ 14.710938, 51.544922 ], [ 14.724707, 51.523877 ], [ 14.905957, 51.46333 ], [ 14.935547, 51.435352 ], [ 14.953125, 51.377148 ], [ 15.016602, 51.252734 ], [ 14.963867, 51.095117 ], [ 14.91748, 51.00874 ], [ 14.814258, 50.871631 ], [ 14.809375, 50.858984 ], [ 14.797461, 50.842334 ], [ 14.766504, 50.818311 ], [ 14.72334, 50.814697 ], [ 14.658203, 50.832617 ], [ 14.613574, 50.855566 ], [ 14.623828, 50.914746 ], [ 14.595215, 50.918604 ], [ 14.559668, 50.954932 ], [ 14.545703, 50.993945 ], [ 14.507324, 51.009863 ], [ 14.367285, 51.02627 ], [ 14.319727, 51.037793 ], [ 14.283203, 51.029492 ], [ 14.255859, 51.001855 ], [ 14.27334, 50.976904 ], [ 14.299414, 50.952588 ], [ 14.377051, 50.914063 ], [ 14.369043, 50.89873 ], [ 14.201758, 50.86123 ], [ 14.096484, 50.822754 ], [ 13.998438, 50.801123 ], [ 13.898535, 50.761279 ], [ 13.701367, 50.716504 ], [ 13.556738, 50.704639 ], [ 13.526563, 50.692822 ], [ 13.472559, 50.616943 ], [ 13.436133, 50.601074 ], [ 13.401172, 50.609326 ], [ 13.374609, 50.621729 ], [ 13.341016, 50.611426 ], [ 13.306055, 50.586328 ], [ 13.269531, 50.576416 ], [ 13.237695, 50.576758 ], [ 13.181152, 50.510498 ], [ 13.016406, 50.490381 ], [ 12.99707, 50.456055 ], [ 12.966797, 50.416211 ], [ 12.942676, 50.406445 ], [ 12.868262, 50.422217 ], [ 12.76543, 50.430957 ], [ 12.706445, 50.409131 ], [ 12.635547, 50.39707 ], [ 12.549023, 50.393408 ], [ 12.452637, 50.349805 ], [ 12.358594, 50.273242 ], [ 12.305664, 50.205713 ], [ 12.277344, 50.181445 ], [ 12.231152, 50.244873 ], [ 12.174805, 50.288379 ], [ 12.134863, 50.310938 ], [ 12.099219, 50.310986 ], [ 12.089844, 50.301758 ], [ 12.089746, 50.268555 ], [ 12.127832, 50.213428 ], [ 12.175, 50.17583 ], [ 12.18252, 50.148047 ], [ 12.207813, 50.09751 ], [ 12.276465, 50.042334 ], [ 12.38418, 49.998584 ], [ 12.457617, 49.955518 ], [ 12.512012, 49.895801 ], [ 12.5125, 49.877441 ], [ 12.497559, 49.853076 ], [ 12.471875, 49.830078 ], [ 12.450195, 49.800146 ], [ 12.390527, 49.739648 ], [ 12.408203, 49.713184 ], [ 12.457031, 49.679785 ], [ 12.500293, 49.639697 ], [ 12.555762, 49.574854 ], [ 12.632031, 49.46123 ], [ 12.681152, 49.414502 ], [ 12.747852, 49.366211 ], [ 12.813379, 49.329346 ], [ 12.916699, 49.330469 ], [ 13.02373, 49.260107 ], [ 13.140527, 49.15835 ], [ 13.227832, 49.11167 ], [ 13.28877, 49.097461 ], [ 13.339063, 49.060791 ], [ 13.383691, 49.008105 ], [ 13.401172, 48.977588 ], [ 13.440723, 48.955566 ], [ 13.547656, 48.959668 ], [ 13.684961, 48.876709 ], [ 13.769922, 48.815967 ], [ 13.814746, 48.766943 ], [ 13.80293, 48.74751 ], [ 13.797461, 48.686426 ], [ 13.798828, 48.62168 ], [ 13.785352, 48.587451 ], [ 13.723926, 48.542383 ], [ 13.692188, 48.532764 ], [ 13.675195, 48.523047 ], [ 13.486621, 48.581836 ], [ 13.47168, 48.571826 ], [ 13.459863, 48.564551 ], [ 13.409375, 48.394141 ], [ 13.374609, 48.361377 ], [ 13.322852, 48.33125 ], [ 13.215234, 48.301904 ], [ 13.14043, 48.289941 ], [ 13.082129, 48.275098 ], [ 12.897461, 48.203711 ], [ 12.814258, 48.16084 ], [ 12.760352, 48.106982 ], [ 12.760059, 48.075977 ], [ 12.849902, 47.984814 ], [ 12.953516, 47.890625 ], [ 12.954199, 47.807764 ], [ 12.908301, 47.745801 ], [ 12.897656, 47.721875 ], [ 12.928125, 47.712842 ], [ 12.985547, 47.709424 ], [ 13.033594, 47.69873 ], [ 13.054102, 47.655127 ], [ 13.047949, 47.57915 ], [ 13.031543, 47.508008 ], [ 13.014355, 47.478076 ], [ 12.968066, 47.475684 ], [ 12.878906, 47.506445 ], [ 12.809375, 47.542187 ], [ 12.782813, 47.56416 ], [ 12.781152, 47.59043 ], [ 12.796191, 47.607031 ], [ 12.771387, 47.639404 ], [ 12.68584, 47.669336 ], [ 12.594238, 47.656299 ], [ 12.526563, 47.636133 ], [ 12.48291, 47.637305 ], [ 12.435742, 47.666113 ], [ 12.363184, 47.688184 ], [ 12.268359, 47.702734 ], [ 12.209277, 47.718262 ], [ 12.196875, 47.709082 ], [ 12.203809, 47.646729 ], [ 12.185645, 47.619531 ], [ 11.716797, 47.583496 ], [ 11.573926, 47.549756 ], [ 11.469922, 47.506104 ], [ 11.392969, 47.487158 ], [ 11.374121, 47.460254 ], [ 11.297949, 47.424902 ], [ 11.211914, 47.413623 ], [ 11.191211, 47.425195 ], [ 11.136035, 47.408887 ], [ 11.041992, 47.393115 ], [ 10.980859, 47.398145 ], [ 10.952148, 47.426709 ], [ 10.893945, 47.470459 ], [ 10.870605, 47.500781 ], [ 10.873047, 47.520215 ], [ 10.741602, 47.524121 ], [ 10.658691, 47.547217 ], [ 10.482813, 47.541797 ], [ 10.439453, 47.551563 ], [ 10.430371, 47.541064 ], [ 10.403906, 47.416992 ], [ 10.369141, 47.366064 ], [ 10.312793, 47.313428 ], [ 10.240625, 47.284131 ], [ 10.183008, 47.278809 ], [ 10.185742, 47.317188 ], [ 10.200293, 47.363428 ], [ 10.158789, 47.374268 ], [ 10.096484, 47.37959 ], [ 10.066309, 47.393359 ], [ 10.074219, 47.428516 ], [ 10.059863, 47.449072 ], [ 10.034082, 47.473584 ], [ 9.971582, 47.505322 ], [ 9.83916, 47.552295 ], [ 9.748926, 47.575537 ], [ 9.715137, 47.550781 ], [ 9.650586, 47.525879 ], [ 9.548926, 47.534033 ], [ 9.524023, 47.524219 ] ] ], [ [ [ 13.70918, 54.382715 ], [ 13.73418, 54.31543 ], [ 13.707324, 54.281152 ], [ 13.594922, 54.338184 ], [ 13.482031, 54.337402 ], [ 13.414551, 54.249561 ], [ 13.364355, 54.24585 ], [ 13.190039, 54.325635 ], [ 13.162109, 54.364551 ], [ 13.156348, 54.396924 ], [ 13.18125, 54.508984 ], [ 13.17666, 54.544238 ], [ 13.231445, 54.582764 ], [ 13.239941, 54.638428 ], [ 13.336816, 54.697119 ], [ 13.422754, 54.699316 ], [ 13.450098, 54.649609 ], [ 13.491211, 54.615381 ], [ 13.636035, 54.577002 ], [ 13.657617, 54.55957 ], [ 13.670703, 54.535449 ], [ 13.60332, 54.488184 ], [ 13.580469, 54.463965 ], [ 13.601855, 54.425146 ], [ 13.70918, 54.382715 ] ] ], [ [ [ 14.211426, 53.950342 ], [ 14.198242, 53.919043 ], [ 14.213672, 53.870752 ], [ 14.172168, 53.874365 ], [ 14.04834, 53.863086 ], [ 13.925781, 53.879053 ], [ 13.902148, 53.938965 ], [ 13.92168, 53.996631 ], [ 13.872461, 54.036279 ], [ 13.827148, 54.05957 ], [ 13.82041, 54.092822 ], [ 13.827734, 54.127246 ], [ 14.038867, 54.03457 ], [ 14.211426, 53.950342 ] ] ], [ [ [ 11.282813, 54.417969 ], [ 11.129297, 54.416016 ], [ 11.070703, 54.456006 ], [ 11.011719, 54.466162 ], [ 11.043457, 54.515479 ], [ 11.084961, 54.533398 ], [ 11.233594, 54.50127 ], [ 11.280273, 54.438379 ], [ 11.282813, 54.417969 ] ] ], [ [ [ 8.307715, 54.786963 ], [ 8.284668, 54.76709 ], [ 8.295703, 54.908301 ], [ 8.405176, 55.05874 ], [ 8.451465, 55.055371 ], [ 8.404102, 55.014746 ], [ 8.39043, 54.986279 ], [ 8.371191, 54.929395 ], [ 8.379883, 54.899854 ], [ 8.62959, 54.891748 ], [ 8.600586, 54.865381 ], [ 8.347363, 54.847607 ], [ 8.307715, 54.786963 ] ] ], [ [ [ 8.587891, 54.712695 ], [ 8.548926, 54.688184 ], [ 8.453809, 54.691064 ], [ 8.400391, 54.714111 ], [ 8.417676, 54.738672 ], [ 8.468164, 54.757422 ], [ 8.509961, 54.760303 ], [ 8.573438, 54.74873 ], [ 8.587891, 54.712695 ] ] ] ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 5,
          "stroke-opacity": 1,
          "name": "Swing State: Florida",
          "id": "florida_election_2020",
          "childId": ["tampa_florida_election_2020", "orlando_florida_election_2020"],
          "rootId":"usElection2020",
          "parentId": "usElection2020",
          "type": "election",
          "headline": "Florida is one of the most important swing states, with 29 electoral votes of the ~137 electoral votes most up for grabs. ",
          "weight": 0.18
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -96.50390625,
              39.095962936305476
            ],
            [
              -82.265625,
              29.84064389983441
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 2,
          "stroke-opacity": 1,
          "name": "Swing State: Michigan",
          "id": "michigan_election_2020",
          "childId": ["detroit_michigan_election_2020", "eastlansing_michigan_election_2020"],
          "rootId":"usElection2020",
          "parentId": "usElection2020",
          "type": "election",
          "headline": "Michigan is one of the most important swing states, with 16 electoral votes of the ~137 electoral votes most up for grabs. ",
          "weight": 0.07
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -96.591796875,
              39.26628442213066
            ],
            [
              -83.408203125,
              42.391008609205045
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1.5,
          "stroke-opacity": 1,
          "name": "Swing State: Wisconsin",
          "id": "wisconsin_election_2020",
          "childId": [],
          "rootId":"usElection2020",
          "parentId": "usElection2020",
          "type": "election",
          "headline": "Wisconsin is one of the most important swing states, with 10 electoral votes of the ~137 electoral votes most up for grabs. ",
          "weight": 0.06
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -96.5478515625,
              39.26628442213066
            ],
            [
              -89.3408203125,
              43.068887774169625
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 3.5,
          "stroke-opacity": 1,
          "name": "Swing State: Pennsylvania",
          "id": "pennsylvania_election_2020",
          "childId": [],
          "rootId":"usElection2020",
          "parentId": "usElection2020",
          "type": "election",
          "headline": "Pennsylvania is one of the most important swing states, with 20 electoral votes of the ~137 electoral votes most up for grabs. ",
          "weight": 0.11
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -96.591796875,
              39.26628442213066
            ],
            [
              -75.157470703125,
              39.9602803542957
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1.4,
          "stroke-opacity": 1,
          "name": "Swing State: Arizona",
          "id": "arizona_election_2020",
          "childId": [],
          "rootId":"usElection2020",
          "parentId": "usElection2020",
          "type": "election",
          "headline": "Arizona is one of the most important swing states, with 11 electoral votes of the ~137 electoral votes most up for grabs. ",
          "weight": 0.065
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -96.7236328125,
              39.26628442213066
            ],
            [
              -112.0166015625,
              33.46810795527896
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1.4,
          "stroke-opacity": 1,
          "name": "Swing State: North Carolina",
          "id": "northcarolina_election_2020",
          "childId": [],
          "rootId":"usElection2020",
          "parentId": "usElection2020",
          "type": "election",
          "headline": "North Carolina is one of the most important swing states, with 15 electoral votes of the ~137 electoral votes most up for grabs. ",
          "weight": 0.07
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -96.61376953125,
              39.317300373271024
            ],
            [
              -79.34326171875,
              35.90684930677121
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 4,
          "stroke-opacity": 0.7,
          "name": "Amazon Logging Imports",
          "id": "brazil_USA_exports_amazon",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "brazil_USA_exports",
          "headline": "Amazon is one of the companies which buy the majority of Brazilian logging products.",
          "type": "supplychain",
          "products": "[{\"name\":\"wood\",\"amount_USD\":\"1,270,000,000\",\"pct_total\":\"0.33\",\"weight\":\"0.25\"}]",
          "weight": 0.25
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -74.619140625,
              34.08906131584994
            ],
            [
              -122.32177734375,
              47.61356975397398
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 3,
          "stroke-opacity": 0.7,
          "name": "Home Depot Logging Imports",
          "id": "brazil_USA_exports_homedepot",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "brazil_USA_exports",
          "headline": "Home Depot is one of the companies which buy the majority of Brazilian logging products.",
          "type": "supplychain",
          "products": "[{\"name\":\"wood\",\"amount_USD\":\"1,270,000,000\",\"pct_total\":\"0.33\",\"weight\":\"0.25\"}]",
          "weight": 0.18
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -74.70703125,
              34.016241889667015
            ],
            [
              -84.375,
              33.76088200086917
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 2,
          "stroke-opacity": 0.7,
          "name": "Acme Corp. Logging Imports",
          "id": "brazil_USA_exports_acme",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "brazil_USA_exports",
          "headline": "Acme is one of the companies which buy the majority of Brazilian logging products.",
          "type": "supplychain",
          "products": "[{\"name\":\"wood\",\"amount_USD\":\"1,270,000,000\",\"pct_total\":\"0.33\",\"weight\":\"0.25\"}]",
          "weight": 0.1
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -75.5859375,
              35.99578538642032
            ],
            [
              -74.4873046875,
              40.34654412118006
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 6,
          "stroke-opacity": 0.7,
          "name": "Shanghai Corp Beef Imports",
          "id": "brazil_china_exports_shanghaicorp",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "brazil_china_exports",
          "headline": "Shanghai Corp is one of the companies which buy the majority of Brazilian beef products.",
          "type": "supplychain",
          "products": "[{\"name\":\"wood\",\"amount_USD\":\"1,270,000,000\",\"pct_total\":\"0.33\",\"weight\":\"0.25\"}]",
          "weight": 0.33
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              91.93359375,
              35.02999636902566
            ],
            [
              121.640625,
              31.12819929911196
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 4,
          "stroke-opacity": 0.7,
          "name": "Hong Kong Corp Beef Imports",
          "id": "brazil_china_exports_hongkongcorp",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "brazil_china_exports",
          "headline": "Hong Kong Corp Corp is one of the companies which buy the majority of Brazilian beef products.",
          "type": "supplychain",
          "products": "[{\"name\":\"wood\",\"amount_USD\":\"1,270,000,000\",\"pct_total\":\"0.33\",\"weight\":\"0.25\"}]",
          "weight": 0.2
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              92.46093749999999,
              35.10193405724606
            ],
            [
              114.169921875,
              22.350075806124867
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 3,
          "stroke-opacity": 0.7,
          "name": "Jiangsu Corp Beef Imports",
          "id": "brazil_china_exports_jiangsucorp",
          "childId": [],
          "rootId":"amazonRainforest",
          "parentId": "brazil_china_exports",
          "headline": "Jiangsu Corp is one of the companies which buy the majority of Brazilian logging products.",
          "type": "supplychain",
          "products": "[{\"name\":\"wood\",\"amount_USD\":\"1,270,000,000\",\"pct_total\":\"0.33\",\"weight\":\"0.25\"}]",
          "weight": 0.1
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              92.373046875,
              34.813803317113155
            ],
            [
              120.05859375,
              33.50475906922609
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 5,
          "stroke-opacity": 1,
          "name": "Swing City: Tampa Bay, Florida",
          "id": "tampa_florida_election_2020",
          "childId": [],
          "rootId":"usElection2020",
          "parentId": "florida_election_2020",
          "type": "election",
          "headline": "Tampa Bay is one of the most important swing cities in the Florida state election. ",
          "weight": 0.18
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -82.72705078125,
              30.240086360983426
            ],
            [
              -82.46337890625,
              27.89734922968426
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 5,
          "stroke-opacity": 1,
          "name": "Swing City: Orlando, Florida",
          "id": "orlando_florida_election_2020",
          "childId": [],
          "rootId":"usElection2020",
          "parentId": "florida_election_2020",
          "type": "election",
          "headline": "Orlando is one of the most important swing cities in the Florida state election. ",
          "weight": 0.18
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -82.705078125,
              30.15462722077597
            ],
            [
              -81.375732421875,
              28.526622418648127
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 5,
          "stroke-opacity": 1,
          "name": "Swing City: Detroit, Michigan",
          "id": "detroit_michigan_election_2020",
          "childId": [],
          "rootId":"usElection2020",
          "parentId": "michigan_election_2020",
          "type": "election",
          "headline": "Detroit is one of the most important swing cities in the Michigan state election. ",
          "weight": 0.25
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -84.3804931640625,
              42.16340342422401
            ],
            [
              -83.045654296875,
              42.35042512243457
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 5,
          "stroke-opacity": 1,
          "name": "Swing City: East Lansing, Michigan",
          "id": "eastlansing_michigan_election_2020",
          "childId": [],
          "rootId":"usElection2020",
          "parentId": "michigan_election_2020",
          "type": "election",
          "headline": "East Lansing is one of the most important swing cities in the Michigan state election.",
          "weight": 0.15
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -84.83642578125,
              42.06560675405716
            ],
            [
              -84.495849609375,
              42.7349091465156
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 2.7,
          "stroke-opacity": 1,
          "name": "USA Emissions",
          "id": "usa_emissions",
          "childId": ["nyc_emissions", "chicago_emissions", "losangeles_emissions"],
          "rootId":"globalWarming",
          "parentId": "globalWarming",
          "headline": "USA is the #2 emitting country in the world, responsible for 14% of world emissions.  Within the United States, transportation accounts for 28% of emissions, electricity accounts for 27% of emissions, industry accounts for 22% of emissions, commercial/residential accounts for 12% of emissions, and agriculture accounts for 10% of emissions.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.14
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -70.3125,
              74.21198251594369
            ],
            [
              -73.47656249999999,
              44.08758502824516
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 5,
          "stroke-opacity": 1,
          "name": "China Emissions",
          "id": "china_emissions",
          "childId": ["guangzhou_emissions", "hongkong_emissions", "shanghai_emissions"],
          "rootId":"globalWarming",
          "parentId": "globalWarming",
          "headline": "China is the #1 emitting country in the world, responsible for 26% of global emissions.  Within China, the main drivers of emissions include exports (e.g. consumer exports to USA), electricity generation, the manufacturing of iron and steel for exports (a coal-intensive process), cement plants, and petroleum refineries.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.26
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              45.3515625,
              74.21198251594369
            ],
            [
              89.6484375,
              39.639537564366684
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1.3,
          "stroke-opacity": 1,
          "name": "India Emissions",
          "id": "india_emissions",
          "childId": [],
          "rootId":"globalWarming",
          "parentId": "globalWarming",
          "headline": "India is the #3 emitting country in the world, responsible for 7% of global emissions.  Within India, 68.7% of emissions come from the energy sector, 19.6% come from agriculture, 6% come from industrial processes, 3.8% come from land use changes, and 1.9% come from forestry.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.07
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              42.890625,
              73.92246884621463
            ],
            [
              73.828125,
              27.68352808378776
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 0.8,
          "stroke-opacity": 1,
          "name": "Indonesia Emissions",
          "id": "indonesia_emissions",
          "childId": [],
          "rootId":"globalWarming",
          "parentId": "globalWarming",
          "headline": "Indonesia is one of the highest emitting countries in the world, responsible for 4.8% of global emissions.  Within Indonesia, 65.5% of emissions come from land-use change and forestry, 22.6% come from energy, 7.4% come from agriculture, 3% come from waste, and 1.4% come from industrial processes.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.048
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              90,
              75.40885422846455
            ],
            [
              116.01562499999999,
              2.4601811810210052
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 0.8,
          "stroke-opacity": 1,
          "name": "Russia Emissions",
          "id": "russia_emissions",
          "childId": [],
          "rootId":"globalWarming",
          "parentId": "globalWarming",
          "headline": "Russia is one of the highest emitting country in the world, responsible for 4.5% of global emissions.  Within Russia, 80% of emissions come from the energy sector, 11% come from industrial processes, 5.5% come from agriculture, and 3.5% come from waste management.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.045
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              28.125,
              74.01954331150228
            ],
            [
              37.265625,
              54.77534585936447
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1,
          "stroke-opacity": 1,
          "name": "New York City",
          "id": "nyc_emissions",
          "childId": [],
          "rootId":"globalWarming",
          "parentId": "usa_emissions",
          "headline": "USA is the #1 emitting city in the USA, and #3 in the world.  Within NYC, 24% of emissions come from electricity, 25% come from gasoline, and 35% come from natural gas.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.14
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.45458984375,
              44.174324837518895
            ],
            [
              -73.95996093749999,
              40.730608477796636
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1,
          "stroke-opacity": 1,
          "name": "Chicago",
          "id": "chicago_emissions",
          "childId": [],
          "rootId":"globalWarming",
          "parentId": "usa_emissions",
          "headline": "Chicago is the #3 emitting city in the USA, and #8 in the world.  Within Chicago, 27% of emissions come from residential buildings, 25% come from commercial and institutional buildings, 17% come from manufacturing industries and construction, 15% come from on-road transportation, 6% come from solid waste, 5% come from aviation, 3% come from offroad transportation, and 2% of emissions comes from railways, fugitive emissions from oil and natural gas systems, energy industries, biogas flare, wastewater, biological waste, and waterborne navigation.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.14
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.45458984375,
              44.4808302785626
            ],
            [
              -87.56103515625,
              41.934976500546604
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1,
          "stroke-opacity": 1,
          "name": "Los Angeles",
          "id": "losangeles_emissions",
          "childId": [],
          "rootId":"globalWarming",
          "parentId": "usa_emissions",
          "headline": "Los Angeles is the #2 emitting city in the USA, and #5 in the world.  Within Los Angeles, 41% of emissions come from transportation, 24% come from industry, 9% come from electricity (generated in-state), 8% come from agriculture, 7% come from residential, 6% come from electricity (generated out-of-state), and 5% come from commercial.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.14
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -73.564453125,
              44.18220395771566
            ],
            [
              -118.30078125,
              34.08906131584994
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1,
          "stroke-opacity": 1,
          "name": "Guangzhou",
          "id": "guangzhou_emissions",
          "childId": [],
          "rootId":"globalWarming",
          "parentId": "china_emissions",
          "headline": "Guangzhou is the #1 emitting city in China, and #2 in the world.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.14
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              113.25256347656249,
              23.130257185291036
            ],
            [
              88.1982421875,
              41.343824581185686
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1,
          "stroke-opacity": 1,
          "name": "Hong Kong",
          "id": "hongkong_emissions",
          "childId": [],
          "rootId":"globalWarming",
          "parentId": "china_emissions",
          "headline": "Hong Kong is the #4 highest emitting city in the world..",
          "type": "emissions",
          "products": "[]",
          "weight": 0.14
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              88.76953125,
              40.78054143186033
            ],
            [
              114.169921875,
              22.30942584120019
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1,
          "stroke-opacity": 1,
          "name": "Shanghai",
          "id": "shanghai_emissions",
          "childId": [],
          "rootId":"globalWarming",
          "parentId": "china_emissions",
          "headline": "Shanghai is the #2 emitting city in China, and #6 in the world.",
          "type": "emissions",
          "products": "[]",
          "weight": 0.14
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              88.1982421875,
              41.47566020027821
            ],
            [
              121.5087890625,
              31.240985378021307
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1,
          "stroke-opacity": 1,
          "name": "Industrial Bank of Korea",
          "id": "IBK_adani_funding",
          "childId": [],
          "rootId":"adaniCoalMine",
          "parentId": "adaniCoalMine",
          "headline": "Based in South Korea, the Industrial Bank of Korea is one of the major remaining project funders/partners on the Adani Carmichael coal mine.  Two other project partners from South Korea - Samsung and Hanwha - publicly backed out of the project after learning about mine's environmental impact.",
          "type": "financing",
          "products": "[]",
          "weight": 0.1
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              147.568359375,
              -19.973348786110602
            ],
            [
              126.968994140625,
              37.58811876638322
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 2,
          "stroke-opacity": 1,
          "name": "Marsh Global",
          "id": "marsh_adani_funding",
          "childId": [],
          "rootId":"adaniCoalMine",
          "parentId": "adaniCoalMine",
          "headline": "One of Adani's major project partners/funders is the insurer Marsh Global, which has decided (as of now) to continue supporting the project despite sustainability pledges.",
          "type": "financing",
          "products": "[]",
          "weight": 0.25
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              148.88671874999997,
              -20.46818922264095
            ],
            [
              286.0304260253906,
              40.7701418259051
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 3,
          "stroke-opacity": 1,
          "name": "Adani Group",
          "id": "adani_adani_funding",
          "childId": [],
          "rootId":"adaniCoalMine",
          "parentId": "adaniCoalMine",
          "headline": "The Carmichael coal mine is being pushed forward by the Adani Group, led by CEO Gautam Adani",
          "type": "financing",
          "products": "[]",
          "weight": 0.65
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              146.6015625,
              -20.385825381874263
            ],
            [
              72.57705688476562,
              23.015284307019563
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 9,
          "stroke-opacity": 1,
          "fill": "#ff0000",
          "fill-opacity": 0.5,
          "name": "Yangtze River Pollution",
          "id": "yangtzeRiver_plastic",
          "childId": [],
          "rootId":"oceanPollution",
          "parentId": "oceanPollution",
          "type": "natural",
          "headline": "The Yangtze River, running East and West across China, accounts for almost 1/3rd of all plastic waste in the ocean.",
          "CO2_impact": "0",
          "CO2_trend": "red"
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -215.859375,
              35.10193405724606
            ],
            [
              -241.00708007812497,
              32.24068253457369
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 2,
          "stroke-opacity": 1,
          "fill": "#ff0000",
          "fill-opacity": 0.5,
          "name": "Nile River Pollution",
          "id": "nileRiver_plastic",
          "childId": [],
          "rootId":"oceanPollution",
          "parentId": "oceanPollution",
          "type": "natural",
          "headline": "The Nile River, spilling out into the Mediterranean Sea, is the 4th-highest plastic polluting river in the world.",
          "CO2_impact": "0",
          "CO2_trend": "red"
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -215.33203125,
              37.3002752813443
            ],
            [
              -328.88671875,
              30.751277776257812
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": {
          "stroke": "#ff0000",
          "strokeWidth": 1.5,
          "stroke-opacity": 1,
          "fill": "#ff0000",
          "fill-opacity": 0.5,
          "name": "Amazon River Pollution",
          "id": "amazonRiver_plastic",
          "childId": [],
          "rootId":"oceanPollution",
          "parentId": "oceanPollution",
          "type": "natural",
          "headline": "The Amazon river is the 7th-highest polluting river in the world.",
          "CO2_impact": "0",
          "CO2_trend": "red"
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [
              -214.8046875,
              32.24997445586331
            ],
            [
              -408.8671875,
              1.0546279422758869
            ]
          ]
        }
      }
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
