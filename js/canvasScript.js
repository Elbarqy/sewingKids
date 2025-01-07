const slider = document.getElementById('slider');
const sliderValue = document.getElementById('slider-value');
const horPicker = document.getElementById('slider-hor')
const verPicker = document.getElementById('slider-ver')
const canvas = document.getElementById("canvas");
let canvasFocused = false
let baseHorColor = "#8c8c8c"
let baseVerColor = "#8c8c8c"
let verticalThreads;
let horizontalThreads;
const ctx = canvas.getContext("2d");
const dim = Math.min(window.innerWidth, window.innerHeight) * 0.8
canvas.width = dim
canvas.height = dim
const {width: canvasWidth, height: canvasHeight} = canvas;
const threadWidth = 50;
let topleft = [0.1 * canvasWidth, 0.1 * canvasHeight];
let n = 10;
let store = {
    cursor: 0, operator: "+", state: Array(n * n).fill(0),
};
let activeControls = true;
store.state[0] = 1;
const tolerance = 30;
let gap = (0.8 * canvasWidth - tolerance * 2 - threadWidth / (n - 1)) / (n - 1);
let history = []
let redoActions = []

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

// Function to convert RGB to hex
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

const initState = (colRow, replay = false) => {
    if (!activeControls) return
    n = colRow;
    gap = (0.8 * canvasWidth - tolerance * 2 - threadWidth / (n - 1)) / (n - 1)
    topleft = [0.1 * canvasWidth, 0.1 * canvasHeight];
    verticalThreads = Array(n)
        .fill(0)
        .map((e, idx) => {
            const x = topleft[0] + tolerance + idx * gap;
            const startY = 0.1 * canvasHeight + tolerance;
            return {
                points: [[x, 0.1 * canvasHeight], [x, startY - 0.5 * threadWidth], [x, startY + 0.5 * threadWidth], ...Array(n - 1)
                    .fill(0)
                    .map((e, intIdx) => [[x, startY + gap * (intIdx + 1) - threadWidth / 2], [x, startY + gap * (intIdx + 1) + threadWidth / 2],])
                    .flat(), [x, 0.9 * canvasHeight],], states: Array(n).fill(Array(2 * n + 1).fill(1)), isMain: false,
            };
        });
    horizontalThreads = Array(n)
        .fill(0)
        .map((e, idx) => {
            const y = topleft[1] + tolerance + gap * idx;
            const startX = topleft[0] + tolerance;
            return {
                points: [[topleft[0], y], [startX - 0.5 * threadWidth, y], [startX + 0.5 * threadWidth, y], ...Array(n - 1)
                    .fill(0)
                    .map((e, intIdx) => [[startX + (intIdx + 1) * gap - 0.5 * threadWidth, y], [startX + (intIdx + 1) * gap + 0.5 * threadWidth, y],])
                    .flat(), [0.9 * canvasWidth, y],], states: Array(n).fill(Array(2 * n + 1).fill(0)), isMain: true,
            };
        });
    store = {
        cursor: 0, operator: "+", state: Array(n * n).fill(0),
    };
    store.state[0] = 1;
    if (!replay) history = []
    redoActions = []
}
const horTreatment = (grad, isVer) => {
    const color = isVer ? baseVerColor : baseHorColor
    grad.addColorStop(0, color);
    grad.addColorStop(0.70, 'white');
    grad.addColorStop(0.75, 'white');
    grad.addColorStop(1, color); // Cyan
    return grad
};
const curveTreatment = (grad, isRight = false) => {
    if (!isRight) {
        grad.addColorStop(0, baseHorColor);
        grad.addColorStop(0.75, 'white');
        grad.addColorStop(0.8, 'white');
        grad.addColorStop(1, baseHorColor + 'ab'); // Cyan
        return grad
    } else {
        grad.addColorStop(1, baseHorColor);
        grad.addColorStop(0.25, 'white');
        grad.addColorStop(0.2, 'white');
        grad.addColorStop(0, baseHorColor);
    }
    return grad
};
const draw = (ctx, point, color) => {
    ctx.lineWidth = threadWidth;
    const HorGrad = horTreatment(
        ctx.createLinearGradient(point[0], point[1] - threadWidth / 2, point[0], point[1] + threadWidth / 2)
    )
    ctx.strokeStyle = HorGrad;
    ctx.lineTo(point[0], point[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point[0], point[1]);
}

const offset = gap / 2 + threadWidth / 2
const controls = (p1, p2, isLeft = false) => {
    cx1 = p1[0] + (isLeft ? -offset : offset)
    cy1 = p1[1]
    cx2 = p2[0] + (isLeft ? -offset : +offset)
    cy2 = p2[1]
    return [cx1, cy1, cx2, cy2, p2[0], p2[1]]
}
const drawCurves = (ctx) => {
    const stateSpace = n * n

    for (let i = 0; i < n; i += 1) {
        if ((i + 1) % 2 === 1) {
            const index = stateSpace - n * i - 1
            if (isConnected(index) && isConnected(index - n)) {
                ctx.beginPath()
                const p = horizontalThreads[i].points[0]
                const p2 = horizontalThreads[i + 1].points[0]
                ctx.moveTo(p[0], p[1])
                const [x1, y1, x2, y2, px, py] = controls(p, p2, true)
                const curvGrade = curveTreatment(
                    ctx.createRadialGradient(
                        p[0], (p2[1] + p[1]) / 2 + 15, offset + 10,
                        p[0], (p2[1] + p[1]) / 2 + 10, offset - threadWidth + 10)
                )
                ctx.strokeStyle = (curvGrade)
                ctx.bezierCurveTo(x1, y1, x2, y2, px, py);
                ctx.stroke()
            }
        } else {
            const index = stateSpace - n * (i) - n
            if (isConnected(index) && isConnected(index - n)) {
                ctx.beginPath()
                const p = horizontalThreads[i].points[2 * n + 1]
                const p2 = horizontalThreads[i + 1].points[2 * n + 1]
                ctx.moveTo(p[0], p[1])
                const [x1, y1, x2, y2, px, py] = controls(p, p2, false)
                const curvGrade = curveTreatment(
                    ctx.createRadialGradient(
                        p[0], (p2[1] + p[1]) / 2, offset- threadWidth,
                        p[0], (p2[1] + p[1]) / 2, offset+ threadWidth/2),
                    true
                )
                ctx.strokeStyle = (curvGrade)
                ctx.bezierCurveTo(x1, y1, x2, y2, px, py);
                ctx.stroke()
            }
        }
    }

}
const isConnected = (index) => {
    return store.state[index] === 1 || store.state[index] === -1
}
const drawThreads = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Create a linear gradient


    verticalThreads.map((thread, i) => {
        ctx.beginPath();
        ctx.moveTo(thread.points[0][0], thread.points[0][1]);
        thread.points.slice(1).forEach((point, pidx) => {
            ctx.lineWidth = threadWidth;
            const verGrad = horTreatment(
                ctx.createLinearGradient(point[0] - threadWidth / 2, point[1], point[0] + threadWidth / 2, point[1]),
                true
            )
            ctx.strokeStyle = verGrad;
            ctx.lineTo(point[0], point[1]);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(point[0], point[1]);
        });
    });

    [...horizontalThreads].map((thread, threadIdx) => {
        ctx.beginPath();
        const stateSpace = n * n;
        ctx.moveTo(thread.points[0][0], thread.points[0][1]);
        const rest = thread.points.slice(1);
        for (let i = 0; i < rest.length; i += 1) {
            const point = rest[i];
            const index = stateSpace - threadIdx * n - 1 - parseInt(i / 2);
            if (store.state[index] === 0) {
                ctx.beginPath();
                ctx.moveTo(point[0], point[1]);
                continue;
            }
            if (threadIdx === 0 && i === 2 * n) {
                const shouldDraw = n % 2 !== 0 ? store.state[index + 1] !== 0 : store.state[index + 1] !== 0
                if (!shouldDraw) {
                    ctx.beginPath();
                    ctx.moveTo(point[0], point[1]);
                    continue;
                }
            }
            if (i === 2 * n && threadIdx > 0) {
                if (store.state[index + 1] === 0) {
                    ctx.beginPath();
                    ctx.moveTo(point[0], point[1]);
                    continue;
                }
            }
            if (i === 0 && store.state[index - n] === 1) {
                draw(ctx, point, "blue")
                continue
            }
            const isReversin = (n - threadIdx) % 2 === 0 && i > 0 && i < 2 * n;
            if (i % 2 === 1 && i < n * 2) {
                if (store.state[index] === -1) {
                    //draw next line and then begin next path
                    if (isReversin) {
                        ctx.moveTo(point[0], point[1]);
                        draw(ctx, rest[i + 1], 'blue')
                        i += 1;
                        continue
                    }
                    ctx.moveTo(point[0], point[1]);
                    continue;
                }
            }
            draw(ctx, point, "blue")
            if (isReversin) {
                draw(ctx, rest[i + 1], 'blue')
                i += 1
            }
        }
    });
    drawCurves(ctx)
}
const shift = (to) => {
    if (store.cursor > n * n) return;
    const temp = [...store.state];
    const nextCursor = store.operator === "+" ? store.cursor + 1 : store.cursor - 1;
    temp[nextCursor] = to;
    store.state = temp;
    if (nextCursor !== 0 && (nextCursor + 1) % n === 0 && store.operator === "+") {
        store.operator = "-";
        store.cursor = nextCursor + n + 1;
        return drawThreads();
    } else if (nextCursor % n === 0 && store.operator === "-" && nextCursor !== 0) {
        store.operator = "+";
        store.cursor = nextCursor + n - 1;
        return drawThreads();
    }
    store.cursor = nextCursor;
    drawThreads();
};

