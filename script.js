const canvas = document.getElementById('fieldCanvas');
const ctx = canvas.getContext('2d');

const scenes = {
  positive: [{ x: 0.5, y: 0.5, q: 1 }],
  negative: [{ x: 0.5, y: 0.5, q: -1 }],
  dipole: [
    { x: 0.36, y: 0.5, q: 1 },
    { x: 0.64, y: 0.5, q: -1 }
  ],
  like: [
    { x: 0.36, y: 0.5, q: 1 },
    { x: 0.64, y: 0.5, q: 1 }
  ],
  plate: [],
  free: []
};

let activeScene = 'positive';
let showEquipotential = false;
let highlightFieldLines = false;
let equipotentialSpacing = 1;
let zoomScale = 1;
let charges = scenes[activeScene];
let probe = { x: 0.74, y: 0.36 };
let dragging = false;
let draggedCharge = null;
let freeTool = 'positive';
let cssWidth = 0;
let cssHeight = 0;
const KQ = 8.9875517923e9 * 5e-9;

function screenToWorld(nx, ny) {
  return {
    x: (nx - 0.5) / zoomScale + 0.5,
    y: (ny - 0.5) / zoomScale + 0.5
  };
}

function worldToScreen(x, y) {
  return {
    x: (x - 0.5) * zoomScale + 0.5,
    y: (y - 0.5) * zoomScale + 0.5
  };
}

function defaultProbePosition(screenX = 0.74, screenY = 0.36) {
  return screenToWorld(screenX, screenY);
}

