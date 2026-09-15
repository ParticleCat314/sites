import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightActiveLine,
} from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  StreamLanguage, syntaxHighlighting, HighlightStyle, StringStream,
  indentOnInput, bracketMatching, foldGutter, foldKeymap,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { vim } from '@replit/codemirror-vim';
import {
  autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap,
  CompletionContext, CompletionResult,
} from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';

/* ── Default shader ──────────────────────────────────────── */
const DEFAULT_SHADER = `// Plasma rings — edit me!

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / min(iResolution.x, iResolution.y);

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    float rings = sin(r * 12.0 - iTime * 2.5 + sin(a * 3.0 + iTime)) * 0.5 + 0.5;
    float spiral = sin(a * 4.0 + r * 6.0 - iTime * 1.5) * 0.5 + 0.5;

    vec3 col = vec3(rings * spiral);
    col = mix(vec3(0.05, 0.1, 0.3), vec3(0.8, 0.4, 1.0), col);
    col += 0.05 * vec3(sin(iTime * 0.7), sin(iTime * 1.1), sin(iTime * 1.3));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/**
 * Starter code for a newly added buffer: a self-feedback trail, which only
 * works if the buffer samples itself, so it doubles as a wiring hint.
 */
function defaultBufferShader(name: string): string {
  return `// Buffer ${name} — renders to an offscreen framebuffer.
// Wire a channel to "Buffer ${name}" below to read last frame's output,
// then sample this buffer from the Image pass to see it.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    // Previous frame, faded — a feedback trail.
    vec4 prev = texture(iChannel0, uv) * 0.97;

    vec2 p = uv * 2.0 - 1.0;
    p.x *= iResolution.x / iResolution.y;
    vec2 orbit = vec2(cos(iTime * 1.3), sin(iTime * 1.7)) * 0.55;
    float blob = smoothstep(0.12, 0.0, length(p - orbit));

    vec3 tint = 0.5 + 0.5 * cos(iTime + vec3(0.0, 2.0, 4.0));
    fragColor = vec4(max(prev.rgb, blob * tint), 1.0);
}
`;
}

/* ── WebGL setup ─────────────────────────────────────────── */
const canvas = document.getElementById('glcanvas') as HTMLCanvasElement;
const glOrNull = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });

if (!glOrNull) {
  (document.getElementById('mode-display') as HTMLElement).textContent = 'WebGL2 not supported';
  throw new Error('WebGL2 not supported');
}

// Rebind so every closure sees the narrowed non-null type.
const gl: WebGL2RenderingContext = glOrNull;

const CUBE_FACES = [
  { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, label: '+X' },
  { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, label: '-X' },
  { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, label: '+Y' },
  { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, label: '-Y' },
  { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, label: '+Z' },
  { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, label: '-Z' },
] as const;

const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG_STATIC_PREFIX = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp samplerCube;

uniform float iTime;
uniform float iTimeDelta;
uniform int   iFrame;
uniform vec2  iResolution;
uniform vec4  iMouse;
uniform vec4  iDate;
uniform vec3  iChannelResolution[4];
`;

function fragPrefix(channels: Channel[]): string {
  const decls = channels
    .map((c, i) => `uniform ${c.kind === 'cube' ? 'samplerCube' : 'sampler2D'} iChannel${i};`)
    .join('\n');
  return FRAG_STATIC_PREFIX + decls + '\nout vec4 _fragOut;\n';
}

const FRAG_SUFFIX = `
void main() { mainImage(_fragOut, gl_FragCoord.xy); }
`;

let quadBuf: WebGLBuffer | null = null;
let vao: WebGLVertexArrayObject | null = null;

function initQuad(): void {
  const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
  quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
}

function compileShader(src: string, type: number): { sh: WebGLShader | null; log: string | null } {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    return { sh: null, log };
  }
  return { sh, log: null };
}

function linkProgram(vs: WebGLShader, fs: WebGLShader): { prog: WebGLProgram | null; log: string | null } {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'a_pos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    return { prog: null, log };
  }
  return { prog, log: null };
}

/* Map shader error line numbers (offset by prefix line count) */
function adjustErrors(log: string, prefix: string): string {
  const prefixLines = prefix.split('\n').length - 1;
  return log.replace(/(\d+):(\d+)/g, (_m, col: string, line: string) => {
    const adjusted = parseInt(line, 10) - prefixLines;
    return `${col}:${adjusted > 0 ? adjusted : line}`;
  });
}

function buildProgram(userCode: string, channels: Channel[]): { prog: WebGLProgram | null; log: string | null } {
  const prefix = fragPrefix(channels);
  const fragSrc = prefix + '\n' + userCode + FRAG_SUFFIX;

  const { sh: vs, log: vsLog } = compileShader(VERT_SRC, gl.VERTEX_SHADER);
  if (!vs) return { prog: null, log: 'Vertex shader error:\n' + vsLog };

  const { sh: fs, log: fsLog } = compileShader(fragSrc, gl.FRAGMENT_SHADER);
  if (!fs) {
    gl.deleteShader(vs);
    return { prog: null, log: adjustErrors(fsLog ?? '', prefix) };
  }

  const { prog, log: linkLog } = linkProgram(vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!prog) return { prog: null, log: linkLog };

  return { prog, log: null };
}

/* ── Uniform locations cache ─────────────────────────────── */
type Uniforms = Record<string, WebGLUniformLocation | null>;

function cacheUniforms(prog: WebGLProgram): Uniforms {
  const names = ['iTime','iTimeDelta','iFrame','iResolution','iMouse','iDate',
                  'iChannelResolution',
                  'iChannel0','iChannel1','iChannel2','iChannel3'];
  const u: Uniforms = {};
  names.forEach(n => { u[n] = gl.getUniformLocation(prog, n); });
  return u;
}

/* ── Passes and channels ─────────────────────────────────── */
const NUM_SLOTS = 4;
const NUM_BUFFERS = 4;
const BUFFER_NAMES = ['A', 'B', 'C', 'D'] as const;

/** What an iChannel of a given pass is wired to. */
interface Channel {
  kind: '2d' | 'cube' | 'buffer';
  buf: number;                            // source buffer index when kind === 'buffer'
  tex: WebGLTexture | null;               // uploaded 2D image
  imgUrl: string | null;                  // thumbnail for the slot
  texW: number;                           // source size, for iChannelResolution
  texH: number;
  cubeTex: WebGLTexture | null;
  cubeFaceUrls: Array<string | null>;
  cubeFaceLoaded: boolean[];
}

function makeChannel(): Channel {
  return {
    kind: '2d', buf: 0, tex: null, imgUrl: null, texW: 0, texH: 0, cubeTex: null,
    cubeFaceUrls: Array(6).fill(null), cubeFaceLoaded: Array(6).fill(false),
  };
}

function channelDescription(c: Channel): string {
  if (c.kind === 'buffer') return `Buffer ${BUFFER_NAMES[c.buf]}`;
  if (c.kind === 'cube')   return c.cubeFaceLoaded.some(Boolean) ? 'cubemap' : 'cubemap (empty)';
  return c.tex ? '2D texture' : '2D texture (empty)';
}

/**
 * A render pass. `target` is null for the Image pass, which draws to the
 * canvas; buffer passes draw into their own ping-ponged framebuffer.
 */
interface Pass {
  id: string;                 // 'image' | 'bufA'..'bufD'
  name: string;               // tab label
  bufIndex: number;           // -1 for Image, else 0..3
  enabled: boolean;
  code: string;               // authoritative doc when this pass is not in the editor
  state: EditorState | null;  // preserved editor state (incl. undo history)
  program: WebGLProgram | null;
  uniforms: Uniforms;
  channels: Channel[];
  error: string | null;
}

