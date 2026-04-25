"use client";

import React, { useRef, useMemo, Suspense, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Html, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom, Noise } from "@react-three/postprocessing";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const CONCEPTS = [
  { id: 0, label: "PMI", dir: [1, 0.2, 0.5], color: "#8fe9ff" },
  { id: 1, label: "IA", dir: [-0.6, 0.8, 0.4], color: "#d5b36a" },
  { id: 2, label: "ENGINEER", dir: [0.4, 0.7, -0.6], color: "#8ea0d8" },
  { id: 3, label: "FLEET", dir: [-0.8, -0.4, 0.5], color: "#95d1b3" },
  { id: 4, label: "MANAGEMENT", dir: [0.7, -0.6, -0.4], color: "#b29bcb" },
  { id: 5, label: "REAL ESTATE", dir: [-0.4, -0.8, -0.5], color: "#c2c2c2" },
  { id: 6, label: "SPORTS", dir: [0.3, 0.1, -0.9], color: "#c98f8f" },
  { id: 7, label: "VAN", dir: [0.1, -0.9, 0.8], color: "#d9c6a2" },
];

type Phase = "settle" | "probing" | "selecting" | "transfer";

function seeded(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

function seededRange(seed: number, min: number, max: number) {
  return min + (max - min) * seeded(seed);
}

function getProbeCandidates(targetIndex: number, fromIndex: number) {
  const target = new THREE.Vector3(...CONCEPTS[targetIndex].dir).normalize();
  const alternatives = CONCEPTS
    .map((c, i) => ({
      i,
      score: i === targetIndex || i === fromIndex ? -999 : new THREE.Vector3(...c.dir).normalize().dot(target),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((x) => x.i);
  return [targetIndex, ...alternatives];
}

function SemanticFilament({ start, end, color, active, seed, kind, onHeadUpdate }: any) {
  const pointsRef = useRef<THREE.Points>(null);
  const { geometry, curve } = useMemo(() => {
    const randomness = kind === "probe" ? 0.18 : 0.3;
    const lift = kind === "probe" ? 0.06 : 0.12;
    const midA = new THREE.Vector3().lerpVectors(start, end, 0.33).add(new THREE.Vector3(seededRange(seed + 1, -randomness, randomness), seededRange(seed + 2, -randomness, randomness) + lift, seededRange(seed + 3, -randomness, randomness)));
    const midB = new THREE.Vector3().lerpVectors(start, end, 0.66).add(new THREE.Vector3(seededRange(seed + 4, -randomness, randomness), seededRange(seed + 5, -randomness, randomness) + lift * 0.6, seededRange(seed + 6, -randomness, randomness)));
    const c = new THREE.CatmullRomCurve3([start.clone(), midA, midB, end.clone()]);
    const pts = c.getPoints(kind === "probe" ? 120 : 220);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const offsets = new Float32Array(pts.length);
    const randoms = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      offsets[i] = i / (pts.length - 1);
      randoms[i] = seeded(seed * 31 + i * 0.73);
    }
    geo.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));
    geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
    return { geometry: geo, curve: c };
  }, [start, end, seed, kind]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const material = pointsRef.current.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value = state.clock.getElapsedTime();
    material.uniforms.uEnergy.value = THREE.MathUtils.lerp(material.uniforms.uEnergy.value, active ? 1 : 0, active ? 0.12 : 0.06);
    if (kind === "probe") {
      const head = (state.clock.getElapsedTime() * 0.38 + seed * 0.173) % 1;
      material.uniforms.uProgress.value = head;
      if (onHeadUpdate && material.uniforms.uEnergy.value > 0.03) onHeadUpdate(curve.getPointAt(head), material.uniforms.uEnergy.value * 0.55);
    } else {
      const nextProgress = THREE.MathUtils.lerp(material.uniforms.uProgress.value, active ? 1 : 0, active ? 0.065 : 0.035);
      material.uniforms.uProgress.value = nextProgress;
      if (onHeadUpdate && material.uniforms.uEnergy.value > 0.03) onHeadUpdate(curve.getPointAt(Math.min(nextProgress, 0.999)), material.uniforms.uEnergy.value);
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry} renderOrder={kind === "transfer" ? 4 : 3}>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 }, uProgress: { value: 0 }, uEnergy: { value: 0 },
          uColor: { value: new THREE.Color(color) }, uMode: { value: kind === "probe" ? 0 : 1 },
          uThickness: { value: kind === "probe" ? 2.8 : 5.0 }, uSeed: { value: seed },
        }}
        vertexShader={`
          uniform float uTime; uniform float uProgress; uniform float uEnergy; uniform float uMode; uniform float uThickness; uniform float uSeed;
          attribute float aOffset; attribute float aRandom;
          varying float vAlpha;
          void main() {
            vec3 pos = position;
            pos += vec3(sin(uTime * 1.8 + aOffset * 18.0 + uSeed * 7.0), cos(uTime * 1.6 + aOffset * 14.0 + uSeed * 5.0), sin(uTime * 2.0 + aOffset * 12.0 + uSeed * 9.0)) * 0.003 * (0.4 + aRandom * 0.6);
            float head = uProgress;
            float headGlow = 1.0 - smoothstep(0.0, 0.085, abs(aOffset - head));
            float tail = (1.0 - smoothstep(0.0, 0.26, head - aOffset)) * step(aOffset, head);
            float body = headGlow;
            if (uMode > 0.5) body = max(headGlow, tail * 0.75);
            vAlpha = body * uEnergy;
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = (0.85 + vAlpha * uThickness) * (22.0 / -mvPosition.z);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor; varying float vAlpha;
          void main() {
            if (vAlpha < 0.02) discard;
            float d = length(gl_PointCoord - vec2(0.5));
            float soft = 1.0 - smoothstep(0.0, 0.5, d);
            float core = 1.0 - smoothstep(0.0, 0.18, d);
            gl_FragColor = vec4(uColor * (0.65 + core * 0.7), soft * vAlpha * 0.6);
          }
        `}
      />
    </points>
  );
}

