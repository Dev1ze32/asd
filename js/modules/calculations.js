/* ============================================
   CALCULATIONS.JS - Math & Formula Engine
   Pioneer Adhesives Routing Template System
   
   Handles all formula calculations for the
   routing table including run time, labor
   minutes, machine minutes, DL, VOH, FOH.
   ============================================ */

/**
 * Calculation constants
 */
const CALC_CONSTANTS = {
  DECIMAL_PLACES_DISPLAY: 5,
  DECIMAL_PLACES_TIME: 5
};

/**
 * Safely evaluate a formula expression
 * Only supports basic arithmetic: +, -, *, /, parentheses
 * Must start with '=' to be treated as a formula
 * @param {string} input - The formula string (e.g., "=80/20+30-6")
 * @returns {number} The computed result, or 0 if invalid
 */
function evaluateFormula(input) {
  if (input === null || input === undefined) {
    return 0;
  }

  var s = String(input).trim();

  // Not a formula - try plain number
  if (!s.startsWith('=')) {
    var parsed = parseFloat(s);
    return isNaN(parsed) ? 0 : parsed;
  }

  // Formula mode - remove '=' prefix
  var expr = s.slice(1);

  // Security validation: only allow digits, decimal points, operators, parentheses, whitespace
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    return 0;
  }

  try {
    var result = new Function('return (' + expr + ')')();
    if (result === null || result === undefined || typeof result !== 'number') {
      return 0;
    }
    if (isNaN(result) || !isFinite(result)) {
      return 0;
    }
    return result;
  } catch (e) {
    return 0;
  }
}

/**
 * Handle blur event on Time input: evaluate formula and show result
 * @param {HTMLInputElement} input
 */
function evaluateTimeFormula(input) {
  var rawValue = input.value;
  var result = evaluateFormula(rawValue);

  // Store the original formula/expression for re-editing
  if (rawValue.trim().startsWith('=')) {
    input.setAttribute('data-formula', rawValue.trim());
  } else {
    input.removeAttribute('data-formula');
  }

  // Display the result
  input.value = result;
  calculateAll();
}

/**
 * Handle focus event on Time input: restore formula for editing
 * @param {HTMLInputElement} input
 */
function restoreTimeFormula(input) {
  var formula = input.getAttribute('data-formula');
  if (formula) {
    input.value = formula;
  }
}

/**
 * Handle keydown on Time input: evaluate on Enter key
 * @param {KeyboardEvent} event
 * @param {HTMLInputElement} input
 */
function handleTimeKeydown(event, input) {
  if (event.key === 'Enter') {
    event.preventDefault();
    input.blur();
  }
}

/**
 * Calculate all derived values for a single row
 * @param {number} pax - Number of workers
 * @param {number} machine - Number of machines
 * @param {number} time - Time in minutes
 * @param {number} qty - FG quantity per unit
 * @returns {Object} Calculated values
 */
function calculateRow(pax, machine, time, qty) {
  var safeQty = Math.max(qty, 0);
  var safePax = Math.max(pax, 0);
  var safeMachine = Math.max(machine, 0);
  var safeTime = Math.max(time, 0);

  var runTimeRaw = safeQty !== 0 ? (safeTime / safeQty) : 0;
  
  // Excel forcefully rounds up the Run Time to 5 decimal places
  var runTime = Math.ceil(runTimeRaw * 1e5) / 1e5;

  var laborMin = Math.round((safePax * safeTime) * 1e5) / 1e5;
  var mcMin = Math.round((safeMachine * safeTime) * 1e5) / 1e5;

  var dlUnits = 0;
  if (safeTime > 0) {
    var dlBase = runTime * safePax;
    if (dlBase > 0) {
      // Excel uses normal rounding (ROUND, not ROUNDUP) for DL (UNITS/1 MIN)
      // based on the already rounded Run Time
      var exactDl = 1 / dlBase;
      dlUnits = Math.round(exactDl);
    }
  }

  // BOM costs are calculated using the 5-decimal rounded runTime
  var dl = runTime * safePax;
  var voh = runTime;
  var foh = runTime;

  return {
    runTime: runTime,
    laborMin: laborMin,
    mcMin: mcMin,
    dlUnits: dlUnits,
    dl: dl,
    voh: voh,
    foh: foh
  };
}

/**
 * Perform full recalculation of all table rows and update totals
 * Reads input values directly from DOM, writes computed values back
 */