function makePass(id: string, name: string, bufIndex: number, code: string): Pass {
  return {
    id, name, bufIndex, enabled: bufIndex < 0, code, state: null,
    program: null, uniforms: {},
    channels: Array.from({ length: NUM_SLOTS }, makeChannel),
    error: null,
  };
}

const imagePass = makePass('image', 'Image', -1, DEFAULT_SHADER);
const bufferPasses = BUFFER_NAMES.map((n, i) =>
  makePass(`buf${n}`, `Buf ${n}`, i, defaultBufferShader(n)));

/** Buffers run first, in order, then Image. */
const passes: Pass[] = [...bufferPasses, imagePass];

function activeBufferPasses(): Pass[] { return bufferPasses.filter(p => p.enabled); }
function livePasses(): Pass[] { return [...activeBufferPasses(), imagePass]; }

/* ── Buffer render targets ───────────────────────────────── */
// Rendering to half-float needs an extension; fall back to 8-bit if absent.
const floatRT = gl.getExtension('EXT_color_buffer_float');
const RT_INTERNAL = floatRT ? gl.RGBA16F : gl.RGBA8;
const RT_TYPE     = floatRT ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

interface RenderTarget {
  fbo: WebGLFramebuffer;
  read: WebGLTexture;    // last completed frame — what shaders sample
  write: WebGLTexture;   // currently being drawn into
  w: number;
  h: number;
}

const targets: Array<RenderTarget | null> = Array(NUM_BUFFERS).fill(null);

function makeRTTexture(w: number, h: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, RT_INTERNAL, w, h, 0, gl.RGBA, RT_TYPE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

function ensureTarget(i: number, w: number, h: number): RenderTarget {
  const existing = targets[i];
  if (existing && existing.w === w && existing.h === h) return existing;
  if (existing) {
    gl.deleteTexture(existing.read);
    gl.deleteTexture(existing.write);
    gl.deleteFramebuffer(existing.fbo);
  }
  const t: RenderTarget = {
    fbo: gl.createFramebuffer()!,
    read: makeRTTexture(w, h),
    write: makeRTTexture(w, h),
    w, h,
  };
  targets[i] = t;
  return t;
}

function disposeTarget(i: number): void {
  const t = targets[i];
  if (!t) return;
  gl.deleteTexture(t.read);
  gl.deleteTexture(t.write);
  gl.deleteFramebuffer(t.fbo);
  targets[i] = null;
}

/** Wipe buffer contents to black — feedback shaders need this on reset. */
function clearTargets(): void {
  const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  for (const t of targets) {
    if (!t) continue;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    for (const tex of [t.read, t.write]) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
}

/* ── Textures ────────────────────────────────────────────── */
const WHITE_TEX = gl.createTexture()!;
gl.bindTexture(gl.TEXTURE_2D, WHITE_TEX);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));

const BLACK_CUBE_TEX = gl.createTexture()!;
gl.bindTexture(gl.TEXTURE_CUBE_MAP, BLACK_CUBE_TEX);
for (const { target } of CUBE_FACES) {
  gl.texImage2D(target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
}
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

function uploadTexture(ch: Channel, img: HTMLImageElement): void {
  if (!ch.tex) ch.tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, ch.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_2D, null);
  ch.texW = img.naturalWidth;
  ch.texH = img.naturalHeight;
}

function uploadCubeFace(ch: Channel, faceIdx: number, img: HTMLImageElement): void {
  if (!ch.cubeTex) {
    ch.cubeTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, ch.cubeTex);
    for (const { target } of CUBE_FACES) {
      gl.texImage2D(target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
    }
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  } else {
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, ch.cubeTex);
  }
  gl.texImage2D(CUBE_FACES[faceIdx].target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  ch.cubeFaceLoaded[faceIdx] = true;
}

/* ── Themes ──────────────────────────────────────────────── */
interface Theme {
  id: string;
  name: string;
  dark: boolean;
  ui: {
    bg0: string; bg1: string; bg2: string; bg3: string; border: string;
    accent: string; accent2: string; err: string; warn: string; ok: string;
    text: string; textDim: string; preview: string; hl: string; sel: string;
  };
  syn: {
    keyword: string; type: string; builtin: string; variable: string; comment: string;
    number: string; string: string; operator: string; meta: string; atom: string; bracket: string;
  };
}

const THEMES: Theme[] = [
  {
    id: 'midnight', name: 'Midnight', dark: true,
    ui: {
      bg0: '#0d0f14', bg1: '#13161e', bg2: '#1a1e28', bg3: '#222736', border: '#2a2f3d',
      accent: '#5c8af7', accent2: '#7c5cf7', err: '#e06c75', warn: '#e5c07b', ok: '#98c379',
      text: '#abb2bf', textDim: '#5c6370', preview: '#000000',
      hl: 'rgba(255,255,255,0.03)', sel: 'rgba(92,138,247,0.22)',
    },
    syn: {
      keyword: '#c678dd', type: '#e5c07b', builtin: '#56b6c2', variable: '#abb2bf',
      comment: '#5c6370', number: '#d19a66', string: '#98c379', operator: '#abb2bf',
      meta: '#5c6370', atom: '#d19a66', bracket: '#abb2bf',
    },
  },
  {
    id: 'dracula', name: 'Dracula', dark: true,
    ui: {
      bg0: '#21222c', bg1: '#282a36', bg2: '#343746', bg3: '#3d4152', border: '#44475a',
      accent: '#bd93f9', accent2: '#ff79c6', err: '#ff5555', warn: '#f1fa8c', ok: '#50fa7b',
      text: '#f8f8f2', textDim: '#6272a4', preview: '#191a21',
      hl: 'rgba(255,255,255,0.05)', sel: 'rgba(189,147,249,0.28)',
    },
    syn: {
      keyword: '#ff79c6', type: '#8be9fd', builtin: '#50fa7b', variable: '#f8f8f2',
      comment: '#6272a4', number: '#bd93f9', string: '#f1fa8c', operator: '#ff79c6',
      meta: '#6272a4', atom: '#bd93f9', bracket: '#f8f8f2',
    },
  },
  {
    id: 'nord', name: 'Nord', dark: true,
    ui: {
      bg0: '#2e3440', bg1: '#333a47', bg2: '#3b4252', bg3: '#434c5e', border: '#4c566a',
      accent: '#88c0d0', accent2: '#b48ead', err: '#bf616a', warn: '#ebcb8b', ok: '#a3be8c',
      text: '#d8dee9', textDim: '#7b88a1', preview: '#242933',
      hl: 'rgba(255,255,255,0.04)', sel: 'rgba(136,192,208,0.25)',
    },
    syn: {
      keyword: '#81a1c1', type: '#8fbcbb', builtin: '#88c0d0', variable: '#d8dee9',
      comment: '#616e88', number: '#b48ead', string: '#a3be8c', operator: '#81a1c1',
      meta: '#616e88', atom: '#b48ead', bracket: '#d8dee9',
    },
  },
  {
    id: 'gruvbox', name: 'Gruvbox', dark: true,
    ui: {
      bg0: '#1d2021', bg1: '#282828', bg2: '#32302f', bg3: '#3c3836', border: '#504945',
      accent: '#83a598', accent2: '#d3869b', err: '#fb4934', warn: '#fabd2f', ok: '#b8bb26',
      text: '#ebdbb2', textDim: '#928374', preview: '#1b1b1b',
      hl: 'rgba(255,255,255,0.04)', sel: 'rgba(131,165,152,0.28)',
    },
    syn: {
      keyword: '#fb4934', type: '#fabd2f', builtin: '#8ec07c', variable: '#ebdbb2',
      comment: '#928374', number: '#d3869b', string: '#b8bb26', operator: '#fe8019',
      meta: '#928374', atom: '#d3869b', bracket: '#ebdbb2',
    },
  },
  {
    id: 'monokai', name: 'Monokai', dark: true,
    ui: {
      bg0: '#1e1f1c', bg1: '#272822', bg2: '#2f302a', bg3: '#3e3d32', border: '#49483e',
      accent: '#66d9ef', accent2: '#ae81ff', err: '#f92672', warn: '#e6db74', ok: '#a6e22e',
      text: '#f8f8f2', textDim: '#75715e', preview: '#131410',
      hl: 'rgba(255,255,255,0.05)', sel: 'rgba(102,217,239,0.22)',
    },
    syn: {
      keyword: '#f92672', type: '#66d9ef', builtin: '#a6e22e', variable: '#f8f8f2',
      comment: '#75715e', number: '#ae81ff', string: '#e6db74', operator: '#f92672',
      meta: '#75715e', atom: '#ae81ff', bracket: '#f8f8f2',
    },
  },
  {
    id: 'solarized-light', name: 'Solarized', dark: false,
    ui: {
      bg0: '#fdf6e3', bg1: '#f5eeda', bg2: '#eee8d5', bg3: '#e4ddc8', border: '#d6cfb8',
      accent: '#268bd2', accent2: '#6c71c4', err: '#dc322f', warn: '#b58900', ok: '#859900',
      text: '#586e75', textDim: '#93a1a1', preview: '#eee8d5',
      hl: 'rgba(0,0,0,0.05)', sel: 'rgba(38,139,210,0.22)',
    },
    syn: {
      keyword: '#859900', type: '#b58900', builtin: '#268bd2', variable: '#586e75',
      comment: '#93a1a1', number: '#d33682', string: '#2aa198', operator: '#859900',
      meta: '#93a1a1', atom: '#cb4b16', bracket: '#586e75',
    },
  },
  {
    id: 'paper', name: 'Paper', dark: false,
    ui: {
      bg0: '#ffffff', bg1: '#f6f8fa', bg2: '#eaeef2', bg3: '#dfe3e8', border: '#d0d7de',
      accent: '#0969da', accent2: '#8250df', err: '#cf222e', warn: '#9a6700', ok: '#1a7f37',
      text: '#1f2328', textDim: '#656d76', preview: '#f6f8fa',
      hl: 'rgba(0,0,0,0.04)', sel: 'rgba(9,105,218,0.18)',
    },
    syn: {
      keyword: '#cf222e', type: '#953800', builtin: '#8250df', variable: '#1f2328',
      comment: '#6e7781', number: '#0550ae', string: '#0a3069', operator: '#cf222e',
      meta: '#6e7781', atom: '#0550ae', bracket: '#1f2328',
    },
  },
];

