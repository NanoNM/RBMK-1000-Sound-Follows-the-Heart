import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================================
// Three.js 专用颜色常量集中管理。
// 这些颜色会传给 Three.js 材质/灯光，无法直接使用 CSS 变量。
// ============================================================================
const COLORS = {
    sceneBackground: '#232422',

    // 灯光
    hemiSky: '#e0e0dc',
    hemiGround: '#292a28',
    keyLight: '#e8e7e2',
    rimLight: '#c8cbc7',

    // 主体材质
    steel: '#777873',
    darkSteel: '#484a47',
    graphite: '#858680',
    rimMaterial: '#a1a29c',
    ribMaterial: '#92938d',
    pipeMaterial: '#52675d',

    // 石墨块调色板
    shade0: '#858680',
    shade1: '#92938d',
    shade2: '#777873',
    shade3: '#9a9b95',
    radialCenter: '#b8b8b2',
    radialEdge: '#5d5e59',

    // 边线 / 定位针 / 选中框 / 地面
    columnEdge: '#343532',
    pin: '#3b3c39',
    selection: '#e5e9aa',
    floor: '#252624',

    // 特殊反应管顶部标记
    markerControl: '#5F7F55',
    markerNeutron: '#527A91',
    markerShort: '#A68A3A',
    markerAutomatic: '#8F4C48',
    emissiveControl: '#0b3d1c',
    emissiveNeutron: '#082d66',
    emissiveShort: '#5a4700',
    emissiveAutomatic: '#5c0b0b'
};

// 全局跳跃开关：关闭后不再触发新跳跃，但允许空中的柱体完成当前动作。
let jumpSwitch = true;
const musicAudio = document.querySelector('#musicAudio');
const musicFile = document.querySelector('#musicFile');
const musicStatus = document.querySelector('#musicStatus');
const musicMeterFill = document.querySelector('#musicMeterFill');
const toggleMusicButton = document.querySelector('#toggleMusic');
const toggleDeviceAudioButton = document.querySelector('#toggleDeviceAudio');
let audioContext = null;
let audioAnalyser = null;
let audioFrequencyData = null;
let audioSource = null;
let audioObjectUrl = null;
let audioFileName = '';
let lastBeatTriggeredCellCount = 0;
const canvas = document.querySelector('#model');
const viewport = document.querySelector('#viewport');
const loading = document.querySelector('#loading');
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sceneBackground);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
// 初始视角：调这三个坐标可改变模型的默认观察方向和远近。
camera.position.set(22, 18, 26);
camera.lookAt(0, -0.45, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -0.45, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
// 鼠标滚轮的缩放范围；数值越小越近，越大可拉得越远。
controls.minDistance = 18;
controls.maxDistance = 56;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();
controls.saveState();

scene.add(new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 2.05));
const keyLight = new THREE.DirectionalLight(COLORS.keyLight, 3.1);
keyLight.position.set(-13, 22, 16);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -24;
keyLight.shadow.camera.right = 24;
keyLight.shadow.camera.top = 24;
keyLight.shadow.camera.bottom = -24;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(COLORS.rimLight, 1.2);
rimLight.position.set(13, 8, -18);
scene.add(rimLight);

const reactor = new THREE.Group();
scene.add(reactor);
// 模型材质：分别控制金属外壳、底座和石墨格块的基础颜色与质感。
const steel = new THREE.MeshStandardMaterial({ color: COLORS.steel, metalness: 0.58, roughness: 0.48, side: THREE.DoubleSide });
const darkSteel = new THREE.MeshStandardMaterial({ color: COLORS.darkSteel, metalness: 0.48, roughness: 0.54 });
const graphite = new THREE.MeshStandardMaterial({ color: COLORS.graphite, roughness: 0.9, metalness: 0.04 });

function addCylinder(radiusTop, radiusBottom, height, material, y, openEnded = false, segments = 96) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, openEnded), material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    reactor.add(mesh);
    return mesh;
}

// 主体外壳：整体高度下压，让反应堆顶面贴近地面，视觉更稳定，也更适合低视角观察。
const shellHeight = 1.65;
const shellCenterY = -0.68;
const shellBottomY = shellCenterY - shellHeight / 2;
addCylinder(10.1, 10.35, shellHeight, steel, shellCenterY, true);
// 底座和堆芯圆形底板：半径应与外壳及格点范围协调，且整体抬升控制在更低位置。
addCylinder(11.25, 11.25, 0.4, darkSteel, -1.75);
addCylinder(10.05, 10.05, 0.3, graphite, -0.1);

// 外壳上下沿：每组数值为 [圆环半径, 高度, 圆环粗细]。
const rimMaterial = new THREE.MeshStandardMaterial({ color: COLORS.rimMaterial, metalness: 0.66, roughness: 0.34 });
for (const [radius, y, tube] of [[10.3, 0.255, 0.12], [10.48, -1.89, 0.075]]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 12, 120), rimMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y;
    rim.castShadow = true;
    reactor.add(rim);
}

// 外壁竖向加强筋：调整尺寸可改变筋条粗细/长度，循环次数控制环绕一圈的数量。
const ribGeometry = new THREE.BoxGeometry(0.16, 1.62, 0.24);
const ribMaterial = new THREE.MeshStandardMaterial({ color: COLORS.ribMaterial, metalness: 0.52, roughness: 0.48 });
for (let index = 0; index < 28; index++) {
    const angle = index / 28 * Math.PI * 2;
    const rib = new THREE.Mesh(ribGeometry, ribMaterial);
    rib.position.set(Math.cos(angle) * 10.43, -0.82, Math.sin(angle) * 10.43);
    rib.rotation.y = -angle;
    rib.castShadow = true;
    reactor.add(rib);
}

// 两侧冷却管接口：修改圆柱半径、长度或 position，可调整管口的粗细、伸出长度和位置。
// const pipeMaterial = new THREE.MeshStandardMaterial({ color: COLORS.pipeMaterial, metalness: 0.58, roughness: 0.4 });
// for (const direction of [-1, 1]) {
// 	const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 2.8, 28), pipeMaterial);
// 	pipe.rotation.z = Math.PI / 2;
// 	pipe.position.set(direction * 11.15, -0.93, 0);
// 	pipe.castShadow = true;
// 	reactor.add(pipe);
// 	const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.2, 32), rimMaterial);
// 	flange.rotation.z = Math.PI / 2;
// 	flange.position.set(direction * 11.45, -0.93, 0);
// 	reactor.add(flange);
// }

