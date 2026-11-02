import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import helvetiker from './assets/helvetiker_regular.typeface.json';

const app = document.getElementById('app');
const canvas = document.getElementById('scene');

/* ---------- renderer / scene ---------- */

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  32,
  window.innerWidth / window.innerHeight,
  0.05,
  300
);
camera.position.set(6.5, 3, 8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.rotateSpeed = 0.72;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.75;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotateSpeed = 0.85;
controls.target.set(0, 0.75, 0);

/* ---------- lights ---------- */

const keyLight = new THREE.DirectionalLight(0xfff1e2, 3.0);
keyLight.castShadow = true;
scene.add(keyLight, keyLight.target);

const rimLight = new THREE.DirectionalLight(0x9fc6ff, 1.7);
scene.add(rimLight, rimLight.target);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
scene.add(fillLight, fillLight.target);

/* ---------- state ---------- */

let carRoot = null;
let paintMat = null;
let badgeMesh = null;
let toyotaBadge = null;
let rav4Badge = null;
let rav4Digit = null;
let cnBadgeGroup = null;
let toyotaChromeMat = null;
let toyotaBaseMat = null;
let bodyPaint = null;
let bodyPaintCN = null;
let usPlateMesh = null;
let usFrontPlateMesh = null;
let cnRearGroup = null;
let cnFrontGroup = null;
let envisionPlateMeshes = [];
let envisionCnFront = null;
let envisionCnRear = null;
let aoMat = null;
let dims = { max: 4.5, height: 1.7, width: 1.9, length: 4.5 };
let camTween = null;
let activeView = 'rear';
let autoRotateOn = false;
let activeLight = 'studio';

const carCache = new Map();
const carLoads = new Map();
let currentCarId = null;
let switching = false;
let paintMats = [];
let floorMesh = null;
let aoPlane = null;
let currentPaintId = null;
const tweens = [];

const clock = { last: performance.now() };
function getDelta() {
  const now = performance.now();
  const dt = Math.min((now - clock.last) / 1000, 0.05);
  clock.last = now;
  return dt;
}

/* ---------- presets ---------- */

const VIEWS = [
  { id: 'hero', label: '前 45°', en: 'FRONT 3/4', theta: 36, phi: 82, fill: 1.12 },
  { id: 'front', label: '正前', en: 'FRONT', theta: 0, phi: 83, fill: 1.06 },
  { id: 'side', label: '侧面', en: 'SIDE', theta: 90, phi: 83, fill: 1.06 },
  { id: 'rear34', label: '后 45°', en: 'REAR 3/4', theta: 143, phi: 79, fill: 1.06 },
  { id: 'rear', label: '正后', en: 'REAR', theta: 180, phi: 83, fill: 1.06 },
  { id: 'top', label: '俯视', en: 'TOP', theta: 35, phi: 26, fill: 0.9 },
];

const LIGHTS = [
  {
    id: 'studio',
    name: '影棚',
    bg: 'bg-studio',
    exposure: 0.96,
    env: 1.2,
    envRot: 0,
    ao: 0.4,
    key: { color: 0xfff8f2, intensity: 1.9, pos: [0.85, 1.2, 0.7] },
    rim: { color: 0xbfd4ff, intensity: 0.9, pos: [-0.9, 0.65, -0.85] },
    fill: { color: 0xffffff, intensity: 0.25, pos: [-0.3, 0.5, 1.0] },
  },
  {
    id: 'dusk',
    name: '黄昏',
    bg: 'bg-dusk',
    exposure: 1.2,
    env: 0.6,
    envRot: 1.4,
    ao: 0.35,
    key: { color: 0xffa15e, intensity: 3.5, pos: [0.95, 0.45, 0.5] },
    rim: { color: 0x7f9dff, intensity: 2.0, pos: [-0.8, 0.55, -0.9] },
    fill: { color: 0xffd9b8, intensity: 0.35, pos: [-0.2, 0.4, 0.9] },
  },
  {
    id: 'night',
    name: '夜景',
    bg: 'bg-night',
    exposure: 1.15,
    env: 0.28,
    envRot: 2.6,
    ao: 0.5,
    key: { color: 0xa9c2ff, intensity: 2.6, pos: [0.55, 1.0, -0.35] },
    rim: { color: 0x49d4ff, intensity: 2.4, pos: [-0.9, 0.35, -0.75] },
    fill: { color: 0x4a6bff, intensity: 0.5, pos: [-0.4, 0.3, 0.9] },
  },
];

// 2012 款 RAV4 官方配色：国产（一汽丰田）6 色 + 美规（非国产）专属 5 色
const PAINTS = [
  { id: 'superwhite', market: 'cn', name: '超级白', color: '#f0eee7', metalness: 0.03, roughness: 0.3, env: 0.9, clearcoatR: 0.03 },
  { id: 'silver', market: 'cn', name: '银金属色', color: '#c2c6c9', metalness: 0.62, roughness: 0.27, clearcoatR: 0.03 },
  { id: 'gray', market: 'cn', name: '灰金属色', color: '#82868a', metalness: 0.55, roughness: 0.3, clearcoatR: 0.03 },
  { id: 'black', market: 'cn', name: '黑云母色', color: '#101114', metalness: 0.35, roughness: 0.2, clearcoatR: 0.03 },
  { id: 'red', market: 'cn', name: '红云母金属色', color: '#8c1218', metalness: 0.32, roughness: 0.27, clearcoatR: 0.04 },
  { id: 'brown', market: 'cn', name: '深棕云母金属色', color: '#4a362c', metalness: 0.42, roughness: 0.28, clearcoatR: 0.04 },
  { id: 'blizzard', market: 'us', name: '暴雪珍珠白', color: '#ece7dc', metalness: 0.05, roughness: 0.26, env: 0.9, clearcoatR: 0.03, note: '仅 Limited 配置，加价色' },
  { id: 'forest', market: 'us', name: '黑森林珍珠色', color: '#121715', metalness: 0.4, roughness: 0.19, clearcoatR: 0.03, note: '不可选外观套件' },
  { id: 'pacific', market: 'us', name: '太平洋蓝金属色', color: '#1c568c', metalness: 0.45, roughness: 0.26, clearcoatR: 0.04, note: '不可选外观套件' },
  { id: 'sandy', market: 'us', name: '沙滩米金金属色', color: '#c2ab84', metalness: 0.55, roughness: 0.29, clearcoatR: 0.03, note: '不提供 Sport 配置' },
  { id: 'pyrite', market: 'us', name: '黄铁矿云母色', color: '#8a6743', metalness: 0.6, roughness: 0.27, clearcoatR: 0.04, note: '不提供 Sport 配置' },
];

// 夏朗专用配色：首个色 = 默认车漆（太妃褐）；参考红为独立参考组，非官方色；
// 中规组 = 2012 款进口夏朗国内官方 9 色；海外组 = 欧洲同期 8 色（2015 改款后的纯白/奥利克斯白/爪哇绿等未列入）
const SHARAN_PAINTS = [
  { id: 'shcntoffee', market: 'cn', name: '太妃褐', color: '#5a4332', metalness: 0.55, roughness: 0.28, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shrefer', market: 'ref', name: '参考红', color: '#a61c21', metalness: 0.05, roughness: 0.3, clearcoatR: 0.03, note: 'Sketchfab 参考页默认车漆，非 2012 官方色' },
  { id: 'shcnwhite', market: 'cn', name: '糖果白', color: '#f2f1ea', metalness: 0.05, roughness: 0.32, env: 0.95, clearcoatR: 0.03, note: '标准漆' },
  { id: 'shcnblack', market: 'cn', name: '正黑', color: '#0a0b0d', metalness: 0.35, roughness: 0.2, clearcoatR: 0.03, note: '标准漆' },
  { id: 'shcndeepblack', market: 'cn', name: '深黑', color: '#08090b', metalness: 0.45, roughness: 0.18, clearcoatR: 0.03, note: '珠光漆' },
  { id: 'shcnreflex', market: 'cn', name: '炫目银', color: '#b7bbc0', metalness: 0.62, roughness: 0.27, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shcnleaf', market: 'cn', name: '落叶银', color: '#b1b4ad', metalness: 0.6, roughness: 0.27, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shcngrey', market: 'cn', name: '深灰', color: '#767a7c', metalness: 0.5, roughness: 0.3, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shcnindium', market: 'cn', name: '烟灰', color: '#64696e', metalness: 0.6, roughness: 0.28, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shcnnight', market: 'cn', name: '月夜蓝', color: '#1b2738', metalness: 0.55, roughness: 0.26, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shuswhite', market: 'us', name: '糖果白', color: '#f2f1ea', metalness: 0.05, roughness: 0.32, env: 0.95, clearcoatR: 0.03, note: '标准漆' },
  { id: 'shusdeepblack', market: 'us', name: '深黑', color: '#08090b', metalness: 0.45, roughness: 0.18, clearcoatR: 0.03, note: '珠光漆' },
  { id: 'shusreflex', market: 'us', name: '炫目银', color: '#b7bbc0', metalness: 0.62, roughness: 0.27, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shusleaf', market: 'us', name: '落叶银', color: '#b1b4ad', metalness: 0.6, roughness: 0.27, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shusurano', market: 'us', name: '深灰', color: '#767a7c', metalness: 0.5, roughness: 0.3, clearcoatR: 0.03, note: '标准漆' },
  { id: 'shusindium', market: 'us', name: '烟灰', color: '#64696e', metalness: 0.6, roughness: 0.28, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shusnight', market: 'us', name: '月夜蓝', color: '#1b2738', metalness: 0.55, roughness: 0.26, clearcoatR: 0.03, note: '金属漆' },
  { id: 'shustoffee', market: 'us', name: '太妃褐', color: '#5a4332', metalness: 0.55, roughness: 0.28, clearcoatR: 0.03, note: '金属漆' },
];

// 昂科威专用配色：第一个色 = 默认车漆（2019 款上汽通用昂科威 托帕石棕）；
// 国产组 = 2019 款上汽通用昂科威官方色；美规组 = 2019 美规 Envision 官方色板
// （银河银 / 古铜合金为 2019 款特有，2020 款起被浓咖棕 / 暗月蓝取代；
// 红石英为加价三涂层漆；深蓝黑为 Sketchfab 参考页默认车漆，SQUIR3D 同源模型）
const ENVISION_PAINTS = [
  { id: 'cnbrown', market: 'cn', name: '托帕石棕', color: '#5d4533', metalness: 0.55, roughness: 0.3, clearcoatR: 0.03 },
  { id: 'cnwhite', market: 'cn', name: '雪域白', color: '#f2f4f2', metalness: 0.05, roughness: 0.32, clearcoatR: 0.03 },
  { id: 'cnblack', market: 'cn', name: '珍珠黑', color: '#0d0f13', metalness: 0.6, roughness: 0.3, clearcoatR: 0.03 },
  { id: 'cngray', market: 'cn', name: '陨铁灰', color: '#565a60', metalness: 0.6, roughness: 0.3, clearcoatR: 0.03 },
  { id: 'cnred', market: 'cn', name: '玛瑙红', color: '#9c1c22', metalness: 0.5, roughness: 0.28, clearcoatR: 0.03 },
  { id: 'cnpurple', market: 'cn', name: '星空紫', color: '#4a3a5e', metalness: 0.55, roughness: 0.28, clearcoatR: 0.03 },
  { id: 'cnzitan', market: 'cn', name: '紫檀红', color: '#6e2026', metalness: 0.5, roughness: 0.28, clearcoatR: 0.03 },
  { id: 'grefer', market: 'us', name: '深蓝黑', color: '#191e2a', metalness: 0.4, roughness: 0.25, clearcoatR: 0.03 },
  { id: 'swhite', market: 'us', name: '巅峰白', color: '#f2f3f1', metalness: 0.05, roughness: 0.32, clearcoatR: 0.03 },
  { id: 'ebony', market: 'us', name: '曜石暮光', color: '#181d27', metalness: 0.55, roughness: 0.28, clearcoatR: 0.03 },
  { id: 'galaxy', market: 'us', name: '银河银', color: '#c7cbd0', metalness: 0.65, roughness: 0.33, clearcoatR: 0.03 },
  { id: 'bronze', market: 'us', name: '古铜合金', color: '#77604e', metalness: 0.55, roughness: 0.3, clearcoatR: 0.03 },
  { id: 'chili', market: 'us', name: '辣椒红', color: '#a41e25', metalness: 0.5, roughness: 0.28, clearcoatR: 0.03 },
  { id: 'mosaic', market: 'us', name: '马赛克黑', color: '#0b0d10', metalness: 0.6, roughness: 0.32, clearcoatR: 0.03 },
  { id: 'satinsteel', market: 'us', name: '缎钢灰', color: '#8d9195', metalness: 0.6, roughness: 0.3, clearcoatR: 0.03 },
  { id: 'redquartz', market: 'us', name: '红石英（加价漆）', color: '#8f1620', metalness: 0.45, roughness: 0.22, clearcoatR: 0.03, note: '三涂层珠光漆，官方加价选装' },
];

const CARS = [
  {
    id: 'rav4',
    name: '丰田 RAV4',
    mark: 'RAV4',
    sub: '2012',
    glb: 'models/Rav4.glb',
    yaw: Math.PI,
    paintMats: ['Car paint (Grey)'],
    glassMats: ['Glass fine'],
    paints: PAINTS,
    paintsNote:
      '<b>说明</b> 美规色取自 2012 美版官方册：暴雪珍珠白仅 Limited 且为加价色；黑森林珍珠色、太平洋蓝金属色不可选外观套件；沙滩米金金属色、黄铁矿云母色不提供 Sport。部分美规色与国产色为同一色漆，未重复列出。',
    plates: true,
    setup: setupRav4Extras,
  },
  {
    id: 'envision',
    name: '别克昂科威',
    mark: 'ENVISION',
    sub: '2019',
    glb: 'models/Buick_Envision_2019_full.glb',
    // 源文件上下颠倒（地面在 y≈-10、车顶在 y≈-170），绕 X 翻 180° 摆正后车头即 +Z
    flip: true,
    yaw: 0,
    paintMats: ['body'],
    glassMats: [],
    paints: ENVISION_PAINTS,
    paintsNote: '<b>说明</b> 国产色取自 2019 款上汽通用昂科威官方配置（默认色托帕石棕）；美规色取自 2019 美规 Envision 官方色板（红石英为加价三涂层漆；银河银与古铜合金仅 2019 款提供，2020 款起被浓咖棕、暗月蓝取代）。',
    plates: true,
    setup: setupEnvisionExtras,
  },
  {
    id: 'sharan',
    name: '大众夏朗',
    mark: 'SHARAN',
    sub: 'MPV',
    glb: 'models/Volkswagen_Sharan_full.glb',
    yaw: Math.PI,
    paintMats: ['default.001', 'rouge pompier'],
    glassMats: ['vitres_exterieur'],
    paints: SHARAN_PAINTS,
    paintGroups: { cn: '中规（国内）', us: '海外（欧洲）' },
    paintsNote:
      '<b>说明</b> 中规色取自 2012 款进口夏朗国内官方配置的 9 色（默认色太妃褐；糖果白、正黑为标准漆，深黑为珠光漆，其余为金属漆）；海外色取自欧洲同期色板 8 色，2015 改款后新增的纯白、奥利克斯白、爪哇绿等未列入。夏朗为进口车型，中规与欧规共用葡萄牙工厂色板，多数颜色相同，故分组分别列出。',
    plates: true,
    setup: setupSharanMaterials,
  },
];

/* ---------- dom ---------- */

const toolPanelButtons = [...document.querySelectorAll('[data-panel]')];
const panels = {
  views: document.getElementById('panel-views'),
  lighting: document.getElementById('panel-lighting'),
  paint: document.getElementById('panel-paint'),
  plate: document.getElementById('panel-plate'),
};
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loaderBar');
const loaderPct = document.getElementById('loaderPct');
const loaderErr = document.getElementById('loaderErr');
const hint = document.getElementById('hint');
const btnRotate = document.getElementById('btnRotate');
const btnFullscreen = document.getElementById('btnFullscreen');

let progress = 0;
function setProgress(value) {
  progress = Math.max(progress, value);
  const pct = Math.round(Math.min(progress, 1) * 100);
  loaderBar.style.width = pct + '%';
  loaderPct.textContent = pct + '%';
}

/* ---------- environment ---------- */

const pmrem = new THREE.PMREMGenerator(renderer);

function createStudioEnv() {
  const env = new THREE.Scene();
  env.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(30, 16, 30),
      new THREE.MeshBasicMaterial({ color: 0x0a0b0c, side: THREE.BackSide })
    )
  );
  const panel = (w, h, rgb, pos, rot) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(...rgb),
        side: THREE.DoubleSide,
      })
    );
    m.position.set(...pos);
    m.rotation.set(...rot);
    env.add(m);
  };
  // 顶部主柔光：压暗，避免把整块漆面照成均匀白纸
  panel(14, 7, [0.35, 0.35, 0.33], [0, 7.4, 1], [Math.PI / 2, 0, 0]);
  // 顶部细灯条：在车顶、机盖和肩线上拉出一条连续高光，车漆真实感主要靠它
  panel(2.0, 16, [12, 11.8, 11.4], [-3.8, 7.2, 0], [Math.PI / 2, 0, 0]);
  // 左侧大面积柔光
  panel(9, 5, [3.0, 3.0, 3.0], [-13, 4, 3], [0, Math.PI / 2, 0]);
  // 右侧灯条
  panel(1.4, 6, [2.2, 2.2, 2.2], [13, 3, -4], [0, -Math.PI / 2, 0]);
  // 车身两侧低位长灯条：车门/肩线上的连续高光，车漆质感的关键
  panel(24, 0.5, [7.5, 7.4, 7.2], [-6.5, 1.15, 0], [0, Math.PI / 2, 0]);
  panel(24, 0.5, [6.5, 6.4, 6.2], [6.5, 1.3, 0], [0, -Math.PI / 2, 0]);
  // 后方轮廓灯条
  panel(7, 1.2, [2.0, 2.0, 2.0], [0, 5.4, -13.5], [0, 0, 0]);
  // 前方补光，避免灯组和车头反射成死黑
  panel(12, 5, [1.5, 1.5, 1.5], [0, 4.2, 13.5], [0, Math.PI, 0]);
  panel(10, 0.9, [3.6, 3.5, 3.4], [0, 1.0, 13.5], [0, Math.PI, 0]);
  return env;
}

