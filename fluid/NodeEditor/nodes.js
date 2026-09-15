import { NODE_TYPES } from "./common.js";
import { Node, Port } from "./model.js";

// Classes that inherit from the Node model class

class ShaderNode extends Node {
  constructor(x, y) {
    super("Shader", x, y);
    this.width = 200;
    this.setInputs([{ y_offset: 25, label: "time" }]);
    this.setOutputs([{ y_offset: 25, label: "color" }]);
    this.type = NODE_TYPES.FRAGMENT_SHADER;
    this.label = "Fragment Shader";
  }
}

class ViewNode extends Node {
  constructor(x, y) {
    super("View", x, y);
    this.setInputs([{ y_offset: 25, label: "texture" }]);
    this.setOutputs([]);
    this.type = NODE_TYPES.VIEW;
    this.label = "View";
  }
}

class TimeNode extends Node {
  constructor(x, y) {
    super("Time", x, y);
    this.setInputs([]);
    this.setOutputs([{ y_offset: 25, label: "time" }]);
    this.type = NODE_TYPES.CUSTOM;
    this.label = "Time";
  }
}

class TextNode extends Node {
  constructor(x, y) {
    super("Text", x, y);
    this.setInputs([]);
    this.setOutputs([{ y_offset: 25, label: "text" }]);
    this.type = NODE_TYPES.CUSTOM;
    this.label = "Text";
  }
}

export { ShaderNode, ViewNode, TimeNode, TextNode };