const unShift = () => {
    if (store.cursor === 0) return;
    const temp = [...store.state];
    const nextCursor = store.operator === "+" ? store.cursor - 1 : store.cursor + 1;
    temp[store.cursor] = 0;
    store.state = temp;
    if ((nextCursor + 1) % n === 0 && store.operator === "+") {
        store.operator = "-";
        store.cursor = nextCursor - n + 1;
        return drawThreads();
    } else if ((nextCursor) % n === 0 && store.operator === "-") {
        store.operator = "+";
        store.cursor = nextCursor - n - 1;
        return drawThreads();
    }
    store.cursor = nextCursor;
    drawThreads();
};

const delay = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const replay = async () => {
    initState(n, true)
    activeControls = false
    for (let i = 0; i < history.length; i += 1) {
        history[i].execute();
        await delay(250)
    }
    activeControls = true
    await delay(1000)
    initState(n)
    drawThreads()
}

const moveUp = () => {
    if (!activeControls || store.cursor === n * n + n) return
    redoActions = []
    const canvAction = new CanvasUpAction()
    history.push(canvAction)
    canvAction.execute()
}
const moveDown = () => {
    if (!activeControls || store.cursor === n * n + n) return
    redoActions = []
    const canvAction = new CanvasDownAction()
    history.push(canvAction)
    canvAction.execute()
}
canvas.addEventListener('focus', (e) => {
    canvasFocused = true;
})
canvas.addEventListener('blur', () => {
    canvasFocused = false
})
window.addEventListener("keydown", (e) => {
    if (canvasFocused) {
        e.preventDefault()
        switch (e.key) {
            case "ArrowDown":
                moveDown()
                break;
            case "ArrowUp":
                moveUp()
                break;
        }
    }
});
slider.addEventListener('input', () => {
    sliderValue.textContent = slider.value;
    initState(parseInt(slider.value))
    drawThreads();
});

