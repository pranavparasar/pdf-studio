
/* ==========================================
   PDF STUDIO - WEBGLOBE
   Created by PRANAV PARASAR
   PDF.js + PDF-Lib
========================================== */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $ = id => document.getElementById(id);

const pdf = $("pdf");
const over = $("overlay");

const ctx = pdf.getContext("2d");
const ox = over.getContext("2d");

const state = {
  bytes: null,
  js: null,
  lib: null,
  name: "",
  page: 1,
  scale: 1,
  dpr: 1,
  mode: "select",
  marks: {},
  drawing: false,
  start: null,
  stroke: null,
  undoStack: [],
  redoStack: [],
  textItems: [],
  editing: false
};

/* ==========================================
   BASIC FUNCTIONS
========================================== */

function say(message) {
  $("status").textContent = message;
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    $("toast").classList.remove("show");
  }, 2400);
}

function copy(bytes) {
  return new Uint8Array(bytes).slice();
}

function currentMarks() {
  return state.marks[state.page] || [];
}

function updateHistoryButtons() {
  $("undoBtn").disabled = state.undoStack.length === 0;
  $("redoBtn").disabled = state.redoStack.length === 0;
}

function snapshot() {
  return JSON.stringify(state.marks);
}

function recordHistory() {
  state.undoStack.push(snapshot());

  if (state.undoStack.length > 100) {
    state.undoStack.shift();
  }

  state.redoStack = [];
  updateHistoryButtons();
}

function undo() {
  if (!state.undoStack.length) return;

  state.redoStack.push(snapshot());

  const previous = state.undoStack.pop();
  state.marks = JSON.parse(previous);

  updateHistoryButtons();
  drawMarks();

  say("Last action undone.");
}

function redo() {
  if (!state.redoStack.length) return;

  state.undoStack.push(snapshot());

  const next = state.redoStack.pop();
  state.marks = JSON.parse(next);

  updateHistoryButtons();
  drawMarks();

  say("Action restored.");
}

function resetHistory() {
  state.undoStack = [];
  state.redoStack = [];
  updateHistoryButtons();
}

function controls(enabled) {
  [
    "downloadBtn",
    "prev",
    "next",
    "pageNo",
    "minus",
    "plus",
    "fit",
    "rotate",
    "remove",
    "split",
    "undoBtn",
    "redoBtn"
  ].forEach(id => {
    $(id).disabled = !enabled;
  });

  if (enabled) updateHistoryButtons();
}

/* ==========================================
   OPEN PDF
========================================== */

async function openFile(file) {
  if (!file) return;

  try {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Not a PDF file");
    }

    say("Opening PDF...");

    state.bytes = new Uint8Array(await file.arrayBuffer());

    state.lib = await PDFLib.PDFDocument.load(
      copy(state.bytes)
    );

    state.js = await pdfjsLib.getDocument({
      data: copy(state.bytes)
    }).promise;

    state.name = file.name;
    state.page = 1;
    state.scale = 1;
    state.marks = {};
    state.textItems = [];

    resetHistory();

    $("fileName").textContent = file.name;
    $("fileInfo").textContent = state.js.numPages + " pages";
    $("docTitle").textContent = file.name;

    $("welcome").hidden = true;
    $("pagewrap").hidden = false;

    controls(true);

    await render();

    toast("PDF opened successfully!");

  } catch (error) {
    console.error(error);
    toast("Could not open PDF. It may be damaged or password-protected.");
    say("Open failed");
  }
}

/* ==========================================
   PDF RENDERING
========================================== */