const THEME_BY_ID = new Map(THEMES.map(t => [t.id, t]));

/* ── Settings ────────────────────────────────────────────── */
// Vim needs a physical Esc key — default it off on touch-primary devices.
const hasFinePointer = window.matchMedia('(pointer: fine)').matches;

interface Settings {
  theme: string;
  resScale: number;   // framebuffer multiplier
  swapped: boolean;   // preview pane first
  vimMode: boolean;
}

// 0 would give a degenerate framebuffer, so the low end stops just above it.
const RES_MIN = 0.01;
const RES_MAX = 1;

function clampRes(v: number): number {
  return Math.min(Math.max(v, RES_MIN), RES_MAX);
}

const SETTINGS_KEY = 'shaderEditor.settings';

function defaultSettings(): Settings {
  return { theme: 'midnight', resScale: 1, swapped: false, vimMode: hasFinePointer };
}

function loadSettings(): Settings {
  const s = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return s;
    const p = JSON.parse(raw) as Partial<Settings>;
    if (typeof p.theme === 'string' && THEME_BY_ID.has(p.theme)) s.theme = p.theme;
    if (typeof p.resScale === 'number' && isFinite(p.resScale)) s.resScale = clampRes(p.resScale);
    if (typeof p.swapped === 'boolean') s.swapped = p.swapped;
    if (typeof p.vimMode === 'boolean') s.vimMode = p.vimMode;
  } catch {
    /* corrupt or unavailable storage — fall back to defaults */
  }
  return s;
}

function saveSettings(): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

const settings: Settings = loadSettings();

/* ── Resize ──────────────────────────────────────────────── */
const resDisplay = document.getElementById('res-display') as HTMLElement;

function resizeCanvas(): void {
  const scale = settings.resScale * devicePixelRatio;
  const w = Math.max(1, canvas.clientWidth  * scale | 0);
  const h = Math.max(1, canvas.clientHeight * scale | 0);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    const suffix = settings.resScale === 1 ? '' : ` @ ${Math.round(settings.resScale * 100)}%`;
    resDisplay.textContent = `${w} × ${h}${suffix}`;
  }
}

/* ── State ───────────────────────────────────────────────── */
let iTime = 0, iTimeDelta = 0, iFrame = 0;
let lastTimestamp: number | null = null;
let paused = false;
let rafRunning = false;
let startTime = 0;
let iMouse: [number, number, number, number] = [0, 0, 0, 0];
let autoCompile = true;
let compileOk = false;
let compileTimer: ReturnType<typeof setTimeout> | null = null;

const errLog  = document.getElementById('error-log') as HTMLElement;
const status  = document.getElementById('compile-status') as HTMLElement;
const overlay = document.getElementById('overlay-error') as HTMLElement;
const uTime   = document.getElementById('u-time') as HTMLElement;
const uFrame  = document.getElementById('u-frame') as HTMLElement;
const uMouse  = document.getElementById('u-mouse') as HTMLElement;
const fpsDisp = document.getElementById('fps-display') as HTMLElement;

let fpsAccum = 0, fpsFrames = 0, fpsLast = 0;

function setError(msg: string): void {
  errLog.textContent = msg;
  errLog.className = msg ? 'has-errors' : '';
  status.textContent = msg ? 'ERR' : 'OK';
  status.className = msg ? 'pill err' : 'pill ok';
  overlay.textContent = msg ? 'Shader compile error — see editor' : '';
  overlay.className = msg ? 'visible' : '';
}

/** Compile every live pass. A pass that fails keeps its last good program. */
function tryCompile(): void {
  syncActivePassCode();
  const live = livePasses();
  const errors: string[] = [];

  for (const p of live) {
    const { prog, log } = buildProgram(p.code, p.channels);
    if (!prog) {
      p.error = log ?? '';
      errors.push(live.length > 1 ? `${p.name}:\n${p.error}` : p.error);
      continue;
    }
    p.error = null;
    if (p.program) gl.deleteProgram(p.program);
    p.program = prog;
    p.uniforms = cacheUniforms(prog);
  }

  setError(errors.join('\n\n'));
  compileOk = errors.length === 0;
  updatePassTabs();
  scheduleRender();
}

/* ── Render loop ─────────────────────────────────────────── */
function scheduleRender(): void {
  if (!rafRunning) {
    rafRunning = true;
    requestAnimationFrame(render);
  }
}

