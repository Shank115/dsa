const codeLines = [
  "class Stack {",
  "  constructor(capacity) {",
  "    this.items = [];",
  "    this.capacity = capacity;",
  "  }",
  "  push(value) {",
  "    if (this.items.length === this.capacity) throw 'Overflow';",
  "    this.items.push(value);",
  "  }",
  "  pop() {",
  "    if (this.items.length === 0) throw 'Underflow';",
  "    return this.items.pop();",
  "  }",
  "  peek() {",
  "    if (this.items.length === 0) return undefined;",
  "    return this.items[this.items.length - 1];",
  "  }",
  "}"
];

let initial = [];
let operations = [];
let capacity = 6;
let steps = [];
let current = 0;
let timer = null;

function buildCode(activeLine = -1) {
  document.getElementById("code").innerHTML =
    codeLines.map((line, i) =>
      `<span class="${i + 1 === activeLine ? "active-line" : ""}">${
        i + 1
      }. ${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`
    ).join("\n");
}

// Each step stores a full snapshot of the stack so Previous/Next is trivial.
function createSteps() {
  steps = [];
  const items = [...initial];
  const out = [];

  steps.push({
    items: [...items], out: [], op: "—",
    line: 3,
    message: `Stack created with ${items.length} element(s), capacity ${capacity}.`
  });

  for (const op of operations) {
    const label = op.type === "push" ? `push ${op.value}` : op.type;

    if (op.type === "push") {
      steps.push({
        items: [...items], out: [...out], op: label,
        line: 7, error: items.length === capacity,
        message: items.length === capacity
          ? `Stack Overflow! Cannot push ${op.value}: the stack is full (${capacity}/${capacity}).`
          : `Check for space: ${items.length}/${capacity} used. Room to push ${op.value}.`
      });

      if (items.length === capacity) continue;

      items.push(op.value);
      steps.push({
        items: [...items], out: [...out], op: label,
        line: 8, highlight: "pushed",
        message: `Pushed ${op.value} on top. It is the new top.`
      });
    } else if (op.type === "pop") {
      if (items.length === 0) {
        steps.push({
          items: [], out: [...out], op: label,
          line: 11, error: true,
          message: "Stack Underflow! Cannot pop from an empty stack."
        });
        continue;
      }

      const value = items[items.length - 1];
      steps.push({
        items: [...items], out: [...out], op: label,
        line: 12, highlight: "popping",
        message: `Pop removes the top element: ${value}.`
      });

      items.pop();
      out.push({ value, kind: "popped" });
      steps.push({
        items: [...items], out: [...out], op: label,
        line: 12,
        message: items.length
          ? `Popped ${value}. New top is ${items[items.length - 1]}.`
          : `Popped ${value}. The stack is now empty.`
      });
    } else {
      if (items.length === 0) {
        steps.push({
          items: [], out: [...out], op: label,
          line: 15, error: true,
          message: "Peek on an empty stack returns nothing."
        });
        continue;
      }

      const value = items[items.length - 1];
      out.push({ value, kind: "peeked" });
      steps.push({
        items: [...items], out: [...out], op: label,
        line: 16, highlight: "peeking",
        message: `Peek looks at the top element (${value}) without removing it.`
      });
    }
  }

  const last = steps[steps.length - 1];
  steps.push({
    ...last, highlight: null, error: false,
    line: -1,
    message: `✅ All operations done. Final stack size: ${last.items.length}.`
  });
}

