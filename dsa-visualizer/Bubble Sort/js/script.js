const bars = document.getElementById("bars");
const sizeLabel = document.getElementById("size");
const comparisonsLabel = document.getElementById("comparisons");
const swapsLabel = document.getElementById("swaps");
const status = document.getElementById("status");

const generateBtn = document.getElementById("generateBtn");
const sortBtn = document.getElementById("sortBtn");
const resetBtn = document.getElementById("resetBtn");
const sizeInput = document.getElementById("sizeInput");
const customInput = document.getElementById("customInput");
const customBtn = document.getElementById("customBtn");

const MIN_SIZE = 5;
const MAX_SIZE = 100;

let array = [];
let isSorting = false;
let comparisons = 0;
let swaps = 0;

function generateArray() {
  if (isSorting) return;

  let size = parseInt(sizeInput.value, 10);
  if (Number.isNaN(size)) size = 30;
  size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
  sizeInput.value = size;

  array = Array.from(
    { length: size },
    () => Math.floor(Math.random() * 95) + 5
  );

  comparisons = 0;
  swaps = 0;

  renderBars();
  updateStats();
  status.textContent = "New array generated. Ready to sort.";
}

function useCustomArray() {
  if (isSorting) return;

  const parts = customInput.value
    .split(/[,\s]+/)
    .map(part => part.trim())
    .filter(Boolean);

  const values = parts.map(Number);

  if (values.length < 2 || values.some(Number.isNaN)) {
    status.textContent =
      "Invalid input. Enter at least two numbers separated by commas, e.g. 5, 42, 17, 8, 23";
    return;
  }

  if (values.length > MAX_SIZE) {
    status.textContent = `Please enter at most ${MAX_SIZE} numbers.`;
    return;
  }

  array = values;
  comparisons = 0;
  swaps = 0;
  sizeInput.value = array.length;

  renderBars();
  updateStats();
  status.textContent = "Custom array loaded. Ready to sort.";
}

function renderBars(active = [], swapping = [], sorted = []) {
  bars.innerHTML = "";

  const maxMagnitude = Math.max(...array.map(value => Math.abs(value)), 1);

  array.forEach((value, index) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    const heightPercent = Math.max(4, (Math.abs(value) / maxMagnitude) * 100);
    bar.style.height = `${heightPercent}%`;
    bar.title = String(value);

    if (sorted.includes(index)) {
      bar.classList.add("sorted");
    } else if (swapping.includes(index)) {
      bar.classList.add("swapping");
    } else if (active.includes(index)) {
      bar.classList.add("comparing");
    }

    bars.appendChild(bar);
  });
}

function updateStats() {
  sizeLabel.textContent = array.length;
  comparisonsLabel.textContent = comparisons;
  swapsLabel.textContent = swaps;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bubbleSort() {
  if (isSorting) return;

  isSorting = true;
  setControlsDisabled(true);

  comparisons = 0;
  swaps = 0;
  updateStats();

  status.textContent = "Bubble Sort is running...";

  const n = array.length;
  const sortedIndices = [];

  for (let i = 0; i < n - 1; i++) {
    let swapped = false;

    for (let j = 0; j < n - i - 1; j++) {
      comparisons++;

      renderBars([j, j + 1], [], sortedIndices);
      updateStats();

      await sleep(80);

      if (array[j] > array[j + 1]) {
        renderBars([], [j, j + 1], sortedIndices);
        await sleep(80);

        [array[j], array[j + 1]] =
          [array[j + 1], array[j]];

        swaps++;
        swapped = true;

        renderBars([], [j, j + 1], sortedIndices);
        updateStats();

        await sleep(80);
      }
    }

    sortedIndices.push(n - i - 1);

    if (!swapped) {
      break;
    }
  }

  renderBars([], [], array.map((_, index) => index));

  status.textContent =
    `Sorting complete! ${comparisons} comparisons, ${swaps} swaps.`;

  isSorting = false;
  setControlsDisabled(false);
}

function setControlsDisabled(disabled) {
  generateBtn.disabled = disabled;
  sortBtn.disabled = disabled;
  resetBtn.disabled = disabled;
  sizeInput.disabled = disabled;
  customInput.disabled = disabled;
  customBtn.disabled = disabled;
}

function resetArray() {
  if (isSorting) return;

  comparisons = 0;
  swaps = 0;
  renderBars();
  updateStats();
  status.textContent = "Array reset. Ready to sort again.";
}

generateBtn.addEventListener("click", generateArray);
sortBtn.addEventListener("click", bubbleSort);
resetBtn.addEventListener("click", resetArray);
customBtn.addEventListener("click", useCustomArray);
customInput.addEventListener("keydown", event => {
  if (event.key === "Enter") useCustomArray();
});

generateArray();
