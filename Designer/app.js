// --- Global Variables ---
let scene, camera, renderer, controls;
let bedGroup, decorGroup;
let woodTextureMap, woodBumpMap, rattanTextureMap;
let sunLight, hemiLight, fillLight;
let raycaster, mouse;
let selectedDecor = null;
let decorItemsList = [];

// Timber Preset Configurations (Multi-tone color palettes for authentic wood look)
const WOOD_SPECIES = {
  teak: { baseColor: '#a8612c', darkGrain: '#592e0f', lightGrain: '#c98448', highlight: '#e3a164', metallic: 0.02 },
  walnut: { baseColor: '#42281a', darkGrain: '#1f1008', lightGrain: '#5c3927', highlight: '#734934', metallic: 0.01 },
  oak: { baseColor: '#c7a26b', darkGrain: '#7a5a30', lightGrain: '#dbb681', highlight: '#ebd09e', metallic: 0.03 },
  rosewood: { baseColor: '#5c221e', darkGrain: '#290b09', lightGrain: '#823731', highlight: '#a14840', metallic: 0.02 }
};

// Presets
const PRESETS = {
  king: { width: 78, length: 84 },
  queen: { width: 60, length: 80 },
  full: { width: 54, length: 75 }
};

// UI Element Refs
const inputs = {
  width: document.getElementById('width'),
  length: document.getElementById('length'),
  legHeight: document.getElementById('legHeight'),
  hbHeight: document.getElementById('hbHeight'),
  rattanWidth: document.getElementById('rattanWidth'),
  hasFullBack: document.getElementById('hasFullBack'),
  backPanelThickness: document.getElementById('backPanelThickness'),
  hasCenterDrawers: document.getElementById('hasCenterDrawers'),
  hasMattress: document.getElementById('hasMattress'),
  woodFinish: document.getElementById('woodFinish'),
  roughness: document.getElementById('roughness'),
  bumpScale: document.getElementById('bumpScale'),
  lightPreset: document.getElementById('lightPreset'),
  sunAngle: document.getElementById('sunAngle'),
  presetSelect: document.getElementById('preset-select'),
  decorType: document.getElementById('decor-type'),
  addDecorBtn: document.getElementById('add-decor-btn')
};

// --- Procedural High-Resolution Wood Texture & Bump Map Generator ---
function generateAuthenticWoodTextures(speciesKey) {
  const species = WOOD_SPECIES[speciesKey] || WOOD_SPECIES.teak;
  
  // Color Map Canvas
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 1024;
  colorCanvas.height = 1024;
  const ctx = colorCanvas.getContext('2d');

  // Bump/Normal Map Canvas
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 1024;
  bumpCanvas.height = 1024;
  const bCtx = bumpCanvas.getContext('2d');

  // Base Fill
  ctx.fillStyle = species.baseColor;
  ctx.fillRect(0, 0, 1024, 1024);

  bCtx.fillStyle = '#808080'; // Neutral Bump Base
  bCtx.fillRect(0, 0, 1024, 1024);

  // Organic Annual Tree Rings & Wood Grain Strands
  const numRings = 120;
  for (let i = 0; i < numRings; i++) {
    const y = (i / numRings) * 1024;
    const waveFreq = 0.008 + Math.random() * 0.004;
    const waveAmp = 25 + Math.random() * 35;

    ctx.beginPath();
    bCtx.beginPath();

    ctx.moveTo(0, y);
    bCtx.moveTo(0, y);

    for (let x = 0; x <= 1024; x += 8) {
      const dy = Math.sin(x * waveFreq) * waveAmp + (Math.sin(x * 0.03) * 6);
      ctx.lineTo(x, y + dy);
      bCtx.lineTo(x, y + dy);
    }

    // Color Grain Variation
    const isDark = Math.random() > 0.4;
    ctx.strokeStyle = isDark ? species.darkGrain : species.lightGrain;
    ctx.globalAlpha = 0.15 + Math.random() * 0.25;
    ctx.lineWidth = 1.5 + Math.random() * 4;
    ctx.stroke();

    // Bump Map Depth
    bCtx.strokeStyle = isDark ? '#ffffff' : '#000000';
    bCtx.globalAlpha = 0.2 + Math.random() * 0.3;
    bCtx.lineWidth = 1.2 + Math.random() * 3;
    bCtx.stroke();
  }

  // Fine Micro Timber Fibers
  ctx.globalAlpha = 0.08;
  bCtx.globalAlpha = 0.15;
  for (let j = 0; j < 800; j++) {
    const rx = Math.random() * 1024;
    const ry = Math.random() * 1024;
    const rLen = 40 + Math.random() * 120;

    ctx.fillStyle = species.highlight;
    ctx.fillRect(rx, ry, rLen, 1);

    bCtx.fillStyle = '#ffffff';
    bCtx.fillRect(rx, ry, rLen, 1);
  }

  // Create Three.js Textures
  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.wrapS = THREE.RepeatWrapping;
  colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.repeat.set(2, 2);

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(2, 2);

  return { colorTex, bumpTex };
}

