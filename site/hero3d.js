/* The hero object: glass slabs on a tiled floor that re-arrange as the page
   scrolls. Four keyframed states, blended by scroll progress:
     0  stacked layers under one blue tile        (hero)
     1  the blue tile alone, hovering             (Lisa answers)
     2  the tiles fanned out as a loose stack     (every job, one card)
     3  the tiles packed into a block             (the whole system)
   Driven from site.js through mount(canvas).setProgress(p).

   Rendering notes: no transmission pass (it is the expensive, blurry part),
   rounded box edges so highlights read as edges, a real contact shadow from
   the key light, and time-based easing so a slow frame rate still lands
   on the right state. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const GROUND = 0xeef1f6;

function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function lerp(a, b, t) { return a + (b - a) * t; }

export function mount(canvas) {
  if (!canvas || canvas._bpHero) return null;
  canvas._bpHero = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer:coarse)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(GROUND, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GROUND);
  scene.fog = new THREE.Fog(GROUND, 15, 32);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const camBase = new THREE.Vector3(7.5, 6.0, 7.5);
  camera.position.copy(camBase);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9e0ec, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(4.5, 9, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 0.55); rim.position.set(-6, 4, -4); scene.add(rim);

  /* floor: soft white tiles with thin gaps, receiving the shadow */
  const N = 11, STEP = 2.0;
  const tileGeo = new RoundedBoxGeometry(1.9, 0.16, 1.9, 2, 0.04);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.62, metalness: 0 });
  const floor = new THREE.InstancedMesh(tileGeo, tileMat, N * N);
  floor.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i - (N - 1) / 2) * STEP, z = (j - (N - 1) / 2) * STEP;
    const lift = ((i * 7 + j * 13) % 5) * 0.012;
    m4.makeTranslation(x, -0.2 + lift, z);
    floor.setMatrixAt(k++, m4);
  }
  scene.add(floor);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xe3e8f0, roughness: 1 }));
  under.rotation.x = -Math.PI / 2; under.position.y = -0.3; under.receiveShadow = true; scene.add(under);

  /* the slabs: frosted white glass and one deep blue */
  const slabGeo = new RoundedBoxGeometry(2.2, 0.18, 2.2, 3, 0.05);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xf3f6fb, roughness: 0.2, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9, sheen: 0.4, sheenColor: new THREE.Color(0xdfe8ff),
  });
  const blueMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a4fd8, roughness: 0.2, metalness: 0.05,
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1, emissive: 0x0a2a86, emissiveIntensity: 0.3,
  });
  const chipGeo = new RoundedBoxGeometry(0.9, 0.08, 0.5, 2, 0.03);
  const chipMat = new THREE.MeshStandardMaterial({ color: 0xf3f5f9, roughness: 0.35 });

  const COUNT = 7;
  const slabs = [];
  for (let i = 0; i < COUNT; i++) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(slabGeo, i === 0 ? blueMat : glassMat);
    mesh.castShadow = true; mesh.receiveShadow = i !== 0;
    g.add(mesh);
    if (i === 0) { const chip = new THREE.Mesh(chipGeo, chipMat); chip.position.y = 0.13; chip.castShadow = true; g.add(chip); }
    scene.add(g);
    slabs.push(g);
  }

  /* keyframes: [x, y, z, rotX, rotY, rotZ, scaleY] per slab per state */
  const S = [
    /* 0: hero stack */ [
      [0, 1.35, 0, 0, 0, 0, 1],
      [0, 0.74, 0, 0, 0, 0, 1], [0, 0.5, 0, 0, 0, 0, 1], [0, 0.26, 0, 0, 0, 0, 1],
      [2.1, 0.02, -1.9, 0, 0, 0, 1], [-2.2, 0.02, 1.8, 0, 0, 0, 1], [1.9, 0.02, 2.3, 0, 0, 0, 1],
    ],
    /* 1: one blue tile hovering, the rest settled into the floor */ [
      [0, 1.05, 0, 0.1, 0.3, -0.06, 1],
      [-2.1, 0.02, -2.0, 0, 0, 0, 1], [2.0, 0.02, -2.2, 0, 0, 0, 1], [0.1, 0.02, 2.1, 0, 0, 0, 1],
      [2.2, 0.02, 0.1, 0, 0, 0, 1], [-2.3, 0.02, 0.2, 0, 0, 0, 1], [-0.1, 0.02, -2.2, 0, 0, 0, 1],
    ],
    /* 2: fanned stack, each card lifted and turned a little */ [
      [0.0, 2.35, 0.0, 0.0, 0.55, 0.0, 1],
      [-0.9, 1.85, 0.5, 0.0, 0.35, 0.0, 1], [0.8, 1.45, -0.5, 0.0, 0.15, 0.0, 1], [-0.5, 1.05, -0.9, 0.0, -0.05, 0.0, 1],
      [0.9, 0.65, 0.9, 0.0, -0.25, 0.0, 1], [-1.0, 0.3, -0.1, 0.0, -0.45, 0.0, 1], [1.1, 0.02, 0.2, 0.0, -0.6, 0.0, 1],
    ],
    /* 3: packed block (2 x 2 x 2 minus one corner), the blue tile on the visible top corner */ [
      [0.62, 1.86, 0.62, 0, 0, 0, 6.2],
      [-0.62, 0.62, -0.62, 0, 0, 0, 6.2], [0.62, 0.62, 0.62, 0, 0, 0, 6.2], [-0.62, 0.62, 0.62, 0, 0, 0, 6.2],
      [0.62, 1.86, -0.62, 0, 0, 0, 6.2], [-0.62, 1.86, -0.62, 0, 0, 0, 6.2], [0.62, 0.62, -0.62, 0, 0, 0, 6.2],
    ],
  ];
  const CUBE_XZ = 0.5;

  let target = 0, prog = 0, t0 = performance.now(), tPrev = t0, running = false, mx = 0, my = 0, tmx = 0, tmy = 0;
  const yaw = new THREE.Vector3();

  function apply(p) {
    const seg = Math.min(2.999, Math.max(0, p * 3));
    const a = Math.floor(seg), b = Math.min(3, a + 1), t = ease(seg - a);
    const time = (performance.now() - t0) / 1000;
    const packed = Math.max(0, seg - 2);              /* 0..1 while forming the block */
    const bobAmp = reduce ? 0 : 0.04 * (1 - packed);   /* the block holds still */
    for (let i = 0; i < COUNT; i++) {
      const A = S[a][i], B = S[b][i], g = slabs[i];
      const bob = Math.sin(time * 0.8 + i * 1.7) * bobAmp;
      g.position.set(lerp(A[0], B[0], t), lerp(A[1], B[1], t) + bob, lerp(A[2], B[2], t));
      g.rotation.set(lerp(A[3], B[3], t), lerp(A[4], B[4], t) + (reduce ? 0 : time * 0.03 * (1 - packed)), lerp(A[5], B[5], t));
      const xzA = a === 3 ? CUBE_XZ : 1, xzB = b === 3 ? CUBE_XZ : 1;
      g.scale.set(lerp(xzA, xzB, t), lerp(A[6], B[6], t), lerp(xzA, xzB, t));
    }
    const orbit = (reduce ? 0 : time * 0.04) + p * 0.8;
    yaw.set(Math.cos(orbit) * 10.6, 0, Math.sin(orbit) * 10.6);
    camera.position.set(yaw.x + mx * 0.5, camBase.y + my * 0.35 - p * 0.6, yaw.z);
    camera.lookAt(0, 0.6 + p * 0.5, 0);
  }

  function size() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 40 : 30;
    camera.updateProjectionMatrix();
  }

  function frame() {
    if (!running) return;
    const now = performance.now(), dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now;
    const k = 1 - Math.exp(-dt * 6), km = 1 - Math.exp(-dt * 4);
    prog += (target - prog) * k;
    mx += (tmx - mx) * km; my += (tmy - my) * km;
    apply(prog);
    renderer.render(scene, camera);
    if (!reduce) requestAnimationFrame(frame);
  }

  function start() { if (running) return; running = true; tPrev = performance.now(); size(); requestAnimationFrame(frame); }
  function stop() { running = false; }

  const io = new IntersectionObserver((es) => { es.some((e) => e.isIntersecting) ? start() : stop(); }, { threshold: 0 });
  io.observe(canvas);
  addEventListener('resize', () => { size(); if (reduce) { apply(prog); renderer.render(scene, camera); } }, { passive: true });
  if (matchMedia('(pointer:fine)').matches && !reduce) {
    addEventListener('pointermove', (e) => { tmx = (e.clientX / innerWidth - 0.5) * 2; tmy = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
  }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });

  size();
  apply(0);
  renderer.render(scene, camera);
  start();

  return {
    setProgress(p) {
      target = Math.max(0, Math.min(1, p));
      if (reduce) { prog = target; apply(prog); renderer.render(scene, camera); }
    },
  };
}
