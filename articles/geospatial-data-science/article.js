const DATA_DIR = "/data/geospatial-data-science/";

const SOURCES = {
  walkways:  `${DATA_DIR}Walkways.geojson`,
  nodes:     `${DATA_DIR}Nodes.geojson`,
  poi:       `${DATA_DIR}PointsofInterest.geojson`,
  events:    `${DATA_DIR}StadiumsandEncounters.geojson`,
  rides:     `${DATA_DIR}Rides_JSON.geojson`,
  fnb:       `${DATA_DIR}FoodandBeverage.geojson`,
  restrooms: `${DATA_DIR}Restrooms.geojson`,
};

function makeStyle(){
  return {
    version: 8,
    sources: {
      esri: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        attribution: "Tiles © Esri"
      }
    },
    layers: [
      { id: "esri", type: "raster", source: "esri" }
    ]
  };
}

const META = {
  walkways:  { label:"Walkways",            color:"#7CFF6B", kind:"line" },
  nodes:     { label:"Nodes",               color:"#FDE047", kind:"circle" },
  poi:       { label:"POI",                 color:"#60A5FA", kind:"circle" },
  events:    { label:"Stadiums/Encounters", color:"#F472B6", kind:"polygon" },
  rides:     { label:"Rides",               color:"#FB7185", kind:"circle" },
  fnb:       { label:"Food & Beverage",     color:"#34D399", kind:"circle" },
  restrooms: { label:"Restrooms",           color:"#A78BFA", kind:"circle" },
};

function setLegend(legendEl, items){
  if (!legendEl) return;
  const body = legendEl.querySelector(".map-legend-body");
  if (!body) return;
  body.innerHTML = "";
  items.forEach(it => {
    const row = document.createElement("div");
    row.className = "legend-row";
    row.innerHTML = `<span class="swatch" style="background:${it.color}"></span><span>${it.label}</span>`;
    body.appendChild(row);
  });
}

async function fetchJSON(url){
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  return r.json();
}

function geojsonBounds(gj){
  let minLng=Infinity, minLat=Infinity, maxLng=-Infinity, maxLat=-Infinity;

  function push(c){
    const x=c[0], y=c[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minLng = Math.min(minLng, x); maxLng = Math.max(maxLng, x);
    minLat = Math.min(minLat, y); maxLat = Math.max(maxLat, y);
  }
  function walk(coords){
    if (!coords) return;
    if (typeof coords[0] === "number") { push(coords); return; }
    coords.forEach(walk);
  }

  if (gj?.type === "FeatureCollection") gj.features?.forEach(f => walk(f?.geometry?.coordinates));
  else if (gj?.type === "Feature") walk(gj?.geometry?.coordinates);
  else walk(gj?.coordinates);

  if (!Number.isFinite(minLng)) return null;
  return [[minLng,minLat],[maxLng,maxLat]];
}

function mergeBounds(a,b){
  if (!a) return b;
  if (!b) return a;
  return [
    [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])]
  ];
}

function addLayerFor(map, key){
  const m = META[key];
  if (!m) return;

  if (m.kind === "line"){
    map.addLayer({
      id: `${key}-line`,
      type: "line",
      source: key,
      paint: { "line-color": m.color, "line-width": 3, "line-opacity": 0.9 }
    });
  } else if (m.kind === "circle"){
    map.addLayer({
      id: `${key}-pts`,
      type: "circle",
      source: key,
      paint: {
        "circle-radius": 6,
        "circle-color": m.color,
        "circle-stroke-color": "rgba(0,0,0,.35)",
        "circle-stroke-width": 1.2,
        "circle-opacity": 0.95
      }
    });
  } else if (m.kind === "polygon"){
    map.addLayer({
      id: `${key}-fill`,
      type: "fill",
      source: key,
      paint: { "fill-color": m.color, "fill-opacity": 0.25 }
    });
    map.addLayer({
      id: `${key}-outline`,
      type: "line",
      source: key,
      paint: { "line-color": m.color, "line-width": 2, "line-opacity": 0.75 }
    });
  }
}

async function buildMap(el){
  const wanted = (el.dataset.layers || "walkways")
    .split(",").map(s => s.trim()).filter(Boolean);

  const map = new maplibregl.Map({
    container: el,
    style: makeStyle(),       // fresh per map
    center: [-117.213, 32.764],
    zoom: 14.5,
    pitch: 35,
    bearing: -10
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  map.on("load", async () => {
    let boundsAll = null;
    const legendItems = [];

    for (const key of wanted){
      const url = SOURCES[key];
      if (!url) continue;

      const gj = await fetchJSON(url);
      const b = geojsonBounds(gj);
      boundsAll = mergeBounds(boundsAll, b);

      map.addSource(key, { type: "geojson", data: gj });
      addLayerFor(map, key);

      const m = META[key];
      if (m) legendItems.push({ label: m.label, color: m.color });
    }

    const block = el.closest(".map-block");
    if (block) setLegend(block.querySelector("[data-legend]"), legendItems);

    if (boundsAll) map.fitBounds(boundsAll, { padding: 40, animate: false });

    requestAnimationFrame(() => map.resize());
    setTimeout(() => map.resize(), 120);
  });

  return map;
}

const maps = [...document.querySelectorAll("[data-map]")];
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    if (el._built) return;
    el._built = true;

    buildMap(el).catch(err => {
      console.error(err);
      el.innerHTML = `<div style="padding:14px;color:#94a3b8">Map failed to load. Check console.</div>`;
    });
  });
}, { threshold: 0.2 });

maps.forEach(el => io.observe(el));

const y = document.getElementById("y");
if (y) y.textContent = String(new Date().getFullYear());
