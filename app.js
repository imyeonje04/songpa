const DATA = {
  boundary: './data/songpa_boundary.geojson',
  dong: './data/songpa_dong_boundary.geojson',
  parcels: './data/parcels.geojson',
  sgis: './data/sgis_output_area_boundary_songpa.geojson',
  buildings: './data/buildings.geojson'
};

const COLORS = {
  '주거': '#ff9f43',
  '교통': '#4ea3f1',
  '수계': '#67d5e8',
  '상업업무': '#f368e0',
  '공공문화체육': '#8bd36b',
  '교육': '#ffd166',
  '녹지농림': '#2ecc71',
  '주상복합': '#a55eea',
  '대지': '#feca57',
  '공업': '#8395a7',
  '위험혐오': '#ee5253',
  '기타': '#c8d6e5'
};

const ORDER = ['주거', '교통', '수계', '상업업무', '공공문화체육', '교육', '녹지농림', '주상복합', '대지', '공업', '위험혐오', '기타'];

const state = {
  base: null,
  key: localStorage.getItem('songpaVworldKey') || '',
  opacity: 0.72,
  data: {},
  layers: {}
};

const map = L.map('map', {
  renderer: L.canvas({ padding: 0.35 }),
  center: [37.5145, 127.1059],
  zoom: 14,
  zoomControl: true,
  preferCanvas: true
});

const loading = document.getElementById('loading');
const keyInput = document.getElementById('vworldKey');
const opacityRange = document.getElementById('opacityRange');
const opacityValue = document.getElementById('opacityValue');
keyInput.value = state.key;

