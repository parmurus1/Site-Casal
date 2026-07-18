// =========================================================
// SCENE3D — o diário como cena 3D de verdade (Three.js)
// -----------------------------------------------------------
// Duas renderizações sincronizadas na MESMA câmera:
//   1) WebGLRenderer  -> grama, sol/sombras, capa, lombada,
//                        contracapa, verso de cada página
//                        (tudo geometria real, com espessura)
//   2) CSS3DRenderer  -> o HTML de conteúdo de cada página
//                        (texto editável, imagens, áudio,
//                        vídeo), posicionado como um plano
//                        colado na frente de cada página 3D
//
// Como um objeto não pode pertencer a duas árvores de cena
// (WebGL e CSS3D) ao mesmo tempo em Three.js, cada CSS3DObject
// vive solto em cssScene e tem sua matriz mundial copiada, a
// cada frame, do pivot WebGL "dono" dela (ver syncCssObjects).
//
// app.js e editor.js continuam responsáveis por LÓGICA
// (auth, dados, DOM de conteúdo); este arquivo é só a
// apresentação espacial — câmera, luz, física de abrir/virar.
// =========================================================
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

// ---------------------------------------------------------
// CONSTANTES DE ESPAÇO
// ---------------------------------------------------------
const PAGE_W = 3.2;             // largura de UMA página (unidades three.js)
const PAGE_H = 2.2;             // altura de uma página
const PAGE_THICKNESS = 0.012;   // espessura de cada folha — dá volume real ao miolo
const COVER_THICKNESS = 0.06;   // espessura da capa/contracapa (mais grossa, como papelão)
const SPINE_W = 0.16;           // largura da lombada
const PX_PER_UNIT = 150;        // 1 unidade three.js = 150px de conteúdo HTML (ver .page3d no CSS)

const OPEN_ANGLE = Math.PI * 0.98;     // ~176°: capa/página quase totalmente virada
const OPEN_THRESHOLD = Math.PI * 0.32; // arrastou o suficiente pra capa abrir? (~58°)
const TURN_THRESHOLD = Math.PI * 0.38; // idem para virar página

const PALETTE = {
  coverBlue: 0x3e5c81,
  coverBlueDark: 0x22354b,
  coverLine: 0xd8bd85,
  paper: 0xeee3cb,
  grassTop: 0x4c8a3c,
  grassBase: 0x2c5522,
};

// ---------------------------------------------------------
// ESTADO INTERNO DO MÓDULO
// ---------------------------------------------------------
let renderer, cssRenderer, scene, cssScene, camera;
let bookGroup, coverPivot, coverMesh;
let spineMesh, backCoverMesh;
let grassMesh, grassUniforms;
let sunLight;
let particleSystem, particleVelocities, particleLife;
let raycaster, pointer;
let clock;

let isBookOpen = false;
let currentSpread = 0;
let spreadPivots = []; // um pivot (THREE.Group) por spread, contém left+right pages

// cada entrada: { cssObject, ownerObject3D } — a cada frame copiamos
// a matriz mundial de ownerObject3D (que vive na árvore WebGL) pro
// cssObject correspondente (que vive solto, direto em cssScene)
const cssBindings = [];

// alvo de câmera (posição "de repouso" pra onde a câmera relaxa suavemente)
// O livro fica DEITADO no plano XZ (como numa mesa), com a face frontal da
// capa voltada para +z. Por isso a câmera precisa de bastante deslocamento em
// Z (pra "ver de frente" a capa) combinado com uma elevação em Y de ~40°
// olhando para baixo — não uma vista quase de cima, que só mostraria o topo.
const CAMERA_DISTANCE_Z = 3.0;
const CAMERA_ELEVATION_DEG = 40;
const CAMERA_HEIGHT = CAMERA_DISTANCE_Z * Math.tan(THREE.MathUtils.degToRad(CAMERA_ELEVATION_DEG));

const cameraRestClosed = new THREE.Vector3(1.35, CAMERA_HEIGHT - 0.4, CAMERA_DISTANCE_Z + 1.6);
const cameraRestOpen = new THREE.Vector3(0, CAMERA_HEIGHT - 0.4, CAMERA_DISTANCE_Z + 1.4);
const cameraLookClosed = new THREE.Vector3(1.35, -0.09, 0);
const cameraLookOpen = new THREE.Vector3(0, -0.09, 0);
let cameraLookTarget = cameraLookClosed.clone();
let cameraPosTarget = cameraRestClosed.clone();
let cameraLookCurrent = cameraLookClosed.clone();

