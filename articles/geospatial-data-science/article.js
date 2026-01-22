const BASE_STYLE = "https://demotiles.maplibre.org/style.json";

// Serve these from YOUR SITE to avoid CORS issues.
const SOURCES = {
  walkways:  "/data/geospatial-data-science/Walkways.geojson",
  nodes:     "/data/geospatial-data-science/Nodes.geojson",
  poi:       "/data/geospatial-data-science/PointsofInterest.geojson",
  events:    "/data/geospatial-data-science/StadiumsandEncounters.geojson",
  rides:     "/data/geospatial-data-science/Rides_JSON.geojson",
  fnb:       "/data/geospatial-data-science/FoodandBeverage.geojson",
  restrooms: "/data/geospatial-data-science/Restrooms.geojson",
};

const LAYER_STYLE = {
  walkways: { type:"line", paint:{ "line-color":"#7CFF6B", "line-width": 3.0, "line-opacity": 0.9 }},
  nodes:    { type:"circle", paint:{ "circle-radius":5, "circle-color":"#FDE047", "circle-stroke-color":"#ef4444", "circle-stroke-width":1.2, "circle-opacity":0.95 }},
  poi:      { type:"circle", paint:{ "circle-radius":6, "circle-color":"#60A5FA", "circle-stroke-color":"rgba(255,255,255,.65)", "circle-stroke-width":1.2, "circle-opacity":0.92 }},
  eventsFill:   { type:"fill", paint:{ "fill-color":"#F472B6", "fill-opacity":0.25 }},
  eventsOutline:{ type:"line", paint:{ "line-color":"#F472B6", "line-width":2.0, "line-opacity":0.75 }},
  rides:    { type:"circle", paint:{ "circle-radius":6, "circle-color":"#FB7185", "circle-stroke-color":"rgba(0,0,0,.35)", "circle-stroke-width":1.2, "circle-opacity":0.95 }},
  fnb:      { type:"circle", paint:{ "circle-radius":6, "circle-color":"#34D399", "circle-stroke-color":"rgba(0,0,0,.35)", "circle-stroke-width":1.2, "circle-opacity":0.95 }},
  restrooms:{ type:"circle", paint:{ "circle-radius":6, "circle-color":"#A78BFA", "circle-stroke-color":"rgba(0,0,0,.35)", "circle-stroke-width":1.2, "circle-opacity":0.95 }},
};

function parseLngLat(str){
  const [lng, lat] = (str || "").split(",").map(s => Number(s.trim()));
  return [lng, lat];
}

function setLegend(container, items){
  if (!container) return;
  const body = container.querySelector(".map-legend-body") || container;
  body.innerHTML = "";
  items.forEach(it => {
    const row = document.createElement("div");
    row.className = "legend-row";
    row.innerHTML = `<span class="swatch" style="background:${it.color}"></span><span>${it.label}</span>`;
    body.appendChild(row);
  });
}

function buildMap(el){
  const center = parseLngLat(el.dataset.center || "-117.213,32.764");
  const zoom = Number(el.dataset.zoom || 14.8);
  const pitch = Number(el.dataset.pitch || 0);
  const bearing = Number(el.dataset.bearing || 0);
  const layersWanted = (el.dataset.layers || "walkways").split(",").map(s => s.trim());

  const map = new maplibregl.Map({
    container: el,
    style: BASE_STYLE,
    center,
    zoom,
    pitch,
    bearing,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  map.on("load", () => {
    // Add sources + layers only if requested
    const legendItems = [];

    function addPointLayer(key, label, color){
      map.addSource(key, { type:"geojson", data: SOURCES[key] });
      map.addLayer({ id:`${key}-layer`, source:key, ...LAYER_STYLE[key] });
      legendItems.push({ label, color });
    }

    function addLineLayer(key, label, color){
      map.addSource(key, { type:"geojson", data: SOURCES[key] });
      map.addLayer({ id:`${key}-layer`, source:key, ...LAYER_STYLE[key] });
      legendItems.push({ label, color });
    }

    function addEvents(){
      map.addSource("events", { type:"geojson", data: SOURCES.events });
      map.addLayer({ id:"events-fill", source:"events", ...LAYER_STYLE.eventsFill });
      map.addLayer({ id:"events-outline", source:"events", ...LAYER_STYLE.eventsOutline });
      legendItems.push({ label:"Stadiums/Encounters", color:"#F472B6" });
    }

    if (layersWanted.includes("walkways")) addLineLayer("walkways", "Walkways", "#7CFF6B");
    if (layersWanted.includes("nodes")) addPointLayer("nodes", "Nodes", "#FDE047");
    if (layersWanted.includes("poi")) addPointLayer("poi", "POI", "#60A5FA");
    if (layersWanted.includes("events")) addEvents();
    if (layersWanted.includes("rides")) addPointLayer("rides", "Rides", "#FB7185");
    if (layersWanted.includes("fnb")) addPointLayer("fnb", "Food & Beverage", "#34D399");
    if (layersWanted.includes("restrooms")) addPointLayer("restrooms", "Restrooms", "#A78BFA");

    // Legend: nearest container is in same map-block if present
    const block = el.closest(".map-block, .map-inline, .map-frame") || document;
    const legend = block.querySelector("[data-legend]");
    if (legend) setLegend(legend, legendItems);
  });

  return map;
}

// Lazy-init maps only when visible (better performance)
const mapEls = [...document.querySelectorAll("[data-map]")];
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    if (el._mapBuilt) return;
    el._mapBuilt = true;
    buildMap(el);
  });
}, { threshold: 0.2 });

mapEls.forEach(el => io.observe(el));