function calculateAll() {
  var qtyInput = document.getElementById('qtyInput');
  var qty = parseFloat(qtyInput?.value) || 0;

  var totalPax = 0;
  var totalMachine = 0;
  var totalTime = 0;
  var totalRunTime = 0;
  var totalLabor = 0;
  var totalMc = 0;
  var totalDL = 0;
  var totalVOH = 0;
  var totalFOH = 0;

  var rows = document.querySelectorAll('#tableBody tr');

  rows.forEach(function(row) {
    var paxInput = row.querySelector('.pax-input');
    var machineInput = row.querySelector('.machine-input');
    var timeInput = row.querySelector('.time-input');

    var pax = parseFloat(paxInput?.value) || 0;
    var machine = parseFloat(machineInput?.value) || 0;
    var time = parseFloat(timeInput?.value) || 0;

    var calc = calculateRow(pax, machine, time, qty);

    // Update computed cells in DOM
    var runTimeCell = row.querySelector('.run-time-cell');
    var laborMinCell = row.querySelector('.labor-min-cell');
    var mcMinCell = row.querySelector('.mc-min-cell');
    var dlUnitsCell = row.querySelector('.dl-units-cell');
    var dlCell = row.querySelector('.dl-cell');
    var vohCell = row.querySelector('.voh-cell');
    var fohCell = row.querySelector('.foh-cell');

    if (runTimeCell) runTimeCell.textContent = formatNumber(calc.runTime);
    if (laborMinCell) laborMinCell.textContent = formatNumber(calc.laborMin);
    if (mcMinCell) mcMinCell.textContent = formatNumber(calc.mcMin);
    if (dlUnitsCell) dlUnitsCell.textContent = formatNumber(calc.dlUnits);
    if (dlCell) dlCell.textContent = formatNumber(calc.dl);
    if (vohCell) vohCell.textContent = formatNumber(calc.voh);
    if (fohCell) fohCell.textContent = formatNumber(calc.foh);

    // Accumulate totals
    totalPax += pax;
    totalMachine += machine;
    totalTime += time;
    totalRunTime += calc.runTime;
    totalLabor += calc.laborMin;
    totalMc += calc.mcMin;
    totalDL += calc.dl;
    totalVOH += calc.voh;
    totalFOH += calc.foh;
  });

  // Update footer totals
  updateTotals({
    pax: totalPax,
    machine: totalMachine,
    time: totalTime,
    runTime: totalRunTime,
    labor: totalLabor,
    mc: totalMc,
    dl: totalDL,
    voh: totalVOH,
    foh: totalFOH
  });
}

/**
 * Update the totals row in the footer
 * @param {Object} totals
 */
function updateTotals(totals) {
  var els = {
    sumPax: document.getElementById('sumPax'),
    sumMachine: document.getElementById('sumMachine'),
    sumTime: document.getElementById('sumTime'),
    sumRunTime: document.getElementById('sumRunTime'),
    sumLaborMin: document.getElementById('sumLaborMin'),
    sumMcMin: document.getElementById('sumMcMin'),
    sumDL: document.getElementById('sumDL'),
    sumVOH: document.getElementById('sumVOH'),
    sumFOH: document.getElementById('sumFOH')
  };

  if (els.sumPax) els.sumPax.textContent = totals.pax;
  if (els.sumMachine) els.sumMachine.textContent = totals.machine;
  if (els.sumTime) els.sumTime.textContent = formatNumber(totals.time);
  if (els.sumRunTime) els.sumRunTime.textContent = formatNumber(totals.runTime);
  if (els.sumLaborMin) els.sumLaborMin.textContent = formatNumber(totals.labor);
  if (els.sumMcMin) els.sumMcMin.textContent = formatNumber(totals.mc);
  if (els.sumDL) els.sumDL.textContent = formatNumber(totals.dl);
  if (els.sumVOH) els.sumVOH.textContent = formatNumber(totals.voh);
  if (els.sumFOH) els.sumFOH.textContent = formatNumber(totals.foh);
}

/**
 * Format a number for display
 * @param {number} num
 * @param {number} decimals
 * @returns {string}
 */
function formatNumber(num, decimals) {
  if (decimals === undefined) decimals = CALC_CONSTANTS.DECIMAL_PLACES_DISPLAY;
  if (isNaN(num) || !isFinite(num)) return '0.00000';
  return num.toFixed(decimals);
}

// Expose globally
window.evaluateFormula = evaluateFormula;
window.evaluateTimeFormula = evaluateTimeFormula;
window.restoreTimeFormula = restoreTimeFormula;
window.handleTimeKeydown = handleTimeKeydown;
window.calculateRow = calculateRow;
window.calculateAll = calculateAll;
window.updateTotals = updateTotals;
window.formatNumber = formatNumber;