// 堆芯格点布局：spacing 控制格块间距，gridRadius 控制圆形边界大小。
// row / column 的循环范围决定格点生成范围；边缘由圆半径自动裁成圆形。
// 收集圆形堆芯内的格点；方柱、定位针和点击选格都通过该数组保持索引对应。
const cells = [];

// ============================================================================
// RBMK 特殊反应管配置
// ============================================================================
// control   = 控制棒             → 绿色
// neutron   = 中子监控器         → 蓝色
// short     = 短控制棒           → 黄色
// automatic = 自动控制棒         → 红色
//
// 这里的 Cxx-Ryy 是模型中的格点编号。
// 后续如果需要调整具体位置，只需要修改这里即可。
// ============================================================================
const specialChannels = new Map([
    ['C01-R18', 'control'],
    ['C05-R09', 'control'],
    ['C05-R13', 'control'],
    ['C05-R18', 'automatic'],
    ['C05-R23', 'control'],
    ['C05-R27', 'control'],
    ['C07-R07', 'short'],
    ['C07-R11', 'short'],
    ['C07-R15', 'control'],
    ['C07-R21', 'control'],
    ['C07-R25', 'short'],
    ['C07-R29', 'short'],
    ['C09-R05', 'control'],
    ['C09-R09', 'automatic'],
    ['C09-R13', 'control'],
    ['C09-R18', 'control'],
    ['C09-R23', 'control'],
    ['C09-R27', 'automatic'],
    ['C09-R31', 'control'],
    ['C11-R07', 'short'],
    ['C11-R11', 'neutron'],
    ['C11-R15', 'control'],
    ['C11-R21', 'control'],
    ['C11-R25', 'neutron'],
    ['C11-R29', 'short'],
    ['C13-R05', 'control'],
    ['C13-R09', 'control'],
    ['C13-R13', 'control'],
    ['C13-R18', 'automatic'],
    ['C13-R23', 'control'],
    ['C13-R27', 'control'],
    ['C13-R31', 'control'],
    ['C15-R03', 'control'],
    ['C15-R07', 'control'],
    ['C15-R11', 'short'],
    ['C15-R16', 'short'],
    ['C15-R20', 'short'],
    ['C15-R25', 'short'],
    ['C15-R29', 'control'],
    ['C15-R33', 'control'],
    ['C17-R18', 'control'],
    ['C18-R01', 'control'],
    ['C18-R05', 'automatic'],
    ['C18-R09', 'control'],
    ['C18-R13', 'automatic'],
    ['C18-R17', 'control'],
    ['C18-R19', 'control'],
    ['C18-R23', 'automatic'],
    ['C18-R27', 'control'],
    ['C18-R31', 'automatic'],
    ['C18-R35', 'control'],
    ['C19-R18', 'control'],
    ['C21-R03', 'control'],
    ['C21-R11', 'short'],
    ['C21-R16', 'short'],
    ['C21-R20', 'short'],
    ['C21-R25', 'short'],
    ['C21-R29', 'control'],
    ['C21-R33', 'control'],
    ['C22-R07', 'control'],
    ['C23-R05', 'control'],
    ['C23-R09', 'control'],
    ['C23-R13', 'control'],
    ['C23-R18', 'automatic'],
    ['C23-R23', 'control'],
    ['C23-R27', 'control'],
    ['C23-R31', 'control'],
    ['C25-R07', 'short'],
    ['C25-R11', 'neutron'],
    ['C25-R15', 'control'],
    ['C25-R21', 'control'],
    ['C25-R25', 'neutron'],
    ['C25-R29', 'short'],
    ['C27-R05', 'control'],
    ['C27-R09', 'automatic'],
    ['C27-R13', 'control'],
    ['C27-R18', 'control'],
    ['C27-R23', 'control'],
    ['C27-R27', 'automatic'],
    ['C27-R31', 'control'],
    ['C29-R07', 'short'],
    ['C29-R11', 'short'],
    ['C29-R15', 'control'],
    ['C29-R21', 'control'],
    ['C29-R25', 'short'],
    ['C29-R29', 'short'],
    ['C31-R09', 'control'],
    ['C31-R13', 'control'],
    ['C31-R18', 'automatic'],
    ['C31-R23', 'control'],
    ['C31-R27', 'control'],
    ['C35-R18', 'control']
]);

const spacing = 0.56;
const gridRadius = 9.55;
// 动画可调参数：跳跃高度使用模型单位；冷却时间和初次错峰等待使用秒。
// 以下参数均为 let 变量，可由右侧"参数调节"面板中的滑块实时修改。
let jumpHeightMin = 0.12;
let jumpHeightMax = 0.62;
// 频谱空间映射：堆芯中心取高频，外缘取低频；静音阈值过滤底噪。
let audioLowFrequency = 35;
let audioHighFrequency = 8000;
let audioNoiseFloor = 0.08;
const audioLevelCeiling = 1;
let audioLevelExponent = 1.35;
let audioBandWidthRatio = 0.24;
let audioJumpHeightMax = 3;
let audioHighFrequencyGain = 4.5;
let audioLowFrequencyGain = 0.04;
// ============================================================================
// 设备音频捕获
// ============================================================================
// systemAudioStream：浏览器授权后返回的设备共享音频流。
// systemAudioContext：专门用于分析设备音频的 Web Audio Context。
// systemAudioAnalyser：FFT 频谱分析器。
// systemAudioFrequencyData：实时保存设备音频的频谱数据。
let systemAudioStream = null;
let systemAudioContext = null;
let systemAudioAnalyser = null;
let systemAudioFrequencyData = null;
let systemAudioSource = null;
let deviceAudioActive = false;

// ============================================================================
// Wallpaper Engine 音频监听
// ============================================================================
// 在 Wallpaper Engine 中运行时，WE 会以固定频率回调 wallpaperAudioListener，
// audioArray 为 128 个 0~1 的数值：前 64 个是左声道频谱，后 64 个是右声道频谱。
// 普通浏览器不存在该 API，注册语句会自动跳过，不影响原有功能。
//
// wallpaperFrequencyData：合并左右声道后的频谱（换算到 0~255，与 FFT 数据同刻度）。
// wallpaperAudioLastTime：最近一次收到音频数据的时间，用于判断数据流是否有效。
//
// wallpaperAudioGain：Wallpaper 频谱增益。
// WE 推送的 0~1 电平通常偏小，柱体反应不够明显时调大该值；
// 超过 1.0 会放大电平，小于 1.0 会衰减电平，最终仍钳制在 0~255 内。
let wallpaperAudioGain = 4;

