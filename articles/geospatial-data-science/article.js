/* ============================================================
   Geospatial Data Science — MapLibre Story Article
   - Data defaults to GitHub Releases (same as MyST used)
   - Hover tooltips show feature attributes
   - Auto-fit bounds per map
   - Lazy init maps when visible
   ============================================================ */

/** 1) DATA SWITCH
 * Default: GitHub Releases (as used in MyST)
 * Optional local override: add ?data=local to URL
 */
const RELEASE_BASE = "https://github.com/mohamadyassin/myst_airc/releases/download/data/";
const LOCAL_BASE   = "/data/geospatial-data-science/";

function getDataBase(){
  const u = new URL(window.location.href);
  const mode = (u.searchParams.get("data") || "").toLowerCase();
  return mode === "local" ? LOCAL_BASE : RELEASE_BASE;
}

const DATA_BASE = getDataBase();

/** 2) FILE NAMES
 * These match the MyST release names shown in your MyST page. :contentReference[oaicite:18]{index=18}
 * If you ever rename assets in the release, update here only.
 */
const SOURCES = {
  walkways:  `${DATA_BASE}Walkways.geojson`,
  nodes:     `${DATA_BASE}Nodes.geojson`,
  poi:       `${DATA_BASE}PointsofInterest.geojson`,
  events:    `${DATA_BASE}StadiumsandEncounters.geojson`,
  rides:     `${DATA_BASE}Rides_JSON.geojson`,
  fnb:       `${DATA_BASE}FoodandBeverage.geojson`,
  restrooms: `${DATA_BASE}Restrooms.geojson`,
};

// Esri World Imagery basemap for MapLibre
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
    layers: [{ id: "esri", type: "raster", source: "esri" }]
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

function setLegend(legendEl, keys){
  if (!legendEl) return;
  const body = legendEl.querySelector(".map-legend-body");
  if (!body) return;
  body.innerHTML = "";
  keys.forEach(k => {
    const m = META[k];
    if (!m) return;
    const row = document.createElement("div");
    row.className = "legend-row";
    row.innerHTML = `<span class="swatch" style="background:${m.color}"></span><span>${m.label}</span>`;
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

function layerIdsForKey(key){
  // return all layer IDs that we create for a given dataset (used for hover binding)
  const m = META[key];
  if (!m) return [];
  if (m.kind === "line") return [`${key}-line`];
  if (m.kind === "circle") return [`${key}-pts`];
  if (m.kind === "polygon") return [`${key}-fill`, `${key}-outline`];
  return [];
}

function addLayers(map, key){
  const m = META[key];
  if (!m) return;

  if (m.kind === "line"){
    map.addLayer({
      id: `${key}-line`,
      type: "line",
      source: key,
      paint: { "line-color": m.color, "line-width": 3.0, "line-opacity": 0.9 }
    });
    return;
  }

  if (m.kind === "circle"){
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
    return;
  }

  if (m.kind === "polygon"){
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
      paint: { "line-color": m.color, "line-width": 2.0, "line-opacity": 0.75 }
    });
  }
}

/* =========================
   Hover tooltip
   ========================= */
function createHoverEl(mapEl){
  // prefer a hover element inside the same map frame
  const frame = mapEl.closest(".map-frame");
  const hover = frame ? frame.querySelector("[data-hover]") : null;
  return hover || null;
}

function formatProps(props){
  // hide noisy fields
  const skip = new Set(["OBJECTID", "Shape__Length", "Shape__Area"]);
  const entries = Object.entries(props || {})
    .filter(([k,v]) => v !== null && v !== "" && typeof v !== "object" && !skip.has(k));

  // show first 10 rows to keep it clean
  return entries.slice(0, 10);
}

function bindHover(map, mapEl, hoverKeys){
  const hoverEl = createHoverEl(mapEl);
  if (!hoverEl) return;

  const hoverLayerIds = hoverKeys.flatMap(layerIdsForKey);

  function hide(){
    hoverEl.hidden = true;
    hoverEl.innerHTML = "";
    map.getCanvas().style.cursor = "";
  }

  function showAt(point, feature){
    const props = feature?.properties || {};
    const rows = formatProps(props);

    const title = feature.layer?.id || "Feature";
    hoverEl.innerHTML = `
      <div class="title">${escapeHtml(title)}</div>
      ${rows.map(([k,v]) => `<div class="row"><b>${escapeHtml(k)}</b><span>${escapeHtml(String(v))}</span></div>`).join("")}
      ${rows.length === 0 ? `<div class="row"><span class="muted">No attributes found.</span></div>` : ""}
    `;

    // position within frame
    const frame = mapEl.closest(".map-frame") || mapEl.parentElement;
    const rect = frame.getBoundingClientRect();

    const pad = 12;
    const x = Math.min(rect.width - pad, Math.max(pad, point.x));
    const y = Math.min(rect.height - pad, Math.max(pad, point.y));

    hoverEl.style.left = `${x + 14}px`;
    hoverEl.style.top  = `${y + 14}px`;
    hoverEl.hidden = false;
    map.getCanvas().style.cursor = "pointer";
  }

  map.on("mousemove", (e) => {
    const feats = map.queryRenderedFeatures(e.point, { layers: hoverLayerIds });
    if (!feats || feats.length === 0) return hide();
    showAt(e.point, feats[0]);
  });

  map.on("mouseleave", () => hide());
  map.on("dragstart", () => hide());
  map.on("zoomstart", () => hide());
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

/* =========================
   Build map
   ========================= */
async function buildMap(mapEl){
  const wanted = (mapEl.dataset.layers || "walkways")
    .split(",").map(s => s.trim()).filter(Boolean);

  const map = new maplibregl.Map({
    container: mapEl,
    style: makeStyle(),              // fresh style per map
    center: [-117.213, 32.764],      // fallback
    zoom: 15,
    pitch: 35,
    bearing: -10,
    attributionControl: true
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  map.on("load", async () => {
    let boundsAll = null;

    // load datasets
    for (const key of wanted){
      const url = SOURCES[key];
      if (!url) continue;

      const gj = await fetchJSON(url);
      const b = geojsonBounds(gj);
      boundsAll = mergeBounds(boundsAll, b);

      map.addSource(key, { type: "geojson", data: gj });
      addLayers(map, key);
    }

    // legend only for the big map-block
    const block = mapEl.closest(".map-block");
    if (block){
      const legendEl = block.querySelector("[data-legend]");
      if (legendEl) setLegend(legendEl, wanted);
    }

    // camera fit
    if (boundsAll){
      map.fitBounds(boundsAll, { padding: 40, animate: false });
    }

    // hover bindings
    bindHover(map, mapEl, wanted);

    // embedded resize stability
    requestAnimationFrame(() => map.resize());
    setTimeout(() => map.resize(), 120);
  });

  return map;
}

/* =========================
   Lazy init maps
   ========================= */
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

// Footer year
const y = document.getElementById("y");
if (y) y.textContent = String(new Date().getFullYear());
