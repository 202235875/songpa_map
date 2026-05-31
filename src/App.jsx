import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

const SONGPA_CENTER = [127.1177, 37.5145];
const VWORLD_API_KEY = import.meta.env.VITE_VWORLD_API_KEY || "";
const DATA_BASE_URL = import.meta.env.BASE_URL;

const CATEGORY_COLORS = {
  "02000": "#f3a64f",
  "01000": "#4e66d8",
  "04000": "#d66bc7",
  "03000": "#95d36d",
  "14000": "#7e7cf4",
  "10000": "#f1dd63",
  "11000": "#7bc6f6",
  "20000": "#8ea1b5",
  "06000": "#c48ef3",
  "07000": "#ff8d63",
  "15000": "#6ac7ba",
  "09000": "#c7a167",
  default: "#9a7b68",
};

const BASE_STYLE = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    vworld: {
      type: "raster",
      tiles: [
        "https://api.vworld.kr/req/wmts/1.0.0/" +
          VWORLD_API_KEY +
          "/Base/{z}/{y}/{x}.png",
      ],
      tileSize: 256,
      attribution: "VWorld",
    },
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap",
    },
  },
  layers: [
    {
      id: "osm-base-map",
      type: "raster",
      source: "osm",
    },
    ...(VWORLD_API_KEY
      ? [
          {
            id: "vworld-base-map",
            type: "raster",
            source: "vworld",
          },
        ]
      : []),
  ],
};

function dataUrl(path) {
  return `${DATA_BASE_URL}${path}`.replace(/\/{2,}/g, "/");
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value || 0);
}

function formatArea(value) {
  return `${formatNumber(Math.round(value || 0))} m2`;
}

function isCorruptedText(value) {
  return typeof value === "string" && /[�\u4e00-\u9fff]|[?]{2,}|곗|씠|뙆|援|嫄/.test(value);
}

function readableText(value, fallback = "이름 없음") {
  if (!value || isCorruptedText(value)) {
    return fallback;
  }
  return value;
}

function getGeoJsonBounds(geojson) {
  const bounds = new maplibregl.LngLatBounds();

  function extendCoordinates(coordinates) {
    if (!coordinates) {
      return;
    }

    if (typeof coordinates[0] === "number") {
      bounds.extend(coordinates);
      return;
    }

    coordinates.forEach(extendCoordinates);
  }

  geojson.features?.forEach((feature) => {
    extendCoordinates(feature.geometry?.coordinates);
  });

  return bounds.isEmpty() ? null : bounds;
}

function DonutChart({ totalCount, categories }) {
  const top = categories.slice(0, 8);
  const gradient = top.length
    ? `conic-gradient(${top
        .map((item, index) => {
          const start = top
            .slice(0, index)
            .reduce((sum, current) => sum + current.ratio, 0);
          const end = start + item.ratio;
          return `${item.color} ${start * 100}% ${end * 100}%`;
        })
        .join(", ")})`
    : "conic-gradient(#2d3447 0% 100%)";

  const focus = top[0];

  return (
    <div className="donut-block">
      <div className="donut" style={{ background: gradient }}>
        <div className="donut-hole">
          <strong>{focus?.name || "데이터 없음"}</strong>
          <span>{focus ? `${(focus.ratio * 100).toFixed(1)}%` : ""}</span>
        </div>
      </div>
      <div className="donut-caption">
        <span>{formatNumber(totalCount)} 건물</span>
      </div>
    </div>
  );
}

