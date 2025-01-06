const slider = document.getElementById('slider');
const sliderValue = document.getElementById('slider-value');
const canvas = document.getElementById("canvas");

let verticalThreads;
let horizontalThreads;
const ctx = canvas.getContext("2d");
const dim = Math.min(window.innerWidth, window.innerHeight) * 0.8
canvas.width = dim
canvas.height = dim
const {width: canvasWidth, height: canvasHeight} = canvas;
const threadWidth = 30;
let topleft = [0.1 * canvasWidth, 0.1 * canvasHeight];
let n = 4;
let store = {
    cursor: 0, operator: "+", state: Array(n * n).fill(0),
};
let activeControls = true;
store.state[0] = 1;
const tolerance = 30;
let gap = (0.8 * canvasWidth - tolerance * 2 - threadWidth / (n - 1)) / (n - 1);
let history = []

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


const initState = (colRow) => {
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
}
const draw = (ctx, point, color) => {
    ctx.lineWidth = threadWidth;
    ctx.strokeStyle = color;
    ctx.lineTo(point[0], point[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point[0], point[1]);
}

const drawThreads = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    verticalThreads.map((thread, i) => {
        ctx.beginPath();
        ctx.moveTo(thread.points[0][0], thread.points[0][1]);
        thread.points.slice(1).forEach((point, pidx) => {
            ctx.lineWidth = threadWidth;
            ctx.strokeStyle = "red";
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
    initState(n)
    activeControls = false
    for (let i = 0; i < history.length; i += 1) {
        history[i].execute();
        await delay(250)
    }
    history = []
    activeControls = true
    await delay(1000)
    initState(n)
    drawThreads()
}

const moveUp = () => {
    if (!activeControls) return
    const canvAction = new CanvasUpAction()
    history.push(canvAction)
    canvAction.execute()
}
const moveDown = () => {
    if (!activeControls) return
    const canvAction = new CanvasDownAction()
    history.push(canvAction)
    canvAction.execute()
}
window.addEventListener("keydown", (e) => {
    switch (e.key) {
        case "ArrowDown":
            moveDown()
            break;
        case "ArrowUp":
            moveUp()
            break;
    }
});
slider.addEventListener('input', () => {
    sliderValue.textContent = slider.value;
    initState(parseInt(slider.value))
    drawThreads();
});

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
    if (window.innerWidth < 800) {
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