// tremor extra (pulso do "boof"), somado por cima do damping contínuo
let shakeIntensity = 0;
let shakeDecay = 0;

// drag da capa / drag de página (spread ativo)
let coverDrag = null;
let pageDrag = null;

// callbacks pro app.js saber quando algo mudou (índice de página etc.)
const listeners = { spreadChange: [], pagesReady: [] };

// ---------------------------------------------------------
// MATERIAL "cel-shading" (placeholder estilizado) —
// ver lista de texturas reais no comentário no fim do arquivo
// ---------------------------------------------------------
function makeToonGradientMap() {
  const data = new Uint8Array([80, 150, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  return tex;
}
function toonMaterial(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: makeToonGradientMap(), ...extra });
}

// =========================================================
// INIT — chamado uma vez no boot
// =========================================================
function init() {
  const canvas = document.getElementById('webglCanvas');

  clock = new THREE.Clock();

  // ---- renderer WebGL ----
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ---- renderer CSS3D (conteúdo HTML das páginas, mesma câmera) ----
  cssRenderer = new CSS3DRenderer({ element: document.getElementById('css3dContainer') });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2c5522);
  scene.fog = new THREE.Fog(0x2c5522, 9, 22);

  cssScene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.copy(cameraRestClosed);
  camera.lookAt(cameraLookClosed);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2(-10, -10);

  buildLights();
  buildGrass();
  buildBook();
  buildParticleSystem();

  wireResize();
  wirePointer();

  animate();
}