// Procedural Natural Rattan Webbing Texture
function createRattanTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#d9a76a';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#8c592b';
  ctx.lineWidth = 4;

  for (let i = 0; i <= 256; i += 16) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
  }

  ctx.strokeStyle = '#f2c891';
  ctx.lineWidth = 2;
  for (let i = 8; i <= 256; i += 16) {
    ctx.beginPath(); ctx.arc(i, i, 3, 0, Math.PI * 2); ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

// --- Initialization ---
function init() {
  const container = document.getElementById('canvas-holder');

  // 1. Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121316);

  // 2. Camera
  camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 1, 2000);
  camera.position.set(115, 80, 130);

  // 3. Renderer with Photorealistic Tone Mapping & Shadows
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // 4. Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 + 0.02;

  // 5. Advanced Natural Lighting Setup
  setupLighting();

  // Floor with Soft Contact Shadows
  const floorGeo = new THREE.PlaneGeometry(500, 500);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.85, metalness: 0.1 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Setup Raycaster
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Groups
  bedGroup = new THREE.Group();
  decorGroup = new THREE.Group();
  scene.add(bedGroup);
  scene.add(decorGroup);

  rattanTextureMap = createRattanTexture();

  attachEventListeners();
  updateWoodMaterials();
  buildBed();
  animate();
}

