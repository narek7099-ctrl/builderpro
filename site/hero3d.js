/* The hero object: frosted glass slabs on a tiled floor that re-arrange as
   the page scrolls. Four keyframed states, blended by scroll progress:
     0  stacked layers under one blue tile        (hero)
     1  the blue tile alone, hovering             (Lisa answers)
     2  every tile floating as a loose panel      (inspections booked)
     3  the tiles packed into a cube              (the whole system)
   Driven from site.js through window.bpHero3d.setProgress(p). */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const GROUND = 0xeef1f6;
const BLUE = 0x2b63e6;

function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function lerp(a, b, t) { return a + (b - a) * t; }

export function mount(canvas) {
  if (!canvas || canvas._bpHero) return null;
  canvas._bpHero = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(GROUND, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GROUND);
  scene.fog = new THREE.Fog(GROUND, 14, 30);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const camBase = new THREE.Vector3(7.5, 6.2, 7.5);
  camera.position.copy(camBase);
  camera.lookAt(0, 0.6, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xdfe6f2, 1.1); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 9, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 0.8); rim.position.set(-6, 4, -4); scene.add(rim);

  /* floor: a field of soft white tiles with thin gaps, like a lit studio */
  const N = 11, STEP = 2.0;
  const tileGeo = new THREE.BoxGeometry(1.9, 0.16, 1.9);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xf7f9fc, roughness: 0.55, metalness: 0.0 });
  const floor = new THREE.InstancedMesh(tileGeo, tileMat, N * N);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i - (N - 1) / 2) * STEP, z = (j - (N - 1) / 2) * STEP;
    const lift = ((i * 7 + j * 13) % 5) * 0.012;
    m4.makeTranslation(x, -0.2 + lift, z);
    floor.setMatrixAt(k++, m4);
  }
  scene.add(floor);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xe6eaf1, roughness: 1 }));
  under.rotation.x = -Math.PI / 2; under.position.y = -0.3; scene.add(under);

  /* the slabs */
  const slabGeo = new THREE.BoxGeometry(2.2, 0.16, 2.2, 1, 1, 1);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 0.92, roughness: 0.32, thickness: 0.7, ior: 1.42,
    clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 1.2, attenuationColor: new THREE.Color(0xdfe8ff), attenuationDistance: 2.5,
  });
  const blueMat = new THREE.MeshPhysicalMaterial({
    color: BLUE, transmission: 0.42, roughness: 0.22, thickness: 0.7, ior: 1.45,
    clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.4, emissive: 0x0b2c8a, emissiveIntensity: 0.18,
  });
  const chipGeo = new THREE.BoxGeometry(0.9, 0.08, 0.5);
  const chipMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.4 });

  const COUNT = 7;
  const slabs = [];
  for (let i = 0; i < COUNT; i++) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(slabGeo, i === 0 ? blueMat : glassMat);
    g.add(mesh);
    if (i === 0) { const chip = new THREE.Mesh(chipGeo, chipMat); chip.position.y = 0.12; g.add(chip); }
    scene.add(g);
    slabs.push(g);
  }

  /* keyframes: [x, y, z, rotX, rotY, rotZ, scaleY] per slab per state */
  const S = [
    /* 0: hero stack */ [
      [0, 1.35, 0, 0, 0, 0, 1],
      [0, 0.72, 0, 0, 0, 0, 1], [0, 0.5, 0, 0, 0, 0, 1], [0, 0.28, 0, 0, 0, 0, 1],
      [2.1, 0.02, -1.9, 0, 0, 0, 1], [-2.2, 0.02, 1.8, 0, 0, 0, 1], [1.9, 0.02, 2.3, 0, 0, 0, 1],
    ],
    /* 1: one blue tile hovering, the rest sunk into the floor */ [
      [0, 1.05, 0, 0.12, 0.35, -0.08, 1],
      [-2.1, 0.02, -2.0, 0, 0, 0, 1], [2.0, 0.02, -2.2, 0, 0, 0, 1], [0.1, 0.02, 2.1, 0, 0, 0, 1],
      [2.2, 0.02, 0.1, 0, 0, 0, 1], [-2.3, 0.02, 0.2, 0, 0, 0, 1], [-0.1, 0.02, -2.2, 0, 0, 0, 1],
    ],
    /* 2: exploded panels */ [
      [0.4, 1.6, 0.2, 1.25, 0.6, 0.2, 1],
      [-1.6, 2.4, -0.6, 1.5, 0.2, 0.1, 1], [1.8, 2.1, -1.2, 1.4, -0.5, 0.3, 1], [-0.4, 0.9, 1.7, 1.2, 0.9, -0.2, 1],
      [2.1, 0.8, 1.2, 1.6, 0.1, -0.4, 1], [-2.2, 1.4, 0.8, 1.3, -0.7, 0.2, 1], [0.6, 3.0, -0.2, 1.55, 0.4, 0.05, 1],
    ],
    /* 3: packed cube (2 x 2 x 2 minus one corner, the blue tile inside) */ [
      [0.55, 0.55, -0.55, 0, 0, 0, 7],
      [-0.55, 0.55, -0.55, 0, 0, 0, 7], [0.55, 0.55, 0.55, 0, 0, 0, 7], [-0.55, 0.55, 0.55, 0, 0, 0, 7],
      [0.55, 1.65, -0.55, 0, 0, 0, 7], [-0.55, 1.65, -0.55, 0, 0, 0, 7], [-0.55, 1.65, 0.55, 0, 0, 0, 7],
    ],
  ];
  /* the cube state shrinks each slab's footprint so seven of them read as one block */
  const CUBE_XZ = 0.5;

  let target = 0, prog = 0, t0 = performance.now(), tPrev = t0, running = false, mx = 0, my = 0, tmx = 0, tmy = 0;
  const yaw = new THREE.Vector3();

  function apply(p) {
    const seg = Math.min(2.999, Math.max(0, p * 3));
    const a = Math.floor(seg), b = Math.min(3, a + 1), t = ease(seg - a);
    const time = (performance.now() - t0) / 1000;
    for (let i = 0; i < COUNT; i++) {
      const A = S[a][i], B = S[b][i], g = slabs[i];
      const bob = reduce ? 0 : Math.sin(time * 0.9 + i * 1.7) * 0.05 * (1 - Math.abs(p * 3 - 3) < 0.35 ? 0.2 : 1);
      g.position.set(lerp(A[0], B[0], t), lerp(A[1], B[1], t) + bob, lerp(A[2], B[2], t));
      g.rotation.set(lerp(A[3], B[3], t), lerp(A[4], B[4], t) + (reduce ? 0 : time * 0.04), lerp(A[5], B[5], t));
      const sy = lerp(A[6], B[6], t);
      const xzA = a === 3 ? CUBE_XZ : 1, xzB = b === 3 ? CUBE_XZ : 1;
      const xz = lerp(xzA, xzB, t);
      g.scale.set(xz, sy, xz);
    }
    /* slow orbit plus a touch of pointer parallax */
    const orbit = reduce ? 0 : time * 0.05 + p * 0.9;
    yaw.set(Math.cos(orbit) * 10.6, 0, Math.sin(orbit) * 10.6);
    camera.position.set(yaw.x + mx * 0.6, camBase.y + my * 0.4 - p * 0.8, yaw.z);
    camera.lookAt(0, 0.5 + p * 0.5, 0);
  }

  function size() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.fov = w < h ? 40 : 30; camera.updateProjectionMatrix();
  }

  function frame() {
    if (!running) return;
    /* time-based easing so a slow frame rate still lands on the right state */
    const now = performance.now(), dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now;
    const k = 1 - Math.exp(-dt * 7), km = 1 - Math.exp(-dt * 4);
    prog += (target - prog) * k;
    mx += (tmx - mx) * km; my += (tmy - my) * km;
    apply(prog);
    renderer.render(scene, camera);
    if (!reduce) requestAnimationFrame(frame);
  }

  function start() { if (running) return; running = true; size(); requestAnimationFrame(frame); }
  function stop() { running = false; }

  const io = new IntersectionObserver((es) => { es[0].isIntersecting ? start() : stop(); }, { threshold: 0 });
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
