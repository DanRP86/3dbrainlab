"use client";

import React, { useRef, useMemo, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const CONCEPTS = [
  { id: 0, label: "PMI", dir: [1, 0.2, 0.5], color: "#8fe9ff" },
  { id: 1, label: "AI", dir: [-0.6, 0.8, 0.4], color: "#d5b36a" },
  { id: 2, label: "ENGINEER", dir: [0.4, 0.7, -0.6], color: "#8ea0d8" },
  { id: 3, label: "FLEET", dir: [-0.8, -0.4, 0.5], color: "#95d1b3" },
  { id: 4, label: "MANAGEMENT", dir: [0.7, -0.6, -0.4], color: "#b29bcb" },
  { id: 5, label: "REAL ESTATE", dir: [-0.4, -0.8, -0.5], color: "#c2c2c2" },
  { id: 6, label: "SPORTS", dir: [0.3, 0.1, -0.9], color: "#c98f8f" },
  { id: 7, label: "VAN", dir: [0.1, -0.9, 0.8], color: "#d9c6a2" },
];

function AmbientNoiseField({ thinking = 0 }: { thinking?: number }) {
  const ref = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const count = isMobile ? 1400 : 2800;

    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 2.8 + Math.random() * 2.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const x = Math.sin(phi) * Math.cos(theta) * r * 1.1;
      const y = Math.sin(phi) * Math.sin(theta) * r * 0.72;
      const z = Math.cos(phi) * r * 1.6 - 2.3;

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      randoms[i] = Math.random();
      scales[i] = 0.4 + Math.random() * 1.2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    return geo;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.ShaderMaterial;
    m.uniforms.uTime.value = state.clock.getElapsedTime();
    m.uniforms.uThinking.value = THREE.MathUtils.lerp(
      m.uniforms.uThinking.value,
      thinking,
      0.05
    );
  });

  return (
    <points ref={ref} geometry={geometry} renderOrder={0} frustumCulled={false}>
      <shaderMaterial
        transparent
        depthWrite={false}
        depthTest={true}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uThinking: { value: 0 },
          uColorA: { value: new THREE.Color("#0d131a") },
          uColorB: { value: new THREE.Color("#31465a") },
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

            float drift =
              sin(uTime * 0.10 + aRandom * 12.0) * 0.06 +
              cos(uTime * 0.14 + aRandom * 18.0) * 0.04;

            pos.x += drift * (0.5 + aRandom);
            pos.y += sin(uTime * 0.12 + pos.x * 0.6 + aRandom * 10.0) * 0.04;
            pos.z += cos(uTime * 0.08 + pos.y * 0.4 + aRandom * 7.0) * 0.06;

            float pulse = 0.5 + 0.5 * sin(uTime * 0.9 + aRandom * 20.0);
            vMix = 0.25 + 0.75 * pulse;
            vAlpha = (0.12 + pulse * 0.12 + uThinking * 0.08) * (0.7 + aRandom * 0.5);

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = (2.0 + aScale * 2.4 + uThinking * 1.0) * (18.0 / -mvPosition.z);
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
            float core = 1.0 - smoothstep(0.0, 0.18, d);

            vec3 color = mix(uColorA, uColorB, vMix);
            color += core * 0.05;

            gl_FragColor = vec4(color, vAlpha * soft);
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

  const mainMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const shellMaterialRef = useRef<THREE.ShaderMaterial>(null);

  const [targetIndex, setTargetIndex] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);

  const currentFocusPos = useRef(new THREE.Vector3());
  const corridorPulse = useRef(0);
  const corridorTrail = useRef(0);
  const targetColor = useRef(new THREE.Color("#ffffff"));

  const data = useMemo(() => {
    if (!scene) return null;

    const positions: number[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh && child.geometry?.attributes?.position) {
        const posAttr = child.geometry.attributes.position;
        child.updateMatrixWorld();
        const matrix = child.matrixWorld;
        const v = new THREE.Vector3();

        const stride =
          typeof window !== "undefined" && window.innerWidth < 768
            ? 4
            : posAttr.count > 40000
            ? 3
            : 2;

        for (let i = 0; i < posAttr.count; i += stride) {
          v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
          positions.push(v.x, v.y, v.z);
        }
      }
    });

    if (!positions.length) return null;

    const fusedGeo = new THREE.BufferGeometry();
    fusedGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    fusedGeo.center();
    fusedGeo.computeBoundingSphere();

    const scale = 1 / (fusedGeo.boundingSphere?.radius || 1);
    fusedGeo.scale(scale, scale, scale);

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

    const spots = CONCEPTS.map((c) => {
      let closestIdx = 0;
      let maxDot = -Infinity;
      const targetDir = new THREE.Vector3(...c.dir).normalize();
      const v = new THREE.Vector3();

      for (let i = 0; i < count; i += 10) {
        v.fromBufferAttribute(fusedGeo.attributes.position as THREE.BufferAttribute, i);
        const dot = v.normalize().dot(targetDir);
        if (dot > maxDot) {
          maxDot = dot;
          closestIdx = i;
        }
      }

      return {
        ...c,
        pos: new THREE.Vector3().fromBufferAttribute(
          fusedGeo.attributes.position as THREE.BufferAttribute,
          closestIdx
        ),
      };
    });

    const langPos = new THREE.Vector3(-0.4, 0.1, 0.6);

    return { fusedGeometry: fusedGeo, hotspots: spots, languageNode: langPos };
  }, [scene]);

  useEffect(() => {
    if (activeNodes && activeNodes.length > 0) {
      const idx = activeNodes[0];
      if (idx >= 0 && idx < CONCEPTS.length) {
        setTargetIndex(idx);
        targetColor.current.set(CONCEPTS[idx].color);
        setIsFlashing(true);
        const t = setTimeout(() => setIsFlashing(false), 6000);
        return () => clearTimeout(t);
      }
    }
  }, [activeNodes]);

  useFrame((state) => {
    if (!data) return;

    const focusSpot = data.hotspots[targetIndex];
    if (!focusSpot) return;

    currentFocusPos.current.lerp(focusSpot.pos, 0.06);
    corridorPulse.current = THREE.MathUtils.lerp(
      corridorPulse.current,
      isThinking ? 1.0 : 0.0,
      0.08
    );
    corridorTrail.current = THREE.MathUtils.lerp(
      corridorTrail.current,
      isFlashing ? 1.0 : 0.08,
      0.04
    );

    const t = state.clock.getElapsedTime();

    if (mainMaterialRef.current) {
      const u = mainMaterialRef.current.uniforms;
      u.uTime.value = t;
      u.uFocusPoint.value.copy(currentFocusPos.current);
      u.uLanguagePoint.value.copy(data.languageNode);
      u.uCorridorPulse.value = corridorPulse.current;
      u.uCorridorTrail.value = corridorTrail.current;
      u.uColorFocus.value.lerp(targetColor.current, 0.05);
    }

    if (shellMaterialRef.current) {
      const u = shellMaterialRef.current.uniforms;
      u.uTime.value = t;
      u.uEnergy.value = THREE.MathUtils.lerp(
        u.uEnergy.value,
        isThinking ? 1.0 : isFlashing ? 0.65 : 0.25,
        0.04
      );
    }
  });

  if (!data) return null;

  const selectedSpot = data.hotspots[targetIndex];

  return (
    <group scale={3.2}>
      <points geometry={data.fusedGeometry} renderOrder={1}>
        <shaderMaterial
          ref={shellMaterialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
            uEnergy: { value: 0.25 },
            uColor: { value: new THREE.Color("#1c2430") },
          }}
          vertexShader={`
            uniform float uTime;
            uniform float uEnergy;
            attribute float aRandom;

            void main() {
              vec3 pos = position;
              pos += normalize(position) * (0.01 + 0.012 * sin(uTime * 0.55 + aRandom * 10.0)) * (0.8 + uEnergy * 0.5);

              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              gl_PointSize = (0.9 + aRandom * 1.1 + uEnergy * 0.35) * (18.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            uniform vec3 uColor;

            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;

              float soft = 1.0 - smoothstep(0.0, 0.5, d);
              gl_FragColor = vec4(uColor, soft * 0.085);
            }
          `}
        />
      </points>

      <points geometry={data.fusedGeometry} renderOrder={2}>
        <shaderMaterial
          ref={mainMaterialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
            uFocusPoint: { value: new THREE.Vector3() },
            uLanguagePoint: { value: new THREE.Vector3() },
            uCorridorPulse: { value: 0 },
            uCorridorTrail: { value: 0 },
            uColorFocus: { value: new THREE.Color("#ffffff") },
            uColorLanguage: { value: new THREE.Color("#53dff6") },
            uColorBase: { value: new THREE.Color("#0b0d12") },
          }}
          vertexShader={`
            uniform float uTime;
            uniform vec3 uFocusPoint;
            uniform vec3 uLanguagePoint;
            uniform float uCorridorPulse;
            uniform float uCorridorTrail;

            attribute float aRandom;
            attribute float aRadialBias;

            varying float vInfluence;
            varying float vLang;

            float sdSegment(vec3 p, vec3 a, vec3 b) {
              vec3 pa = p - a;
              vec3 ba = b - a;
              float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
              return length(pa - ba * h);
            }

            void main() {
              vec3 pos = position;

              float edge = smoothstep(0.35, 1.0, aRadialBias);
              float breathe = sin(uTime * 1.15 + aRandom * 10.0) * 0.003;
              pos += normalize(position) * breathe * (0.7 + uCorridorPulse * 1.5);

              pos += vec3(
                sin(uTime * 0.8 + pos.y * 8.0 + aRandom * 6.28),
                cos(uTime * 0.7 + pos.z * 7.0 + aRandom * 7.28),
                sin(uTime * 0.9 + pos.x * 9.0 + aRandom * 8.28)
              ) * 0.0022 * mix(0.3, 1.0, edge);

              float focus = smoothstep(0.75, 0.0, distance(pos, uFocusPoint)) * uCorridorTrail;
              float lang = smoothstep(0.65, 0.0, distance(pos, uLanguagePoint));

              float corridor = smoothstep(0.18, 0.0, sdSegment(pos, uLanguagePoint, uFocusPoint));

              vec3 ba = uFocusPoint - uLanguagePoint;
              vec3 pa = pos - uLanguagePoint;
              float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);

              float head = fract(uTime * 0.22);
              float movingHead = 1.0 - smoothstep(0.0, 0.08, abs(h - head));
              float trail = (1.0 - smoothstep(0.0, 0.28, head - h)) * step(h, head);

              float semanticFlow = corridor * (
                movingHead * 0.95 * uCorridorPulse +
                trail * 0.45 * uCorridorTrail
              );

              vInfluence = clamp(focus + semanticFlow + corridor * uCorridorTrail * 0.18, 0.0, 1.0);
              vLang = lang;

              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              gl_PointSize = (2.2 + vLang * 2.5 + vInfluence * 12.0) * (30.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            uniform vec3 uColorBase;
            uniform vec3 uColorFocus;
            uniform vec3 uColorLanguage;

            varying float vInfluence;
            varying float vLang;

            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;

              float soft = 1.0 - smoothstep(0.0, 0.5, d);
              float core = 1.0 - smoothstep(0.0, 0.16, d);

              vec3 color = mix(uColorBase, uColorLanguage, vLang * 0.28);
              color = mix(color, uColorFocus, vInfluence);
              color += core * (vInfluence * 0.35 + vLang * 0.08);

              float alpha = (0.22 + vLang * 0.28 + vInfluence * 1.05) * soft;
              gl_FragColor = vec4(color, alpha);
            }
          `}
        />
      </points>

      <group position={data.languageNode}>
        <Html distanceFactor={11} center>
          <div
            style={{
              color: "#8ad9ff",
              fontSize: "9px",
              letterSpacing: "4px",
              opacity: isThinking ? 0.72 : 0.22,
              transition: "opacity 0.6s ease",
              fontStyle: "italic",
              whiteSpace: "nowrap",
              textShadow: "0 0 12px rgba(0,0,0,1)",
              pointerEvents: "none",
            }}
          >
            LANGUAGE
          </div>
        </Html>
      </group>

      {selectedSpot && (
        <group key={selectedSpot.id} position={selectedSpot.pos}>
          <Html distanceFactor={10} center position={[0.12, 0, 0]}>
            <div
              style={{
                color: selectedSpot.color,
                fontSize: "10px",
                letterSpacing: "5px",
                opacity: isFlashing ? 1 : 0.35,
                background: "transparent",
                padding: 0,
                margin: 0,
                border: "none",
                transition: "all 0.8s cubic-bezier(0.19, 1, 0.22, 1)",
                pointerEvents: "none",
                fontStyle: "italic",
                whiteSpace: "nowrap",
                textShadow: "0 0 12px rgba(0,0,0,1)",
                transform: isFlashing
                  ? "translate(12px, -50%)"
                  : "translate(0px, -50%)",
              }}
            >
              {selectedSpot.label}
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

export default function VisualBrain({
  activeNodes,
  isThinking,
}: {
  activeNodes: number[];
  isThinking: boolean;
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
            "radial-gradient(circle at center, rgba(0,0,0,0) 28%, rgba(0,0,0,0.72) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 11,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          opacity: 0.035,
          mixBlendMode: "overlay",
        }}
      />

      <Canvas
        camera={{ position: [0, 0, 7.8], fov: 30 }}
        dpr={[1, 1.4]}
        performance={{ min: 0.65 }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <Suspense fallback={null}>
          <AmbientNoiseField thinking={isThinking ? 1 : 0} />
          <BrainSculpture activeNodes={activeNodes} isThinking={isThinking} />
        </Suspense>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableDamping
          dampingFactor={0.05}
          autoRotate
          autoRotateSpeed={0.18}
          minAzimuthAngle={-0.45}
          maxAzimuthAngle={0.45}
          minPolarAngle={Math.PI / 2 - 0.22}
          maxPolarAngle={Math.PI / 2 + 0.22}
        />
      </Canvas>
    </div>
  );
}