// --- Lighting Presets & Atmosphere ---
function setupLighting() {
  // Hemisphere Sky / Floor Light
  hemiLight = new THREE.HemisphereLight(0xffefe0, 0x222225, 0.6);
  scene.add(hemiLight);

  // Main Sun Directional Light (Casts soft realistic shadows)
  sunLight = new THREE.DirectionalLight(0xfff5ea, 1.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 400;
  sunLight.shadow.camera.left = -100;
  sunLight.shadow.camera.right = 100;
  sunLight.shadow.camera.top = 100;
  sunLight.shadow.camera.bottom = -100;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  // Subtle Warm Bounce / Fill Light
  fillLight = new THREE.PointLight(0xffd8b1, 0.4, 300);
  fillLight.position.set(-80, 50, -80);
  scene.add(fillLight);

  updateLightingPreset();
}

function updateLightingPreset() {
  const preset = inputs.lightPreset.value;
  const angleDeg = parseFloat(inputs.sunAngle.value);
  const rad = (angleDeg * Math.PI) / 180;

  // Position Sun around scene
  sunLight.position.set(Math.cos(rad) * 150, 160, Math.sin(rad) * 150);

  if (preset === 'warmSun') {
    scene.background = new THREE.Color(0x121316);
    sunLight.color.setHex(0xfff2e0);
    sunLight.intensity = 1.4;
    hemiLight.color.setHex(0xffefe0);
    hemiLight.groundColor.setHex(0x222225);
  } else if (preset === 'softStudio') {
    scene.background = new THREE.Color(0x181a1e);
    sunLight.color.setHex(0xffffff);
    sunLight.intensity = 1.1;
    hemiLight.color.setHex(0xe0e8ff);
    hemiLight.groundColor.setHex(0x1c1c20);
  } else if (preset === 'cozyEvening') {
    scene.background = new THREE.Color(0x0a0a0c);
    sunLight.color.setHex(0xffaa55);
    sunLight.intensity = 0.9;
    hemiLight.color.setHex(0xffcc88);
    hemiLight.groundColor.setHex(0x110c08);
  }
}

// --- Wood Materials Generator ---
function updateWoodMaterials() {
  const species = inputs.woodFinish.value;
  const { colorTex, bumpTex } = generateAuthenticWoodTextures(species);
  woodTextureMap = colorTex;
  woodBumpMap = bumpTex;
}

function getPBRWoodMaterial() {
  const roughnessVal = parseFloat(inputs.roughness.value);
  const bumpVal = parseFloat(inputs.bumpScale.value);
  const species = WOOD_SPECIES[inputs.woodFinish.value] || WOOD_SPECIES.teak;

  return new THREE.MeshStandardMaterial({
    map: woodTextureMap,
    bumpMap: woodBumpMap,
    bumpScale: bumpVal,
    roughness: roughnessVal,
    metalness: species.metallic,
    envMapIntensity: 1.0
  });
}

// --- Build Bed Model ---
function buildBed() {
  while (bedGroup.children.length > 0) {
    const obj = bedGroup.children.pop();
    if (obj.geometry) obj.geometry.dispose();
  }

  const W = parseFloat(inputs.width.value);
  const L = parseFloat(inputs.length.value);
  const legH = parseFloat(inputs.legHeight.value);
  const hbH = parseFloat(inputs.hbHeight.value);
  const rattanW = parseFloat(inputs.rattanWidth.value);
  const hasBack = inputs.hasFullBack.checked;
  const backThick = parseFloat(inputs.backPanelThickness.value);
  const showDrawers = inputs.hasCenterDrawers.checked;

  const frameThickness = 2.5;

  const woodMat = getPBRWoodMaterial();
  const rattanMat = new THREE.MeshStandardMaterial({
    map: rattanTextureMap,
    roughness: 0.75,
    bumpScale: 0.04
  });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.8 });

  // 1. Tapered Legs
  const legTopSize = 3;
  const legBottomSize = 1.8;
  const legGeo = new THREE.CylinderGeometry(legTopSize/Math.SQRT2, legBottomSize/Math.SQRT2, legH, 4);
  legGeo.rotateY(Math.PI / 4);

  const legPositions = [
    [-W/2 + legTopSize/2, legH/2, -L/2 + legTopSize/2],
    [ W/2 - legTopSize/2, legH/2, -L/2 + legTopSize/2],
    [-W/2 + legTopSize/2, legH/2,  L/2 - legTopSize/2],
    [ W/2 - legTopSize/2, legH/2,  L/2 - legTopSize/2]
  ];

  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(...pos);
    leg.castShadow = true;
    leg.receiveShadow = true;
    bedGroup.add(leg);
  });

  // Rails
  const railH = 8;
  const railY = legH + railH/2 - 2;

  const sideRailGeo = new THREE.BoxGeometry(frameThickness, railH, L);
  const leftRail = new THREE.Mesh(sideRailGeo, woodMat);
  leftRail.position.set(-W/2 + frameThickness/2, railY, 0);
  leftRail.castShadow = true;
  leftRail.receiveShadow = true;
  bedGroup.add(leftRail);

  const rightRail = new THREE.Mesh(sideRailGeo, woodMat);
  rightRail.position.set(W/2 - frameThickness/2, railY, 0);
  rightRail.castShadow = true;
  rightRail.receiveShadow = true;
  bedGroup.add(rightRail);

  const footRail = new THREE.Mesh(new THREE.BoxGeometry(W, railH, frameThickness), woodMat);
  footRail.position.set(0, railY, L/2 - frameThickness/2);
  footRail.castShadow = true;
  footRail.receiveShadow = true;
  bedGroup.add(footRail);

  // 2. Headboard & Backboard
  const hbDepth = 6;
  const hbZ = -L/2 - hbDepth/2 + frameThickness;

  if (hasBack) {
    const fullBackGeo = new THREE.BoxGeometry(W, hbH, backThick);
    const fullBackPanel = new THREE.Mesh(fullBackGeo, woodMat);
    fullBackPanel.position.set(0, hbH/2, hbZ - hbDepth/2 + backThick/2);
    fullBackPanel.castShadow = true;
    fullBackPanel.receiveShadow = true;
    bedGroup.add(fullBackPanel);
  }

  // Headboard Box Surround
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(W, frameThickness, hbDepth), woodMat);
  topBar.position.set(0, hbH - frameThickness/2, hbZ);
  topBar.castShadow = true;
  bedGroup.add(topBar);

  const leftBar = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, hbH, hbDepth), woodMat);
  leftBar.position.set(-W/2 + frameThickness/2, hbH/2, hbZ);
  leftBar.castShadow = true;
  bedGroup.add(leftBar);

  const rightBar = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, hbH, hbDepth), woodMat);
  rightBar.position.set(W/2 - frameThickness/2, hbH/2, hbZ);
  rightBar.castShadow = true;
  bedGroup.add(rightBar);

  // Headboard Storage & Cane Panels
  const cabinetSectionH = 16;
  const cabinetY = hbH - frameThickness - (cabinetSectionH / 2);

  const rattanPanelGeo = new THREE.BoxGeometry(rattanW, cabinetSectionH, 0.4);
  const leftRattan = new THREE.Mesh(rattanPanelGeo, rattanMat);
  leftRattan.position.set(-W/2 + frameThickness + rattanW/2, cabinetY, hbZ + hbDepth/2 - 0.5);
  leftRattan.castShadow = true;
  bedGroup.add(leftRattan);

  const rightRattan = new THREE.Mesh(rattanPanelGeo, rattanMat);
  rightRattan.position.set(W/2 - frameThickness - rattanW/2, cabinetY, hbZ + hbDepth/2 - 0.5);
  rightRattan.castShadow = true;
  bedGroup.add(rightRattan);

  // Center Cubby & Drawers
  const centerW = W - (2 * frameThickness) - (2 * rattanW);
  if (centerW > 10) {
    const centerShelf = new THREE.Mesh(new THREE.BoxGeometry(centerW, frameThickness, hbDepth - backThick), woodMat);
    centerShelf.position.set(0, cabinetY - 2, hbZ + backThick/2);
    centerShelf.castShadow = true;
    centerShelf.receiveShadow = true;
    bedGroup.add(centerShelf);

    if (showDrawers) {
      const drawerW = (centerW / 2) - 0.5;
      const drawerH = 6;
      const drawerGeo = new THREE.BoxGeometry(drawerW, drawerH, hbDepth - backThick - 0.5);

      const drawer1 = new THREE.Mesh(drawerGeo, woodMat);
      drawer1.position.set(-drawerW/2 - 0.2, cabinetY + 2, hbZ + backThick/2);
      drawer1.castShadow = true;
      bedGroup.add(drawer1);

      const drawer2 = new THREE.Mesh(drawerGeo, woodMat);
      drawer2.position.set(drawerW/2 + 0.2, cabinetY + 2, hbZ + backThick/2);
      drawer2.castShadow = true;
      bedGroup.add(drawer2);

      const pullGeo = new THREE.BoxGeometry(2.5, 0.6, 0.8);
      const pull1 = new THREE.Mesh(pullGeo, handleMat);
      pull1.position.set(-drawerW/2 - 0.2, cabinetY + 2, hbZ + hbDepth/2);
      bedGroup.add(pull1);

      const pull2 = new THREE.Mesh(pullGeo, handleMat);
      pull2.position.set(drawerW/2 + 0.2, cabinetY + 2, hbZ + hbDepth/2);
      bedGroup.add(pull2);
    }
  }

  // Mattress
  if (inputs.hasMattress.checked) {
    const matThick = 10;
    const slatY = legH + 2;
    const mattressGeo = new THREE.BoxGeometry(W - (frameThickness*2) - 0.5, matThick, L - (frameThickness*2) - 0.5);
    const mattressMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.95 });
    const mattress = new THREE.Mesh(mattressGeo, mattressMat);
    mattress.position.set(0, slatY + 0.375 + (matThick/2), 0);
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    bedGroup.add(mattress);
  }
}

