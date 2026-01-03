/**
 * Smart Calculator
 * - Sound effects
 * - Theme toggle
 * - Scientific mode
 * - Keyboard support
 */

const display = document.getElementById("display");
const buttons = document.querySelectorAll(".btn");
const themeToggle = document.getElementById("themeToggle");
const modeToggle = document.getElementById("modeToggle");
const sciPanel = document.querySelector(".scientific");

/* ===== Sounds ===== */
const sounds = {
    click: document.getElementById("sound-click"),
    delete: document.getElementById("sound-delete"),
    clear: document.getElementById("sound-clear"),
    equals: document.getElementById("sound-equals")
};

function playSound(type) {
    if (!sounds[type]) return;
    sounds[type].currentTime = 0;
    sounds[type].play();
}

/* ===== State ===== */
let input = "";

/* ===== Helpers ===== */
const operators = ["+", "-", "*", "/", "%"];

function updateDisplay(value) {
    display.value = value || "0";
}

function calculate() {
    try {
        const result = new Function(`return ${input}`)();
        if (!isFinite(result)) throw Error();
        input = result.toString();
        updateDisplay(input);
    } catch {
        updateDisplay("Error");
        input = "";
    }
}

/* ===== Button Handling ===== */
buttons.forEach(btn => {
    btn.addEventListener("click", () => {
        const value = btn.dataset.value;
        const action = btn.dataset.action;
        const fn = btn.dataset.fn;

        if (action === "clear") {
            playSound("clear");
            input = "";
            updateDisplay("");
            return;
        }

        if (action === "delete") {
            playSound("delete");
            input = input.slice(0, -1);
            updateDisplay(input);
            return;
        }

        if (action === "calculate") {
            playSound("equals");
            calculate();
            return;
        }

        if (fn) {
            playSound("click");
            input += `Math.${fn}(`;
            updateDisplay(input);
            return;
        }

        if (operators.includes(value) && operators.includes(input.slice(-1))) return;

        playSound("click");
        input += value;
        updateDisplay(input);
    });
});

/* ===== Theme Toggle ===== */
themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("light");
    themeToggle.textContent = document.body.classList.contains("light") ? "🌞" : "🌙";
});

/* ===== Scientific Mode ===== */
modeToggle.addEventListener("click", () => {
    sciPanel.classList.toggle("hidden");
});

/* ===== Keyboard Support ===== */
document.addEventListener("keydown", e => {
    if (!isNaN(e.key) || operators.includes(e.key) || e.key === ".") {
        input += e.key;
        updateDisplay(input);
    }

    if (e.key === "Enter") calculate();
    if (e.key === "Backspace") {
        input = input.slice(0, -1);
        updateDisplay(input);
    }
    if (e.key.toLowerCase() === "c") {
        input = "";
        updateDisplay("");
    }
});