function App() {
  const mapRef = useRef(null);
  const mapNodeRef = useRef(null);
  const popupRef = useRef(null);
  const usageCodeMapRef = useRef({});

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState("usage");
  const [layers, setLayers] = useState({
    buildings: true,
    parcels: true,
    admin: true,
  });
  const [opacity, setOpacity] = useState(82);
  const [hoverInfo, setHoverInfo] = useState(null);
  const legendItems = useMemo(() => (stats?.usageStats || []).slice(0, 12), [stats]);

  useEffect(() => {
    usageCodeMapRef.current = stats?.usageCodeMap || {};
  }, [stats]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const response = await fetch(dataUrl("data/stats/songpa_building_usage_stats.json"));
        if (!response.ok) {
          throw new Error("통계 데이터를 불러오지 못했습니다.");
        }
        const statsData = await response.json();
        if (!cancelled) {
          setStats(statsData);
          setLoading(false);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError.message);
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) {
      return undefined;
    }

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: BASE_STYLE,
      center: SONGPA_CENTER,
      zoom: 14,
      minZoom: 11,
      maxZoom: 18.5,
      pitch: 0,
      attributionControl: false,
    });

    mapRef.current = map;
    requestAnimationFrame(() => map.resize());

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "map-hover-popup",
      offset: 12,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", async () => {
      const [buildingsResponse, parcelsResponse, adminResponse] = await Promise.all([
        fetch(dataUrl("data/geojson/songpa_buildings.geojson")),
        fetch(dataUrl("data/geojson/songpa_cadastral.geojson")),
        fetch(dataUrl("data/geojson/songpa_admin_dongs.geojson")),
      ]);

      const [buildingsData, parcelsData, adminData] = await Promise.all([
        buildingsResponse.json(),
        parcelsResponse.json(),
        adminResponse.json(),
      ]);

      map.addSource("songpa-buildings", { type: "geojson", data: buildingsData });
      map.addSource("songpa-parcels", { type: "geojson", data: parcelsData });
      map.addSource("songpa-admin", { type: "geojson", data: adminData });

      map.addLayer({
        id: "songpa-parcels-fill",
        type: "fill",
        source: "songpa-parcels",
        paint: {
          "fill-color": "#f3f0e8",
          "fill-opacity": 0.08,
        },
      });

      map.addLayer({
        id: "songpa-parcels-line",
        type: "line",
        source: "songpa-parcels",
        paint: {
          "line-color": "#1b2436",
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.2, 15, 0.8, 18, 1.5],
          "line-opacity": 0.5,
        },
      });

      map.addLayer({
        id: "songpa-buildings-fill",
        type: "fill",
        source: "songpa-buildings",
        paint: {
          "fill-color": [
            "match",
            ["coalesce", ["get", "A8"], ""],
            ...Object.entries(CATEGORY_COLORS)
              .filter(([key]) => key !== "default")
              .flat(),
            CATEGORY_COLORS.default,
          ],
          "fill-opacity": opacity / 100,
        },
      });

      map.addLayer({
        id: "songpa-admin-line",
        type: "line",
        source: "songpa-admin",
        paint: {
          "line-color": "#232b3d",
          "line-width": 2,
          "line-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "songpa-admin-label",
        type: "symbol",
        source: "songpa-admin",
        layout: {
          "text-field": ["coalesce", ["get", "dong_name"], ["get", "adm_nm"], ""],
          "text-font": ["Open Sans Semibold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 16, 16],
        },
        paint: {
          "text-color": "#1c2230",
          "text-halo-color": "rgba(255,255,255,0.85)",
          "text-halo-width": 1.2,
        },
      });

      const songpaBounds = getGeoJsonBounds(adminData) || getGeoJsonBounds(parcelsData);
      if (songpaBounds) {
        map.fitBounds(songpaBounds, {
          padding: { top: 72, right: 420, bottom: 72, left: 360 },
          duration: 0,
          maxZoom: 14.5,
        });
      }

      map.on("mousemove", "songpa-buildings-fill", (event) => {
        const feature = event.features?.[0];
        if (!feature) {
          return;
        }

        map.getCanvas().style.cursor = "pointer";
        const properties = feature.properties || {};
        const usageCode = properties.A8 || "";
        const usageName = usageCodeMapRef.current[usageCode] || usageCode || "-";
        const buildingName = readableText(properties.A24 || properties.A25);
        const popupHtml = `
          <div class="hover-card">
            <div class="hover-card__title">${buildingName}</div>
            <div>필지: ${properties.A5 || "-"}</div>
            <div>용도: ${usageName}</div>
            <div>연면적: ${formatArea(Number(properties.A14 || 0))}</div>
          </div>
        `;

        popupRef.current
          .setLngLat(event.lngLat)
          .setHTML(popupHtml)
          .addTo(map);

        setHoverInfo({
          parcel: properties.A5 || "-",
          usage: usageName,
          area: Number(properties.A14 || 0),
        });
      });

      map.on("mouseleave", "songpa-buildings-fill", () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
        setHoverInfo(null);
      });
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    const visibility = (enabled) => (enabled ? "visible" : "none");

    if (map.getLayer("songpa-buildings-fill")) {
      map.setLayoutProperty("songpa-buildings-fill", "visibility", visibility(layers.buildings));
      map.setPaintProperty("songpa-buildings-fill", "fill-opacity", opacity / 100);
    }

    if (map.getLayer("songpa-parcels-fill")) {
      map.setLayoutProperty("songpa-parcels-fill", "visibility", visibility(layers.parcels));
    }

    if (map.getLayer("songpa-parcels-line")) {
      map.setLayoutProperty("songpa-parcels-line", "visibility", visibility(layers.parcels));
    }

    if (map.getLayer("songpa-admin-line")) {
      map.setLayoutProperty("songpa-admin-line", "visibility", visibility(layers.admin));
    }

    if (map.getLayer("songpa-admin-label")) {
      map.setLayoutProperty("songpa-admin-label", "visibility", visibility(layers.admin));
    }
  }, [layers, opacity]);

  const activeCategories =
    activePanel === "usage" ? stats?.usageStats || [] : (stats?.usageStats || []).slice(0, 8);

  return (
    <div className="app-shell">
      <div ref={mapNodeRef} className="map-canvas" />

      <aside className="left-panel panel-glass">
        <div className="panel-title">송파구 데이터 뷰어</div>
        <div className="panel-subtitle">
          건물 {stats ? formatNumber(stats.totalBuildings) : "-"} / 필지{" "}
          {stats ? formatNumber(stats.totalParcels) : "-"}
        </div>

        <div className="layer-group">
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.buildings}
              onChange={() =>
                setLayers((current) => ({ ...current, buildings: !current.buildings }))
              }
            />
            <span>건물 통합정보</span>
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.parcels}
              onChange={() => setLayers((current) => ({ ...current, parcels: !current.parcels }))}
            />
            <span>필지 경계</span>
          </label>
          <label className="layer-item">
            <input
              type="checkbox"
              checked={layers.admin}
              onChange={() => setLayers((current) => ({ ...current, admin: !current.admin }))}
            />
            <span>행정동 경계</span>
          </label>
        </div>

        <div className="slider-block">
          <div className="slider-head">
            <span>건물 투명도</span>
            <strong>{opacity}%</strong>
          </div>
          <input
            type="range"
            min="20"
            max="100"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
        </div>

        <div className="legend-card">
          <div className="legend-title">건축물 주용도</div>
          <div className="legend-list">
            {legendItems.map((item) => (
              <div key={item.code} className="legend-row">
                <span className="legend-swatch" style={{ backgroundColor: item.color }} />
                <span className="legend-name">{item.name}</span>
                <span className="legend-value">{formatNumber(item.count)}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <aside className="right-panel panel-glass">
        <div className="stats-header">
          <div>
            <div className="panel-title">송파구 통계</div>
            <div className="panel-subtitle">건축물대장 표제부 기반 요약</div>
          </div>
          <div className="chip">{import.meta.env.VITE_VWORLD_API_KEY ? "VWorld" : "OSM"}</div>
        </div>

        <div className="tab-row">
          <button
            className={activePanel === "usage" ? "tab active" : "tab"}
            onClick={() => setActivePanel("usage")}
          >
            건축물 주용도
          </button>
          <button
            className={activePanel === "area" ? "tab active" : "tab"}
            onClick={() => setActivePanel("area")}
          >
            연면적 집중
          </button>
        </div>

        {loading && <div className="empty-state">통계를 불러오는 중입니다.</div>}
        {error && <div className="empty-state">{error}</div>}
        {!loading && !error && stats && (
          <>
            <DonutChart totalCount={stats.totalBuildings} categories={stats.usageStats} />

            <div className="metric-grid">
              <div className="metric-card">
                <span>건물 수</span>
                <strong>{formatNumber(stats.totalBuildings)}</strong>
              </div>
              <div className="metric-card">
                <span>연면적 합계</span>
                <strong>{formatArea(stats.totalGrossFloorArea)}</strong>
              </div>
              <div className="metric-card">
                <span>필지 수</span>
                <strong>{formatNumber(stats.totalParcels)}</strong>
              </div>
              <div className="metric-card">
                <span>행정동 수</span>
                <strong>{formatNumber(stats.totalDongs)}</strong>
              </div>
            </div>

            <div className="table-card">
              <div className="table-head">
                <span>분류</span>
                <span>건수</span>
                <span>연면적</span>
                <span>비율</span>
              </div>
              <div className="table-body">
                {activeCategories.slice(0, 18).map((item) => (
                  <div key={item.code} className="table-row">
                    <span className="table-name">
                      <i style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <span>{formatNumber(item.count)}</span>
                    <span>{formatNumber(Math.round(item.totalGrossFloorArea))}</span>
                    <span>{(item.ratio * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>

      <div className="status-strip panel-glass">
        <span>데이터: 필지, 건물통합정보, 건축물대장, 행정동</span>
        <span>
          {hoverInfo
            ? `건물 ${hoverInfo.parcel} / ${hoverInfo.usage} / ${formatArea(hoverInfo.area)}`
            : "건물 위에 마우스를 올리면 요약이 표시됩니다."}
        </span>
      </div>
    </div>
  );
}

export default App;