const envReady = new Promise((resolve) => {
  const envScene = createStudioEnv();
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 1.0;
  envScene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  pmrem.dispose();
  setProgress(0.9);
  resolve();
});

/* ---------- model ---------- */

const ALLOY_MATS = {
  'Brushed Metal Alloy': 0xb9bdc1,
  'Steel Pro Elite: Galvanized Alloy': 0xb9bdc1,
  'Metal.001': 0xa2a6aa,
};

// 车漆表面细微的不均匀（抛光痕/橘皮），让高光不是一块死板的白斑
function createPaintRoughness() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 5 + Math.random() * 30;
    const v = 214 + Math.random() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},0.16)`);
    g.addColorStop(1, 'rgba(242,242,242,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const paintRoughness = createPaintRoughness();

function findNode(root, needle) {
  let found = null;
  root.traverse((obj) => {
    if (!found && obj.name.includes(needle)) found = obj;
  });
  return found;
}

function prepareMaterials(root, car) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.map) mat.map.anisotropy = maxAniso;
      if (car.paintMats.includes(mat.name)) {
        mat.roughnessMap = paintRoughness;
        mat.needsUpdate = true;
      }
      if (car.glassMats.includes(mat.name)) {
        // 透明黑车窗：深色染色 + 透射，能隐约看到内饰，同时保留镜面反光
        mat.transmission = 1;
        mat.thickness = 0.02;
        mat.ior = 1.45;
        mat.color.setHex(0x5b6269);
        mat.metalness = 0;
        mat.roughness = 0.03;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.specularIntensity = 1;
        mat.envMapIntensity = 1.25;
        mat.needsUpdate = true;
      }
      if (car.id === 'rav4') {
        if (mat.name === 'int.001' || mat.name === 'dash.001') {
          // 车厢被车顶遮蔽，只吃环境光，单独提亮才能透窗看见
          mat.envMapIntensity = 3.0;
          mat.needsUpdate = true;
        }
        if (ALLOY_MATS[mat.name]) {
          mat.color.setHex(ALLOY_MATS[mat.name]);
          mat.metalness = 1;
          mat.roughness = 0.45;
          mat.envMapIntensity = 1.0;
          mat.needsUpdate = true;
        }
      }
      if (mat.transparent && mat.depthWrite) mat.depthWrite = false;
    }
  });
}

function findMeshByMaterial(root, name) {
  let found = null;
  root.traverse((obj) => {
    if (!found && obj.isMesh && obj.material && obj.material.name === name) found = obj;
  });
  return found;
}

// 车标字样是网格里一簇独立三角形，拆成子网格才能按市场单独显隐或换材质
function splitTriangles(src, test, name) {
  if (!src || !src.geometry.index) return null;
  const pos = src.geometry.attributes.position;
  const idx = src.geometry.index.array;
  const v = new THREE.Vector3();
  const keep = [];
  const part = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    let x = 0;
    let y = 0;
    let z = 0;
    for (const k of [a, b, c]) {
      v.fromBufferAttribute(pos, k).applyMatrix4(src.matrixWorld);
      x += v.x;
      y += v.y;
      z += v.z;
    }
    (test(x / 3, y / 3, z / 3) ? part : keep).push(a, b, c);
  }
  if (!part.length) return null;

  src.geometry.setIndex(keep);
  const geo = new THREE.BufferGeometry();
  for (const attr of Object.keys(src.geometry.attributes)) {
    geo.setAttribute(attr, src.geometry.attributes[attr]);
  }
  geo.setIndex(part);
  const mesh = new THREE.Mesh(geo, src.material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  src.add(mesh);
  return mesh;
}

function splitBadges(root) {
  const chromeSrc = findMeshByMaterial(root, 'chrome');
  // 美规 LIMITED 门边标
  badgeMesh = splitTriangles(
    chromeSrc,
    (x, y, z) =>
      Math.abs(x) > 1.55 && Math.abs(x) < 1.66 && y > 0.98 && y < 1.08 && z > 1.27 && z < 1.55,
    'limitedBadge'
  );
  // 尾门 RAV4 的「4」是镀铬件，材质和其余字母不同
  rav4Digit = splitTriangles(
    chromeSrc,
    (x, y, z) => x > 0.66 && x < 0.75 && y > 1.57 && y < 1.66 && z < -3.8,
    'tailRav4Digit'
  );
  // 尾门字标 TOYOTA / RAV4 在车壳那块 black_m 网格里（同材质的还有四个轮毂）
  const shells = [];
  root.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.name === 'black_m' && obj.geometry.index) {
      shells.push(obj);
    }
  });
  shells.sort((a, b) => b.geometry.index.count - a.geometry.index.count);
  const tail = shells[0];
  rav4Badge = splitTriangles(
    tail,
    (x, y, z) => x > 0.66 && x < 0.985 && y > 1.572 && y < 1.665 && z < -3.8,
    'tailRav4'
  );
  toyotaBadge = splitTriangles(
    tail,
    (x, y, z) => x > 0.985 && x < 1.2 && y > 1.572 && y < 1.665 && z < -3.775,
    'tailToyota'
  );

  if (toyotaBadge) {
    toyotaBaseMat = toyotaBadge.material;
    toyotaChromeMat = new THREE.MeshStandardMaterial({
      color: 0xc3ccd4,
      metalness: 0.35,
      roughness: 0.3,
      envMapIntensity: 1.0,
    });
    toyotaChromeMat.name = 'badgeChrome';
  }
}

// 汉字/字母徽标用画布贴图：银白渐变 + 深色描边，白车上也能看清轮廓
// dark 模式给尾门阴影区的标用：深色金属质感，灰暗漆面上依然高对比
function badgeTexture(text, pxH, italic, dark) {
  const pad = Math.round(pxH * 0.16);
  const font = `${italic ? 'italic ' : ''}700 ${Math.round(pxH * 0.8)}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const tw = Math.ceil(probe.measureText(text).width);

  const c = document.createElement('canvas');
  c.width = tw + pad * 2;
  c.height = pxH;
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const g = ctx.createLinearGradient(0, pxH * 0.08, 0, pxH * 0.94);
  if (dark) {
    g.addColorStop(0, '#23282e');
    g.addColorStop(0.25, '#171b20');
    g.addColorStop(0.6, '#15191e');
    g.addColorStop(0.85, '#1a1f25');
    g.addColorStop(1, '#2a3037');
  } else {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#dfe7ee');
    g.addColorStop(0.6, '#9ea8b1');
    g.addColorStop(0.82, '#f2f6f9');
    g.addColorStop(1, '#b3bdc5');
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = pxH * (dark ? 0.06 : 0.04);
  ctx.strokeStyle = dark ? 'rgba(8,11,14,0.95)' : 'rgba(38,44,51,0.78)';
  ctx.strokeText(text, pad, pxH * 0.52);
  ctx.fillStyle = g;
  ctx.fillText(text, pad, pxH * 0.52);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { tex, aspect: c.width / c.height };
}

// 尾门钣金在横竖两个方向都有弧度，一块平面贴标和漆面之间会有 6~14mm 的离缝
// （RAV4 右上角最严重）。改成在徽标矩形上采样 z 网格，有限差分求曲面法线，
// 逐顶点贴合曲面并沿法线外偏 1.5mm，整块标随钣金起伏。
// 贴图正面绕 Y 转 180° 朝向车尾：从后方看文字才正读，法线也朝外，
// 背面渲染的那种做法会让字反着、法线反着，边缘反光像一圈亮线
function createRearBadges() {
  const raycaster = new THREE.Raycaster();
  // 贴标要贴在压平后的国产漆面上：那一刻它还是隐藏状态，不能靠 visible 过滤，
  // 否则会取到没压平的原车凸起，贴片整块陷进漆里，只露出一条边
  const probeTarget = bodyPaintCN || carRoot;
  const probe = (x, y) => {
    raycaster.set(new THREE.Vector3(x, y, -8), new THREE.Vector3(0, 0, 1));
    const hit = raycaster.intersectObject(probeTarget, true).find((h) => h.object.isMesh);
    return hit ? hit.point.z : -3.81;
  };

  const group = new THREE.Group();
  group.name = 'cnBadges';
  const items = [
    { text: '一汽丰田', h: 0.06, x: 0.79, y: 1.609 },
    { text: 'RAV4', h: 0.088, x: 0.925, y: 1.532, italic: true },
    { text: '4WD', h: 0.05, x: -1.08, y: 1.53 },
  ];

  const LIFT = 0.0027;
  items.forEach((it) => {
    const { tex, aspect } = badgeTexture(it.text, 128, it.italic);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.3,
      metalness: 0.18,
      roughness: 0.34,
      envMapIntensity: 1.0,
    });
    const w = it.h * aspect;
    const nx = 8;
    const ny = 2;
    const geo = new THREE.PlaneGeometry(w, it.h, nx, ny);
    const posAttr = geo.attributes.position;
    const norAttr = geo.attributes.normal;

    const zs = new Float32Array((nx + 1) * (ny + 1));
    const fx = new Float32Array((nx + 1) * (ny + 1));
    const fy = new Float32Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        zs[j * (nx + 1) + i] = probe(
          it.x + (i / nx - 0.5) * w,
          it.y + (j / ny - 0.5) * it.h
        );
      }
    }
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const k = j * (nx + 1) + i;
        const iL = Math.max(0, i - 1);
        const iR = Math.min(nx, i + 1);
        const jD = Math.max(0, j - 1);
        const jU = Math.min(ny, j + 1);
        fx[k] = (zs[j * (nx + 1) + iR] - zs[j * (nx + 1) + iL]) / (((iR - iL) * w) / nx || 1);
        fy[k] = (zs[jU * (nx + 1) + i] - zs[jD * (nx + 1) + i]) / (((jU - jD) * it.h) / ny || 1);
      }
    }

    for (let v = 0; v < posAttr.count; v++) {
      const lx = posAttr.getX(v);
      const ly = posAttr.getY(v);
      const u = (lx / w + 0.5) * nx;
      const vv = (ly / it.h + 0.5) * ny;
      const gi = Math.min(nx - 1, Math.max(0, Math.floor(u)));
      const gj = Math.min(ny - 1, Math.max(0, Math.floor(vv)));
      const fu = u - gi;
      const fv = vv - gj;
      const k00 = gj * (nx + 1) + gi;
      const k10 = k00 + 1;
      const k01 = k00 + nx + 1;
      const k11 = k01 + 1;
      const z = (zs[k00] * (1 - fu) + zs[k10] * fu) * (1 - fv) + (zs[k01] * (1 - fu) + zs[k11] * fu) * fv;
      const dx = (fx[k00] * (1 - fu) + fx[k10] * fu) * (1 - fv) + (fx[k01] * (1 - fu) + fx[k11] * fu) * fv;
      const dy = (fy[k00] * (1 - fu) + fy[k10] * fu) * (1 - fv) + (fy[k01] * (1 - fu) + fy[k11] * fu) * fv;
      const inv = 1 / Math.hypot(dx, dy, 1);
      // 网格整体绕 Y 转 180°（mesh.rotation.y = PI）：世界坐标 (x, y, z) 的局部写法
      // 是 (-x, y, -z)，法线同理，UV 不动——贴图正面正好朝向车尾
      posAttr.setXYZ(v, -lx, ly, LIFT * inv - z);
      norAttr.setXYZ(v, -dx * inv, dy * inv, inv);
    }
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;
    // 位置覆盖成 -lx 之后贴图在水平方向是镜像的（u=0 落在世界 -x 一侧）：
    // 翻回 u，让文字从车尾正后方正读
    const uvAttr = geo.attributes.uv;
    for (let v = 0; v < uvAttr.count; v++) uvAttr.setX(v, 1 - uvAttr.getX(v));
    uvAttr.needsUpdate = true;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(it.x, it.y, 0);
    mesh.rotation.y = Math.PI;
    group.add(mesh);
  });

  scene.add(group);
  carRoot.attach(group);
  cnBadgeGroup = group;
}