function BrainSculpture() {
  const { scene } = useGLTF("/Brain_Model.glb");
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetIndex, setTargetIndex] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [probeTargets, setProbeTargets] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("settle");
  const currentIndexRef = useRef(0);
  const probeHeads = useRef([{ pos: new THREE.Vector3(), active: 0 }, { pos: new THREE.Vector3(), active: 0 }, { pos: new THREE.Vector3(), active: 0 }]);
  const transferHead = useRef({ pos: new THREE.Vector3(), active: 0 });
  const currentFocusPoint = useRef(new THREE.Vector3());
  const currentIntensity = useRef(0);
  const currentColor = useRef(new THREE.Color("#555"));

  const { fusedGeometry, hotspots } = useMemo(() => {
    const geometriesToMerge: any[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh) {
        const clonedGeo = child.geometry.clone();
        child.updateMatrixWorld();
        clonedGeo.applyMatrix4(child.matrixWorld);
        geometriesToMerge.push(clonedGeo);
      }
    });
    let fusedGeo = mergeGeometries(geometriesToMerge);
    fusedGeo.computeBoundingSphere();
    fusedGeo.center();
    const radius = fusedGeo.boundingSphere!.radius;
    fusedGeo.scale(1 / radius, 1 / radius, 1 / radius);
    const count = fusedGeo.attributes.position.count;
    const randoms = new Float32Array(count);
    const radialBias = new Float32Array(count);
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      randoms[i] = Math.random();
      p.fromBufferAttribute(fusedGeo.attributes.position as THREE.BufferAttribute, i);
      radialBias[i] = p.length();
    }
    fusedGeo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
    fusedGeo.setAttribute("aRadialBias", new THREE.BufferAttribute(radialBias, 1));
    const positions = fusedGeo.attributes.position;
    const spots = CONCEPTS.map((concept) => {
      let closestIdx = 0; let maxDot = -Infinity;
      const targetDir = new THREE.Vector3(...concept.dir).normalize();
      const v = new THREE.Vector3();
      for (let i = 0; i < positions.count; i += 10) {
        v.fromBufferAttribute(positions as THREE.BufferAttribute, i);
        const dot = v.normalize().dot(targetDir);
        if (dot > maxDot) { maxDot = dot; closestIdx = i; }
      }
      return { ...concept, pos: new THREE.Vector3().fromBufferAttribute(positions as THREE.BufferAttribute, closestIdx) };
    });
    return { fusedGeometry: fusedGeo, hotspots: spots };
  }, [scene]);

  useEffect(() => {
    if (!hotspots.length) return;
    let timers: any[] = [];
    const runCycle = () => {
      const from = currentIndexRef.current;
      const to = (from + 1) % hotspots.length;
      const candidates = getProbeCandidates(to, from);
      setTargetIndex(to); setSelectedIndex(null); setProbeTargets(candidates); setPhase("probing");
      timers.push(setTimeout(() => { setSelectedIndex(to); setPhase("selecting"); }, 1600));
      timers.push(setTimeout(() => setPhase("transfer"), 2400));
      timers.push(setTimeout(() => { currentIndexRef.current = to; setCurrentIndex(to); setPhase("settle"); }, 4300));
      timers.push(setTimeout(() => runCycle(), 7000));
    };
    timers.push(setTimeout(() => runCycle(), 900));
    return () => timers.forEach(clearTimeout);
  }, [hotspots]);

  useFrame((state) => {
    if (!materialRef.current || !hotspots.length) return;
    const focusIndex = phase === "settle" ? currentIndex : selectedIndex !== null ? selectedIndex : targetIndex;
    const focusSpot = hotspots[focusIndex];
    const desiredIntensity = phase === "probing" ? 0.18 : phase === "selecting" ? 0.45 : phase === "transfer" ? 0.82 : 0.92;
    currentFocusPoint.current.lerp(focusSpot.pos, phase === "transfer" ? 0.06 : 0.035);
    currentIntensity.current = THREE.MathUtils.lerp(currentIntensity.current, desiredIntensity, 0.08);
    currentColor.current.lerp(new THREE.Color(focusSpot.color), 0.04);
    const uniforms = materialRef.current.uniforms;
    uniforms.uTime.value = state.clock.getElapsedTime();
    uniforms.uFocusPoint.value.copy(currentFocusPoint.current);
    uniforms.uFocusIntensity.value = currentIntensity.current;
    uniforms.uColorFocus.value.copy(currentColor.current);
    uniforms.uRayPos.value.copy(transferHead.current.pos);
    uniforms.uRayActive.value = THREE.MathUtils.lerp(uniforms.uRayActive.value, transferHead.current.active, 0.12);
    for (let i = 0; i < 3; i++) {
      (uniforms.uProbePos.value[i] as THREE.Vector3).copy(probeHeads.current[i].pos);
      uniforms.uProbeWeight.value[i] = THREE.MathUtils.lerp(uniforms.uProbeWeight.value[i], probeHeads.current[i].active, 0.12);
      probeHeads.current[i].active *= 0.92;
    }
    transferHead.current.active *= 0.94;
  });

  return (
    <group scale={2.8}>
      <points geometry={fusedGeometry} renderOrder={2}>
        <shaderMaterial
          ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 }, uFocusPoint: { value: new THREE.Vector3() }, uFocusIntensity: { value: 0 },
            uRayPos: { value: new THREE.Vector3() }, uRayActive: { value: 0 },
            uProbePos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
            uProbeWeight: { value: [0, 0, 0] }, uColorBase: { value: new THREE.Color("#1d1e22") },
            uColorProbe: { value: new THREE.Color("#6e7481") }, uColorFocus: { value: new THREE.Color("#888") },
          }}
          vertexShader={`
            uniform float uTime; uniform vec3 uFocusPoint; uniform float uFocusIntensity; uniform vec3 uRayPos; uniform float uRayActive; uniform vec3 uProbePos[3]; uniform float uProbeWeight[3];
            attribute float aRandom; attribute float aRadialBias;
            varying float vProbe; varying float vRay; varying float vFocus;
            void main() {
              vec3 pos = position;
              float edge = smoothstep(0.35, 1.0, aRadialBias);
              pos += vec3(sin(uTime * 0.9 + pos.y * 8.0 + aRandom * 6.2831), cos(uTime * 0.8 + pos.z * 7.0 + aRandom * 7.2831), sin(uTime * 1.0 + pos.x * 9.0 + aRandom * 8.2831)) * 0.0035 * mix(0.35, 1.0, edge);
              pos += normalize(position) * sin(uTime * 0.5 + aRandom * 10.0) * 0.0022;
              float probe = 0.0;
              for (int i = 0; i < 3; i++) { probe += smoothstep(0.34, 0.0, distance(pos, uProbePos[i])) * uProbeWeight[i]; }
              float ray = smoothstep(0.42, 0.0, distance(pos, uRayPos)) * uRayActive * (0.55 + aRandom * 0.45);
              float focus = smoothstep(0.75, 0.0, distance(pos, uFocusPoint)) * uFocusIntensity;
              vProbe = clamp(probe, 0.0, 1.0); vRay = clamp(ray, 0.0, 1.0); vFocus = clamp(focus, 0.0, 1.0);
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              float size = 0.95 + vProbe * 1.5 + vRay * 4.0 + vFocus * 2.4;
              gl_PointSize = size * (21.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            uniform vec3 uColorBase; uniform vec3 uColorProbe; uniform vec3 uColorFocus;
            varying float vProbe; varying float vRay; varying float vFocus;
            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              float soft = 1.0 - smoothstep(0.0, 0.5, d);
              float core = 1.0 - smoothstep(0.0, 0.16, d);
              vec3 color = mix(mix(uColorBase, uColorProbe, vProbe * 0.7), uColorFocus, max(vFocus, vRay));
              gl_FragColor = vec4(color + core * (vRay * 0.45 + vFocus * 0.16), (0.06 + vProbe * 0.12 + vFocus * 0.22 + vRay * 0.56) * soft);
            }
          `}
        />
      </points>
      {hotspots[currentIndex] && probeTargets.slice(0, 3).map((candidateIndex, i) => (
        <SemanticFilament key={`probe-${candidateIndex}-${i}`} kind="probe" seed={candidateIndex * 17 + i * 3} start={hotspots[currentIndex].pos} end={hotspots[candidateIndex].pos} color={hotspots[candidateIndex].color} active={phase === "probing" || (phase === "selecting" && selectedIndex === candidateIndex)} onHeadUpdate={(pos: any, energy: any) => { probeHeads.current[i].pos.copy(pos); probeHeads.current[i].active = energy; }} />
      ))}
      {hotspots[currentIndex] && hotspots[targetIndex] && (
        <SemanticFilament kind="transfer" seed={91 + targetIndex} start={hotspots[currentIndex].pos} end={hotspots[targetIndex].pos} color={hotspots[targetIndex].color} active={phase === "transfer"} onHeadUpdate={(pos: any, energy: any) => { transferHead.current.pos.copy(pos); transferHead.current.active = energy; }} />
      )}
      {hotspots.map((spot, i) => (
        <group key={i} position={spot.pos}>
          <Html distanceFactor={8} position={[0.14, 0, 0]} center>
            <div style={{ color: spot.color, fontSize: "9px", letterSpacing: "5px", textTransform: "uppercase", fontFamily: 'serif', fontStyle: "italic", whiteSpace: "nowrap", opacity: phase === "settle" && i === currentIndex ? 0.88 : (phase === "selecting" || phase === "transfer") && i === selectedIndex ? 0.22 : 0, transform: phase === "settle" && i === currentIndex ? "translate(14px, -50%)" : (phase === "selecting" || phase === "transfer") && i === selectedIndex ? "translate(8px, -50%)" : "translate(0px, -50%)", transition: "all 1.8s ease", textShadow: "0 0 18px rgba(0,0,0,0.75)", pointerEvents: "none" }}>
              {spot.label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

export default function VisualBrain({ activeNodes, isThinking }: { activeNodes: number[], isThinking: boolean }) {
  return (
    <div style={{ width: "100%", height: "100vh", background: "#060708", position: "relative" }}>
      <Canvas 
        camera={{ position: [0, 0, 8.5], fov: 28 }}
        gl={{ antialias: true, stencil: false, alpha: false, depth: true }} // Puente técnico para React 19
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <BrainSculpture />
          <EffectComposer disableNormalPass> {/* ESTO ARREGLA EL ERROR ReactCurrentBatchConfig */}
            <Bloom luminanceThreshold={0.9} mipmapBlur intensity={0.45} radius={0.5} />
            <Noise opacity={0.05} />
          </EffectComposer>
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.05} minDistance={4} maxDistance={15} />
      </Canvas>
    </div>
  );
}
