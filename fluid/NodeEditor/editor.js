import { Graph, Node, Connection } from "./model.js";
import { SVGRenderer } from "./svgrenderer.js";
import { STATES, PORT_DIR, EventEmitter } from "./common.js";
import { ShaderNode, ViewNode, TimeNode } from "./nodes.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_MENU_HTML = `
  <g class="context-menu" >
    <!-- Drop shadow -->
    <defs>
      <filter id="menu-shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
        <feOffset dx="0" dy="2" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.3"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <!-- Menu background -->
    <rect
      class="menu-bg"
      x="0"
      y="0"
      width="180"
      height="120"
      rx="6"
      fill="#2d2d2d"
      stroke="#444"
      stroke-width="1"
      filter="url(#menu-shadow)"
    />
  </g >
  `;

// Small custom context menu for creating nodes
class ContextMenu extends EventEmitter {
  constructor(renderer) {
    super();
    this.renderer = renderer;
    this.renderer.svgElement.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.openMenu(event);
    });

    this.menuItems = [
      {
        index: 0,
        action: "add-shader-node",
        label: "New Shader Node",
      },
      {
        index: 1,
        action: "add-view-node",
        label: "New View Node",
      },
      { index: 2, action: "delete", label: "Delete" },
      { index: 3, action: "duplicate", label: "Duplicate" },
    ];
  }

  generateMenuItems() {
    return this.menuItems.map((item) => {
      const menuItem = document.createElementNS(SVG_NS, "g");
      menuItem.setAttribute("class", "menu-item");
      menuItem.setAttribute("data-action", item.action);
      menuItem.setAttribute("transform", `translate(0,${item.index * 30})`);
      menuItem.innerHTML = `
        <rect x="0" y="0" width="180" height="30" fill="transparent" class="menu-item-bg"/>
        <text x="15" y="20" fill="#e0e0e0" font-size="13">${item.label}</text>`;
      return menuItem;
    });
  }

  openMenu(event) {
    console.log("openMenu");
    const menu = document.createElementNS(SVG_NS, "g");
    menu.setAttribute("class", "context-menu");
    menu.setAttribute(
      "transform",
      `translate(${event.clientX}, ${event.clientY})`,
    );

    menu.innerHTML = SVG_MENU_HTML;
    this.generateMenuItems().forEach((item) => {
      menu.appendChild(item);
    });
    this.renderer.layers.overlays.appendChild(menu);
    menu.addEventListener("mouseleave", () => this.closeMenu());

    // Add click handlers
    menu.querySelectorAll(".menu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const action = item.getAttribute("data-action");
        this.handleMenuAction(action, e);
        this.closeMenu();
      });
    });
  }
  handleMenuAction(action, event) {
    switch (action) {
      case "add-shader-node":
        this.emit("shader-node:created", {
          x: event.clientX,
          y: event.clientY,
        });
        break;
      case "add-view-node":
        this.emit("view-node:created", {
          x: event.clientX,
          y: event.clientY,
        });
        break;
      case "delete":
        this.emit("node:deleted", {
          id: this.selectedNode.id,
        });
        break;
      case "duplicate":
        this.emit("node:duplicated", {
          id: this.selectedNode.id,
        });
        break;
      case "properties":
        this.emit("node:properties", {
          id: this.selectedNode.id,
        });
        break;
      default:
        console.warn(`Unknown action: ${action}`);
    }
  }

  closeMenu() {
    const menu = this.renderer.layers.overlays.querySelector(".context-menu");
    if (menu) {
      menu.remove();
    }
  }
}

class NodeEditor {
  constructor(svgElement) {
    this.graph = new Graph();
    this.renderer = new SVGRenderer(svgElement);
    this.contextMenu = new ContextMenu(this.renderer);

    this.state = STATES.IDLE;
    this.draggedNode = null;
    this.dragStartPos = null;
    this.nodeStartPos = null;
    this.tempConnectionPort = null; // Used to render a temporary connection line while dragging

    this.setListeners();
  }

  update() {
    this.renderer.reRender(this.graph);
  }

  setListeners() {
    this.contextMenu.on("node:created", (position) => {
      this.graph.addNode(new Node("", position.x, position.y));
    });
    this.contextMenu.on("shader-node:created", (position) => {
      this.graph.addNode(new ShaderNode(position.x, position.y));
    });
    this.contextMenu.on("view-node:created", (position) => {
      this.graph.addNode(new ViewNode(position.x, position.y));
    });

    this.graph.on("connection:added", (conn) => {
      this.renderer.render(this.graph);
    });

    this.graph.on("connection:removed", (conn) => {
      console.log("Connection removed:", conn);
      this.renderer.removeConnection(conn);
      this.renderer.render(this.graph);
    });

    this.graph.on("node:added", (node) => {
      console.log("Node added:", node);
      this.renderer.renderNode(node);
    });

    this.graph.on("node:removed", (node) => {
      this.renderer.removeNode(node);
    });
    this.graph.on("node:edited", (node) => {
      this.renderer.renderNode(node);
    });

    this.graph.on("node:positionchanged", (node) => {
      this.renderer.render(this.graph);
    });

    this.renderer.svgElement.addEventListener("mousedown", (event) => {
      this.onMouseDown(event);
    });

    this.renderer.svgElement.addEventListener("mouseup", (event) => {
      this.onMouseUp(event);
    });

    this.renderer.svgElement.addEventListener("mousemove", (event) => {
      this.onMouseMove(event);
    });
  }

  onMouseDown(event) {
    const screenX = event.clientX;
    const screenY = event.clientY;

    if (event.target.classList.contains("port")) {
      let portSVG = this.renderer.svgCache.ports.get(event.target.id);
      if (portSVG) {
        let connections = this.graph.edgeList.get(portSVG.id);
        let clickedPort = this.graph.ports.get(portSVG.id);

        this.tempConnectionPort = clickedPort;
        if (
          clickedPort.dir == PORT_DIR.INPUT &&
          connections &&
          connections.length > 0
        ) {
          this.tempConnectionPort = this.graph.connections.get(
            connections[0],
          ).fromPort;
          this.graph.removeConnection(connections[0]);
        }

        this.dragStartPos = { x: event.clientX, y: event.clientY };
        this.state = STATES.CONNECTING;
      }
    } else if (event.target.closest("g[data-node-id]")) {
      let node = this.renderer.svgCache.nodes.get(
        event.target.closest("g[data-node-id]").id,
      );
      let nodemodel = this.graph.nodes.get(
        event.target.closest("g[data-node-id]").id,
      );

      if (node) {
        this.state = STATES.DRAGGING;
        this.draggedNode = node;
        this.dragStartPos = { x: event.clientX, y: event.clientY };
        this.nodeStartPos = {
          x: nodemodel.x,
          y: nodemodel.y,
        };
      } else {
        this.state = STATES.IDLE;
        this.draggedNode = null;
      }
    }
  }

  onMouseUp(event) {
    if (this.state === STATES.CONNECTING) {
      let finalPos = { x: event.clientX, y: event.clientY };
      let t = this.renderer.findNearestPort(finalPos.x, finalPos.y);
      if (
        t.port &&
        t.port.id != this.tempConnectionPort.id &&
        t.port.parentNode.id != this.tempConnectionPort.parentNode.id &&
        t.distance < 50
      ) {
        let newPort = this.graph.ports.get(t.port.id);
        if (newPort.dir === this.tempConnectionPort.dir) {
        } else if (newPort.dir === PORT_DIR.INPUT) {
          let connection = new Connection(this.tempConnectionPort, newPort);

          if (newPort.connections.length > 0) {
            this.graph.removeConnection(newPort.connections[0].id);
          }

          this.graph.addConnection(connection);
          // Sever old connection
        } else if (newPort.dir === PORT_DIR.OUTPUT) {
          let connection = new Connection(newPort, this.tempConnectionPort);
          this.graph.addConnection(connection);
        }
      }
      this.renderer.removeTempConnection();
    }

    this.state = STATES.IDLE;
    this.draggedNode = null;
  }

  onMouseMove(event) {
    if (this.state === STATES.DRAGGING) {
      const dx = event.clientX - this.dragStartPos.x;
      const dy = event.clientY - this.dragStartPos.y;
      console.log("Dragging node:", this.draggedNode.id);

      const x = this.nodeStartPos.x + dx;
      const y = this.nodeStartPos.y + dy;

      this.graph.updateNodePosition(this.draggedNode.id, x, y);
    } else if (this.state === STATES.CONNECTING) {
      const dx = event.clientX;
      const dy = event.clientY;

      const x = dx;
      const y = dy;

      this.renderer.renderTempConnection(this.tempConnectionPort, x, y);
    }
  }

  addNode(node) {
    this.graph.addNode(node);
  }
  removeNode(node) {
    this.graph.removeNode(node);
  }
  addConnection(connection) {
    this.graph.addConnection(connection);
  }
  removeConnection(connection) {
    this.graph.removeConnection(connection);
  }
}

export { NodeEditor, Node, TimeNode, Connection };