// =========================================================
// LUZES — sol direcional com sombra real + preenchimento suave
// =========================================================
function buildLights() {
  const hemi = new THREE.HemisphereLight(0xfff2c8, 0x274a1f, 0.55);
  scene.add(hemi);

  sunLight = new THREE.DirectionalLight(0xfff2c8, 2.1);
  sunLight.position.set(4.2, 6.5, 3.0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -6;
  sunLight.shadow.camera.right = 6;
  sunLight.shadow.camera.top = 6;
  sunLight.shadow.camera.bottom = -6;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 20;
  sunLight.shadow.bias = -0.0015;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const fill = new THREE.DirectionalLight(0xbfe3ff, 0.25);
  fill.position.set(-3, 3, -2);
  scene.add(fill);
}

// =========================================================
// GRAMA — plano com deslocamento de vértices no shader
// (vento) + variação de cor por "manchas". Placeholder de
// textura: ver lista no fim do arquivo pra grama de verdade.
// =========================================================
function buildGrass() {
  const geo = new THREE.PlaneGeometry(40, 40, 120, 120);
  geo.rotateX(-Math.PI / 2);

  grassUniforms = {
    uTime: { value: 0 },
    uColorTop: { value: new THREE.Color(PALETTE.grassTop) },
    uColorBase: { value: new THREE.Color(PALETTE.grassBase) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms: grassUniforms,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWind;
      void main(){
        vUv = uv;
        vec3 pos = position;
        // ondas de vento — duas frequências somadas pra não parecer mecânico
        float wind = sin(pos.x * 0.6 + uTime * 1.1) * 0.08
                   + sin(pos.z * 0.9 - uTime * 0.7) * 0.05;
        pos.y += wind;
        vWind = wind;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorTop;
      uniform vec3 uColorBase;
      varying vec2 vUv;
      varying float vWind;
      void main(){
        float d = distance(vUv, vec2(0.5));
        vec3 col = mix(uColorTop, uColorBase, smoothstep(0.05, 0.6, d));
        col += vWind * 0.6; // realça a crista das ondas de vento
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  grassMesh = new THREE.Mesh(geo, mat);
  grassMesh.receiveShadow = true;
  grassMesh.position.y = -1.14;
  scene.add(grassMesh);
}

// =========================================================
// LIVRO — grupo com pivots reais (dobradiças físicas)
// =========================================================
function buildBook() {
  bookGroup = new THREE.Group();
  bookGroup.position.set(1.35, 0, 0); // "metade direita" antes de abrir
  scene.add(bookGroup);

  // ---- contracapa (base fixa onde tudo se apoia) ----
  const backGeo = new THREE.BoxGeometry(PAGE_W, COVER_THICKNESS, PAGE_H);
  const backMat = toonMaterial(PALETTE.coverBlue);
  backCoverMesh = new THREE.Mesh(backGeo, backMat);
  backCoverMesh.position.set(0, -0.12, 0);
  backCoverMesh.castShadow = true;
  backCoverMesh.receiveShadow = true;
  bookGroup.add(backCoverMesh);

  // ---- lombada ----
  const spineGeo = new THREE.BoxGeometry(SPINE_W, COVER_THICKNESS + 0.02, PAGE_H + 0.02);
  const spineMat = toonMaterial(PALETTE.coverBlueDark);
  spineMesh = new THREE.Mesh(spineGeo, spineMat);
  spineMesh.position.set(-PAGE_W / 2 - SPINE_W / 2 + 0.02, -0.12, 0);
  spineMesh.castShadow = true;
  bookGroup.add(spineMesh);

  // ---- capa (na dobradiça esquerda, gira em Y) ----
  coverPivot = new THREE.Group();
  coverPivot.position.set(-PAGE_W / 2, -0.09, 0);
  bookGroup.add(coverPivot);

  const coverGeo = new THREE.BoxGeometry(PAGE_W, COVER_THICKNESS, PAGE_H);
  coverGeo.translate(PAGE_W / 2, 0, 0); // pivot na borda esquerda, não no centro
  // O livro fica DEITADO (plano XZ) e a câmera olha de cima em ângulo, então
  // a face que representa "a capa que se vê fechada" é o TOPO (+y) — não a
  // frente em Z, que só apareceria olhando o livro de lado/rasante.
  const coverMat = [
    toonMaterial(PALETTE.coverBlueDark), // +x borda direita (lateral, quase não aparece)
    toonMaterial(PALETTE.coverBlueDark), // -x borda da dobradiça (lateral)
    toonMaterial(PALETTE.coverBlue),     // +y TOPO — a capa vista de cima, fechada
    toonMaterial(PALETTE.paper),         // -y fundo — vira visível quando a capa abre e tomba
    toonMaterial(PALETTE.coverBlueDark), // +z borda frontal (lateral)
    toonMaterial(PALETTE.coverBlueDark), // -z borda traseira / lombada (lateral)
  ];
  coverMesh = new THREE.Mesh(coverGeo, coverMat);
  coverMesh.castShadow = true;
  coverMesh.receiveShadow = true;
  coverPivot.add(coverMesh);

  // moldura + título ficam em CSS3D grudados no TOPO da capa (não na
  // frente), reaproveitando tipografia HTML de verdade em vez de
  // desenhar texto dentro do WebGL.
  const coverLabel = buildCoverLabelElement();
  const coverLabelObj = new CSS3DObject(coverLabel);
  coverLabelObj.element.style.pointerEvents = 'none'; // o construtor de CSS3DObject força 'auto'; sobrescrevemos depois
  coverLabelObj.scale.setScalar(1 / PX_PER_UNIT);
  bindCssObject(coverLabelObj, coverMesh, new THREE.Vector3(PAGE_W / 2, COVER_THICKNESS / 2 + 0.002, 0), new THREE.Euler(-Math.PI / 2, 0, 0));
}

function buildCoverLabelElement() {
  const el = document.createElement('div');
  el.style.width = `${PAGE_W * PX_PER_UNIT}px`;
  el.style.height = `${PAGE_H * PX_PER_UNIT}px`;
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.alignItems = 'flex-end';
  el.style.justifyContent = 'flex-start';
  el.style.padding = '28px 34px';
  el.style.fontFamily = "'Caveat', cursive";
  el.style.color = '#F3E0A8';
  el.style.textShadow = '0 2px 4px rgba(0,0,0,0.4)';
  el.style.textAlign = 'right';
  el.style.pointerEvents = 'none'; // decorativo — cliques passam direto pro raycaster do WebGL
  el.innerHTML = `
    <span style="font-family:'Inter',sans-serif;font-size:13px;letter-spacing:0.25em;text-transform:uppercase;opacity:0.8;">o diário de</span>
    <span id="coverCoupleName" style="font-size:44px;line-height:1.05;font-weight:700;">Nós Dois</span>
  `;
  return el;
}

// -----------------------------------------------------------
// bindCssObject — registra um CSS3DObject "solto" em cssScene,
// mas amarrado (posição/rotação local + parent world matrix)
// a um Object3D dono que vive na árvore WebGL normal.
// -----------------------------------------------------------
function bindCssObject(cssObject, ownerObject3D, localPos, localEuler) {
  cssScene.add(cssObject);
  cssBindings.push({
    cssObject,
    ownerObject3D,
    localPos: localPos.clone(),
    localQuat: new THREE.Quaternion().setFromEuler(localEuler),
  });
  return cssObject;
}

function syncCssObjects() {
  const m = new THREE.Matrix4();
  const ownerPos = new THREE.Vector3();
  const ownerQuat = new THREE.Quaternion();
  const ownerScale = new THREE.Vector3();

  cssBindings.forEach(({ cssObject, ownerObject3D, localPos, localQuat }) => {
    ownerObject3D.updateWorldMatrix(true, false);
    m.copy(ownerObject3D.matrixWorld);
    m.decompose(ownerPos, ownerQuat, ownerScale);

    const worldPos = localPos.clone().applyQuaternion(ownerQuat).add(ownerPos);
    const worldQuat = ownerQuat.clone().multiply(localQuat);

    cssObject.position.copy(worldPos);
    cssObject.quaternion.copy(worldQuat);
  });
}

// =========================================================
// PÁGINAS — construção dinâmica de acordo com quantos
// spreads o Editor precisa renderizar
// =========================================================
function setSpreadCount(count) {
  while (spreadPivots.length > count) {
    const old = spreadPivots.pop();
    bookGroup.remove(old.pivot);
    bookGroup.remove(old.leftMesh);
    cssScene.remove(old.leftCss);
    cssScene.remove(old.rightCss);
  }
  while (spreadPivots.length < count) {
    spreadPivots.push(createSpreadPivot(spreadPivots.length));
  }
  restackSpreads();
}

function createSpreadPivot(index) {
  // pivot fica na "lombada" (borda esquerda do livro), como as demais dobradiças
  const pivot = new THREE.Group();
  pivot.position.set(-PAGE_W / 2, -0.06, 0);
  bookGroup.add(pivot);

  // ---- página direita (a que o usuário pega e vira) ----
  const rightGeo = new THREE.BoxGeometry(PAGE_W, PAGE_THICKNESS, PAGE_H);
  rightGeo.translate(PAGE_W / 2, 0, 0);
  const rightMat = toonMaterial(PALETTE.paper);
  const rightMesh = new THREE.Mesh(rightGeo, rightMat);
  rightMesh.castShadow = true;
  rightMesh.receiveShadow = true;
  rightMesh.userData.turnable = true;
  rightMesh.userData.spreadIndex = index;
  rightMesh.visible = isBookOpen; // livro começa fechado — miolo some sob a capa
  pivot.add(rightMesh);

  const rightCss = new CSS3DObject(document.createElement('div'));
  rightCss.scale.setScalar(1 / PX_PER_UNIT);
  rightCss.visible = isBookOpen;
  bindCssObject(rightCss, rightMesh, new THREE.Vector3(PAGE_W / 2, PAGE_THICKNESS / 2 + 0.002, 0), new THREE.Euler(-Math.PI / 2, 0, 0));

  // ---- página esquerda: fixa na contracapa/miolo, não gira ----
  const leftGeo = new THREE.BoxGeometry(PAGE_W, PAGE_THICKNESS, PAGE_H);
  leftGeo.translate(-PAGE_W / 2, 0, 0);
  const leftMat = toonMaterial(PALETTE.paper);
  const leftMesh = new THREE.Mesh(leftGeo, leftMat);
  leftMesh.castShadow = true;
  leftMesh.receiveShadow = true;
  leftMesh.visible = isBookOpen;
  bookGroup.add(leftMesh);

  const leftCss = new CSS3DObject(document.createElement('div'));
  leftCss.scale.setScalar(1 / PX_PER_UNIT);
  leftCss.visible = isBookOpen;
  bindCssObject(leftCss, leftMesh, new THREE.Vector3(-PAGE_W / 2, PAGE_THICKNESS / 2 + 0.002, 0), new THREE.Euler(-Math.PI / 2, 0, 0));

  return { pivot, rightMesh, rightCss, leftMesh, leftCss, index };
}

// -----------------------------------------------------------
// restackSpreads — recalcula a altura (Y) de cada spread para
// que a página "de cima" fisicamente seja sempre a que o
// usuário deveria conseguir pegar primeiro: as ainda não
// viradas empilham com o currentSpread no topo (mais alta);
// as já viradas empilham por baixo, na ordem inversa.
// Isso evita que uma página "atrás" na pilha roube o raycast
// de clique/drag da página que está logicamente ativa.
// -----------------------------------------------------------
function restackSpreads() {
  const total = spreadPivots.length;

  spreadPivots.forEach((sp, i) => {
    let stackPosition;
    if (i < currentSpread) {
      // já virada: empilha por baixo, mais recente = mais alta dentro desse grupo
      stackPosition = i;
    } else {
      // ainda não virada: empilha por cima, currentSpread = mais alta de todas
      stackPosition = total + (total - i);
    }
    const y = -0.06 + stackPosition * (PAGE_THICKNESS + 0.001);
    sp.pivot.position.y = y;
    sp.leftMesh.position.y = y;
  });
}

// =========================================================
// CONTEÚDO HTML — Editor entrega os elementos construídos,
// aqui só colamos como innerHTML do plano CSS3D certo
// =========================================================
function setSpreadContent(index, side, htmlEl) {
  const sp = spreadPivots[index];
  if (!sp) return;
  const target = side === 'left' ? sp.leftCss : sp.rightCss;
  target.element.innerHTML = '';
  target.element.appendChild(htmlEl);
}

// =========================================================
// PARTÍCULAS — poeira/pétalas reais em Points, com física
// simples (velocidade + gravidade leve + fade)
// =========================================================
const MAX_PARTICLES = 200;
function buildParticleSystem() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const opacities = new Float32Array(MAX_PARTICLES);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));

  const mat = new THREE.PointsMaterial({
    color: 0xfff1c9,
    size: 0.055,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    sizeAttenuation: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aOpacity;\nvarying float vOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOpacity = aOpacity;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOpacity;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vOpacity );');
  };

  particleSystem = new THREE.Points(geo, mat);
  particleSystem.frustumCulled = false;
  scene.add(particleSystem);

  particleVelocities = new Array(MAX_PARTICLES).fill(null).map(() => new THREE.Vector3());
  particleLife = new Float32Array(MAX_PARTICLES); // >0 = viva
}

function burstParticles(originWorld, count = 34) {
  const positions = particleSystem.geometry.attributes.position;
  const opacities = particleSystem.geometry.attributes.aOpacity;
  let spawned = 0;
  for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
    if (particleLife[i] > 0) continue;
    positions.setXYZ(i, originWorld.x, originWorld.y, originWorld.z);
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * 1.6;
    particleVelocities[i].set(
      Math.cos(angle) * speed,
      1.2 + Math.random() * 1.6,
      Math.sin(angle) * speed * 0.6 + 0.4
    );
    particleLife[i] = 0.7 + Math.random() * 0.6;
    opacities.setX(i, 1);
    spawned++;
  }
  positions.needsUpdate = true;
  opacities.needsUpdate = true;
}

function updateParticles(dt) {
  const positions = particleSystem.geometry.attributes.position;
  const opacities = particleSystem.geometry.attributes.aOpacity;
  let anyAlive = false;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (particleLife[i] <= 0) continue;
    anyAlive = true;
    particleLife[i] -= dt;
    const v = particleVelocities[i];
    v.y -= 3.2 * dt; // gravidade leve
    const x = positions.getX(i) + v.x * dt;
    const y = positions.getY(i) + v.y * dt;
    const z = positions.getZ(i) + v.z * dt;
    positions.setXYZ(i, x, y, z);
    opacities.setX(i, Math.max(0, particleLife[i]));
  }
  if (anyAlive) {
    positions.needsUpdate = true;
    opacities.needsUpdate = true;
  }
}