function potentialAt(nx, ny) {
  if (activeScene === 'plate') return -600 * Math.abs(nx - 0.5);
  let potential = 0;
  for (const charge of charges) {
    const dx = nx - charge.x;
    const dy = (ny - charge.y) * (cssHeight / cssWidth);
    const r = Math.max(Math.hypot(dx, dy), 0.026);
    potential += KQ * charge.q / r;
  }
  return potential;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssWidth = rect.width;
  cssHeight = rect.height;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function fieldAt(nx, ny) {
  if (activeScene === 'plate') {
    const side = nx < 0.5 ? -1 : 1;
    return { ex: side * 13.35, ey: 0, magnitude: 13.35 };
  }
  let ex = 0;
  let ey = 0;
  for (const charge of charges) {
    const dx = nx - charge.x;
    const dy = (ny - charge.y) * (cssHeight / cssWidth);
    const r2 = Math.max(dx * dx + dy * dy, 0.0007);
    const r = Math.sqrt(r2);
    const factor = charge.q / (r2 * r);
    ex += factor * dx;
    ey += factor * dy;
  }
  return { ex, ey, magnitude: Math.hypot(ex, ey) };
}

function drawArrow(x, y, angle, length, alpha, color = '114, 230, 225') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = `rgba(${color}, ${alpha})`;
  ctx.fillStyle = `rgba(${color}, ${alpha})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-length * 0.45, 0);
  ctx.lineTo(length * 0.45, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(length * 0.45, 0);
  ctx.lineTo(length * 0.2, -3.3);
  ctx.lineTo(length * 0.2, 3.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawVectorField() {
  const gap = cssWidth < 550 ? 40 : 38;
  for (let y = gap / 2; y < cssHeight; y += gap) {
    for (let x = gap / 2; x < cssWidth; x += gap) {
      const world = screenToWorld(x / cssWidth, y / cssHeight);
      const field = fieldAt(world.x, world.y);
      if (field.magnitude < 0.0001) continue;
      const angle = Math.atan2(field.ey * (cssWidth / cssHeight), field.ex);
      const intensity = Math.min(1, Math.log10(field.magnitude + 1) / 3.4);
      const length = 8 + intensity * 13;
      drawArrow(x, y, angle, length, 0.2 + intensity * 0.62);
    }
  }
}

function basePotentialLevels() {
  if (activeScene === 'positive') return [70, 100, 150, 250, 400, 700, 1200];
  if (activeScene === 'negative') return [-1200, -700, -400, -250, -150, -100, -70];
  if (activeScene === 'dipole') return [-600, -350, -200, -100, -50, 0, 50, 100, 200, 350, 600];
  if (activeScene === 'like') return [140, 200, 300, 500, 800, 1200];
  if (activeScene === 'plate') return [-270, -210, -150, -90, -30];
  if (!charges.length) return [];
  const hasPositive = charges.some(charge => charge.q > 0);
  const hasNegative = charges.some(charge => charge.q < 0);
  const base = hasPositive && hasNegative ? 50 : Math.round(70 * Math.sqrt(charges.length));
  const magnitudes = [1, 2, 4, 8, 14].map(factor => base * factor);
  const levels = [];
  if (hasNegative) levels.push(...magnitudes.slice().reverse().map(value => -value));
  if (hasPositive && hasNegative) levels.push(0);
  if (hasPositive) levels.push(...magnitudes);
  return levels;
}

function roundPotentialLevel(value) {
  const absolute = Math.abs(value);
  const step = absolute >= 100 ? 10 : absolute >= 20 ? 5 : 1;
  return Math.round(value / step) * step;
}

function potentialLevels() {
  const base = basePotentialLevels();
  if (!base.length || equipotentialSpacing === 1) return base;
  const result = [];
  const zeroIncluded = base.includes(0);
  for (const sign of [-1, 1]) {
    const magnitudes = base.filter(value => Math.sign(value) === sign).map(Math.abs).sort((a, b) => a - b);
    if (!magnitudes.length) continue;
    const count = Math.max(2, Math.min(12, Math.round(magnitudes.length / equipotentialSpacing)));
    const low = magnitudes[0];
    const high = magnitudes[magnitudes.length - 1];
    for (let i = 0; i < count; i++) {
      const ratio = count === 1 ? 0 : i / (count - 1);
      const value = activeScene === 'plate'
        ? low + (high - low) * ratio
        : low * Math.pow(high / low, ratio);
      result.push(roundPotentialLevel(value) * sign);
    }
  }
  if (zeroIncluded) result.push(0);
  return [...new Set(result)].sort((a, b) => a - b);
}

function edgeIntersection(pointA, valueA, pointB, valueB, level) {
  if ((valueA < level && valueB < level) || (valueA > level && valueB > level) || valueA === valueB) return null;
  const t = (level - valueA) / (valueB - valueA);
  if (t < 0 || t > 1) return null;
  return {
    x: pointA.x + (pointB.x - pointA.x) * t,
    y: pointA.y + (pointB.y - pointA.y) * t
  };
}

function drawPotentialLabel(level, point) {
  const text = `${level > 0 ? '+' : ''}${level} V`;
  ctx.save();
  ctx.font = '600 9px system-ui';
  const width = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(11,27,53,.88)';
  ctx.beginPath();
  ctx.roundRect(point.x - width / 2, point.y - 7, width, 14, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, point.x, point.y);
  ctx.restore();
}

function drawEquipotentialLines() {
  const columns = Math.max(48, Math.round(cssWidth / 12));
  const rows = Math.max(34, Math.round(cssHeight / 12));
  const values = new Float64Array((columns + 1) * (rows + 1));
  const valueAtGrid = (x, y) => values[y * (columns + 1) + x];

  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) {
      const world = screenToWorld(x / columns, y / rows);
      values[y * (columns + 1) + x] = potentialAt(world.x, world.y);
    }
  }

  for (const level of potentialLevels()) {
    let labelPoint = null;
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const points = [
          { x: x * cssWidth / columns, y: y * cssHeight / rows },
          { x: (x + 1) * cssWidth / columns, y: y * cssHeight / rows },
          { x: (x + 1) * cssWidth / columns, y: (y + 1) * cssHeight / rows },
          { x: x * cssWidth / columns, y: (y + 1) * cssHeight / rows }
        ];
        const cellValues = [
          valueAtGrid(x, y), valueAtGrid(x + 1, y),
          valueAtGrid(x + 1, y + 1), valueAtGrid(x, y + 1)
        ];
        const intersections = [];
        const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
        for (const [a, b] of edges) {
          const point = edgeIntersection(points[a], cellValues[a], points[b], cellValues[b], level);
          if (point) intersections.push(point);
        }
        if (intersections.length === 2) {
          ctx.moveTo(intersections[0].x, intersections[0].y);
          ctx.lineTo(intersections[1].x, intersections[1].y);
          const candidate = intersections[0];
          if (!labelPoint && candidate.x > cssWidth * 0.13 && candidate.x < cssWidth * 0.87 && candidate.y > cssHeight * 0.16 && candidate.y < cssHeight * 0.84) labelPoint = candidate;
        } else if (intersections.length === 4) {
          ctx.moveTo(intersections[0].x, intersections[0].y);
          ctx.lineTo(intersections[1].x, intersections[1].y);
          ctx.moveTo(intersections[2].x, intersections[2].y);
          ctx.lineTo(intersections[3].x, intersections[3].y);
        }
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.48)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (labelPoint) drawPotentialLabel(level, labelPoint);
  }
}

function nearCharge(nx, ny, threshold = 0.027) {
  return charges.some(c => Math.hypot(nx - c.x, (ny - c.y) * cssHeight / cssWidth) < threshold);
}

function drawStreamLine(charge, seedAngle) {
  const direction = charge.q > 0 ? 1 : -1;
  let nx = charge.x + Math.cos(seedAngle) * 0.033;
  let ny = charge.y + Math.sin(seedAngle) * 0.033 * cssWidth / cssHeight;
  const start = worldToScreen(nx, ny);
  ctx.beginPath();
  ctx.moveTo(start.x * cssWidth, start.y * cssHeight);
  for (let step = 0; step < 260; step++) {
    const field = fieldAt(nx, ny);
    if (field.magnitude < 0.0001) break;
    const fx = field.ex / field.magnitude;
    const fy = field.ey / field.magnitude;
    const ds = 0.006;
    nx += fx * ds * direction;
    ny += fy * ds * direction * cssWidth / cssHeight;
    const screen = worldToScreen(nx, ny);
    if (screen.x < 0 || screen.x > 1 || screen.y < 0 || screen.y > 1) break;
    ctx.lineTo(screen.x * cssWidth, screen.y * cssHeight);
    if (step > 6 && nearCharge(nx, ny)) break;
  }
  ctx.stroke();
}

function drawFieldLines() {
  ctx.save();
  ctx.strokeStyle = highlightFieldLines ? 'rgba(255,216,91,.82)' : 'rgba(101,158,226,.16)';
  ctx.lineWidth = highlightFieldLines ? 1.55 : 1;
  if (highlightFieldLines) {
    ctx.shadowColor = 'rgba(255,216,91,.72)';
    ctx.shadowBlur = 5;
  }
  if (activeScene === 'plate') {
    for (let y = 34; y < cssHeight; y += 38) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth * 0.485, y);
      ctx.moveTo(cssWidth * 0.515, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const sources = charges.some(c => c.q > 0) ? charges.filter(c => c.q > 0) : charges;
  const linesPerSource = activeScene === 'free' && sources.length
    ? Math.max(5, Math.floor(60 / sources.length))
    : 16;
  for (const charge of sources) {
    for (let i = 0; i < linesPerSource; i++) drawStreamLine(charge, i * Math.PI * 2 / linesPerSource);
  }
  ctx.restore();
}

function drawCharge(charge) {
  const screen = worldToScreen(charge.x, charge.y);
  const x = screen.x * cssWidth;
  const y = screen.y * cssHeight;
  if (screen.x < -0.08 || screen.x > 1.08 || screen.y < -0.08 || screen.y > 1.08) return;
  const positive = charge.q > 0;
  const glow = ctx.createRadialGradient(x, y, 8, x, y, 42);
  glow.addColorStop(0, positive ? 'rgba(255,111,97,.38)' : 'rgba(76,141,246,.4)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, 42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = positive ? '#ff6f61' : '#4c8df6';
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '300 27px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(positive ? '+' : '−', x, y - 1);
  if (charge === draggedCharge) {
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawPlate() {
  const x = cssWidth * 0.5;
  const top = cssHeight * 0.08;
  const height = cssHeight * 0.84;
  const glow = ctx.createLinearGradient(x - 55, 0, x + 55, 0);
  glow.addColorStop(0, 'rgba(255,111,97,0)');
  glow.addColorStop(0.5, 'rgba(255,111,97,.28)');
  glow.addColorStop(1, 'rgba(255,111,97,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 55, top, 110, height);

  ctx.fillStyle = '#ff6f61';
  ctx.strokeStyle = '#ffb2a9';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - 12, top, 24, height, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = '600 14px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = top + 24; y < top + height - 10; y += 34) ctx.fillText('+', x, y);

  ctx.save();
  ctx.translate(x + 31, top + height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,.58)';
  ctx.font = '700 10px system-ui';
  ctx.letterSpacing = '2px';
  ctx.fillText('UNIFORMLY CHARGED PLATE', 0, 0);
  ctx.restore();
}

function drawProbe() {
  const screen = worldToScreen(probe.x, probe.y);
  const x = screen.x * cssWidth;
  const y = screen.y * cssHeight;
  const field = fieldAt(probe.x, probe.y);
  const angle = Math.atan2(field.ey * (cssWidth / cssHeight), field.ex);
  if (field.magnitude > 0.0001) drawArrow(x, y, angle, 58, 1, '255, 216, 91');
  ctx.strokeStyle = '#ffd85b';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd85b';
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,216,91,.3)';
  ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.stroke();
}

function draw() {
  if (!cssWidth || !cssHeight) return;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const bg = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
  bg.addColorStop(0, '#0b1b35'); bg.addColorStop(1, '#0e2749');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cssWidth, cssHeight);
  if (showEquipotential) drawEquipotentialLines();
  drawFieldLines();
  drawVectorField();
  if (activeScene === 'plate') drawPlate();
  else charges.forEach(drawCharge);
  if (activeScene === 'free' && charges.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,.66)';
    ctx.font = '600 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Choose + or −, then click to place a charge', cssWidth / 2, cssHeight / 2);
  }
  drawProbe();
  updateMeter();
}

function directionName(degrees) {
  const labels = ['right', 'up and right', 'up', 'up and left', 'left', 'down and left', 'down', 'down and right'];
  const normalized = (degrees + 360) % 360;
  return labels[Math.round(normalized / 45) % 8];
}

function updateMeter() {
  const field = fieldAt(probe.x, probe.y);
  const physicalE = field.magnitude * KQ;
  const potential = potentialAt(probe.x, probe.y);
  const angleCanvas = Math.atan2(field.ey * (cssWidth / cssHeight), field.ex);
  const degrees = ((-angleCanvas * 180 / Math.PI) + 360) % 360;
  document.getElementById('fieldMagnitude').textContent = physicalE < 1000 ? physicalE.toFixed(1) : physicalE.toExponential(2);
  document.getElementById('fieldAngle').textContent = `${Math.round(degrees)}°`;
  document.getElementById('directionWord').textContent = field.magnitude < 0.0005 ? 'approximately zero' : directionName(degrees);
  document.getElementById('compassArrow').style.transform = `rotate(${90 - degrees}deg)`;
  document.getElementById('strengthFill').style.width = `${Math.min(100, Math.log10(physicalE + 1) * 25)}%`;
  document.getElementById('potentialValue').textContent = Math.abs(potential) >= 1000 ? potential.toExponential(2) : potential.toFixed(1);
  updateForce(physicalE);
}

function updateForce(knownE) {
  const field = fieldAt(probe.x, probe.y);
  const physicalE = knownE ?? field.magnitude * KQ;
  const q = Number(document.getElementById('testCharge').value);
  const forceMicroNewtons = Math.abs(q) * 1e-9 * physicalE * 1e6;
  document.getElementById('testChargeValue').textContent = `${q > 0 ? '+' : ''}${q} nC`;
  document.getElementById('forceValue').textContent = `${forceMicroNewtons.toFixed(3)} μN`;
  document.getElementById('forceHint').textContent = q === 0
    ? 'A zero test charge experiences no electric force'
    : q > 0 ? 'A positive test charge experiences a force in the direction of the field' : 'A negative test charge experiences a force opposite to the field';
}

function moveProbe(event) {
  const position = canvasPosition(event);
  probe.x = position.x;
  probe.y = position.y;
  draw();
}

function canvasPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const screenX = Math.max(0.04, Math.min(0.96, (event.clientX - rect.left) / rect.width));
  const screenY = Math.max(0.05, Math.min(0.95, (event.clientY - rect.top) / rect.height));
  return screenToWorld(screenX, screenY);
}

function chargeAtPosition(position) {
  return charges.find(charge => {
    const dx = (charge.x - position.x) * cssWidth * zoomScale;
    const dy = (charge.y - position.y) * cssHeight * zoomScale;
    return Math.hypot(dx, dy) < 30;
  }) || null;
}

function setFreeStatus(message) {
  document.getElementById('freeStatus').textContent = message;
}

function updateEquipotentialButton() {
  const button = document.getElementById('togglePotential');
  button.classList.toggle('active', showEquipotential);
  button.setAttribute('aria-pressed', String(showEquipotential));
  button.textContent = showEquipotential ? 'Hide equipotential lines' : 'Show equipotential lines';
  document.getElementById('potentialLegend').classList.toggle('show', showEquipotential);
}

canvas.addEventListener('pointerdown', event => {
  if (activeScene === 'free') {
    const position = canvasPosition(event);
    const selectedCharge = chargeAtPosition(position);
    canvas.setPointerCapture(event.pointerId);
    if (selectedCharge) {
      draggedCharge = selectedCharge;
      setFreeStatus('Drag to reposition this charge. Double-click it to remove it.');
      draw();
      return;
    }
    if (freeTool === 'probe') {
      dragging = true;
      moveProbe(event);
      return;
    }
    if (charges.length >= 12) {
      setFreeStatus('The limit is 12 charges. Remove or clear a charge before adding another.');
      return;
    }
    charges.push({ x: position.x, y: position.y, q: freeTool === 'positive' ? 1 : -1 });
    setFreeStatus(`${freeTool === 'positive' ? 'Positive' : 'Negative'} charge added. Drag it to reposition it, or select another tool.`);
    draw();
    return;
  }
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
  moveProbe(event);
});
canvas.addEventListener('pointermove', event => {
  if (draggedCharge) {
    const position = canvasPosition(event);
    draggedCharge.x = position.x;
    draggedCharge.y = position.y;
    draw();
  } else if (dragging) moveProbe(event);
});
canvas.addEventListener('pointerup', () => { dragging = false; draggedCharge = null; draw(); });
canvas.addEventListener('pointercancel', () => { dragging = false; draggedCharge = null; draw(); });
canvas.addEventListener('dblclick', event => {
  if (activeScene !== 'free') return;
  const selectedCharge = chargeAtPosition(canvasPosition(event));
  if (!selectedCharge) return;
  charges.splice(charges.indexOf(selectedCharge), 1);
  draggedCharge = null;
  setFreeStatus('Charge removed. Select + or − to add another charge.');
  draw();
});

document.querySelectorAll('.scenario').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('.scenario.active').classList.remove('active');
    button.classList.add('active');
    activeScene = button.dataset.scene;
    charges = scenes[activeScene];
    probe = activeScene === 'dipole' ? defaultProbePosition(0.5, 0.28) : defaultProbePosition();
    const freeMode = activeScene === 'free';
    document.getElementById('freeControls').classList.toggle('show', freeMode);
    document.getElementById('dragHint').innerHTML = freeMode
      ? 'Place or drag <span>±</span> charges'
      : 'Drag the <span>◎</span> probe to explore';
    if (freeMode) {
      showEquipotential = true;
      updateEquipotentialButton();
      setFreeStatus('Select a charge, then click anywhere in the field. Drag a charge to move it; double-click it to remove it.');
    }
    draw();
  });
});

document.querySelectorAll('.free-tool').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('.free-tool.active').classList.remove('active');
    button.classList.add('active');
    freeTool = button.dataset.tool;
    const instructions = {
      positive: 'Click in the field to add a +5 nC charge. Existing charges can be dragged.',
      negative: 'Click in the field to add a −5 nC charge. Existing charges can be dragged.',
      probe: 'Click or drag in empty space to move the yellow field probe.'
    };
    setFreeStatus(instructions[freeTool]);
  });
});

document.getElementById('clearFreeCharges').addEventListener('click', () => {
  scenes.free.length = 0;
  draggedCharge = null;
  setFreeStatus('All charges cleared. Select + or −, then click in the field to begin again.');
  draw();
});

document.getElementById('togglePotential').addEventListener('click', event => {
  showEquipotential = !showEquipotential;
  updateEquipotentialButton();
  draw();
});

document.getElementById('toggleFieldHighlight').addEventListener('click', event => {
  highlightFieldLines = !highlightFieldLines;
  event.currentTarget.classList.toggle('active', highlightFieldLines);
  event.currentTarget.setAttribute('aria-pressed', String(highlightFieldLines));
  event.currentTarget.textContent = highlightFieldLines ? 'Remove field-line highlight' : 'Highlight field lines';
  draw();
});

document.getElementById('potentialSpacing').addEventListener('input', event => {
  equipotentialSpacing = Number(event.currentTarget.value);
  document.getElementById('potentialSpacingValue').textContent = `${equipotentialSpacing.toFixed(1)}×`;
  draw();
});

function changeZoom(amount) {
  zoomScale = Math.max(0.75, Math.min(2.5, Math.round((zoomScale + amount) * 4) / 4));
  document.getElementById('zoomValue').textContent = `${Math.round(zoomScale * 100)}%`;
  draw();
}

document.getElementById('zoomOut').addEventListener('click', () => changeZoom(-0.25));
document.getElementById('zoomIn').addEventListener('click', () => changeZoom(0.25));

document.getElementById('testCharge').addEventListener('input', () => updateForce());
document.getElementById('resetProbe').addEventListener('click', () => {
  probe = defaultProbePosition();
  draw();
});

window.addEventListener('resize', resizeCanvas);
if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas);
resizeCanvas();
