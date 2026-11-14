import * as THREE from 'three';

/** Gemeinsame Uniforms für alle Shader. */
export const shared = {
  uTime: { value: 0 },
};

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** Kachelbares Wasser-Kaustik-Muster. */
export const CAUSTIC_GLSL = /* glsl */ `
float nz(float x) { return abs(x) < 1e-4 ? 1e-4 : x; } // nie durch 0 teilen
float causticRaw(vec2 uv, float time) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / max(length(vec2(p.x / nz(sin(i.x + t) / inten), p.y / nz(cos(i.y + t) / inten))), 1e-4);
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 3.0);
}
float causticAt(vec3 wp, float time) {
  vec2 uv = wp.xz * 0.055 + vec2(wp.y * 0.01);
  return causticRaw(uv, time * 0.55);
}
`;

/**
 * Erweitert ein Three.js-Material:
 *  caustics: Stärke der Lichtmuster (0 = aus; nur für MeshStandard/Physical)
 *  sway:     Wiegen im Wasser (benötigt Attribut aSway)
 *  swaySpeed
 *  vertex:   zusätzlicher GLSL-Code im Vertex-Shader (lokales "transformed")
 */
export function patch(mat, o = {}) {
  const caustics = o.caustics ?? 0;
  const sway = o.sway ?? 0;
  const speed = o.swaySpeed ?? 1;
  const extra = o.vertex ?? '';
  const key = `p|${caustics}|${sway}|${speed}|${extra}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    let head = 'uniform float uTime;\nvarying vec3 vCW;\n';
    if (caustics) head += 'varying vec3 vCN;\n';
    if (sway) head += 'attribute float aSway;\n';

    shader.vertexShader = head + shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      mat4 cwm = modelMatrix;
      #ifdef USE_INSTANCING
        cwm = modelMatrix * instanceMatrix;
      #endif
      ${sway ? `
      {
        vec3 wp0 = (cwm * vec4(transformed, 1.0)).xyz;
        vec3 org = (cwm * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float ph = org.x * 0.31 + org.z * 0.23 + wp0.x * 0.12 + wp0.z * 0.09;
        float sw = aSway * ${f(sway)};
        transformed.x += (sin(uTime * ${f(1.3 * speed)} + ph) + 0.35 * sin(uTime * ${f(2.9 * speed)} + ph * 1.7)) * sw;
        transformed.z += cos(uTime * ${f(1.05 * speed)} + ph * 1.3) * sw * 0.7;
      }` : ''}
      ${extra}
      vCW = (cwm * vec4(transformed, 1.0)).xyz;
      ${caustics ? 'vCN = normalize(mat3(cwm) * objectNormal);' : ''}
      `,
    );

    if (caustics) {
      shader.fragmentShader =
        'uniform float uTime;\nvarying vec3 vCW;\nvarying vec3 vCN;\n' + CAUSTIC_GLSL +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `
          #include <emissivemap_fragment>
          {
            float cst = causticAt(vCW, uTime);
            float upf = clamp(vCN.y * 0.65 + 0.35, 0.0, 1.0);
            float depthK = clamp(1.0 - vCW.y * 0.012, 0.6, 1.0);
            totalEmissiveRadiance += (diffuseColor.rgb * 0.8 + 0.04) * vec3(0.7, 0.95, 1.0) * min(cst, 1.6) * upf * depthK * ${f(caustics * 0.55)};
          }`,
        );
    }
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function standard(opts = {}, patchOpts = {}) {
  return patch(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts }), { caustics: 1, ...patchOpts });
}