// 静音检测：频谱最高电平持续低于该阈值视为"无声"（0~255 刻度）。
// 该值需考虑底噪，过小会因噪声误判有声，过大会漏掉轻音乐。
const wallpaperSilenceThreshold = 8;

// 持续无声超过该秒数后自动退出频谱驱动，回到随机跳动模式。
const wallpaperSilenceTimeout = 5;

let wallpaperFrequencyData = null;
let wallpaperAudioLastTime = 0;

// ============================================================================
// 统一响度（自动增益 AGC）
// ============================================================================
// 三个音频来源的频谱刻度不同：
//   1. 本地音乐：Analyser dB 归一化（-85 ~ -10dB）
//   2. 设备音频：同样的 dB 归一化，但混音器电平与本地文件差别很大
//   3. Wallpaper：原始 0~255 电平 * wallpaperAudioGain
// 直接映射会导致同一首歌在三个来源下柱体高度差别明显。
//
// 解决方式：每帧统计整体频谱平均电平，并用滑动平均维护"当前响度基准"，
// 随后把每个频带的电平除以该基准再乘统一目标值。
// 这样无论来自哪个来源，安静段的平均电平都映射到 spectrumAgcTarget，
// 柱体的整体跳动幅度在三个来源下保持一致。
//
// spectrumAgcTarget：统一后的响度基准（0~1）。调大整体更"响"，调小更"静"。
// spectrumAgcSpeed：基准跟随速度（0~1，越小越平滑，抗瞬时鼓点干扰）。
// spectrumAgcFloor：基准下限，防止极安静时把底噪放大到刺眼。
// ============================================================================
// 三个变量均可通过参数面板滑块实时修改，因此声明为 let。
let spectrumAgcTarget = 0.15;
let spectrumAgcSpeed = 0.025;
let spectrumAgcFloor = 0.06;
let spectrumLoudnessReference = spectrumAgcTarget;

// ============================================================================
// 参数调节面板配置
// ============================================================================
// 每一项描述一个可调滑块：绑定的变量、取值范围、步长和显示单位。
// 目标变量以字符串给出，通过 window[key] 或模块级 get/set 函数绑定。
// 由于脚本运行在 module 作用域，这里使用 getter/setter 对接变量。
// ============================================================================
const tunableSliders = [
    // —— 频谱驱动 ——
    { key: 'audioJumpHeightMax',    label: '频谱跳跃高度',   min: 0.5,  max: 8,    step: 0.1,   get: () => audioJumpHeightMax,    set: v => audioJumpHeightMax = v },
    { key: 'audioHighFrequencyGain',label: '高频增益',       min: 0,    max: 12,   step: 0.1,   get: () => audioHighFrequencyGain,set: v => audioHighFrequencyGain = v },
    { key: 'audioLowFrequencyGain', label: '低频增益',       min: 0,    max: 3,    step: 0.01,  get: () => audioLowFrequencyGain, set: v => audioLowFrequencyGain = v },
    { key: 'audioNoiseFloor',       label: '底噪阈值',       min: 0.01, max: 0.3,  step: 0.005, get: () => audioNoiseFloor,       set: v => audioNoiseFloor = v },
    { key: 'audioLevelExponent',    label: '压缩曲线指数',   min: 0.3,  max: 3.5,  step: 0.05,  get: () => audioLevelExponent,    set: v => audioLevelExponent = v },
    { key: 'audioBandWidthRatio',   label: '频带宽度比例',   min: 0.02, max: 0.6,  step: 0.01,  get: () => audioBandWidthRatio,   set: v => audioBandWidthRatio = v },
    { key: 'spectrumAgcTarget',     label: '统一响度目标',   min: 0.03, max: 0.6,  step: 0.005, get: () => spectrumAgcTarget,     set: v => spectrumAgcTarget = v },
    { key: 'spectrumAgcSpeed',      label: '响度跟随速度',   min: 0.002,max: 0.2,  step: 0.002, get: () => spectrumAgcSpeed,      set: v => spectrumAgcSpeed = v },
    { key: 'spectrumAgcFloor',      label: '响度基准下限',   min: 0.01, max: 0.2,  step: 0.005, get: () => spectrumAgcFloor,      set: v => spectrumAgcFloor = v },
    { key: 'wallpaperAudioGain',    label: 'Wallpaper 增益', min: 0.5,  max: 20,   step: 0.1,   get: () => wallpaperAudioGain,    set: v => wallpaperAudioGain = v },
    // —— 随机跳跃 ——
    { key: 'jumpHeightMin',         label: '随机跳跃最小',   min: 0,    max: 1,    step: 0.01,  get: () => jumpHeightMin,         set: v => jumpHeightMin = v },
    { key: 'jumpHeightMax',         label: '随机跳跃最大',   min: 0.1,  max: 2.5,  step: 0.01,  get: () => jumpHeightMax,         set: v => jumpHeightMax = v },
    { key: 'landingCooldownMin',    label: '落地冷却最小',   min: 0,    max: 5,    step: 0.1,   get: () => landingCooldownMin,    set: v => landingCooldownMin = v },
    { key: 'landingCooldownMax',    label: '落地冷却最大',   min: 0.5,  max: 12,   step: 0.1,   get: () => landingCooldownMax,    set: v => landingCooldownMax = v },
    { key: 'initialJumpDelayMax',   label: '初始错峰上限',   min: 0,    max: 8,    step: 0.1,   get: () => initialJumpDelayMax,   set: v => initialJumpDelayMax = v }
];

// 静音开始时间戳；0 表示当前不在静音期。
let wallpaperSilentSince = 0;

// Wallpaper 数据没有真实的 AudioContext / Analyser，
// 用等效参数构造虚拟对象，使下方的频带映射逻辑保持统一：
// 64 个频点覆盖 0 ~ 22050Hz（按 44100Hz 采样率估算），
// 因此 fftSize 取 128 → binWidth = 44100 / 128 ≈ 344.5Hz / 频点。
const wallpaperVirtualAnalyser = { fftSize: 128 };
const wallpaperVirtualContext = { sampleRate: 44100 };

