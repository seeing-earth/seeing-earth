var mymap = L.map('map', {
	center: [51.454513, -0.15587910],
	zoom: 12
});

L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1,
    accessToken: 'pk.eyJ1IjoibGV0b3VycG93ZXJzY29tYmluZSIsImEiOiJjazFmN3N0eTUwb3JwM2JwYWk4ZXB1enNtIn0._UjpOqZIeiWqhscosubipw'
}).addTo(mymap);

// var marker = L.marker([51.5, -0.09]).addTo(mymap);
var popup = L.popup();

function onMapClick(e) {
    popup
        .setLatLng(e.latlng)
        .setContent("You clicked the map at " + e.latlng.toString())
        .openOn(mymap);
}

mymap.on('click', onMapClick);

function myFunction() {
  var map = L.map('map').setView([51.101516, 10.313446], 6);
  if (map.tap) map.tap.disable();
  L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
	attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
	maxZoom: 16
}).addTo(map);
  map._layersMinZoom=5;

// add a layer group, yet empty
var markersLayer = new L.LayerGroup();
map.addLayer(markersLayer);

// add the search bar to the map
  var controlSearch = new L.Control.Search({
    position:'topleft',    // where do you want the search bar?
    layer: markersLayer,  // name of the layer
    initial: false,
    zoom: 11,        // set zoom to found location when searched
    marker: false,
    textPlaceholder: 'search...' // placeholder while nothing is searched
  });

  map.addControl(controlSearch); // add it to the map
};
