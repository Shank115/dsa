const bars = document.getElementById("bars");
const sizeLabel = document.getElementById("size");
const comparisonsLabel = document.getElementById("comparisons");
const swapsLabel = document.getElementById("swaps");
const status = document.getElementById("status");

const generateBtn = document.getElementById("generateBtn");
const sortBtn = document.getElementById("sortBtn");
const resetBtn = document.getElementById("resetBtn");

let array = [];
let isSorting = false;
let comparisons = 0;
let swaps = 0;

function generateArray() {
  if (isSorting) return;

  array = Array.from(
    { length: 30 },
    () => Math.floor(Math.random() * 95) + 5
  );

  comparisons = 0;
  swaps = 0;

  renderBars();
  updateStats();
  status.textContent = "New array generated. Ready to sort.";
}

function renderBars(active = [], swapping = [], sorted = []) {
  bars.innerHTML = "";

  array.forEach((value, index) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${value}%`;
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

generateArray();