async function render() {
  if (!state.js) return;

  const page = await state.js.getPage(state.page);

  const viewport = page.getViewport({
    scale: state.scale
  });

  const maxWidth = $("stage").clientWidth - 55;

  if (viewport.width > maxWidth && state.scale === 1) {
    state.scale = Math.max(0.35, maxWidth / viewport.width);
    return render();
  }

  state.dpr = Math.max(1, window.devicePixelRatio || 1);

  const outputScale = state.dpr;

  pdf.width = Math.ceil(viewport.width * outputScale);
  pdf.height = Math.ceil(viewport.height * outputScale);

  pdf.style.width = `${viewport.width}px`;
  pdf.style.height = `${viewport.height}px`;

  over.width = pdf.width;
  over.height = pdf.height;

  over.style.width = `${viewport.width}px`;
  over.style.height = `${viewport.height}px`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  await page.render({
    canvasContext: ctx,
    viewport,
    transform: [
      outputScale, 0, 0,
      outputScale, 0, 0
    ]
  }).promise;

  ox.setTransform(
    outputScale, 0, 0,
    outputScale, 0, 0
  );

  $("pageNo").value = state.page;
  $("pages").textContent = state.js.numPages;
  $("zoom").textContent = Math.round(state.scale * 100) + "%";

  $("prev").disabled = state.page === 1;
  $("next").disabled = state.page === state.js.numPages;

  await loadTextItems();
  drawMarks();

  say(`Page ${state.page} of ${state.js.numPages}`);
}

/* ==========================================
   LOAD EXISTING PDF TEXT
========================================== */

async function loadTextItems() {
  if (!state.js) return;

  const page = await state.js.getPage(state.page);

  const viewport = page.getViewport({
    scale: 1
  });

  const content = await page.getTextContent();

  state.textItems = content.items
    .filter(item => item.str && item.str.trim())
    .map(item => {
      const tx = pdfjsLib.Util.transform(
        viewport.transform,
        item.transform
      );

      const height = Math.hypot(tx[2], tx[3]);
      const width = item.width;

      return {
        text: item.str,
        x: tx[4],
        y: tx[5] - height,
        width: width,
        height: height,
        fontName: item.fontName || "",
        fontSize: height
      };
    });
}

/* ==========================================
   DRAW ANNOTATIONS
========================================== */

function drawMarks() {
  ox.clearRect(
    0,
    0,
    over.width / state.dpr,
    over.height / state.dpr
  );

  const items = currentMarks();

  items.forEach(item => {
    const s = state.scale;

    if (item.type === "text") {
      ox.fillStyle = item.color;
      ox.font = `${item.size * s}px Arial`;

      ox.fillText(
        item.text,
        item.x * s,
        item.y * s
      );
    }

    else if (item.type === "draw") {
      ox.strokeStyle = item.color;
      ox.lineWidth = item.width * s;
      ox.lineCap = "round";
      ox.lineJoin = "round";

      ox.beginPath();

      item.points.forEach((point, index) => {
        const x = point.x * s;
        const y = point.y * s;

        if (index === 0) ox.moveTo(x, y);
        else ox.lineTo(x, y);
      });

      ox.stroke();
    }

    else if (item.type === "highlight") {
      ox.fillStyle = item.color;
      ox.globalAlpha = 0.28;

      ox.fillRect(
        item.x * s,
        item.y * s,
        item.w * s,
        item.h * s
      );

      ox.globalAlpha = 1;
    }

    else if (item.type === "replace") {
      ox.fillStyle = "#ffffff";

      ox.fillRect(
        item.x * s - 1,
        item.y * s - 1,
        item.w * s + 2,
        item.h * s + 2
      );

      ox.fillStyle = item.color || "#000000";
      ox.font = `${item.size * s}px Arial`;

      ox.fillText(
        item.text,
        item.x * s,
        (item.y + item.size) * s
      );
    }
  });
}

/* ==========================================
   EDITING MODES
========================================== */

function setMode(mode) {
  state.mode = mode;

  document.querySelectorAll("[data-mode]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.mode === mode
    );
  });

  over.style.cursor =
    mode === "text" ? "text" :
    mode === "select" ? "text" :
    "crosshair";

  toast(
    mode === "select"
      ? "Select existing text to edit"
      : mode + " mode activated"
  );
}

/* ==========================================
   POINTER POSITION
========================================== */