function render(ts: DOMHighResTimeStamp): void {
  rafRunning = false;
  if (!paused) {
    rafRunning = true;
    requestAnimationFrame(render);
  }

  if (!paused) {
    if (lastTimestamp === null) {
      lastTimestamp = ts;
      startTime = ts - iTime * 1000;
    }
    iTimeDelta = (ts - lastTimestamp) / 1000;
    lastTimestamp = ts;
    iTime = (ts - startTime) / 1000;
    iFrame++;
  }

  fpsAccum += iTimeDelta;
  fpsFrames++;
  if (ts - fpsLast > 500) {
    fpsDisp.textContent = fpsFrames > 0 && fpsAccum > 0
      ? `${(fpsFrames / fpsAccum).toFixed(0)} fps` : '0 fps';
    fpsAccum = 0; fpsFrames = 0; fpsLast = ts;
  }

  resizeCanvas();
  const W = canvas.width, H = canvas.height;

  if (!compileOk) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.05, 0.05, 0.07, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    uTime.textContent = iTime.toFixed(3);
    uFrame.textContent = String(iFrame);
    return;
  }

  // Buffers first, in order, each into its own target; then Image to screen.
  for (const p of activeBufferPasses()) {
    if (!p.program) continue;
    const t = ensureTarget(p.bufIndex, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.write, 0);
    gl.viewport(0, 0, W, H);
    drawPass(p, W, H);
    // Swap so later passes (and the next frame) sample what we just drew.
    const prev = t.read;
    t.read = t.write;
    t.write = prev;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  if (imagePass.program) drawPass(imagePass, W, H);

  uTime.textContent  = iTime.toFixed(3);
  uFrame.textContent = String(iFrame);
}

const channelRes = new Float32Array(NUM_SLOTS * 3);

function drawPass(p: Pass, w: number, h: number): void {
  const u = p.uniforms;
  gl.useProgram(p.program);

  if (u.iTime       != null) gl.uniform1f(u.iTime, iTime);
  if (u.iTimeDelta  != null) gl.uniform1f(u.iTimeDelta, iTimeDelta);
  if (u.iFrame      != null) gl.uniform1i(u.iFrame, iFrame);
  if (u.iResolution != null) gl.uniform2f(u.iResolution, w, h);
  if (u.iMouse      != null) gl.uniform4fv(u.iMouse, iMouse);

  const now = new Date();
  if (u.iDate != null) gl.uniform4f(u.iDate,
    now.getFullYear(), now.getMonth(), now.getDate(),
    now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds() + now.getMilliseconds()/1000);

  for (let i = 0; i < NUM_SLOTS; i++) {
    const c = p.channels[i];
    let cw = 0, chh = 0;
    gl.activeTexture(gl.TEXTURE0 + i);
    if (c.kind === 'cube') {
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, c.cubeTex ?? BLACK_CUBE_TEX);
      cw = c.texW; chh = c.texH;
    } else if (c.kind === 'buffer') {
      // A buffer sampling itself sees the previous frame, which is the point.
      const t = targets[c.buf];
      gl.bindTexture(gl.TEXTURE_2D, t ? t.read : WHITE_TEX);
      if (t) { cw = t.w; chh = t.h; }
    } else {
      gl.bindTexture(gl.TEXTURE_2D, c.tex ?? WHITE_TEX);
      cw = c.texW; chh = c.texH;
    }
    const loc = u[`iChannel${i}`];
    if (loc != null) gl.uniform1i(loc, i);
    channelRes[i * 3] = cw;
    channelRes[i * 3 + 1] = chh;
    channelRes[i * 3 + 2] = 1;
  }
  if (u.iChannelResolution != null) gl.uniform3fv(u.iChannelResolution, channelRes);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

/* ── Pointer tracking (mouse + touch) ────────────────────── */
let pointerDown = false;

function canvasCoords(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (canvas.width  / r.width);
  const y = canvas.height - (e.clientY - r.top) * (canvas.height / r.height);
  return [x, y];
}

canvas.addEventListener('pointermove', (e: PointerEvent) => {
  const [x, y] = canvasCoords(e);
  iMouse[0] = x; iMouse[1] = y;
  if (pointerDown) { iMouse[2] = x; iMouse[3] = y; }
  uMouse.textContent = `${x.toFixed(0)}, ${y.toFixed(0)}`;
});
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  const [x, y] = canvasCoords(e);
  pointerDown = true;
  iMouse[0] = x; iMouse[1] = y;
  iMouse[2] = x; iMouse[3] = y;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup',     () => { pointerDown = false; });
canvas.addEventListener('pointercancel', () => { pointerDown = false; });
canvas.addEventListener('pointerleave',  () => { pointerDown = false; });

/* ── GLSL language definition ────────────────────────────── */
const GLSL_KEYWORDS = new Set([
  'break','continue','do','for','while','if','else','return','discard',
  'switch','case','default',
]);
const GLSL_QUALIFIERS = new Set([
  'attribute','const','uniform','varying','in','out','inout','centroid',
  'flat','smooth','lowp','mediump','highp','precision','invariant',
  'layout','struct',
]);
const GLSL_TYPES = new Set([
  'float','int','uint','void','bool',
  'vec2','vec3','vec4','ivec2','ivec3','ivec4','bvec2','bvec3','bvec4','uvec2','uvec3','uvec4',
  'mat2','mat3','mat4',
  'mat2x2','mat2x3','mat2x4','mat3x2','mat3x3','mat3x4','mat4x2','mat4x3','mat4x4',
  'sampler2D','sampler3D','samplerCube','sampler2DShadow','samplerCubeShadow',
  'sampler2DArray','sampler2DArrayShadow',
  'isampler2D','isampler3D','isamplerCube','isampler2DArray',
  'usampler2D','usampler3D','usamplerCube','usampler2DArray',
]);
const GLSL_BUILTINS = new Set([
  'radians','degrees','sin','cos','tan','asin','acos','atan','sinh','cosh','tanh',
  'asinh','acosh','atanh','pow','exp','log','exp2','log2','sqrt','inversesqrt',
  'abs','sign','floor','trunc','round','roundEven','ceil','fract','mod','modf',
  'min','max','clamp','mix','step','smoothstep','isnan','isinf',
  'floatBitsToInt','floatBitsToUint','intBitsToFloat','uintBitsToFloat',
  'packSnorm2x16','unpackSnorm2x16','packUnorm2x16','unpackUnorm2x16',
  'packHalf2x16','unpackHalf2x16',
  'length','distance','dot','cross','normalize','faceforward','reflect','refract',
  'matrixCompMult','outerProduct','transpose','determinant','inverse',
  'lessThan','lessThanEqual','greaterThan','greaterThanEqual','equal','notEqual',
  'any','all','not',
  'textureSize','texture','textureProj','textureLod','textureOffset',
  'texelFetch','texelFetchOffset','textureProjOffset','textureLodOffset',
  'textureProjLod','textureProjLodOffset','textureGrad','textureGradOffset',
  'textureProjGrad','textureProjGradOffset','dFdx','dFdy','fwidth',
  'emit','endPrimitive',
  'gl_Position','gl_PointSize','gl_FragCoord','gl_FrontFacing',
  'gl_FragDepth','gl_PointCoord','gl_VertexID','gl_InstanceID',
  'iTime','iTimeDelta','iFrame','iResolution','iMouse','iDate',
  'iChannelResolution',
  'iChannel0','iChannel1','iChannel2','iChannel3','mainImage',
]);
const GLSL_ATOMS = new Set(['true','false']);

interface GlslState { blockComment: boolean; }

