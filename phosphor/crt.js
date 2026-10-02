const quadVs = `#version 300 es
const vec2 corners[3] = vec2[](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 p = corners[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const phosphorFs = `#version 300 es
precision highp float;
uniform highp sampler2D uState;
uniform sampler2D uSource;
uniform highp sampler2D uExciteQ;
uniform highp sampler2D uExciteL;
uniform int uMode;
uniform vec2 uSize;
uniform vec3 uK;
uniform vec3 uW;
uniform mat3 uColors;
uniform float uDt;
uniform float uHz;
uniform float uP0;
uniform float uDp;
uniform float uAvg;
uniform float uBeam;
uniform float uNorm;
uniform float uInterlace;
uniform float uTotal;
uniform vec2 uDeflect;
uniform float uSeed;
uniform float uClutter;
layout(location = 0) out vec4 oState;
layout(location = 1) out vec4 oLight;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float scanPhase(vec2 px) {
  if (uMode == 1) {
    vec2 c = px / uSize * 2.0 - 1.0;
    return fract(atan(c.x, c.y) / 6.2831853);
  }
  float line = uSize.y - 1.0 - floor(px.y);
  float h = px.x / uSize.x * 0.82;
  float total = uSize.y * uTotal;
  if (uInterlace > 0.5) {
    float field = mod(line, 2.0);
    return (field + (floor(line * 0.5) + h) / (total * 0.5)) * 0.5;
  }
  return (line + h) / total;
}

float signal(vec2 px) {
  vec2 uv = px / uSize;
  vec2 src = (uv - 0.5) / uDeflect + 0.5;
  if (any(lessThan(src, vec2(0.0))) || any(greaterThan(src, vec2(1.0)))) return 0.0;
  float squeeze = min(1.0 / max(uDeflect.x * uDeflect.y, 1e-5), 60.0);
  float lod = log2(max(1.0 / min(uDeflect.x, uDeflect.y), 1.0));
  float s = dot(textureLod(uSource, src, lod).rgb, vec3(0.299, 0.587, 0.114));
  s = mix(s, max(s, 0.4), smoothstep(1.5, 6.0, squeeze));
  if (uMode == 1) {
    float r = length(uv * 2.0 - 1.0);
    if (r > 0.995) return 0.0;
    float n = hash(px + uSeed);
    s += uClutter * (pow(n, 40.0) * 0.7 + pow(n, 3.0) * 0.6 * exp(-r * 8.0));
  }
  return s * squeeze;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 q = texelFetch(uState, ip, 0).rgb;
  vec3 decay = exp(-uK * uDt);
  vec3 next = q * decay;
  vec3 light = q - next;
  if (uMode == 2) {
    next += texelFetch(uExciteQ, ip, 0).rgb;
    light += texelFetch(uExciteL, ip, 0).rgb;
  } else {
    float s = signal(gl_FragCoord.xy) * uBeam;
    if (s > 0.0) {
      float d0 = fract(scanPhase(gl_FragCoord.xy) - uP0);
      float hits = d0 < uDp ? floor(uDp - d0) + 1.0 : 0.0;
      float period = 1.0 / uHz;
      vec3 g = vec3(0.0);
      if (hits > 0.0) {
        float lastHit = (uDp - d0 - (hits - 1.0)) * period;
        g = exp(-uK * lastHit) * (1.0 - exp(-uK * hits * period)) / max(1.0 - exp(-uK * period), 1e-7);
      }
      g = mix(g, uHz * (1.0 - decay) / uK, uAvg);
      hits = mix(hits, uDp, uAvg);
      vec3 dep = uW * s;
      next += dep * g;
      light += dep * (hits - g);
    }
  }
  vec3 b = light * uNorm;
  b = 3.0 * tanh(min(b / 3.0, vec3(10.0)));
  oState = vec4(next, 0.0);
  oLight = vec4(uColors * b, 1.0);
}`;

const beamVs = `#version 300 es
precision highp float;
uniform highp sampler2D uSamples;
uniform vec2 uSize;
uniform vec2 uDeflect;
uniform float uSigma;
uniform float uStep;
uniform float uCount;
uniform float uEnergy;
flat out vec2 vA;
flat out vec2 vB;
flat out float vTau;
flat out float vDep;