verPicker.addEventListener('input', () => {
    baseVerColor = verPicker.value
    drawThreads()
})

horPicker.addEventListener('input', () => {
    baseHorColor = horPicker.value
    drawThreads()
})

class CanvasUpAction extends Command {
    constructor() {
        super();
        this.action = "UP"
        this.timeStamp = Date.now()
    }

    execute() {
        shift(1);
    }

    undo() {
        unShift()
    }

}

const undoButtonClick = () => {
    const action = history[history.length - 1]
    history.pop()
    action.undo()
    redoActions.push(action)
}
const redoButtonClick = () => {
    if (redoActions.length) {
        const action = redoActions[redoActions.length - 1]
        redoActions.pop()
        action.execute()
        history.push(action)
    }
}

class CanvasDownAction extends Command {
    constructor() {
        super();
        this.action = "DOWN"
        this.timeStamp = Date.now()
    }

    execute() {
        shift(-1);
    }

    undo() {
        unShift()
    }

}

function applyResponsiveStyles() {
    const myElement = document.querySelectorAll('.floating-btn');
    if (window.innerWidth < 1200) {
        for (let i = 0; i < myElement.length; ++i) {
            myElement[i].style.display = 'block';
        }
    } else {
        for (let i = 0; i < myElement.length; ++i) {
            myElement[i].style.display = 'none';
        }
    }
}

applyResponsiveStyles();

window.addEventListener('resize', applyResponsiveStyles);
initState(n)
drawThreads();