// =========================================================
// CÂMERA — damping suave (lerp) + tremor chill contínuo
// =========================================================
function updateCamera(dt, elapsed) {
  // drift orgânico contínuo (câmera "viva", tipo respirando)
  const driftX = Math.sin(elapsed * 0.35) * 0.02 + Math.sin(elapsed * 0.9) * 0.008;
  const driftY = Math.cos(elapsed * 0.3) * 0.015;

  // pulso de shake (decai com o tempo)
  let shakeX = 0, shakeY = 0;
  if (shakeIntensity > 0.0001) {
    shakeX = (Math.random() * 2 - 1) * shakeIntensity;
    shakeY = (Math.random() * 2 - 1) * shakeIntensity;
    shakeIntensity *= Math.max(0, 1 - shakeDecay * dt);
    if (shakeIntensity < 0.0005) shakeIntensity = 0;
  }

  const targetPos = cameraPosTarget;
  const smoothing = 1 - Math.pow(0.0025, dt); // damping suave independente de framerate

  camera.position.x += (targetPos.x + driftX + shakeX - camera.position.x) * smoothing;
  camera.position.y += (targetPos.y + driftY + shakeY - camera.position.y) * smoothing;
  camera.position.z += (targetPos.z - camera.position.z) * smoothing;

  const lookSmoothing = 1 - Math.pow(0.004, dt);
  cameraLookCurrent.lerp(cameraLookTarget, lookSmoothing);
  camera.lookAt(cameraLookCurrent);
}

