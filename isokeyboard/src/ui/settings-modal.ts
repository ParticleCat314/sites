/** The settings dialog. It contains the tuning details, the scale operation,
 *  the appearance and the key mapping. */

import type { App } from "../app.js";
import { latticeStride } from "../core/lattice.js";
import { describeMidiStatus } from "../input/midi.js";
import { parseScala } from "../core/scala.js";
import { ODD_LIMITS } from "../core/ratios.js";
import { clampDivisions, degreeNames, equalSpec, makeTuning, OCTAVE_CENTS } from "../core/tuning.js";
import { CENTER_ROW, keyLabel } from "../state/keymap.js";
import {
  DEFAULT_ROWS,
  MAP_COLS,
  MAP_ROWS,
  retune,
  type LabelMode,
  type OutOfScaleMode
} from "../state/settings.js";
import { el, fillSelect } from "./dom.js";

interface CaptureTarget {
  row: number;
  col: number;
}

export function initSettingsModal(app: App): void {
  const modal = el("modal");
  const edoIn = el<HTMLInputElement>("edoIn");
  const periodIn = el<HTMLInputElement>("periodIn");
  const scalaIn = el<HTMLInputElement>("scalaIn");
  const tuningNote = el("tuningNote");
  const tuningError = el("tuningError");
  const tuneIn = el<HTMLInputElement>("tuneIn");
  const centerRegSel = el<HTMLSelectElement>("centerRegSel");
  const centerDegSel = el<HTMLSelectElement>("centerDegSel");
  const rootFollowsIn = el<HTMLInputElement>("rootFollowsIn");
  const outScaleSel = el<HTMLSelectElement>("outScaleSel");
  const labelSel = el<HTMLSelectElement>("labelSel");
  const dimDupIn = el<HTMLInputElement>("dimDupIn");
  const dupModeSel = el<HTMLSelectElement>("dupModeSel");
  const reallocNote = el("reallocNote");
  const jiLimitSel = el<HTMLSelectElement>("jiLimitSel");
  const glowIn = el<HTMLInputElement>("glowIn");
  const degreeEditor = el("degreeEditor");
  const degreeDetails = el<HTMLDetailsElement>("degreeDetails");
  const sustainModeSel = el<HTMLSelectElement>("sustainModeSel");
  const midiConnectBtn = el<HTMLButtonElement>("midiConnectBtn");
  const midiStatus = el("midiStatus");
  const midiModeSel = el<HTMLSelectElement>("midiModeSel");
  const midiVelocityIn = el<HTMLInputElement>("midiVelocityIn");
  const midiAutoIn = el<HTMLInputElement>("midiAutoIn");
  const mapEditor = el("mapEditor");
  const mapSummary = el("mapSummary");
  const captureHint = el("captureHint");
  const storeNote = el("storeNote");

  let capturing: CaptureTarget | null = null;

  fillSelect(
    jiLimitSel,
    ODD_LIMITS.map((limit) => ({ value: String(limit), label: `${limit}-odd-limit` })),
    String(app.settings.jiLimit)
  );

  fillSelect(
    centerRegSel,
    Array.from({ length: 10 }, (_, i) => ({ value: String(i - 1), label: String(i - 1) })),
    String(app.settings.centerRegister)
  );

  app.openSettings = (focusId?: string) => {
    // The dialog needs the keyboard for text entry and for the key mapping.
    app.captureSuspended = app.capture.active;
    if (app.captureSuspended) void app.setCapture(false);
    app.modalOpen = true;
    modal.hidden = false;
    capturing = null;
    captureHint.textContent = "";
    tuningError.textContent = "";
    syncFields();
    renderMapEditor();
    if (focusId) el<HTMLElement>(focusId).focus();
  };

  const close = (): void => {
    capturing = null;
    app.modalOpen = false;
    if (app.captureSuspended) {
      app.captureSuspended = false;
      void app.setCapture(true);
    }
    modal.hidden = true;
    captureHint.textContent = "";
    // An element in the hidden dialog must not keep the focus. That element
    // receives the play keys.
    (document.activeElement as HTMLElement | null)?.blur();
  };

  el("closeSettings").addEventListener("click", close);
  modal.addEventListener("pointerdown", (event) => {
    if (event.target === modal) close();
  });

  // A change to one of the two equal-tuning fields makes the tuning an equal
  // tuning. This also applies to an imported scale. To replace an imported
  // scale, the user changes one of these fields or loads a different file.
  const applyEqual = (): void => {
    const divisions = clampDivisions(Number(edoIn.value));
    const period = Number(periodIn.value);
    app.player.releaseAll();
    retune(app.settings, equalSpec(divisions, Number.isFinite(period) && period > 0 ? period : OCTAVE_CENTS));
    tuningError.textContent = "";
    app.apply();
  };
  edoIn.addEventListener("change", applyEqual);
  periodIn.addEventListener("change", applyEqual);

  scalaIn.addEventListener("change", () => {
    const file = scalaIn.files?.[0];
    if (!file) return;
    void file
      .text()
      .then((text) => {
        const spec = parseScala(text, file.name.replace(/\.scl$/i, ""));
        app.player.releaseAll();
        retune(app.settings, spec);
        tuningError.textContent = "";
        app.apply();
      })
      .catch((error: unknown) => {
        tuningError.textContent = `Could not read ${file.name}: ${error instanceof Error ? error.message : "unknown error"}`;
      })
      .finally(() => {
        scalaIn.value = ""; // Let the user select the same file again.
      });
  });

  tuneIn.addEventListener("change", () => {
    const value = Number(tuneIn.value);
    if (Number.isFinite(value)) app.settings.aHz = Math.min(500, Math.max(380, value));
    app.apply();
  });

  centerRegSel.addEventListener("change", () => {
    app.settings.centerRegister = Number(centerRegSel.value);
    app.apply();
  });

  centerDegSel.addEventListener("change", () => {
    app.settings.centerDegree = Number(centerDegSel.value);
    app.apply();
  });

  rootFollowsIn.addEventListener("change", () => {
    app.settings.rootFollowsCenter = rootFollowsIn.checked;
    // The root stays at its current degree. It does not move.
    if (!rootFollowsIn.checked) app.settings.scaleRoot = app.model.scaleRoot;
    app.apply();
  });

  outScaleSel.addEventListener("change", () => {
    app.settings.outOfScale = outScaleSel.value as OutOfScaleMode;
    app.apply();
  });

  jiLimitSel.addEventListener("change", () => {
    app.settings.jiLimit = Number(jiLimitSel.value);
    app.apply();
  });

  dimDupIn.addEventListener("change", () => {
    app.settings.dimDuplicates = dimDupIn.checked;
    app.apply();
  });

  dupModeSel.addEventListener("change", () => {
    app.settings.duplicateMode = dupModeSel.value as typeof app.settings.duplicateMode;
    app.player.releaseAll(); // The keys below the fingers change their note.
    app.apply();
  });

  labelSel.addEventListener("change", () => {
    app.settings.labels = labelSel.value as LabelMode;
    app.apply();
  });

  glowIn.addEventListener("input", () => {
    app.settings.glow = Number(glowIn.value);
    app.apply({ persist: false });
  });
  glowIn.addEventListener("change", () => app.apply());

  sustainModeSel.addEventListener("change", () => {
    app.settings.sustainMode = sustainModeSel.value as typeof app.settings.sustainMode;
    app.setSustain(false); // Start from the released condition in each mode.
    app.apply();
  });

  midiConnectBtn.addEventListener("click", () => void app.midi.connect());
  midiModeSel.addEventListener("change", () => {
    app.settings.midiMode = midiModeSel.value as typeof app.settings.midiMode;
    app.player.releaseAll();
    app.apply();
  });
  midiVelocityIn.addEventListener("change", () => {
    app.settings.midiVelocity = midiVelocityIn.checked;
    app.apply();
  });
  midiAutoIn.addEventListener("change", () => {
    app.settings.midiAutoConnect = midiAutoIn.checked;
    if (midiAutoIn.checked) void app.midi.connect();
    app.apply();
  });

  app.midi.onStatusChange = (status, devices) => {
    midiStatus.textContent = describeMidiStatus(status, devices);
    midiConnectBtn.disabled = status === "unsupported" || status === "requesting";
  };

  el("mapReset").addEventListener("click", () => {
    app.settings.rows = DEFAULT_ROWS.map((row) => row.slice());
    app.settings.keyLabels = {};
    app.apply();
    captureHint.textContent = "Mapping reset.";
  });

  // The dialog uses the keyboard while it is open. The Escape key closes the
  // dialog. During a key assignment, each key goes into the selected cell.
  window.addEventListener("keydown", (event) => {
    if (modal.hidden) return;
    if (capturing) {
      handleCapture(event);
      return;
    }
    if (event.code === "Escape") close();
  });

  app.onChange(() => {
    if (!modal.hidden) {
      syncFields();
      renderMapEditor();
    }
  });

  /**
   * Changes one degree of the tuning.
   *
   * This makes the tuning a table of cents. An imported Scala file makes the
   * same structure. Thus the user can change an equal tuning or a supplied
   * tuning into a different tuning.
   */
  function editDegree(degree: number, cents: number): void {
    const tuning = makeTuning(app.settings.tuning);
    const edited = [...tuning.degreeCents];
    edited[degree] = cents;
    app.player.releaseAll();
    retune(app.settings, {
      kind: "scale",
      name: tuning.name.endsWith("(edited)") ? tuning.name : `${tuning.name} (edited)`,
      periodCents: tuning.periodCents,
      cents: edited
    });
    tuningError.textContent = "";
    app.apply();
  }

  function renderDegreeEditor(): void {
    // The code makes the fields only while the section is open. A gamut of 43
    // tones needs 43 input fields.
    if (!degreeDetails.open) return;
    const tuning = makeTuning(app.settings.tuning);
    const names = degreeNames(tuning);
    degreeEditor.replaceChildren();

    tuning.degreeCents.forEach((cents, degree) => {
      const row = document.createElement("label");
      row.className = "degreeRow";

      const tag = document.createElement("span");
      tag.className = "degreeTag";
      tag.textContent = `${degree} · ${names[degree]}`;
      row.appendChild(tag);

      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.1";
      input.min = "0";
      input.max = tuning.periodCents.toFixed(3);
      input.value = cents.toFixed(3).replace(/\.?0+$/, "");
      input.disabled = degree === 0; // Degree 0 is the tonic. Its value is always 0¢.
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (Number.isFinite(value)) editDegree(degree, value);
      });
      row.appendChild(input);
      degreeEditor.appendChild(row);
    });
  }

  degreeDetails.addEventListener("toggle", renderDegreeEditor);

  function syncFields(): void {
    const { settings } = app;
    const tuning = makeTuning(settings.tuning);
    edoIn.value = String(tuning.size);
    periodIn.value = tuning.periodCents.toFixed(3).replace(/\.?0+$/, "");
    tuningNote.textContent = `${tuning.name} — ${tuning.note}.`;
    tuneIn.value = String(settings.aHz);
    centerRegSel.value = String(settings.centerRegister);
    fillSelect(
      centerDegSel,
      degreeNames(tuning).map((name, degree) => ({ value: String(degree), label: name })),
      String(settings.centerDegree)
    );
    sustainModeSel.value = settings.sustainMode;
    midiModeSel.value = settings.midiMode;
    midiVelocityIn.checked = settings.midiVelocity;
    midiAutoIn.checked = settings.midiAutoConnect;
    midiStatus.textContent = describeMidiStatus(app.midi.status, app.midi.devices);
    midiConnectBtn.disabled = app.midi.status === "unsupported" || app.midi.status === "requesting";
    rootFollowsIn.checked = settings.rootFollowsCenter;
    outScaleSel.value = settings.outOfScale;
    labelSel.value = settings.labels;
    dimDupIn.checked = settings.dimDuplicates;
    dupModeSel.value = settings.duplicateMode;
    reallocNote.textContent = describeDuplicateMode(app);
    jiLimitSel.value = String(settings.jiLimit);
    renderDegreeEditor();
    glowIn.value = String(settings.glow);
    storeNote.textContent = app.storageAvailable
      ? "Settings are saved in this browser."
      : "Storage unavailable here — settings last for this session only.";
  }

  function renderMapEditor(): void {
    const { upLeft } = app.model.vectors;
    mapEditor.replaceChildren();
    let echoes = 0;

    // The code draws the top row first. Each row has an offset, as on a
    // physical keyboard.
    for (let row = MAP_ROWS - 1; row >= 0; row--) {
      const rowEl = document.createElement("div");
      rowEl.className = "mapRow";
      rowEl.style.marginLeft = `${(MAP_ROWS - 1 - row) * 10}px`;

      const offset = (row - CENTER_ROW) * upLeft;
      const tag = document.createElement("span");
      tag.className = "rowTag";
      tag.textContent = `${offset >= 0 ? "+" : "−"}${Math.abs(offset)} st`;
      rowEl.appendChild(tag);

      for (let col = 0; col < MAP_COLS; col++) {
        const code = app.settings.rows[row][col];
        const { step, duplicate } = app.keyCell(col, row);
        const echo = Boolean(code) && duplicate;
        if (echo) echoes++;
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = code ? "cell" : "cell empty";
        if (echo) cell.classList.add("echo");
        cell.textContent = code ? keyLabel(code, app.settings.keyLabels) : "·";
        cell.title =
          `${app.model.name(step)}${app.model.register(step)}${code ? ` — ${code}` : " — unassigned"}` +
          (echo ? " — already in the main area" : "");
        if (capturing && capturing.row === row && capturing.col === col) {
          cell.classList.add("arming");
          cell.textContent = "…";
        }
        cell.addEventListener("click", () => {
          capturing = { row, col };
          captureHint.textContent = "Press a key for this cell (Backspace clears, Esc cancels)";
          renderMapEditor();
        });
        rowEl.appendChild(cell);
      }
      mapEditor.appendChild(rowEl);
    }

    const mapped = app.settings.rows.flat().filter((code) => code !== null).length;
    mapSummary.textContent = echoes
      ? `${echoes} of ${mapped} mapped keys play notes the main area already carries — greyed above. "Repeated bands play" in Appearance can put them to work.`
      : `All ${mapped} mapped keys play distinct notes.`;
  }

  function handleCapture(event: KeyboardEvent): void {
    event.preventDefault();
    // Ignore a modifier key. Wait for a key that can play a note.
    if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
    const target = capturing;
    if (!target) return;

    if (event.code === "Escape") {
      capturing = null;
      captureHint.textContent = "";
      renderMapEditor();
      return;
    }

    if (event.code === "Backspace" || event.code === "Delete") {
      app.settings.rows[target.row][target.col] = null;
      captureHint.textContent = "Cell cleared.";
    } else {
      // A key code can have one cell only. Clear its previous cell.
      app.settings.rows.forEach((row, r) =>
        row.forEach((code, c) => {
          if (code === event.code && !(r === target.row && c === target.col)) app.settings.rows[r][c] = null;
        })
      );
      app.settings.rows[target.row][target.col] = event.code;
      if (event.key.length === 1) app.settings.keyLabels[event.code] = event.key;
      captureHint.textContent = `Assigned ${keyLabel(event.code, app.settings.keyLabels)} (${event.code}).`;
    }

    capturing = null;
    app.apply();
  }
}

