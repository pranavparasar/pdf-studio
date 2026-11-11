
/* ==========================================
   PDF STUDIO - HIGH DEFINITION VERSION
   PDF.js + PDF-Lib by Pranav Parasar
========================================== */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $ = (id) => document.getElementById(id);

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
  stroke: null
};

const pdf = $("pdf");
const over = $("overlay");

const ctx = pdf.getContext("2d");
const ox = over.getContext("2d");

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
    "split"
  ].forEach(id => {
    $(id).disabled = !enabled;
  });
}

/* ==========================================
   OPEN PDF FILE
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

    toast(
      "Could not open PDF. It may be damaged or password-protected."
    );

    say("Open failed");
  }
}

/* ==========================================
   HIGH DEFINITION PDF RENDERING
========================================== */

async function render() {
  if (!state.js) return;

  const page = await state.js.getPage(state.page);

  const viewport = page.getViewport({
    scale: state.scale
  });

  /* Automatically fit the page inside the viewer */

  const maxWidth = $("stage").clientWidth - 55;

  if (viewport.width > maxWidth && state.scale === 1) {
    state.scale = Math.max(
      0.35,
      maxWidth / viewport.width
    );

    return render();
  }

  /*
     HIGH DPI FIX:
     Render at the actual screen pixel density.
     This improves text, images and fine details.
  */

  state.dpr = Math.max(
    1,
    window.devicePixelRatio || 1
  );

  const outputScale = state.dpr;

  /* Actual canvas resolution */

  pdf.width = Math.ceil(
    viewport.width * outputScale
  );

  pdf.height = Math.ceil(
    viewport.height * outputScale
  );

  /* Display size remains in CSS pixels */

  pdf.style.width = `${viewport.width}px`;
  pdf.style.height = `${viewport.height}px`;

  /* Overlay canvas must have the same resolution */

  over.width = pdf.width;
  over.height = pdf.height;

  over.style.width = `${viewport.width}px`;
  over.style.height = `${viewport.height}px`;

  /* Reset PDF canvas transformation */

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  /* Render PDF at high resolution */

  const renderTask = page.render({
    canvasContext: ctx,
    viewport: viewport,
    transform: [
      outputScale,
      0,
      0,
      outputScale,
      0,
      0
    ]
  });

  await renderTask.promise;

  /* Set annotation canvas to the same HD scale */

  ox.setTransform(
    outputScale,
    0,
    0,
    outputScale,
    0,
    0
  );

  /* Update page information */

  $("pageNo").value = state.page;
  $("pages").textContent = state.js.numPages;

  $("zoom").textContent =
    Math.round(state.scale * 100) + "%";

  $("prev").disabled = state.page === 1;

  $("next").disabled =
    state.page === state.js.numPages;

  drawMarks();

  say(`Page ${state.page} of ${state.js.numPages}`);
}

/* ==========================================
   DRAW SAVED ANNOTATIONS
========================================== */

function drawMarks() {

  /* Clear overlay in CSS-pixel coordinates */

  ox.clearRect(
    0,
    0,
    over.width / state.dpr,
    over.height / state.dpr
  );

  const items = state.marks[state.page] || [];

  items.forEach(item => {

    if (item.type === "text") {

      ox.fillStyle = item.color;

      ox.font =
        `${item.size * state.scale}px Arial`;

      ox.fillText(
        item.text,
        item.x * state.scale,
        item.y * state.scale
      );

    }

    else if (item.type === "draw") {

      ox.strokeStyle = item.color;

      ox.lineWidth =
        item.width * state.scale;

      ox.lineCap = "round";
      ox.lineJoin = "round";

      ox.beginPath();

      item.points.forEach((point, index) => {

        const x = point.x * state.scale;
        const y = point.y * state.scale;

        if (index === 0) {
          ox.moveTo(x, y);
        } else {
          ox.lineTo(x, y);
        }

      });

      ox.stroke();

    }

    else if (item.type === "highlight") {

      ox.fillStyle = item.color;
      ox.globalAlpha = 0.28;

      ox.fillRect(
        item.x * state.scale,
        item.y * state.scale,
        item.w * state.scale,
        item.h * state.scale
      );

      ox.globalAlpha = 1;
    }

  });
}

/* ==========================================
   EDITING TOOLS
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
    mode === "text"
      ? "text"
      : mode === "select"
      ? "default"
      : "crosshair";

  toast(
    mode === "select"
      ? "Select mode"
      : mode + " mode activated"
  );
}

/* Convert mouse position into PDF coordinates */

function point(event) {

  const rect = over.getBoundingClientRect();

  return {

    x:
      (event.clientX - rect.left) /
      state.scale,

    y:
      (event.clientY - rect.top) /
      state.scale

  };
}

/* ==========================================
   POINTER DOWN
========================================== */