vec4 fetch(int i) {
  return texelFetch(uSamples, ivec2(i & 1023, i >> 10), 0);
}

vec2 place(vec2 v) {
  return uSize * 0.5 + v * uDeflect * uSize.y * 0.45;
}

void main() {
  int j = gl_InstanceID;
  vec4 s0 = fetch(j);
  vec4 s1 = fetch(j + 1);
  vec2 a = place(s0.xy);
  vec2 b = place(s1.xy);
  vec2 d = b - a;
  float len = length(d);
  vec2 t = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  float r = uSigma * 3.5 + 1.0;
  vec2 p = (gl_VertexID < 2 ? a - t * r : b + t * r) + n * r * ((gl_VertexID & 1) == 0 ? -1.0 : 1.0);
  vA = a;
  vB = b;
  vTau = (uCount - float(j) - 0.5) * uStep;
  vDep = uEnergy * 0.5 * (s0.z + s1.z);
  gl_Position = vDep > 0.0 ? vec4(p / uSize * 2.0 - 1.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const beamFs = `#version 300 es
precision highp float;
uniform vec3 uK;
uniform vec3 uW;
uniform float uSigma;
flat in vec2 vA;
flat in vec2 vB;
flat in float vTau;
flat in float vDep;
layout(location = 0) out vec4 oQ;
layout(location = 1) out vec4 oL;

float erf(float x) {
  float a = abs(x);
  float t = 1.0 / (1.0 + 0.3275911 * a);
  float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
  return sign(x) * y;
}

void main() {
  vec2 p = gl_FragCoord.xy - vA;
  vec2 d = vB - vA;
  float len = length(d);
  float s = uSigma;
  float g;
  if (len < 1e-3) {
    g = exp(-dot(p, p) / (2.0 * s * s)) / (6.2831853 * s * s);
  } else {
    vec2 t = d / len;
    float u = dot(p, t);
    float v = dot(p, vec2(-t.y, t.x));
    float k = 1.0 / (1.4142136 * s);
    g = exp(-v * v / (2.0 * s * s)) / (2.5066283 * s) * (erf(u * k) - erf((u - len) * k)) / (2.0 * len);
  }
  float e = vDep * g;
  vec3 left = exp(-uK * vTau);
  oQ = vec4(uW * e * left, 0.0);
  oL = vec4(uW * e * (1.0 - left), 0.0);
}`;

const compositeFs = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uLight;
uniform vec2 uLightSize;
uniform vec2 uRes;
uniform int uMode;
uniform float uCurve;
uniform float uOverscan;
uniform float uBlur;
uniform float uLineSigma;
uniform float uSpread;
uniform vec3 uGlass;
uniform vec3 uGrat;
out vec4 oColor;

vec2 warp(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= (1.0 + uCurve * dot(c, c)) / (1.0 + uCurve);
  return c * 0.5 + 0.5;
}

vec3 tap(vec2 uv) {
  return texture(uLight, uv).rgb;
}

vec3 row(float x, float v) {
  float dx = uBlur / uLightSize.x;
  return tap(vec2(x, v)) * 0.403
    + (tap(vec2(x - dx, v)) + tap(vec2(x + dx, v))) * 0.244
    + (tap(vec2(x - 2.0 * dx, v)) + tap(vec2(x + 2.0 * dx, v))) * 0.054;
}

vec3 raster(vec2 uv) {
  uv = (uv - 0.5) * uOverscan + 0.5;
  float px = 1.0 / uLightSize.x;
  float inside = smoothstep(-px, 0.0, uv.x) * smoothstep(1.0 + px, 1.0, uv.x);
  if (inside <= 0.0) return vec3(0.0);
  float pitch = uRes.y / (uLightSize.y * uOverscan);
  float y = uv.y * uLightSize.y - 0.5;
  float base = floor(y);
  vec3 sum = vec3(0.0);
  for (int i = -1; i <= 2; i++) {
    float line = base + float(i);
    if (line < 0.0 || line > uLightSize.y - 1.0) continue;
    vec3 c = row(uv.x, (line + 0.5) / uLightSize.y);
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float s = uLineSigma * (1.0 + uSpread * sqrt(min(lum, 9.0)));
    s = min(max(s, 0.85 / pitch), 1.2);
    float d = y - line;
    sum += c * exp(-d * d / (2.0 * s * s)) / (2.5066283 * s);
  }
  return sum * inside;
}

vec3 spot(vec2 uv) {
  vec2 d = uBlur / uLightSize;
  return tap(uv) * 0.25
    + (tap(uv + vec2(d.x, 0.0)) + tap(uv - vec2(d.x, 0.0)) + tap(uv + vec2(0.0, d.y)) + tap(uv - vec2(0.0, d.y))) * 0.125
    + (tap(uv + d) + tap(uv - d) + tap(uv + vec2(d.x, -d.y)) + tap(uv - vec2(d.x, -d.y))) * 0.0625;
}

vec3 graticule(vec2 uv) {
  vec2 g = uv * vec2(10.0, 8.0);
  vec2 f = abs(fract(g + 0.5) - 0.5) / fwidth(g);
  float major = 1.0 - min(min(f.x, f.y), 1.0);
  vec2 m = uv * vec2(50.0, 40.0);
  vec2 fm = abs(fract(m + 0.5) - 0.5) / fwidth(m);
  vec2 near = abs(uv - 0.5) * uRes;
  float minor = max(near.y < 5.0 ? 1.0 - min(fm.x, 1.0) : 0.0, near.x < 5.0 ? 1.0 - min(fm.y, 1.0) : 0.0);
  return uGrat * max(major, minor * 0.8);
}

void main() {
  vec2 uv = warp(vUv);
  vec2 px = (uv * 2.0 - 1.0) * uRes * 0.5;
  float dist;
  if (uMode == 1) {
    dist = length(px) - min(uRes.x, uRes.y) * 0.49;
  } else {
    float r = min(uRes.x, uRes.y) * 0.06;
    vec2 q = abs(px) - (uRes * 0.5 - r);
    dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  float mask = clamp(0.5 - dist / 1.5, 0.0, 1.0);
  vec3 col = uMode == 0 ? raster(uv) : spot(uv);
  if (uMode == 2) col += graticule(uv);
  col += uGlass;
  oColor = vec4(col * mask, mask);
}`;

const downFs = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 oColor;
void main() {
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb
    + texture(uSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
    + texture(uSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb
    + texture(uSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  c /= 1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.5;
  oColor = vec4(c, 1.0);
}`;

const blurFs = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;
out vec4 oColor;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 0.2270270;
  c += (texture(uSrc, vUv + uDir * 1.3846154).rgb + texture(uSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture(uSrc, vUv + uDir * 3.2307692).rgb + texture(uSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
  oColor = vec4(c, 1.0);
}`;

const finalFs = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uComp;
uniform sampler2D uBloom;
uniform float uGlow;
uniform float uExposure;
uniform float uSeed;
out vec4 oColor;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main() {
  vec4 base = texture(uComp, vUv);
  float a = base.a;
  vec3 col = base.rgb / max(a, 1e-4) + texture(uBloom, vUv).rgb * uGlow;
  vec3 m = 1.0 - exp(-col * uExposure);
  float hot = smoothstep(1.5, 8.0, max(col.r, max(col.g, col.b)) * uExposure);
  m = mix(m, vec3(max(m.r, max(m.g, m.b))), hot * 0.4);
  vec2 c = vUv * 2.0 - 1.0;
  m *= 1.0 - 0.2 * dot(c * c, c * c);
  m = pow(m, vec3(1.0 / 2.2));
  m += 0.014 * smoothstep(0.5, 0.0, length((vUv - vec2(0.3, 0.8)) * vec2(1.0, 1.6)));
  m += (hash(gl_FragCoord.xy + uSeed) - 0.5) / 255.0;
  oColor = vec4(clamp(m, 0.0, 1.0) * a, a);
}`;

const createCrt = (canvas) => {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true
  });
  if (!gl) throw new Error("NO WEBGL2");
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("NO FLOAT TEXTURES");

  const formats = {
    state: [gl.RGBA32F, gl.FLOAT],
    hdr: [gl.RGBA16F, gl.HALF_FLOAT]
  };

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };

  const program = (vs, fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = [];
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(p, i);
      uniforms.push({ name: info.name, type: info.type, loc: gl.getUniformLocation(p, info.name) });
    }
    return { p, uniforms };
  };

  const progs = {
    phosphor: program(quadVs, phosphorFs),
    beam: program(beamVs, beamFs),
    composite: program(quadVs, compositeFs),
    down: program(quadVs, downFs),
    blur: program(quadVs, blurFs),
    final: program(quadVs, finalFs)
  };

  const setters = {
    [gl.FLOAT]: (l, v) => gl.uniform1f(l, v),
    [gl.FLOAT_VEC2]: (l, v) => gl.uniform2fv(l, v),
    [gl.FLOAT_VEC3]: (l, v) => gl.uniform3fv(l, v),
    [gl.FLOAT_MAT3]: (l, v) => gl.uniformMatrix3fv(l, false, v),
    [gl.INT]: (l, v) => gl.uniform1i(l, v)
  };

  const use = (prog, values) => {
    gl.useProgram(prog.p);
    let unit = 0;
    for (const { name, type, loc } of prog.uniforms) {
      const v = values[name];
      if (v === undefined) continue;
      if (type === gl.SAMPLER_2D) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v);
        gl.uniform1i(loc, unit++);
      } else {
        setters[type](loc, v);
      }
    }
  };

  const makeTexture = (w, h, [internal, type], filter) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  const makeTarget = (...textures) => {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    textures.forEach((t, i) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    });
    gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("BAD FRAMEBUFFER");
    return fb;
  };

  const free = (obj) => {
    Object.values(obj).flat().forEach((v) => {
      if (v instanceof WebGLTexture) gl.deleteTexture(v);
      if (v instanceof WebGLFramebuffer) gl.deleteFramebuffer(v);
    });
  };

  const source = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, source);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const samples = makeTexture(1024, 8, [gl.RGBA32F, gl.FLOAT], gl.NEAREST);
  const vao = gl.createVertexArray();

  let sim = null;
  let view = null;
  let layers = { k: [1, 1, 1], w: [0, 0, 0], colors: new Array(9).fill(0) };

  const configure = (width, height) => {
    if (sim) free(sim);
    const states = [
      makeTexture(width, height, formats.state, gl.NEAREST),
      makeTexture(width, height, formats.state, gl.NEAREST)
    ];
    const light = makeTexture(width, height, formats.hdr, gl.LINEAR);
    const exciteQ = makeTexture(width, height, formats.hdr, gl.NEAREST);
    const exciteL = makeTexture(width, height, formats.hdr, gl.NEAREST);
    sim = {
      width,
      height,
      states,
      light,
      exciteQ,
      exciteL,
      steps: [makeTarget(states[1], light), makeTarget(states[0], light)],
      excite: makeTarget(exciteQ, exciteL),
      current: 0
    };
  };

  const resize = (w, h) => {
    if (view && view.w === w && view.h === h) return;
    if (view) free(view);
    canvas.width = w;
    canvas.height = h;
    const bw = Math.max(1, Math.round(w / 4));
    const bh = Math.max(1, Math.round(h / 4));
    const comp = makeTexture(w, h, formats.hdr, gl.LINEAR);
    const bloom = [makeTexture(bw, bh, formats.hdr, gl.LINEAR), makeTexture(bw, bh, formats.hdr, gl.LINEAR)];
    view = {
      w,
      h,
      bw,
      bh,
      comp,
      bloom,
      compFb: makeTarget(comp),
      bloomFb: [makeTarget(bloom[0]), makeTarget(bloom[1])]
    };
  };

  const toLinear = (hex) => [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  const setPhosphor = (list) => {
    const k = [1, 1, 1];
    const w = [0, 0, 0];
    const colors = [];
    for (let i = 0; i < 3; i++) {
      const l = list[i];
      if (l) {
        k[i] = 1 / l.tau;
        w[i] = l.weight;
        colors.push(...toLinear(l.color));
      } else {
        colors.push(0, 0, 0);
      }
    }
    layers = { k, w, colors };
  };

  const uploadSource = (img) => {
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  };

  const uploadSamples = (data, segments) => {
    const rows = Math.ceil((segments + 1) / 1024);
    gl.bindTexture(gl.TEXTURE_2D, samples);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, rows, gl.RGBA, gl.FLOAT, data, 0);
  };

  const draw = (fb, w, h) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const render = (f) => {
    if (!sim || !view) return;
    gl.bindVertexArray(vao);
    const size = [sim.width, sim.height];

    if (f.mode === 2) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sim.excite);
      gl.viewport(0, 0, sim.width, sim.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (f.segments > 0 && f.energy > 0) {
        use(progs.beam, {
          uSamples: samples,
          uSize: size,
          uDeflect: f.deflect,
          uSigma: f.sigma,
          uStep: f.step,
          uCount: f.segments,
          uEnergy: f.energy,
          uK: layers.k,
          uW: layers.w
        });
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, f.segments);
        gl.disable(gl.BLEND);
      }
    }

    use(progs.phosphor, {
      uState: sim.states[sim.current],
      uSource: source,
      uExciteQ: sim.exciteQ,
      uExciteL: sim.exciteL,
      uMode: f.mode,
      uSize: size,
      uK: layers.k,
      uW: layers.w,
      uColors: layers.colors,
      uDt: f.dt,
      uHz: f.hz,
      uP0: f.p0,
      uDp: f.dp,
      uAvg: f.avg,
      uBeam: f.beam,
      uNorm: f.norm,
      uInterlace: f.interlace ? 1 : 0,
      uTotal: f.total,
      uDeflect: f.deflect,
      uSeed: f.seed,
      uClutter: f.clutter
    });
    draw(sim.steps[sim.current], sim.width, sim.height);
    sim.current ^= 1;

    use(progs.composite, {
      uLight: sim.light,
      uLightSize: size,
      uRes: [view.w, view.h],
      uMode: f.mode,
      uCurve: f.curve,
      uOverscan: f.overscan,
      uBlur: f.blur,
      uLineSigma: f.lineSigma,
      uSpread: f.spread,
      uGlass: f.glass,
      uGrat: f.grat
    });
    draw(view.compFb, view.w, view.h);

    use(progs.down, { uSrc: view.comp, uTexel: [1 / view.w, 1 / view.h] });
    draw(view.bloomFb[0], view.bw, view.bh);
    for (const step of [1, 2]) {
      use(progs.blur, { uSrc: view.bloom[0], uDir: [step / view.bw, 0] });
      draw(view.bloomFb[1], view.bw, view.bh);
      use(progs.blur, { uSrc: view.bloom[1], uDir: [0, step / view.bh] });
      draw(view.bloomFb[0], view.bw, view.bh);
    }

    use(progs.final, {
      uComp: view.comp,
      uBloom: view.bloom[0],
      uGlow: f.glow,
      uExposure: f.exposure,
      uSeed: f.seed
    });
    draw(null, view.w, view.h);
  };

  return { gl, configure, resize, setPhosphor, uploadSource, uploadSamples, render };
};