// 美规 4WD 标：与 RAV4 字标同高（y≈1.62）、贴备胎罩右侧钣金（视者右手 = 世界 -x），
// 真实 3D 立体字 + 与 TOYOTA 字标相同的镀铬材质；底面逐顶点贴合尾门曲面
function create4wdBadge() {
  const raycaster = new THREE.Raycaster();
  const probe = (x, y) => {
    raycaster.set(new THREE.Vector3(x, y, -8), new THREE.Vector3(0, 0, 1));
    const hit = raycaster.intersectObject(carRoot, true).find((h) => h.object.isMesh);
    return hit ? hit.point.z : -3.81;
  };

  const it = { text: '4WD', size: 0.05, x: -1.12, y: 1.62 };
  const LIFT = 0.0027;

  const font = new FontLoader().parse(helvetiker);
  const geo = new TextGeometry(it.text, {
    font,
    size: it.size,
    depth: 0.006,
    curveSegments: 6,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 2,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, 0);
  geo.computeBoundingBox();
  const w = geo.boundingBox.max.x - geo.boundingBox.min.x;
  const h = geo.boundingBox.max.y - geo.boundingBox.min.y;

  const nx = 8;
  const ny = 2;
  const zs = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      zs[j * (nx + 1) + i] = probe(
        it.x - (i / nx - 0.5) * w,
        it.y + (j / ny - 0.5) * h
      );
    }
  }
  const posAttr = geo.attributes.position;
  for (let v = 0; v < posAttr.count; v++) {
    const lx = posAttr.getX(v);
    const ly = posAttr.getY(v);
    const rel = posAttr.getZ(v);
    const u = Math.min(nx, Math.max(0, (lx / w + 0.5) * nx));
    const vv = Math.min(ny, Math.max(0, (ly / h + 0.5) * ny));
    const gi = Math.min(nx - 1, Math.max(0, Math.floor(u)));
    const gj = Math.min(ny - 1, Math.max(0, Math.floor(vv)));
    const fu = u - gi;
    const fv = vv - gj;
    const k00 = gj * (nx + 1) + gi;
    const k10 = k00 + 1;
    const k01 = k00 + nx + 1;
    const k11 = k01 + 1;
    const z = (zs[k00] * (1 - fu) + zs[k10] * fu) * (1 - fv) + (zs[k01] * (1 - fu) + zs[k11] * fu) * fv;
    posAttr.setZ(v, LIFT - z + rel);
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  // 电镀银：高金属度近镜面 + 银灰漫反射底色，低粗糙度拉出锐利反光
  const mat = new THREE.MeshStandardMaterial({
    color: 0xdde2e7,
    metalness: 0.85,
    roughness: 0.09,
    envMapIntensity: 2.2,
  });
  mat.name = 'badgeChrome';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'us4wdBadge';
  mesh.position.set(it.x, it.y, 0);
  mesh.rotation.y = Math.PI;
  scene.add(mesh);
  carRoot.attach(mesh);
}

/* ---------- 国产尾部：尾门牌照坑抹平 + 保险杠中央压出平整牌照位 ---------- */

const CN_PAD_Z = -4.025;
const CN_PLATE_Y = 0.895;

function smoothRange(a, b, x) {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

// 把顶点的世界 z 拉向目标面，并按目标面的解析法线重写这一段法线；
// 只挪位置的话，凹槽残留的旧法线会让补平的面看上去仍是个坑
function flattenZone(mesh, targetZAt, weightAt) {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const world = mesh.matrixWorld;
  const inv = new THREE.Matrix4().copy(world).invert();
  const nm = new THREE.Matrix3().getNormalMatrix(world);
  const invNm = new THREE.Matrix3().copy(nm).invert().transpose();
  const invLin = new THREE.Matrix3().setFromMatrix4(inv);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  // 同一个位置常有多份顶点（法线被拆开），跳过判断必须按位置统一：
  // 否则一份被拉走、一份留在原地，网格会被撕开一道缝
  const keyOf = (v) => Math.round(v.x * 500) + '_' + Math.round(v.y * 500) + '_' + Math.round(v.z * 500);
  const blocked = new Set();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(world);
    if (weightAt(p) <= 0.001) continue;
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    // 朝车头一侧的面不参与，避免把尾部内侧钣金拽出来
    if (n.z > 0.5) blocked.add(keyOf(p));
  }
  const h = 0.004;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(world);
    const w = weightAt(p);
    if (w <= 0.001 || blocked.has(keyOf(p))) continue;
    d.set(0, 0, (targetZAt(p) - p.z) * w).applyMatrix3(invLin);
    pos.setXYZ(i, pos.getX(i) + d.x, pos.getY(i) + d.y, pos.getZ(i) + d.z);
    // 目标面 z = f(x, y) 的法线是 (f_x, f_y, -1)，中心差分求；再按权重混回原法线，
    // 边界上仍保留原法线，和周围钣金之间才不会出现一道生硬的明暗分界
    a.set(p.x + h, p.y, 0);
    b.set(p.x - h, p.y, 0);
    const fx = (targetZAt(a) - targetZAt(b)) / (2 * h);
    a.set(p.x, p.y + h, 0);
    b.set(p.x, p.y - h, 0);
    const fy = (targetZAt(a) - targetZAt(b)) / (2 * h);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    n.lerp(a.set(fx, fy, -1).normalize(), w).normalize();
    n.applyMatrix3(invNm).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geo.computeBoundingSphere();
}

// 二次曲面 z = a + bx + cy + dx² + exy + fy²，用牌照坑外圈的原车钣金拟合；
// 坑内补平后能顺着尾门弧度，而不是一块死平的补丁
// 美规尾门牌照凹槽外框（世界坐标），凹槽底板和四周凸边都在这块里
const CN_CUT = { x0: 0.435, x1: 1.225, y0: 1.085, y1: 1.558 };

function inTailgatePanel(x, y) {
  return x > CN_CUT.x0 && x < CN_CUT.x1 && y > CN_CUT.y0 && y < CN_CUT.y1;
}

// 尾门凹槽外圈的原车钣金采样点：只用这一层，避免把内衬、备胎罩、保险杠混进来
function collectSkinRing(mesh) {
  const world = mesh.matrixWorld;
  const pos = mesh.geometry.attributes.position;
  const nor = mesh.geometry.attributes.normal;
  const nm = new THREE.Matrix3().getNormalMatrix(world);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const pts = [];
  const seen = new Set();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(world);
    if (v.z > -3.79 || v.z < -3.92) continue;
    if (v.x < 0.34 || v.x > 1.235 || v.y < 1.05 || v.y > 1.61) continue;
    if (inTailgatePanel(v.x, v.y)) continue;
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    if (n.z > -0.5) continue;
    const key = Math.round(v.x * 60) + "_" + Math.round(v.y * 60);
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push([v.x, v.y, v.z]);
  }
  return pts;
}

// 用外圈钣金做二次曲面最小二乘：z = c0 + c1u + c2v + c3u² + c4uv + c5v²。
// 凹槽翻边、内衬这些离群点靠 Tukey 权重反复压掉，补出来的面才和周围钣金贴合；
// 反距离加权会被最近的翻边点拽偏，补出来的面在顶部能低 7mm，留下一道浅沟
function makeSkinSurface(ring) {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  cx /= ring.length;
  cy /= ring.length;

  const rows = ring.map(([x, y, z]) => {
    const u = x - cx;
    const v = y - cy;
    return [1, u, v, u * u, u * v, v * v, z];
  });

  const solve = (ws) => {
    const A = new Float64Array(36);
    const b = new Float64Array(6);
    for (let k = 0; k < rows.length; k++) {
      const w = ws[k];
      if (w <= 0) continue;
      const f = rows[k];
      for (let i = 0; i < 6; i++) {
        b[i] += w * f[i] * f[6];
        for (let j = 0; j < 6; j++) A[i * 6 + j] += w * f[i] * f[j];
      }
    }
    for (let col = 0; col < 6; col++) {
      let piv = col;
      for (let r = col + 1; r < 6; r++) {
        if (Math.abs(A[r * 6 + col]) > Math.abs(A[piv * 6 + col])) piv = r;
      }
      if (piv !== col) {
        for (let j = 0; j < 6; j++) {
          const t = A[col * 6 + j];
          A[col * 6 + j] = A[piv * 6 + j];
          A[piv * 6 + j] = t;
        }
        const t = b[col];
        b[col] = b[piv];
        b[piv] = t;
      }
      const d = A[col * 6 + col] || 1e-12;
      for (let r = col + 1; r < 6; r++) {
        const k = A[r * 6 + col] / d;
        if (k === 0) continue;
        for (let j = col; j < 6; j++) A[r * 6 + j] -= k * A[col * 6 + j];
        b[r] -= k * b[col];
      }
    }
    const c = new Float64Array(6);
    for (let i = 5; i >= 0; i--) {
      let sum = b[i];
      for (let j = i + 1; j < 6; j++) sum -= A[i * 6 + j] * c[j];
      c[i] = sum / (A[i * 6 + i] || 1e-12);
    }
    return c;
  };

  let ws = new Array(rows.length).fill(1);
  let c = solve(ws);
  for (let it = 0; it < 12; it++) {
    const res = rows.map(
      (f) => f[6] - (c[0] + c[1] * f[1] + c[2] * f[2] + c[3] * f[3] + c[4] * f[4] + c[5] * f[5])
    );
    const abs = res.map(Math.abs).sort((a, b) => a - b);
    const k = Math.max(abs[abs.length >> 1] * 1.4826 * 2.5, 1e-4);
    ws = res.map((v) => {
      const t = v / k;
      return Math.abs(t) >= 1 ? 0 : (1 - t * t) * (1 - t * t);
    });
    if (ws.reduce((a, b) => a + b, 0) < 6) break;
    c = solve(ws);
  }

  // 补出来的面只用来填凹槽，四处都按同一张曲面走，法线才连贯
  const zAt = (x, y) => {
    const u = x - cx;
    const v = y - cy;
    return c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * u * v + c[5] * v * v;
  };
  return { zAt };
}

/* ---------- 国产车牌贴图：浏览器端 Canvas 生成 ---------- */

const PLATE_W = 2200;
const PLATE_H = 700;
const PLATE_CELL = 225; // 45mm 字格
const PLATE_GAP = 60; // 12mm 字间距
const PLATE_BIG_GAP = 170; // 2/3 位之间 34mm（含分隔点）
const PLATE_CHAR_H = 450; // 90mm 字高
const PLATE_DOT = 50; // 10mm 分隔点
const PLATE_RE = /^[\u4e00-\u9fa5][A-Z][A-Z0-9]{5}$/;
const PLATE_DEFAULT = '蒙A88888';
const PLATE_STORE_KEY = 'cnPlateNo';

function readPlateNumber() {
  try {
    const v = localStorage.getItem(PLATE_STORE_KEY);
    if (v && PLATE_RE.test(v)) return v;
  } catch {
    /* 隐私模式下 localStorage 不可用 */
  }
  return PLATE_DEFAULT;
}

let cnPlateNumber = readPlateNumber();
let cnPlateMaps = null;

function plateCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function plateLatinFont(px) {
  return `${px}px "PlateChar", "Arial Narrow", Arial, sans-serif`;
}

function plateCjkFont(px) {
  return `700 ${px}px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif`;
}

// 按实际墨迹包围盒取字形，再等比缩放到字格
function plateGlyph(ch, font) {
  const probe = plateCanvas(8, 8).getContext('2d');
  probe.font = font;
  const m = probe.measureText(ch);
  const pad = 6;
  const w = Math.max(1, Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight));
  const h = Math.max(1, Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent));
  const c = plateCanvas(w + pad * 2, h + pad * 2);
  const g = c.getContext('2d');
  g.font = font;
  g.fillStyle = '#fff';
  g.fillText(ch, m.actualBoundingBoxLeft + pad, m.actualBoundingBoxAscent + pad);
  return { canvas: c, w, h, pad };
}

function stampPlateGlyph(ctx, glyph, cellX, targetW, targetH) {
  const sx = targetW / glyph.w;
  const sy = targetH / glyph.h;
  const x = cellX + (PLATE_CELL - targetW) / 2 - glyph.pad * sx;
  const y = (PLATE_H - PLATE_CHAR_H) / 2 + (PLATE_CHAR_H - targetH) / 2 - glyph.pad * sy;
  ctx.drawImage(glyph.canvas, x, y, (glyph.w + glyph.pad * 2) * sx, (glyph.h + glyph.pad * 2) * sy);
}

function drawPlateInk(ctx, number) {
  const total = PLATE_CELL * 7 + PLATE_GAP * 5 + PLATE_BIG_GAP;
  const x0 = Math.round((PLATE_W - total) / 2);
  let cx = x0;
  for (let i = 0; i < number.length; i++) {
    const isRegion = i === 0;
    const glyph = plateGlyph(number[i], isRegion ? plateCjkFont(600) : plateLatinFont(600));
    // 汉字压成 45×90mm 字格；字母数字保持原比例，过宽的压到字格宽
    let tw = isRegion
      ? PLATE_CELL
      : Math.max(1, Math.round((glyph.w * PLATE_CHAR_H) / glyph.h));
    if (!isRegion && tw > PLATE_CELL * 1.04) tw = Math.round(PLATE_CELL * 1.04);
    stampPlateGlyph(ctx, glyph, cx, tw, PLATE_CHAR_H);
    cx += PLATE_CELL + (i === 1 ? PLATE_BIG_GAP : PLATE_GAP);
  }
  const dotX = x0 + PLATE_CELL * 2 + PLATE_GAP + PLATE_BIG_GAP / 2;
  ctx.beginPath();
  ctx.arc(dotX, PLATE_H / 2, PLATE_DOT / 2, 0, Math.PI * 2);
  ctx.fill();
}

function plateBorderPath(ctx, inset, radius) {
  const x = inset;
  const y = inset;
  const w = PLATE_W - inset * 2;
  const h = PLATE_H - inset * 2;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPlateAlbedo(number) {
  const c = plateCanvas(PLATE_W, PLATE_H);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, PLATE_H);
  grad.addColorStop(0, '#080a76');
  grad.addColorStop(1, '#030356');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, PLATE_W, PLATE_H);
  ctx.fillStyle = '#fafaf7';
  ctx.strokeStyle = '#fafaf7';
  ctx.lineWidth = 17; // 3.4mm 白框
  plateBorderPath(ctx, 17, 30);
  ctx.stroke();
  drawPlateInk(ctx, number);
  return c;
}

