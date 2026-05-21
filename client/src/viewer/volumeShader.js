/**
 * volumeShader.js — GLSL shader strings for ray-cast volume rendering.
 *
 * Approach: A unit-cube proxy geometry, ray-marching through a 3D texture.
 * The fragment shader composites intensity samples front-to-back to produce
 * a gray-scale fog effect. Only voxels within [uThreshMin, uThreshMax] contribute.
 *
 * The camera position is passed as a uniform (in normalized local cube [0,1]^3 space),
 * updated each frame by ThreeDPanel via mesh.onBeforeRender.
 */

export const vertexShader = /* glsl */`
  varying vec3 vOrigin;
  varying vec3 vDir;
  uniform vec3 cameraPos;

  void main() {
    // vOrigin and vDir are in local [0,1]^3 cube space
    vOrigin = cameraPos;
    vDir = position + vec3(0.5) - cameraPos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */`
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D uVolume;
  uniform float uThreshMin;
  uniform float uThreshMax;
  uniform vec3 uVolSize;   // physical size in mm (for future aspect-correct use)
  uniform vec3 cameraPos;  // camera position in local [0,1]^3 space

  varying vec3 vOrigin;
  varying vec3 vDir;

  // Ray-AABB intersection for unit cube [0,1]^3
  vec2 hitBox(vec3 orig, vec3 dir) {
    vec3 tMin = (vec3(0.0) - orig) / dir;
    vec3 tMax = (vec3(1.0) - orig) / dir;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar  = min(min(t2.x, t2.y), t2.z);
    return vec2(tNear, tFar);
  }

  void main() {
    vec3 rayDir = normalize(vDir);
    vec2 bounds = hitBox(vOrigin, rayDir);
    if (bounds.x > bounds.y) discard;

    bounds.x = max(bounds.x, 0.0);

    const int MAX_STEPS = 256;
    float stepSize = 1.732 / float(MAX_STEPS); // diagonal of unit cube

    vec4 color = vec4(0.0);
    for (int i = 0; i < MAX_STEPS; i++) {
      float t = bounds.x + float(i) * stepSize;
      if (t > bounds.y || color.a > 0.95) break;

      vec3 pos = vOrigin + t * rayDir;
      if (any(lessThan(pos, vec3(0.0))) || any(greaterThan(pos, vec3(1.0)))) continue;

      float intensity = texture(uVolume, pos).r;
      if (intensity < uThreshMin || intensity > uThreshMax) continue;

      // Remap intensity to [0,1] within threshold window
      float remapped = (intensity - uThreshMin) / max(0.001, uThreshMax - uThreshMin);
      float alpha = remapped * 0.04; // low per-step opacity for fog effect
      vec3 sampleColor = vec3(remapped);

      // Front-to-back compositing
      color.rgb += (1.0 - color.a) * alpha * sampleColor;
      color.a   += (1.0 - color.a) * alpha;
    }

    if (color.a < 0.01) discard;
    gl_FragColor = color;
  }
`;
