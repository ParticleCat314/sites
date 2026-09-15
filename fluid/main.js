const canvas = document.getElementById("shader-canvas");
const gl = canvas.getContext("webgl");
const editor = document.getElementById("code-editor");
const runBtn = document.getElementById("run-btn");
const resetBtn = document.getElementById("reset-btn");
const status = document.getElementById("status");

if (!gl) {
  alert("WebGL not supported");
}

let program;
let startTime = Date.now();
let animationId;

const defaultShader = editor.value;

// Vertex shader (fixed)
const vertexShaderSource = `
    attribute vec4 a_position;
    void main() {
        gl_Position = a_position;
    }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Shader compilation error: " + info);
  }

  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error("Program linking error: " + info);
  }

  return program;
}

function setupGeometry(gl, program) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
}

function compileAndRun() {
  try {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, editor.value);

    if (program) {
      gl.deleteProgram(program);
    }

    program = createProgram(gl, vertexShader, fragmentShader);
    gl.useProgram(program);

    setupGeometry(gl, program);

    startTime = Date.now();
    render();

    status.textContent = "Running";
    status.className = "status success";
  } catch (error) {
    status.textContent = "Error: " + error.message;
    status.className = "status error";
    console.error(error);
  }
}

function render() {
  const time = (Date.now() - startTime) / 1000;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const timeLocation = gl.getUniformLocation(program, "u_time");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");

  if (timeLocation) {
    gl.uniform1f(timeLocation, time);
  }

  if (resolutionLocation) {
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
  }

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  animationId = requestAnimationFrame(render);
}

// Event listeners
runBtn.addEventListener("click", compileAndRun);

resetBtn.addEventListener("click", () => {
  editor.value = defaultShader;
  compileAndRun();
});

// Keyboard shortcut: Ctrl/Cmd + Enter to run
editor.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    compileAndRun();
  }

  // Tab key support
  if (e.key === "Tab") {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value =
      editor.value.substring(0, start) + "    " + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 4;
  }
});

// Resizer functionality
const resizer = document.getElementById("resizer");
const editorPanel = document.querySelector(".editor-panel");
let isResizing = false;

resizer.addEventListener("mousedown", (e) => {
  isResizing = true;
  document.body.style.cursor = "col-resize";
});

document.addEventListener("mousemove", (e) => {
  if (!isResizing) return;

  const containerWidth = document.querySelector(".container").offsetWidth;
  const newWidth = (e.clientX / containerWidth) * 100;

  if (newWidth > 20 && newWidth < 80) {
    editorPanel.style.flex = `0 0 ${newWidth}%`;
  }
});

document.addEventListener("mouseup", () => {
  isResizing = false;
  document.body.style.cursor = "default";
});

// Handle window resize
window.addEventListener("resize", () => {
  if (program) {
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
});

// Initial compilation
compileAndRun();
