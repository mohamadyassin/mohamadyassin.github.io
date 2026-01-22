/* ============================================================
   Embedded Leaflet Maps (Folium-style)
   - Basemap: Esri World Imagery (like your MyST/Folium examples)
   - Loads GeoJSON from /data/geospatial-data-science/
   - If GeoJSON coordinates look like EPSG:3857 (meters),
     reproject to EPSG:4326 (lon/lat) client-side via proj4.
   - Auto-fit bounds to loaded layers
   ============================================================ */

   const DATA_DIR = "/data/geospatial-data-science/";

   // Esri World Imagery tiles (Leaflet)
   const ESRI_IMAGERY = L.tileLayer(
     "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
     { maxZoom: 20, attribution: "Tiles © Esri" }
   );
   
   // layer registry (style + file names)
   const LAYERS = {
     walkways:  { file: "Walkways.geojson",              kind: "line",    color: "#7CFF6B" },
     nodes:     { file: "Nodes.geojson",                 kind: "circle",  color: "#FDE047" },
     poi:       { file: "PointsofInterest.geojson",      kind: "circle",  color: "#60A5FA" },
     events:    { file: "StadiumsandEncounters.geojson", kind: "polygon", color: "#F472B6" },
     rides:     { file: "Rides_JSON.geojson",            kind: "circle",  color: "#FB7185" },
     fnb:       { file: "FoodandBeverage.geojson",       kind: "circle",  color: "#34D399" },
     restrooms: { file: "Restrooms.geojson",             kind: "circle",  color: "#A78BFA" },
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
     if (!r.ok) throw new Error(`Failed ${url}: ${r.status}`);
     return r.json();
   }
   
   // Compute bounds and detect if coordinates look projected
   function geojsonBoundsAndMaxAbs(gj){
     let minLng=Infinity, minLat=Infinity, maxLng=-Infinity, maxLat=-Infinity;
     let maxAbs = 0;
   
     function pushCoord(c){
       const x = c[0], y = c[1];
       if (!Number.isFinite(x) || !Number.isFinite(y)) return;
       maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
       minLng = Math.min(minLng, x); maxLng = Math.max(maxLng, x);
       minLat = Math.min(minLat, y); maxLat = Math.max(maxLat, y);
     }
     function walk(coords){
       if (!coords) return;
       if (typeof coords[0] === "number") { pushCoord(coords); return; }
       coords.forEach(walk);
     }
   
     if (gj?.type === "FeatureCollection") gj.features?.forEach(f => walk(f?.geometry?.coordinates));
     else if (gj?.type === "Feature") walk(gj?.geometry?.coordinates);
     else walk(gj?.coordinates);
   
     if (!Number.isFinite(minLng)) return { bounds: null, maxAbs: 0 };
     return { bounds: [[minLng, minLat],[maxLng, maxLat]], maxAbs };
   }
   
   // Reproject GeoJSON coordinates from EPSG:3857 -> EPSG:4326
   // Leaflet wants 4326-ish GeoJSON (lon/lat)
   function reproject3857to4326(gj){
     const from = proj4("EPSG:3857");
     const to   = proj4("EPSG:4326");
   
     function mapCoord(c){
       const p = proj4(from, to, [c[0], c[1]]);
       return [p[0], p[1]];
     }
   
     function walk(coords){
       if (!coords) return coords;
       if (typeof coords[0] === "number") return mapCoord(coords);
       return coords.map(walk);
     }
   
     // deep copy minimal
     if (gj.type === "FeatureCollection"){
       return {
         type: "FeatureCollection",
         features: gj.features.map(f => ({
           ...f,
           geometry: f.geometry ? { ...f.geometry, coordinates: walk(f.geometry.coordinates) } : f.geometry
         }))
       };
     }
     if (gj.type === "Feature"){
       return {
         ...gj,
         geometry: gj.geometry ? { ...gj.geometry, coordinates: walk(gj.geometry.coordinates) } : gj.geometry
       };
     }
     return { ...gj, coordinates: walk(gj.coordinates) };
   }
   
   function styleFor(kind, color){
     if (kind === "line"){
       return { color, weight: 4, opacity: 0.9 };
     }
     if (kind === "polygon"){
       return { color, weight: 2, opacity: 0.8, fillColor: color, fillOpacity: 0.25 };
     }
     return { color };
   }
   
   function pointToLayerFactory(kind, color){
     if (kind !== "circle") return undefined;
     return (feature, latlng) => L.circleMarker(latlng, {
       radius: 6,
       color: "rgba(0,0,0,.35)",
       weight: 1.2,
       fillColor: color,
       fillOpacity: 0.95
     });
   }
   
   async function buildLeafletMap(el){
     const wanted = (el.dataset.layers || "walkways")
       .split(",").map(s => s.trim()).filter(Boolean);
   
     // Create map
     const map = L.map(el, {
       zoomControl: true,
       attributionControl: true
     });
   
     ESRI_IMAGERY.addTo(map);
   
     const legendItems = [];
     const group = L.featureGroup().addTo(map);
   
     for (const key of wanted){
       const meta = LAYERS[key];
       if (!meta) continue;
   
       const url = DATA_DIR + meta.file;
       let gj = await fetchJSON(url);
   
       // Detect projected coordinates
       const { bounds, maxAbs } = geojsonBoundsAndMaxAbs(gj);
       // If huge numbers, it’s probably meters (EPSG:3857)
       if (maxAbs > 400){
         gj = reproject3857to4326(gj);
       }
   
       const layer = L.geoJSON(gj, {
         style: () => styleFor(meta.kind, meta.color),
         pointToLayer: pointToLayerFactory(meta.kind, meta.color),
       });
   
       layer.addTo(group);
       legendItems.push({ label: metaLabel(key), color: meta.color });
     }
   
     // Fit to data
     const b = group.getBounds();
     if (b.isValid()){
       map.fitBounds(b, { padding: [30, 30] });
     } else {
       // fallback center (SeaWorld-ish)
       map.setView([32.764, -117.213], 15);
     }
   
     // Legend only for big map-blocks
     const block = el.closest(".map-block");
     if (block){
       const legendEl = block.querySelector("[data-legend]");
       setLegend(legendEl, legendItems);
     }
   
     // Fix sizing glitches when created in a flowing layout
     setTimeout(() => map.invalidateSize(true), 50);
     return map;
   }
   
   function metaLabel(key){
     if (key === "walkways") return "Walkways";
     if (key === "nodes") return "Nodes";
     if (key === "poi") return "POI";
     if (key === "events") return "Stadiums/Encounters";
     if (key === "rides") return "Rides";
     if (key === "fnb") return "Food & Beverage";
     if (key === "restrooms") return "Restrooms";
     return key;
   }
   
   // Lazy init when visible
   const els = [...document.querySelectorAll("[data-map]")];
   const io = new IntersectionObserver((entries) => {
     entries.forEach(async (e) => {
       if (!e.isIntersecting) return;
       const el = e.target;
       if (el._built) return;
       el._built = true;
   
       try {
         await buildLeafletMap(el);
       } catch (err){
         console.error(err);
         el.innerHTML = `<div style="padding:14px;color:#94a3b8">
           Map failed to load. Check console.
         </div>`;
       }
     });
   }, { threshold: 0.2 });
   
   els.forEach(el => io.observe(el));
   
   // Footer year
   const y = document.getElementById("y");
   if (y) y.textContent = String(new Date().getFullYear());
   