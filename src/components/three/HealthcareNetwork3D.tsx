// ============================================================================
// AarogyaLink — healthcare network background (Three.js)
// ----------------------------------------------------------------------------
// A deliberately understated background for the role-selection page: the care
// pathway drawn as floating nodes joined by thin glowing lines.
//
//   Patient → Health Worker → Primary Health Centre → Hospital
//           → Doctor → Treatment → Follow-up
//
// plus the two coordinating nodes (District Network and the AarogyaLink hub).
//
// Design rules this file follows, because it sits behind selectable cards:
//   • it is a BACKGROUND — aria-hidden, pointer-events-none, stacked under the
//     content, with a soft light veil above it so text contrast never depends
//     on the scene;
//   • the card grid area stays clean apart from one faint, far-away hub;
//   • answering a selection is the only "event": that node brightens and lifts
//     while everything else stays calm;
//   • core three only — no post-processing, no external assets (the soft glow
//     is a radial gradient drawn into a canvas at runtime), no add-ons;
//   • the loop pauses when the tab is hidden or the canvas is off-screen;
//   • prefers-reduced-motion paints a single static frame per selection;
//   • WebGL unavailable → renders nothing (the page must not depend on it).
// ============================================================================

import { useEffect, useRef } from 'react';
import {
  AdditiveBlending, AmbientLight, BufferAttribute, BufferGeometry, CanvasTexture, Clock,
  DirectionalLight, FogExp2, Line, LineBasicMaterial, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, Points, PointsMaterial, Scene,
  Sprite, SpriteMaterial, SphereGeometry, Vector3, WebGLRenderer,
} from 'three';
import {
  COORDINATING_NODES, NETWORK_NODES, PATHWAY_NODES,
  type NetworkNodeKey,
} from '@/lib/role-network';

/**
 * Node placement in world units. The pathway arcs across the upper band and
 * falls away to the right, keeping the card area clear; `district` and `hub`
 * sit further back for depth.
 */
const NODE_POSITIONS: Record<NetworkNodeKey, [number, number, number]> = (() => {
  const positions = {} as Record<NetworkNodeKey, [number, number, number]>;
  const step = PATHWAY_NODES.length - 1;
  PATHWAY_NODES.forEach((key, i) => {
    const t = i / step;
    positions[key] = [
      -5.4 + t * 10.8,
      1.25 * Math.sin(t * Math.PI * 1.25) - 0.5 * t + 0.35,
      -0.6 + 0.5 * Math.sin(t * Math.PI * 2),
    ];
  });
  positions.district = [-2.9, 2.45, -1.9];
  // The hub is the AarogyaLink network itself: centred but far back and dim,
  // so it reads as depth rather than competing with the cards.
  positions.hub = [0, 0.2, -4.2];
  return positions;
})();

const RING_RADIUS = 0.17;
const HUB_RADIUS = 0.24;

/**
 * Resting appearance of each node: a gentle gradient along the care pathway,
 * from deep clinical teal at the patient end to open sky at follow-up, so the
 * chain reads as one continuous journey instead of nine identical dots.
 * The coordinating nodes stay distinct — blue for the district layer, brand
 * teal for the AarogyaLink hub.
 */
const PATHWAY_COLORS = [
  0x0d9488, 0x0fa396, 0x14b8a6, 0x06b6d4, 0x0ea5e9, 0x38bdf8, 0x7dd3fc,
];

function restColor(key: NetworkNodeKey): number {
  if (key === 'hub') return 0x0f766e;
  if (key === 'district') return 0x2563eb;
  const index = PATHWAY_NODES.indexOf(key);
  return PATHWAY_COLORS[index] ?? 0x0d9488;
}

/** Brightened appearance when a node answers the current selection. */
const ACTIVE_COLOR = 0x22d3ee;

/**
 * A soft radial falloff drawn into a canvas at runtime — nothing is fetched,
 * and it gives every node a bloom without a post-processing pass.
 */
function createGlowTexture(): CanvasTexture | null {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0.98)');
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

export interface HealthcareNetwork3DProps {
  /** Node to highlight, derived from the selected role. */
  activeNode?: NetworkNodeKey | null;
  className?: string;
}

