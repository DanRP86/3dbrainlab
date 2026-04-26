"use client";

import React, {
  useRef,
  useMemo,
  useEffect,
  useState,
  Suspense,
  useCallback,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
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
] as const;

type Phase = "idle" | "probing" | "selecting" | "transfer" | "settle";

type VisualBrainProps = {
  activeNodes?: number[];
  isThinking?: boolean;
};

function seeded(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

function seededRange(seed: number, min: number, max: number) {
  return min + (max - min) * seeded(seed);
}

function clampNode(n: unknown) {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < CONCEPTS.length
    ? n
    : null;
}

function getProbeCandidates(targetIndex: number, fromIndex: number) {
  const target = new THREE.Vector3(...CONCEPTS[targetIndex].dir).normalize();

  const alternatives = CONCEPTS.map((c, i) => ({
    i,
    score:
      i === targetIndex || i === fromIndex
        ? -999
        : new THREE.Vector3(...c.dir).normalize().dot(target),
  }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((x) => x.i);

  return [targetIndex, ...alternatives];
}

function AmbientNoiseField({
  thinking,
  life = 1,
}: {
  thinking: boolean;
  life?: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const count = isMobile ? 2200 : 3800;

    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 3.0 + Math.random() * 3.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * r * 1.2;
      positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.8;
      positions[i * 3 + 2] = Math.cos(phi) * r * 1.55 - 2.5;

      randoms[i] = Math.random();
      scales[i] = 0.7 + Math.random() * 1.8;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    return geo;
  }, []);

  const ambientUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uThinking: { value: 0 },
      uLife: { value: 1 },
      uColorA: { value: new THREE.Color("#0f1722") },
      uColorB: { value: new THREE.Color("#38556f") },
    }),
    []
  );

  useFrame((state) => {
    if (!pointsRef.current) return;

    console.log("tick ambient", state.clock.getElapsedTime());

    const mat = pointsRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = state.clock.getElapsedTime();
    mat.uniforms.uThinking.value = THREE.MathUtils.lerp(
      mat.uniforms.uThinking.value,
      thinking ? 1 : 0,
      0.05
    );
    mat.uniforms.uLife.value = life;
  });

  return (
    <points ref={pointsRef} geometry={geometry} renderOrder={0} frustumCulled={false}>
      <shaderMaterial
        transparent
        depthWrite={false}
        depthTest={true}
        blending={THREE.AdditiveBlending}
        uniforms={ambientUniforms}
        vertexShader={`
          uniform float uTime;
          uniform float uThinking;
          uniform float uLife;
          attribute float aRandom;
          attribute float aScale;
          varying float vAlpha;
          varying float vMix;

          void main() {
            vec3 pos = position;

            float driftX = sin(uTime * 0.10 + aRandom * 10.0) * 0.12;
            float driftY = cos(uTime * 0.12 + aRandom * 14.0) * 0.10;
            float driftZ = sin(uTime * 0.08 + aRandom * 8.0) * 0.12;

            float fine = sin(uTime * 0.45 + aRandom * 22.0) * 0.03;
            pos.x += driftX + fine;
            pos.y += driftY + fine * 0.7;
            pos.z += driftZ;

            float pulse = 0.5 + 0.5 * sin(uTime * 0.8 + aRandom * 18.0);
            vMix = pulse;
            vAlpha = (0.12 + pulse * 0.10 + uThinking * 0.07) * (0.65 + aRandom * 0.35) * uLife;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = (2.2 + aScale * 2.4 + uThinking * 0.9) * (18.0 / -mvPosition.z);
          }
        `}
        fragmentShader={`
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          varying float vAlpha;
          varying float vMix;

          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;

            float soft = 1.0 - smoothstep(0.0, 0.5, d);
            float core = 1.0 - smoothstep(0.0, 0.16, d);

            vec3 color = mix(uColorA, uColorB, vMix);
            color += core * 0.05;

            gl_FragColor = vec4(color, vAlpha * soft * 0.72);
          }
        `}
      />
    </points>
  );
}