const glslParser = {
  startState: (): GlslState => ({ blockComment: false }),
  token(stream: StringStream, state: GlslState): string | null {
    if (state.blockComment) {
      if (stream.match(/^.*?\*\//)) state.blockComment = false;
      else stream.skipToEnd();
      return 'comment';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('/*')) { state.blockComment = true; return 'comment'; }
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/^#\s*\w+/)) { stream.skipToEnd(); return 'meta'; }
    if (stream.match(/^0[xX][0-9a-fA-F]+[uU]?/)) return 'number';
    if (stream.match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFuU]?/)) return 'number';
    if (stream.match(/^"[^"]*"/)) return 'string';
    if (stream.match(/^[+\-*/%=<>!&|^~?:]+/)) return 'operator';
    if (stream.match(/^[{}[\]();,.]/)) return 'bracket';
    if (stream.match(/^\w+/)) {
      const w = stream.current();
      if (GLSL_KEYWORDS.has(w))   return 'keyword';
      if (GLSL_QUALIFIERS.has(w)) return 'keyword';
      if (GLSL_TYPES.has(w))      return 'type';
      if (GLSL_BUILTINS.has(w))   return 'builtin';
      if (GLSL_ATOMS.has(w))      return 'atom';
      return null;
    }
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
  },
};

const glslLanguage = StreamLanguage.define(glslParser);

const glslCompletions = [
  ...[...GLSL_KEYWORDS, ...GLSL_QUALIFIERS].map(k => ({ label: k, type: 'keyword' })),
  ...[...GLSL_TYPES].map(t => ({ label: t, type: 'type' })),
  ...[...GLSL_BUILTINS].map(b => ({ label: b, type: 'function' })),
];

function glslComplete(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const q = word.text.toLowerCase();
  return {
    from: word.from,
    options: glslCompletions.filter(c => c.label.toLowerCase().startsWith(q)),
    validFor: /^\w*$/,
  };
}

/* ── Syntax highlight style ──────────────────────────────── */
function makeHighlight(t: Theme) {
  const s = t.syn;
  return syntaxHighlighting(HighlightStyle.define([
    { tag: tags.keyword,                          color: s.keyword },
    { tag: tags.typeName,                         color: s.type },
    { tag: [tags.standard(tags.name), tags.name], color: s.builtin },
    { tag: tags.variableName,                     color: s.variable },
    { tag: tags.comment,    color: s.comment, fontStyle: 'italic' },
    { tag: tags.number,                           color: s.number },
    { tag: tags.string,                           color: s.string },
    { tag: tags.operator,                         color: s.operator },
    { tag: tags.meta,                             color: s.meta },
    { tag: tags.atom,                             color: s.atom },
    { tag: tags.bracket,                          color: s.bracket },
    { tag: tags.modifier,                         color: s.keyword },
  ]));
}

function makeEditorTheme(t: Theme) {
  const u = t.ui;
  return EditorView.theme({
    '&': { backgroundColor: u.bg1, color: u.text, height: '100%' },
    '.cm-scroller': { fontFamily: "'SF Mono','Fira Code','Cascadia Code','Consolas',monospace" },
    '.cm-content': { caretColor: u.accent },
    '&.cm-focused .cm-cursor': { borderLeftColor: u.accent },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: u.sel },
    '.cm-panels': { backgroundColor: u.bg0, color: u.text },
    '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${u.border}` },
    '.cm-searchMatch': { backgroundColor: u.sel, outline: `1px solid ${u.accent}` },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: u.sel, outline: `2px solid ${u.accent}` },
    '.cm-tooltip': { backgroundColor: u.bg2, border: `1px solid ${u.border}`, borderRadius: '4px', color: u.text },
    '.cm-tooltip-autocomplete': { '& > ul > li[aria-selected]': { backgroundColor: u.bg3, color: u.text } },
  }, { dark: t.dark });
}

const themeCompartment = new Compartment();
const vimCompartment   = new Compartment();

function themeExtensions(t: Theme) { return [makeHighlight(t), makeEditorTheme(t)]; }
function vimExtension(on: boolean) { return on ? [vim()] : []; }

function makeEditorState(doc: string): EditorState {
  const theme = THEME_BY_ID.get(settings.theme) ?? THEMES[0];
  return EditorState.create({
    doc,
    extensions: [
      vimCompartment.of(vimExtension(settings.vimMode)),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion({ override: [glslComplete] }),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
        { key: 'Ctrl-Enter', run: () => { scheduleCompile(true); return true; } },
      ]),
      glslLanguage,
      themeCompartment.of(themeExtensions(theme)),
      EditorView.updateListener.of(update => {
        if (update.docChanged && autoCompile) scheduleCompile(false);
      }),
      EditorView.lineWrapping,
    ],
  });
}

let editor: EditorView;
let activePass: Pass = imagePass;

/** The editor holds the live document for the active pass only. */
function syncActivePassCode(): void {
  if (editor) activePass.code = editor.state.doc.toString();
}

function scheduleCompile(immediate: boolean): void {
  if (compileTimer) clearTimeout(compileTimer);
  const delay = immediate ? 0 : 600;
  compileTimer = setTimeout(tryCompile, delay);
}

/* ── Toolbar wiring ──────────────────────────────────────── */
const btnCompile     = document.getElementById('btn-compile')     as HTMLButtonElement;
const btnAutocompile = document.getElementById('btn-autocompile') as HTMLButtonElement;
const btnPause       = document.getElementById('btn-pause')       as HTMLButtonElement;
const btnReset       = document.getElementById('btn-reset')       as HTMLButtonElement;
const btnFullscreen  = document.getElementById('btn-fullscreen')  as HTMLButtonElement;
const btnExport      = document.getElementById('btn-export')      as HTMLButtonElement;
const btnRecord      = document.getElementById('btn-record')      as HTMLButtonElement;

btnCompile.addEventListener('click', () => scheduleCompile(true));

btnAutocompile.addEventListener('click', () => {
  autoCompile = !autoCompile;
  btnAutocompile.classList.toggle('active', autoCompile);
  btnAutocompile.textContent = autoCompile ? 'Auto' : 'Manual';
});

btnPause.addEventListener('click', () => {
  paused = !paused;
  if (!paused) {
    lastTimestamp = null;
    scheduleRender();
  }
  btnPause.textContent = paused ? 'Resume' : 'Pause';
  btnPause.classList.toggle('active', paused);
});

btnReset.addEventListener('click', () => {
  iTime = 0; iFrame = 0; iTimeDelta = 0; lastTimestamp = null;
  clearTargets();   // feedback buffers would otherwise survive the reset
  scheduleRender();
});