export default function HealthcareNetwork3D({
  activeNode = null,
  className,
}: HealthcareNetwork3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** Drives highlight changes without rebuilding the scene. */
  const applyActiveRef = useRef<((node: NetworkNodeKey | null) => void) | null>(null);

  // ── Scene lifecycle (runs once; never references the activeNode prop) ────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hostEl: HTMLDivElement = host;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isSmallScreen = window.innerWidth < 768;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        alpha: true,
        antialias: !isSmallScreen,
        powerPreference: 'low-power',
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmallScreen ? 1.25 : 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    hostEl.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    const cameraHome = new Vector3(0, 0.15, 8.2);
    camera.position.copy(cameraHome);
    camera.lookAt(0, 0.1, 0);

    scene.add(new AmbientLight(0xffffff, 1.25));
    const keyLight = new DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(2.5, 5, 5);
    scene.add(keyLight);
    const rimLight = new DirectionalLight(0x7dd3fc, 0.45);
    rimLight.position.set(-4, -1.5, -3);
    scene.add(rimLight);

    // Depth: the far end of the chain dissolves into the page's own background,
    // so the scene reads as atmosphere behind the cards, never as a diagram.
    scene.fog = new FogExp2(0xf4fafb, 0.05);

    const disposables: { dispose: () => void }[] = [];

    const glowTexture = createGlowTexture();
    if (glowTexture) disposables.push(glowTexture);

    const ringGeometry = new SphereGeometry(RING_RADIUS, isSmallScreen ? 14 : 20, isSmallScreen ? 10 : 14);
    disposables.push(ringGeometry);
    const hubGeometry = new SphereGeometry(HUB_RADIUS, isSmallScreen ? 16 : 24, isSmallScreen ? 12 : 18);
    disposables.push(hubGeometry);
    const haloGeometry = new SphereGeometry(1, 16, 12);
    disposables.push(haloGeometry);

    interface NodeHandle {
      key: NetworkNodeKey;
      // Generics are pinned so `material` keeps its concrete type below.
      mesh: Mesh<SphereGeometry, MeshStandardMaterial>;
      halo: Mesh<SphereGeometry, MeshBasicMaterial>;
      /** Soft aura sprite — the node's bloom. */
      glow: Sprite;
      glowScale: number;
      restColor: number;
      haloScale: number;
      base: Vector3;
      phase: number;
      /** 0 = resting, 1 = fully active; eased toward `activeTarget`. */
      active: number;
      activeTarget: number;
    }

    const nodes: NodeHandle[] = [];

    NETWORK_NODES.forEach((node, index) => {
      const isHub = node.key === 'hub';
      const base = new Vector3(...NODE_POSITIONS[node.key]);
      const color = restColor(node.key);

      const material = new MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: isHub ? 0.15 : 0.25,
        transparent: true,
        opacity: isHub ? 0.55 : 0.9,
      });
      disposables.push(material);

      const mesh = new Mesh(isHub ? hubGeometry : ringGeometry, material);
      mesh.position.copy(base);
      scene.add(mesh);

      const haloScale = isHub ? 3.2 : 2.6;
      const haloMaterial = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isHub ? 0.05 : 0.09,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      disposables.push(haloMaterial);
      const halo = new Mesh(haloGeometry, haloMaterial);
      halo.position.copy(base);
      halo.scale.setScalar((isHub ? HUB_RADIUS : RING_RADIUS) * haloScale);
      scene.add(halo);

      // A soft aura reading as bloom without a post-processing pass. Normal
      // blending (not additive) keeps it coloured instead of washing this
      // light page toward white.
      const glowMaterial = new SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity: isHub ? 0.3 : 0.44,
        depthWrite: false,
      });
      disposables.push(glowMaterial);
      const glow = new Sprite(glowMaterial);
      glow.position.copy(base);
      const glowScale = (isHub ? HUB_RADIUS : RING_RADIUS) * (isHub ? 7 : 6);
      glow.scale.setScalar(glowScale);
      scene.add(glow);

      nodes.push({
        key: node.key,
        mesh,
        halo,
        glow,
        glowScale,
        restColor: color,
        haloScale,
        base,
        phase: index * 0.7,
        active: 0,
        activeTarget: 0,
      });
    });

    // ── Connection lines ───────────────────────────────────────────────────
    const pathwayGeometry = new BufferGeometry().setFromPoints(
      PATHWAY_NODES.map(key => new Vector3(...NODE_POSITIONS[key])),
    );
    disposables.push(pathwayGeometry);
    const pathwayMaterial = new LineBasicMaterial({
      color: 0x2dd4bf,
      transparent: true,
      opacity: 0.32,
      blending: AdditiveBlending,
    });
    disposables.push(pathwayMaterial);
    scene.add(new Line(pathwayGeometry, pathwayMaterial));

    // The coordinating nodes link back to the pathway, but faintly.
    for (const key of COORDINATING_NODES) {
      const anchor: NetworkNodeKey = key === 'district' ? 'facility' : 'doctor';
      const geometry = new BufferGeometry().setFromPoints([
        new Vector3(...NODE_POSITIONS[key]),
        new Vector3(...NODE_POSITIONS[anchor]),
      ]);
      disposables.push(geometry);
      const material = new LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.14,
        blending: AdditiveBlending,
      });
      disposables.push(material);
      scene.add(new Line(geometry, material));
    }

    // ── The hub: concentric rings radiating from the AarogyaLink node ─────
    const hubRingLines: Line[] = [];
    const ringSpecs = [
      { radius: 0.8, opacity: 0.17 },
      { radius: 1.3, opacity: 0.11 },
      { radius: 1.9, opacity: 0.06 },
    ];
    for (const { radius, opacity } of ringSpecs) {
      const ringPoints: Vector3[] = [];
      const ringSegments = 64;
      for (let i = 0; i <= ringSegments; i += 1) {
        const angle = (i / ringSegments) * Math.PI * 2;
        // Squashed flat so it reads as a network footprint on the ground.
        ringPoints.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.42, 0));
      }
      const ringGeometry = new BufferGeometry().setFromPoints(ringPoints);
      disposables.push(ringGeometry);
      const ringMaterial = new LineBasicMaterial({
        color: 0x14b8a6,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
      });
      disposables.push(ringMaterial);
      const ring = new Line(ringGeometry, ringMaterial);
      ring.position.set(...NODE_POSITIONS.hub);
      scene.add(ring);
      hubRingLines.push(ring);
    }

    // ── Travelling pulses: care moving around the loop ───────────────────
    const pathwayPoints = PATHWAY_NODES.map(key => new Vector3(...NODE_POSITIONS[key]));
    const pathwaySegments: { from: Vector3; to: Vector3; length: number; start: number }[] = [];
    let pathwayLength = 0;
    for (let i = 0; i < pathwayPoints.length - 1; i += 1) {
      const from = pathwayPoints[i];
      const to = pathwayPoints[i + 1];
      const length = from.distanceTo(to);
      pathwaySegments.push({ from, to, length, start: pathwayLength });
      pathwayLength += length;
    }

    /** Position along the pathway polyline for a given arc-length distance. */
    function positionAlongPath(distance: number, out: Vector3) {
      const d = ((distance % pathwayLength) + pathwayLength) % pathwayLength;
      let segment = pathwaySegments[pathwaySegments.length - 1];
      for (const candidate of pathwaySegments) {
        if (d >= candidate.start && d <= candidate.start + candidate.length) {
          segment = candidate;
          break;
        }
      }
      const t = segment.length > 0 ? (d - segment.start) / segment.length : 0;
      out.copy(segment.from).lerp(segment.to, t);
    }

    const pulseCount = isSmallScreen ? 2 : 5;
    const pulseGeometry = new SphereGeometry(0.045, 8, 6);
    disposables.push(pulseGeometry);
    const pulses: { mesh: Mesh; offset: number }[] = [];
    for (let i = 0; i < pulseCount; i += 1) {
      const material = new MeshBasicMaterial({
        color: 0xa5f3fc,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      disposables.push(material);
      const mesh = new Mesh(pulseGeometry, material);
      // Staggered along the chain so several read as one continuous flow.
      mesh.position.copy(pathwayPoints[0]);
      scene.add(mesh);
      pulses.push({ mesh, offset: (i / pulseCount) * pathwayLength });
    }
    const pulseScratch = new Vector3();

    // ── Particles ──────────────────────────────────────────────────────────
    const particleCount = isSmallScreen ? 40 : 110;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 15;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1.5;
    }
    const particleGeometry = new BufferGeometry();
    particleGeometry.setAttribute('position', new BufferAttribute(particlePositions, 3));
    disposables.push(particleGeometry);
    const particleMaterial = new PointsMaterial({
      color: 0x14b8a6,
      size: 0.03,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    disposables.push(particleMaterial);
    const particleField = new Points(particleGeometry, particleMaterial);
    scene.add(particleField);

    // A closer, brighter layer of slow motes for parallax depth.
    const moteCount = isSmallScreen ? 8 : 22;
    const motePositions = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i += 1) {
      motePositions[i * 3] = (Math.random() - 0.5) * 14;
      motePositions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      motePositions[i * 3 + 2] = Math.random() * 3 + 0.5;
    }
    const moteGeometry = new BufferGeometry();
    moteGeometry.setAttribute('position', new BufferAttribute(motePositions, 3));
    disposables.push(moteGeometry);
    const moteMaterial = new PointsMaterial({
      color: 0x67e8f9,
      size: 0.075,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    disposables.push(moteMaterial);
    const moteField = new Points(moteGeometry, moteMaterial);
    scene.add(moteField);

    // ── Sizing ─────────────────────────────────────────────────────────────
    function resize() {
      const width = hostEl.clientWidth;
      const height = hostEl.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostEl);

    // ── Render ─────────────────────────────────────────────────────────────
    const clock = new Clock();
    let frame = 0;
    let running = true;
    let onScreen = true;
    /** Subtle pointer parallax; disabled for reduced motion and touch. */
    const pointer = { x: 0, y: 0 };

    function paint() {
      renderer.render(scene, camera);
    }

    function step() {
      const t = reduceMotion ? 0 : clock.getElapsedTime();

      for (const node of nodes) {
        // Ease the highlight so a click reads as a soft transition.
        node.active += (node.activeTarget - node.active) * 0.12;

        const bob = reduceMotion ? 0 : Math.sin(t * 0.55 + node.phase) * 0.05;
        node.mesh.position.set(node.base.x, node.base.y + bob, node.base.z);
        node.halo.position.set(node.base.x, node.base.y + bob, node.base.z);

        const highlighted = node.active > 0.02;
        node.mesh.scale.setScalar(1 + node.active * 0.45);
        node.mesh.material.color.setHex(highlighted ? ACTIVE_COLOR : node.restColor);
        node.mesh.material.emissive.setHex(highlighted ? ACTIVE_COLOR : node.restColor);
        node.mesh.material.emissiveIntensity = (node.key === 'hub' ? 0.15 : 0.25) + node.active * 0.9;

        const baseRadius = node.key === 'hub' ? HUB_RADIUS : RING_RADIUS;
        node.halo.scale.setScalar(baseRadius * node.haloScale * (1 + node.active * 0.35));
        node.halo.material.opacity = (node.key === 'hub' ? 0.05 : 0.09) + node.active * 0.3;
        node.halo.material.color.setHex(highlighted ? ACTIVE_COLOR : node.restColor);

        // The aura follows the node and answers the selection.
        node.glow.position.set(node.base.x, node.base.y + bob, node.base.z);
        node.glow.scale.setScalar(node.glowScale * (1 + node.active * 0.5));
        node.glow.material.opacity = (node.key === 'hub' ? 0.3 : 0.44) + node.active * 0.3;
        node.glow.material.color.setHex(highlighted ? ACTIVE_COLOR : node.restColor);
      }

      // Pulses travel the pathway — the care loop in motion. Under reduced
      // motion they are placed once at their offsets and stay still.
      for (const pulse of pulses) {
        positionAlongPath(reduceMotion ? pulse.offset : pulse.offset + t * 0.62, pulseScratch);
        pulse.mesh.position.copy(pulseScratch);
      }

      if (!reduceMotion) {
        // A pulse's brightness breathes as it travels.
        for (const pulse of pulses) {
          const pulseMaterial = pulse.mesh.material as MeshBasicMaterial;
          pulseMaterial.opacity = 0.5 + Math.sin(t * 2.4 + pulse.offset) * 0.2;
        }

        // The hub rings turn outward, very slowly.
        hubRingLines[0].rotation.z = t * 0.05;
        hubRingLines[1].rotation.z = -t * 0.035;
        hubRingLines[2].rotation.z = t * 0.022;

        // Drifting dust — the only other continuous motion.
        particleField.rotation.y = t * 0.012;
        moteField.rotation.y = -t * 0.02;

        // Very light drift, plus pointer parallax for depth.
        camera.position.x = cameraHome.x + Math.sin(t * 0.07) * 0.16 + pointer.x * 0.34;
        camera.position.y = cameraHome.y + Math.sin(t * 0.1) * 0.08 - pointer.y * 0.22;
        camera.lookAt(0, 0.1, 0);
      }

      paint();
    }

    function loop() {
      if (!running) return;
      if (onScreen && !document.hidden) step();
      frame = requestAnimationFrame(loop);
    }

    /** Set the highlight target. Under reduced motion, apply and repaint once. */
    function applyActive(node: NetworkNodeKey | null) {
      for (const handle of nodes) {
        handle.activeTarget = handle.key === node ? 1 : 0;
        if (reduceMotion) handle.active = handle.activeTarget;
      }
      if (reduceMotion) step();
    }
    applyActiveRef.current = applyActive;

    if (reduceMotion) {
      paint();
    } else {
      frame = requestAnimationFrame(loop);
    }

    const intersectionObserver = new IntersectionObserver(
      entries => {
        onScreen = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.01 },
    );
    intersectionObserver.observe(hostEl);

    const onVisibility = () => {
      if (!document.hidden && !reduceMotion) {
        clock.getDelta();
        step();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!reduceMotion) window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      applyActiveRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      scene.clear();
      for (const item of disposables) item.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === hostEl) hostEl.removeChild(renderer.domElement);
    };
  }, []);

  // ── Selection changed → update the running scene (no rebuild) ────────────
  // Declared after the scene effect so it also runs on mount, applying the
  // initial highlight before the browser paints.
  useEffect(() => {
    applyActiveRef.current?.(activeNode);
  }, [activeNode]);

  return (
    <div
      ref={hostRef}
      className={className}
      aria-hidden="true"
      data-testid="healthcare-network-3d"
    />
  );
}
