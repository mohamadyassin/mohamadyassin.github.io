(() => {
  const YEAR_EL = document.getElementById("y");
  if (YEAR_EL) YEAR_EL.textContent = new Date().getFullYear();

  // 1) DATA SOURCES (EDIT THESE ONCE)
  // Put your GeoJSON in /articles/geospatial-data-science/data/*.geojson
  // OR point to your existing repo location that already works.
  //
  // Tip: repo raw is most stable on Pages:
  //   "/articles/geospatial-data-science/data/walkways.geojson"
  //
  // Release assets MUST be a direct downloadable URL that returns JSON,
  // not a GitHub HTML page.
  const DATA_SOURCES = {
    walkways: {
      repo: "/articles/geospatial-data-science/data/walkways.geojson",
      release: null,
      // Optional: show these attributes first in hover
      hoverKeys: ["Name", "Type", "ID", "Description"]
    },
    nodes: {
      repo: "/articles/geospatial-data-science/data/nodes.geojson",
      release: null,
      hoverKeys: ["Name", "ID", "Type"]
    },
    poi: {
      repo: "/articles/geospatial-data-science/data/poi.geojson",
      release: null,
      hoverKeys: ["Name", "Type", "Description", "ID"]
    }
    // Add more when you wire stadiums/bathrooms/rides/fnb:
    // , stadiums: { repo:"...", release:null, hoverKeys:[...] }
  };

  // 2) MAP STYLE (Esri imagery via raster tiles)
  const ESRI_IMAGERY = {
    version: 8,
    sources: {
      esri: {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        attribution: "Tiles © Esri"
      }
    },
    layers: [
      { id: "esri", type: "raster", source: "esri" }
    ]
  };

  // ------------ helpers ------------
  async function fetchGeoJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    const txt = await res.text();

    // Fail fast if GitHub returned HTML (classic release mistake)
    if (txt.trim().startsWith("<!doctype") || txt.includes("<html")) {
      throw new Error(`Not JSON (looks like HTML): ${url}`);
    }
    const json = JSON.parse(txt);

    // Basic GeoJSON sanity checks
    const isFeatureCollection =
      json &&
      json.type === "FeatureCollection" &&
      Array.isArray(json.features);

    if (!isFeatureCollection) {
      throw new Error(`Not a FeatureCollection GeoJSON: ${url}`);
    }
    return json;
  }

  async function loadLayerData(layerKey) {
    const cfg = DATA_SOURCES[layerKey];
    if (!cfg) throw new Error(`Unknown layer key: ${layerKey}`);

    // Try release first if present, but only if it parses as GeoJSON
    if (cfg.release) {
      try {
        return await fetchGeoJSON(cfg.release);
      } catch (e) {
        console.warn(`[${layerKey}] release failed, falling back to repo`, e);
      }
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
      if (!f || !f.geometry) continue;
      walk(f.geometry.coordinates);
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null;
    }
    return [minX, minY, maxX, maxY];
  }

  function fitToData(map, collections) {
    const boxes = collections
      .map(bboxFromGeoJSON)
      .filter(Boolean);

    if (!boxes.length) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b[0]);
      minY = Math.min(minY, b[1]);
      maxX = Math.max(maxX, b[2]);
      maxY = Math.max(maxY, b[3]);
    }

    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 50, duration: 600 });
  }

  function geomType(fc) {
    for (const f of fc.features) {
      const t = f?.geometry?.type;
      if (t) return t;
    }
    return null;
  }

  function addLegend(el, items) {
    if (!el) return;
    const html = [
      `<div class="lg-title">Legend</div>`,
      ...items.map(i => `
        <div class="lg-item">
          <div class="lg-swatch" style="background:${i.color}"></div>
          <div>${i.label}</div>
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

    const rows = order.slice(0, 8).map(k => {
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
    return s.replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  // 3) BUILD MAPS
  async function initMapBlock(mapEl) {
    const layerKeys = (mapEl.dataset.layers || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const mapId = mapEl.dataset.mapId || "map";
    mapEl.id = mapEl.id || `map_${mapId}`;

    const shell = mapEl.closest(".map-shell");
    const legendEl = shell?.querySelector("[data-legend]");
    const hoverEl = shell?.querySelector("[data-hover]");

    const map = new maplibregl.Map({
      container: mapEl.id,
      style: ESRI_IMAGERY,
      center: [-117.1625, 32.7355], // fallback
      zoom: 14,
      attributionControl: true
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    // Load all requested layers
    const collections = {};
    for (const k of layerKeys) {
      try {
        collections[k] = await loadLayerData(k);
      } catch (e) {
        console.error(`Layer failed: ${k}`, e);
      }
    }

    map.on("load", () => {
      const legendItems = [];

      for (const k of layerKeys) {
        const fc = collections[k];
        if (!fc) continue;

        const srcId = `src_${mapId}_${k}`;
        const baseId = `lyr_${mapId}_${k}`;

        map.addSource(srcId, { type: "geojson", data: fc });

        const gt = geomType(fc);

        // Styling choices (simple & clean)
        if (gt === "LineString" || gt === "MultiLineString") {
          map.addLayer({
            id: baseId,
            type: "line",
            source: srcId,
            paint: {
              "line-color": "#7CFF6B",
              "line-width": 4,
              "line-opacity": 0.9
            }
          });
          legendItems.push({ label: k, color: "#7CFF6B" });

        } else if (gt === "Point" || gt === "MultiPoint") {
          map.addLayer({
            id: baseId,
            type: "circle",
            source: srcId,
            paint: {
              "circle-color": "#FFD84A",
              "circle-radius": 6,
              "circle-stroke-color": "rgba(0,0,0,.65)",
              "circle-stroke-width": 1.5,
              "circle-opacity": 0.95
            }
          });
          legendItems.push({ label: k, color: "#FFD84A" });

        } else {
          // Polygons if/when you add stadiums, etc.
          map.addLayer({
            id: baseId,
            type: "fill",
            source: srcId,
            paint: {
              "fill-color": "rgba(124,255,107,.22)",
              "fill-outline-color": "rgba(124,255,107,.85)"
            }
          });
          legendItems.push({ label: k, color: "rgba(124,255,107,.35)" });
        }
      }

      addLegend(legendEl, legendItems);

      // Fit to data (all collections)
      fitToData(map, Object.values(collections).filter(Boolean));

      // Hover behavior: query features on mousemove
      map.on("mousemove", (e) => {
        const queryLayers = layerKeys.map(k => `lyr_${mapId}_${k}`);
        const feats = map.queryRenderedFeatures(e.point, { layers: queryLayers });

        if (!feats.length) {
          hideHover(hoverEl);
          map.getCanvas().style.cursor = "";
          return;
        }

        const f = feats[0];
        map.getCanvas().style.cursor = "pointer";

        const layerKeyGuess = (f.layer.id.split("_").slice(-1)[0]) || "feature";
        const prefer = DATA_SOURCES[layerKeyGuess]?.hoverKeys || [];

        const title = (f.properties?.Name || f.properties?.name || f.properties?.TITLE || layerKeyGuess);
        showHover(hoverEl, e.point.x, e.point.y, title, f.properties || {}, prefer);
      });

      map.on("mouseleave", () => {
        hideHover(hoverEl);
        map.getCanvas().style.cursor = "";
      });
    });
  }

  async function boot() {
    const mapEls = document.querySelectorAll("[data-map]");
    for (const el of mapEls) {
      await initMapBlock(el);
    }

    // Scrollspy-ish: underline active tab
    const tabs = Array.from(document.querySelectorAll(".story-tabs .tab"));
    const sections = tabs
      .map(t => document.querySelector(t.getAttribute("href")))
      .filter(Boolean);

    const setActive = () => {
      const y = window.scrollY + 160;
      let active = sections[0]?.id;

      for (const s of sections) {
        if (s.offsetTop <= y) active = s.id;
      }

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
