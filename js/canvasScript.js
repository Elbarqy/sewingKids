const CANVAS_SCALE = 0.8;
const CANVAS_INSET = 0.1;
const CANVAS_CONTENT_AREA = 0.8;
const DEFAULT_THREAD_COLOR = "#8c8c8c";
let THREAD_WIDTH = 50;
const GRID_TOLERANCE = 30;
const REPLAY_DELAY_MS = 250;
const POST_REPLAY_DELAY_MS = 1000;
const MOBILE_BREAKPOINT = 1200;
const slider = document.getElementById('slider');
const sliderValue = document.getElementById('slider-value');
const horizontalColorPicker = document.getElementById('slider-hor');
const verticalColorPicker = document.getElementById('slider-ver');
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasDimension = Math.min(window.innerWidth, window.innerHeight) * CANVAS_SCALE;
canvas.width = canvasDimension;
canvas.height = canvasDimension;
const {width: canvasWidth, height: canvasHeight} = canvas;
let canvasFocused = false;
let baseHorizontalColor = DEFAULT_THREAD_COLOR;
let baseVerticalColor = DEFAULT_THREAD_COLOR;
let verticalThreads;
let horizontalThreads;
let gridSize = 4;
let topLeftCorner = [CANVAS_INSET * canvasWidth, CANVAS_INSET * canvasHeight];
let threadGap = (CANVAS_CONTENT_AREA * canvasWidth - GRID_TOLERANCE * 2 - THREAD_WIDTH / (gridSize - 1)) / (gridSize - 1);
let history = [];
let redoActions = [];
let activeControls = true;

// Store manages the current weaving pattern state
let store = {
    cursor: 0,           // Current position in the pattern
    operator: "+",       // Direction: "+" for left-to-right, "-" for right-to-left
    state: Array(gridSize * gridSize).fill(0)  // Thread states: 1=over, -1=under, 0=gap
};
store.state[0] = 1;

class Command {
    execute() {
        throw new Error("execute() must be implemented");
    }

    undo() {
        throw new Error("undo() must be implemented");
    }

    redo() {
        throw new Error("redo() must be implemented");
    }
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return {r, g, b};
}

function rgbToHex(r, g, b) {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}


function brightness(color, adder = 1) {
    const {r, g, b} = hexToRgb(color);
    const changedR = Math.abs(r - 50 * adder);
    const changedG = Math.abs(g - 50 * adder);
    const changedB = Math.abs(b - 50 * adder);
    return rgbToHex(changedR, changedG, changedB);
}


const initState = (newGridSize, replay = false) => {
    if (!activeControls) return;
    if (window.innerWidth < 450) {
        THREAD_WIDTH = 8
    } else {
        if (newGridSize > 10 && newGridSize <= 12) {
            THREAD_WIDTH = 35
        } else if (newGridSize > 12 && newGridSize <= 15) {
            THREAD_WIDTH = 25
        } else if (newGridSize > 15) {
            THREAD_WIDTH = 25
        } else {
            THREAD_WIDTH = 40;
        }
    }
    gridSize = newGridSize;
    threadGap = (CANVAS_CONTENT_AREA * canvasWidth - GRID_TOLERANCE * 2 - THREAD_WIDTH / (gridSize - 1)) / (gridSize - 1);
    topLeftCorner = [CANVAS_INSET * canvasWidth, CANVAS_INSET * canvasHeight];

    // Initialize vertical threads (top to bottom)
    verticalThreads = Array(gridSize)
        .fill(0)
        .map((_, threadIndex) => {
            const x = topLeftCorner[0] + GRID_TOLERANCE + threadIndex * threadGap;
            const startY = CANVAS_INSET * canvasHeight + GRID_TOLERANCE;

            const points = [
                [x, CANVAS_INSET * canvasHeight],
                [x, startY - 0.5 * THREAD_WIDTH],
                [x, startY + 0.5 * THREAD_WIDTH],
                ...Array(gridSize - 1)
                    .fill(0)
                    .map((_, intersectionIndex) => [
                        [x, startY + threadGap * (intersectionIndex + 1) - THREAD_WIDTH / 2],
                        [x, startY + threadGap * (intersectionIndex + 1) + THREAD_WIDTH / 2]
                    ])
                    .flat(),
                [x, (1 - CANVAS_INSET) * canvasHeight]
            ];

            return {
                points,
                states: Array(gridSize).fill(Array(2 * gridSize + 1).fill(1)),
                isMain: false
            };
        });

    // Initialize horizontal threads (left to right)
    horizontalThreads = Array(gridSize)
        .fill(0)
        .map((_, threadIndex) => {
            const y = topLeftCorner[1] + GRID_TOLERANCE + threadGap * threadIndex;
            const startX = topLeftCorner[0] + GRID_TOLERANCE;

            const points = [
                [topLeftCorner[0], y],
                [startX - 0.5 * THREAD_WIDTH, y],
                [startX + 0.5 * THREAD_WIDTH, y],
                ...Array(gridSize - 1)
                    .fill(0)
                    .map((_, intersectionIndex) => [
                        [startX + (intersectionIndex + 1) * threadGap - 0.5 * THREAD_WIDTH, y],
                        [startX + (intersectionIndex + 1) * threadGap + 0.5 * THREAD_WIDTH, y]
                    ])
                    .flat(),
                [(1 - CANVAS_INSET) * canvasWidth, y]
            ];

            return {
                points,
                states: Array(gridSize).fill(Array(2 * gridSize + 1).fill(0)),
                isMain: true
            };
        });

    // Reset pattern state
    store = {
        cursor: -1,
        operator: "+",
        state: Array(gridSize * gridSize).fill(0)
    };
    // store.state[0] = 1;
    if (!replay) history = [];
    redoActions = [];
}

const applyThreadGradient = (gradient, isVertical) => {
    const color = isVertical ? baseVerticalColor : baseHorizontalColor;
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.70, 'white');
    gradient.addColorStop(0.75, 'white');
    gradient.addColorStop(1, color);
    return gradient;
};

const applyCurveGradient = (gradient, isRightCurve = false) => {
    if (!isRightCurve) {
        gradient.addColorStop(0, baseHorizontalColor);
        gradient.addColorStop(0.75, 'white');
        gradient.addColorStop(0.8, 'white');
        gradient.addColorStop(1, baseHorizontalColor + 'ab');
    } else {
        gradient.addColorStop(1, baseHorizontalColor);
        gradient.addColorStop(0.25, 'white');
        gradient.addColorStop(0.2, 'white');
        gradient.addColorStop(0, baseHorizontalColor);
    }
    return gradient;
};


const drawThreadSegment = (context, point, color) => {
    context.lineWidth = THREAD_WIDTH;
    const gradient = applyThreadGradient(
        context.createLinearGradient(point[0], point[1] - THREAD_WIDTH / 2, point[0], point[1] + THREAD_WIDTH / 2)
    );
    context.strokeStyle = gradient;
    context.lineTo(point[0], point[1]);
    context.stroke();
    context.beginPath();
    context.moveTo(point[0], point[1]);
};

const calculateBezierControls = (startPoint, endPoint, isLeftCurve = false) => {
    const curveOffset = threadGap / 2 + THREAD_WIDTH / 2;
    const controlX1 = startPoint[0] + (isLeftCurve ? -curveOffset : curveOffset);
    const controlY1 = startPoint[1];
    const controlX2 = endPoint[0] + (isLeftCurve ? -curveOffset : curveOffset);
    const controlY2 = endPoint[1];
    return [controlX1, controlY1, controlX2, controlY2, endPoint[0], endPoint[1]];
};

const isConnected = (index) => {
    return store.state[index] === 1 || store.state[index] === -1;
};