function pulseShake(intensity, decay = 3.2) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
  shakeDecay = decay;
}

// =========================================================
// CURSOR — raycast contínuo pra saber o que está sob o mouse
// e trocar o cursor entre default / hand / grab / grabbing
// =========================================================
function updateCursor() {
  if (pageDrag || coverDrag) {
    document.body.classList.remove('hand-cursor', 'grab-cursor');
    document.body.classList.add('grabbing-cursor');
    return;
  }

  raycaster.setFromCamera(pointer, camera);
  // Raycaster testa objetos invisíveis por padrão — filtramos manualmente,
  // ou páginas escondidas (livro fechado) "roubariam" o hit da capa.
  const targets = [coverMesh, ...spreadPivots.map((sp) => sp.rightMesh)].filter((obj) => obj.visible);
  const hits = raycaster.intersectObjects(targets, false);

  document.body.classList.remove('hand-cursor', 'grab-cursor', 'grabbing-cursor');
  if (hits.length > 0) {
    const obj = hits[0].object;
    if (obj === coverMesh && !isBookOpen) {
      document.body.classList.add('grab-cursor');
    } else if (obj.userData.turnable && isBookOpen && obj.userData.spreadIndex === currentSpread) {
      document.body.classList.add('grab-cursor');
    } else {
      document.body.classList.add('hand-cursor');
    }
  }
}