function wallpaperAudioListener(audioArray) {
    if (!Array.isArray(audioArray) || audioArray.length < 2) return;
    const channelBins = Math.floor(audioArray.length / 2);
    if (!wallpaperFrequencyData || wallpaperFrequencyData.length !== channelBins) {
        wallpaperFrequencyData = new Uint8Array(channelBins);
    }
    for (let index = 0; index < channelBins; index++) {
        const left = audioArray[index] || 0;
        const right = audioArray[channelBins + index] || 0;
        const level = Math.min(1, Math.max(0, Math.max(left, right) * wallpaperAudioGain));
        wallpaperFrequencyData[index] = level * 255;
    }
    wallpaperAudioLastTime = performance.now();
}

// 仅当运行在 Wallpaper Engine 内时才存在该 API。
if (typeof window.wallpaperRegisterAudioListener === 'function') {
    window.wallpaperRegisterAudioListener(wallpaperAudioListener);
}

let landingCooldownMin = 1;
let landingCooldownMax = 5;
let initialJumpDelayMax = 3;
// 返回 [min, max) 范围内的随机数，供格点动画参数使用。
const randomBetween = (min, max) => min + Math.random() * (max - min);
// 遍历方形候选区域，再按到圆心的距离筛成圆形堆芯。
for (let row = -17; row <= 17; row++) {
    for (let column = -17; column <= 17; column++) {
        const x = column * spacing;
        const z = row * spacing;
        if (Math.hypot(x, z) > gridRadius) continue;
        const seed = Math.abs((column * 31 + row * 47 + column * row * 13) % 127);
        const id = `C${String(column + 18).padStart(2, '0')}-R${String(row + 18).padStart(2, '0')}`;
        cells.push({ 
            id,
            x,
            z,
            row,
            column,
            seed,
            specialType: specialChannels.get(id) || null,
            audioRandomGain: randomBetween(0.65, 1.45),
            motionWait: Math.random() * initialJumpDelayMax,
            motionDuration: 0.45 + Math.random() * 0.9,
            motionPause: randomBetween(
                landingCooldownMin,
                landingCooldownMax
            ),
            motionAmplitude: randomBetween(
                jumpHeightMin,
                jumpHeightMax
            ),
            motionProgress: 0,
            motionJumping: false,
            audioOffset: 0,
            specialMarker: null
        });
    }
}

// 石墨方柱：顶面保持在原高度，整体向下延伸 10 个模型单位。
const graphiteColumnLength = 10;
const graphiteColumnTop = 0.205;
const blockGeometry = new THREE.BoxGeometry(0.525, graphiteColumnLength, 0.525);
const blocks = new THREE.InstancedMesh(blockGeometry, graphite, cells.length);
blocks.castShadow = true;
blocks.receiveShadow = true;
const dummy = new THREE.Object3D();
// 格块明暗变化调色板；改这些色值可统一调整普通石墨块的颜色。
const shades = [COLORS.shade0, COLORS.shade1, COLORS.shade2, COLORS.shade3];
const radialCenterColor = new THREE.Color(COLORS.radialCenter);
const radialEdgeColor = new THREE.Color(COLORS.radialEdge);
const ringPalette = shades.slice(0, 3).map(shade => new THREE.Color(shade));
const nestedPattern = [0, 1, 2, 1, 0, 1, 2];
const radialBandCount = 6;
function applyBlockStyle(style) {
    cells.forEach((cell, index) => {
        let color;
        if (style === 'uniform') {
            color = new THREE.Color(COLORS.shade0);
        } else if (style === 'radial') {
            const distance = Math.min(1, Math.hypot(cell.x, cell.z) / gridRadius);
            const noiseSource = Math.sin((cell.column + 53) * 127.1 + (cell.row + 29) * 311.7) * 43758.5453;
            const noise = noiseSource - Math.floor(noiseSource);
            const roughDistance = Math.min(1, Math.max(0, distance + (noise - 0.5) * 0.12));
            const ringPosition = roughDistance * radialBandCount;
            const ringIndex = Math.floor(ringPosition);
            const blend = ringPosition - ringIndex;
            const easedBlend = blend * blend * (3 - 2 * blend);
            const from = ringPalette[nestedPattern[ringIndex % nestedPattern.length]];
            const to = ringPalette[nestedPattern[(ringIndex + 1) % nestedPattern.length]];
            color = from.clone().lerp(to, easedBlend);
        } else {
            color = new THREE.Color(shades[cell.seed % shades.length]);
        }
        blocks.setColorAt(index, color);
    });
    blocks.instanceColor.needsUpdate = true;
    document.querySelectorAll('.style-button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.style === style));
    });
}
cells.forEach((cell, index) => {
    dummy.position.set(cell.x, graphiteColumnTop - graphiteColumnLength / 2, cell.z);
    dummy.rotation.y = ((cell.seed % 4) * Math.PI) / 2;
    dummy.updateMatrix();
    blocks.setMatrixAt(index, dummy.matrix);
    blocks.setColorAt(index, new THREE.Color(shades[cell.seed % shades.length]));
});
blocks.instanceMatrix.needsUpdate = true;
blocks.computeBoundingSphere();
blocks.boundingSphere.radius += 0.35;
reactor.add(blocks);
// ============================================================================
// RBMK 特殊反应管顶部彩色标记
// ============================================================================
//
// 标记直接放在反应管顶部，而不是使用 HTML DOM。
// 因此：
// 1. 会随着 Three.js 模型一起旋转
// 2. 会跟随反应管上下跳动
// 3. 不会影响鼠标选择
// 4. 普通反应管不会显示标记
//
// 颜色：
//   control   → 绿色
//   neutron   → 蓝色
//   short     → 黄色
//   automatic → 红色
// ============================================================================
const specialMarkerColors = {
    control: COLORS.markerControl,
    neutron: COLORS.markerNeutron,
    short: COLORS.markerShort,
    automatic: COLORS.markerAutomatic
};

// 标记边长。
// 反应管宽度为 0.525，方形标记贴合反应管顶面边缘。
const specialMarkerSize = 0.45;