const drawCurves = (context) => {
    const totalPositions = gridSize * gridSize;
    const curveOffset = threadGap / 2 + THREAD_WIDTH / 2;

    for (let rowIndex = 0; rowIndex < gridSize; rowIndex += 1) {
        const isOddRow = (rowIndex + 1) % 2 === (gridSize + 1) % 2;

        if (isOddRow) {
            // Left-side curve (odd rows end on left)
            const index = totalPositions - gridSize * rowIndex - 1;
            if (isConnected(index) && isConnected(index - gridSize)) {
                context.beginPath();
                const startPoint = horizontalThreads[rowIndex].points[0];
                const endPoint = horizontalThreads[rowIndex + 1].points[0];
                context.moveTo(startPoint[0], startPoint[1]);

                const [cx1, cy1, cx2, cy2, px, py] = calculateBezierControls(startPoint, endPoint, true);
                const gradient = applyCurveGradient(
                    context.createRadialGradient(
                        startPoint[0], (endPoint[1] + startPoint[1]) / 2 + 15, curveOffset + 10,
                        startPoint[0], (endPoint[1] + startPoint[1]) / 2 + 10, curveOffset - THREAD_WIDTH + 10
                    )
                );
                context.strokeStyle = gradient;
                context.bezierCurveTo(cx1, cy1, cx2, cy2, px, py);
                context.stroke();
            }
        } else {
            // Right-side curve (even rows end on right)
            const index = totalPositions - gridSize * rowIndex - gridSize;
            if (isConnected(index) && isConnected(index - gridSize)) {
                context.beginPath();
                const startPoint = horizontalThreads[rowIndex].points[2 * gridSize + 1];
                const endPoint = horizontalThreads[rowIndex + 1].points[2 * gridSize + 1];
                context.moveTo(startPoint[0], startPoint[1]);

                const [cx1, cy1, cx2, cy2, px, py] = calculateBezierControls(startPoint, endPoint, false);
                const gradient = applyCurveGradient(
                    context.createRadialGradient(
                        startPoint[0], (endPoint[1] + startPoint[1]) / 2, curveOffset - THREAD_WIDTH,
                        startPoint[0], (endPoint[1] + startPoint[1]) / 2, curveOffset + THREAD_WIDTH / 2
                    ),
                    true
                );
                context.strokeStyle = gradient;
                context.bezierCurveTo(cx1, cy1, cx2, cy2, px, py);
                context.stroke();
            }
        }
    }
};
const drawThreads = () => {
    console.log({
        cursor: store.cursor,
        operator: store.operator
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawVerticalThreads();

    drawHorizontalThreads();

    drawCurves(ctx);
};

const drawVerticalThreads = () => {
    verticalThreads.forEach((thread) => {
        ctx.beginPath();
        ctx.moveTo(thread.points[0][0], thread.points[0][1]);

        thread.points.slice(1).forEach((point) => {
            ctx.lineWidth = THREAD_WIDTH;
            const gradient = applyThreadGradient(
                ctx.createLinearGradient(
                    point[0] - THREAD_WIDTH / 2, point[1],
                    point[0] + THREAD_WIDTH / 2, point[1]
                ),
                true  // isVertical
            );
            ctx.strokeStyle = gradient;
            ctx.lineTo(point[0], point[1]);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(point[0], point[1]);
        });
    });
};

const drawHorizontalThreads = () => {
    const totalPositions = gridSize * gridSize;

    console.log({horizontalThreads})
    horizontalThreads.forEach((thread, threadIndex) => {
        ctx.beginPath();
        ctx.moveTo(thread.points[0][0], thread.points[0][1]);
        const points = thread.points.slice(1);

        for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
            const point = points[pointIndex];
            const stateIndex = totalPositions - threadIndex * gridSize - 1 - Math.floor(pointIndex / 2);

            // Skip if this position is a gap (state = 0)
            if (store.state[stateIndex] === 0) {
                ctx.beginPath();
                ctx.moveTo(point[0], point[1]);
                continue;
            }

            // Special case: First thread's last segment
            if (threadIndex === 0 && pointIndex === 2 * gridSize) {
                if (store.state[stateIndex + 1] === 0) {
                    ctx.beginPath();
                    ctx.moveTo(point[0], point[1]);
                    continue;
                }
            }

            // Special case: Other threads' last segment
            if (pointIndex === 2 * gridSize && threadIndex > 0) {
                if (store.state[stateIndex + 1] === 0) {
                    ctx.beginPath();
                    ctx.moveTo(point[0], point[1]);
                    continue;
                }
            }

            // Special case: First segment connecting to previous row
            if (pointIndex === 0 && store.state[stateIndex - gridSize] === 1) {
                drawThreadSegment(ctx, point, "blue");
                continue;
            }

            // Check if we're on a reversing row (even rows go right-to-left)
            const isReversingRow = (gridSize - threadIndex) % 2 === 0 && pointIndex > 0 && pointIndex < 2 * gridSize;

            // Odd-indexed points represent intersections
            if (pointIndex % 2 === 1 && pointIndex < gridSize * 2) {
                if (store.state[stateIndex] === -1) {
                    // Thread goes under - skip or handle reversing rows
                    if (isReversingRow) {
                        ctx.moveTo(point[0], point[1]);
                        drawThreadSegment(ctx, points[pointIndex + 1], 'blue');
                        pointIndex += 1;
                        continue;
                    }
                    ctx.moveTo(point[0], point[1]);
                    continue;
                }
            }

            // Draw the thread segment
            drawThreadSegment(ctx, point, "blue");

            // Handle double-draw for reversing rows
            if (isReversingRow) {
                drawThreadSegment(ctx, points[pointIndex + 1], 'blue');
                pointIndex += 1;
            }
        }
    });
};
const shift = (threadState) => {
    if (store.cursor > gridSize * gridSize) return;

    const newState = [...store.state];
    const nextCursor = store.operator === "+" ? store.cursor + 1 : store.cursor - 1;
    newState[nextCursor] = threadState;
    store.state = newState;

    // Check for row transition (left-to-right reaching end)
    if (nextCursor !== 0 && (nextCursor + 1) % gridSize === 0 && store.operator === "+") {
        store.operator = "-";
        store.cursor = nextCursor + gridSize + 1;
        return drawThreads();
    }

    // Check for row transition (right-to-left reaching start)
    if (nextCursor % gridSize === 0 && store.operator === "-" && nextCursor !== 0) {
        store.operator = "+";
        store.cursor = nextCursor + gridSize - 1;
        return drawThreads();
    }

    store.cursor = nextCursor;
    drawThreads();
};

const unShift = () => {
    if (store.cursor === 0) return;

    let previousCursor;
    let newOperator = store.operator;

    // Handle reverse row transition from left-to-right
    if (store.cursor % gridSize === 0 && store.operator === '+') {
        previousCursor = store.cursor - gridSize;
        newOperator = "-";
    }
    // Handle reverse row transition from right-to-left
    else if (store.cursor % gridSize === 0 && store.operator === '-' && store.state[store.cursor + 1] === 0) {
        previousCursor = store.cursor - gridSize - 2;
        store.state[previousCursor + 1] = 0;
        newOperator = "+";
    }
    // Normal reverse movement
    else {
        previousCursor = newOperator === "+" ? store.cursor - 1 : store.cursor + 1;
    }

    store.state[store.cursor] = 0;
    store.cursor = previousCursor;
    store.operator = newOperator;
    drawThreads();
};
const delay = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};
const replay = async () => {
    initState(gridSize, true);
    activeControls = false;

    // Encode history and copy to clipboard
    const encodedHistory = btoa(
        encodeURIComponent(JSON.stringify(history)).replace(/%([0-9A-F]{2})/g, function (match, p1) {
            return String.fromCharCode('0x' + p1);
        })
    );
    navigator.clipboard.writeText(encodedHistory);

    // Execute each action with delay for animation effect
    for (const action of history) {
        action.execute();
        await delay(REPLAY_DELAY_MS);
    }

    activeControls = true;
    await delay(POST_REPLAY_DELAY_MS);
    initState(gridSize);
    drawThreads();
};
const moveUp = () => {
    if (!activeControls || store.cursor === gridSize * gridSize + gridSize) return;

    redoActions = [];
    const action = new CanvasUpAction();
    history.push(action);
    action.execute();
};

