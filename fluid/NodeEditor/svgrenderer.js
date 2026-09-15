import { PORT_DIR, NODE_TYPES, GUID } from "./common.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_NODE_WIDTH = 100;
const DEFAULT_NODE_HEIGHT = 50;

// Define specific node components
const DEFAULT_CONFIG = {
  nodeBg: {
    height: DEFAULT_NODE_HEIGHT + 20,
    class: "node-bg",
    rx: 9,
  },
  nodeHeader: {
    height: 20,
    class: "node-header",
    transform: `translate(1, 0)`,
    rx: 9,
  },
  nodeTitle: {
    height: 20,
    class: "node-title",
  },
};

const BaseNode = function (node, config = DEFAULT_CONFIG) {
  let nodeHeight = Math.max(node.inputs.length, node.outputs.length) * 20 + 25;

  config.nodeBg.width = node.width;
  config.nodeHeader.width = node.width - 2;
  config.nodeTitle.width = node.width / 2;
  config.nodeTitle.transform = `translate(${node.width / 2}, 15)`;

  let parentGroup = document.createElementNS(SVG_NS, "g");
  parentGroup.setAttribute("id", `${node.id}`);
  parentGroup.setAttribute("data-node-id", node.id);

  let nodeBg = document.createElementNS(SVG_NS, "rect");
  let nodeHeader = document.createElementNS(SVG_NS, "rect");
  let nodeTitle = document.createElementNS(SVG_NS, "text");

  // Loop through keys in each config entry and apply
  for (let key in config.nodeBg) {
    nodeBg.setAttribute(key, config.nodeBg[key]);
  }
  for (let key in config.nodeHeader) {
    nodeHeader.setAttribute(key, config.nodeHeader[key]);
  }
  for (let key in config.nodeTitle) {
    nodeTitle.setAttribute(key, config.nodeTitle[key]);
  }
  nodeTitle.textContent = node.label;

  parentGroup.appendChild(nodeBg);
  parentGroup.appendChild(nodeHeader);
  parentGroup.appendChild(nodeTitle);

  return parentGroup;
};