function drawPlateNormal(number) {
  const mask = plateCanvas(PLATE_W, PLATE_H);
  const m = mask.getContext('2d');
  m.fillStyle = '#000';
  m.fillRect(0, 0, PLATE_W, PLATE_H);
  m.fillStyle = '#fff';
  m.strokeStyle = '#fff';
  m.lineWidth = 17;
  plateBorderPath(m, 17, 30);
  m.stroke();
  drawPlateInk(m, number);

  // 半分辨率足够：车牌只是微浮雕
  const w = PLATE_W / 2;
  const h = PLATE_H / 2;
  const half = plateCanvas(w, h);
  const hctx = half.getContext('2d');
  hctx.filter = 'blur(1.6px)';
  hctx.drawImage(mask, 0, 0, w, h);
  hctx.filter = 'none';
  const src = hctx.getImageData(0, 0, w, h).data;

  const height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const t = Math.min(1, Math.max(0, (src[i * 4] / 255 - 0.5) * 2.4 + 0.5));
    height[i] = t * 0.75; // mm
  }

  const out = hctx.createImageData(w, h);
  const pxPerMm = 2.5; // 半分辨率：1px = 0.4mm
  for (let y = 0; y < h; y++) {
    const yu = y > 0 ? y - 1 : y;
    const yd = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xl = x > 0 ? x - 1 : x;
      const xr = x < w - 1 ? x + 1 : x;
      const gx = (height[y * w + xr] - height[y * w + xl]) / (xr - xl);
      const gy = (height[yd * w + x] - height[yu * w + x]) / (yd - yu);
      const nx = -gx * pxPerMm;
      const ny = -gy * pxPerMm;
      const len = Math.hypot(nx, ny, 1);
      const o = i * 4;
      out.data[o] = (nx / len / 2 + 0.5) * 255;
      out.data[o + 1] = (ny / len / 2 + 0.5) * 255;
      out.data[o + 2] = (1 / len / 2 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  const c = plateCanvas(w, h);
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

function buildCnPlateMaps(number) {
  const albedo = drawPlateAlbedo(number);
  const normalCanvas = drawPlateNormal(number);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  if (!cnPlateMaps) {
    const map = new THREE.CanvasTexture(albedo);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = aniso;
    const normalMap = new THREE.CanvasTexture(normalCanvas);
    normalMap.anisotropy = aniso;
    cnPlateMaps = { map, normalMap };
  } else {
    cnPlateMaps.map.image = albedo;
    cnPlateMaps.map.needsUpdate = true;
    cnPlateMaps.normalMap.image = normalCanvas;
    cnPlateMaps.normalMap.needsUpdate = true;
  }
  cnPlateNumber = number;
}

function getCnPlateMaps() {
  if (!cnPlateMaps) buildCnPlateMaps(cnPlateNumber);
  return cnPlateMaps;
}

// 字体就绪前先用系统字体兜底，加载完再按当前号码重绘一次
const plateFontReady = (async () => {
  try {
    const face = new FontFace('PlateChar', "url('fonts/platechar.ttf')");
    await face.load();
    document.fonts.add(face);
  } catch (e) {
    console.warn('车牌字体加载失败，改用系统字体', e);
  }
  if (cnPlateMaps) buildCnPlateMaps(cnPlateNumber);
})();

const cnBoltGeo = new THREE.SphereGeometry(0.0095, 20, 12);
const cnBoltMat = new THREE.MeshStandardMaterial({ color: 0xc3c8cd, metalness: 0.95, roughness: 0.25 });

// 牌照四角实车都有固定螺栓，压平在字行上下两侧
function addPlateBolts(group, x0, y0, z0, dir) {
  for (const bx of [-0.193, 0.193]) {
    for (const by of [-0.101, 0.101]) {
      const bolt = new THREE.Mesh(cnBoltGeo, cnBoltMat);
      bolt.scale.set(1, 1, 0.22);
      bolt.position.set(x0 + bx, y0 + by, z0 + dir * 0.0052);
      bolt.castShadow = true;
      group.add(bolt);
    }
  }
}
function createCnRearPlate(root) {
  const group = new THREE.Group();
  group.name = 'cnRearPlate';

  // 国产蓝牌直接替换尾门上的美规加州牌：位置、朝向取自美规牌实测，尺寸保持 440:140 牌面比例
  usPlateMesh.updateWorldMatrix(true, false);
  const up = usPlateMesh.geometry.attributes.position;
  const um = usPlateMesh.matrixWorld;
  const v = new THREE.Vector3();
  const min = new THREE.Vector3(1e9, 1e9, 1e9);
  const max = new THREE.Vector3(-1e9, -1e9, -1e9);
  const world = [];
  for (let i = 0; i < up.count; i++) {
    v.fromBufferAttribute(up, i).applyMatrix4(um);
    world.push(v.clone());
    min.min(v);
    max.max(v);
  }
  // 朝向和朝外面用三角面几何法线求，避免依赖 GLB 里被量化过的顶点法线
  const idx = usPlateMesh.geometry.index;
  const triCount = idx ? idx.count / 3 : up.count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const nsum = new THREE.Vector3();
  const tris = [];
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.copy(world[i0]);
    b.copy(world[i1]);
    c.copy(world[i2]);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const n = new THREE.Vector3().crossVectors(ab, ac);
    const area = n.length();
    if (area < 1e-12) continue;
    n.divideScalar(area);
    nsum.addScaledVector(n, area);
    tris.push({ i0, i1, i2, n });
  }
  nsum.normalize();
  // 牌面深度取美规牌朝外面顶点均值：牌面带倾角，包围盒 max.z 会把蓝牌埋进凹槽约 3cm，被凹槽上沿斜面挡住
  const fsum = new THREE.Vector3();
  const sel = new Set();
  for (const tri of tris) {
    if (tri.n.dot(nsum) <= 0.5) continue;
    for (const i of [tri.i0, tri.i1, tri.i2]) {
      if (sel.has(i)) continue;
      sel.add(i);
      fsum.add(world[i]);
    }
  }
  const fcnt = sel.size;
  if (fcnt) fsum.divideScalar(fcnt);
  // 牌照比凹槽更宽更矮，接近真实蓝牌观感；字带仍按 440:140 真实比例居中
  const plateW = 0.6;
  const plateH = 0.21;
  // 车牌面（Box 的 -z 面）正好落到美规牌朝外面的实测平面上，与凹槽保持美规牌原有的贴合深度
  group.position.set(
    (min.x + max.x) / 2,
    (min.y + max.y) / 2,
    fcnt ? fsum.z : max.z
  );
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), nsum);

  const plinthMat = bodyPaintCN ? bodyPaintCN.material : new THREE.MeshStandardMaterial({ color: 0xdddddd });
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(plateW + 0.02, max.y - min.y + 0.02, 0.006),
    plinthMat
  );
  plinth.position.set(0, 0, 0.008);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const faceMat = new THREE.MeshPhysicalMaterial({
    ...getCnPlateMaps(),
    normalScale: new THREE.Vector2(1.6, 1.6),
    metalness: 0.0,
    roughness: 0.62,
    envMapIntensity: 0.1,
    clearcoat: 0.0,
    clearcoatRoughness: 0.6,
  });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xcfd4d9,
    metalness: 0.35,
    roughness: 0.45,
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, 0.008), [
    edgeMat, edgeMat, edgeMat, edgeMat, edgeMat, faceMat,
  ]);
  plate.castShadow = true;
  group.add(plate);

  // 贴图只占中央真实比例带，上下蓝底由纹理边缘色自然延伸。
  // u 朝向：从车后看屏幕左 = 世界 +x（车右），京在 u=0 必须落在本地 +x，与车头牌同侧。
  const ua = plate.geometry.attributes.uv;
  const pa = plate.geometry.attributes.position;
  const bandFrac = (plateW * (700 / 2200)) / plateH;
  const vb0 = (1 - bandFrac) / 2;
  for (let i = 0; i < pa.count; i++) {
    if (pa.getZ(i) < -0.0039) {
      ua.setXY(i, 0.5 - pa.getX(i) / plateW, vb0 + (0.5 + pa.getY(i) / plateH) * bandFrac);
    }
  }
  ua.needsUpdate = true;

  // 螺栓仿车头牌：落在京与数字之间的空隙（u 0.256 / 0.744），离上下边 25mm
  const boltX = (0.5 - 0.256) * plateW;
  const boltY = plateH / 2 - 0.025;
  for (const bx of [-boltX, boltX]) {
    for (const by of [-boltY, boltY]) {
      const bolt = new THREE.Mesh(cnBoltGeo, cnBoltMat);
      bolt.scale.set(1, 1, 0.22);
      bolt.position.set(bx, by, -0.0052);
      group.add(bolt);
    }
  }

  scene.add(group);
  root.attach(group);
  cnRearGroup = group;
}

function createCnFrontPlate(root) {
  const group = new THREE.Group();
  group.name = "cnFrontPlate";

  const plinthMat = bodyPaintCN
    ? bodyPaintCN.material
    : new THREE.MeshStandardMaterial({ color: 0xdddddd });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.83, 0.29, 0.008), plinthMat);
  plinth.position.set(0.035, 0.895, 4.171);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const faceMat = new THREE.MeshPhysicalMaterial({
    ...getCnPlateMaps(),
    normalScale: new THREE.Vector2(1.6, 1.6),
    metalness: 0.0,
    roughness: 0.62,
    envMapIntensity: 0.1,
    clearcoat: 0.0,
    clearcoatRoughness: 0.6,
  });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xcfd4d9,
    metalness: 0.35,
    roughness: 0.45,
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.79, 0.252, 0.008), [
    edgeMat,
    edgeMat,
    edgeMat,
    edgeMat,
    faceMat,
    edgeMat,
  ]);
  plate.position.set(0.035, 0.895, 4.179);
  plate.castShadow = true;
  group.add(plate);
  addPlateBolts(group, 0.035, 0.895, 4.179, 1);

  scene.add(group);
  root.attach(group);
  cnFrontGroup = group;
}

// 昂科威车牌：GLB 里前后牌照是两块独立的 'plates' 网格（世界坐标单位 cm），
// 国产色挂国产蓝牌（真牌 44×14cm），美规色显示原厂牌照。构建方式同 RAV4 尾牌：
// 实测网格包围盒与朝外法线，牌面落到原牌照朝外面的实际平面与倾角上
function createEnvisionCnPlate(mesh, bodyMat) {
  mesh.updateWorldMatrix(true, false);
  const pos = mesh.geometry.attributes.position;
  const nor = mesh.geometry.attributes.normal;
  const mw = mesh.matrixWorld;
  const nm = new THREE.Matrix3().getNormalMatrix(mw);
  const v = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const min = new THREE.Vector3(1e9, 1e9, 1e9);
  const max = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mw);
    min.min(v);
    max.max(v);
  }
  // 牌照是封闭盒子网格，正反两面法线互相抵消，整体均值不可用；
  // 朝外方向取牌面中心相对车中心的主轴方向（车头牌 +z、车尾牌 -z）
  const c = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const ref = new THREE.Vector3();
  carRoot.getWorldPosition(ref);
  const d = c.sub(ref);
  const ax = Math.abs(d.x) >= Math.abs(d.y) && Math.abs(d.x) >= Math.abs(d.z) ? 'x'
    : Math.abs(d.y) >= Math.abs(d.z) ? 'y' : 'z';
  const outward = new THREE.Vector3();
  outward[ax] = Math.sign(d[ax]) || 1;
  // 只取朝外一面的顶点：面中心定牌面位置（带倾角的尾门牌照也落在实际斜面上），
  // 面法线定朝向
  const fsum = new THREE.Vector3();
  const nsum = new THREE.Vector3();
  let fcnt = 0;
  for (let i = 0; i < pos.count; i++) {
    nv.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    if (nv.dot(outward) > 0.5) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw);
      fsum.add(v);
      nsum.add(nv);
      fcnt++;
    }
  }
  if (fcnt) {
    fsum.divideScalar(fcnt);
    nsum.normalize();
  } else {
    fsum.copy(c);
    nsum.copy(outward);
  }

  const group = new THREE.Group();
  group.name = 'cnEnvisionPlate';
  group.position.copy(fsum);
  // 定向不能直接用 setFromUnitVectors：牌照法线几乎与 (0,0,-1) 反向时，
  // 微小的倾斜分量会决定绕 X 还是绕 Y 转 180°，两种结果「蒙」字朝向相反。
  // 这里显式构造正交基：牌面法线朝外（局部 -z → 世界 n），牌面 +x 轴固定落在
  // 观察者左侧（车头牌世界 -x、车尾牌世界 +x），+y 不会翻转
  const e3 = nsum.clone().negate();
  const e1raw = new THREE.Vector3(nsum.z > 0 ? -1 : 1, 0, 0);
  const e1 = e1raw.addScaledVector(e3, -e1raw.dot(e3)).normalize();
  const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1, e2, e3));

  // 凹槽比真牌宽（约 51×12.7cm），车漆色基座盖住整条凹槽，蓝牌 44×14 居中
  const plinthMat = bodyMat || new THREE.MeshStandardMaterial({ color: 0xdddddd });
  const plinthW = max.x - min.x + 2;
  const plinthH = max.y - min.y + 2;
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(plinthW, plinthH, 0.6),
    plinthMat
  );
  plinth.position.set(0, 0, 0.8);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const plateW = 44;
  const plateH = 14;
  const faceMat = new THREE.MeshPhysicalMaterial({
    ...getCnPlateMaps(),
    normalScale: new THREE.Vector2(1.6, 1.6),
    metalness: 0.0,
    roughness: 0.62,
    envMapIntensity: 0.1,
    clearcoat: 0.0,
    clearcoatRoughness: 0.6,
  });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xcfd4d9,
    metalness: 0.35,
    roughness: 0.45,
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, 0.8), [
    edgeMat, edgeMat, edgeMat, edgeMat, edgeMat, faceMat,
  ]);
  plate.castShadow = true;
  group.add(plate);

  // 贴图 2200×700 整体宽高比与 44×14 牌面一致，v 直接铺满；
  // u 取镜像（u=0 在本地 +x），车头车尾看过去「蒙」都在观察者左侧
  const ua = plate.geometry.attributes.uv;
  const pa = plate.geometry.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    if (pa.getZ(i) < -0.39) {
      ua.setXY(i, 0.5 - pa.getX(i) / plateW, 0.5 + pa.getY(i) / plateH);
    }
  }
  ua.needsUpdate = true;

  // 四角螺栓：与 RAV4 同款球头，落在汉字与数字之间空隙（u 0.256 / 0.744），离上下边 25mm
  const boltX = (0.5 - 0.256) * plateW;
  const boltY = plateH / 2 - 2.5;
  for (const bx of [-boltX, boltX]) {
    for (const by of [-boltY, boltY]) {
      const bolt = new THREE.Mesh(cnBoltGeo, cnBoltMat);
      bolt.scale.set(100, 100, 22);
      bolt.position.set(bx, by, -0.52);
      group.add(bolt);
    }
  }

  scene.add(group);
  carRoot.attach(group);
  return { group, outZ: fsum.z };
}

function setupEnvisionExtras(model) {
  envisionPlateMeshes = [];
  const bodyMat = findMeshByMaterial(model, 'body')?.material || null;
  model.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.name === 'plates') {
      envisionPlateMeshes.push(obj);
    }
  });
  for (const m of envisionPlateMeshes) {
    const { group, outZ } = createEnvisionCnPlate(m, bodyMat);
    if (outZ > 0) envisionCnFront = group;
    else envisionCnRear = group;
  }
}