/**
 * Handles the "move down" action (thread goes under).
 * Creates a command, adds it to history, and executes it.
 */
const moveDown = () => {
    if (!activeControls || store.cursor === gridSize * gridSize + gridSize) return;

    redoActions = [];
    const action = new CanvasDownAction();
    history.push(action);
    action.execute();
};

/**
 * Undoes the last action by popping from history.
 */
const undoButtonClick = () => {
    if (history.length === 0) return;

    const action = history.pop();
    unShift();
    redoActions.push(action);
};

/**
 * Redoes the last undone action.
 */
const redoButtonClick = () => {
    if (redoActions.length === 0) return;

    const action = redoActions.pop();
    if (action.action === 'UP') {
        shift(1);
    } else {
        shift(-1);
    }
    history.push({
        ...action,
        timeStamp: Date.now()
    });
};

class CanvasUpAction extends Command {
    constructor() {
        super();
        this.action = "UP";
        this.timeStamp = Date.now();
    }

    execute() {
        shift(1);
    }

    undo() {
        unShift();
    }
}

class CanvasDownAction extends Command {
    constructor() {
        super();
        this.action = "DOWN";
        this.timeStamp = Date.now();
    }

    execute() {
        shift(-1);
    }

    undo() {
        unShift();
    }
}

canvas.addEventListener('focus', () => {
    canvasFocused = true;
});

canvas.addEventListener('blur', () => {
    canvasFocused = false;
});

window.addEventListener("keydown", (e) => {
    if (canvasFocused) {
        e.preventDefault();
        switch (e.key) {
            case "ArrowDown":
                moveDown();
                break;
            case "ArrowUp":
                moveUp();
                break;
        }
    }
});
slider.addEventListener('input', () => {
    sliderValue.textContent = slider.value;
    initState(parseInt(slider.value));
    drawThreads();
});

verticalColorPicker.addEventListener('input', () => {
    baseVerticalColor = verticalColorPicker.value;
    drawThreads();
});

horizontalColorPicker.addEventListener('input', () => {
    baseHorizontalColor = horizontalColorPicker.value;
    drawThreads();
});

function applyResponsiveStyles() {
    const floatingButtons = document.querySelectorAll('.floating-btn');
    const displayValue = window.innerWidth < MOBILE_BREAKPOINT ? 'block' : 'none';

    for (const button of floatingButtons) {
        button.style.display = displayValue;
    }
}

applyResponsiveStyles();
window.addEventListener('resize', applyResponsiveStyles);


function convertToHistoryCommands(actionsArray) {
    if (!Array.isArray(actionsArray)) {
        console.error('convertToHistoryCommands: Input must be an array');
        return [];
    }

    return actionsArray.map(actionObj => {
        if (!actionObj || typeof actionObj !== 'object') {
            console.warn('Invalid action object:', actionObj);
            return null;
        }

        let command;

        if (actionObj.action === 'UP') {
            command = new CanvasUpAction();
        } else if (actionObj.action === 'DOWN') {
            command = new CanvasDownAction();
        } else {
            console.warn('Unknown action type:', actionObj.action);
            return null;
        }

        // Preserve the original timestamp if provided
        if (actionObj.timeStamp) {
            command.timeStamp = actionObj.timeStamp;
        }

        return command;
    }).filter(cmd => cmd !== null); // Remove any null entries
}

function loadHistoryFromActions(actionsArray, autoReplay = false) {
    // Convert actions to commands
    const commands = convertToHistoryCommands(actionsArray);

    if (commands.length === 0) {
        console.warn('No valid commands to load');
        return;
    }

    // Reset the pattern
    initState(gridSize, true);

    // Set the history
    history = commands;
    redoActions = [];

    console.log(`Loaded ${commands.length} commands into history`);

    // Optionally replay the pattern
    if (autoReplay) {
        replay();
    }
}

// ============================================
// DROPDOWN MENU FUNCTIONALITY
// ============================================

function toggleDropdown() {
    const dropdown = document.querySelector('.dropdown');
    const dropdownMenu = document.getElementById('dropdownMenu');

    dropdown.classList.toggle('active');
    dropdownMenu.classList.toggle('show');
}