btnFullscreen.addEventListener('click', () => {
  const pane = document.getElementById('preview-pane')!;
  if (!document.fullscreenElement) {
    pane.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

/* ── Export shader code ──────────────────────────────────── */
btnExport.addEventListener('click', () => {
  syncActivePassCode();
  const live = livePasses();
  const code = live.length === 1
    ? fragPrefix(imagePass.channels) + '\n' + imagePass.code + FRAG_SUFFIX
    : live.map(p => {
        const wiring = p.channels
          .map((c, i) => `//   iChannel${i}: ${channelDescription(c)}`)
          .join('\n');
        return `// ===== ${p.name} =====\n${wiring}\n\n`
          + fragPrefix(p.channels) + '\n' + p.code + FRAG_SUFFIX;
      }).join('\n\n');
  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shader.glsl';
  a.click();
  URL.revokeObjectURL(url);
});

/* ── Video recording ─────────────────────────────────────── */
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recording = false;

function getRecordingMimeType(): string {
  const types = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

btnRecord.addEventListener('click', () => {
  if (!recording) {
    const stream = canvas.captureStream(30);
    const mimeType = getRecordingMimeType();
    try {
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : {});
    } catch {
      mediaRecorder = new MediaRecorder(stream);
    }
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const type = mediaRecorder!.mimeType;
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(recordedChunks, { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shader_${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    };
    mediaRecorder.start();
    recording = true;
    btnRecord.textContent = '⏹ Stop';
    btnRecord.classList.add('recording');
  } else {
    mediaRecorder?.stop();
    recording = false;
    btnRecord.innerHTML = '<svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="4.5"/></svg> Record';
    btnRecord.classList.remove('recording');
  }
});

/* ── Pass tabs ───────────────────────────────────────────── */
const passTabs = document.getElementById('pass-tabs') as HTMLElement;

function updatePassTabs(): void {
  passTabs.innerHTML = '';

  // Image first (Shadertoy's ordering) even though buffers execute before it.
  for (const p of [imagePass, ...activeBufferPasses()]) {
    const tab = document.createElement('div');
    tab.className = 'pass-tab'
      + (p === activePass ? ' active' : '')
      + (p.error ? ' has-error' : '');
    tab.title = p.bufIndex < 0
      ? 'Image pass — drawn to the canvas, runs last'
      : `Buffer ${BUFFER_NAMES[p.bufIndex]} — offscreen target, runs before Image`;

    const label = document.createElement('span');
    label.textContent = p.name;
    tab.appendChild(label);
    tab.addEventListener('click', () => switchPass(p));

    if (p.bufIndex >= 0) {
      const close = document.createElement('button');
      close.className = 'pass-close';
      close.textContent = '✕';
      close.title = `Remove ${p.name}`;
      close.addEventListener('click', (ev: MouseEvent) => {
        ev.stopPropagation();
        removeBuffer(p.bufIndex);
      });
      tab.appendChild(close);
    }
    passTabs.appendChild(tab);
  }

  const next = bufferPasses.find(p => !p.enabled);
  if (next) {
    const add = document.createElement('button');
    add.className = 'pass-add';
    add.textContent = '+ Buffer';
    add.title = `Add ${next.name}`;
    add.addEventListener('click', () => { enableBuffer(next.bufIndex); switchPass(next); });
    passTabs.appendChild(add);
  }
}

function enableBuffer(i: number): void {
  const p = bufferPasses[i];
  if (p.enabled) return;
  p.enabled = true;
  updatePassTabs();
  rebuildChannelStrip();   // slots pointing here stop reading as "not created"
  scheduleCompile(true);
}

/** Keeps the buffer's code and undo history so re-adding it restores them. */
function removeBuffer(i: number): void {
  const p = bufferPasses[i];
  if (!p.enabled) return;
  p.enabled = false;
  if (p.program) { gl.deleteProgram(p.program); p.program = null; }
  p.error = null;
  disposeTarget(i);
  if (activePass === p) switchPass(imagePass);
  updatePassTabs();
  rebuildChannelStrip();   // channels still wired here now sample black
  scheduleCompile(true);
}

function switchPass(p: Pass): void {
  if (p === activePass) return;
  activePass.code  = editor.state.doc.toString();
  activePass.state = editor.state;

  activePass = p;
  if (!p.state) p.state = makeEditorState(p.code);
  editor.setState(p.state);
  // Saved states carry whatever theme/vim config was live when they were made.
  editor.dispatch({
    effects: [
      themeCompartment.reconfigure(themeExtensions(THEME_BY_ID.get(settings.theme) ?? THEMES[0])),
      vimCompartment.reconfigure(vimExtension(settings.vimMode)),
    ],
  });

  updatePassTabs();
  rebuildChannelStrip();
  editor.focus();
}

/* ── Channel slots UI ────────────────────────────────────── */
const strip      = document.getElementById('texture-strip') as HTMLElement;
const stripLabel = document.getElementById('strip-label')   as HTMLElement;
const fileInput  = document.getElementById('file-input')    as HTMLInputElement;

// Which pass/slot a pending file dialog belongs to — the active pass can
// change while the picker is open.
let uploadTarget: { pass: Pass; slot: number } = { pass: imagePass, slot: 0 };

/* ── Context menu ────────────────────────────────────────── */
const ctxMenu = document.createElement('div');
ctxMenu.id = 'ctx-menu';
ctxMenu.innerHTML = `
  <div class="ctx-item" id="ctx-2d">2D Texture</div>
  <div class="ctx-item" id="ctx-cube">Cubemap</div>
  <div class="ctx-sep"></div>
  ${BUFFER_NAMES.map((n, i) => `<div class="ctx-item ctx-buf" data-buf="${i}">Buffer ${n}</div>`).join('\n  ')}
  <div class="ctx-sep"></div>
  <div class="ctx-item ctx-danger" id="ctx-clear">Clear</div>
`;
document.body.appendChild(ctxMenu);

let ctxSlot = 0;

function showCtxMenu(x: number, y: number, slot: number): void {
  ctxSlot = slot;
  const ch = activePass.channels[slot];
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  ctxMenu.classList.add('open');

  (document.getElementById('ctx-2d') as HTMLElement).classList.toggle('ctx-active', ch.kind === '2d');
  (document.getElementById('ctx-cube') as HTMLElement).classList.toggle('ctx-active', ch.kind === 'cube');
  ctxMenu.querySelectorAll<HTMLElement>('.ctx-buf').forEach(el => {
    const b = Number(el.dataset.buf);
    el.classList.toggle('ctx-active', ch.kind === 'buffer' && ch.buf === b);
    // Picking a buffer that doesn't exist yet creates it.
    el.textContent = `Buffer ${BUFFER_NAMES[b]}${bufferPasses[b].enabled ? '' : ' (create)'}`;
  });

  // The menu is tall enough to run off-screen from a slot near the bottom.
  const r = ctxMenu.getBoundingClientRect();
  if (y + r.height > window.innerHeight) ctxMenu.style.top  = Math.max(4, y - r.height) + 'px';
  if (x + r.width  > window.innerWidth)  ctxMenu.style.left = Math.max(4, x - r.width) + 'px';
}

function hideCtxMenu(): void { ctxMenu.classList.remove('open'); }

document.addEventListener('click', hideCtxMenu);
document.addEventListener('contextmenu', (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('.tex-slot')) hideCtxMenu();
});

// Sampler type is baked into the shader prefix, so any change recompiles.
function setChannelKind(slot: number, kind: '2d' | 'cube'): void {
  activePass.channels[slot].kind = kind;
  refreshSlot(slot);
  scheduleCompile(true);
}

function setChannelBuffer(slot: number, buf: number): void {
  const ch = activePass.channels[slot];
  ch.kind = 'buffer';
  ch.buf  = buf;
  if (!bufferPasses[buf].enabled) enableBuffer(buf);
  refreshSlot(slot);
  scheduleCompile(true);
}

function clearSlot(slot: number): void {
  const ch = activePass.channels[slot];
  if (ch.tex)     { gl.deleteTexture(ch.tex);     ch.tex = null; }
  if (ch.cubeTex) { gl.deleteTexture(ch.cubeTex); ch.cubeTex = null; }
  ch.cubeFaceUrls.fill(null);
  ch.cubeFaceLoaded.fill(false);
  ch.imgUrl = null;
  ch.texW = 0;
  ch.texH = 0;
  ch.kind = '2d';
  refreshSlot(slot);
  scheduleCompile(true);
}

document.getElementById('ctx-2d')!.addEventListener('click', (e: MouseEvent) => {
  e.stopPropagation();
  setChannelKind(ctxSlot, '2d');
  hideCtxMenu();
});
document.getElementById('ctx-cube')!.addEventListener('click', (e: MouseEvent) => {
  e.stopPropagation();
  setChannelKind(ctxSlot, 'cube');
  openCubeModal(ctxSlot);
  hideCtxMenu();
});
ctxMenu.querySelectorAll<HTMLElement>('.ctx-buf').forEach(el => {
  el.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    setChannelBuffer(ctxSlot, Number(el.dataset.buf));
    hideCtxMenu();
  });
});
document.getElementById('ctx-clear')!.addEventListener('click', (e: MouseEvent) => {
  e.stopPropagation();
  clearSlot(ctxSlot);
  hideCtxMenu();
});

/* ── Cube modal ──────────────────────────────────────────── */
const cubeModal = document.createElement('div');
cubeModal.id = 'cube-modal';
cubeModal.innerHTML = `
  <div class="cube-modal-inner">
    <div class="cube-modal-header">
      <span id="cube-modal-title">Cubemap — ch0</span>
      <button id="cube-modal-close">✕</button>
    </div>
    <p class="cube-modal-hint">Sample in shader: <code>texture(iChannel0, normalize(dir))</code></p>
    <div id="cube-face-grid"></div>
  </div>
`;
document.body.appendChild(cubeModal);

const cubeFaceGrid  = document.getElementById('cube-face-grid')!;
const cubeTitleEl   = document.getElementById('cube-modal-title')!;
const cubeFaceInput = document.createElement('input');
cubeFaceInput.type   = 'file';
cubeFaceInput.accept = 'image/*';
cubeFaceInput.style.display = 'none';
document.body.appendChild(cubeFaceInput);

let cubeModalSlot     = 0;
let cubeModalPass     = imagePass;
let activeCubeFaceIdx = 0;

function openCubeModal(slot: number): void {
  cubeModalSlot = slot;
  cubeModalPass = activePass;
  const ch = activePass.channels[slot];
  cubeTitleEl.textContent = `Cubemap — ${activePass.name} ch${slot}`;
  cubeFaceGrid.innerHTML = '';
  CUBE_FACES.forEach(({ label }, idx) => {
    const faceDiv = document.createElement('div');
    faceDiv.className = 'cube-face-slot';
    faceDiv.id = `cube-face-${idx}`;
    const img = document.createElement('img');
    img.alt = label;
    const url = ch.cubeFaceUrls[idx];
    if (url) { img.src = url; img.classList.add('loaded'); }
    const plusSpan = document.createElement('span');
    plusSpan.className = 'plus';
    plusSpan.textContent = '+';
    if (url) plusSpan.style.display = 'none';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'face-label';
    labelSpan.textContent = label;
    faceDiv.append(img, plusSpan, labelSpan);
    faceDiv.addEventListener('click', () => {
      activeCubeFaceIdx = idx;
      cubeFaceInput.click();
    });
    cubeFaceGrid.appendChild(faceDiv);
  });
  cubeModal.classList.add('open');
}

document.getElementById('cube-modal-close')!.addEventListener('click', () => {
  cubeModal.classList.remove('open');
});
cubeModal.addEventListener('click', (e: MouseEvent) => {
  if (e.target === cubeModal) cubeModal.classList.remove('open');
});

cubeFaceInput.addEventListener('change', (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const ch = cubeModalPass.channels[cubeModalSlot];
  const faceIdx = activeCubeFaceIdx;
  const img = new Image();
  img.onload = () => {
    uploadCubeFace(ch, faceIdx, img);
    ch.cubeFaceUrls[faceIdx] = url;
    const faceEl = document.getElementById(`cube-face-${faceIdx}`);
    if (faceEl && cubeModal.classList.contains('open')) {
      const imgEl = faceEl.querySelector('img') as HTMLImageElement;
      imgEl.src = url;
      imgEl.classList.add('loaded');
      (faceEl.querySelector('.plus') as HTMLElement).style.display = 'none';
    }
    // Show +X face as the slot thumbnail
    if (faceIdx === 0) {
      ch.imgUrl = url;
      if (cubeModalPass === activePass) refreshSlot(cubeModalSlot);
    }
    scheduleRender();
  };
  img.src = url;
  (e.target as HTMLInputElement).value = '';
});

/* ── Slot rendering ──────────────────────────────────────── */
function refreshSlot(i: number): void {
  const ch     = activePass.channels[i];
  const el     = slotEls[i];
  const imgEl  = el.querySelector('img')    as HTMLImageElement;
  const plusEl = el.querySelector('.plus')  as HTMLElement;
  const labelEl= el.querySelector('.label') as HTMLElement;

  el.classList.toggle('cube-mode', ch.kind === 'cube');
  el.classList.toggle('buf-mode',  ch.kind === 'buffer');

  if (ch.kind === 'buffer') {
    const name    = BUFFER_NAMES[ch.buf];
    const missing = !bufferPasses[ch.buf].enabled;
    imgEl.removeAttribute('src');
    imgEl.classList.remove('loaded');
    plusEl.style.display = '';
    plusEl.textContent = name;
    labelEl.textContent = missing ? `${name}?` : `buf${name}`;
    el.title = missing
      ? `iChannel${i} → Buffer ${name} (not created — samples black)`
      : `iChannel${i} → Buffer ${name}`;
    return;
  }

  plusEl.textContent = '+';
  labelEl.textContent = ch.kind === 'cube' ? `cb${i}` : `ch${i}`;
  if (ch.imgUrl) {
    imgEl.src = ch.imgUrl;
    imgEl.classList.add('loaded');
    plusEl.style.display = 'none';
  } else {
    imgEl.removeAttribute('src');
    imgEl.classList.remove('loaded');
    plusEl.style.display = '';
  }
  el.title = ch.kind === 'cube'
    ? `iChannel${i} (samplerCube) — click to upload faces`
    : `iChannel${i} (sampler2D) — click to upload`;
}

function rebuildChannelStrip(): void {
  stripLabel.textContent = `${activePass.name}:`;
  for (let i = 0; i < NUM_SLOTS; i++) refreshSlot(i);
}

const slotEls = Array.from({ length: NUM_SLOTS }, (_, i) => {
  let longPressed = false;
  const div = document.createElement('div');
  div.className = 'tex-slot' + (i === 0 ? ' active' : '');
  div.innerHTML = `<span class="plus">+</span><img alt=""><span class="label">ch${i}</span>`;

  const openMenuAt = (x: number, y: number) => {
    slotEls.forEach((el, j) => el.classList.toggle('active', j === i));
    showCtxMenu(x, y, i);
  };

  div.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    // Ignore the click that follows a long-press (context menu already open)
    if (longPressed) { longPressed = false; return; }
    slotEls.forEach((el, j) => el.classList.toggle('active', j === i));
    const ch = activePass.channels[i];
    if (ch.kind === 'cube') {
      openCubeModal(i);
    } else if (ch.kind === 'buffer') {
      // Nothing to upload — offer the rewire menu instead.
      const r = div.getBoundingClientRect();
      showCtxMenu(r.left, r.bottom, i);
    } else {
      uploadTarget = { pass: activePass, slot: i };
      fileInput.click();
    }
  });

  div.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenuAt(e.clientX, e.clientY);
  });

  // Long-press fallback: iOS Safari never fires contextmenu
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  div.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      openMenuAt(e.clientX, e.clientY);
    }, 500);
  });
  const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  div.addEventListener('pointerup', cancelPress);
  div.addEventListener('pointercancel', cancelPress);
  div.addEventListener('pointermove', cancelPress);

  strip.appendChild(div);
  return div;
});