function SemanticFilament({
  start,
  end,
  color,
  active,
  seed,
  kind,
  onHeadUpdate,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: string;
  active: boolean;
  seed: number;
  kind: "probe" | "transfer";
  onHeadUpdate?: (pos: THREE.Vector3, energy: number) => void;
}) {
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, curve } = useMemo(() => {
    const randomness = kind === "probe" ? 0.18 : 0.28;
    const lift = kind === "probe" ? 0.07 : 0.12;

    const midA = new THREE.Vector3()
      .lerpVectors(start, end, 0.33)
      .add(
        new THREE.Vector3(
          seededRange(seed + 1, -randomness, randomness),
          seededRange(seed + 2, -randomness, randomness) + lift,
          seededRange(seed + 3, -randomness, randomness)
        )
      );

    const midB = new THREE.Vector3()
      .lerpVectors(start, end, 0.66)
      .add(
        new THREE.Vector3(
          seededRange(seed + 4, -randomness, randomness),
          seededRange(seed + 5, -randomness, randomness) + lift * 0.65,
          seededRange(seed + 6, -randomness, randomness)
        )
      );

    const curve = new THREE.CatmullRomCurve3([start.clone(), midA, midB, end.clone()]);
    const pts = curve.getPoints(kind === "probe" ? 90 : 160);

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const offsets = new Float32Array(pts.length);
    const randoms = new Float32Array(pts.length);

    for (let i = 0; i < pts.length; i++) {
      offsets[i] = i / (pts.length - 1);
      randoms[i] = seeded(seed * 31 + i * 0.73);
    }

    geo.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));
    geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

    return { geometry: geo, curve };
  }, [start, end, seed, kind]);

  useFrame((state) => {
    if (!pointsRef.current) return;

    const material = pointsRef.current.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value = state.clock.getElapsedTime();
    material.uniforms.uEnergy.value = THREE.MathUtils.lerp(
      material.uniforms.uEnergy.value,
      active ? 1 : 0,
      active ? 0.14 : 0.08
    );

    if (kind === "probe") {
      const head = (state.clock.getElapsedTime() * 0.42 + seed * 0.173) % 1;
      material.uniforms.uProgress.value = head;

      if (onHeadUpdate && material.uniforms.uEnergy.value > 0.02) {
        onHeadUpdate(curve.getPointAt(head), material.uniforms.uEnergy.value * 0.55);
      }
    } else {
      const nextProgress = THREE.MathUtils.lerp(
        material.uniforms.uProgress.value,
        active ? 1 : 0,
        active ? 0.09 : 0.05
      );
      material.uniforms.uProgress.value = nextProgress;

      if (onHeadUpdate && material.uniforms.uEnergy.value > 0.02) {
        onHeadUpdate(
          curve.getPointAt(Math.min(nextProgress, 0.999)),
          material.uniforms.uEnergy.value
        );
      }
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry} renderOrder={kind === "transfer" ? 5 : 4}>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uEnergy: { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uMode: { value: kind === "probe" ? 0 : 1 },
          uThickness: { value: kind === "probe" ? 3.6 : 5.4 },
        }}
        vertexShader={`
          uniform float uTime;
          uniform float uProgress;
          uniform float uEnergy;
          uniform float uMode;
          uniform float uThickness;
          attribute float aOffset;
          attribute float aRandom;
          varying float vAlpha;

          void main() {
            vec3 pos = position;

            pos += vec3(
              sin(uTime * 1.8 + aOffset * 18.0),
              cos(uTime * 1.6 + aOffset * 14.0),
              sin(uTime * 2.0 + aOffset * 12.0)
            ) * 0.003 * (0.4 + aRandom * 0.6);

            float head = uProgress;
            float headGlow = 1.0 - smoothstep(0.0, 0.11, abs(aOffset - head));
            float tail = (1.0 - smoothstep(0.0, 0.34, head - aOffset)) * step(aOffset, head);

            float body = uMode > 0.5 ? max(headGlow, tail * 0.95) : headGlow;
            vAlpha = body * uEnergy;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = (1.0 + vAlpha * uThickness) * (24.0 / -mvPosition.z);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vAlpha;

          void main() {
            if (vAlpha < 0.02) discard;

            float d = length(gl_PointCoord - vec2(0.5));
            float soft = 1.0 - smoothstep(0.0, 0.5, d);
            float core = 1.0 - smoothstep(0.0, 0.16, d);

            vec3 color = uColor * (0.75 + core * 0.7);
            gl_FragColor = vec4(color, soft * vAlpha * 0.9);
          }
        `}
      />
    </points>
  );
}