// 压平只改 z 不动 y。原模型凹槽上沿有一道 3.5mm 宽的折叠缝，中间还有一条折痕，
// 压平后它们都变成和漆面几乎共面的零宽度面片，深度上和漆面互掐，远看就是断续的黑线。
// 每条都用一条窄补片盖住：补片两端取缝两侧钣金的实际高度和法线，整体只外偏 0.4mm
function patchTailgateBand(cnPaint, yRibbonLow, yRibbonHigh, sampleLow, sampleHigh, x0, x1) {
  const world = cnPaint.matrixWorld;
  const geo = cnPaint.geometry;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const nm = new THREE.Matrix3().getNormalMatrix(world);
  const low = new Map();
  const high = new Map();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(world);
    if (p.x < 0.42 || p.x > 1.25 || p.z < -3.95 || p.z > -3.7) continue;
    const isLow = p.y >= sampleLow[0] && p.y <= sampleLow[1];
    const isHigh = p.y >= sampleHigh[0] && p.y <= sampleHigh[1];
    if (!isLow && !isHigh) continue;
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    if (n.z > -0.8) continue;
    const key = Math.round(p.x / 0.002) * 0.002;
    const bucket = isLow ? low : high;
    if (!bucket.has(key)) bucket.set(key, { zs: [], n: [0, 0, 0], u: 0, v: 0, c: 0 });
    const b = bucket.get(key);
    b.zs.push(p.z);
    b.n[0] += n.x;
    b.n[1] += n.y;
    b.n[2] += n.z;
    if (uv) {
      b.u += uv.getX(i);
      b.v += uv.getY(i);
    }
    b.c++;
  }
  // 按 2mm 的 x 分桶取中位高度、平均法线和 UV，缝两侧的钣金各自连成一条折线
  const lineOf = (bucket) => {
    const rows = [...bucket.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([x, b]) => {
        const zs = b.zs.sort((c, d) => c - d);
        const len = Math.hypot(b.n[0], b.n[1], b.n[2]) || 1;
        return [x, zs[zs.length >> 1], b.n[0] / len, b.n[1] / len, b.n[2] / len, b.u / (b.c || 1), b.v / (b.c || 1)];
      });
    return (x) => {
      if (x <= rows[0][0]) return rows[0];
      if (x >= rows[rows.length - 1][0]) return rows[rows.length - 1];
      for (let i = 1; i < rows.length; i++) {
        if (x <= rows[i][0]) {
          const t = (x - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]);
          return rows[i - 1].map((v, k) => (k === 0 ? x : v + t * (rows[i][k] - v)));
        }
      }
      return rows[rows.length - 1];
    };
  };
  if (low.size < 2 || high.size < 2) return;
  const lowAt = lineOf(low);
  const highAt = lineOf(high);
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  const xs = [];
  for (let x = x0; x <= x1; x += 0.008) xs.push(x);
  for (const x of xs) {
    const a = lowAt(x);
    const b = highAt(x);
    const zLow = a[1] - 0.0004;
    positions.push(x, yRibbonLow, zLow, x, yRibbonHigh, b[1] - 0.0004);
    normals.push(a[2], a[3], a[4], b[2], b[3], b[4]);
    uvs.push(a[5], a[6], b[5], b[6]);
  }
  // 开口朝车尾，顶点绕序要保证从后方看是正面
  for (let i = 0; i < xs.length - 1; i++) {
    const k = i * 2;
    index.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  rg.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  rg.setIndex(index);
  const patch = new THREE.Mesh(rg, cnPaint.material);
  patch.name = 'cnTailgatePatch';
  patch.receiveShadow = true;
  scene.add(patch);
  cnPaint.attach(patch);
}

// y≈1.471 那条折痕是横条下沿一整排顶点，y 相同、横向跨了半个尾门。压平把它们放回拟合曲面上，
// 但这一排之间没有中间顶点，三角形是曲面上的弦：面板是弯的，弦中部会拱出 1~2mm，
// 从后方看就是漆面上一条断续的亮线。用一条缓包补片盖住：按拟合曲面取值，中间外鼓 5mm，
// 两端切线收进漆面 0.3mm，既压得住弦，又不会在补片边缘留一道坎
function patchTailgateFold(cnPaint, surface) {
  const world = cnPaint.matrixWorld;
  const geo = cnPaint.geometry;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const low = new Map();
  const high = new Map();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(world);
    if (p.x < 0.42 || p.x > 1.25 || p.z < -3.95 || p.z > -3.7) continue;
    const isLow = p.y >= 1.4555 && p.y <= 1.4595;
    const isHigh = p.y >= 1.4835 && p.y <= 1.4875;
    if ((!isLow && !isHigh) || !uv) continue;
    const key = Math.round(p.x / 0.002) * 0.002;
    const bucket = isLow ? low : high;
    if (!bucket.has(key)) bucket.set(key, [0, 0, 0]);
    const b = bucket.get(key);
    b[0] += uv.getX(i);
    b[1] += uv.getY(i);
    b[2]++;
  }
  const uvLine = (bucket) => {
    const rows = [...bucket.entries()].sort((a, b) => a[0] - b[0]).map(([x, b]) => [x, b[0] / b[2], b[1] / b[2]]);
    return (x) => {
      if (!rows.length) return [0, 0];
      if (x <= rows[0][0]) return [rows[0][1], rows[0][2]];
      if (x >= rows[rows.length - 1][0]) return [rows[rows.length - 1][1], rows[rows.length - 1][2]];
      for (let i = 1; i < rows.length; i++) {
        if (x <= rows[i][0]) {
          const t = (x - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]);
          return [rows[i - 1][1] + t * (rows[i][1] - rows[i - 1][1]), rows[i - 1][2] + t * (rows[i][2] - rows[i - 1][2])];
        }
      }
      return [rows[rows.length - 1][1], rows[rows.length - 1][2]];
    };
  };
  if (low.size < 2 || high.size < 2) return;
  const lowUV = uvLine(low);
  const highUV = uvLine(high);
  const h = 0.003;
  const normalAt = (x, y) => {
    const fx = (surface.zAt(x + h, y) - surface.zAt(x - h, y)) / (2 * h);
    const fy = (surface.zAt(x, y + h) - surface.zAt(x, y - h)) / (2 * h);
    const len = Math.hypot(fx, fy, 1);
    return [fx / len, fy / len, -1 / len];
  };
  // 折痕本体各处拱出的量不一样，补片做成一个缓包：中间最高、两端切线收进漆面。
  // 如果直接用两条边搭一个平面带，带边本身就是一道坎，近距离仍然看得见
  const yMid = 1.4715;
  const yHalf = 0.012;
  const rise = 0.005;
  const rowsN = 9;
  const yRows = [];
  for (let r = 0; r < rowsN; r++) yRows.push(yMid - yHalf + (2 * yHalf * r) / (rowsN - 1));
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  const xs = [];
  for (let x = 0.445; x <= 1.215; x += 0.008) xs.push(x);
  for (const x of xs) {
    const l = lowUV(x);
    const hi = highUV(x);
    for (let r = 0; r < rowsN; r++) {
      const y = yRows[r];
      const t = (y - yMid) / yHalf;
      const bump = Math.cos((Math.PI / 2) * t) ** 2;
      positions.push(x, y, surface.zAt(x, y) - rise * bump + 0.0003 * (1 - bump));
      const n = normalAt(x, y);
      normals.push(n[0], n[1], n[2]);
      const k = (y - yRows[0]) / (yRows[rowsN - 1] - yRows[0]);
      uvs.push(l[0] + (hi[0] - l[0]) * k, l[1] + (hi[1] - l[1]) * k);
    }
  }
  // 开口朝车尾，绕序与上面的补片一致
  for (let i = 0; i < xs.length - 1; i++) {
    for (let r = 0; r < rowsN - 1; r++) {
      const k = i * rowsN + r;
      index.push(k, k + 1, k + rowsN, k + rowsN, k + 1, k + rowsN + 1);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  rg.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  rg.setIndex(index);
  const patch = new THREE.Mesh(rg, cnPaint.material);
  patch.name = 'cnTailgateFold';
  patch.receiveShadow = true;
  scene.add(patch);
  cnPaint.attach(patch);
}

// 尾门左侧 x 1.19~1.24 那道折角凹槽压平后残骸全挤在这条窄带里：槽壁塌下来和漆面共面互掐，
// 中间还有一段网格破口（缝里能直接看到黑色内壳），压平又跳过朝车头的槽壁顶点，它们凸在
// 拟合面上 2~3cm。把窄带里所有漆面顶点整体收到拟合面下 4mm（边界 7mm 内渐收，避免留坎），
// 再用一张贴拟合面的补片把整条盖住：下面怎么塌都露不出来，上面只剩一张光顺面
function retreatCornerStrip(cnPaint, surface) {
  cnPaint.updateWorldMatrix(true, false);
  const geo = cnPaint.geometry;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const world = cnPaint.matrixWorld;
  const inv = new THREE.Matrix4().copy(world).invert();
  const invNm = new THREE.Matrix3().getNormalMatrix(world).invert().transpose();
  const invLin = new THREE.Matrix3().setFromMatrix4(inv);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const X0 = 1.185;
  const X1 = 1.245;
  const Y0 = 1.155;
  const Y1 = 1.615;
  const fade = 0.007;
  const h = 0.004;
  const depthOf = (x, y) =>
    Math.min(
      smoothRange(X0, X0 + fade, x),
      1 - smoothRange(X1 - fade, X1, x),
      smoothRange(Y0, Y0 + fade, y),
      1 - smoothRange(Y1 - fade, Y1, y)
    );
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(world);
    if (p.x < X0 || p.x > X1 || p.y < Y0 || p.y > Y1 || p.z < -3.95 || p.z > -3.72) continue;
    const t = depthOf(p.x, p.y);
    if (t <= 0.001) continue;
    const targetZ = surface.zAt(p.x, p.y) + 0.004 * t;
    d.set(0, 0, targetZ - p.z).applyMatrix3(invLin);
    pos.setXYZ(i, pos.getX(i) + d.x, pos.getY(i) + d.y, pos.getZ(i) + d.z);
    a.set(p.x + h, p.y, 0);
    b.set(p.x - h, p.y, 0);
    const fx = (surface.zAt(a.x, a.y) - surface.zAt(b.x, b.y)) / (2 * h);
    a.set(p.x, p.y + h, 0);
    b.set(p.x, p.y - h, 0);
    const fy = (surface.zAt(a.x, a.y) - surface.zAt(b.x, b.y)) / (2 * h);
    n.set(fx, fy, -1).normalize().applyMatrix3(invNm).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geo.computeBoundingSphere();
}

// 整条盖住窄带的贴面补片：按拟合曲面取值，外偏 0.3mm，法线用曲面解析法线，
// 与周围已压平的钣金齐平，看不出接缝
function patchCornerStrip(cnPaint, surface) {
  const X0 = 1.185;
  const X1 = 1.245;
  const Y0 = 1.155;
  const Y1 = 1.615;
  const h = 0.003;
  const normalAt = (x, y) => {
    const fx = (surface.zAt(x + h, y) - surface.zAt(x - h, y)) / (2 * h);
    const fy = (surface.zAt(x, y + h) - surface.zAt(x, y - h)) / (2 * h);
    const len = Math.hypot(fx, fy, 1);
    return [fx / len, fy / len, -1 / len];
  };
  const xs = [];
  const ys = [];
  for (let x = X0; x <= X1 + 1e-9; x += 0.004) xs.push(x);
  for (let y = Y0; y <= Y1 + 1e-9; y += 0.006) ys.push(y);
  const positions = [];
  const normals = [];
  const index = [];
  for (const x of xs) {
    for (const y of ys) {
      positions.push(x, y, surface.zAt(x, y) - 0.0003);
      normals.push(...normalAt(x, y));
    }
  }
  const ny = ys.length;
  // 开口朝车尾，绕序与折痕补片一致
  for (let i = 0; i < xs.length - 1; i++) {
    for (let r = 0; r < ny - 1; r++) {
      const k = i * ny + r;
      index.push(k, k + 1, k + ny, k + ny, k + 1, k + ny + 1);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  rg.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  rg.setIndex(index);
  const patch = new THREE.Mesh(rg, cnPaint.material);
  patch.name = 'cnTailgateCorner';
  patch.receiveShadow = true;
  scene.add(patch);
  cnPaint.attach(patch);
}

// 用户圈选的牌照凹陷区整体替换成一张光顺贴面面板：按拟合曲面取值、外偏 0.6mm
// （比边角补片 0.3mm 略高一层，避免共面闪烁），把压平后残留的折缝、破口、
// 高光乱线全部盖在整块干净面板下；面板跟着 cnPaint 走，切美规色自动隐藏
// 右缘延伸到 x=1.38：盖住左侧折角凹槽的开口（黑影墙），但停在包边翻唇（x≥1.40）
// 之前，翻唇比拟合面靠外，再往右会刺穿面板
function patchRecessSheet(cnPaint, surface) {
  const X0 = 0.435;
  const X1 = 1.38;
  const Y0 = 1.06;
  const Y1 = 1.5722;
  const h = 0.003;
  // y≈1.4715 折痕带的旧钣金三角面是曲面上的弦，中部拱出 1~2mm；面板在这条带上
  // 做一个 2.5mm 的平滑凸起把它整个压在下面，边缘 cosine 渐收，不留坎
  const bumpAt = (x, y) => {
    const t = (y - 1.4595) / (1.4835 - 1.4595);
    if (t < 0 || t > 1) return 0;
    const tx = smoothRange(0.435, 0.445, x) * (1 - smoothRange(1.205, 1.215, x));
    return 0.0025 * Math.cos(Math.PI * (t - 0.5)) ** 2 * tx;
  };
  const sheetZ = (x, y) => surface.zAt(x, y) - 0.0006 - bumpAt(x, y);
  const normalAt = (x, y) => {
    const fx = (sheetZ(x + h, y) - sheetZ(x - h, y)) / (2 * h);
    const fy = (sheetZ(x, y + h) - sheetZ(x, y - h)) / (2 * h);
    const len = Math.hypot(fx, fy, 1);
    return [fx / len, fy / len, -1 / len];
  };
  const xs = [];
  const ys = [];
  for (let x = X0; x <= X1 + 1e-9; x += 0.008) xs.push(x);
  for (let y = Y0; y <= Y1 + 1e-9; y += 0.01) ys.push(y);
  const positions = [];
  const normals = [];
  const index = [];
  for (const x of xs) {
    for (const y of ys) {
      positions.push(x, y, sheetZ(x, y));
      normals.push(...normalAt(x, y));
    }
  }
  const ny = ys.length;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let r = 0; r < ny - 1; r++) {
      const k = i * ny + r;
      index.push(k, k + 1, k + ny, k + ny, k + 1, k + ny + 1);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  rg.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  rg.setIndex(index);
  const sheet = new THREE.Mesh(rg, cnPaint.material);
  sheet.name = 'cnRecessSheet';
  sheet.castShadow = true;
  sheet.receiveShadow = true;
  scene.add(sheet);
  cnPaint.attach(sheet);
  // 面板自己带了折痕带的凸起，旧的折痕补片（外鼓 5mm）再留着会刺穿面板
  const foldPatch = cnPaint.getObjectByName('cnTailgateFold');
  if (foldPatch) foldPatch.visible = false;
}

// 面板区域里比拟合面高出 1mm 以上的顶点（压平时被"朝车头法线"规则跳过的残壁），
// 按位置键整体收到拟合面下 4mm——位置共享的多份顶点一起动，避免撕缝
function sinkProudVerts(cnPaint, surface, box) {
  cnPaint.updateWorldMatrix(true, false);
  const geo = cnPaint.geometry;
  const pos = geo.attributes.position;
  const world = cnPaint.matrixWorld;
  const inv = new THREE.Matrix4().copy(world).invert();
  const invLin = new THREE.Matrix3().setFromMatrix4(inv);
  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  const keyOf = (v) =>
    Math.round(v.x * 500) + '_' + Math.round(v.y * 500) + '_' + Math.round(v.z * 500);
  const keys = new Set();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(world);
    if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1) continue;
    if (surface.zAt(p.x, p.y) - p.z > 0.001) keys.add(keyOf(p));
  }
  if (!keys.size) return 0;
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(world);
    if (!keys.has(keyOf(p))) continue;
    const targetZ = surface.zAt(p.x, p.y) + 0.004;
    d.set(0, 0, targetZ - p.z).applyMatrix3(invLin);
    pos.setXYZ(i, pos.getX(i) + d.x, pos.getY(i) + d.y, pos.getZ(i) + d.z);
    n++;
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  return n;
}

function reworkRearForCn(model) {
  let paint = null;
  model.traverse((obj) => {
    if (
      obj.isMesh &&
      obj.material &&
      obj.material.name === 'Car paint (Grey)' &&
      (!paint || obj.geometry.index.count > paint.geometry.index.count)
    ) {
      paint = obj;
    }
  });
  if (!paint) return;
  paint.updateMatrixWorld(true);
  bodyPaint = paint;

  // 复制一份整车漆面专改国产尾部；切换美规时直接隐藏它、显示原始几何
  const cnPaint = new THREE.Mesh(paint.geometry.clone(), paint.material);
  cnPaint.name = 'bodyPaintCN';
  cnPaint.position.copy(paint.position);
  cnPaint.quaternion.copy(paint.quaternion);
  cnPaint.scale.copy(paint.scale);
  cnPaint.castShadow = true;
  cnPaint.receiveShadow = true;
  cnPaint.visible = false;
  paint.parent.add(cnPaint);
  cnPaint.updateWorldMatrix(true, false);
  bodyPaintCN = cnPaint;

  // 采样凹槽外圈原车钣金，插值出尾门表面

  // 保险杠中央：外凸漆面压平成牌照位
  flattenZone(
    cnPaint,
    () => CN_PAD_Z,
    (p) =>
      (1 - smoothRange(0.47, 0.59, Math.abs(p.x))) *
      smoothRange(0.745, 0.8, p.y) *
      (1 - smoothRange(1.045, 1.07, p.y)) *
      (1 - smoothRange(-3.75, -3.66, p.z))
  );

  const surface = makeSkinSurface(collectSkinRing(cnPaint));
  window.__surf = surface; // TEMP forensics — remove before shipping

  // 尾门恢复美规原样：牌照凹槽、折角凹槽一律不再压平，cnPaint 保留原始几何
  // 折叠缝/折痕/折角残壁/贴面面板等补丁默认停用（函数保留，需要时再启用）

  usPlateMesh = model.getObjectByName('Object_4_body_0015_15');
  usFrontPlateMesh = model.getObjectByName('Object_4_body_0015_5');
  createCnRearPlate(carRoot);
  createCnFrontPlate(carRoot);
}

function createAoPlane(width, length) {
  // 已被 ensureAo() 取代（全局一份，切车时按新尺寸更新缩放）
}

// RAV4 专属改造：尾门字标拆分、国产化补丁、后标贴片与 4WD 立体字
function setupRav4Extras(model) {
  splitBadges(model);
  reworkRearForCn(model);
  createRearBadges();
  create4wdBadge();
}

function fitViewport() {
  controls.minDistance = dims.max * 0.8;
  controls.maxDistance = dims.max * 2.6;
  camera.near = dims.max * 0.01;
  camera.far = dims.max * 24;
  camera.updateProjectionMatrix();

  const sc = keyLight.shadow.camera;
  sc.left = -dims.max * 4;
  sc.right = dims.max * 4;
  sc.top = dims.max * 4;
  sc.bottom = -dims.max * 4;
  sc.near = dims.max * 0.1;
  sc.far = dims.max * 10;
  sc.updateProjectionMatrix();
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.normalBias = dims.max * 0.0025;
}

function ensureFloor() {
  if (!floorMesh) {
    floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.34 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0.002;
    floorMesh.receiveShadow = true;
    floorMesh.renderOrder = 0;
    scene.add(floorMesh);
  }
  floorMesh.scale.set(dims.max * 8, dims.max * 8, 1);
}

function ensureAo() {
  if (!aoPlane) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.06,
      size / 2,
      size / 2,
      size * 0.5
    );
    g.addColorStop(0, 'rgba(0,0,0,0.6)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    aoMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.45,
    });
    aoPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), aoMat);
    aoPlane.rotation.x = -Math.PI / 2;
    aoPlane.position.y = 0.004;
    aoPlane.renderOrder = 1;
    scene.add(aoPlane);
  }
  aoPlane.scale.set(dims.width * 1.9, dims.length * 1.32, 1);
}