over.addEventListener("pointerdown", event => {

  if (!state.js || state.mode === "select") {
    return;
  }

  const position = point(event);
  const color = $("color").value;

  /* ADD TEXT */

  if (state.mode === "text") {

    const text = prompt("Enter the text to add:");

    if (text) {

      (state.marks[state.page] ||= []).push({

        type: "text",
        text: text,
        x: position.x,
        y: position.y,
        color: color,
        size: Number($("fontSize").value) || 18

      });

      drawMarks();

      say("Text added. Download to save.");
    }

    return;
  }

  /* DRAW OR HIGHLIGHT */

  state.drawing = true;
  state.start = position;

  over.setPointerCapture(event.pointerId);

  if (state.mode === "draw") {

    state.stroke = {

      type: "draw",
      points: [position],
      color: color,
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

  /* FREEHAND DRAWING */

  if (state.mode === "draw") {

    const stroke = state.stroke;

    ox.strokeStyle = stroke.color;

    ox.lineWidth =
      stroke.width * state.scale;

    ox.lineCap = "round";
    ox.lineJoin = "round";

    ox.beginPath();

    stroke.points.forEach((p, index) => {

      const x = p.x * state.scale;
      const y = p.y * state.scale;

      if (index === 0) {
        ox.moveTo(x, y);
      } else {
        ox.lineTo(x, y);
      }

    });

    ox.stroke();

  }

  /* HIGHLIGHT AREA */

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

  /* SAVE DRAWING */

  if (
    state.mode === "draw" &&
    state.stroke.points.length > 1
  ) {

    (state.marks[state.page] ||= []).push(
      state.stroke
    );

  }

  /* SAVE HIGHLIGHT */

  if (state.mode === "highlight") {

    (state.marks[state.page] ||= []).push({

      type: "highlight",

      x: Math.min(position.x, state.start.x),
      y: Math.min(position.y, state.start.y),

      w: Math.abs(position.x - state.start.x),
      h: Math.abs(position.y - state.start.y),

      color: color

    });

  }

  state.stroke = null;

  drawMarks();

  say("Annotation added. Download to save.");

}

over.addEventListener("pointerup", finish);
over.addEventListener("pointercancel", finish);

/* ==========================================
   RELOAD MODIFIED PDF
========================================== */

async function reload() {

  state.bytes = await state.lib.save();

  state.js = await pdfjsLib.getDocument({
    data: copy(state.bytes)
  }).promise;

  state.page = Math.min(
    state.page,
    state.js.numPages
  );

  $("fileInfo").textContent =
    state.js.numPages + " pages";

  await render();
}

/* ==========================================
   COLOUR CONVERSION
========================================== */

function rgb(hex) {

  const number = parseInt(
    hex.slice(1),
    16
  );

  return {

    r: ((number >> 16) & 255) / 255,
    g: ((number >> 8) & 255) / 255,
    b: (number & 255) / 255

  };

}

/* ==========================================
   DOWNLOAD PDF
========================================== */

async function download(document, filename) {

  const bytes = await document.save();

  const blob = new Blob(
    [bytes],
    { type: "application/pdf" }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1200);

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

    for (const [number, items] of Object.entries(state.marks)) {

      const page = document.getPage(
        Number(number) - 1
      );

      const height = page.getSize().height;

      for (const item of items) {

        const color = rgb(item.color);

        /* SAVE TEXT */

        if (item.type === "text") {

          page.drawText(item.text, {

            x: item.x,
            y: height - item.y - item.size,

            size: item.size,
            font: font,

            color: PDFLib.rgb(
              color.r,
              color.g,
              color.b
            )

          });

        }

        /* SAVE HIGHLIGHT */

        else if (item.type === "highlight") {

          page.drawRectangle({

            x: item.x,
            y: height - item.y - item.h,

            width: item.w,
            height: item.h,

            color: PDFLib.rgb(
              color.r,
              color.g,
              color.b
            ),

            opacity: 0.28,
            borderWidth: 0

          });

        }

        /* SAVE DRAWING */

        else if (item.type === "draw") {

          for (
            let index = 1;
            index < item.points.length;
            index++
          ) {

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

              color: PDFLib.rgb(
                color.r,
                color.g,
                color.b
              )

            });

          }

        }

      }

    }

    await download(

      document,

      state.name.replace(/\.pdf$/i, "") +
      "-edited.pdf"

    );

    say("Download ready");

    toast("Edited PDF downloaded!");

  }

  catch (error) {

    console.error(error);

    toast("Could not save PDF.");

  }

}

/* ==========================================
   ROTATE PAGE
========================================== */

async function rotate() {

  const page = state.lib.getPage(
    state.page - 1
  );

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

  if (!confirm(`Delete page ${state.page}?`)) {
    return;
  }

  state.lib.removePage(state.page - 1);

  delete state.marks[state.page];

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

    await download(
      output,
      `page-${state.page}.pdf`
    );

    toast("Current page downloaded.");

  }

  catch (error) {

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

      pages.forEach(page => {
        document.addPage(page);
      });

    }

    state.lib = document;
    state.marks = {};

    await reload();

    toast("PDFs merged. Download to save.");

  }

  catch (error) {

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

$("prev").onclick = () => {

  if (state.page > 1) {

    state.page--;

    render();

  }

};

$("next").onclick = () => {

  if (
    state.js &&
    state.page < state.js.numPages
  ) {

    state.page++;

    render();

  }

};

$("pageNo").onchange = event => {

  const number = Number(event.target.value);

  if (
    number >= 1 &&
    number <= state.js.numPages
  ) {

    state.page = number;

    render();

  }

  else {

    event.target.value = state.page;

  }

};

/* ZOOM IN */

$("plus").onclick = () => {

  state.scale = Math.min(
    3,
    state.scale + 0.15
  );

  render();

};

/* ZOOM OUT */

$("minus").onclick = () => {

  state.scale = Math.max(
    0.35,
    state.scale - 0.15
  );

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

  button.onclick = () => {
    setMode(button.dataset.mode);
  };

});

/* RE-RENDER WHEN WINDOW SIZE CHANGES */

window.addEventListener("resize", () => {

  if (state.js) {
    render();
  }

});

/* ==========================================
   END OF PDF STUDIO SCRIPT THANK YOU :)
========================================== */
