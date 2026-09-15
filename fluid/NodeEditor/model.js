import { SVGRenderer } from "./svgrenderer.js";
import {
  PORT_DIR,
  DATA_TYPE,
  EventEmitter,
  GUID,
  NODE_TYPES,
} from "./common.js";

const gridSize = 30;

class Node {
  constructor(id, x, y, inputs = [], outputs = []) {
    this.id = GUID();
    this.x = x;
    this.y = y;
    this.width = 100;
    this.height = 50;
    this.inputs = inputs;
    this.outputs = outputs;
    this.func = null; // Higher order function payload for manipulating node data
    this.fields = {};
    this.type = NODE_TYPES.CUSTOM;
    this.label = id;
  }
  setInputs(inputs) {
    this.inputs = inputs.map(
      (input) =>
        new Port(
          this,
          PORT_DIR.INPUT,
          0,
          input.y_offset,
          input.data_type,
          input.label,
        ),
    );
  }
  setOutputs(outputs) {
    this.outputs = outputs.map(
      (output) =>
        new Port(
          this,
          PORT_DIR.OUTPUT,
          this.width,
          output.y_offset,
          output.data_type,
          output.label,
        ),
    );
  }

  addInput(name) {
    this.inputs.push(new Port(this, PORT_DIR.INPUT, 0, this.height / 2));
    return this.inputs[this.inputs.length - 1];
  }
  addOutput(name) {
    this.outputs.push(
      new Port(this, PORT_DIR.OUTPUT, this.width, this.height / 2),
    );
    return this.outputs[this.outputs.length - 1];
  }
}

class Connection {
  constructor(fromPort, toPort) {
    this.id = GUID();
    this.fromPort = fromPort;
    this.toPort = toPort;
  }
}

class Port {
  constructor(parentNode, dir, x, y, data_type = null, label = "") {
    this.id = GUID();
    this.dir = dir || PORT_DIR.INPUT;
    this.data_type = data_type || DATA_TYPE.UNKNOWN;
    this.parentNode = parentNode;
    this.x = x;
    this.y = y;
    this.connections = [];
    this.label = label;
  }
}

class Graph extends EventEmitter {
  constructor() {
    super();
    this.nodes = new Map();
    this.connections = new Map();
    this.edgeList = new Map(); // Explicitly defined edges (connection) list for fast lookup. portID -> connectionID
    this.ports = new Map(); // Cache ports by id
  }

  addNode(node) {
    this.nodes.set(node.id, node);
    node.inputs.forEach((port) => this.ports.set(port.id, port));
    node.outputs.forEach((port) => this.ports.set(port.id, port));
    this.emit("node:added", node);
    return node;
  }

  removeNode(nodeId) {
    let node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove connections
    for (let connectionID of this.edgeList.get(nodeId)) {
      this.removeConnection(connectionID);
    }
    // Remove ports
    node.inputs.forEach((port) => this.ports.delete(port.id));
    node.outputs.forEach((port) => this.ports.delete(port.id));

    this.nodes.delete(nodeId);
    this.emit("node:removed", node);
  }

  addConnection(connection) {
    this.connections.set(connection.id, connection);

    // Add connection to node ports
    let toPort = connection.toPort;
    let fromPort = connection.fromPort;
    toPort.connections.push(connection);
    fromPort.connections.push(connection);

    // Add connection to edge list
    this.edgeList.set(toPort.id, [
      ...(this.edgeList.get(toPort.id) || []),
      connection.id,
    ]);
    this.edgeList.set(fromPort.id, [
      ...(this.edgeList.get(fromPort.id) || []),
      connection.id,
    ]);

    this.emit("connection:added", connection);
    return connection;
  }

  removeConnection(connectionId) {
    let connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from both ports' connection arrays
    let toPort = connection.toPort;
    let fromPort = connection.fromPort;
    toPort.connections = toPort.connections.filter(
      (c) => c.id !== connectionId,
    );
    fromPort.connections = fromPort.connections.filter(
      (c) => c.id !== connectionId,
    );

    // Remove from this.connections
    this.connections.delete(connectionId);

    // Remove from edgelist
    this.edgeList.set(
      toPort.id,
      this.edgeList.get(toPort.id).filter((id) => id !== connectionId),
    );
    this.edgeList.set(
      fromPort.id,
      this.edgeList.get(fromPort.id).filter((id) => id !== connectionId),
    );

    // Emit 'connection:removed' event
    this.emit("connection:removed", connection);
  }

  editNode(node, propertyName, newValue) {
    Object.defineProperty(node, propertyName, {
      value: newValue,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    this.emit("node:edited", node);
  }

  updateNodePosition(nodeId, x, y) {
    let node = this.nodes.get(nodeId);
    if (!node) return;

    // Update node position

    node.x = Math.round(x / gridSize) * gridSize;
    node.y = Math.round(y / gridSize) * gridSize;

    this.emit("node:positionchanged", node);
  }
}
export { Node, Connection, Port, Graph };