function renderStep() {
  const step = steps[current];
  const top = step.items.length - 1;

  const cells = step.items.map((value, index) => {
    const isTop = index === top;
    const state = isTop && step.highlight ? step.highlight : "";
    return `
      <div class="cell ${state} ${isTop ? "top" : ""}">
        <small>${index}</small>
        <strong>${value}</strong>
      </div>
    `;
  });

  for (let i = step.items.length; i < capacity; i++) {
    cells.push(`<div class="cell slot ${step.error && step.items.length === capacity ? "error" : ""}"></div>`);
  }

  const stackEl = document.getElementById("stack");
  stackEl.innerHTML = cells.join("");
  stackEl.style.borderColor = step.error ? "#f87171" : "";

  document.getElementById("out").innerHTML =
    step.out.map(o => `<span class="chip ${o.kind}">${o.value}</span>`).join("");

  const message = document.getElementById("message");
  message.textContent = step.message;
  message.className = step.error ? "error" : "";

  document.getElementById("pointers").textContent =
    `Top: ${top < 0 ? "—" : step.items[top]} | Size: ${step.items.length} | Operation: ${step.op}`;

  document.getElementById("counter").textContent =
    `Step: ${current + 1} / ${steps.length}`;

  buildCode(step.line);

  document.getElementById("prev").disabled = current === 0;
  document.getElementById("next").disabled =
    current === steps.length - 1;
}

function parseOperations(raw) {
  const parsed = [];

  for (const part of raw.split(",").map(p => p.trim().toLowerCase())) {
    if (part === "pop" || part === "peek") {
      parsed.push({ type: part });
      continue;
    }

    const match = part.match(/^push\s+(-?\d+(\.\d+)?)$/);
    if (!match) return null;
    parsed.push({ type: "push", value: Number(match[1]) });
  }

  return parsed;
}

function startStack() {
  stopPlay();

  const capInput = Number(document.getElementById("capacity").value);
  if (!Number.isInteger(capInput) || capInput < 1 || capInput > 12) {
    alert("Capacity must be a whole number from 1 to 12.");
    return;
  }

  const rawInitial = document.getElementById("initial").value.trim();
  const values = rawInitial ? rawInitial.split(",").map(v => v.trim()) : [];

  if (values.some(v => v === "" || !Number.isFinite(Number(v)))) {
    alert("Please enter the initial stack as comma-separated numbers (or leave it empty).");
    return;
  }

  if (values.length > capInput) {
    alert("The initial stack has more elements than the capacity.");
    return;
  }

  const rawOps = document.getElementById("operations").value.trim();
  const ops = rawOps ? parseOperations(rawOps) : [];

  if (ops === null) {
    alert("Operations must look like: push 5, pop, peek");
    return;
  }

  capacity = capInput;
  initial = values.map(Number);
  operations = ops;
  createSteps();
  current = 0;

  document.getElementById("next").disabled = false;
  document.getElementById("play").disabled = false;

  renderStep();
}

function move(direction) {
  stopPlay();

  current = Math.max(
    0,
    Math.min(current + direction, steps.length - 1)
  );

  renderStep();
}

function togglePlay() {
  if (timer !== null) {
    stopPlay();
    return;
  }

  if (current >= steps.length - 1) {
    current = 0;
    renderStep();
  }

  document.getElementById("play").textContent = "Pause";

  timer = setInterval(() => {
    if (current >= steps.length - 1) {
      stopPlay();
      return;
    }

    current++;
    renderStep();

    if (current >= steps.length - 1) {
      stopPlay();
    }
  }, 1000);
}

function stopPlay() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }

  document.getElementById("play").textContent = "Auto Play";
}

function resetStack() {
  stopPlay();
  current = 0;

  if (steps.length) {
    renderStep();
  } else {
    document.getElementById("stack").innerHTML = "";
    document.getElementById("out").innerHTML = "";
    document.getElementById("message").textContent =
      "Enter operations and run them.";
    document.getElementById("pointers").textContent =
      "Top: — | Size: 0 | Operation: —";
    document.getElementById("counter").textContent =
      "Step: 0 / 0";
    document.getElementById("next").disabled = true;
    document.getElementById("prev").disabled = true;
    document.getElementById("play").disabled = true;
    buildCode();
  }
}

function randomOperations() {
  const ops = [];
  let size = 0;

  for (let i = 0; i < 8; i++) {
    const roll = Math.random();

    if (size === 0 || roll < 0.55) {
      ops.push(`push ${Math.floor(Math.random() * 90) + 1}`);
      size++;
    } else if (roll < 0.85) {
      ops.push("pop");
      size--;
    } else {
      ops.push("peek");
    }
  }

  document.getElementById("initial").value = "";
  document.getElementById("operations").value = ops.join(", ");

  startStack();
}

buildCode();
startStack();
