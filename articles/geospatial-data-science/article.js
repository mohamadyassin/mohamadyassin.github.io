/* ============================================================
   Geospatial Data Science — MapLibre Story Article (Stable)
   - PRIMARY: repo-hosted GeoJSON (works with GitHub Pages)
   - FALLBACK: GitHub Release URLs (validated as real JSON)
   - Hover tooltips for attributes
   - Auto-fit bounds per map
   - Lazy init maps when visible
   ============================================================ */

   const REPO_BASE    = "/data/geospatial-data-science/";
   const RELEASE_BASE = "https://github.com/mohamadyassin/myst_airc/releases/download/data/"; // MyST pattern :contentReference[oaicite:17]{index=17}
   
   const FILES = {
     walkways:  "Walkways.geojson",
     nodes:     "Nodes.geojson",
     poi:       "PointsofInterest.geojson",
     events:    "StadiumsandEncounters.geojson",
     rides:     "Rides_JSON.geojson",
     fnb:       "FoodandBeverage.geojson",
     restrooms: "Restrooms.geojson",
   };
   
   const META = {
     walkways:  { label:"Walkways",            color:"#7CFF6B", kind:"line" },
     nodes:     { label:"Nodes",               color:"#FDE047", kind:"circle" },
     poi:       { label:"POI",                 color:"#60A5FA", kind:"circle" },
     events:    { label:"Stadiums/Encounters", color:"#F472B6", kind:"polygon" },
     rides:     { label:"Rides",               color:"#FB7185", kind:"circle" },
     fnb:       { label:"Food & Beverage",     color:"#34D399", kind:"circle" },
     restrooms: { label:"Restrooms",           color:"#A78BFA", kind:"circle" },
   };
   
   // Esri World Imagery basemap
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
   
   /* ---------- Robust GeoJSON fetch ----------
      - Always try REPO first (fast + reliable on GitHub Pages)
      - Then try RELEASE
      - Validate "looks like JSON" before accepting
   ------------------------------------------ */
   
   async function fetchText(url){
     const r = await fetch(url, { cache: "no-store" });
     if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
     return r.text();
   }
   
   function looksLikeJson(text){
     const s = (text || "").trim();
     return s.startsWith("{") || s.startsWith("[");
   }
   
   async function fetchGeoJSONSmart(key){
     const fname = FILES[key];
     if (!fname) throw new Error(`Unknown dataset key: ${key}`);
   
     const repoURL = `${REPO_BASE}${fname}`;
     const relURL  = `${RELEASE_BASE}${fname}`;
   
     // 1) Repo first (stable)
     try {
       const t = await fetchText(repoURL);
       if (!looksLikeJson(t)) throw new Error("Repo content not JSON");
       return JSON.parse(t);
     } catch (e) {
       console.warn("Repo fetch failed, will try release:", key, e);
     }
   
     // 2) Release fallback (validated)
     const t2 = await fetchText(relURL);
     if (!looksLikeJson(t2)) {
       throw new Error(`Release did not return JSON for ${key}. It returned non-JSON content.`);
     }
     return JSON.parse(t2);
   }
   
   /* ---------- Bounds helpers ---------- */
   
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
   
   /* ---------- Layers ---------- */
   
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
   
   function layerIdsForKey(key){
     const m = META[key];
     if (!m) return [];
     if (m.kind === "line") return [`${key}-line`];
     if (m.kind === "circle") return [`${key}-pts`];
     if (m.kind === "polygon") return [`${key}-fill`, `${key}-outline`];
     return [];
   }
   
   /* ---------- Legend ---------- */
   
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
   
   /* ---------- Hover tooltip ---------- */
   
   function escapeHtml(s){
     return String(s).replace(/[&<>"']/g, (c) => ({
       "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
     }[c]));
   }
   
   function formatProps(props){
     const skip = new Set(["OBJECTID", "Shape__Length", "Shape__Area"]);
     const entries = Object.entries(props || {})
       .filter(([k,v]) => v !== null && v !== "" && typeof v !== "object" && !skip.has(k));
     return entries.slice(0, 12);
   }
   
   function findHoverEl(mapEl){
     // Prefer the closest hover box in this block
     const frame = mapEl.closest(".map-frame");
     if (frame) {
       const h = frame.querySelector("[data-hover]");
       if (h) return h;
     }
     // For inline maps: hover is sibling inside .map-inline
     const inline = mapEl.closest(".map-inline");
     if (inline) {
       const h2 = inline.querySelector("[data-hover]");
       if (h2) return h2;
     }
     return null;
   }
   
   function bindHover(map, mapEl, keys){
     const hoverEl = findHoverEl(mapEl);
     if (!hoverEl) return;
   
     const hoverLayers = keys.flatMap(layerIdsForKey);
   
     function hide(){
       hoverEl.hidden = true;
       hoverEl.innerHTML = "";
       map.getCanvas().style.cursor = "";
     }
   
     function show(point, feature){
       const props = feature?.properties || {};
       const rows = formatProps(props);
   
       hoverEl.innerHTML = `
         <div class="title">${escapeHtml(META_FROM_LAYER(feature.layer?.id))}</div>
         ${rows.map(([k,v]) =>
           `<div class="row"><b>${escapeHtml(k)}</b><span>${escapeHtml(v)}</span></div>`
         ).join("")}
         ${rows.length ? "" : `<div class="row"><span class="muted">No attributes found.</span></div>`}
       `;
   
       const host = mapEl.closest(".map-frame") || mapEl.closest(".map-inline") || mapEl.parentElement;
       const rect = host.getBoundingClientRect();
   
       const pad = 10;
       const x = Math.min(rect.width - pad, Math.max(pad, point.x));
       const y = Math.min(rect.height - pad, Math.max(pad, point.y));
   
       hoverEl.style.left = `${x + 14}px`;
       hoverEl.style.top  = `${y + 14}px`;
       hoverEl.hidden = false;
       map.getCanvas().style.cursor = "pointer";
     }
   
     map.on("mousemove", (e) => {
       const feats = map.queryRenderedFeatures(e.point, { layers: hoverLayers });
       if (!feats || feats.length === 0) return hide();
       show(e.point, feats[0]);
     });
   
     map.on("mouseleave", hide);
     map.on("dragstart", hide);
     map.on("zoomstart", hide);
   }
   
   function META_FROM_LAYER(layerId){
     // Turn "walkways-line" -> "Walkways"
     if (!layerId) return "Feature";
     const key = layerId.split("-")[0];
     return META[key]?.label || "Feature";
   }
   
   /* ---------- Build a map ---------- */
   
   async function buildMap(mapEl){
     const keys = (mapEl.dataset.layers || "walkways")
       .split(",").map(s => s.trim()).filter(Boolean);
   
     const map = new maplibregl.Map({
       container: mapEl,
       style: makeStyle(),
       center: [-117.213, 32.764],
       zoom: 15,
       pitch: 35,
       bearing: -10
     });
   
     map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
   
     map.on("load", async () => {
       let boundsAll = null;
   
       for (const key of keys){
         const gj = await fetchGeoJSONSmart(key);
         const b = geojsonBounds(gj);
         boundsAll = mergeBounds(boundsAll, b);
   
         map.addSource(key, { type: "geojson", data: gj });
         addLayers(map, key);
       }
   
       const block = mapEl.closest(".map-block");
       if (block){
         const legendEl = block.querySelector("[data-legend]");
         if (legendEl) setLegend(legendEl, keys);
       }
   
       if (boundsAll){
         map.fitBounds(boundsAll, { padding: 40, animate: false });
       }
   
       bindHover(map, mapEl, keys);
   
       requestAnimationFrame(() => map.resize());
       setTimeout(() => map.resize(), 120);
     });
   
     return map;
   }
   
   /* ---------- Lazy init ---------- */
   
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
   