function point(event) {
  const rect = over.getBoundingClientRect();

  return {
    x: (event.clientX - rect.left) / state.scale,
    y: (event.clientY - rect.top) / state.scale
  };
}

/* ==========================================
   FIND EXISTING TEXT
========================================== */

function findTextAt(position) {
  const x = position.x;
  const y = position.y;

  return state.textItems.find(item => {
    return (
      x >= item.x - 3 &&
      x <= item.x + item.width + 3 &&
      y >= item.y - 3 &&
      y <= item.y + item.height + 3
    );
  });
}

/* ==========================================
   EDIT EXISTING PDF TEXT
========================================== */

function editExistingText(position) {
  const item = findTextAt(position);

  if (!item) {
    toast("Click directly on existing PDF text.");
    return;
  }

  const replacement = prompt(
    "Edit existing PDF text:",
    item.text
  );

  if (replacement === null || replacement === item.text) {
    return;
  }

  if (!replacement.trim()) {
    toast("Replacement text cannot be empty.");
    return;
  }

  recordHistory();

  const approximateWidth = Math.max(
    item.width,
    replacement.length * item.fontSize * 0.48
  );

  const mark = {
    type: "replace",
    original: item.text,
    text: replacement,
    x: item.x,
    y: item.y,
    w: approximateWidth,
    h: item.height,
    size: item.fontSize,
    color: "#000000"
  };

  (state.marks[state.page] ||= []).push(mark);

  drawMarks();

  say("Text replacement added. Download to save.");
  toast("Text edited. Check the layout before downloading.");
}

/* ==========================================
   POINTER DOWN
========================================== */

over.addEventListener("pointerdown", event => {
  if (!state.js) return;

  const position = point(event);
  const color = $("color").value;

  if (state.mode === "select") {
    editExistingText(position);
    return;
  }

  if (state.mode === "text") {
    const text = prompt("Enter the text to add:");

    if (text) {
      recordHistory();

      (state.marks[state.page] ||= []).push({
        type: "text",
        text,
        x: position.x,
        y: position.y,
        color,
        size: Number($("fontSize").value) || 18
      });

      drawMarks();
      say("Text added. Download to save.");
    }

    return;
  }

  state.drawing = true;
  state.start = position;

  over.setPointerCapture(event.pointerId);

  if (state.mode === "draw") {
    state.stroke = {
      type: "draw",
      points: [position],
      color,
      width: 2.5
    };
  }
});

/* ==========================================
   POINTER MOVE
========================================== */

over.addEventListener("pointermove", event => {
  if (!state.drawing) return;

  const position = point(event);

  if (state.mode === "draw") {
    state.stroke.points.push(position);
  }

  drawMarks();

  if (state.mode === "draw") {
    const stroke = state.stroke;

    ox.strokeStyle = stroke.color;
    ox.lineWidth = stroke.width * state.scale;
    ox.lineCap = "round";
    ox.lineJoin = "round";

    ox.beginPath();

    stroke.points.forEach((p, index) => {
      const x = p.x * state.scale;
      const y = p.y * state.scale;

      if (index === 0) ox.moveTo(x, y);
      else ox.lineTo(x, y);
    });

    ox.stroke();
  }

  else if (state.mode === "highlight") {
    ox.fillStyle = $("color").value;
    ox.globalAlpha = 0.28;

    ox.fillRect(
      state.start.x * state.scale,
      state.start.y * state.scale,
      (position.x - state.start.x) * state.scale,
      (position.y - state.start.y) * state.scale
    );

    ox.globalAlpha = 1;
  }
});

/* ==========================================
   FINISH DRAWING
========================================== */