function BrainSculpture({
  activeNodes = [],
  isThinking = false,
}: VisualBrainProps) {
  const { scene } = useGLTF("/Brain_Model.glb");

  const mainMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const shellMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);
  const [probeTargets, setProbeTargets] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("settle");
  const [ready, setReady] = useState(false);

  const currentIndexRef = useRef(0);
  const transitionTimersRef = useRef<number[]>([]);
  const lastSignatureRef = useRef("");
  const lastNodeUpdateRef = useRef(Date.now());

  const probeHeads = useRef([
    { pos: new THREE.Vector3(), active: 0 },
    { pos: new THREE.Vector3(), active: 0 },
    { pos: new THREE.Vector3(), active: 0 },
  ]);

  const transferHead = useRef({ pos: new THREE.Vector3(), active: 0 });

  const currentFocusPoint = useRef(new THREE.Vector3());
  const currentIntensity = useRef(0.62);
  const currentColor = useRef(new THREE.Color(CONCEPTS[0].color));
  const shellUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPulse: { value: 0.72 },
      uBreath: { value: 0.5 },
      uThinkingBoost: { value: 0 },
      uColor: { value: new THREE.Color(CONCEPTS[0].color) },
    }),
    []
  );
  
  const mainUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBreath: { value: 0.5 },
      uThinkingBoost: { value: 0 },
      uFocusPoint: { value: new THREE.Vector3() },
      uFocusIntensity: { value: 0.62 },
      uRayPos: { value: new THREE.Vector3() },
      uRayActive: { value: 0 },
      uProbePos: {
        value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
      },
      uProbeWeight: { value: [0, 0, 0] },
      uColorBase: { value: new THREE.Color("#1a1d24") },
      uColorProbe: { value: new THREE.Color("#8590a1") },
      uColorFocus: { value: new THREE.Color(CONCEPTS[0].color) },
    }),
    []
  );
  const data = useMemo(() => {
    if (!scene) return null;

    scene.updateWorldMatrix(true, true);

    const geometriesToMerge: THREE.BufferGeometry[] = [];

    scene.traverse((child: any) => {
      if (child?.isMesh && child.geometry) {
        const geo = child.geometry.clone();
        geo.applyMatrix4(child.matrixWorld);
        geometriesToMerge.push(geo);
      }
    });

    if (!geometriesToMerge.length) return null;

    const fusedGeo = mergeGeometries(geometriesToMerge);
    if (!fusedGeo) return null;

    fusedGeo.computeBoundingSphere();
    fusedGeo.center();

    const radius = fusedGeo.boundingSphere?.radius || 1;
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

    const hotspots = CONCEPTS.map((concept) => {
      let closestIdx = 0;
      let maxDot = -Infinity;
      const targetDir = new THREE.Vector3(...concept.dir).normalize();
      const v = new THREE.Vector3();

      for (let i = 0; i < positions.count; i += 10) {
        v.fromBufferAttribute(positions as THREE.BufferAttribute, i);
        const dot = v.normalize().dot(targetDir);
        if (dot > maxDot) {
          maxDot = dot;
          closestIdx = i;
        }
      }

      return {
        ...concept,
        pos: new THREE.Vector3().fromBufferAttribute(
          positions as THREE.BufferAttribute,
          closestIdx
        ),
      };
    });

    return { fusedGeometry: fusedGeo, hotspots };
  }, [scene]);

  const clearTimers = useCallback(() => {
    transitionTimersRef.current.forEach((t) => clearTimeout(t));
    transitionTimersRef.current = [];
  }, []);

  const scheduleTransition = useCallback((fromIndex: number, nextIndex: number, offset = 0) => {
    const candidates = getProbeCandidates(nextIndex, fromIndex);

    const t0 = window.setTimeout(() => {
      setTargetIndex(nextIndex);
      setSelectedIndex(null);
      setProbeTargets(candidates);
      setPhase("probing");
    }, offset);

    const t1 = window.setTimeout(() => {
      setSelectedIndex(nextIndex);
      setPhase("selecting");
    }, offset + 550);

    const t2 = window.setTimeout(() => {
      setPhase("transfer");
    }, offset + 1200);

    const t3 = window.setTimeout(() => {
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      setSelectedIndex(nextIndex);
      setPhase("settle");
    }, offset + 2200);

    transitionTimersRef.current.push(t0, t1, t2, t3);
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    if (!data?.hotspots?.length) return;
    setReady(true);
    currentFocusPoint.current.copy(data.hotspots[currentIndexRef.current].pos);
  }, [data]);

  useEffect(() => {
    if (!data?.hotspots?.length) return;

    const normalized = (activeNodes ?? [])
      .map(clampNode)
      .filter((n): n is number => n !== null);

    const unique = [...new Set(normalized)];
    const signature = JSON.stringify(unique);

    if (!unique.length) return;
    if (signature === lastSignatureRef.current) return;

    lastSignatureRef.current = signature;
    lastNodeUpdateRef.current = Date.now();
    clearTimers();

    let from = currentIndexRef.current;
    unique.forEach((next, i) => {
      scheduleTransition(from, next, i * 2600);
      from = next;
    });
  }, [activeNodes, data, scheduleTransition, clearTimers]);

  useFrame((state) => {
    if (!data?.hotspots?.length || !mainMaterialRef.current) return;

    const t = state.clock.getElapsedTime();
    const idle = Date.now() - lastNodeUpdateRef.current > 2500;

    let focusIndex =
      phase === "settle" || phase === "idle"
        ? currentIndex
        : selectedIndex !== null
        ? selectedIndex
        : targetIndex;

    if (idle && !isThinking) {
      focusIndex = Math.floor((t * 0.16) % data.hotspots.length);
    }

    const focusSpot = data.hotspots[focusIndex] || data.hotspots[0];

    const desiredIntensity =
      phase === "probing"
        ? isThinking
          ? 0.5
          : 0.34
        : phase === "selecting"
        ? isThinking
          ? 0.86
          : 0.66
        : phase === "transfer"
        ? isThinking
          ? 1.16
          : 0.96
        : idle && !isThinking
        ? 0.5 + Math.sin(t * 0.9) * 0.06
        : isThinking
        ? 0.8
        : 0.62;

    currentFocusPoint.current.lerp(focusSpot.pos, idle ? 0.014 : phase === "transfer" ? 0.08 : 0.05);
    currentIntensity.current = THREE.MathUtils.lerp(
      currentIntensity.current,
      desiredIntensity,
      0.08
    );
    currentColor.current.lerp(new THREE.Color(focusSpot.color), idle ? 0.025 : 0.06);

    const u = mainMaterialRef.current.uniforms;
    u.uTime.value = t;
    u.uFocusPoint.value.copy(currentFocusPoint.current);
    u.uFocusIntensity.value = currentIntensity.current;
    u.uColorFocus.value.copy(currentColor.current);
    u.uRayPos.value.copy(transferHead.current.pos);
    u.uRayActive.value = THREE.MathUtils.lerp(
      u.uRayActive.value,
      transferHead.current.active,
      0.18
    );
    u.uBreath.value = 0.5 + 0.5 * Math.sin(t * 0.9);
    u.uThinkingBoost.value = THREE.MathUtils.lerp(
      u.uThinkingBoost.value,
      isThinking ? 1 : 0,
      0.06
    );

    const probePos = u.uProbePos.value as THREE.Vector3[];
    const probeWeight = u.uProbeWeight.value as number[];

    for (let i = 0; i < 3; i++) {
      probePos[i].copy(probeHeads.current[i].pos);
      probeWeight[i] = THREE.MathUtils.lerp(
        probeWeight[i],
        probeHeads.current[i].active,
        0.18
      );
      probeHeads.current[i].active *= 0.92;
    }

    transferHead.current.active *= 0.95;

    if (shellMaterialRef.current) {
      const s = shellMaterialRef.current.uniforms;
      s.uTime.value = t;
      s.uPulse.value = THREE.MathUtils.lerp(
        s.uPulse.value,
        isThinking ? 1 : 0.72,
        0.08
      );
      s.uBreath.value = 0.5 + 0.5 * Math.sin(t * 0.9);
      s.uThinkingBoost.value = THREE.MathUtils.lerp(
        s.uThinkingBoost.value,
        isThinking ? 1 : 0,
        0.06
      );
      s.uColor.value.copy(currentColor.current);
    }
  });

  if (!data || !ready) return null;

  const { fusedGeometry, hotspots } = data;
  const originSpot = hotspots[currentIndex];
  const destinationSpot = hotspots[targetIndex];

  return (
    <group scale={2.9}>
      <points geometry={fusedGeometry} renderOrder={1}>
        <shaderMaterial
          ref={shellMaterialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={shellUniforms}
          vertexShader={`
            uniform float uTime;
            uniform float uPulse;
            uniform float uBreath;
            uniform float uThinkingBoost;
            uniform vec3 uColor;
            attribute float aRandom;

            void main() {
              vec3 pos = position;

              float shellBreath = (0.005 + uThinkingBoost * 0.0025) * (0.7 + uBreath * 0.9);
              float shellNoise =
                sin(uTime * 0.9 + aRandom * 10.0) * 0.003 +
                cos(uTime * 0.7 + aRandom * 14.0) * 0.002;

              pos += normalize(position) * (shellBreath + shellNoise);

              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              gl_PointSize = (1.6 + aRandom * 1.2 + uPulse * 2.0) * (20.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            uniform vec3 uColor;
            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              float soft = 1.0 - smoothstep(0.0, 0.5, d);
              float core = 1.0 - smoothstep(0.0, 0.18, d);
              vec3 color = uColor + core * 0.05;
              gl_FragColor = vec4(color, soft * 0.12);
            }
          `}
        />
      </points>

      <points geometry={fusedGeometry} renderOrder={2}>
        <shaderMaterial
          ref={mainMaterialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={mainUniforms}
          vertexShader={`
            uniform float uTime;
            uniform float uBreath;
            uniform float uThinkingBoost;
            uniform vec3 uFocusPoint;
            uniform float uFocusIntensity;
            uniform vec3 uRayPos;
            uniform float uRayActive;
            uniform vec3 uProbePos[3];
            uniform float uProbeWeight[3];

            attribute float aRandom;
            attribute float aRadialBias;

            varying float vProbe;
            varying float vRay;
            varying float vFocus;

            void main() {
              vec3 pos = position;
              float edge = smoothstep(0.35, 1.0, aRadialBias);

              float slowWave =
                sin(uTime * 0.9 + pos.x * 6.0 + aRandom * 6.2831) * 0.0032 +
                cos(uTime * 0.7 + pos.y * 7.0 + aRandom * 5.2831) * 0.0030;

              float fineJitter =
                sin(uTime * 1.8 + pos.z * 11.0 + aRandom * 9.2831) * 0.0015;

              float breathPush = (0.0052 + uThinkingBoost * 0.0022) * (0.6 + uBreath * 0.8);

              pos += normalize(position) * (slowWave + fineJitter + breathPush * edge);

              pos += vec3(
                sin(uTime * 0.95 + pos.y * 8.0 + aRandom * 6.2831),
                cos(uTime * 0.82 + pos.z * 7.0 + aRandom * 7.2831),
                sin(uTime * 1.05 + pos.x * 9.0 + aRandom * 8.2831)
              ) * 0.0022 * mix(0.35, 1.0, edge);

              float probe = 0.0;
              for (int i = 0; i < 3; i++) {
                probe += smoothstep(0.42, 0.0, distance(pos, uProbePos[i])) * uProbeWeight[i];
              }

              float ray = smoothstep(0.52, 0.0, distance(pos, uRayPos)) * uRayActive * (0.75 + aRandom * 0.45);
              float focus = smoothstep(0.95, 0.0, distance(pos, uFocusPoint)) * uFocusIntensity;

              vProbe = clamp(probe, 0.0, 1.0);
              vRay = clamp(ray, 0.0, 1.0);
              vFocus = clamp(focus, 0.0, 1.4);

              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;

              float size = 1.8 + vProbe * 2.2 + vRay * 7.8 + vFocus * 7.0 + uBreath * 0.8;
              gl_PointSize = size * (25.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            uniform vec3 uColorBase;
            uniform vec3 uColorProbe;
            uniform vec3 uColorFocus;

            varying float vProbe;
            varying float vRay;
            varying float vFocus;

            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;

              float soft = 1.0 - smoothstep(0.0, 0.5, d);
              float core = 1.0 - smoothstep(0.0, 0.16, d);

              vec3 color = uColorBase;
              color = mix(color, uColorProbe, vProbe * 0.82);
              color = mix(color, uColorFocus, max(vFocus, vRay));

              float alpha = (0.18 + vProbe * 0.18 + vFocus * 0.72 + vRay * 0.98) * soft;
              color += core * (vRay * 0.7 + vFocus * 0.35);

              gl_FragColor = vec4(color, alpha);
            }
          `}
        />
      </points>

      {originSpot &&
        probeTargets.slice(0, 3).map((candidateIndex, i) => {
          const candidate = hotspots[candidateIndex];
          if (!candidate) return null;

          const probeActive =
            phase === "probing" ||
            (phase === "selecting" && selectedIndex === candidateIndex);

          return (
            <SemanticFilament
              key={`probe-${candidateIndex}-${i}`}
              kind="probe"
              seed={candidateIndex * 17 + i * 3}
              start={originSpot.pos}
              end={candidate.pos}
              color={candidate.color}
              active={probeActive}
              onHeadUpdate={(pos, energy) => {
                probeHeads.current[i].pos.copy(pos);
                probeHeads.current[i].active = energy;
              }}
            />
          );
        })}

      {originSpot && destinationSpot && (
        <SemanticFilament
          key={`transfer-${currentIndex}-${targetIndex}`}
          kind="transfer"
          seed={91 + targetIndex}
          start={originSpot.pos}
          end={destinationSpot.pos}
          color={destinationSpot.color}
          active={phase === "transfer"}
          onHeadUpdate={(pos, energy) => {
            transferHead.current.pos.copy(pos);
            transferHead.current.active = energy;
          }}
        />
      )}

      {hotspots.map((spot, i) => {
        const isCurrent = i === currentIndex;
        const isSelected = i === selectedIndex && phase !== "settle";

        return (
          <group key={i} position={spot.pos}>
            <Html distanceFactor={8} position={[0.14, 0, 0]} center>
              <div
                style={{
                  color: spot.color,
                  fontSize: "9px",
                  letterSpacing: "5px",
                  textTransform: "uppercase",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                  fontStyle: "italic",
                  whiteSpace: "nowrap",
                  opacity: isCurrent ? 0.88 : isSelected ? 0.34 : 0.03,
                  transform: isCurrent
                    ? "translate(14px, -50%)"
                    : isSelected
                    ? "translate(8px, -50%)"
                    : "translate(0px, -50%)",
                  transition: "all 1.1s cubic-bezier(0.19, 1, 0.22, 1)",
                  textShadow: "0 0 18px rgba(0,0,0,0.75)",
                  pointerEvents: "none",
                }}
              >
                {spot.label}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

export default function VisualBrain({
  activeNodes = [],
  isThinking = false,
}: VisualBrainProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: "#050608",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 48% 48%, rgba(68,94,128,0.28), rgba(7,9,12,0.96) 64%)",
          filter: "blur(42px)",
          transform: "scale(1.08)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.40) 68%, rgba(0,0,0,0.78) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 3,
          pointerEvents: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          opacity: 0.07,
          mixBlendMode: "soft-light",
        }}
      />

      <Canvas
        camera={{ position: [0, 0, 8.5], fov: 28 }}
        dpr={[1, 1.35]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        style={{ position: "relative", zIndex: 1 }}
      >
        <Suspense fallback={null}>
          <AmbientNoiseField thinking={isThinking} life={1} />
          <BrainSculpture activeNodes={activeNodes} isThinking={isThinking} />
        </Suspense>

        <OrbitControls
          enableRotate
          enableZoom
          enablePan={false}
          enableDamping
          dampingFactor={0.05}
          minDistance={4}
          maxDistance={15}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/Brain_Model.glb");