// =========================================================
// PONTEIRO — drag da capa (fechado) e drag de página (aberto)
// =========================================================
function wirePointer() {
  const canvas = renderer.domElement;

  canvas.addEventListener('pointermove', onPointerMoveShared);
  canvas.addEventListener('pointerdown', (e) => {
    raycaster.setFromCamera(pointer, camera);

    if (!isBookOpen) {
      const hits = raycaster.intersectObject(coverMesh, false);
      if (hits.length > 0) {
        startCoverDrag(e.clientX, e.pointerId);
      }
      return;
    }

    const activeSp = spreadPivots[currentSpread];
    if (!activeSp) return;
    const hits = raycaster.intersectObject(activeSp.rightMesh, false);
    if (hits.length > 0) {
      startPageDrag(activeSp, e.clientX, e.pointerId);
    }
  });

  canvas.addEventListener('pointerup', finishPointerShared);
  canvas.addEventListener('pointercancel', finishPointerShared);

  // clique simples (sem arraste) na capa também abre
  canvas.addEventListener('click', () => {
    raycaster.setFromCamera(pointer, camera);
    if (!isBookOpen) {
      const hits = raycaster.intersectObject(coverMesh, false);
      if (hits.length > 0 && Math.abs(coverPivot.rotation.z) < 0.05) openBook();
    }
  });

  // ---------------------------------------------------------
  // O conteúdo HTML da página (.page-content, via CSS3D) cobre a
  // mesma área de tela que o canvas e intercepta pointerdown antes
  // que ele chegue lá — mesmo a .page-turn-zone tendo pointer-events
  // none, ela só "revela" o irmão .page-content por baixo, não o
  // canvas (camadas de composição diferentes). Por isso escutamos em
  // capture-phase no document: se o alvo é uma .page-turn-zone,
  // interceptamos e iniciamos o drag manualmente, sem precisar do
  // pointerdown do canvas.
  // ---------------------------------------------------------
  document.addEventListener('pointerdown', (e) => {
    const zone = findPageTurnZoneAt(e.clientX, e.clientY);
    if (!zone) return;
    if (!isBookOpen) return;
    const activeSp = spreadPivots[currentSpread];
    if (!activeSp) return;

    e.preventDefault();
    e.stopPropagation();
    startPageDrag(activeSp, e.clientX, null);
    // como o drag não começou no canvas, ouvimos move/up no document
    // só enquanto esse drag específico estiver ativo.
    document.addEventListener('pointermove', onPointerMoveShared);
    const cleanupDocListeners = () => {
      finishPointerShared();
      document.removeEventListener('pointermove', onPointerMoveShared);
      document.removeEventListener('pointerup', cleanupDocListeners);
      document.removeEventListener('pointercancel', cleanupDocListeners);
    };
    document.addEventListener('pointerup', cleanupDocListeners);
    document.addEventListener('pointercancel', cleanupDocListeners);
  }, true); // capture-phase: roda antes do listener de clique do Editor
}