// 昂科威全车网格共用同一个 'body' 材质，且其颜色贴图槽装的是一张
// 法线贴图（Tire_01_NM.jpg），外壳/玻璃/镀铬全部显紫色。按网格名前缀
// 重新分配材质：车身漆面用可换色的干净克隆，其余部件按参考
// （Sketchfab: Buick Envision 2019 by SQUIR3D）给干净 PBR 材质。
function setupEnvisionMaterials(model) {
  const shared = findMeshByMaterial(model, 'body');
  if (!shared || !shared.material) return;
  const src = shared.material;

  const paint = src.clone();
  paint.map = null;
  paint.color = new THREE.Color(0xffffff);
  paint.metalness = 0;
  paint.roughness = 0.45;
  paint.needsUpdate = true;

  const mk = (color, metalness, roughness, extra) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      metalness,
      roughness,
      envMapIntensity: 1.2,
      ...extra,
    });
    m.name = src.name;
    return m;
  };

  const mats = {
    glass: mk(0x5b6269, 0, 0.03, {
      transmission: 1,
      thickness: 0.02,
      ior: 1.45,
      specularIntensity: 1,
      envMapIntensity: 1.25,
    }),
    // 前脸灯罩（大灯透镜带）：清透浅烟色，让后面的镀铬反光碗透出来
    lens: mk(0xb9c1c7, 0, 0.04, {
      transmission: 0.85,
      thickness: 0.03,
      ior: 1.45,
      specularIntensity: 1,
      envMapIntensity: 1.8,
    }),
    chrome: mk(0xdde2e7, 0.9, 0.1, { envMapIntensity: 1.8 }),
    silver: mk(0xc3c7cc, 0.9, 0.35, { envMapIntensity: 1.4 }),
    black: mk(0x0b0b0d, 0.05, 0.75),
    red: mk(0xc51a1e, 0.1, 0.3),
    white: mk(0xe8e8ea, 0.1, 0.4),
    orange: mk(0xc86f1d, 0.1, 0.35),
    blue: mk(0x16304e, 0.3, 0.3),
    interior: mk(0x15151a, 0.2, 0.7, { envMapIntensity: 2.5 }),
  };

  const pick = (name) => {
    if (/^body_0\d_body/.test(name)) return paint;
    // 前脸灯罩（z>170 的 glass_01..06 / o_glass_ / vd_glass_01）走清透镜片；
    // 车窗、天窗、车尾细条（r_glass/d_glass/vd_glass_02/glass_07..09）保持深色玻璃
    if (/^glass_0[1-6]_/.test(name) || /^o_glass_/.test(name) || /^vd_glass_01/.test(name)) return mats.lens;
    if (/^(r_glass|d_glass|vd_glass|o_glass|glass_)/.test(name)) return mats.glass;
    if (/^chrome_/.test(name)) return mats.chrome;
    if (/^silver/.test(name)) return mats.silver;
    if (/^(black|black_m|gum)_/.test(name)) return mats.black;
    if (/^red_/.test(name)) return mats.red;
    if (/^white_/.test(name)) return mats.white;
    if (/^orange_/.test(name)) return mats.orange;
    if (/^blue_/.test(name)) return mats.blue;
    if (/^interior/.test(name)) return mats.interior;
    return null;
  };

  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    if (obj.material.name !== src.name) return;
    const m = pick(obj.name);
    if (m) obj.material = m;
  });
}

// 夏朗 GLB 是 GTA V 改装模型：'default.001' 漆面材质的贴图槽装的是
// r_glass.png（玻璃贴图），'rouge pompier' 同时管着保险杠漆面和尾灯组，
// 大灯总成挂在 'orange' 材质上。按参考（Sketchfab: Volkswagen Sharan）
// 重新分配干净 PBR 材质：漆面用可换色克隆，其余部件按网格名走
// 尾灯红 / 大灯白 / 转向灯琥珀 / 镀铬 / 银金属 / 黑饰条 / 深色玻璃。
function setupSharanMaterials(model) {
  const mk = (name, color, metalness, roughness, extra) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      metalness,
      roughness,
      envMapIntensity: 1.2,
      ...extra,
    });
    m.name = name;
    return m;
  };

  const paintASrc = findMeshByMaterial(model, 'default.001')?.material;
  const paintBSrc = findMeshByMaterial(model, 'rouge pompier')?.material;
  const paintA = paintASrc ? paintASrc.clone() : null;
  const paintB = paintBSrc ? paintBSrc.clone() : null;
  for (const p of [paintA, paintB]) {
    if (!p) continue;
    p.map = null;
    p.color = new THREE.Color(0xffffff);
    p.metalness = 0;
    p.roughness = 0.45;
    p.needsUpdate = true;
  }

  const mats = {
    glass: mk('sharan_glass', 0x5b6269, 0, 0.03, {
      transmission: 1,
      thickness: 0.02,
      ior: 1.45,
      specularIntensity: 1,
      envMapIntensity: 1.25,
    }),
    chrome: mk('sharan_chrome', 0xdde2e7, 0.9, 0.1, { envMapIntensity: 1.8 }),
    badge: mk('sharan_badge', 0xdde2e7, 0.35, 0.22, { envMapIntensity: 2.0 }),
    // 前后车标：缎面银而不是镜面铬——镜面铬会随视角反射环境，一会儿发白一会儿发黑。
    // 基色压到中灰银 + 较高金属度/中等粗糙度：反射仍然摊平（不随视角跳），
    // 但底色够暗，在影棚环境里不会冲成白塑料。
    badgeChrome: mk('sharan_badge_chrome', 0xb9bfc6, 0.7, 0.28, { envMapIntensity: 1.4 }),
    silver: mk('sharan_silver', 0xc3c7cc, 0.9, 0.35, { envMapIntensity: 1.4 }),
    black: mk('sharan_black', 0x0b0b0d, 0.05, 0.75),
    // 尾灯：底色继续向红提，另加一点自发光，避免逆光/阴影里灯罩发黑
    red: mk('sharan_tail', 0xff2a2b, 0.1, 0.3, { emissive: 0x7a0b0c, emissiveIntensity: 1 }),
    // 前大灯灯罩：原来是不透明乳白，逆光下发黑；改成透射玻璃质感
    white: mk('sharan_lamp', 0xe6eaee, 0, 0.08, {
      transmission: 0.35,
      thickness: 0.02,
      ior: 1.4,
      specularIntensity: 1,
      envMapIntensity: 2.0,
    }),
    // 前大灯外罩（glass_f）：不能再用车窗的深色玻璃，否则整块透镜读成黑色
    lampGlass: mk('sharan_lamp_glass', 0xeef3f6, 0, 0.04, {
      transmission: 0.92,
      thickness: 0.01,
      ior: 1.45,
      specularIntensity: 1,
      envMapIntensity: 2.2,
    }),
    // 尾灯外罩（glass_r）：透明灯罩，红色由内侧灯体决定，白色倒车灯也不会被染红
    tailGlass: mk('sharan_tail_glass', 0xf2f4f6, 0, 0.05, {
      transmission: 0.9,
      thickness: 0.01,
      ior: 1.45,
      specularIntensity: 1,
      envMapIntensity: 2.0,
    }),
    amber: mk('sharan_amber', 0xc86f1d, 0.1, 0.35),
  };

  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mn = obj.material.name;
    if (mn === 'default.001') {
      if (paintA) obj.material = paintA;
      return;
    }
    if (mn === 'rouge pompier') {
      // 尾灯/刹车灯单独红色，保险杠、底盘漆面件跟车漆走
      obj.material = /^(brakelight|taillight)/.test(obj.name) ? mats.red : paintB;
      return;
    }
    if (mn === 'orange') {
      obj.material = /^indicator/.test(obj.name) ? mats.amber : mats.white;
      return;
    }
    if (mn === 'black.002' || mn === 'black.003') {
      obj.material = mats.black;
      return;
    }
    if (mn === 'chrome') {
      obj.material = mats.chrome;
      return;
    }
    if (mn === 'acier') {
      obj.material = mats.silver;
      return;
    }
    if (mn === 'vitres_exterieur' || mn === 'r_glass') {
      if (/^glass_f/.test(obj.name)) obj.material = mats.lampGlass;
      else if (/^glass_r_vitres/.test(obj.name) || /^glass_r_r_glass/.test(obj.name)) obj.material = mats.tailGlass;
      else obj.material = mats.glass;
    }
  });

  // GTA 去品牌模型：车标位置只留黑色空白件（材质同黑格栅/黑窗框混在
  // 同一网格里）。按世界坐标把三角形拆组：前格栅槽内、尾门圆标区、
  // 四个轮毂中心盖 → 亮银镀铬，其余保持黑
  model.updateMatrixWorld(true);
  const splitByRegion = (mesh, sel) => {
    const geo = mesh.geometry;
    const idx = geo.getIndex();
    const pos = geo.getAttribute('position');
    const triCount = Math.floor((idx ? idx.count : pos.count) / 3);
    const hit = [];
    const rest = [];
    const v = new THREE.Vector3();
    const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
    for (let t = 0; t < triCount; t++) {
      let cx = 0, cy = 0, cz = 0;
      const tri = new Array(9);
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, vi(t, k)).applyMatrix4(mesh.matrixWorld);
        tri[k * 3] = v.x; tri[k * 3 + 1] = v.y; tri[k * 3 + 2] = v.z;
        cx += v.x; cy += v.y; cz += v.z;
      }
      (sel(cx / 3, cy / 3, cz / 3, tri) ? hit : rest).push(t);
    }
    if (!hit.length) return;
    if (!rest.length) {
      mesh.material = mats.badgeChrome;
      return;
    }
    const use32 = pos.count > 65535;
    const newIndex = new (use32 ? Uint32Array : Uint16Array)(triCount * 3);
    let p = 0;
    for (const t of hit) for (let k = 0; k < 3; k++) newIndex[p++] = vi(t, k);
    const split = p;
    for (const t of rest) for (let k = 0; k < 3; k++) newIndex[p++] = vi(t, k);
    geo.setIndex(new THREE.BufferAttribute(newIndex, 1));
    geo.clearGroups();
    geo.addGroup(0, split, 0);
    geo.addGroup(split, triCount * 3 - split, 1);
    mesh.material = [mats.badgeChrome, mats.black];
  };
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    if (/^bumper_f_black003_0$/.test(obj.name)) {
      // 前格栅中央车标：black002 是底盘圆盘（保持黑色衬底）、black003 是
      // VW 圈+字母（兼格栅条）。只把圆内的字母/圆环换银，实测圆心 (0, 0.781)、
      // 外缘半径≈0.077；三个顶点都落在圆内才换，免得横穿圆区的长条格栅
      // 三角形被整块染成银色（会在车标左右露出银疙瘩）
      splitByRegion(obj, (x, y, z, tri) => {
        for (let i = 0; i < 9; i += 3) {
          if (Math.hypot(tri[i], tri[i + 1] - 0.781) > 0.082) return false;
        }
        return true;
      });
    } else if (/^bodyshell_black003_0$/.test(obj.name)) {
      // 尾门车标：black002 底板保持黑色，black003 的 VW 圈+字母换银
      // （实测中心 (0,1.08)、黑斑 x ±0.06 / y 1.03..1.13）
      splitByRegion(obj, (x, y, z) => z <= -1.8 && Math.hypot(x, y - 1.08) <= 0.06);
    } else if (/^wheel.*black001_0$/.test(obj.name)) {
      // 轮毂中心盖（6.3cm 小圆盘，整块换）
      obj.material = mats.badge;
    }
  });

  createSharanPlates(carRoot);
}