function handleMenuAction(action) {
    toggleDropdown();

    let storedHis;

    switch (action) {
        case '1':
            storedHis = [{"action": "UP", "timeStamp": 1765654866055}, {
                "action": "UP",
                "timeStamp": 1765654866924
            }, {"action": "UP", "timeStamp": 1765654867847}, {
                "action": "UP",
                "timeStamp": 1765654868773
            }, {"action": "UP", "timeStamp": 1765654869629}, {
                "action": "UP",
                "timeStamp": 1765654870483
            }, {"action": "UP", "timeStamp": 1765654871422}, {
                "action": "UP",
                "timeStamp": 1765654872180
            }, {"action": "UP", "timeStamp": 1765654873216}, {
                "action": "UP",
                "timeStamp": 1765654874633
            }, {"action": "DOWN", "timeStamp": 1765654875919}, {
                "action": "UP",
                "timeStamp": 1765654885271
            }, {"action": "UP", "timeStamp": 1765654886454}, {
                "action": "UP",
                "timeStamp": 1765654887338
            }, {"action": "UP", "timeStamp": 1765654888229}, {
                "action": "UP",
                "timeStamp": 1765654889101
            }, {"action": "DOWN", "timeStamp": 1765654892192}, {
                "action": "UP",
                "timeStamp": 1765654899553
            }, {"action": "UP", "timeStamp": 1765654900358}, {
                "action": "UP",
                "timeStamp": 1765654901089
            }, {"action": "UP", "timeStamp": 1765654901943}, {
                "action": "UP",
                "timeStamp": 1765654902718
            }, {"action": "UP", "timeStamp": 1765654903484}, {
                "action": "UP",
                "timeStamp": 1765654910554
            }, {"action": "DOWN", "timeStamp": 1765654915557}, {
                "action": "UP",
                "timeStamp": 1765654924136
            }, {"action": "UP", "timeStamp": 1765654925433}, {
                "action": "UP",
                "timeStamp": 1765654926542
            }, {"action": "UP", "timeStamp": 1765654928043}, {
                "action": "UP",
                "timeStamp": 1765654929346
            }, {"action": "UP", "timeStamp": 1765654930375}, {
                "action": "UP",
                "timeStamp": 1765654931397
            }, {"action": "UP", "timeStamp": 1765654932534}, {
                "action": "UP",
                "timeStamp": 1765654933738
            }, {"action": "UP", "timeStamp": 1765654934884}, {
                "action": "UP",
                "timeStamp": 1765654948471
            }, {"action": "UP", "timeStamp": 1765654949638}, {
                "action": "UP",
                "timeStamp": 1765654950553
            }, {"action": "DOWN", "timeStamp": 1765654954444}, {
                "action": "UP",
                "timeStamp": 1765654961684
            }, {"action": "UP", "timeStamp": 1765654962651}, {
                "action": "UP",
                "timeStamp": 1765654963581
            }, {"action": "UP", "timeStamp": 1765654964504}, {
                "action": "UP",
                "timeStamp": 1765654965500
            }, {"action": "UP", "timeStamp": 1765654966375}, {
                "action": "UP",
                "timeStamp": 1765654967377
            }, {"action": "UP", "timeStamp": 1765654968255}, {
                "action": "UP",
                "timeStamp": 1765654973936
            }, {"action": "UP", "timeStamp": 1765654974731}, {
                "action": "UP",
                "timeStamp": 1765654975476
            }, {"action": "DOWN", "timeStamp": 1765654983397}, {
                "action": "UP",
                "timeStamp": 1765654996069
            }, {"action": "UP", "timeStamp": 1765654996864}, {
                "action": "UP",
                "timeStamp": 1765654997715
            }, {"action": "UP", "timeStamp": 1765654998464}, {
                "action": "UP",
                "timeStamp": 1765654999147
            }, {"action": "UP", "timeStamp": 1765654999876}, {
                "action": "UP",
                "timeStamp": 1765655000627
            }, {"action": "UP", "timeStamp": 1765655001410}, {
                "action": "UP",
                "timeStamp": 1765655002275
            }, {"action": "DOWN", "timeStamp": 1765655034621}, {
                "action": "UP",
                "timeStamp": 1765655043943
            }, {"action": "UP", "timeStamp": 1765655044698}, {
                "action": "UP",
                "timeStamp": 1765655045571
            }, {"action": "UP", "timeStamp": 1765655046317}, {
                "action": "UP",
                "timeStamp": 1765655047101
            }, {"action": "UP", "timeStamp": 1765655047750}, {
                "action": "UP",
                "timeStamp": 1765655048611
            }, {"action": "UP", "timeStamp": 1765655049445}, {
                "action": "UP",
                "timeStamp": 1765655050550
            }, {"action": "UP", "timeStamp": 1765655051266}, {
                "action": "UP",
                "timeStamp": 1765655071997
            }, {"action": "UP", "timeStamp": 1765655072942}, {
                "action": "UP",
                "timeStamp": 1765655073751
            }, {"action": "UP", "timeStamp": 1765655074588}, {
                "action": "UP",
                "timeStamp": 1765655075390
            }, {"action": "DOWN", "timeStamp": 1765655084807}, {
                "action": "UP",
                "timeStamp": 1765655086678
            }, {"action": "UP", "timeStamp": 1765655087381}, {
                "action": "UP",
                "timeStamp": 1765655088132
            }, {"action": "UP", "timeStamp": 1765655088843}, {
                "action": "UP",
                "timeStamp": 1765655089557
            }, {"action": "UP", "timeStamp": 1765655090237}, {
                "action": "UP",
                "timeStamp": 1765655101763
            }, {"action": "UP", "timeStamp": 1765655102630}, {
                "action": "UP",
                "timeStamp": 1765655103292
            }, {"action": "UP", "timeStamp": 1765655103952}, {
                "action": "UP",
                "timeStamp": 1765655104719
            }, {"action": "UP", "timeStamp": 1765655105344}, {
                "action": "UP",
                "timeStamp": 1765655106025
            }, {"action": "UP", "timeStamp": 1765655106699}, {
                "action": "UP",
                "timeStamp": 1765655107361
            }, {"action": "UP", "timeStamp": 1765655108038}, {
                "action": "UP",
                "timeStamp": 1765655108746
            }, {"action": "DOWN", "timeStamp": 1765655109863}, {
                "action": "UP",
                "timeStamp": 1765655135572
            }, {"action": "UP", "timeStamp": 1765655136342}, {
                "action": "UP",
                "timeStamp": 1765655137212
            }, {"action": "UP", "timeStamp": 1765655137903}, {
                "action": "UP",
                "timeStamp": 1765655138615
            }, {"action": "UP", "timeStamp": 1765655139304}, {
                "action": "UP",
                "timeStamp": 1765655139977
            }, {"action": "DOWN", "timeStamp": 1765655141354}, {
                "action": "UP",
                "timeStamp": 1765655157664
            }, {"action": "UP", "timeStamp": 1765655158265}, {
                "action": "UP",
                "timeStamp": 1765655159032
            }, {"action": "UP", "timeStamp": 1765655159729}, {
                "action": "UP",
                "timeStamp": 1765655179821
            }, {"action": "UP", "timeStamp": 1765655180727}, {
                "action": "UP",
                "timeStamp": 1765655181827
            }, {"action": "UP", "timeStamp": 1765655183707}, {
                "action": "UP",
                "timeStamp": 1765655184729
            }, {"action": "UP", "timeStamp": 1765655185531}, {
                "action": "UP",
                "timeStamp": 1765655186365
            }, {"action": "UP", "timeStamp": 1765655187237}, {
                "action": "UP",
                "timeStamp": 1765655188059
            }, {"action": "DOWN", "timeStamp": 1765655192091}, {
                "action": "UP",
                "timeStamp": 1765655193633
            }, {"action": "UP", "timeStamp": 1765655194111}, {
                "action": "UP",
                "timeStamp": 1765655210594
            }, {"action": "UP", "timeStamp": 1765655210977}, {
                "action": "UP",
                "timeStamp": 1765655211900
            }, {"action": "UP", "timeStamp": 1765655212443}, {
                "action": "UP",
                "timeStamp": 1765655213126
            }, {"action": "UP", "timeStamp": 1765655213671}, {
                "action": "UP",
                "timeStamp": 1765655214370
            }, {"action": "UP", "timeStamp": 1765655215053}, {
                "action": "UP",
                "timeStamp": 1765655215714
            }, {"action": "UP", "timeStamp": 1765655216332}, {
                "action": "UP",
                "timeStamp": 1765655217016
            }, {"action": "UP", "timeStamp": 1765655217628}, {
                "action": "UP",
                "timeStamp": 1765655220266
            }, {"action": "UP", "timeStamp": 1765655221407}, {
                "action": "DOWN",
                "timeStamp": 1765655222593
            }, {"action": "UP", "timeStamp": 1765655229047}, {
                "action": "UP",
                "timeStamp": 1765655230008
            }, {"action": "UP", "timeStamp": 1765655230883}, {
                "action": "UP",
                "timeStamp": 1765655231733
            }, {"action": "DOWN", "timeStamp": 1765655235113}, {
                "action": "UP",
                "timeStamp": 1765655238902
            }, {"action": "UP", "timeStamp": 1765655239644}, {
                "action": "UP",
                "timeStamp": 1765655240379
            }, {"action": "UP", "timeStamp": 1765655241430}];
            break;
        case '2':
            storedHis = [{"action": "UP", "timeStamp": 1765658150151}, {
                "action": "DOWN",
                "timeStamp": 1765658154900
            }, {"action": "DOWN", "timeStamp": 1765658155940}, {
                "action": "UP",
                "timeStamp": 1765658162021
            }, {"action": "UP", "timeStamp": 1765658162862}, {
                "action": "DOWN",
                "timeStamp": 1765658164045
            }, {"action": "DOWN", "timeStamp": 1765658164711}, {
                "action": "UP",
                "timeStamp": 1765658169314
            }, {"action": "UP", "timeStamp": 1765658170007}, {
                "action": "DOWN",
                "timeStamp": 1765658173450
            }, {"action": "DOWN", "timeStamp": 1765658174045}, {
                "action": "UP",
                "timeStamp": 1765658176619
            }, {"action": "UP", "timeStamp": 1765658177286}, {
                "action": "DOWN",
                "timeStamp": 1765658179806
            }, {"action": "DOWN", "timeStamp": 1765658180402}, {
                "action": "UP",
                "timeStamp": 1765658183611
            }, {"action": "UP", "timeStamp": 1765658184262}, {
                "action": "DOWN",
                "timeStamp": 1765658188291
            }, {"action": "DOWN", "timeStamp": 1765658188962}, {
                "action": "UP",
                "timeStamp": 1765658191258
            }, {"action": "UP", "timeStamp": 1765658191857}, {
                "action": "DOWN",
                "timeStamp": 1765658193078
            }, {"action": "DOWN", "timeStamp": 1765658193592}, {
                "action": "UP",
                "timeStamp": 1765658200245
            }, {"action": "UP", "timeStamp": 1765658200765}, {
                "action": "DOWN",
                "timeStamp": 1765658203658
            }, {"action": "DOWN", "timeStamp": 1765658204092}, {
                "action": "UP",
                "timeStamp": 1765658206138
            }, {"action": "UP", "timeStamp": 1765658206577}, {
                "action": "DOWN",
                "timeStamp": 1765658208108
            }, {"action": "DOWN", "timeStamp": 1765658208575}, {
                "action": "UP",
                "timeStamp": 1765658209908
            }, {"action": "UP", "timeStamp": 1765658210585}, {
                "action": "DOWN",
                "timeStamp": 1765658211904
            }, {"action": "DOWN", "timeStamp": 1765658212563}, {
                "action": "UP",
                "timeStamp": 1765658213697
            }, {"action": "UP", "timeStamp": 1765658214223}, {
                "action": "DOWN",
                "timeStamp": 1765658215326
            }, {"action": "DOWN", "timeStamp": 1765658215864}, {
                "action": "UP",
                "timeStamp": 1765658216962
            }, {"action": "UP", "timeStamp": 1765658217649}, {
                "action": "DOWN",
                "timeStamp": 1765658218846
            }, {"action": "DOWN", "timeStamp": 1765658219562}, {
                "action": "UP",
                "timeStamp": 1765658220738
            }, {"action": "UP", "timeStamp": 1765658221311}, {
                "action": "DOWN",
                "timeStamp": 1765658222491
            }, {"action": "DOWN", "timeStamp": 1765658223102}, {
                "action": "UP",
                "timeStamp": 1765658224180
            }, {"action": "UP", "timeStamp": 1765658224865}, {
                "action": "DOWN",
                "timeStamp": 1765658225933
            }, {"action": "DOWN", "timeStamp": 1765658226629}, {
                "action": "UP",
                "timeStamp": 1765658227611
            }, {"action": "UP", "timeStamp": 1765658228339}, {
                "action": "DOWN",
                "timeStamp": 1765658229329
            }, {"action": "DOWN", "timeStamp": 1765658229982}]
            break;
        case '3':
            storedHis = [{"action": "UP", "timeStamp": 1749058685288}, {
                "action": "UP",
                "timeStamp": 1749058685843
            }, {"action": "DOWN", "timeStamp": 1749058687230}, {
                "action": "DOWN",
                "timeStamp": 1749058687717
            }, {"action": "UP", "timeStamp": 1749058689536}, {
                "action": "UP",
                "timeStamp": 1749058691127
            }, {"action": "UP", "timeStamp": 1749058692120}, {
                "action": "DOWN",
                "timeStamp": 1749058693715
            }, {"action": "DOWN", "timeStamp": 1749058694504}, {
                "action": "UP",
                "timeStamp": 1749058696052
            }, {"action": "UP", "timeStamp": 1749058696817}, {
                "action": "UP",
                "timeStamp": 1749058699108
            }, {"action": "DOWN", "timeStamp": 1749058702768}, {
                "action": "DOWN",
                "timeStamp": 1749058703458
            }, {"action": "UP", "timeStamp": 1749058704945}, {
                "action": "UP",
                "timeStamp": 1749058705644
            }, {"action": "DOWN", "timeStamp": 1749058712105}, {
                "action": "UP",
                "timeStamp": 1749058718857
            }, {"action": "UP", "timeStamp": 1749058719644}, {
                "action": "DOWN",
                "timeStamp": 1749058724373
            }, {"action": "DOWN", "timeStamp": 1749058725173}, {
                "action": "UP",
                "timeStamp": 1749058730916
            }, {"action": "UP", "timeStamp": 1749058731550}, {
                "action": "UP",
                "timeStamp": 1749058732367
            }, {"action": "DOWN", "timeStamp": 1749058737908}, {
                "action": "DOWN",
                "timeStamp": 1749058738676
            }, {"action": "UP", "timeStamp": 1749058743462}, {
                "action": "UP",
                "timeStamp": 1749058744134
            }, {"action": "UP", "timeStamp": 1749058744948}, {
                "action": "DOWN",
                "timeStamp": 1749058749813
            }, {"action": "DOWN", "timeStamp": 1749058750395}, {
                "action": "UP",
                "timeStamp": 1749058754080
            }, {"action": "UP", "timeStamp": 1749058754747}, {
                "action": "UP",
                "timeStamp": 1749058759886
            }, {"action": "DOWN", "timeStamp": 1749058764731}, {
                "action": "DOWN",
                "timeStamp": 1749058765098
            }, {"action": "UP", "timeStamp": 1749058769918}, {
                "action": "UP",
                "timeStamp": 1749058770567
            }, {"action": "UP", "timeStamp": 1749058771375}, {
                "action": "DOWN",
                "timeStamp": 1749058775141
            }, {"action": "DOWN", "timeStamp": 1749058775794}, {
                "action": "UP",
                "timeStamp": 1749058780013
            }, {"action": "UP", "timeStamp": 1749058780667}, {
                "action": "UP",
                "timeStamp": 1749058781401
            }, {"action": "DOWN", "timeStamp": 1749058786376}, {
                "action": "DOWN",
                "timeStamp": 1749058786805
            }, {"action": "UP", "timeStamp": 1749058790758}, {
                "action": "UP",
                "timeStamp": 1749058791339
            }, {"action": "UP", "timeStamp": 1749058792179}, {
                "action": "DOWN",
                "timeStamp": 1749058795920
            }, {"action": "DOWN", "timeStamp": 1749058799198}, {
                "action": "DOWN",
                "timeStamp": 1749058803914
            }, {"action": "UP", "timeStamp": 1749058808431}, {
                "action": "UP",
                "timeStamp": 1749058809258
            }, {"action": "UP", "timeStamp": 1749058810178}, {
                "action": "DOWN",
                "timeStamp": 1749058813472
            }, {"action": "DOWN", "timeStamp": 1749058814279}, {
                "action": "UP",
                "timeStamp": 1749058818388
            }, {"action": "UP", "timeStamp": 1749058819094}, {
                "action": "UP",
                "timeStamp": 1749058819891
            }, {"action": "DOWN", "timeStamp": 1749058824144}, {
                "action": "DOWN",
                "timeStamp": 1749058824896
            }, {"action": "UP", "timeStamp": 1749058829310}, {
                "action": "UP",
                "timeStamp": 1749058830040
            }, {"action": "UP", "timeStamp": 1749058830742}, {
                "action": "DOWN",
                "timeStamp": 1749058834632
            }, {"action": "DOWN", "timeStamp": 1749058835169}, {
                "action": "DOWN",
                "timeStamp": 1749058839719
            }, {"action": "UP", "timeStamp": 1749058843388}, {
                "action": "UP",
                "timeStamp": 1749058844115
            }, {"action": "UP", "timeStamp": 1749058844847}, {
                "action": "DOWN",
                "timeStamp": 1749058848031
            }, {"action": "DOWN", "timeStamp": 1749058848747}, {
                "action": "UP",
                "timeStamp": 1749058852060
            }, {"action": "UP", "timeStamp": 1749058852807}, {
                "action": "UP",
                "timeStamp": 1749058853567
            }, {"action": "DOWN", "timeStamp": 1749058858221}, {
                "action": "DOWN",
                "timeStamp": 1749058858785
            }, {"action": "UP", "timeStamp": 1749058862218}, {
                "action": "UP",
                "timeStamp": 1749058862774
            }, {"action": "UP", "timeStamp": 1749058863490}, {
                "action": "DOWN",
                "timeStamp": 1749058866850
            }, {"action": "DOWN", "timeStamp": 1749058867620}, {
                "action": "UP",
                "timeStamp": 1749058869991
            }, {"action": "DOWN", "timeStamp": 1749058874124}, {
                "action": "UP",
                "timeStamp": 1749058878325
            }, {"action": "DOWN", "timeStamp": 1749058881669}, {
                "action": "DOWN",
                "timeStamp": 1749058882235
            }, {"action": "UP", "timeStamp": 1749058886970}, {
                "action": "UP",
                "timeStamp": 1749058887476
            }, {"action": "UP", "timeStamp": 1749058888292}, {
                "action": "DOWN",
                "timeStamp": 1749058891868
            }, {"action": "DOWN", "timeStamp": 1749058892491}, {
                "action": "UP",
                "timeStamp": 1749058898755
            }, {"action": "UP", "timeStamp": 1749058899426}, {
                "action": "UP",
                "timeStamp": 1749058900210
            }, {"action": "DOWN", "timeStamp": 1749058915805}, {
                "action": "DOWN",
                "timeStamp": 1749058916404
            }, {"action": "UP", "timeStamp": 1749058920587}, {
                "action": "UP",
                "timeStamp": 1749058921315
            }, {"action": "UP", "timeStamp": 1749058921996}, {
                "action": "UP",
                "timeStamp": 1749058928568
            }, {"action": "UP", "timeStamp": 1749058929343}, {
                "action": "DOWN",
                "timeStamp": 1749058934735
            }, {"action": "DOWN", "timeStamp": 1749058935410}, {
                "action": "UP",
                "timeStamp": 1749058940550
            }, {"action": "UP", "timeStamp": 1749058941238}, {
                "action": "UP",
                "timeStamp": 1749058941928
            }, {"action": "DOWN", "timeStamp": 1749058948714}, {
                "action": "DOWN",
                "timeStamp": 1749058949527
            }, {"action": "UP", "timeStamp": 1749058954104}, {
                "action": "UP",
                "timeStamp": 1749058954774
            }, {"action": "UP", "timeStamp": 1749058955700}, {
                "action": "DOWN",
                "timeStamp": 1749058959623
            }, {"action": "DOWN", "timeStamp": 1749058960290}, {
                "action": "UP",
                "timeStamp": 1749058964040
            }, {"action": "UP", "timeStamp": 1749058964661}, {
                "action": "UP",
                "timeStamp": 1749058965357
            }, {"action": "DOWN", "timeStamp": 1749058970184}, {
                "action": "UP",
                "timeStamp": 1749058973816
            }, {"action": "UP", "timeStamp": 1749058974427}, {
                "action": "UP",
                "timeStamp": 1749058975067
            }, {"action": "DOWN", "timeStamp": 1749058978134}, {
                "action": "DOWN",
                "timeStamp": 1749058978663
            }, {"action": "UP", "timeStamp": 1749058982628}, {
                "action": "UP",
                "timeStamp": 1749058983412
            }, {"action": "UP", "timeStamp": 1749058983917}, {
                "action": "DOWN",
                "timeStamp": 1749058986984
            }, {"action": "DOWN", "timeStamp": 1749058987785}, {
                "action": "UP",
                "timeStamp": 1749058992792
            }, {"action": "UP", "timeStamp": 1749058993524}, {
                "action": "UP",
                "timeStamp": 1749058994645
            }, {"action": "DOWN", "timeStamp": 1749058999325}, {
                "action": "DOWN",
                "timeStamp": 1749059000102
            }, {"action": "UP", "timeStamp": 1749059002135}]
            break;
        case '4':
            storedHis = [{"action": "DOWN", "timeStamp": 1749059144364}, {
                "action": "UP",
                "timeStamp": 1749059146895
            }, {"action": "UP", "timeStamp": 1749059147507}, {
                "action": "DOWN",
                "timeStamp": 1749059149987
            }, {"action": "UP", "timeStamp": 1749059152243}, {
                "action": "UP",
                "timeStamp": 1749059152932
            }, {"action": "DOWN", "timeStamp": 1749059155136}, {
                "action": "UP",
                "timeStamp": 1749059157207
            }, {"action": "DOWN", "timeStamp": 1749059159574}, {
                "action": "UP",
                "timeStamp": 1749059161485
            }, {"action": "UP", "timeStamp": 1749059162096}, {
                "action": "DOWN",
                "timeStamp": 1749059164338
            }, {"action": "UP", "timeStamp": 1749059166203}, {
                "action": "UP",
                "timeStamp": 1749059166898
            }, {"action": "DOWN", "timeStamp": 1749059169268}, {
                "action": "UP",
                "timeStamp": 1749059171322
            }, {"action": "UP", "timeStamp": 1749059171967}, {
                "action": "DOWN",
                "timeStamp": 1749059174756
            }, {"action": "UP", "timeStamp": 1749059176770}, {
                "action": "UP",
                "timeStamp": 1749059177308
            }, {"action": "DOWN", "timeStamp": 1749059179395}, {
                "action": "UP",
                "timeStamp": 1749059182629
            }, {"action": "UP", "timeStamp": 1749059183066}, {
                "action": "DOWN",
                "timeStamp": 1749059184991
            }, {"action": "UP", "timeStamp": 1749059187092}, {
                "action": "UP",
                "timeStamp": 1749059187655
            }, {"action": "UP", "timeStamp": 1749059193826}, {
                "action": "DOWN",
                "timeStamp": 1749059197365
            }, {"action": "UP", "timeStamp": 1749059200084}, {
                "action": "UP",
                "timeStamp": 1749059200474
            }, {"action": "DOWN", "timeStamp": 1749059203151}, {
                "action": "UP",
                "timeStamp": 1749059206043
            }, {"action": "UP", "timeStamp": 1749059206543}, {
                "action": "DOWN",
                "timeStamp": 1749059209646
            }, {"action": "UP", "timeStamp": 1749059211569}, {
                "action": "UP",
                "timeStamp": 1749059213647
            }, {"action": "UP", "timeStamp": 1749059215442}, {
                "action": "DOWN",
                "timeStamp": 1749059218294
            }, {"action": "UP", "timeStamp": 1749059227976}, {
                "action": "UP",
                "timeStamp": 1749059228881
            }, {"action": "DOWN", "timeStamp": 1749059234824}, {
                "action": "UP",
                "timeStamp": 1749059237114
            }, {"action": "UP", "timeStamp": 1749059237733}, {
                "action": "DOWN",
                "timeStamp": 1749059239800
            }, {"action": "UP", "timeStamp": 1749059242724}, {
                "action": "UP",
                "timeStamp": 1749059243568
            }, {"action": "DOWN", "timeStamp": 1749059246470}, {
                "action": "UP",
                "timeStamp": 1749059248784
            }, {"action": "UP", "timeStamp": 1749059249458}, {
                "action": "DOWN",
                "timeStamp": 1749059251604
            }, {"action": "UP", "timeStamp": 1749059256449}, {
                "action": "UP",
                "timeStamp": 1749059256876
            }, {"action": "DOWN", "timeStamp": 1749059258999}, {
                "action": "UP",
                "timeStamp": 1749059265408
            }, {"action": "DOWN", "timeStamp": 1749059268215}, {
                "action": "UP",
                "timeStamp": 1749059270444
            }, {"action": "UP", "timeStamp": 1749059271060}, {
                "action": "DOWN",
                "timeStamp": 1749059273160
            }, {"action": "UP", "timeStamp": 1749059274770}, {
                "action": "UP",
                "timeStamp": 1749059275312
            }, {"action": "DOWN", "timeStamp": 1749059281590}, {
                "action": "UP",
                "timeStamp": 1749059283238
            }, {"action": "DOWN", "timeStamp": 1749059306532}, {
                "action": "UP",
                "timeStamp": 1749059312352
            }, {"action": "UP", "timeStamp": 1749059312851}, {
                "action": "DOWN",
                "timeStamp": 1749059315949
            }, {"action": "UP", "timeStamp": 1749059318258}, {
                "action": "UP",
                "timeStamp": 1749059318769
            }, {"action": "DOWN", "timeStamp": 1749059321146}, {
                "action": "UP",
                "timeStamp": 1749059324056
            }, {"action": "UP", "timeStamp": 1749059324517}, {
                "action": "DOWN",
                "timeStamp": 1749059327729
            }, {"action": "UP", "timeStamp": 1749059329327}, {
                "action": "UP",
                "timeStamp": 1749059329888
            }, {"action": "DOWN", "timeStamp": 1749059332402}, {
                "action": "UP",
                "timeStamp": 1749059334497
            }, {"action": "UP", "timeStamp": 1749059335177}, {
                "action": "DOWN",
                "timeStamp": 1749059337531
            }, {"action": "UP", "timeStamp": 1749059339862}, {"action": "UP", "timeStamp": 1749059340353}]
            break;
        case '5':
            storedHis = [{"action": "UP", "timeStamp": 1749058164464}, {
                "action": "DOWN",
                "timeStamp": 1749058168710
            }, {"action": "DOWN", "timeStamp": 1749058169522}, {
                "action": "DOWN",
                "timeStamp": 1749058170379
            }, {"action": "UP", "timeStamp": 1749058173816}, {
                "action": "UP",
                "timeStamp": 1749058174632
            }, {"action": "DOWN", "timeStamp": 1749058184656}, {
                "action": "DOWN",
                "timeStamp": 1749058185458
            }, {"action": "UP", "timeStamp": 1749058192740}, {
                "action": "DOWN",
                "timeStamp": 1749058195177
            }, {"action": "UP", "timeStamp": 1749058199455}, {
                "action": "UP",
                "timeStamp": 1749058201377
            }, {"action": "DOWN", "timeStamp": 1749058205641}, {
                "action": "DOWN",
                "timeStamp": 1749058206199
            }, {"action": "UP", "timeStamp": 1749058210647}, {
                "action": "UP",
                "timeStamp": 1749058211112
            }, {"action": "DOWN", "timeStamp": 1749058214370}, {
                "action": "DOWN",
                "timeStamp": 1749058214897
            }, {"action": "UP", "timeStamp": 1749058221116}, {
                "action": "UP",
                "timeStamp": 1749058221559
            }, {"action": "DOWN", "timeStamp": 1749058223818}, {
                "action": "UP",
                "timeStamp": 1749058227852
            }, {"action": "DOWN", "timeStamp": 1749058231700}, {
                "action": "DOWN",
                "timeStamp": 1749058232457
            }, {"action": "DOWN", "timeStamp": 1749058235584}, {
                "action": "UP",
                "timeStamp": 1749058241884
            }, {"action": "UP", "timeStamp": 1749058242565}, {
                "action": "DOWN",
                "timeStamp": 1749058249395
            }, {"action": "DOWN", "timeStamp": 1749058250295}, {
                "action": "UP",
                "timeStamp": 1749058253235
            }, {"action": "DOWN", "timeStamp": 1749058256465}, {
                "action": "DOWN",
                "timeStamp": 1749058257215
            }, {"action": "DOWN", "timeStamp": 1749058261786}, {
                "action": "UP",
                "timeStamp": 1749058268652
            }, {"action": "UP", "timeStamp": 1749058269328}, {
                "action": "DOWN",
                "timeStamp": 1749058272683
            }, {"action": "DOWN", "timeStamp": 1749058273269}, {
                "action": "UP",
                "timeStamp": 1749058276475
            }, {"action": "UP", "timeStamp": 1749058277081}, {
                "action": "DOWN",
                "timeStamp": 1749058280614
            }, {"action": "DOWN", "timeStamp": 1749058281203}, {
                "action": "UP",
                "timeStamp": 1749058285829
            }, {"action": "UP", "timeStamp": 1749058286387}, {
                "action": "DOWN",
                "timeStamp": 1749058290557
            }, {"action": "DOWN", "timeStamp": 1749058291253}, {
                "action": "DOWN",
                "timeStamp": 1749058291951
            }, {"action": "UP", "timeStamp": 1749058295161}, {
                "action": "UP",
                "timeStamp": 1749058295697
            }, {"action": "DOWN", "timeStamp": 1749058298703}, {
                "action": "DOWN",
                "timeStamp": 1749058299238
            }, {"action": "UP", "timeStamp": 1749058301751}, {
                "action": "DOWN",
                "timeStamp": 1749058304691
            }, {"action": "DOWN", "timeStamp": 1749058305233}, {
                "action": "DOWN",
                "timeStamp": 1749058306043
            }, {"action": "DOWN", "timeStamp": 1749058311331}, {
                "action": "DOWN",
                "timeStamp": 1749058311922
            }, {"action": "UP", "timeStamp": 1749058315085}, {
                "action": "UP",
                "timeStamp": 1749058315742
            }, {"action": "DOWN", "timeStamp": 1749058320977}, {
                "action": "DOWN",
                "timeStamp": 1749058321476
            }, {"action": "UP", "timeStamp": 1749058324469}, {
                "action": "UP",
                "timeStamp": 1749058324994
            }, {"action": "DOWN", "timeStamp": 1749058331838}, {
                "action": "DOWN",
                "timeStamp": 1749058332244
            }, {"action": "UP", "timeStamp": 1749058335400}, {
                "action": "DOWN",
                "timeStamp": 1749058337864
            }, {"action": "DOWN", "timeStamp": 1749058342162}, {
                "action": "UP",
                "timeStamp": 1749058345592
            }, {"action": "UP", "timeStamp": 1749058346388}, {
                "action": "DOWN",
                "timeStamp": 1749058349680
            }, {"action": "DOWN", "timeStamp": 1749058350235}, {
                "action": "UP",
                "timeStamp": 1749058353424
            }, {"action": "UP", "timeStamp": 1749058354147}, {
                "action": "DOWN",
                "timeStamp": 1749058356886
            }, {"action": "DOWN", "timeStamp": 1749058357431}, {
                "action": "UP",
                "timeStamp": 1749058360634
            }, {"action": "UP", "timeStamp": 1749058394253}, {
                "action": "DOWN",
                "timeStamp": 1749058397619
            }, {"action": "DOWN", "timeStamp": 1749058398141}, {
                "action": "UP",
                "timeStamp": 1749058401712
            }, {"action": "UP", "timeStamp": 1749058402395}, {
                "action": "DOWN",
                "timeStamp": 1749058405972
            }, {"action": "DOWN", "timeStamp": 1749058406599}, {
                "action": "UP",
                "timeStamp": 1749058409378
            }, {"action": "UP", "timeStamp": 1749058410058}, {
                "action": "DOWN",
                "timeStamp": 1749058413699
            }, {"action": "DOWN", "timeStamp": 1749058414407}, {
                "action": "DOWN",
                "timeStamp": 1749058420740
            }, {"action": "UP", "timeStamp": 1749058423991}, {
                "action": "UP",
                "timeStamp": 1749058426268
            }, {"action": "DOWN", "timeStamp": 1749058429746}, {
                "action": "DOWN",
                "timeStamp": 1749058430326
            }, {"action": "UP", "timeStamp": 1749058432967}, {
                "action": "DOWN",
                "timeStamp": 1749058435940
            }, {"action": "DOWN", "timeStamp": 1749058436831}, {
                "action": "DOWN",
                "timeStamp": 1749058437615
            }, {"action": "UP", "timeStamp": 1749058440553}, {
                "action": "UP",
                "timeStamp": 1749058441261
            }, {"action": "UP", "timeStamp": 1749058447434}, {
                "action": "UP",
                "timeStamp": 1749058448327
            }, {"action": "DOWN", "timeStamp": 1749058453274}, {
                "action": "DOWN",
                "timeStamp": 1749058453947
            }, {"action": "UP", "timeStamp": 1749058460755}, {
                "action": "UP",
                "timeStamp": 1749058461393
            }, {"action": "DOWN", "timeStamp": 1749058464534}, {
                "action": "DOWN",
                "timeStamp": 1749058465011
            }, {"action": "UP", "timeStamp": 1749058468810}, {
                "action": "UP",
                "timeStamp": 1749058469486
            }, {"action": "DOWN", "timeStamp": 1749058472001}, {
                "action": "UP",
                "timeStamp": 1749058476801
            }, {"action": "UP", "timeStamp": 1749058477608}, {
                "action": "DOWN",
                "timeStamp": 1749058482081
            }, {"action": "DOWN", "timeStamp": 1749058482647}, {
                "action": "UP",
                "timeStamp": 1749058485505
            }, {"action": "DOWN", "timeStamp": 1749058489066}, {
                "action": "DOWN",
                "timeStamp": 1749058489705
            }, {"action": "DOWN", "timeStamp": 1749058490427}, {
                "action": "UP",
                "timeStamp": 1749058493864
            }, {"action": "UP", "timeStamp": 1749058494470}, {"action": "DOWN", "timeStamp": 1749058496908}]
            break;
        case '6':
            storedHis = [{"action": "DOWN", "timeStamp": 1749057694174}, {
                "action": "UP",
                "timeStamp": 1749057696753
            }, {"action": "DOWN", "timeStamp": 1749057697911}, {
                "action": "UP",
                "timeStamp": 1749057699861
            }, {"action": "DOWN", "timeStamp": 1749057700987}, {
                "action": "UP",
                "timeStamp": 1749057702301
            }, {"action": "DOWN", "timeStamp": 1749057703290}, {
                "action": "UP",
                "timeStamp": 1749057704268
            }, {"action": "DOWN", "timeStamp": 1749057705251}, {
                "action": "UP",
                "timeStamp": 1749057706264
            }, {"action": "DOWN", "timeStamp": 1749057707441}, {
                "action": "UP",
                "timeStamp": 1749057708509
            }, {"action": "DOWN", "timeStamp": 1749057709628}, {
                "action": "UP",
                "timeStamp": 1749057710509
            }, {"action": "DOWN", "timeStamp": 1749057711626}, {
                "action": "UP",
                "timeStamp": 1749057712443
            }, {"action": "DOWN", "timeStamp": 1749057713522}, {
                "action": "UP",
                "timeStamp": 1749057714404
            }, {"action": "DOWN", "timeStamp": 1749057715417}, {
                "action": "UP",
                "timeStamp": 1749057716409
            }, {"action": "DOWN", "timeStamp": 1749057717557}, {
                "action": "UP",
                "timeStamp": 1749057718393
            }, {"action": "DOWN", "timeStamp": 1749057719455}, {
                "action": "UP",
                "timeStamp": 1749057720304
            }, {"action": "DOWN", "timeStamp": 1749057721375}, {
                "action": "UP",
                "timeStamp": 1749057722179
            }, {"action": "DOWN", "timeStamp": 1749057723110}, {
                "action": "UP",
                "timeStamp": 1749057724065
            }, {"action": "DOWN", "timeStamp": 1749057724937}, {
                "action": "UP",
                "timeStamp": 1749057726062
            }, {"action": "DOWN", "timeStamp": 1749057727222}, {
                "action": "UP",
                "timeStamp": 1749057728461
            }, {"action": "DOWN", "timeStamp": 1749057729556}, {
                "action": "UP",
                "timeStamp": 1749057730682
            }, {"action": "DOWN", "timeStamp": 1749057731752}, {
                "action": "UP",
                "timeStamp": 1749057732716
            }, {"action": "DOWN", "timeStamp": 1749057733902}, {
                "action": "UP",
                "timeStamp": 1749057734857
            }, {"action": "DOWN", "timeStamp": 1749057735861}, {
                "action": "UP",
                "timeStamp": 1749057736551
            }, {"action": "DOWN", "timeStamp": 1749057737673}, {
                "action": "UP",
                "timeStamp": 1749057738445
            }, {"action": "DOWN", "timeStamp": 1749057739469}, {
                "action": "UP",
                "timeStamp": 1749057740277
            }, {"action": "DOWN", "timeStamp": 1749057741281}, {
                "action": "UP",
                "timeStamp": 1749057742061
            }, {"action": "DOWN", "timeStamp": 1749057743111}, {
                "action": "UP",
                "timeStamp": 1749057744007
            }, {"action": "DOWN", "timeStamp": 1749057744884}, {
                "action": "UP",
                "timeStamp": 1749057745813
            }, {"action": "DOWN", "timeStamp": 1749057746937}, {
                "action": "UP",
                "timeStamp": 1749057747946
            }, {"action": "DOWN", "timeStamp": 1749057748669}, {
                "action": "UP",
                "timeStamp": 1749057749429
            }, {"action": "DOWN", "timeStamp": 1749057750528}, {
                "action": "UP",
                "timeStamp": 1749057751152
            }, {"action": "DOWN", "timeStamp": 1749057752198}, {
                "action": "UP",
                "timeStamp": 1749057756672
            }, {"action": "DOWN", "timeStamp": 1749057757850}, {
                "action": "UP",
                "timeStamp": 1749057759169
            }, {"action": "DOWN", "timeStamp": 1749057760439}, {
                "action": "UP",
                "timeStamp": 1749057761626
            }, {"action": "DOWN", "timeStamp": 1749057762790}, {
                "action": "UP",
                "timeStamp": 1749057763859
            }, {"action": "DOWN", "timeStamp": 1749057764995}, {
                "action": "UP",
                "timeStamp": 1749057765826
            }, {"action": "DOWN", "timeStamp": 1749057766805}, {
                "action": "UP",
                "timeStamp": 1749057767772
            }, {"action": "DOWN", "timeStamp": 1749057768781}, {
                "action": "UP",
                "timeStamp": 1749057769708
            }, {"action": "DOWN", "timeStamp": 1749057770911}, {
                "action": "UP",
                "timeStamp": 1749057772126
            }, {"action": "DOWN", "timeStamp": 1749057773207}, {
                "action": "UP",
                "timeStamp": 1749057774170
            }, {"action": "DOWN", "timeStamp": 1749057775166}, {
                "action": "UP",
                "timeStamp": 1749057776198
            }, {"action": "DOWN", "timeStamp": 1749057777200}, {
                "action": "UP",
                "timeStamp": 1749057778007
            }, {"action": "DOWN", "timeStamp": 1749057779064}, {
                "action": "UP",
                "timeStamp": 1749057780037
            }, {"action": "DOWN", "timeStamp": 1749057781174}, {
                "action": "UP",
                "timeStamp": 1749057782208
            }, {"action": "DOWN", "timeStamp": 1749057783280}, {
                "action": "UP",
                "timeStamp": 1749057784126
            }, {"action": "DOWN", "timeStamp": 1749057785219}, {
                "action": "UP",
                "timeStamp": 1749057786146
            }, {"action": "DOWN", "timeStamp": 1749057787157}, {
                "action": "UP",
                "timeStamp": 1749057787965
            }, {"action": "DOWN", "timeStamp": 1749057789106}, {
                "action": "UP",
                "timeStamp": 1749057790153
            }, {"action": "DOWN", "timeStamp": 1749057791501}, {
                "action": "UP",
                "timeStamp": 1749057792619
            }, {"action": "DOWN", "timeStamp": 1749057793633}, {
                "action": "UP",
                "timeStamp": 1749057794479
            }, {"action": "DOWN", "timeStamp": 1749057795570}, {
                "action": "UP",
                "timeStamp": 1749057796388
            }, {"action": "DOWN", "timeStamp": 1749057797639}, {
                "action": "UP",
                "timeStamp": 1749057798378
            }, {"action": "DOWN", "timeStamp": 1749057799462}]
            break;
        default:
            console.log('Unknown action:', action);
    }
    if (storedHis) {
        const val = Math.sqrt(storedHis.length)
        console.log({val})
        initState(parseInt(val));
        loadHistoryFromActions(storedHis, true);
    } else {
        console.log('Unknown action:', action);
    }
}

/**
 * Exports the canvas as a PNG image.
 */
function exportCanvasAsImage() {
    const link = document.createElement('a');
    link.download = `weaving-pattern-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
    const dropdown = document.querySelector('.dropdown');
    const dropdownMenu = document.getElementById('dropdownMenu');

    if (dropdown && !dropdown.contains(event.target)) {
        dropdown.classList.remove('active');
        dropdownMenu.classList.remove('show');
    }
});

// ============================================
// INITIALIZATION
// ============================================

slider.setAttribute("value", 4)
initState(gridSize);
drawThreads();