function showLoading(text) {
  loading.textContent = text;
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

function tile(type) {
  if (type === 'vworld' && state.key) {
    return L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${state.key}/Base/{z}/{y}/{x}.png`, { maxZoom: 19, attribution: '&copy; VWorld' });
  }
  if (type === 'satellite' && state.key) {
    return L.layerGroup([
      L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${state.key}/Satellite/{z}/{y}/{x}.jpeg`, { maxZoom: 19, attribution: '&copy; VWorld' }),
      L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${state.key}/Hybrid/{z}/{y}/{x}.png`, { maxZoom: 19 })
    ]);
  }
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
}

function setBase(type) {
  if ((type === 'vworld' || type === 'satellite') && !state.key) {
    alert('VWorld API 키를 입력한 뒤 적용하세요.');
    type = 'osm';
  }
  if (state.base) map.removeLayer(state.base);
  state.base = tile(type).addTo(map);
  document.querySelectorAll('.base-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.base === type));
}

function parcelStyle(feature) {
  const use = feature.properties.use || '기타';
  return {
    color: 'rgba(40, 52, 70, 0.85)',
    weight: 0.28,
    opacity: 0.75,
    fillColor: COLORS[use] || COLORS['기타'],
    fillOpacity: state.opacity
  };
}

function popup(feature) {
  const p = feature.properties;
  const rows = [
    ['분류', p.use || '-'],
    ['동', p.dong || '-'],
    ['지번', p.jibun || '-'],
    ['지목', p.jimok || '-'],
    ['주용도', p.buildingUse || '-'],
    ['면적', p.area ? `${Math.round(p.area).toLocaleString('ko-KR')}㎡` : '-'],
    ['PNU', p.pnu || '-']
  ];
  return `<div class="popup-title">필지 정보</div><div class="popup-grid">${rows.map(([k, v]) => `<div class="popup-key">${k}</div><div>${v}</div>`).join('')}</div>`;
}

function addParcels(data) {
  state.layers.parcels = L.geoJSON(data, {
    renderer: L.canvas(),
    style: parcelStyle,
    onEachFeature: (feature, layer) => layer.bindPopup(popup(feature))
  }).addTo(map);
}

function addBoundaries(boundary, dong) {
  state.layers.boundary = L.geoJSON(boundary, { style: { color: '#111827', weight: 2.2, fillOpacity: 0, opacity: 0.95 } }).addTo(map);
  state.layers.dong = L.geoJSON(dong, {
    style: { color: '#0f172a', weight: 1.1, fillOpacity: 0, opacity: 0.9 },
    onEachFeature: (feature, layer) => layer.bindTooltip(feature.properties?.EMD_NM || '법정동', { sticky: true })
  }).addTo(map);
  map.fitBounds(state.layers.boundary.getBounds(), { padding: [18, 18] });
}

async function toggleLayer(name, checked) {
  if (!checked) {
    if (state.layers[name]) map.removeLayer(state.layers[name]);
    return;
  }
  if (state.layers[name]) {
    state.layers[name].addTo(map);
    return;
  }
  showLoading(name === 'sgis' ? '집계구 경계를 불러오는 중...' : '건물을 불러오는 중...');
  const data = await json(DATA[name]);
  const style = name === 'sgis'
    ? { color: '#2563eb', weight: 0.7, fillColor: '#93c5fd', fillOpacity: 0.08 }
    : { color: '#475569', weight: 0.25, fillColor: '#111827', fillOpacity: 0.18 };
  state.layers[name] = L.geoJSON(data, { renderer: L.canvas(), style }).addTo(map);
  hideLoading();
}

function summarize(features) {
  const mapByUse = new Map();
  let totalArea = 0;
  for (const feature of features) {
    const p = feature.properties;
    const use = p.use || '기타';
    const area = Number(p.area || 0);
    totalArea += area;
    const row = mapByUse.get(use) || { use, count: 0, area: 0 };
    row.count += 1;
    row.area += area;
    mapByUse.set(use, row);
  }
  const rows = ORDER.map((use) => mapByUse.get(use)).filter(Boolean).sort((a, b) => b.area - a.area);
  return { rows, totalArea, totalCount: features.length };
}

function renderStats() {
  const stats = summarize(state.data.parcels.features);
  document.getElementById('datasetSummary').textContent = `필지 ${stats.totalCount.toLocaleString('ko-KR')}개 · ${ORDER.length}개 분류`;
  document.getElementById('totalParcels').textContent = stats.totalCount.toLocaleString('ko-KR');
  document.getElementById('totalArea').textContent = `${(stats.totalArea / 1000000).toFixed(1)}㎢`;

  let cursor = 0;
  const stops = stats.rows.map((row) => {
    const start = cursor;
    const percent = stats.totalArea ? (row.area / stats.totalArea) * 100 : 0;
    cursor += percent;
    return `${COLORS[row.use] || COLORS['기타']} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  document.getElementById('donut').style.background = `conic-gradient(${stops.join(', ')})`;
  document.getElementById('donutCenter').textContent = `${Math.round((stats.rows[0]?.area || 0) / stats.totalArea * 100)}%`;

  document.getElementById('legend').innerHTML = stats.rows.map((row) => `
    <div class="legend-row"><span class="swatch" style="background:${COLORS[row.use] || COLORS['기타']}"></span><span>${row.use}</span><span class="legend-count">${row.count.toLocaleString('ko-KR')}</span></div>
  `).join('');

  document.getElementById('statsList').innerHTML = stats.rows.map((row) => {
    const pct = stats.totalArea ? row.area / stats.totalArea * 100 : 0;
    return `<div class="stat-row"><div class="stat-name"><span class="swatch" style="background:${COLORS[row.use] || COLORS['기타']}"></span><span>${row.use}</span></div><div class="num">${row.count.toLocaleString('ko-KR')}</div><div class="num">${(row.area / 1000000).toFixed(2)}</div><div class="num">${pct.toFixed(1)}%</div></div>`;
  }).join('');
}

function bind() {
  document.getElementById('fitBounds').addEventListener('click', () => map.fitBounds(state.layers.boundary.getBounds(), { padding: [18, 18] }));
  document.getElementById('toggleParcels').addEventListener('change', (e) => e.target.checked ? state.layers.parcels.addTo(map) : map.removeLayer(state.layers.parcels));
  document.getElementById('toggleDong').addEventListener('change', (e) => e.target.checked ? state.layers.dong.addTo(map) : map.removeLayer(state.layers.dong));
  document.getElementById('toggleSgis').addEventListener('change', (e) => toggleLayer('sgis', e.target.checked));
  document.getElementById('toggleBuildings').addEventListener('change', (e) => toggleLayer('buildings', e.target.checked));
  opacityRange.addEventListener('input', () => {
    state.opacity = Number(opacityRange.value) / 100;
    opacityValue.textContent = `${opacityRange.value}%`;
    if (state.layers.parcels) state.layers.parcels.setStyle(parcelStyle);
  });
  document.getElementById('applyKey').addEventListener('click', () => {
    state.key = keyInput.value.trim();
    localStorage.setItem('songpaVworldKey', state.key);
    setBase('vworld');
  });
  document.querySelectorAll('.base-btn').forEach((btn) => btn.addEventListener('click', () => setBase(btn.dataset.base)));
}

async function init() {
  try {
    setBase('osm');
    bind();
    showLoading('경계 데이터를 불러오는 중...');
    const [boundary, dong] = await Promise.all([json(DATA.boundary), json(DATA.dong)]);
    addBoundaries(boundary, dong);
    showLoading('필지별 토지이용을 불러오는 중...');
    state.data.parcels = await json(DATA.parcels);
    addParcels(state.data.parcels);
    renderStats();
    hideLoading();
  } catch (error) {
    loading.textContent = `오류: ${error.message}`;
    console.error(error);
  }
}

init();

