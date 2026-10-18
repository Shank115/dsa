const codeLines = [
  "function binarySearch(arr, target) {",
  "  let low = 0, high = arr.length - 1;",
  "  while (low <= high) {",
  "    let mid = Math.floor((low + high) / 2);",
  "    if (arr[mid] === target) return mid;",
  "    if (arr[mid] < target) {",
  "      low = mid + 1;",
  "    } else {",
  "      high = mid - 1;",
  "    }",
  "  }",
  "  return -1;",
  "}"
];

let array = [];
let target = 0;
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

function createSteps() {
  steps = [];
  let low = 0;
  let high = array.length - 1;
  let comparisons = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    comparisons++;

    steps.push({
      low, high, mid, comparisons,
      line: 4,
      message: `Compare target ${target} with ${array[mid]}.`
    });

    if (array[mid] === target) {
      steps.push({
        low, high, mid, comparisons,
        line: 5,
        found: true,
        message: `🎉 Target ${target} found at index ${mid}!`
      });
      return;
    }

    if (array[mid] < target) {
      steps.push({
        low, high, mid, comparisons,
        line: 6,
        message: `${array[mid]} < ${target}. Search the right half.`
      });

      low = mid + 1;
    } else {
      steps.push({
        low, high, mid, comparisons,
        line: 8,
        message: `${array[mid]} > ${target}. Search the left half.`
      });

      high = mid - 1;
    }
  }

  steps.push({
    low, high, mid: -1, comparisons,
    line: 12,
    message: `Target ${target} was not found in the array.`
  });
}

function renderStep() {
  const step = steps[current];

  document.getElementById("array").innerHTML =
    array.map((value, index) => {
      const outside =
        index < step.low || index > step.high;
      const middle = index === step.mid;
      const found = step.found && middle;

      return `
        <div class="cell ${
          found ? "found" :
          middle ? "middle" :
          outside ? "outside" : ""
        }">
          <strong>${value}</strong>
          <small>Index ${index}</small>
        </div>
      `;
    }).join("");

  document.getElementById("message").textContent =
    step.message;

  document.getElementById("pointers").textContent =
    `Low: ${step.low} | Mid: ${
      step.mid < 0 ? "—" : step.mid
    } | High: ${step.high}`;

  document.getElementById("counter").textContent =
    `Comparisons: ${step.comparisons}`;

  buildCode(step.line);

  document.getElementById("prev").disabled = current === 0;
  document.getElementById("next").disabled =
    current === steps.length - 1;
}

function startSearch() {
  stopPlay();

  const raw = document.getElementById("numbers").value.trim();
  const values = raw.split(",").map(v => v.trim());

  if (!raw || values.some(v => v === "" || !Number.isFinite(Number(v)))) {
    alert("Please enter a valid comma-separated array.");
    return;
  }

  array = values.map(Number);

  if (array.some((v, i) => i > 0 && v < array[i - 1])) {
    alert("Please enter the array in ascending order.");
    return;
  }

  const targetInput = document.getElementById("target").value;

  if (targetInput.trim() === "" || !Number.isFinite(Number(targetInput))) {
    alert("Please enter a valid target.");
    return;
  }

  target = Number(targetInput);
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

function resetSearch() {
  stopPlay();
  current = 0;

  if (steps.length) {
    renderStep();
  } else {
    document.getElementById("array").innerHTML = "";
    document.getElementById("message").textContent =
      "Enter a target and start searching.";
    document.getElementById("pointers").textContent =
      "Low: — | Mid: — | High: —";
    document.getElementById("counter").textContent =
      "Comparisons: 0";
    document.getElementById("next").disabled = true;
    document.getElementById("prev").disabled = true;
    document.getElementById("play").disabled = true;
    buildCode();
  }
}

function randomArray() {
  const values = Array.from(
    { length: 9 },
    () => Math.floor(Math.random() * 90) + 1
  );

  values.sort((a, b) => a - b);

  document.getElementById("numbers").value = values.join(", ");
  document.getElementById("target").value =
    values[Math.floor(Math.random() * values.length)];

  startSearch();
}

buildCode();
startSearch();