fileInput.addEventListener('change', (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const { pass, slot } = uploadTarget;
  const ch = pass.channels[slot];
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    uploadTexture(ch, img);
    ch.imgUrl = url;
    if (pass === activePass) refreshSlot(slot);
    scheduleRender();
  };
  img.src = url;
  (e.target as HTMLInputElement).value = '';
});

/* ── Pane resize ─────────────────────────────────────────── */
const divider = document.getElementById('divider')     as HTMLElement;
const editorP = document.getElementById('editor-pane') as HTMLElement;
const main    = document.getElementById('main')        as HTMLElement;

const stackedLayout = window.matchMedia('(max-width: 768px)');

let dragging = false, dragStart = 0, dragStartSize = 0;

divider.addEventListener('pointerdown', (e: PointerEvent) => {
  dragging = true;
  dragStart = stackedLayout.matches ? e.clientY : e.clientX;
  dragStartSize = stackedLayout.matches ? editorP.offsetHeight : editorP.offsetWidth;
  divider.classList.add('dragging');
  document.body.style.cursor = stackedLayout.matches ? 'row-resize' : 'col-resize';
  divider.setPointerCapture(e.pointerId);
  e.preventDefault();
});

divider.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging) return;
  const divW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--divider-w'));
  // When swapped, the editor sits after the divider, so dragging grows it the other way.
  const dir = settings.swapped ? -1 : 1;
  if (stackedLayout.matches) {
    const dy = (e.clientY - dragStart) * dir;
    const totalH = main.offsetHeight;
    const newH = Math.min(Math.max(dragStartSize + dy, 100), totalH - divW - 100);
    editorP.style.height = newH + 'px';
  } else {
    const dx = (e.clientX - dragStart) * dir;
    const totalW = main.offsetWidth;
    const newW = Math.min(Math.max(dragStartSize + dx, 200), totalW - divW - 100);
    editorP.style.width = newW + 'px';
  }
});

