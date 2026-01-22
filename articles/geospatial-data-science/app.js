(() => {
  const YEAR_EL = document.getElementById("y");
  if (YEAR_EL) YEAR_EL.textContent = new Date().getFullYear();

  // ============================================================
  // DATA SOURCES (GitHub Pages is CASE-SENSITIVE)
  // ============================================================
  const DATA_SOURCES = {
    walkways: { repo: "./data/Walkways.geojson", release: null },
    nodes:    { repo: "./data/Nodes.geojson", release: null },
    poi:      { repo: "./data/PointsofInterest.geojson", release: null },
    stadiums: { repo: "./data/StadiumsandEncounters.geojson", release: null },
    restrooms:{ repo: "./data/Restrooms.geojson", release: null },
    rides:    { repo: "./data/Rides_JSON.geojson", release: null },
    food:     { repo: "./data/FoodandBeverage.geojson", release: null },
  };

  // ============================================================
  // MAP STYLE (Esri imagery via raster tiles)
  // ============================================================
  const ESRI_IMAGERY = {
    version: 8,
    sources: {
      esri: {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles © Esri",
      },
    },
    layers: [{ id: "esri", type: "raster", source: "esri" }],
  };

  // ============================================================
  // STORYMAP CARTOGRAPHY PRESETS
  // (These control what layers appear on each map + symbology)
  // ============================================================
  const MAP_PRESETS = {
    // Base Map (imagery only) — if you ever add a base-only map block:
    base: {
      layers: ["esri_only"],
      legend: [{ label: "Imagery", swatch: "rgba(255,255,255,.15)" }],
    },

    // Your HTML uses data-map-id values: walkways, nodes, poi, stadiums, restrooms, rides, food
    walkways: {
      layers: ["walkways"],
      legend: [
        { label: "Walkways", swatch: "#39ff14" },
      ],
    },

    nodes: {
      layers: ["walkways", "nodes"],
      legend: [
        { label: "Walkways", swatch: "#39ff14" },
        { label: "Nodes", swatch: "#ffd84a" },
      ],
    },

    poi: {
      layers: ["stadiums", "walkways", "nodes", "poi"],
      legend: [
        { label: "Encounters (polygons)", swatch: "rgba(255,105,180,.30)" },
        { label: "Walkways", swatch: "#39ff14" },
        { label: "Nodes", swatch: "#ffd84a" },
        { label: "POI: Landmark", swatch: "#ffffff" },
        { label: "POI: Smoking", swatch: "rgba(0,0,0,.85)" },
        { label: "POI: Vehicle/Parking", swatch: "#ffffff" },
        { label: "POI: Customer Service", swatch: "rgba(128,0,128,.85)" },
      ],
    },

    stadiums: {
      layers: ["stadiums", "walkways", "nodes", "poi"],
      legend: [
        { label: "Encounters (polygons)", swatch: "rgba(255,105,180,.30)" },
        { label: "Walkways", swatch: "#39ff14" },
        { label: "Nodes", swatch: "#ffd84a" },
        { label: "POI", swatch: "rgba(255,255,255,.2)" },
      ],
    },

    restrooms: {
      layers: ["stadiums", "walkways", "nodes", "poi", "restrooms"],
      legend: [
        { label: "Encounters (polygons)", swatch: "rgba(255,105,180,.30)" },
        { label: "Walkways", swatch: "#39ff14" },
        { label: "Nodes", swatch: "#ffd84a" },
        { label: "Restrooms", swatch: "#3b82f6" },
        { label: "POI", swatch: "rgba(255,255,255,.2)" },
      ],
    },

    rides: {
      layers: ["stadiums", "walkways", "nodes", "poi", "rides"],
      legend: [
        { label: "Encounters (polygons)", swatch: "rgba(255,105,180,.30)" },
        { label: "Walkways", swatch: "#39ff14" },
        { label: "Nodes", swatch: "#ffd84a" },
        { label: "Rides", swatch: "#ff69b4" },
        { label: "POI", swatch: "rgba(255,255,255,.2)" },
      ],
    },

    food: {
      layers: ["stadiums", "walkways", "nodes", "poi", "food"],
      legend: [
        { label: "Encounters (polygons)", swatch: "rgba(255,105,180,.30)" },
        { label: "Walkways", swatch: "#39ff14" },
        { label: "Nodes", swatch: "#ffd84a" },
        { label: "Food & Beverage", swatch: "#7f1d1d" },
        { label: "POI", swatch: "rgba(255,255,255,.2)" },
      ],
    },
  };

  // ============================================================
  // HELPERS
  // ============================================================
  async function fetchGeoJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    const txt = await res.text();

    if (txt.trim().startsWith("<!doctype") || txt.includes("<html")) {
      throw new Error(`Not JSON (looks like HTML): ${url}`);
    }
    const json = JSON.parse(txt);
    const ok = json && json.type === "FeatureCollection" && Array.isArray(json.features);
    if (!ok) throw new Error(`Not a FeatureCollection GeoJSON: ${url}`);
    return json;
  }

  async function loadLayerData(layerKey) {
    const cfg = DATA_SOURCES[layerKey];
    if (!cfg) throw new Error(`Unknown layer key: ${layerKey}`);
    if (cfg.release) {
      try { return await fetchGeoJSON(cfg.release); }
      catch (e) { console.warn(`[${layerKey}] release failed, falling back to repo`, e); }
    }
    return await fetchGeoJSON(cfg.repo);
  }

  function bboxFromGeoJSON(fc) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const walk = (coords) => {
      if (!coords) return;
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        const x = coords[0], y = coords[1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      } else if (Array.isArray(coords)) {
        for (const c of coords) walk(c);
      }
    };

    for (const f of fc.features) {
      if (!f?.geometry) continue;
      walk(f.geometry.coordinates);
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
    return [minX, minY, maxX, maxY];
  }

  function fitToData(map, collections) {
    const boxes = collections.map(bboxFromGeoJSON).filter(Boolean);
    if (!boxes.length) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b[0]); minY = Math.min(minY, b[1]);
      maxX = Math.max(maxX, b[2]); maxY = Math.max(maxY, b[3]);
    }
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 50, duration: 600 });
  }

  function addLegend(el, items) {
    if (!el) return;
    const html = [
      `<div class="lg-title">Legend</div>`,
      ...items.map(i => `
        <div class="lg-item">
          <div class="lg-swatch" style="background:${i.swatch}"></div>
          <div>${escapeHtml(i.label)}</div>
        </div>
      `)
    ].join("");
    el.innerHTML = html;
  }

  function showHover(hoverEl, x, y, title, props, preferKeys) {
    if (!hoverEl) return;
    const keys = Object.keys(props || {});
    if (!keys.length) return;

    const order = [];
    for (const k of (preferKeys || [])) if (k in props) order.push(k);
    for (const k of keys) if (!order.includes(k)) order.push(k);

    const rows = order.slice(0, 10).map(k => {
      const v = props[k];
      if (v === null || v === undefined || v === "") return "";
      return `<div class="h-row"><div class="h-k">${escapeHtml(k)}</div><div>${escapeHtml(String(v))}</div></div>`;
    }).join("");

    hoverEl.innerHTML = `<div class="h-title">${escapeHtml(title)}</div>${rows}`;
    hoverEl.hidden = false;

    const pad = 14;
    hoverEl.style.left = `${x + pad}px`;
    hoverEl.style.top = `${y + pad}px`;
  }

  function hideHover(hoverEl) {
    if (!hoverEl) return;
    hoverEl.hidden = true;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  // ============================================================
  // ICON / CATEGORY MATCHING (based on your Folium examples)
  // ============================================================
  const POI_SETS = {
    landmark: new Set(["Security", "Sky Ride Tower"]),
    smoking: new Set(["Smoking Area"]),
    vehicle: new Set(["Disables Parking", "VIP Parking", "Park Entrance"]),
    service: new Set(["Guest Services / Lost & Found", "Sea Pixles", "Reservations"]),
  };

  function poiKindExpr() {
    // returns a MapLibre expression that classifies POI by Name
    // order matters
    return [
      "case",
      ["in", ["get","Name"], ["literal", Array.from(POI_SETS.landmark)]], "landmark",
      ["in", ["get","Name"], ["literal", Array.from(POI_SETS.smoking)]],  "smoking",
      ["in", ["get","Name"], ["literal", Array.from(POI_SETS.vehicle)]],  "vehicle",
      ["in", ["get","Name"], ["literal", Array.from(POI_SETS.service)]],  "service",
      "other"
    ];
  }

  // ============================================================
  // LAYER STYLES (StoryMap look)
  // ============================================================
  function addStadiums(map, srcId, layerIdBase) {
    // pink polygons under everything else
    map.addLayer({
      id: `${layerIdBase}_fill`,
      type: "fill",
      source: srcId,
      paint: {
        "fill-color": "rgba(255,105,180,.30)",
        "fill-outline-color": "rgba(255,105,180,.85)"
      }
    });
    map.addLayer({
      id: `${layerIdBase}_outline`,
      type: "line",
      source: srcId,
      paint: {
        "line-color": "rgba(255,105,180,.95)",
        "line-width": 2
      }
    });
    return [`${layerIdBase}_fill`, `${layerIdBase}_outline`];
  }

  function addWalkways(map, srcId, layerId) {
    map.addLayer({
      id: layerId,
      type: "line",
      source: srcId,
      paint: {
        "line-color": "#39ff14",
        "line-width": 6,
        "line-opacity": 0.95
      }
    });
    return [layerId];
  }

  function addNodes(map, srcId, layerId) {
    map.addLayer({
      id: layerId,
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": 6,
        "circle-color": "#ffd84a",
        "circle-stroke-color": "#ef4444",
        "circle-stroke-width": 2,
        "circle-opacity": 0.98
      }
    });
    return [layerId];
  }

  function addPOI(map, srcId, layerIdBase) {
    const kind = poiKindExpr();

    // background circle (matches your "icon on a badge" look)
    map.addLayer({
      id: `${layerIdBase}_badge`,
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": 12,
        "circle-color": [
          "match", kind,
          "landmark", "rgba(255,255,255,.92)",
          "smoking",  "rgba(0,0,0,.85)",
          "vehicle",  "rgba(255,255,255,.92)",
          "service",  "rgba(128,0,128,.85)",
          "rgba(255,255,255,.70)"
        ],
        "circle-stroke-color": [
          "match", kind,
          "landmark", "#ffffff",
          "smoking",  "#ff69b4",
          "vehicle",  "#2563eb",
          "service",  "#22c55e",
          "rgba(255,255,255,.65)"
        ],
        "circle-stroke-width": 3,
        "circle-opacity": 0.98
      }
    });

    // icon text layer
    map.addLayer({
      id: `${layerIdBase}_icon`,
      type: "symbol",
      source: srcId,
      layout: {
        "text-field": [
          "match", kind,
          "landmark", "⚠",
          "smoking",  "🚬",
          "vehicle",  "🚗",
          "service",  "❓",
          "•"
        ],
        "text-size": 16,
        "text-font": ["Noto Sans Regular","Open Sans Regular","Arial Unicode MS Regular"],
        "text-offset": [0, 0.05],
        "text-allow-overlap": true
      },
      paint: {
        "text-color": [
          "match", kind,
          "landmark", "#ef4444",
          "smoking",  "#ffffff",
          "vehicle",  "#2563eb",
          "service",  "#facc15",
          "#111827"
        ]
      }
    });

    return [`${layerIdBase}_badge`, `${layerIdBase}_icon`];
  }

  function addRestrooms(map, srcId, layerIdBase) {
    map.addLayer({
      id: `${layerIdBase}_badge`,
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": 12,
        "circle-color": "rgba(59,130,246,.92)",
        "circle-stroke-color": "rgba(37,99,235,1)",
        "circle-stroke-width": 3
      }
    });
    map.addLayer({
      id: `${layerIdBase}_icon`,
      type: "symbol",
      source: srcId,
      layout: {
        "text-field": "🚻",
        "text-size": 16,
        "text-font": ["Noto Sans Regular","Open Sans Regular","Arial Unicode MS Regular"],
        "text-allow-overlap": true
      },
      paint: { "text-color": "#0b1220" }
    });
    return [`${layerIdBase}_badge`, `${layerIdBase}_icon`];
  }

  function addRides(map, srcId, layerIdBase) {
    map.addLayer({
      id: `${layerIdBase}_badge`,
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": 12,
        "circle-color": "rgba(255,255,255,.92)",
        "circle-stroke-color": "rgba(0,0,0,.90)",
        "circle-stroke-width": 2
      }
    });
    map.addLayer({
      id: `${layerIdBase}_icon`,
      type: "symbol",
      source: srcId,
      layout: {
        "text-field": "🚀",
        "text-size": 16,
        "text-font": ["Noto Sans Regular","Open Sans Regular","Arial Unicode MS Regular"],
        "text-allow-overlap": true
      },
      paint: { "text-color": "#ff69b4" }
    });
    return [`${layerIdBase}_badge`, `${layerIdBase}_icon`];
  }

  function addFood(map, srcId, layerIdBase) {
    map.addLayer({
      id: `${layerIdBase}_badge`,
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": 12,
        "circle-color": "rgba(255,255,255,.92)",
        "circle-stroke-color": "rgba(0,0,0,.90)",
        "circle-stroke-width": 2
      }
    });
    map.addLayer({
      id: `${layerIdBase}_icon`,
      type: "symbol",
      source: srcId,
      layout: {
        "text-field": "🍴",
        "text-size": 16,
        "text-font": ["Noto Sans Regular","Open Sans Regular","Arial Unicode MS Regular"],
        "text-allow-overlap": true
      },
      paint: { "text-color": "#7f1d1d" }
    });
    return [`${layerIdBase}_badge`, `${layerIdBase}_icon`];
  }

  function pickHoverKeys(layerKey) {
    // keep this lightweight; you can expand later
    const defaults = {
      walkways: ["Name","Type","ID","Description"],
      nodes: ["Name","ID","Type"],
      poi: ["Name","Type","Description","ID"],
      stadiums: ["Name","Type","TypeCode","Description","Duration","WaitTime","VIP","ID"],
      restrooms: ["Name","Type","ID","Description"],
      rides: ["Name","Type","AgeGroup","AverageTime","ID","Description"],
      food: ["Name","Type","Price Range","PriceType","Veg","ID","Description"],
    };
    return defaults[layerKey] || [];
  }

  // ============================================================
  // BUILD MAPS
  // ============================================================
  async function initMapBlock(mapEl) {
    const mapId = mapEl.dataset.mapId || "map";
    mapEl.id = mapEl.id || `map_${mapId}`;

    const shell    = mapEl.closest(".map-shell");
    const legendEl = shell?.querySelector("[data-legend]");
    const hoverEl  = shell?.querySelector("[data-hover]");

    const preset = MAP_PRESETS[mapId] || MAP_PRESETS.walkways;
    if (preset?.legend) addLegend(legendEl, preset.legend);

    const map = new maplibregl.Map({
      container: mapEl,
      style: ESRI_IMAGERY,
      center: [-117.1625, 32.7355],
      zoom: 15,
      attributionControl: true
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    const kickResize = () => { try { map.resize(); } catch {} };
    setTimeout(kickResize, 50);
    setTimeout(kickResize, 250);
    setTimeout(kickResize, 1000);

    map.getCanvas().addEventListener("mouseleave", () => {
      hideHover(hoverEl);
      map.getCanvas().style.cursor = "";
    });

    map.on("load", async () => {
      const collections = {};
      const wanted = preset.layers || [];

      // load data for requested layers (skip esri_only pseudo layer)
      for (const k of wanted) {
        if (k === "esri_only") continue;
        if (!DATA_SOURCES[k]) continue;
        try { collections[k] = await loadLayerData(k); }
        catch (e) { console.error(`Layer failed: ${k}`, e); }
      }

      // Add sources
      for (const [k, fc] of Object.entries(collections)) {
        const srcId = `src_${mapId}_${k}`;
        if (!map.getSource(srcId)) map.addSource(srcId, { type: "geojson", data: fc });
      }

      // Add layers in StoryMap order:
      // polygons -> walkways -> nodes -> poi -> restrooms/rides/food
      const queryLayerIds = [];

      // Stadiums
      if (collections.stadiums) {
        const srcId = `src_${mapId}_stadiums`;
        const ids = addStadiums(map, srcId, `lyr_${mapId}_stadiums`);
        queryLayerIds.push(...ids);
      }

      // Walkways
      if (collections.walkways) {
        const srcId = `src_${mapId}_walkways`;
        const ids = addWalkways(map, srcId, `lyr_${mapId}_walkways`);
        queryLayerIds.push(...ids);
      }

      // Nodes
      if (collections.nodes) {
        const srcId = `src_${mapId}_nodes`;
        const ids = addNodes(map, srcId, `lyr_${mapId}_nodes`);
        queryLayerIds.push(...ids);
      }

      // POI
      if (collections.poi) {
        const srcId = `src_${mapId}_poi`;
        const ids = addPOI(map, srcId, `lyr_${mapId}_poi`);
        queryLayerIds.push(...ids);
      }

      // Restrooms
      if (collections.restrooms) {
        const srcId = `src_${mapId}_restrooms`;
        const ids = addRestrooms(map, srcId, `lyr_${mapId}_restrooms`);
        queryLayerIds.push(...ids);
      }

      // Rides
      if (collections.rides) {
        const srcId = `src_${mapId}_rides`;
        const ids = addRides(map, srcId, `lyr_${mapId}_rides`);
        queryLayerIds.push(...ids);
      }

      // Food
      if (collections.food) {
        const srcId = `src_${mapId}_food`;
        const ids = addFood(map, srcId, `lyr_${mapId}_food`);
        queryLayerIds.push(...ids);
      }

      // Fit view: prioritize walkways bbox if present, else everything
      const fitCollections =
        collections.walkways ? [collections.walkways] : Object.values(collections);
      fitToData(map, fitCollections.filter(Boolean));

      // Hover
      map.on("mousemove", (e) => {
        const feats = map.queryRenderedFeatures(e.point, { layers: queryLayerIds });
        if (!feats.length) {
          hideHover(hoverEl);
          map.getCanvas().style.cursor = "";
          return;
        }

        const f = feats[0];
        map.getCanvas().style.cursor = "pointer";

        // guess layerKey from id
        const id = f.layer?.id || "";
        let layerKeyGuess = "feature";
        if (id.includes("_walkways")) layerKeyGuess = "walkways";
        else if (id.includes("_nodes")) layerKeyGuess = "nodes";
        else if (id.includes("_poi")) layerKeyGuess = "poi";
        else if (id.includes("_stadiums")) layerKeyGuess = "stadiums";
        else if (id.includes("_restrooms")) layerKeyGuess = "restrooms";
        else if (id.includes("_rides")) layerKeyGuess = "rides";
        else if (id.includes("_food")) layerKeyGuess = "food";

        const prefer = pickHoverKeys(layerKeyGuess);
        const title =
          f.properties?.Name ||
          f.properties?.name ||
          f.properties?.TITLE ||
          layerKeyGuess;

        showHover(hoverEl, e.point.x, e.point.y, title, f.properties || {}, prefer);
      });

      kickResize();
    });

    return map;
  }

  async function boot() {
    const mapEls = document.querySelectorAll("[data-map]");
    for (const el of mapEls) await initMapBlock(el);

    // Tab highlight (unchanged)
    const tabs = Array.from(document.querySelectorAll(".story-tabs .tab"));
    const sections = tabs
      .map(t => document.querySelector(t.getAttribute("href")))
      .filter(Boolean);

    const setActive = () => {
      const y = window.scrollY + 160;
      let active = sections[0]?.id;
      for (const s of sections) if (s.offsetTop <= y) active = s.id;

      for (const t of tabs) {
        const id = (t.getAttribute("href") || "").replace("#", "");
        if (id === active) t.style.boxShadow = `inset 0 -2px 0 ${"rgba(239,68,68,.9)"}`;
        else t.style.boxShadow = "none";
      }
    };

    window.addEventListener("scroll", setActive, { passive: true });
    setActive();
  }

  boot().catch(console.error);
})();
