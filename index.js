class Command {
  execute() {
    throw new Error("execute method must be implemented");
  }

  undo() {
    throw new Error("undo method must be implemented");
  }

  redo() {
    throw new Error("redo method must be implemented");
  }
}

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const { width: canvasWidth, height: canvasHeight } = canvas;
const threadWidth = 30;
const topleft = [0.1 * canvasWidth, 0.1 * canvasHeight];
const n = 4;
let store = {
  cursor: -1,
  operator: "+",
  state: Array(n * n).fill(0),
};
store.state[0] = 1;
const tolerance = 30;
const gap =
  (0.8 * canvasWidth - tolerance * 2 - threadWidth / (n - 1)) / (n - 1);
const verticalThreads = Array(n)
  .fill(0)
  .map((e, idx) => {
    const x = topleft[0] + tolerance + idx * gap;
    const startY = 0.1 * canvasHeight + tolerance;
    return {
      points: [
        [x, 0.1 * canvasHeight],
        [x, startY - 0.5 * threadWidth],
        [x, startY + 0.5 * threadWidth],
        ...Array(n - 1)
          .fill(0)
          .map((e, intIdx) => [
            [x, startY + gap * (intIdx + 1) - threadWidth / 2],
            [x, startY + gap * (intIdx + 1) + threadWidth / 2],
          ])
          .flat(),
        [x, 0.9 * canvasHeight],
      ],
      states: Array(n).fill(Array(2 * n + 1).fill(1)),
      isMain: false,
    };
  });
const horizontalThreads = Array(n)
  .fill(0)
  .map((e, idx) => {
    const y = topleft[1] + tolerance + gap * idx;
    const startX = topleft[0] + tolerance;
    return {
      points: [
        [topleft[0], y],
        [startX - 0.5 * threadWidth, y],
        [startX + 0.5 * threadWidth, y],
        ...Array(n - 1)
          .fill(0)
          .map((e, intIdx) => [
            [startX + (intIdx + 1) * gap - 0.5 * threadWidth, y],
            [startX + (intIdx + 1) * gap + 0.5 * threadWidth, y],
          ])
          .flat(),
        [0.9 * canvasWidth, y],
      ],
      states: Array(n).fill(Array(2 * n + 1).fill(0)),
      isMain: true,
    };
  });
let frame = 0;
let mouseX = 0;
let mouseY = 0;

function drawThreads() {
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

  const lZero = store.state.reduce(
    (prev, curr) => (curr === 0 ? prev + 1 : prev),
    0,
  );
  [...horizontalThreads].map((thread, threadIdx) => {
    ctx.beginPath();
    const stateSpace = n * n;
    ctx.moveTo(thread.points[0][0], thread.points[0][1]);
    const rest = thread.points.slice(1);
    let k = 0;
    for (let i = 0; i < rest.length; i += 1) {
      console.log({
        idx: stateSpace - threadIdx * n - (parseInt(k / n) === 0),
      });
      const point = rest[i];
      while (store.state[n * (n - threadIdx) - 1 + parseInt(k / 2)] === 0) {
        ctx.beginPath();
        ctx.moveTo(point[0], point[1]);
        ++k;
        continue;
      }
      if (k % 2 === 1 && k < n * 2) {
        const index = stateSpace - threadIdx * n - 1 - parseInt(k / 2);
        if (store.state[index] === -1) {
          ctx.beginPath();
          ctx.moveTo(point[0], point[1]);
          ++k;
          continue;
        }
      }
      ctx.lineWidth = threadWidth;
      ctx.strokeStyle = "blue";
      ctx.lineTo(point[0], point[1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point[0], point[1]);
      k += 1;
    }
  });
}
const shift = (to) => {
  if (store.cursor > n * n) return;
  const temp = [...store.state];
  const nextCursor =
    store.operator === "+" ? store.cursor + 1 : store.cursor - 1;
  temp[nextCursor] = to;
  store.state = temp;
  if (
    nextCursor !== 0 &&
    (nextCursor + 1) % n === 0 &&
    store.operator === "+"
  ) {
    store.operator = "-";
    store.cursor = nextCursor + n + 1;
    return drawThreads();
  } else if (
    nextCursor % n === 0 &&
    store.operator === "-" &&
    nextCursor !== 0
  ) {
    store.operator = "+";
    store.cursor = nextCursor + n - 1;
    return drawThreads();
  }
  store.cursor = nextCursor;
  drawThreads();
};

window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowDown":
      shift(-1);
      break;
    case "ArrowUp":
      shift(1);
      break;
  }
});

drawThreads();