function describeDuplicateMode(app: App): string {
  const { east, upLeft } = app.model.vectors;
  const stride = latticeStride(east, upLeft);
  const where = `${app.model.layout.name} in ${app.model.tuning.name}`;

  if (app.settings.duplicateMode === "octave") {
    const period = app.model.tuning.octaveBased ? "octave" : "period";
    const plain = app.keyboardReach("repeat");
    const wider = app.keyboardReach("octave");
    const gain =
      wider.span > plain.span
        ? `Your key mapping now reaches ${wider.count} notes across ${wider.periods.toFixed(1)} ${period}s, against ${plain.count} across ${plain.periods.toFixed(1)}.`
        : `${where} does not repeat within reach of your key mapping, so there is nothing here to gain — the effect shows on the board when you pan.`;
    return `Each repeated band plays one ${period} beyond the last instead of the same notes again, keeping the same fingering and the same scale degrees. ${gain}`;
  }
  if (app.settings.duplicateMode === "fill") {
    return stride > 1
      ? `${where} reaches only every ${ordinal(stride)} step; the spare bands play ${stride === 2 ? "the notes in between" : `the other ${stride - 1} in each group of ${stride}`}. Those notes are outside the scale, so masking may hide them.`
      : `${where} already reaches every note, so there is nothing to fill in — try "octaves" to widen the range instead.`;
  }
  return "The grid repeats each note; the copies play in unison with the main area.";
}

function ordinal(value: number): string {
  if (value === 2) return "second";
  if (value === 3) return "third";
  return `${value}th`;
}
