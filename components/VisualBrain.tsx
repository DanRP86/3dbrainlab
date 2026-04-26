"use client";

import React, { useRef, useMemo, Suspense, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Html, OrbitControls } from "@react-three/drei";
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

type Phase = "idle" | "probing" | "selecting" | "transfer" | "settle";

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

function AmbientNoiseField({ thinking }: { thinking: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const count = isMobile ? 1400 : 2600;

    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 3.2 + Math.random() * 3.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * r * 1.05;
      positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.7;
      positions[i * 3 + 2] = Math.cos(phi) * r * 1.55 - 2.6;

      randoms[i] = Math.random();
      scales[i] = 0.5 + Math.random() * 1.3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    return geo;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const material = pointsRef.current.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value = state.clock.getElapsedTime();
    material.uniforms.uThinking.value = THREE.MathUtils.lerp(
      material.uniforms.uThinking.value,
      thinking ? 1 : 0,
      0.05
    );
  });

  return (
    <points ref={pointsRef} geometry={geometry} renderOrder={0} frustumCulled={false}>
      <shaderMaterial
        transparent
        depthWrite={false}
        depthTest={true}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uThinking: { value: 0 },
          uColorA: { value: new THREE.Color("#111821") },
          uColorB: { value: new THREE.Color("#364a5f") },
        }}
        vertexShader={`
          uniform float uTime;
          uniform float uThinking;
          attribute float aRandom;
          attribute float aScale;
          varying float vAlpha;
          varying float vMix;

          void main() {
            vec3 pos = position;

            pos.x += sin(uTime * 0.10 + aRandom * 10.0) * 0.08;
            pos.y += cos(uTime * 0.12 + aRandom * 14.0) * 0.06;
            pos.z += sin(uTime * 0.08 + aRandom * 8.0) * 0.08;

            float pulse = 0.5 + 0.5 * sin(uTime * 0.7 + aRandom * 16.0);
            vMix = pulse;
            vAlpha = (0.12 + pulse * 0.1 + uThinking * 0.06) * (0.55 + aRandom * 0.45);

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = (1.8 + aScale * 2.2 + uThinking * 0.6) * (16.0 / -mvPosition.z);
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
            color += core * 0.04;

            gl_FragColor = vec4(color, vAlpha * soft * 0.5);
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
    const randomness = kind === "probe" ? 0.18 : 0.32;
    const lift = kind === "probe" ? 0.08 : 0.16;

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
          seededRange(seed + 5, -randomness, randomness) + lift * 0.6,
          seededRange(seed + 6, -randomness, randomness)
        )
      );

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

    material.uniforms.uEnergy.value = THREE.MathUtils.lerp(
      material.uniforms.uEnergy.value,
      active ? 1 : 0,
      active ? 0.14 : 0.08
    );

    if (kind === "probe") {
      const head = (state.clock.getElapsedTime() * 0.42 + seed * 0.173) % 1;
      material.uniforms.uProgress.value = head;

      if (onHeadUpdate && material.uniforms.uEnergy.value > 0.02) {
        onHeadUpdate(curve.getPointAt(head), material.uniforms.uEnergy.value * 0.65);
      }
    } else {
      const nextProgress = THREE.MathUtils.lerp(
        material.uniforms.uProgress.value,
        active ? 1 : 0,
        active ? 0.075 : 0.04
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
          uThickness: { value: kind === "probe" ? 4.0 : 6.4 },
          uSeed: { value: seed },
        }}
        vertexShader={`
          uniform float uTime;
          uniform float uProgress;
          uniform float uEnergy;
          uniform float uMode;
          uniform float uThickness;
          uniform float uSeed;

          attribute float aOffset;
          attribute float aRandom;

          varying float vAlpha;

          void main() {
            vec3 pos = position;

            pos += vec3(
              sin(uTime * 1.8 + aOffset * 18.0 + uSeed * 7.0),
              cos(uTime * 1.6 + aOffset * 14.0 + uSeed * 5.0),
              sin(uTime * 2.0 + aOffset * 12.0 + uSeed * 9.0)
            ) * 0.004 * (0.4 + aRandom * 0.6);

            float head = uProgress;
            float headGlow = 1.0 - smoothstep(0.0, 0.095, abs(aOffset - head));
            float tail = (1.0 - smoothstep(0.0, 0.3, head - aOffset)) * step(aOffset, head);

            float body = headGlow;
            if (uMode > 0.5) {
              body = max(headGlow, tail * 0.9);
            }

            vAlpha = body * uEnergy;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = (1.2 + vAlpha * uThickness) * (28.0 / -mvPosition.z);
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

            vec3 color = uColor * (0.75 + core * 0.8);
            float alpha = soft * vAlpha * 0.85;

            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </points>
  );
}