function endDividerDrag(): void {
  if (dragging) {
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
  }
}
divider.addEventListener('pointerup', endDividerDrag);
divider.addEventListener('pointercancel', endDividerDrag);

// Clear stale inline size when crossing the layout breakpoint
stackedLayout.addEventListener('change', () => {
  editorP.style.width = '';
  editorP.style.height = '';
});

/* ── Options panel ───────────────────────────────────────── */
const btnOptions   = document.getElementById('btn-options')        as HTMLButtonElement;
const optPanel     = document.getElementById('options-panel')      as HTMLElement;
const optClose     = document.getElementById('options-close')      as HTMLButtonElement;
const optRes       = document.getElementById('opt-res')            as HTMLInputElement;
const optResVal    = document.getElementById('opt-res-val')        as HTMLElement;
const optLayoutNorm= document.getElementById('opt-layout-normal')  as HTMLButtonElement;
const optLayoutSwap= document.getElementById('opt-layout-swap')    as HTMLButtonElement;
const optVim       = document.getElementById('opt-vim')            as HTMLButtonElement;
const optThemeGrid = document.getElementById('opt-theme-grid')     as HTMLElement;
const optReset     = document.getElementById('opt-reset')          as HTMLButtonElement;

const CSS_VARS: Array<[keyof Theme['ui'], string]> = [
  ['bg0', '--bg0'], ['bg1', '--bg1'], ['bg2', '--bg2'], ['bg3', '--bg3'],
  ['border', '--border'], ['accent', '--accent'], ['accent2', '--accent2'],
  ['err', '--err'], ['warn', '--warn'], ['ok', '--ok'],
  ['text', '--text'], ['textDim', '--text-dim'], ['preview', '--preview'],
  ['hl', '--hl'], ['sel', '--sel'],
];

function applyTheme(id: string): void {
  const t = THEME_BY_ID.get(id) ?? THEMES[0];
  settings.theme = t.id;
  const root = document.documentElement;
  for (const [key, cssVar] of CSS_VARS) root.style.setProperty(cssVar, t.ui[key]);
  root.style.setProperty('color-scheme', t.dark ? 'dark' : 'light');
  if (editor) editor.dispatch({ effects: themeCompartment.reconfigure(themeExtensions(t)) });
  optThemeGrid.querySelectorAll('.theme-swatch').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.theme === t.id);
  });
}

// syncInput is off while typing, so the field isn't rewritten under the caret.
function applyResScale(scale: number, syncInput = true): void {
  settings.resScale = clampRes(scale);
  optResVal.textContent = `${+(settings.resScale * 100).toFixed(2)}%`;
  if (syncInput) optRes.value = String(+settings.resScale.toFixed(4));
  scheduleRender();   // repaint at the new framebuffer size even while paused
}

function applyLayout(swapped: boolean): void {
  settings.swapped = swapped;
  main.classList.toggle('swapped', swapped);
  optLayoutNorm.classList.toggle('active', !swapped);
  optLayoutSwap.classList.toggle('active', swapped);
}

function applyVimMode(on: boolean): void {
  settings.vimMode = on;
  optVim.classList.toggle('active', on);
  optVim.textContent = on ? 'Vim mode: on' : 'Vim mode: off';
  if (editor) editor.dispatch({ effects: vimCompartment.reconfigure(vimExtension(on)) });
}

// Build theme swatches
for (const t of THEMES) {
  const btn = document.createElement('button');
  btn.className = 'theme-swatch';
  btn.dataset.theme = t.id;
  btn.title = t.name;
  const dots = document.createElement('span');
  dots.className = 'dots';
  for (const c of [t.ui.bg1, t.ui.accent, t.syn.keyword, t.syn.string, t.syn.number]) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = c;
    dot.style.border = `1px solid ${t.ui.border}`;
    dots.appendChild(dot);
  }
  const name = document.createElement('span');
  name.className = 'tname';
  name.textContent = t.name;
  btn.append(dots, name);
  btn.addEventListener('click', () => { applyTheme(t.id); saveSettings(); });
  optThemeGrid.appendChild(btn);
}

if (!hasFinePointer) {
  const hint = document.createElement('div');
  hint.className = 'opt-hint';
  hint.textContent = 'Vim mode needs a hardware Esc key — off by default on touch devices.';
  optVim.parentElement!.after(hint);
}

optRes.addEventListener('input', () => {
  const v = parseFloat(optRes.value);
  if (!isFinite(v)) return;   // empty or mid-typing — leave the last good value
  applyResScale(v, false);
});
optRes.addEventListener('change', () => {
  const v = parseFloat(optRes.value);
  applyResScale(isFinite(v) ? v : settings.resScale);
  saveSettings();
});

optLayoutNorm.addEventListener('click', () => { applyLayout(false); saveSettings(); });
optLayoutSwap.addEventListener('click', () => { applyLayout(true);  saveSettings(); });
optVim.addEventListener('click', () => { applyVimMode(!settings.vimMode); saveSettings(); });

optReset.addEventListener('click', () => {
  const d = defaultSettings();
  applyTheme(d.theme);
  applyResScale(d.resScale);
  applyLayout(d.swapped);
  applyVimMode(d.vimMode);
  saveSettings();
});

function toggleOptions(open: boolean): void {
  optPanel.classList.toggle('open', open);
  btnOptions.classList.toggle('active', open);
}

btnOptions.addEventListener('click', (e: MouseEvent) => {
  e.stopPropagation();
  toggleOptions(!optPanel.classList.contains('open'));
});
optClose.addEventListener('click', () => toggleOptions(false));
optPanel.addEventListener('click', (e: MouseEvent) => e.stopPropagation());
document.addEventListener('click', () => toggleOptions(false));
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && optPanel.classList.contains('open')) toggleOptions(false);
});

/* ── Init ────────────────────────────────────────────────── */
initQuad();

applyTheme(settings.theme);
applyResScale(settings.resScale);
applyLayout(settings.swapped);
applyVimMode(settings.vimMode);

editor = new EditorView({
  state: makeEditorState(imagePass.code),
  parent: document.getElementById('editor-wrap') as HTMLElement,
});
editor.focus();

updatePassTabs();
rebuildChannelStrip();

tryCompile();
scheduleRender();

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    scheduleCompile(true);
  }
});