// 夏朗国产蓝牌：尾门自带欧规长牌凹槽（实测开口 x±0.34、y 0.755..0.905，
// 内壁 z≈-2.30..-2.25，牌位随尾门上倾）；前牌装在前保险杠漆面中央。
// 夏朗是进口车，无论选中规色还是海外色都保留国内蓝牌。
function createSharanPlates(root) {
  const faceMat = new THREE.MeshPhysicalMaterial({
    ...getCnPlateMaps(),
    normalScale: new THREE.Vector2(1.6, 1.6),
    metalness: 0,
    roughness: 0.62,
    envMapIntensity: 0.1,
    clearcoat: 0,
    clearcoatRoughness: 0.6,
  });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xcfd4d9, metalness: 0.35, roughness: 0.45 });
  const plateW = 0.44;
  const plateH = 0.14;

  // BoxGeometry 面序 px,nx,py,ny,pz,nz：尾牌用 nz（-Z）、前牌用 pz（+Z）
  const makePlate = (faceIndex) => {
    const list = [edgeMat, edgeMat, edgeMat, edgeMat, edgeMat, edgeMat];
    list[faceIndex] = faceMat;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, 0.008), list);
    plate.castShadow = true;
    return plate;
  };
  const addBolts = (group, z) => {
    for (const bx of [-0.107, 0.107]) {
      for (const by of [-0.045, 0.045]) {
        const bolt = new THREE.Mesh(cnBoltGeo, cnBoltMat);
        bolt.scale.set(1, 1, 0.22);
        bolt.position.set(bx, by, z);
        group.add(bolt);
      }
    }
  };

  // 尾牌：凹槽底面中心 z≈-2.27，整体沿法线外移 6mm，避免牌面四角吃进弧面
  const rear = new THREE.Group();
  rear.name = 'sharanCnRearPlate';
  rear.position.set(0, 0.832, -2.276);
  rear.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0.354, -0.935).normalize()
  );
  rear.add(makePlate(5));
  addBolts(rear, -0.0052);
  scene.add(rear);
  root.attach(rear);

  // 前牌：保险杠中央的牌照垫在中下部微微外凸（z 最大 2.384），
  // 牌面整体前移并收小上倾角，让整块牌压在凸起之前约 4-5mm
  const front = new THREE.Group();
  front.name = 'sharanCnFrontPlate';
  front.position.set(0, 0.6, 2.381);
  front.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, -0.07, 0.9975).normalize()
  );
  front.add(makePlate(4));
  addBolts(front, 0.0052);
  scene.add(front);
  root.attach(front);
}

function setupCar(gltf, car) {
  const model = gltf.scene;
  prepareMaterials(model, car);
  if (car.id === 'envision') setupEnvisionMaterials(model);
  if (car.flip) model.rotation.x = Math.PI;
  model.updateMatrixWorld(true);

  let rotY = car.yaw ?? 0;
  if (car.id === 'rav4') {
    // RAV4 沿用既有逻辑：用车轮节点算车头方向，再补 180° 让 +Z 为车头
    const fL = findNode(model, 'Wheel.Ft.L');
    const fR = findNode(model, 'Wheel.Ft.R');
    const bL = findNode(model, 'Wheel.Bk.L');
    const bR = findNode(model, 'Wheel.Bk.R');
    let forward = new THREE.Vector3(0, 0, 1);
    if (fL && fR && bL && bR) {
      const front = fL
        .getWorldPosition(new THREE.Vector3())
        .add(fR.getWorldPosition(new THREE.Vector3()))
        .multiplyScalar(0.5);
      const back = bL
        .getWorldPosition(new THREE.Vector3())
        .add(bR.getWorldPosition(new THREE.Vector3()))
        .multiplyScalar(0.5);
      forward = front.sub(back);
      forward.y = 0;
      forward.normalize();
    }
    rotY = -Math.atan2(forward.x, forward.z) + Math.PI;
  }

  carRoot = new THREE.Group();
  carRoot.add(model);
  carRoot.rotation.y = rotY;
  scene.add(carRoot);
  carRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(carRoot);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  carRoot.position.x -= center.x;
  carRoot.position.z -= center.z;
  carRoot.position.y -= box.min.y;
  carRoot.updateMatrixWorld(true);

  // 摆正并居中之后再拆标识，区段判定才能直接用世界坐标
  if (car.setup) car.setup(model);

  dims = {
    max: Math.max(size.x, size.z),
    height: size.y,
    width: Math.min(size.x, size.z),
    length: Math.max(size.x, size.z),
    sizeX: size.x,
    sizeZ: size.z,
  };

  fitViewport();
  ensureFloor();
  ensureAo();

  paintMats = [];
  for (const n of car.paintMats) {
    const m = findMeshByMaterial(model, n);
    if (m && m.material) paintMats.push(m.material);
  }
  paintMat = paintMats[0] || null;
}

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

function loadCarGltf(car) {
  if (carLoads.has(car.id)) return carLoads.get(car.id);
  const p = new Promise((resolve, reject) => {
    gltfLoader.load(
      car.glb,
      resolve,
      (ev) => {
        if (ev.total > 0) {
          setProgress(0.02 + (ev.loaded / ev.total) * 0.9);
        } else {
          setProgress(Math.min(0.9, 0.02 + ev.loaded / 27e6));
        }
      },
      (err) => {
        console.error(err);
        loaderErr.hidden = false;
        loaderErr.textContent = '模型加载失败，请重试';
        reject(err);
      }
    );
  }).finally(() => carLoads.delete(car.id));
  carLoads.set(car.id, p);
  return p;
}

/* ---------- camera ---------- */

function viewTarget() {
  return new THREE.Vector3(0, dims.height * 0.45, 0);
}

function computeFitDistance(thetaDeg, phiDeg, fill) {
  const theta = THREE.MathUtils.degToRad(thetaDeg);
  const phi = THREE.MathUtils.degToRad(phiDeg);
  const dir = new THREE.Vector3(
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.cos(theta)
  ).normalize();
  const right = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), dir)
    .normalize();
  const up = new THREE.Vector3().crossVectors(dir, right).normalize();

  const target = viewTarget();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  const halfX = dims.sizeX / 2;
  const halfZ = dims.sizeZ / 2;

  let dist = 0;
  const p = new THREE.Vector3();
  for (const sx of [-1, 1]) {
    for (const sy of [0, dims.height]) {
      for (const sz of [-1, 1]) {
        p.set(sx * halfX, sy, sz * halfZ).sub(target);
        const depthOffset = p.dot(dir);
        const needX = Math.abs(p.dot(right)) / (fill * tanH);
        const needY = Math.abs(p.dot(up)) / (fill * tanV);
        dist = Math.max(dist, depthOffset + needX, depthOffset + needY);
      }
    }
  }
  return Math.max(dist * 1.02, dims.max * 0.9);
}

function viewPosition(view) {
  const theta = THREE.MathUtils.degToRad(view.theta);
  const phi = THREE.MathUtils.degToRad(view.phi);
  const target = viewTarget();
  const radius = computeFitDistance(view.theta, view.phi, view.fill ?? 0.82);
  const dir = new THREE.Vector3(
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.cos(theta)
  );
  return { pos: target.clone().add(dir.multiplyScalar(radius)), target };
}

function placeInstant(view) {
  const { pos, target } = viewPosition(view);
  camera.position.copy(pos);
  controls.target.copy(target);
  controls.update();
}

function flyTo(view) {
  const { pos, target } = viewPosition(view);
  camTween = {
    t: 0,
    dur: 1.0,
    fromPos: camera.position.clone(),
    toPos: pos,
    fromTarget: controls.target.clone(),
    toTarget: target,
  };
  controls.enabled = false;
  setAutoRotate(false);
}

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function updateTween(dt) {
  if (!camTween) return;
  camTween.t += dt / camTween.dur;
  const k = easeInOutCubic(Math.min(camTween.t, 1));
  camera.position.lerpVectors(camTween.fromPos, camTween.toPos, k);
  controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, k);
  if (camTween.t >= 1) {
    camTween = null;
    controls.enabled = true;
  }
}

/* ---------- lighting / paint ---------- */

function applyLight(id) {
  const p = LIGHTS.find((l) => l.id === id) || LIGHTS[0];
  activeLight = p.id;

  renderer.toneMappingExposure = p.exposure;
  scene.environmentIntensity = p.env;
  scene.environmentRotation.y = p.envRot;
  if (aoMat) aoMat.opacity = p.ao;

  keyLight.color.setHex(p.key.color);
  keyLight.intensity = p.key.intensity;
  keyLight.position.set(...p.key.pos).multiplyScalar(dims.max);

  rimLight.color.setHex(p.rim.color);
  rimLight.intensity = p.rim.intensity;
  rimLight.position.set(...p.rim.pos).multiplyScalar(dims.max);

  fillLight.color.setHex(p.fill.color);
  fillLight.intensity = p.fill.intensity;
  fillLight.position.set(...p.fill.pos).multiplyScalar(dims.max);

  app.classList.remove('bg-studio', 'bg-dusk', 'bg-night');
  app.classList.add(p.bg);

  document.querySelectorAll('.light-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.light === p.id);
  });
}

function applyPaint(id) {
  const car = CARS.find((c) => c.id === currentCarId) || CARS[0];
  const p = car.paints.find((c) => c.id === id) || car.paints[0];
  currentPaintId = p.id;
  // 已按用户要求整体退回美规版本（“刚删掉 LIMITED EDITION 灰字”时的状态）：
  // 所有车漆一律显示原厂美规车，国产改造逻辑保留但停用；
  // 尾门/前脸牌照都跟着市场走：国产车漆显示国产蓝牌，美规车漆显示美规加州牌；
  // LIMITED 门边标同样跟市场走：国产车漆不显示，美规车漆才显示
  const cn = false; // p.market === 'cn';
  const cnPlate = p.market === 'cn';
  if (badgeMesh) badgeMesh.visible = p.market !== 'cn';
  if (cnBadgeGroup) cnBadgeGroup.visible = cn;
  if (rav4Badge) rav4Badge.visible = !cn;
  if (rav4Digit) rav4Digit.visible = !cn;
  if (toyotaBadge) toyotaBadge.material = cn ? toyotaChromeMat : toyotaBaseMat;
  if (usPlateMesh) usPlateMesh.visible = !cnPlate;
  if (usFrontPlateMesh) usFrontPlateMesh.visible = !cnPlate;
  if (cnFrontGroup) cnFrontGroup.visible = cnPlate;
  for (const m of envisionPlateMeshes) m.visible = !cnPlate;
  if (envisionCnFront) envisionCnFront.visible = cnPlate;
  if (envisionCnRear) envisionCnRear.visible = cnPlate;
  if (bodyPaint) bodyPaint.visible = !cn;
  if (bodyPaintCN) bodyPaintCN.visible = cn;
  if (cnRearGroup) cnRearGroup.visible = cnPlate;
  for (const pm of paintMats) {
    if (!pm) continue;
    pm.color.set(p.color);
    pm.metalness = p.metalness;
    pm.roughness = p.roughness;
    if ('clearcoat' in pm) {
      pm.clearcoat = 1;
      pm.clearcoatRoughness = p.clearcoatR ?? 0.04;
    }
    pm.envMapIntensity = p.env ?? 1.2;
    pm.needsUpdate = true;
  }
  document.querySelectorAll('.swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.paint === p.id);
  });
  document.getElementById('paintName').textContent = p.name;
  document.getElementById('paintDot').style.background = p.color;
}

/* ---------- car switching ---------- */

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function addTween(dur, ease, onUpdate, onDone) {
  const tw = { t: 0, dur, ease, onUpdate, onDone };
  tweens.push(tw);
  return tw;
}

function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = tw.ease(Math.min(tw.t / tw.dur, 1));
    tw.onUpdate(k);
    if (tw.t >= tw.dur) {
      tweens.splice(i, 1);
      if (tw.onDone) tw.onDone();
    }
  }
}

function showLoader(title) {
  loaderErr.hidden = true;
  loader.classList.remove('hide');
  loader.style.display = '';
  document.getElementById('loaderTitle').textContent = title;
  progress = 0;
  setProgress(0);
}

function hideLoader() {
  loader.classList.add('hide');
  setTimeout(() => (loader.style.display = 'none'), 600);
}

const hudCarName = document.getElementById('hudCarName');
const hudMarkMain = document.getElementById('hudMarkMain');

function updateHud(car) {
  hudCarName.textContent = car.name;
  hudMarkMain.textContent = car.mark;
  document.title = `${car.name} · 3D Viewer`;
  document.getElementById('loaderTitle').textContent = car.name;
  hudCarName.parentElement.classList.remove('swap');
  void hudCarName.parentElement.offsetWidth;
  hudCarName.parentElement.classList.add('swap');
}

function updatePlateTool(car) {
  const btn = document.querySelector('.tool[data-panel="plate"]');
  const available = car.plates;
  btn.hidden = !available;
  if (!available && !panels.plate.hidden) {
    panels.plate.hidden = true;
    btn.classList.remove('active');
  }
}

function setCarCardState(id, state) {
  document.querySelectorAll('.car-card').forEach((el) => {
    const is = el.dataset.car === id;
    el.classList.toggle('active', is);
    el.classList.toggle('busy', is && state === 'busy');
    el.classList.toggle('loading', is && state === 'busy');
  });
}