// --- Decor Generator ---
function createDecorMesh(type) {
  const decor = new THREE.Group();
  decor.userData = { type: type, id: Date.now() };

  if (type === 'lamp') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 1, 16), new THREE.MeshStandardMaterial({ color: 0xc5a059, roughness: 0.2, metalness: 0.8 }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 16), new THREE.MeshStandardMaterial({ color: 0xc5a059, roughness: 0.2, metalness: 0.8 }));
    pole.position.y = 3.5;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(2, 3.5, 4, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: 0.9, side: THREE.DoubleSide }));
    shade.position.y = 7;
    decor.add(base, pole, shade);
  } else if (type === 'book') {
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 5), new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 }));
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.8, 4.8), new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.6 }));
    b2.position.y = 0.8; b2.rotation.y = 0.2;
    decor.add(b1, b2);
  } else if (type === 'clock') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.8), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
    screen.position.set(0, 0, 0.76);
    decor.add(body, screen);
  } else if (type === 'plant') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1, 2.5, 16), new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.3 }));
    const plant = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 }));
    plant.position.y = 2.5;
    decor.add(pot, plant);
  } else if (type === 'pillow') {
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.95 }));
    decor.add(pillow);
  }

  // Enable Shadows for Decor
  decor.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  const L = parseFloat(inputs.length.value);
  const hbH = parseFloat(inputs.hbHeight.value);
  decor.position.set((Math.random() - 0.5) * 20, hbH - 8, -L/2 - 1);
  return decor;
}