// Como .page-turn-zone tem pointer-events:none, e.target nunca é ela
// mesma (o navegador revela o irmão .page-content por baixo) — por
// isso testamos a POSIÇÃO do clique contra os retângulos das zonas
// visíveis na tela, em vez de usar closest()/e.target.
function findPageTurnZoneAt(clientX, clientY) {
  const zones = document.querySelectorAll('.page-turn-zone');
  for (const zone of zones) {
    // ignora zonas de páginas escondidas (offsetParent nulo = display:none em algum ancestral)
    if (!zone.offsetParent && getComputedStyle(zone).position !== 'fixed') continue;
    const rect = zone.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return zone;
    }
  }
  return null;
}

function startCoverDrag(clientX, pointerId) {
  coverDrag = { startX: clientX, startAngle: coverPivot.rotation.z, currentAngle: coverPivot.rotation.z };
  if (pointerId != null) renderer.domElement.setPointerCapture(pointerId);
}

function startPageDrag(activeSp, clientX, pointerId) {
  pageDrag = { sp: activeSp, startX: clientX, startAngle: activeSp.pivot.rotation.z, currentAngle: activeSp.pivot.rotation.z };
  if (pointerId != null) renderer.domElement.setPointerCapture(pointerId);
}

function onPointerMoveShared(e) {
  const canvas = renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  if (coverDrag) {
    const dx = e.clientX - coverDrag.startX;
    // arrastar PRA ESQUERDA (dx negativo) deve AUMENTAR o ângulo de
    // abertura (positivo, ver convenção de rotation.z no topo do
    // arquivo) — por isso invertemos o sinal do delta aqui.
    const deltaAngle = (-dx / window.innerWidth) * Math.PI * 1.6;
    let angle = coverDrag.startAngle + deltaAngle;
    angle = Math.min(OPEN_ANGLE, Math.max(0, angle));
    coverPivot.rotation.z = angle;
    coverDrag.currentAngle = angle;
  } else if (pageDrag) {
    const dx = e.clientX - pageDrag.startX;
    const deltaAngle = (-dx / window.innerWidth) * Math.PI * 1.8;
    let angle = pageDrag.startAngle + deltaAngle;
    angle = Math.min(OPEN_ANGLE, Math.max(0, angle));
    pageDrag.sp.pivot.rotation.z = angle;
    pageDrag.currentAngle = angle;
  }
}

function finishPointerShared() {
  if (coverDrag) {
    const angle = coverDrag.currentAngle;
    if (angle >= OPEN_THRESHOLD) {
      openBook();
    } else {
      animateValue(angle, 0, 320, (v) => { coverPivot.rotation.z = v; });
    }
    coverDrag = null;
  } else if (pageDrag) {
    const { sp, currentAngle } = pageDrag;
    const isLast = currentSpread >= spreadPivots.length - 1;
    if (currentAngle >= TURN_THRESHOLD && !isLast) {
      goToSpread(currentSpread + 1);
    } else {
      animateValue(currentAngle, 0, 320, (v) => { sp.pivot.rotation.z = v; });
    }
    pageDrag = null;
  }
}

// pequena animação ease-out sem depender de libs externas
function animateValue(from, to, duration, onUpdate, onDone) {
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    onUpdate(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(frame);
    else if (onDone) onDone();
  }
  requestAnimationFrame(frame);
}

// =========================================================
// AÇÕES PÚBLICAS — chamadas por app.js
// =========================================================
function setSpreadPagesVisible(visible) {
  spreadPivots.forEach((sp) => {
    sp.rightMesh.visible = visible;
    sp.leftMesh.visible = visible;
    sp.rightCss.visible = visible;
    sp.leftCss.visible = visible;
  });
}

function openBook() {
  if (isBookOpen) return;
  isBookOpen = true;

  animateValue(coverPivot.rotation.z, OPEN_ANGLE, 550, (v) => { coverPivot.rotation.z = v; });
  animateValue(bookGroup.position.x, 0, 900, (v) => { bookGroup.position.x = v; });

  cameraPosTarget = cameraRestOpen.clone();
  cameraLookTarget = cameraLookOpen.clone();

  window.Effects.playBoof();
  const originWorld = new THREE.Vector3();
  bookGroup.getWorldPosition(originWorld);
  originWorld.y += 0.1;
  burstParticles(originWorld, 36);
  pulseShake(0.06, 3.0);

  // páginas do miolo só aparecem depois que a capa levantou o
  // suficiente pra não "vazar" por cima dela enquanto fechada
  setTimeout(() => {
    setSpreadPagesVisible(true);
    goToSpread(0);
    // o CSS3DRenderer só anexa o elemento ao DOM real durante sua
    // própria chamada de render() dentro do loop de animate() — por
    // isso esperamos dois requestAnimationFrame (garante que pelo
    // menos um ciclo completo de render já rodou) antes de avisar
    // que as páginas estão prontas pra receber atualizações de DOM.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      listeners.pagesReady.forEach((cb) => cb());
    }));
  }, 260);
  listeners.spreadChange.forEach((cb) => cb(-1, spreadPivots.length, true));
}