// 标记厚度。
// 降低厚度使其成为贴在反应管顶面的薄片，不遮挡定位针凸点。
// 定位针底部位于 0.224，标记顶部 = graphiteColumnTop + 厚度 = 0.205 + 0.015 = 0.22，留有间隙。
const specialMarkerHeight = 0.01;

// 顶部标记几何体。
// 使用 BoxGeometry 生成方形薄片，贴合反应管方形顶面。
// BoxGeometry 默认沿 XYZ 轴，Y 方向为厚度。
const specialMarkerGeometry = new THREE.BoxGeometry(
    specialMarkerSize,
    specialMarkerHeight,
    specialMarkerSize
);

// 不同类别使用独立材质。
const specialMarkerMaterials = {
    control: new THREE.MeshStandardMaterial({
        color: specialMarkerColors.control,
        roughness: 0.38,
        metalness: 0.08,
        emissive: COLORS.emissiveControl,
        emissiveIntensity: 0.25
    }),

    neutron: new THREE.MeshStandardMaterial({
        color: specialMarkerColors.neutron,
        roughness: 0.38,
        metalness: 0.08,
        emissive: COLORS.emissiveNeutron,
        emissiveIntensity: 0.25
    }),

    short: new THREE.MeshStandardMaterial({
        color: specialMarkerColors.short,
        roughness: 0.38,
        metalness: 0.08,
        emissive: COLORS.emissiveShort,
        emissiveIntensity: 0.25
    }),

    automatic: new THREE.MeshStandardMaterial({
        color: specialMarkerColors.automatic,
        roughness: 0.38,
        metalness: 0.08,
        emissive: COLORS.emissiveAutomatic,
        emissiveIntensity: 0.25
    })
};

// 保存所有顶部标记，动画时可以统一更新。
const specialMarkers = [];

// 为特殊反应管创建顶部标记。
cells.forEach(cell => {
    if (!cell.specialType) {
        return;
    }

    const material = specialMarkerMaterials[cell.specialType];
    if (!material) {
        return;
    }

    const marker = new THREE.Mesh(specialMarkerGeometry, material);
    marker.position.set(
        cell.x,
        graphiteColumnTop + specialMarkerHeight / 2,
        cell.z
    );
    marker.castShadow = true;
    marker.receiveShadow = true;
    marker.renderOrder = 10;
    reactor.add(marker);
    cell.specialMarker = marker;
    specialMarkers.push({ cell, marker });
});

// 用一份动态 LineSegments 几何绘制所有方柱的 12 条棱，避免每根柱子单独创建线框对象。
const edgeGap = 0.002;
const halfBlockWidth = 0.525 / 2 + edgeGap;
const halfBlockHeight = graphiteColumnLength / 2;
const topEdgeY = halfBlockHeight + edgeGap;
const bottomEdgeY = -halfBlockHeight - edgeGap;
const edgePairs = [
    [[-halfBlockWidth, topEdgeY, -halfBlockWidth], [halfBlockWidth, topEdgeY, -halfBlockWidth]],
    [[halfBlockWidth, topEdgeY, -halfBlockWidth], [halfBlockWidth, topEdgeY, halfBlockWidth]],
    [[halfBlockWidth, topEdgeY, halfBlockWidth], [-halfBlockWidth, topEdgeY, halfBlockWidth]],
    [[-halfBlockWidth, topEdgeY, halfBlockWidth], [-halfBlockWidth, topEdgeY, -halfBlockWidth]],
    [[-halfBlockWidth, bottomEdgeY, -halfBlockWidth], [halfBlockWidth, bottomEdgeY, -halfBlockWidth]],
    [[halfBlockWidth, bottomEdgeY, -halfBlockWidth], [halfBlockWidth, bottomEdgeY, halfBlockWidth]],
    [[halfBlockWidth, bottomEdgeY, halfBlockWidth], [-halfBlockWidth, bottomEdgeY, halfBlockWidth]],
    [[-halfBlockWidth, bottomEdgeY, halfBlockWidth], [-halfBlockWidth, bottomEdgeY, -halfBlockWidth]],
    [[-halfBlockWidth, bottomEdgeY, -halfBlockWidth], [-halfBlockWidth, topEdgeY, -halfBlockWidth]],
    [[halfBlockWidth, bottomEdgeY, -halfBlockWidth], [halfBlockWidth, topEdgeY, -halfBlockWidth]],
    [[halfBlockWidth, bottomEdgeY, halfBlockWidth], [halfBlockWidth, topEdgeY, halfBlockWidth]],
    [[-halfBlockWidth, bottomEdgeY, halfBlockWidth], [-halfBlockWidth, topEdgeY, halfBlockWidth]]
];
const edgePositions = new Float32Array(cells.length * edgePairs.length * 6);
const edgeGeometry = new THREE.BufferGeometry();
const edgePositionAttribute = new THREE.BufferAttribute(edgePositions, 3);
edgePositionAttribute.setUsage(THREE.DynamicDrawUsage);
edgeGeometry.setAttribute('position', edgePositionAttribute);
const columnEdges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({ color: COLORS.columnEdge, transparent: true, opacity: 0.92 })
);
columnEdges.frustumCulled = false;
columnEdges.renderOrder = 1;
reactor.add(columnEdges);