// --- Event Handlers & Drag Interaction ---
function attachEventListeners() {
  const updateValues = () => {
    document.getElementById('val-width').innerText = `${inputs.width.value} in`;
    document.getElementById('val-length').innerText = `${inputs.length.value} in`;
    document.getElementById('val-legHeight').innerText = `${inputs.legHeight.value} in`;
    document.getElementById('val-hbHeight').innerText = `${inputs.hbHeight.value} in`;
    document.getElementById('val-rattanWidth').innerText = `${inputs.rattanWidth.value} in`;
    document.getElementById('val-backPanelThickness').innerText = `${inputs.backPanelThickness.value} in`;
    document.getElementById('val-roughness').innerText = `${inputs.roughness.value}`;
    document.getElementById('val-bumpScale').innerText = `${inputs.bumpScale.value}`;
    document.getElementById('val-sunAngle').innerText = `${inputs.sunAngle.value}°`;
  };

  const onDimensionChange = () => {
    updateValues();
    buildBed();
  };

  ['width', 'length', 'legHeight', 'hbHeight', 'rattanWidth', 'backPanelThickness', 'roughness', 'bumpScale'].forEach(id => {
    inputs[id].addEventListener('input', onDimensionChange);
  });

  ['hasFullBack', 'hasCenterDrawers', 'hasMattress'].forEach(id => {
    inputs[id].addEventListener('change', buildBed);
  });

  inputs.woodFinish.addEventListener('change', () => {
    updateWoodMaterials();
    buildBed();
  });

  inputs.lightPreset.addEventListener('change', updateLightingPreset);
  inputs.sunAngle.addEventListener('input', () => {
    updateValues();
    updateLightingPreset();
  });

  // Add Decor
  inputs.addDecorBtn.addEventListener('click', () => {
    const type = inputs.decorType.value;
    const mesh = createDecorMesh(type);
    decorGroup.add(mesh);
    decorItemsList.push(mesh);
    renderDecorUI();
  });

  // Canvas Interactivity (Raycast Item Drag)
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / canvas.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / canvas.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(decorGroup.children, true);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && obj.parent !== decorGroup) obj = obj.parent;
      selectedDecor = obj;
      controls.enabled = false;
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (selectedDecor) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / canvas.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / canvas.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(bedGroup.children, true);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        selectedDecor.position.set(point.x, point.y + 1, point.z);
      }
    }
  });

  canvas.addEventListener('pointerup', () => {
    selectedDecor = null;
    controls.enabled = true;
  });

  window.addEventListener('resize', onWindowResize);
  document.getElementById('export-btn').addEventListener('click', exportSTL);
}

function renderDecorUI() {
  const ul = document.getElementById('items-ul');
  ul.innerHTML = '';
  decorItemsList.forEach((item, index) => {
    const li = document.createElement('li');
    li.innerText = `#${index+1} ${item.userData.type.toUpperCase()}`;
    const delBtn = document.createElement('button');
    delBtn.innerText = 'Remove';
    delBtn.onclick = () => {
      decorGroup.remove(item);
      decorItemsList.splice(index, 1);
      renderDecorUI();
    };
    li.appendChild(delBtn);
    ul.appendChild(li);
  });
}

function onWindowResize() {
  const container = document.getElementById('canvas-holder');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// --- Render Loop ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Export STL
function exportSTL() {
  const exportGroup = new THREE.Group();
  exportGroup.add(bedGroup.clone());
  exportGroup.add(decorGroup.clone());

  const exporter = new THREE.STLExporter();
  const result = exporter.parse(exportGroup, { binary: true });
  const blob = new Blob([result], { type: 'application/octet-stream' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Natural_Teak_Bed_${inputs.width.value}in.stl`;
  link.click();
}

window.onload = init;