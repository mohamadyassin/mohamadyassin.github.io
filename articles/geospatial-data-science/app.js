// GitHub Release GeoJSON URLs (from your MyST references)
const DATA = {
    walkways:  "https://github.com/mohamadyassin/myst_airc/releases/download/data/Walkways.geojson",
    nodes:     "https://github.com/mohamadyassin/myst_airc/releases/download/data/Nodes.geojson",
    poi:       "https://github.com/mohamadyassin/myst_airc/releases/download/data/PointsofInterest.geojson",
    events:    "https://github.com/mohamadyassin/myst_airc/releases/download/data/StadiumsandEncounters.geojson",
    rides:     "https://github.com/mohamadyassin/myst_airc/releases/download/data/Rides_JSON.geojson",
    fnb:       "https://github.com/mohamadyassin/myst_airc/releases/download/data/FoodandBeverage.geojson",
    restrooms: "https://github.com/mohamadyassin/myst_airc/releases/download/data/Restrooms.geojson",
  };
  
  const BASE_STYLE = "https://demotiles.maplibre.org/style.json";
  
  const legendBody = document.getElementById("legendBody");
  function setLegend(items){
    legendBody.innerHTML = "";
    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML = `<span class="swatch" style="background:${it.color}"></span><span>${it.label}</span>`;
      legendBody.appendChild(row);
    });
  }
  
  function setLayerVisibility(map, layerIds, visible){
    const v = visible ? "visible" : "none";
    layerIds.forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    });
  }
  
  function escapeHtml(str){
    return str.replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }
  
  const map = new maplibregl.Map({
    container: "map",
    style: BASE_STYLE,
    center: [-117.213, 32.764],
    zoom: 14.8,
    pitch: 45,
    bearing: -20,
  });
  
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  
  map.on("load", () => {
    // Sources
    map.addSource("walkways",  { type:"geojson", data: DATA.walkways });
    map.addSource("nodes",     { type:"geojson", data: DATA.nodes });
    map.addSource("poi",       { type:"geojson", data: DATA.poi });
    map.addSource("events",    { type:"geojson", data: DATA.events });
    map.addSource("rides",     { type:"geojson", data: DATA.rides });
    map.addSource("fnb",       { type:"geojson", data: DATA.fnb });
    map.addSource("restrooms", { type:"geojson", data: DATA.restrooms });
  
    // Layers
    map.addLayer({
      id:"walkways-line",
      type:"line",
      source:"walkways",
      paint:{ "line-color":"#7CFF6B", "line-width": 3.0, "line-opacity": 0.9 }
    });
  
    map.addLayer({
      id:"nodes-circle",
      type:"circle",
      source:"nodes",
      paint:{
        "circle-radius": 5,
        "circle-color":"#FDE047",
        "circle-stroke-color":"#ef4444",
        "circle-stroke-width": 1.2,
        "circle-opacity": 0.95
      }
    });
  
    map.addLayer({
      id:"poi-circle",
      type:"circle",
      source:"poi",
      paint:{
        "circle-radius": 6,
        "circle-color":"#60A5FA",
        "circle-stroke-color":"rgba(255,255,255,.65)",
        "circle-stroke-width": 1.2,
        "circle-opacity": 0.92
      }
    });
  
    map.addLayer({
      id:"events-fill",
      type:"fill",
      source:"events",
      paint:{ "fill-color":"#F472B6", "fill-opacity": 0.25 }
    });
  
    map.addLayer({
      id:"events-outline",
      type:"line",
      source:"events",
      paint:{ "line-color":"#F472B6", "line-width": 2.0, "line-opacity": 0.75 }
    });
  
    map.addLayer({
      id:"rides-circle",
      type:"circle",
      source:"rides",
      paint:{
        "circle-radius": 6,
        "circle-color":"#FB7185",
        "circle-stroke-color":"rgba(0,0,0,.35)",
        "circle-stroke-width": 1.2,
        "circle-opacity": 0.95
      }
    });
  
    map.addLayer({
      id:"fnb-circle",
      type:"circle",
      source:"fnb",
      paint:{
        "circle-radius": 6,
        "circle-color":"#34D399",
        "circle-stroke-color":"rgba(0,0,0,.35)",
        "circle-stroke-width": 1.2,
        "circle-opacity": 0.95
      }
    });
  
    map.addLayer({
      id:"restrooms-circle",
      type:"circle",
      source:"restrooms",
      paint:{
        "circle-radius": 6,
        "circle-color":"#A78BFA",
        "circle-stroke-color":"rgba(0,0,0,.35)",
        "circle-stroke-width": 1.2,
        "circle-opacity": 0.95
      }
    });
  
    // Start state
    setLayerVisibility(map, ["nodes-circle","poi-circle","events-fill","events-outline","rides-circle","fnb-circle","restrooms-circle"], false);
    setLegend([{label:"Walkways", color:"#7CFF6B"}]);
  
    // Hover popup (best-effort property name = "Name"; we can refine later)
    const popup = new maplibregl.Popup({ closeButton:false, closeOnClick:false, offset: 12 });
  
    function bindHover(layerId, titleProp){
      map.on("mousemove", layerId, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features && e.features[0];
        if (!f) return;
        const name = (f.properties && f.properties[titleProp]) ? f.properties[titleProp] : layerId;
        popup.setLngLat(e.lngLat).setHTML(`<div style="font-weight:700">${escapeHtml(String(name))}</div>`).addTo(map);
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    }
  
    bindHover("poi-circle", "Name");
    bindHover("rides-circle", "Name");
    bindHover("fnb-circle", "Name");
    bindHover("restrooms-circle", "Name");
  
    // Scrollytelling
    const scroller = scrollama();
  
    scroller.setup({ step: ".step", offset: 0.62 })
      .onStepEnter((resp) => {
        document.querySelectorAll(".step").forEach(s => s.classList.remove("is-active"));
        resp.element.classList.add("is-active");
        applyChapter(resp.element.getAttribute("data-chapter"));
      });
  
    window.addEventListener("resize", scroller.resize);
  
    function applyChapter(ch){
      setLayerVisibility(map, ["nodes-circle","poi-circle","events-fill","events-outline","rides-circle","fnb-circle","restrooms-circle"], false);
  
      if (ch === "intro" || ch === "walkways"){
        map.flyTo({ center:[-117.213, 32.764], zoom:14.8, pitch:45, bearing:-20, speed:0.8 });
        setLegend([{label:"Walkways", color:"#7CFF6B"}]);
        return;
      }
  
      if (ch === "nodes"){
        setLayerVisibility(map, ["nodes-circle"], true);
        map.flyTo({ zoom:15.2, speed:0.8 });
        setLegend([{label:"Walkways", color:"#7CFF6B"},{label:"Nodes", color:"#FDE047"}]);
        return;
      }
  
      if (ch === "poi"){
        setLayerVisibility(map, ["poi-circle"], true);
        map.flyTo({ zoom:15.1, speed:0.8 });
        setLegend([{label:"Walkways", color:"#7CFF6B"},{label:"POI", color:"#60A5FA"}]);
        return;
      }
  
      if (ch === "events"){
        setLayerVisibility(map, ["events-fill","events-outline"], true);
        map.flyTo({ zoom:15.0, pitch:50, speed:0.8 });
        setLegend([{label:"Walkways", color:"#7CFF6B"},{label:"Stadiums/Encounters", color:"#F472B6"}]);
        return;
      }
  
      if (ch === "rides"){
        setLayerVisibility(map, ["rides-circle"], true);
        map.flyTo({ zoom:15.15, speed:0.8 });
        setLegend([{label:"Walkways", color:"#7CFF6B"},{label:"Rides", color:"#FB7185"}]);
        return;
      }
  
      if (ch === "fnb"){
        setLayerVisibility(map, ["fnb-circle"], true);
        map.flyTo({ zoom:15.15, speed:0.8 });
        setLegend([{label:"Walkways", color:"#7CFF6B"},{label:"Food & Beverage", color:"#34D399"}]);
        return;
      }
  
      if (ch === "restrooms"){
        setLayerVisibility(map, ["restrooms-circle"], true);
        map.flyTo({ zoom:15.15, speed:0.8 });
        setLegend([{label:"Walkways", color:"#7CFF6B"},{label:"Restrooms", color:"#A78BFA"}]);
        return;
      }
    }
  });
  