function finish(event) {
  if (!state.drawing) return;

  state.drawing = false;

  const position = point(event);
  const color = $("color").value;

  let newMark = null;

  if (
    state.mode === "draw" &&
    state.stroke &&
    state.stroke.points.length > 1
  ) {
    newMark = state.stroke;
  }

  if (state.mode === "highlight") {
    const w = Math.abs(position.x - state.start.x);
    const h = Math.abs(position.y - state.start.y);

    if (w > 2 && h > 2) {
      newMark = {
        type: "highlight",
        x: Math.min(position.x, state.start.x),
        y: Math.min(position.y, state.start.y),
        w,
        h,
        color
      };
    }
  }

  if (newMark) {
    recordHistory();
    (state.marks[state.page] ||= []).push(newMark);
    say("Annotation added. Download to save.");
  }

  state.stroke = null;
  drawMarks();
}

over.addEventListener("pointerup", finish);
over.addEventListener("pointercancel", finish);

/* ==========================================
   RELOAD PDF
========================================== */

async function reload() {
  state.bytes = await state.lib.save();

  state.js = await pdfjsLib.getDocument({
    data: copy(state.bytes)
  }).promise;

  state.page = Math.min(state.page, state.js.numPages);

  $("fileInfo").textContent = state.js.numPages + " pages";

  await render();
}

/* ==========================================
   COLOR CONVERSION
========================================== */

function rgb(hex) {
  const number = parseInt(hex.slice(1), 16);

  return {
    r: ((number >> 16) & 255) / 255,
    g: ((number >> 8) & 255) / 255,
    b: (number & 255) / 255
  };
}

/* ==========================================
   DOWNLOAD PDF
========================================== */