// 车辆卡片缩略图：用主渲染器把整车渲染到小 RT 再读回像素。
// RT 读回是线性空间，手动画 sRGB 近似曲线提亮，与画面观感一致
function generateThumb(id) {
  const entry = carCache.get(id);
  const slots = document.querySelectorAll(`.car-card[data-car="${id}"] .car-thumb`);
  if (!entry || !slots.length) return;

  const prevRoot = carRoot;
  const swapRoot = prevRoot !== entry.root;
  if (swapRoot) prevRoot.visible = false;
  if (aoPlane) aoPlane.visible = false;

  const prevAspect = camera.aspect;
  camera.aspect = 16 / 9;
  camera.updateProjectionMatrix();
  const { pos, target } = viewPosition(VIEWS[0]);
  const pp = camera.position.clone();
  const pt = controls.target.clone();
  camera.position.copy(pos);
  controls.target.copy(target);
  controls.update();

  const rt = new THREE.WebGLRenderTarget(384, 216, { samples: 4 });
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  const px = new Uint8Array(384 * 216 * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, 384, 216, px);
  rt.dispose();

  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 216;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(384, 216);
  const lin = (v) => Math.round(255 * Math.pow(v / 255, 1 / 2.2));
  for (let y = 0; y < 216; y++) {
    const srcRow = (215 - y) * 384 * 4;
    const dstRow = y * 384 * 4;
    for (let x = 0; x < 384; x++) {
      img.data[dstRow + x * 4] = lin(px[srcRow + x * 4]);
      img.data[dstRow + x * 4 + 1] = lin(px[srcRow + x * 4 + 1]);
      img.data[dstRow + x * 4 + 2] = lin(px[srcRow + x * 4 + 2]);
      img.data[dstRow + x * 4 + 3] = px[srcRow + x * 4 + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  const src = c.toDataURL('image/png');
  slots.forEach((slot) => {
    slot.innerHTML = '';
    const im = document.createElement('img');
    im.src = src;
    slot.appendChild(im);
    slot.classList.add('ready');
  });

  camera.aspect = prevAspect;
  camera.updateProjectionMatrix();
  camera.position.copy(pp);
  controls.target.copy(pt);
  controls.update();
  if (aoPlane) aoPlane.visible = true;
  if (swapRoot) prevRoot.visible = true;
}

async function switchCar(id) {
  if (switching || id === currentCarId) return;
  const car = CARS.find((c) => c.id === id);
  if (!car) return;
  switching = true;
  closePanels();
  setCarCardState(id, 'busy');

  const oldRoot = carRoot;
  if (oldRoot) {
    const fromY = oldRoot.position.y;
    await new Promise((res) =>
      addTween(
        0.42,
        easeOutCubic,
        (k) => {
          oldRoot.scale.setScalar(1 - 0.18 * k);
          oldRoot.position.y = fromY - dims.height * 0.06 * k;
        },
        res
      )
    );
    scene.remove(oldRoot);
  }

  let entry = carCache.get(id);
  const freshLoad = !entry;
  if (!entry) {
    evictOldestBeforeLoad();
    showLoader(car.name);
    try {
      const gltf = await loadCarGltf(car);
      setupCar(gltf, car);
      hideLoader();
      entry = { root: carRoot, dims: { ...dims }, paintMats: [...paintMats], paintId: null };
      carCache.set(id, entry);
    } catch (e) {
      hideLoader();
      if (oldRoot) {
        oldRoot.scale.setScalar(1);
        oldRoot.position.y = 0;
        scene.add(oldRoot);
      }
      switching = false;
      setCarCardState(currentCarId, '');
      return;
    }
  } else {
    carRoot = entry.root;
    scene.add(carRoot);
    dims = entry.dims;
    paintMats = entry.paintMats;
    paintMat = paintMats[0] || null;
    fitViewport();
    ensureFloor();
    ensureAo();
  }

  currentCarId = id;
  const root = carRoot;
  root.scale.setScalar(0.001);
  root.position.y = -dims.height * 0.06;
  updateHud(car);
  updatePlateTool(car);
  buildPaintSwatches(car);
  applyPaint(entry.paintId || car.paints[0].id);
  applyLight(activeLight);

  activeView = 'hero';
  document
    .querySelectorAll('.view-btn')
    .forEach((x) => x.classList.toggle('active', x.dataset.view === 'hero'));
  flyTo(VIEWS[0]);

  await new Promise((res) =>
    addTween(
      0.7,
      easeOutBack,
      (k) => {
        root.scale.setScalar(Math.max(k, 0.001));
        root.position.y = -dims.height * 0.06 * (1 - k);
      },
      () => {
        root.scale.setScalar(1);
        root.position.y = 0;
        res();
      }
    )
  );
  entry.paintId = currentPaintId;
  switching = false;
  setCarCardState(id, '');
  // 缩略图要等车漆应用、入场动画结束（scale=1）后再渲染，
  // 否则会沿用模型原始材质色或渲染到缩小的车上
  if (freshLoad) generateThumb(id);
}

// 释放整车资源（几何/材质/贴图），内存里最多同时留两辆车；
// 全局共享贴图（车漆粗糙度、车牌贴图）不能动，否则别的车会缺贴图
function disposeRoot(root) {
  const shared = new Set();
  if (paintRoughness) shared.add(paintRoughness);
  if (cnPlateMaps) {
    shared.add(cnPlateMaps.map);
    shared.add(cnPlateMaps.normalMap);
  }
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (v && v.isTexture && !shared.has(v)) v.dispose();
      }
      m.dispose();
    }
    obj.geometry?.dispose();
  });
}

// 缓存最多留当前车 + 上一辆：加载新大模型前先把最老的一辆释放掉，
// 避免解析 60MB 模型时三辆车同时挤在内存里把页面卡死
function evictOldestBeforeLoad() {
  if (carCache.size < 2) return;
  for (const [cid, en] of carCache) {
    if (cid === currentCarId) continue;
    disposeRoot(en.root);
    carCache.delete(cid);
    return;
  }
}

/* ---------- UI ---------- */

function closePanels() {
  Object.values(panels).forEach((p) => (p.hidden = true));
  toolPanelButtons.forEach((b) => b.classList.remove('active'));
}

function togglePanel(name) {
  const wasOpen = !panels[name].hidden;
  closePanels();
  if (!wasOpen) {
    panels[name].hidden = false;
    toolPanelButtons.forEach((b) =>
      b.classList.toggle('active', b.dataset.panel === name)
    );
  }
}

toolPanelButtons.forEach((btn) => {
  btn.addEventListener('click', () => togglePanel(btn.dataset.panel));
});

document.querySelectorAll('.panel-close').forEach((btn) => {
  btn.addEventListener('click', closePanels);
});

function buildUi() {
  const viewGrid = document.getElementById('viewGrid');
  VIEWS.forEach((v) => {
    const b = document.createElement('button');
    b.className = 'view-btn' + (v.id === activeView ? ' active' : '');
    b.dataset.view = v.id;
    b.innerHTML = `${v.label}<small>${v.en}</small>`;
    b.addEventListener('click', () => {
      activeView = v.id;
      document
        .querySelectorAll('.view-btn')
        .forEach((x) => x.classList.toggle('active', x.dataset.view === v.id));
      flyTo(v);
      closePanels();
    });
    viewGrid.appendChild(b);
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    activeView = 'hero';
    document
      .querySelectorAll('.view-btn')
      .forEach((x) => x.classList.toggle('active', x.dataset.view === 'hero'));
    flyTo(VIEWS[0]);
    closePanels();
  });

  const lightGrid = document.getElementById('lightGrid');
  LIGHTS.forEach((l) => {
    const b = document.createElement('button');
    b.className = 'light-btn' + (l.id === activeLight ? ' active' : '');
    b.dataset.light = l.id;
    b.innerHTML = `<i></i><span>${l.name}</span>`;
    b.addEventListener('click', () => applyLight(l.id));
    lightGrid.appendChild(b);
  });
}

function buildPaintSwatches(car) {
  const swatches = document.getElementById('swatches');
  swatches.innerHTML = '';

  const hasCn = car.paints.some((p) => p.market === 'cn');
  const hasUs = car.paints.some((p) => p.market === 'us');
  const hasRef = car.paints.some((p) => p.market === 'ref');
  const groups = [
    ...(hasRef ? [{ market: 'ref', label: '参考车漆' }] : []),
    ...(hasCn && hasUs
      ? [
          {
            market: 'cn',
            label: car.paintGroups
              ? car.paintGroups.cn
              : car.id === 'rav4'
                ? '一汽丰田（国产）'
                : '上汽通用（国产）',
          },
          { market: 'us', label: car.paintGroups ? car.paintGroups.us : '美规（非国产）' },
        ]
      : [{ market: 'all', label: '通用配色' }]),
  ];

  groups.forEach((g) => {
    const list = car.paints.filter((p) => p.market === g.market);
    if (!list.length) return;
    const head = document.createElement('div');
    head.className = 'swatch-group';
    head.innerHTML = `<span>${g.label}</span><i>${list.length} 色</i>`;
    swatches.appendChild(head);
    const row = document.createElement('div');
    row.className = 'swatch-row';
    list.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (p.id === currentPaintId ? ' active' : '');
      b.dataset.paint = p.id;
      b.style.setProperty('--c', p.color);
      if (p.note) b.title = p.note;
      b.innerHTML = '<i></i><span>' + p.name + '</span>';
      b.addEventListener('click', () => applyPaint(p.id));
      row.appendChild(b);
    });
    swatches.appendChild(row);
  });

  if (car.paintsNote) {
    const note = document.createElement('p');
    note.className = 'paint-note';
    note.innerHTML = car.paintsNote;
    swatches.appendChild(note);
  }
}

function makeCarCard(car, i) {
  const b = document.createElement('button');
  b.className = 'car-card';
  b.dataset.car = car.id;
  b.style.setProperty('--i', i);
  b.innerHTML =
    '<span class="car-thumb"><img src="thumbs/' +
    car.id +
    '.png" alt=""><i class="car-thumb-ph">' +
    car.mark +
    '</i><span class="car-thumb-loading"></span></span>' +
    '<span class="car-meta"><strong>' +
    car.name +
    '</strong></span>';
  const thumb = b.querySelector('.car-thumb');
  thumb.querySelector('img').addEventListener(
    'load',
    () => thumb.classList.add('ready'),
    { once: true }
  );
  b.addEventListener('click', () => chooseCar(car.id));
  return b;
}

function buildCarSwitcher() {
  const nav = document.getElementById('carSwitch');
  if (!nav) return;
  nav.innerHTML = '';
  CARS.forEach((car, i) => nav.appendChild(makeCarCard(car, i)));
}

function buildPicker() {
  const grid = document.getElementById('pickerGrid');
  if (!grid) return;
  grid.innerHTML = '';
  CARS.forEach((car, i) => grid.appendChild(makeCarCard(car, i)));
}

let started = false;
let starting = false;

function chooseCar(id) {
  if (started) return switchCar(id);
  if (!starting) startViewer(id);
}

// 首屏选车后才会加载第一辆车的 GLB，避免一打开就下载几十 MB 模型
async function startViewer(id) {
  const car = CARS.find((c) => c.id === id);
  if (!car) return;
  starting = true;
  document.getElementById('picker').classList.add('hide');
  document.body.classList.remove('picking');
  showLoader(car.name);

  try {
    await envReady;
    const gltf = await loadCarGltf(car);
    setupCar(gltf, car);
    currentCarId = car.id;
    carCache.set(currentCarId, {
      root: carRoot,
      dims: { ...dims },
      paintMats: [...paintMats],
      paintId: null,
    });
    updateHud(car);
    updatePlateTool(car);
    buildPaintSwatches(car);
    setCarCardState(currentCarId, '');
    applyLight('studio');
    applyPaint(car.paints[0].id);
    generateThumb(currentCarId);
    placeInstant(VIEWS.find((v) => v.id === 'rear'));
    setProgress(1);
    setTimeout(() => {
      loader.classList.add('hide');
      setTimeout(() => (loader.style.display = 'none'), 600);
      setTimeout(() => hint.classList.add('hide'), 9000);
    }, 350);
    setAutoRotate(false);
    started = true;
  } catch (e) {
    console.error(e);
    loader.classList.add('hide');
    setTimeout(() => (loader.style.display = 'none'), 600);
    document.getElementById('picker').classList.remove('hide');
    document.body.classList.add('picking');
  }
  starting = false;
}

// 前后牌照共用同一对贴图，换掉纹理对象里的 image 即可同时生效。
// 贴图在浏览器端生成，号码只写入本机 localStorage，不上传
async function applyPlateNumber(text) {
  await plateFontReady;
  buildCnPlateMaps(text);
  try {
    localStorage.setItem(PLATE_STORE_KEY, text);
  } catch {
    /* 隐私模式下不持久化，本次会话内仍然生效 */
  }
}

function buildPlateEditor() {
  const regionBox = document.getElementById('plateRegion');
  const input = document.getElementById('plateInput');
  const apply = document.getElementById('btnPlateApply');
  const msg = document.getElementById('plateMsg');

  // 31 个省级地区简称，按键盘式三行排列
  const REGION_ROWS = ['京津冀晋蒙辽吉黑沪苏', '浙皖闽赣鲁豫鄂湘粤桂', '琼渝川贵云藏陕甘青宁新'];
  let selectedRegion = cnPlateNumber[0];
  input.value = cnPlateNumber.slice(1);
  REGION_ROWS.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'region-row';
    [...row].forEach((r) => {
      const k = document.createElement('button');
      k.type = 'button';
      k.className = 'region-key' + (r === selectedRegion ? ' active' : '');
      k.textContent = r;
      k.addEventListener('click', () => {
        selectedRegion = r;
        regionBox.querySelectorAll('.region-key').forEach((x) => x.classList.toggle('active', x === k));
      });
      rowEl.appendChild(k);
    });
    regionBox.appendChild(rowEl);
  });

  const show = (text, isErr) => {
    msg.textContent = text;
    msg.classList.toggle('err', !!isErr);
  };
  const submit = async () => {
    const text = selectedRegion + input.value.trim().toUpperCase();
    if (!PLATE_RE.test(text)) {
      show('后 6 位：1 个字母 + 5 位字母或数字（如 A88888）', true);
      return;
    }
    apply.disabled = true;
    show('正在生成…');
    try {
      await applyPlateNumber(text);
      input.value = text.slice(1);
      show(`已更新为 ${text}，仅在你的浏览器生效`);
    } catch (e) {
      show(e.message || '生成失败', true);
    } finally {
      apply.disabled = false;
    }
  };
  apply.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

function setAutoRotate(on) {
  autoRotateOn = on;
  controls.autoRotate = on;
  btnRotate.classList.toggle('active', on);
}

btnRotate.addEventListener('click', () => setAutoRotate(!autoRotateOn));

btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
});

document.addEventListener('fullscreenchange', () => {
  btnFullscreen.classList.toggle('active', !!document.fullscreenElement);
});

canvas.addEventListener('pointerdown', () => {
  if (camTween) {
    camTween = null;
    controls.enabled = true;
  }
  closePanels();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePanels();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- boot ---------- */

buildUi();
buildPlateEditor();
buildCarSwitcher();
buildPicker();

renderer.setAnimationLoop(() => {
  const dt = getDelta();
  updateTween(dt);
  updateTweens(dt);
  controls.update();
  renderer.render(scene, camera);
});
