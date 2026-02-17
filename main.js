const display = document.getElementById("display");

let currentInput = "0";
let isResultDisplayed = false;

const MSG_ERROR = "error";
const MSG_INT_REQ = "only good integers >:3";
const MSG_INFINITY = "owo thats too big 0_0";

function updateDisplay() {
  display.textContent = currentInput;
}

function appendToInput(val) {
  if (val === '!') {
    calculateFactorial();
    return;
  }

  if (isResultDisplayed) {
    if (!isNaN(val) || val === '.') {
      currentInput = "";
    }
    isResultDisplayed = false;
  }

  if (val === '.' && currentInput.includes('.')) return;

  if (currentInput === "0" && val !== ".") {
    currentInput = val;
  } else {
    currentInput += val;
  }

  updateDisplay();
}

function clearAll() {
  currentInput = "0";
  isResultDisplayed = false;
  updateDisplay();
}

function calculate() {
  try {
    let result = eval(currentInput);

    if (!isFinite(result)) {
      currentInput = MSG_INFINITY;
    } else {
      currentInput = parseFloat(result.toFixed(8)).toString();
    }
  } catch (err) {
    currentInput = MSG_ERROR;
  }

  isResultDisplayed = true;
  updateDisplay();
}

function calculateFactorial() {
  try {
    const num = parseFloat(currentInput);

    if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
      currentInput = MSG_INT_REQ;
    } else if (num > 170) {
      currentInput = MSG_INFINITY;
    } else {
      let result = 1;
      for (let i = 2; i <= num; i++) {
        result *= i;
      }
      currentInput = result.toString();
    }
  } catch (e) {
    currentInput = MSG_ERROR;
  }

  isResultDisplayed = true;
  updateDisplay();
}

console.log("pawculator online ₍^. .^₎");