const EmbededCanvas = function (node) {
  // Embed an html webgl canvas

  let nodeHeight = Math.max(node.inputs.length, node.outputs.length) * 20 + 25;
  let foreignObject = document.createElementNS(SVG_NS, "foreignObject");
  foreignObject.setAttribute("width", node.width);
  foreignObject.setAttribute("height", nodeHeight);
  foreignObject.setAttribute("x", 0);
  foreignObject.setAttribute("y", 0);

  let div = document.createElement("div");

  let canvas = document.createElement("canvas");
  canvas.setAttribute("width", node.width);
  canvas.setAttribute("height", nodeHeight);
  canvas.setAttribute("class", "node_canvas");
  canvas.setAttribute("x", 2);
  canvas.setAttribute("y", 0);

  const gl = canvas.getContext("webgl");
  if (!gl) {
    console.error("WebGL is not supported");
    return;
  } else {
    console.log("WebGL is supported");
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  div.appendChild(canvas);
  foreignObject.appendChild(div);

  return foreignObject;
};

class SVGRenderer {
  constructor(svgElement) {
    this.svgElement = svgElement;
    this.viewport = {
      x: 0,
      y: 0,
      zoom: 0,
    };
    this.layers = {
      connections: null,
      nodes: null,
      ports: null,
      overlays: null,
    };

    this.svgCache = {
      nodes: new Map(),
      ports: new Map(),
      connections: new Map(),
      overlays: new Map(),
      temp: null,
    };

    this.initLayers();
  }

  initLayers() {
    // Create svg groups

    this.layers.connections = this.svgElement.appendChild(
      document.createElementNS(SVG_NS, "g", { id: "connections" }),
    );
    this.layers.nodes = this.svgElement.appendChild(
      document.createElementNS(SVG_NS, "g", { id: "nodes" }),
    );
    this.layers.ports = this.svgElement.appendChild(
      document.createElementNS(SVG_NS, "g", { id: "ports" }),
    );
    this.layers.overlays = this.svgElement.appendChild(
      document.createElementNS(SVG_NS, "g", { id: "overlays" }),
    );
  }

  screenToWorld(screenX, screenY) {
    const { x, y, zoom } = this.viewport;
    return {
      x: (screenX - x) / zoom,
      y: (screenY - y) / zoom,
    };
  }
  worldToScreen(worldX, worldY) {
    const { x, y, zoom } = this.viewport;
    return {
      x: worldX * zoom + x,
      y: worldY * zoom + y,
    };
  }

  setViewport(x, y, zoom) {
    this.viewport.x = x;
    this.viewport.y = y;
    this.viewport.zoom = zoom;

    this.layers.connections.setAttribute(
      "transform",
      `translate(${x}, ${y}) scale(${zoom})`,
    );
    this.layers.nodes.setAttribute(
      "transform",
      `translate(${x}, ${y}) scale(${zoom})`,
    );
    this.layers.ports.setAttribute(
      "transform",
      `translate(${x}, ${y}) scale(${zoom})`,
    );

    this.render();
  }

  reRender(graph) {
    this.svgCache.nodes.forEach((node) => {
      node.remove();
    });

    this.svgCache.nodes.clear();
    this.render(graph);
  }

  renderNode(node) {
    let group = this.svgCache.nodes.get(node.id);

    // If not group, then the node doesn't yet exist - create the node group for it
    if (!group) {
      // Create rect for node
      group = BaseNode(node);
      // Sub group for ports
      let portsGroup = document.createElementNS(SVG_NS, "g");
      portsGroup.setAttribute("class", `ports`);
      group.appendChild(portsGroup);

      // Create ports
      node.inputs.forEach((port) => {
        let portElement = this.createPortElement(port);
        this.svgCache.ports.set(port.id, portElement);
        portsGroup.appendChild(portElement);
      });
      node.outputs.forEach((port) => {
        let portElement = this.createPortElement(port);
        this.svgCache.ports.set(port.id, portElement);
        portsGroup.appendChild(portElement);
      });

      // Custom node type specific rendering
      if (node.type === NODE_TYPES.VIEW) {
        this.renderViewNode(node, group);
      }

      this.layers.nodes.appendChild(group);
      this.svgCache.nodes.set(node.id, group);
    }

    // Position update
    group.setAttribute("transform", `translate(${node.x}, ${node.y})`);

    // Other updates like size can go here I guess
    return group;
  }

  renderViewNode(node, group) {
    // Custom rendering for view node
    group.appendChild(EmbededCanvas(node));
  }

  createPortElement(port) {
    // Simple circle for now
    let g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("id", `${port.id}`);
    g.setAttribute("transform", `translate(${port.x}, ${port.y})`);

    let circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("id", port.id);
    circle.setAttribute("class", "port");
    circle.setAttribute("r", 3);

    let label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "port-label");
    label.textContent = port.label;

    // Style based on node type
    if (port.dir === PORT_DIR.INPUT) {
      circle.setAttribute("fill", "#ff8f00");
      label.setAttribute("transform", `translate(20, 5)`);
    } else if (port.dir === PORT_DIR.OUTPUT) {
      circle.setAttribute("fill", "#00aa99");
      label.setAttribute("transform", `translate(-20, 5)`);
    }

    g.appendChild(circle);
    g.appendChild(label);
    return g;
  }

  renderConnection(connection) {
    let path = this.svgCache.connections.get(connection.id);
    if (!path) {
      path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("class", "path");
      this.layers.connections.appendChild(path);
      this.svgCache.connections.set(connection.id, path);
    }

    let fromNode = connection.fromPort.parentNode;
    let toNode = connection.toPort.parentNode;
    let toPort = connection.toPort;
    let fromPort = connection.fromPort;

    let sourceX = fromPort.x + fromNode.x;
    let sourceY = fromPort.y + fromNode.y;
    let targetX = toPort.x + toNode.x;
    let targetY = toPort.y + toNode.y;

    // Curved path (Cubic bezier)
    let c1 = { x: sourceX + Math.max(targetX - sourceX, 190) / 2, y: sourceY };
    let c2 = { x: targetX - Math.max(targetX - sourceX, 190) / 2, y: targetY };

    path.setAttribute(
      "d",
      `M${sourceX} ${sourceY} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${targetX} ${targetY}`,
    );
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("shape-rendering", "geometricPrecision");
    return path;
  }

  renderTempConnection(fromPort, x, y) {
    let path = this.svgCache.connections.get("temp");
    if (!path) {
      path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("class", "path");
      this.layers.connections.appendChild(path);
      this.svgCache.connections.set("temp", path);
    }
    let fromNode = fromPort.parentNode;
    let sourceX = fromPort.x + fromNode.x;
    let sourceY = fromPort.y + fromNode.y;
    let targetX = x;
    let targetY = y;

    // Curved path (Cubic bezier)
    let c1 = { x: sourceX + (targetX - sourceX) / 2, y: sourceY };
    let c2 = { x: targetX - (targetX - sourceX) / 2, y: targetY };

    path.setAttribute(
      "d",
      `M${sourceX} ${sourceY} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${targetX} ${targetY}`,
    );
    path.setAttribute("shape-rendering", "geometricPrecision");
  }
  removeTempConnection() {
    let path = this.svgCache.connections.get("temp");
    if (path) {
      path.remove();
      this.svgCache.connections.delete("temp");
    }
  }

  removeConnection(connection) {
    let path = this.svgCache.connections.get(connection.id);
    if (path) {
      path.remove();
      this.svgCache.connections.delete(connection.id);
    }
  }

  removeNode(node) {
    let path = this.svgCache.nodes.get(node.id);
    if (path) {
      path.remove();
      this.svgCache.nodes.delete(node.id);
    }
  }

  render(graph) {
    graph.connections.forEach((connection) => {
      this.renderConnection(connection);
    });
    graph.nodes.forEach((node) => {
      this.renderNode(node);
    });
  }

  findNearestPort(x, y) {
    let nearestPort = null;
    let minDistance = Infinity;

    this.svgCache.ports.values().forEach((port) => {
      let distance = Math.hypot(
        x - parseFloat(port.getBoundingClientRect().x),
        y - parseFloat(port.getBoundingClientRect().y),
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestPort = port;
      }
    });

    return { port: nearestPort, distance: minDistance };
  }
}

export { SVGRenderer };