async function download(pdfDocument, filename) {
  const bytes = await pdfDocument.save();

  const blob = new Blob(
    [bytes],
    { type: "application/pdf" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

/* ==========================================
   SAVE EDITED PDF
========================================== */

async function save() {
  try {
    say("Preparing PDF...");

    const document = await PDFLib.PDFDocument.load(
      copy(state.bytes)
    );

    const font = await document.embedFont(
      PDFLib.StandardFonts.Helvetica
    );

    const boldFont = await document.embedFont(
      PDFLib.StandardFonts.HelveticaBold
    );

    for (const [number, items] of Object.entries(state.marks)) {
      const page = document.getPage(Number(number) - 1);
      const height = page.getSize().height;

      for (const item of items) {
        const color = rgb(item.color || "#000000");

        if (item.type === "text") {
          page.drawText(item.text, {
            x: item.x,
            y: height - item.y - item.size,
            size: item.size,
            font,
            color: PDFLib.rgb(color.r, color.g, color.b)
          });
        }

        else if (item.type === "highlight") {
          page.drawRectangle({
            x: item.x,
            y: height - item.y - item.h,
            width: item.w,
            height: item.h,
            color: PDFLib.rgb(color.r, color.g, color.b),
            opacity: 0.28,
            borderWidth: 0
          });
        }

        else if (item.type === "draw") {
          for (let index = 1; index < item.points.length; index++) {
            const a = item.points[index - 1];
            const b = item.points[index];

            page.drawLine({
              start: {
                x: a.x,
                y: height - a.y
              },
              end: {
                x: b.x,
                y: height - b.y
              },
              thickness: item.width,
              color: PDFLib.rgb(color.r, color.g, color.b)
            });
          }
        }

        else if (item.type === "replace") {
          /*
            Cover the old text and redraw replacement.
            This is an approximation, not true PDF text-stream editing.
          */

          page.drawRectangle({
            x: item.x,
            y: height - item.y - item.h,
            width: item.w,
            height: item.h + 2,
            color: PDFLib.rgb(1, 1, 1),
            borderWidth: 0
          });

          page.drawText(item.text, {
            x: item.x,
            y: height - item.y - item.size,
            size: item.size,
            font: item.bold ? boldFont : font,
            color: PDFLib.rgb(color.r, color.g, color.b)
          });
        }
      }
    }

    await download(
      document,
      state.name.replace(/\.pdf$/i, "") + "-edited.pdf"
    );

    say("Download ready");
    toast("Edited PDF downloaded!");

  } catch (error) {
    console.error(error);
    toast("Could not save PDF.");
    say("Save failed");
  }
}

/* ==========================================
   ROTATE PAGE
========================================== */

async function rotate() {
  const page = state.lib.getPage(state.page - 1);
  const angle = page.getRotation().angle;

  page.setRotation(
    PDFLib.degrees((angle + 90) % 360)
  );

  await reload();
  toast("Page rotated. Download to save.");
}

/* ==========================================
   DELETE PAGE
========================================== */

async function remove() {
  if (state.lib.getPageCount() <= 1) {
    toast("A PDF must contain at least one page.");
    return;
  }

  if (!confirm(`Delete page ${state.page}?`)) return;

  state.lib.removePage(state.page - 1);
  delete state.marks[state.page];

  resetHistory();

  await reload();

  toast("Page deleted. Download to save.");
}

/* ==========================================
   DOWNLOAD CURRENT PAGE
========================================== */

async function split() {
  try {
    const source = await PDFLib.PDFDocument.load(
      copy(state.bytes)
    );

    const output = await PDFLib.PDFDocument.create();

    const [page] = await output.copyPages(
      source,
      [state.page - 1]
    );

    output.addPage(page);

    await download(output, `page-${state.page}.pdf`);

    toast("Current page downloaded.");

  } catch (error) {
    console.error(error);
    toast("Could not extract page.");
  }
}

/* ==========================================
   MERGE PDF FILES
========================================== */

async function merge(files) {
  if (!files.length) return;

  try {
    const document = await PDFLib.PDFDocument.load(
      copy(state.bytes)
    );

    for (const file of files) {
      const other = await PDFLib.PDFDocument.load(
        new Uint8Array(await file.arrayBuffer())
      );

      const pages = await document.copyPages(
        other,
        other.getPageIndices()
      );

      pages.forEach(page => document.addPage(page));
    }

    state.lib = document;
    state.marks = {};

    resetHistory();

    await reload();

    toast("PDFs merged. Download to save.");

  } catch (error) {
    console.error(error);
    toast("Merge failed. Check the selected PDF files.");
  }
}

/* ==========================================
   BUTTON EVENTS
========================================== */

$("openBtn").onclick =
$("welcomeOpen").onclick = () => {
  $("fileInput").click();
};

$("fileInput").onchange = event => {
  openFile(event.target.files[0]);
  event.target.value = "";
};

$("downloadBtn").onclick = save;

$("undoBtn").onclick = undo;
$("redoBtn").onclick = redo;

$("prev").onclick = () => {
  if (state.page > 1) {
    state.page--;
    render();
  }
};

$("next").onclick = () => {
  if (state.js && state.page < state.js.numPages) {
    state.page++;
    render();
  }
};

$("pageNo").onchange = event => {
  const number = Number(event.target.value);

  if (number >= 1 && number <= state.js.numPages) {
    state.page = number;
    render();
  } else {
    event.target.value = state.page;
  }
};

/* ZOOM IN */

$("plus").onclick = () => {
  state.scale = Math.min(3, state.scale + 0.15);
  render();
};

/* ZOOM OUT */

$("minus").onclick = () => {
  state.scale = Math.max(0.35, state.scale - 0.15);
  render();
};

/* FIT PAGE */

$("fit").onclick = () => {
  state.scale = 1;
  render();
};

/* PAGE TOOLS */

$("rotate").onclick = rotate;
$("remove").onclick = remove;
$("split").onclick = split;

/* MERGE */

$("merge").onclick = () => {
  $("mergeInput").click();
};

$("mergeInput").onchange = event => {
  merge([...event.target.files]);
  event.target.value = "";
};

/* EDITING MODES */

document.querySelectorAll("[data-mode]").forEach(button => {
  button.onclick = () => setMode(button.dataset.mode);
});

/* WINDOW RESIZE */

window.addEventListener("resize", () => {
  if (state.js) render();
});

/* ==========================================
   END OF PDF STUDIO
   WEBGLOBE - PRANAV PARASAR
========================================== */