function closeBook() {
  if (!isBookOpen) return;
  isBookOpen = false;

  // fecha todos os spreads virados de volta (mesmo tempo, feels natural)
  spreadPivots.forEach((sp) => {
    animateValue(sp.pivot.rotation.z, 0, 420, (v) => { sp.pivot.rotation.z = v; });
  });
  animateValue(coverPivot.rotation.z, 0, 550, (v) => { coverPivot.rotation.z = v; });
  animateValue(bookGroup.position.x, 1.35, 900, (v) => { bookGroup.position.x = v; });

  cameraPosTarget = cameraRestClosed.clone();
  cameraLookTarget = cameraLookClosed.clone();
  pulseShake(0.035, 3.4);

  currentSpread = 0;
  restackSpreads();
  // esconde o miolo de novo assim que a capa terminar de tombar de volta,
  // pra ela ficar limpa (só a capa visível) como um livro fechado de verdade
  setTimeout(() => setSpreadPagesVisible(false), 560);
  listeners.spreadChange.forEach((cb) => cb(-1, spreadPivots.length, false));
}

function goToSpread(index) {
  if (index < 0 || index >= spreadPivots.length) return;

  // fecha (volta a 0) todos os spreads depois do alvo, mantém os anteriores virados
  spreadPivots.forEach((sp, i) => {
    const target = i < index ? OPEN_ANGLE : 0;
    animateValue(sp.pivot.rotation.z, target, 620, (v) => { sp.pivot.rotation.z = v; });
  });

  currentSpread = index;
  restackSpreads();
  listeners.spreadChange.forEach((cb) => cb(index, spreadPivots.length, isBookOpen));
}

function onSpreadChange(cb) {
  listeners.spreadChange.push(cb);
}

function onPagesReady(cb) {
  listeners.pagesReady.push(cb);
}

function setCoupleLabel(text) {
  const el = document.getElementById('coverCoupleName');
  if (el) el.textContent = text;
}

// =========================================================
// RESIZE
// =========================================================
function wireResize() {
  window.addEventListener('resize', onResize);
  onResize();
}
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  cssRenderer.setSize(w, h);
}

// =========================================================
// LOOP
// =========================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  grassUniforms.uTime.value = elapsed;
  updateParticles(dt);
  updateCamera(dt, elapsed);
  updateCursor();
  syncCssObjects();

  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
}

window.Scene3D = {
  init,
  setSpreadCount,
  setSpreadContent,
  openBook,
  closeBook,
  goToSpread,
  onSpreadChange,
  onPagesReady,
  setCoupleLabel,
  get isBookOpen() { return isBookOpen; },
  get currentSpread() { return currentSpread; },
};

/* =========================================================
   PLACEHOLDER — TEXTURAS/IMAGENS QUE FALTAM PRO VISUAL FINAL
   -----------------------------------------------------------
   Hoje tudo usa MeshToonMaterial com cor chapada + gradiente
   de 3 tons (o "cel-shading" que você pediu). Pra ficar com
   cara de jogo Unity de verdade, os arquivos abaixo entram
   como `map` (cor) e opcionalmente `normalMap` (relevo) nos
   materiais correspondentes:

   1. cover-fabric-diffuse.jpg   — textura de tecido/couro da
      capa (o quadriculado azul que você já tinha desenhado
      funciona bem aqui). ~1024x1024, tileável.
   2. cover-fabric-normal.jpg    — normal map do mesmo tecido,
      pra dar relevo real sob a luz do sol (costura, textura).
   3. paper-diffuse.jpg          — textura de papel amarelado
      pras páginas (levemente amassado/manchado).
   4. paper-normal.jpg           — relevo sutil do papel.
   5. grass-diffuse.jpg (tileável) + grass-normal.jpg — pra
      trocar o shader de cor chapada por grama de verdade;
      dá pra usar como `map`/`normalMap` no ShaderMaterial
      atual sem mudar a lógica de vento.
   6. Opcional: um HDRI de céu (.hdr, ex. "outdoor_field_sunny")
      pra usar como scene.environment — melhora MUITO o
      realismo da luz sem precisar mexer em nada de código,
      só carregar com RGBELoader e setar scene.environment.

   Nenhum desses é obrigatório pro site funcionar — são só a
   diferença entre "placeholder estilizado" e "arte final".
========================================================= */