const pinLength = 0.035;
const pinTopY = 0.2415;
const pinGeometry = new THREE.CylinderGeometry(0.042, 0.042, pinLength, 8);
const pinMaterial = new THREE.MeshStandardMaterial({ color: COLORS.pin, roughness: 0.72 });
const pins = new THREE.InstancedMesh(pinGeometry, pinMaterial, cells.length);
cells.forEach((cell, index) => {
    dummy.position.set(cell.x, pinTopY - pinLength / 2, cell.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pins.setMatrixAt(index, dummy.matrix);
});
pins.computeBoundingSphere();
pins.boundingSphere.radius += 0.35;
reactor.add(pins);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const selectionOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.55, 0.045, 0.55)),
    new THREE.LineBasicMaterial({ color: COLORS.selection })
);
selectionOutline.visible = false;
reactor.add(selectionOutline);
let pointerStart = null;
let selectedCell = null;
function selectCell(cell) {
    selectedCell = cell;
    selectionOutline.position.set(cell.x, graphiteColumnTop + 0.03, cell.z);
    selectionOutline.visible = true;
    document.querySelector('#selectionHint').textContent = `已选中格点 · ${cell.id}`;
}
function deselectCell() {
    selectedCell = null;
    selectionOutline.visible = false;
    document.querySelector('#selectionHint').textContent = '尚未选中格点 · 单击格块查看编号';
}
function focusCell(cell) {
    const previousTarget = controls.target.clone();
    const nextTarget = new THREE.Vector3(cell.x, -0.55, cell.z);
    camera.position.add(nextTarget.clone().sub(previousTarget));
    controls.target.copy(nextTarget);
    controls.update();
    selectCell(cell);
}
document.querySelector('#cellSearch').addEventListener('submit', event => {
    event.preventDefault();
    const query = document.querySelector('#cellSearchInput').value.trim().toUpperCase().replace(/_/g, '-');
    const cell = cells.find(item => item.id === query);
    if (!cell) {
        document.querySelector('#selectionHint').textContent = '未找到该编号 · 示例：C19-R20';
        return;
    }
    focusCell(cell);
});
canvas.addEventListener('pointerdown', event => {
    pointerStart = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointercancel', () => { pointerStart = null; });
canvas.addEventListener('pointerup', event => {
    if (!pointerStart) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (moved > 5) return;
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(blocks, false)[0];
    if (!hit || hit.instanceId === undefined) {
        deselectCell();
        return;
    }
    const cell = cells[hit.instanceId];
    if (cell === selectedCell) {
        deselectCell();
        return;
    }
    selectCell(cell);
});

// 圆形地面：放大半径并降低材质反光，避免视角下探时穿过地面看到底部。
const floor = new THREE.Mesh(
    new THREE.CircleGeometry(52, 96),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.98 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = shellBottomY - 0.12;
floor.receiveShadow = true;
scene.add(floor);

function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
}
window.addEventListener('resize', resize);
resize();
document.querySelectorAll('.style-button').forEach(button => {
    button.addEventListener('click', () => applyBlockStyle(button.dataset.style));
});

// ============================================================================
// 参数调节面板：根据 tunableSliders 动态生成滑块，并绑定到对应变量。
// 每个滑块即时写回变量，动画循环下一帧即生效，无需刷新页面。
// 此处位于所有参数声明之后，先记录各滑块默认值供"恢复初始"按钮使用。
// ============================================================================
const tunerPanel = document.querySelector('#tunerPanel');
const tunerBody = document.querySelector('#tunerBody');
const tunerCollapseButton = document.querySelector('#tunerCollapse');

tunableSliders.forEach(slider => {
    slider.def = slider.get();
});

tunableSliders.forEach(slider => {
    const item = document.createElement('div');
    item.className = 'tuner-item';

    const head = document.createElement('div');
    head.className = 'tuner-item-head';

    const label = document.createElement('span');
    label.textContent = slider.label;

    const output = document.createElement('output');
    output.textContent = String(slider.get());

    head.append(label, output);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(slider.min);
    input.max = String(slider.max);
    input.step = String(slider.step);
    input.value = String(slider.get());
    input.addEventListener('input', () => {
        slider.set(Number.parseFloat(input.value));
        output.textContent = String(slider.get());
    });

    item.append(head, input);
    tunerBody.append(item);
});

const tunerResetButton = document.querySelector('#tunerReset');
tunerResetButton.addEventListener('click', () => {
    tunableSliders.forEach(slider => {
        slider.set(slider.def);
    });
    tunerBody.querySelectorAll('.tuner-item').forEach((item, index) => {
        const slider = tunableSliders[index];
        const input = item.querySelector('input[type="range"]');
        const output = item.querySelector('output');
        input.value = String(slider.get());
        output.textContent = String(slider.get());
    });
});

tunerCollapseButton.addEventListener('click', () => {
    const collapsed = tunerPanel.classList.toggle('collapsed');
    tunerCollapseButton.textContent = collapsed ? '展开' : '收起';
});

function prepareAudioAnalysis() {
    if (audioAnalyser) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前浏览器不支持 Web Audio');
    audioContext = new AudioContextClass();
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 2048;
    audioAnalyser.smoothingTimeConstant = 0.1;
    audioAnalyser.minDecibels = -85;
    audioAnalyser.maxDecibels = -10;
    audioFrequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioSource = audioContext.createMediaElementSource(musicAudio);
    audioSource.connect(audioAnalyser);
    audioAnalyser.connect(audioContext.destination);
}

// ============================================================================
// 启动设备音频捕获
// ============================================================================
// 浏览器会弹出系统共享窗口。
// 用户需要选择屏幕/窗口，并勾选“共享系统音频”。
// 注意：浏览器必须获得用户明确授权，网页无法偷偷读取系统声音。
async function startDeviceAudioCapture() {
    try {
        stopDeviceAudioCapture();
        systemAudioStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        const audioTracks = systemAudioStream.getAudioTracks();

        if (!audioTracks.length) {
            musicStatus.textContent = '没有获取到设备音频，请勾选“共享系统音频”';
            stopDeviceAudioCapture();
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
            throw new Error('当前浏览器不支持 Web Audio API');
        }

        systemAudioContext = new AudioContextClass();
        await systemAudioContext.resume();

        systemAudioAnalyser = systemAudioContext.createAnalyser();
        systemAudioAnalyser.fftSize = 2048;
        systemAudioAnalyser.smoothingTimeConstant = 0.1;
        systemAudioAnalyser.minDecibels = -85;
        systemAudioAnalyser.maxDecibels = -10;
        systemAudioFrequencyData = new Uint8Array(systemAudioAnalyser.frequencyBinCount);

        systemAudioSource = systemAudioContext.createMediaStreamSource(systemAudioStream);
        systemAudioSource.connect(systemAudioAnalyser);

        deviceAudioActive = true;
        musicStatus.textContent = '设备音频频谱驱动中';
        toggleDeviceAudioButton.textContent = '停止设备音频';

        for (const track of systemAudioStream.getTracks()) {
            track.addEventListener('ended', () => {
                stopDeviceAudioCapture();
            });
        }

    } catch (error) {
        console.error('设备音频捕获失败:', error);
        stopDeviceAudioCapture();
        musicStatus.textContent = error instanceof Error ? error.message : '设备音频捕获失败';
    }
}

// ============================================================================
// 停止设备音频
// ============================================================================
function stopDeviceAudioCapture() {
    deviceAudioActive = false;

    if (systemAudioStream) {
        for (const track of systemAudioStream.getTracks()) {
            track.stop();
        }
        systemAudioStream = null;
    }

    if (systemAudioSource) {
        try {
            systemAudioSource.disconnect();
        } catch (_) {
        }
        systemAudioSource = null;
    }

    if (systemAudioContext) {
        try {
            systemAudioContext.close();
        } catch (_) {
        }
        systemAudioContext = null;
    }

    systemAudioAnalyser = null;
    systemAudioFrequencyData = null;

    toggleDeviceAudioButton.textContent = '设备音频';

    if (!musicAudio.paused) {
        musicStatus.textContent = `频谱驱动中 · ${audioFileName}`;
    } else if (audioFileName) {
        musicStatus.textContent = `已载入 · ${audioFileName}`;
    } else {
        musicStatus.textContent = '未载入音乐';
    }
}

function updateMusicStatus() {
    if (musicAudio.ended) {
        toggleMusicButton.textContent = '重播';
        musicStatus.textContent = `播放结束 · ${audioFileName}`;
    } else if (musicAudio.paused) {
        toggleMusicButton.textContent = '播放';
        musicStatus.textContent = `已载入 · ${audioFileName}`;
    } else {
        toggleMusicButton.textContent = '暂停';
        musicStatus.textContent = `频谱驱动中 · ${audioFileName}`;
    }
}

// ============================================================================
// 设备音频按钮
// ============================================================================
// 第一次点击：请求设备音频权限。
// 再次点击：停止设备音频捕获。
toggleDeviceAudioButton.addEventListener('click', async () => {
    if (deviceAudioActive) {
        stopDeviceAudioCapture();
        return;
    }

    await startDeviceAudioCapture();
});

document.querySelector('#chooseMusic').addEventListener('click', () => musicFile.click());
musicFile.addEventListener('change', () => {
    const file = musicFile.files?.[0];
    if (!file) return;
    musicAudio.pause();
    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    audioFileName = file.name;
    audioObjectUrl = URL.createObjectURL(file);
    musicAudio.src = audioObjectUrl;
    musicAudio.load();
    toggleMusicButton.disabled = false;
    musicStatus.textContent = `已载入 · ${audioFileName}`;
});
toggleMusicButton.addEventListener('click', async () => {
    if (!musicAudio.paused) {
        musicAudio.pause();
        return;
    }
    try {
        prepareAudioAnalysis();
        await audioContext.resume();
        await musicAudio.play();
    } catch (error) {
        musicStatus.textContent = error instanceof Error ? error.message : '音频无法播放';
    }
});
musicAudio.addEventListener('play', updateMusicStatus);
musicAudio.addEventListener('pause', updateMusicStatus);
musicAudio.addEventListener('ended', updateMusicStatus);
musicAudio.addEventListener('error', () => {
    musicStatus.textContent = '音频读取失败，请换一个文件';
});

document.querySelector('#topView').addEventListener('click', () => {
    camera.position.set(0, 34, 0.01);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, -0.55, 0);
    controls.target.set(0, -0.55, 0);
    controls.update();
});
document.querySelector('#resetView').addEventListener('click', () => {
    camera.up.set(0, 1, 0);
    controls.reset();
});
document.querySelector('#stopJump').addEventListener('click', event => {
    jumpSwitch = !jumpSwitch;
    event.currentTarget.textContent = jumpSwitch ? '停止跳跃' : '继续跳跃';
});

loading.hidden = true;
const motionClock = new THREE.Clock();
// Three.js 按显示器刷新节奏执行此回调；每帧更新动画、镜头控制并绘制场景。
renderer.setAnimationLoop(() => {
    const delta = Math.min(motionClock.getDelta(), 0.05);

    const localMusicPlaying = Boolean(
        audioAnalyser &&
        audioContext?.state === 'running' &&
        !musicAudio.paused &&
        !musicAudio.ended
    );

    const deviceAudioPlaying = Boolean(
        deviceAudioActive &&
        systemAudioAnalyser &&
        systemAudioContext?.state === 'running' &&
        systemAudioFrequencyData
    );

    const wallpaperDataAlive = Boolean(
        wallpaperAudioLastTime > 0 &&
        wallpaperFrequencyData &&
        performance.now() - wallpaperAudioLastTime < 600
    );

    let wallpaperPeakLevel = 0;
    if (wallpaperDataAlive) {
        for (let index = 0; index < wallpaperFrequencyData.length; index++) {
            wallpaperPeakLevel = Math.max(wallpaperPeakLevel, wallpaperFrequencyData[index]);
        }
        if (wallpaperPeakLevel >= wallpaperSilenceThreshold) {
            wallpaperSilentSince = 0;
        } else if (wallpaperSilentSince === 0) {
            wallpaperSilentSince = performance.now();
        }
    } else {
        wallpaperSilentSince = 0;
    }

    const wallpaperSilentTooLong =
        wallpaperSilentSince > 0 &&
        performance.now() - wallpaperSilentSince >= wallpaperSilenceTimeout * 1000;

    const wallpaperAudioPlaying = Boolean(
        wallpaperDataAlive && !wallpaperSilentTooLong
    );

    const audioPlaying =
        deviceAudioPlaying || localMusicPlaying || wallpaperAudioPlaying;

    if (deviceAudioPlaying) {
        systemAudioAnalyser.getByteFrequencyData(systemAudioFrequencyData);
    } else if (localMusicPlaying) {
        audioAnalyser.getByteFrequencyData(audioFrequencyData);
    }

    if (wallpaperAudioPlaying) {
        const wallpaperStatus = 'Wallpaper Engine 频谱驱动中';
        if (musicStatus.textContent !== wallpaperStatus) musicStatus.textContent = wallpaperStatus;
    }

    const spectrumData = deviceAudioPlaying
        ? systemAudioFrequencyData
        : localMusicPlaying
            ? audioFrequencyData
            : wallpaperFrequencyData;

    const analyser = deviceAudioPlaying
        ? systemAudioAnalyser
        : localMusicPlaying
            ? audioAnalyser
            : wallpaperVirtualAnalyser;

    const context = deviceAudioPlaying
        ? systemAudioContext
        : localMusicPlaying
            ? audioContext
            : wallpaperVirtualContext;

    // ========================================================================
    // 统一响度（AGC）：统计本帧整体频谱平均电平，维护滑动响度基准。
    // 每个频带电平都会除以该基准，使三个来源在同一音量下跳动幅度一致。
    // ========================================================================
    let spectrumFrameAverage = 0;
    if (spectrumData && spectrumData.length > 0) {
        let spectrumSum = 0;
        for (let index = 0; index < spectrumData.length; index++) {
            spectrumSum += spectrumData[index];
        }
        spectrumFrameAverage = spectrumSum / spectrumData.length / 255;
    }
    spectrumLoudnessReference +=
        (Math.max(spectrumFrameAverage, spectrumAgcFloor) - spectrumLoudnessReference) *
        spectrumAgcSpeed;
    const spectrumAgcGain = spectrumAgcTarget / spectrumLoudnessReference;

    let totalAudioOffset = 0;
    cells.forEach((cell, index) => {
        let verticalOffset = 0;
        if (!cell.motionJumping && jumpSwitch) {
            if (audioPlaying) {
                const radiusRatio = Math.min(1, Math.hypot(cell.x, cell.z) / gridRadius);
                const targetFrequency = audioHighFrequency * Math.pow(audioLowFrequency / audioHighFrequency, radiusRatio);
                const sampleRate = context.sampleRate;
                const fftSize = analyser.fftSize;
                const binWidth = sampleRate / fftSize;
                const centerBin = Math.min(
                    spectrumData.length - 1,
                    Math.max(0, Math.round(targetFrequency / binWidth))
                );
                const bandRadius = Math.max(2, Math.round(centerBin * audioBandWidthRatio));
                const firstBin = Math.max(0, centerBin - bandRadius);
                const lastBin = Math.min(spectrumData.length - 1, centerBin + bandRadius);

                let bandTotal = 0;
                let bandPeak = 0;
                for (let bin = firstBin; bin <= lastBin; bin++) {
                    bandTotal += spectrumData[bin];
                    bandPeak = Math.max(bandPeak, spectrumData[bin]);
                }
                const bandMean = bandTotal / (lastBin - firstBin + 1) / 255;
                const bandLevel = bandMean * 0.85 + (bandPeak / 255) * 0.15;
                const agcNormalizedLevel = bandLevel * spectrumAgcGain;
                const normalizedLevel = Math.min(1, Math.max(0,
                    (agcNormalizedLevel - audioNoiseFloor) / (audioLevelCeiling - audioNoiseFloor)
                ));
                const highFrequencyWeight = Math.pow(1 - radiusRatio, 1.4);
                const frequencyGain = audioLowFrequencyGain +
                    (audioHighFrequencyGain - audioLowFrequencyGain) * highFrequencyWeight;
                const baseAudioOffset =
                    Math.pow(normalizedLevel, audioLevelExponent) *
                    audioJumpHeightMax *
                    frequencyGain;
                const targetOffset =
                    baseAudioOffset *
                    cell.audioRandomGain;
                const followRate = targetOffset > cell.audioOffset ? 12 : 7;
                const followAmount = 1 - Math.exp(-delta * followRate);
                cell.audioOffset += (targetOffset - cell.audioOffset) * followAmount;
                verticalOffset = cell.audioOffset;
                totalAudioOffset += cell.audioOffset;
            } else if (cell.audioOffset > 0.01) {
                cell.audioOffset *= Math.exp(-delta * 9);
                verticalOffset = cell.audioOffset;
            } else if (cell.motionWait > 0) {
                cell.motionWait = Math.max(0, cell.motionWait - delta);
            } else {
                cell.motionJumping = true;
                cell.motionProgress = 0;
            }
        } else if (audioPlaying && cell.audioOffset > 0.01) {
            cell.audioOffset *= Math.exp(-delta * 2.5);
            verticalOffset = cell.audioOffset;
            totalAudioOffset += cell.audioOffset;
        }
        if (cell.motionJumping) {
            cell.motionProgress += delta / cell.motionDuration;
            if (cell.motionProgress >= 1) {
                cell.motionJumping = false;
                cell.motionWait = cell.motionPause;
                cell.motionDuration = 0.45 + Math.random() * 0.9;
                cell.motionPause = randomBetween(landingCooldownMin, landingCooldownMax);
                cell.motionAmplitude = randomBetween(jumpHeightMin, jumpHeightMax);
            } else {
                verticalOffset = Math.sin(Math.PI * cell.motionProgress) * cell.motionAmplitude;
            }
        }
        dummy.position.set(cell.x, graphiteColumnTop - graphiteColumnLength / 2 + verticalOffset, cell.z);
        dummy.rotation.y = ((cell.seed % 4) * Math.PI) / 2;
        dummy.updateMatrix();
        blocks.setMatrixAt(index, dummy.matrix);

        let edgeCursor = index * edgePairs.length * 6;
        for (const [start, end] of edgePairs) {
            edgePositions[edgeCursor++] = cell.x + start[0];
            edgePositions[edgeCursor++] = graphiteColumnTop - graphiteColumnLength / 2 + verticalOffset + start[1];
            edgePositions[edgeCursor++] = cell.z + start[2];
            edgePositions[edgeCursor++] = cell.x + end[0];
            edgePositions[edgeCursor++] = graphiteColumnTop - graphiteColumnLength / 2 + verticalOffset + end[1];
            edgePositions[edgeCursor++] = cell.z + end[2];
        }

        dummy.position.set(cell.x, pinTopY - pinLength / 2 + verticalOffset, cell.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        pins.setMatrixAt(index, dummy.matrix);
        if (cell === selectedCell) {
            selectionOutline.position.set(cell.x, graphiteColumnTop + verticalOffset + 0.03, cell.z);
        }
        if (cell.specialMarker) {
            cell.specialMarker.position.set(
                cell.x,
                graphiteColumnTop + verticalOffset + specialMarkerHeight / 2,
                cell.z
            );
        }
    });
    if (audioPlaying) {
        const averageOffset = totalAudioOffset / cells.length;
        musicMeterFill.style.width = `${Math.min(100, averageOffset / audioJumpHeightMax * 100)}%`;
    }
    blocks.instanceMatrix.needsUpdate = true;
    pins.instanceMatrix.needsUpdate = true;
    edgePositionAttribute.needsUpdate = true;
    controls.update();
    renderer.render(scene, camera);
});
