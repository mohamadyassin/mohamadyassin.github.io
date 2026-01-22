/* ============================================================
   Geospatial Data Science — MapLibre maps (multi-map page)
   - Loads GeoJSON from ./data/
   - Uses Esri World Imagery raster tiles as basemap
   - Auto-fit bounds per map
   - Hover popup shows attributes
   - Legend per map
   ============================================================ */

   (() => {
    const yearEl = document.getElementById("y");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  
    // IMPORTANT:
    // This assumes your GeoJSON files are here:
    // /articles/geospatial-data-science/data/<FILE>.geojson
    // and you are visiting via https://mohamadyassin.com/articles/geospatial-data-science/
    //
    // If you open index.html via file:// locally, fetch() will fail.
    // Test locally with: python3 -m http.server (then open http://localhost:8000)
  
    const ESRI_WORLD_IMAGERY_TILES =
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  
    // Helper: safe URL resolve relative to this article page
    function rel(url) {
      return new URL(url, window.location.href).toString();
    }
  
    // Helper: bounds from GeoJSON
    function bboxFromGeoJSON(gj) {
      // returns [minX, minY, maxX, maxY]
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
      function scanCoords(coords) {
        if (!coords) return;
        if (typeof coords[0] === "number" && typeof coords[1] === "number") {
          const x = coords[0], y = coords[1];
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          return;
        }
        for (const c of coords) scanCoords(c);
      }
  
      const feats = (gj && gj.features) ? gj.features : [];
      for (const f of feats) {
        if (f && f.geometry) scanCoords(f.geometry.coordinates);
      }
  
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        return null;
      }
      return [minX, minY, maxX, maxY];
    }
  
    function addLegend(map, items) {
      const el = document.createElement("div");
      el.className = "legend";
      el.innerHTML = `
        <div class="legend-title">Legend</div>
        ${items.map(it => `
          <div class="legend-item">
            <span class="legend-swatch" style="background:${it.color};"></span>
            <span>${it.label}</span>
          </div>
        `).join("")}
      `;
      map.getContainer().appendChild(el);
    }
  
    function formatPopupProps(props) {
      if (!props) return "<div class='popup-title'>Feature</div><div class='popup-row'><span class='popup-val'>No attributes</span></div>";
  
      const keys = Object.keys(props)
        .filter(k => props[k] !== null && props[k] !== undefined && String(props[k]).trim() !== "")
        .slice(0, 14);
  
      const title = props.Name || props.name || props.TITLE || props.Title || props.ID || "Feature";
  
      const rows = keys
        .filter(k => !["Shape__Length", "Shape__Area"].includes(k))
        .map(k => `
          <div class="popup-row">
            <span class="popup-key">${k}</span>
            <span class="popup-val">${String(props[k])}</span>
          </div>
        `).join("");
  
      return `<div class="popup-title">${String(title)}</div>${rows || "<div class='popup-row'><span class='popup-val'>No attributes</span></div>"}`;
    }
  
    async function fetchGeoJSON(url) {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`Failed to fetch ${url} (${r.status})`);
      return await r.json();
    }
  
    async function buildMap({
      containerId,
      geojsonLayers,   // [{ id, label, url, kind, paint }]
      legendItems,     // [{ label, color }]
      fitPadding = 40
    }) {
      const el = document.getElementById(containerId);
      if (!el) return;
  
      // Create map
      const map = new maplibregl.Map({
        container: containerId,
        style: {
          version: 8,
          sources: {
            "esri-imagery": {
              type: "raster",
              tiles: [ESRI_WORLD_IMAGERY_TILES],
              tileSize: 256,
              attribution: "Tiles © Esri"
            }
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": "#0b1020" } },
            { id: "imagery", type: "raster", source: "esri-imagery" }
          ]
        },
        center: [-117.155, 32.763], // fallback
        zoom: 16,
        cooperativeGestures: true
      });
  
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: "320px"
      });
  
      map.on("load", async () => {
        // Load all geojson first (so we can fit bounds across all layers for that map)
        const loaded = [];
  
        for (const L of geojsonLayers) {
          const url = rel(L.url);
          const gj = await fetchGeoJSON(url);
  
          const sourceId = `src-${containerId}-${L.id}`;
          map.addSource(sourceId, { type: "geojson", data: gj });
  
          const layerId = `lyr-${containerId}-${L.id}`;
  
          if (L.kind === "line") {
            map.addLayer({
              id: layerId,
              type: "line",
              source: sourceId,
              paint: {
                "line-color": L.paint?.color ?? "#39ff14",
                "line-width": L.paint?.width ?? 3,
                "line-opacity": L.paint?.opacity ?? 0.9
              }
            });
          } else if (L.kind === "fill") {
            map.addLayer({
              id: layerId,
              type: "fill",
              source: sourceId,
              paint: {
                "fill-color": L.paint?.color ?? "#60a5fa",
                "fill-opacity": L.paint?.opacity ?? 0.25,
                "fill-outline-color": L.paint?.outline ?? "rgba(226,232,240,.35)"
              }
            });
          } else {
            // point
            map.addLayer({
              id: layerId,
              type: "circle",
              source: sourceId,
              paint: {
                "circle-color": L.paint?.color ?? "#fbbf24",
                "circle-radius": L.paint?.radius ?? 5,
                "circle-opacity": L.paint?.opacity ?? 0.9,
                "circle-stroke-color": L.paint?.stroke ?? "rgba(226,232,240,.35)",
                "circle-stroke-width": L.paint?.strokeWidth ?? 1
              }
            });
          }
  
          // Hover popup
          map.on("mousemove", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const f = e.features && e.features[0];
            if (!f) return;
  
            popup
              .setLngLat(e.lngLat)
              .setHTML(formatPopupProps(f.properties))
              .addTo(map);
          });
  
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });
  
          loaded.push(gj);
        }
  
        // Fit bounds across all layers in this map
        let bounds = null;
        for (const gj of loaded) {
          const b = bboxFromGeoJSON(gj);
          if (!b) continue;
          if (!bounds) bounds = b;
          else {
            bounds = [
              Math.min(bounds[0], b[0]),
              Math.min(bounds[1], b[1]),
              Math.max(bounds[2], b[2]),
              Math.max(bounds[3], b[3])
            ];
          }
        }
  
        if (bounds) {
          map.fitBounds(
            [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
            { padding: fitPadding, duration: 700 }
          );
        }
  
        if (legendItems && legendItems.length) {
          addLegend(map, legendItems);
        }
      });
  
      map.on("error", (e) => {
        console.error("MapLibre error:", e?.error || e);
        // Simple inline message for the user if something breaks
        if (el && !el.dataset.failed) {
          el.dataset.failed = "1";
          const msg = document.createElement("div");
          msg.style.position = "absolute";
          msg.style.inset = "0";
          msg.style.display = "flex";
          msg.style.alignItems = "center";
          msg.style.justifyContent = "center";
          msg.style.textAlign = "center";
          msg.style.padding = "18px";
          msg.style.color = "rgba(226,232,240,.85)";
          msg.style.background = "rgba(15,23,42,.55)";
          msg.style.borderRadius = "16px";
          msg.textContent = "Map failed to load. Check console + confirm data paths under ./data/ and filename casing.";
          el.appendChild(msg);
        }
      });
    }
  
    // ---- MAP DEFINITIONS (match your filenames EXACTLY) ----
    // Your folder screenshot shows:
    // Walkways.geojson
    // StadiumsandEncounters.geojson
    // Rides_JSON.geojson
    // Restrooms.geojson
    // PointsofInterest.geojson
    // Nodes.geojson
    // FoodandBeverage.geojson
    //
    // NOTE: These are case-sensitive on GitHub Pages.
  
    const FILES = {
      walkways: "./data/Walkways.geojson",
      nodes: "./data/Nodes.geojson",
      poi: "./data/PointsofInterest.geojson",
      stadiums: "./data/StadiumsandEncounters.geojson",
      rides: "./data/Rides_JSON.geojson",
      restrooms: "./data/Restrooms.geojson",
      food: "./data/FoodandBeverage.geojson"
    };
  
    // Build maps
    buildMap({
      containerId: "map-overview",
      geojsonLayers: [
        { id: "stadiums", label: "Stadiums & Encounters", url: FILES.stadiums, kind: "fill", paint: { color: "#60a5fa", opacity: 0.20, outline: "rgba(226,232,240,.28)" } },
        { id: "walkways", label: "Walkways", url: FILES.walkways, kind: "line", paint: { color: "#39ff14", width: 3, opacity: 0.95 } },
        { id: "nodes", label: "Nodes", url: FILES.nodes, kind: "point", paint: { color: "#fbbf24", radius: 4 } }
      ],
      legendItems: [
        { label: "Stadiums & Encounters", color: "#60a5fa" },
        { label: "Walkways", color: "#39ff14" },
        { label: "Nodes", color: "#fbbf24" }
      ]
    });
  
    buildMap({
      containerId: "map-walkways",
      geojsonLayers: [
        { id: "walkways", label: "Walkways", url: FILES.walkways, kind: "line", paint: { color: "#39ff14", width: 4, opacity: 0.95 } }
      ],
      legendItems: [{ label: "Walkways", color: "#39ff14" }]
    });
  
    buildMap({
      containerId: "map-nodes",
      geojsonLayers: [
        { id: "nodes", label: "Nodes", url: FILES.nodes, kind: "point", paint: { color: "#fbbf24", radius: 5 } }
      ],
      legendItems: [{ label: "Nodes", color: "#fbbf24" }]
    });
  
    buildMap({
      containerId: "map-poi",
      geojsonLayers: [
        { id: "poi", label: "Points of Interest", url: FILES.poi, kind: "point", paint: { color: "#a78bfa", radius: 6 } }
      ],
      legendItems: [{ label: "POI", color: "#a78bfa" }]
    });
  
    buildMap({
      containerId: "map-stadiums",
      geojsonLayers: [
        { id: "stadiums", label: "Stadiums & Encounters", url: FILES.stadiums, kind: "fill", paint: { color: "#60a5fa", opacity: 0.22, outline: "rgba(226,232,240,.30)" } }
      ],
      legendItems: [{ label: "Stadiums & Encounters", color: "#60a5fa" }]
    });
  
    buildMap({
      containerId: "map-restrooms",
      geojsonLayers: [
        { id: "restrooms", label: "Restrooms", url: FILES.restrooms, kind: "point", paint: { color: "#22c55e", radius: 6 } }
      ],
      legendItems: [{ label: "Restrooms", color: "#22c55e" }]
    });
  
    buildMap({
      containerId: "map-rides",
      geojsonLayers: [
        { id: "rides", label: "Rides", url: FILES.rides, kind: "point", paint: { color: "#fb7185", radius: 6 } }
      ],
      legendItems: [{ label: "Rides", color: "#fb7185" }]
    });
  
    buildMap({
      containerId: "map-food",
      geojsonLayers: [
        { id: "food", label: "Food & Beverage", url: FILES.food, kind: "point", paint: { color: "#f97316", radius: 6 } }
      ],
      legendItems: [{ label: "Food & Beverage", color: "#f97316" }]
    });
  
  })();
  