function BrainSculpture({
  activeNodes,
  isThinking,
}: {
  activeNodes: number[];
  isThinking: boolean;
}) {
  const { scene } = useGLTF("/Brain_Model.glb");
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const shellMaterialRef = useRef<THREE.ShaderMaterial>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [probeTargets, setProbeTargets] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");

  const currentIndexRef = useRef(0);

  const probeHeads = useRef([
    { pos: new THREE.Vector3(), active: 0 },
    { pos: new THREE.Vector3(), active: 0 },
    { pos: new THREE.Vector3(), active: 0 },
  ]);

  const transferHead = useRef({ pos: new THREE.Vector3(), active: 0 });

  const currentFocusPoint = useRef(new THREE.Vector3());
  const currentIntensity = useRef(0);
  const currentColor = useRef(new THREE.Color("#666"));

  const timersRef = useRef<number[]>([]);

  const { fusedGeometry, hotspots } = useMemo(() => {
    const geometriesToMerge: THREE.BufferGeometry[] = [];

    scene.traverse((child: any) => {
      if (child.isMesh) {
        const clonedGeo = child.geometry.clone();
        clonedGeo.applyMatrix4(child.matrixWorld);
        geometriesToMerge.push(clonedGeo);
      }
    });

    const fusedGeo = mergeGeometries(geometriesToMerge);
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

    return { fusedGeometry: fusedGeo, hotspots: spots };
  }, [scene]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (!hotspots.length || !activeNodes?.length) return;

    const next = activeNodes[0];
    if (next < 0 || next >= hotspots.length) return;
    if (next === currentIndexRef.current && phase !== "idle") return;

    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];

    const from = currentIndexRef.current;
    const candidates = getProbeCandidates(next, from);

    setTargetIndex(next);
    setSelectedIndex(null);
    setProbeTargets(candidates);
    setPhase("probing");

    const t1 = window.setTimeout(() => {
      setSelectedIndex(next);
      setPhase("selecting");
    }, 450);

    const t2 = window.setTimeout(() => {
      setPhase("transfer");
    }, 1050);

    const t3 = window.setTimeout(() => {
      currentIndexRef.current = next;
      setCurrentIndex(next);
      setSelectedIndex(next);
      setPhase("settle");
    }, 1850);

    const t4 = window.setTimeout(() => {
      setPhase("idle");
    }, 4200);

    timersRef.current.push(t1, t2, t3, t4);
  }, [activeNodes, hotspots, phase]);

  useFrame((state) => {
    if (!materialRef.current || !hotspots.length) return;

    const focusIndex =
      phase === "settle" || phase === "idle"
        ? currentIndex
        : selectedIndex !== null
        ? selectedIndex
        : targetIndex;

    const focusSpot = hotspots[focusIndex];
    if (!focusSpot) return;

    const desiredIntensity =
      phase === "probing"
        ? isThinking
          ? 0.55
          : 0.3
        : phase === "selecting"
        ? isThinking
          ? 0.8
          : 0.55
        : phase === "transfer"
        ? isThinking
          ? 1.15
          : 0.95
        : isThinking
        ? 0.65
        : 0.35;

    currentFocusPoint.current.lerp(focusSpot.pos, phase === "transfer" ? 0.08 : 0.045);
    currentIntensity.current = THREE.MathUtils.lerp(
      currentIntensity.current,
      desiredIntensity,
      0.09
    );
    currentColor.current.lerp(new THREE.Color(focusSpot.color), 0.05);

    const uniforms = materialRef.current.uniforms;
    uniforms.uTime.value = state.clock.getElapsedTime();
    uniforms.uFocusPoint.value.copy(currentFocusPoint.current);
    uniforms.uFocusIntensity.value = currentIntensity.current;
    uniforms.uColorFocus.value.copy(currentColor.current);
    uniforms.uRayPos.value.copy(transferHead.current.pos);
    uniforms.uRayActive.value = THREE.MathUtils.lerp(
      uniforms.uRayActive.value,
      transferHead.current.active,
      0.15
    );

    const probePos = uniforms.uProbePos.value as THREE.Vector3[];
    const probeWeight = uniforms.uProbeWeight.value as number[];

    for (let i = 0; i < 3; i++) {
      probePos[i].copy(probeHeads.current[i].pos);
      probeWeight[i] = THREE.MathUtils.lerp(probeWeight[i], probeHeads.current[i].active, 0.16);
      probeHeads.current[i].active *= 0.92;
    }

    transferHead.current.active *= 0.95;

    if (shellMaterialRef.current) {
      shellMaterialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      shellMaterialRef.current.uniforms.uEnergy.value = THREE.MathUtils.lerp(
        shellMaterialRef.current.uniforms.uEnergy.value,
        Math.max(0.25, desiredIntensity * 0.7),
        0.05
      );
    }
  });

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
          uniforms={{
            uTime: { value: 0 },
            uEnergy: { value: 0.25 },
            uColor: { value: new THREE.Color("#1b2430") },
          }}
          vertexShader={`
            uniform float uTime;
            uniform float uEnergy;
            attribute float aRandom;

            void main() {
              vec3 pos = position;
              pos += normalize(position) * (0.012 + 0.012 * sin(uTime * 0.6 + aRandom * 10.0)) * (0.8 + uEnergy * 0.5);

              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              gl_PointSize = (1.3 + aRandom * 1.3 + uEnergy * 0.5) * (20.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            uniform vec3 uColor;

            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;

              float soft = 1.0 - smoothstep(0.0, 0.5, d);
              gl_FragColor = vec4(uColor, soft * 0.11);
            }
          `}
        />
      </points>

      <points geometry={fusedGeometry} renderOrder={2}>
        <shaderMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
            uFocusPoint: { value: new THREE.Vector3() },
            uFocusIntensity: { value: 0 },
            uRayPos: { value: new THREE.Vector3() },
            uRayActive: { value: 0 },
            uProbePos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
            uProbeWeight: { value: [0, 0, 0] },
            uColorBase: { value: new THREE.Color("#151922") },
            uColorProbe: { value: new THREE.Color("#748193") },
            uColorFocus: { value: new THREE.Color("#98a2b3") },
          }}
          vertexShader={`
            uniform float uTime;
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

              pos += vec3(
                sin(uTime * 0.9 + pos.y * 8.0 + aRandom * 6.2831),
                cos(uTime * 0.8 + pos.z * 7.0 + aRandom * 7.2831),
                sin(uTime * 1.0 + pos.x * 9.0 + aRandom * 8.2831)
              ) * 0.0042 * mix(0.35, 1.0, edge);

              pos += normalize(position) * sin(uTime * 0.5 + aRandom * 10.0) * 0.0028;

              float probe = 0.0;
              for (int i = 0; i < 3; i++) {
                probe += smoothstep(0.45, 0.0, distance(pos, uProbePos[i])) * uProbeWeight[i];
              }

              float ray = smoothstep(0.52, 0.0, distance(pos, uRayPos)) * uRayActive * (0.65 + aRandom * 0.45);
              float focus = smoothstep(0.95, 0.0, distance(pos, uFocusPoint)) * uFocusIntensity;

              vProbe = clamp(probe, 0.0, 1.0);
              vRay = clamp(ray, 0.0, 1.0);
              vFocus = clamp(focus, 0.0, 1.0);

              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;

              float size = 1.7 + vProbe * 2.4 + vRay * 7.5 + vFocus * 5.5;
              gl_PointSize = size * (28.0 / -mvPosition.z);
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
              color = mix(color, uColorProbe, vProbe * 0.85);
              color = mix(color, uColorFocus, max(vFocus, vRay));

              float alpha = (0.18 + vProbe * 0.2 + vFocus * 0.52 + vRay * 0.95) * soft;
              color += core * (vRay * 0.65 + vFocus * 0.26);

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
          active={phase === "transfer" || phase === "settle"}
          onHeadUpdate={(pos, energy) => {
            transferHead.current.pos.copy(pos);
            transferHead.current.active = energy;
          }}
        />
      )}

      {hotspots.map((spot, i) => {
        const visible = i === currentIndex || i === selectedIndex;
        const strong = i === currentIndex && (phase === "settle" || phase === "idle");

        return (
          <group key={i} position={spot.pos}>
            <Html distanceFactor={8} position={[0.14, 0, 0]} center>
              <div
                style={{
                  color: spot.color,
                  fontSize: "9px",
                  letterSpacing: "5px",
                  textTransform: "uppercase",
                  fontFamily: '"Cormorant Garamond", "Georgia", serif',
                  fontStyle: "italic",
                  whiteSpace: "nowrap",
                  opacity: strong ? 0.92 : visible ? 0.35 : 0.08,
                  transform: strong
                    ? "translate(14px, -50%)"
                    : visible
                    ? "translate(8px, -50%)"
                    : "translate(0px, -50%)",
                  transition: "all 1.2s cubic-bezier(0.19, 1, 0.22, 1)",
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
}: {
  activeNodes?: number[];
  isThinking?: boolean;
}) {
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
          pointerEvents: "none",
          zIndex: 10,
          background:
            "radial-gradient(circle at center, rgba(0,0,0,0) 22%, rgba(0,0,0,0.56) 68%, rgba(0,0,0,0.88) 100%)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 11,
          background:
            "radial-gradient(circle at 50% 48%, rgba(90,120,180,0.12), transparent 38%), radial-gradient(circle at 52% 52%, rgba(255,255,255,0.03), transparent 28%)",
          filter: "blur(36px)",
          opacity: 0.85,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 12,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          opacity: 0.028,
          mixBlendMode: "overlay",
        }}
      />

      <Canvas
        camera={{ position: [0, 0, 8.5], fov: 28 }}
        dpr={[1, 1.4]}
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <AmbientNoiseField thinking={isThinking} />
          <BrainSculpture activeNodes={activeNodes} isThinking={isThinking} />
        </Suspense>

        <OrbitControls
          enableRotate={true}
          enableZoom={true}
          enablePan={false}
          enableDamping
          dampingFactor={0.05}
          minDistance={4}
          maxDistance={15}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
