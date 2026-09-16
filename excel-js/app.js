const $ = el => document.querySelector(el)
const $$ = el => document.querySelectorAll(el)

const ROWS = 15
const COLUMNS = 10
const FIRST_CHAR_CODE = 65

const range = length => Array.from({ length }, (_, i) => i)
const getColumnLetter = i => String.fromCharCode(FIRST_CHAR_CODE + i)

// Estado de la aplicación
let STATE = range(COLUMNS).map(() =>
  range(ROWS).map(() => ({ computedValue: '', value: '' }))
)

let selectedCell = null

// Guardar y Cargar de localStorage
const saveToLocalStorage = () => {
  localStorage.setItem('hojaclara_state', JSON.stringify(STATE))
}

const loadFromLocalStorage = () => {
  const saved = localStorage.getItem('hojaclara_state')
  if (saved) {
    STATE = JSON.parse(saved)
  }
}

// Evaluador matemático que soporta paréntesis y jerarquía de operaciones
const evaluateExpression = (expr) => {
  expr = expr.replace(/\s+/g, '')

  // 1. Resolver paréntesis recursivamente
  while (expr.includes('(')) {
    expr = expr.replace(/\(([^()]+)\)/g, (_, subExpr) => evaluateExpression(subExpr))
  }

  // 2. Separar tokens incluyendo números negativos y decimales
  const tokens = expr.match(/(-?\d+\.?\d*|[\+\-\*\/])/g)
  if (!tokens) return parseFloat(expr) || 0

  if (tokens.length === 1) return parseFloat(tokens[0]) || 0

  // 3. Resolver multiplicaciones y divisiones (* /)
  let i = 0
  while (i < tokens.length) {
    if (tokens[i] === '*' || tokens[i] === '/') {
      const prev = parseFloat(tokens[i - 1])
      const next = parseFloat(tokens[i + 1])
      const res = tokens[i] === '*' ? prev * next : prev / next
      tokens.splice(i - 1, 3, res.toString())
      i--
    } else {
      i++
    }
  }

  // 4. Resolver sumas y restas (+ -)
  let result = parseFloat(tokens[0]) || 0
  for (i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const next = parseFloat(tokens[i + 1])
    if (isNaN(next)) continue
    if (op === '+') result += next
    if (op === '-') result -= next
  }

  return result
}

// Cálculo del valor de una celda
const computeValue = (value) => {
  if (!value || typeof value !== 'string') return value
  if (!value.startsWith('=')) return value

  let formula = value.slice(1).toUpperCase().trim()

  try {
    const parsedFormula = formula.replace(/([A-J])([0-9]+)/g, (_, colLetter, rowNum) => {
      const c = colLetter.charCodeAt(0) - FIRST_CHAR_CODE
      const r = parseInt(rowNum, 10) - 1

      if (c >= 0 && c < COLUMNS && r >= 0 && r < ROWS) {
        const cellVal = STATE[c][r].computedValue
        const numVal = parseFloat(cellVal)
        return !isNaN(numVal) ? numVal : 0
      }
      return 0
    })

    return evaluateExpression(parsedFormula)
  } catch {
    return '#ERROR!'
  }
}

// Actualización fluida sin congelar la pantalla
const updateAllCells = () => {
  // Pasadas para resolver dependencias encadenadas en el estado
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < COLUMNS; c++) {
      for (let r = 0; r < ROWS; r++) {
        STATE[c][r].computedValue = computeValue(STATE[c][r].value)
      }
    }
  }

  // Actualización masiva de inputs
  const inputs = $$('tbody input')
  inputs.forEach($input => {
    const c = parseInt($input.dataset.col, 10)
    const r = parseInt($input.dataset.row, 10) // Sintaxis corregida aquí

    if (document.activeElement !== $input) {
      $input.value = STATE[c][r].computedValue
    }
  })

  // Guardar estado actualizado en el almacenamiento local
  saveToLocalStorage()
}

const clearSelection = () => {
  $$('td').forEach(td => td.classList.remove('selected', 'column-selected'))
}

const selectCell = (col, row) => {
  clearSelection()
  selectedCell = { col, row }

  const $td = $(`td[data-col="${col}"][data-row="${row}"]`)
  if ($td) $td.classList.add('selected')
}

const selectColumn = (colIndex) => {
  clearSelection()
  selectedCell = null

  for (let r = 0; r < ROWS; r++) {
    const $td = $(`td[data-col="${colIndex}"][data-row="${r}"]`)
    if ($td) $td.classList.add('column-selected')
  }
}

const renderSpreadSheet = () => {
  const $head = $('thead')
  const $body = $('tbody')

  const headerHTML = `<tr>
    <th></th>
    ${range(COLUMNS).map(i => `<th class="col-header" data-col="${i}">${getColumnLetter(i)}</th>`).join('')}
  </tr>`

  $head.innerHTML = headerHTML

  const bodyHTML = range(ROWS).map(row => {
    return `<tr>
      <th>${row + 1}</th>
      ${range(COLUMNS).map(col => `
        <td data-col="${col}" data-row="${row}">
          <input type="text" data-col="${col}" data-row="${row}" />
        </td>
      `).join('')}
    </tr>`
  }).join('')

  $body.innerHTML = bodyHTML
}

document.addEventListener('DOMContentLoaded', () => {
  renderSpreadSheet()
  loadFromLocalStorage() // Carga los datos al iniciar
  updateAllCells()        // Calcula y dibuja los valores en los inputs

  // Guardar valor en el estado mientras se escribe
  $('tbody').addEventListener('input', (e) => {
    if (!e.target.matches('input')) return
    const col = parseInt(e.target.dataset.col, 10)
    const row = parseInt(e.target.dataset.row, 10)

    STATE[col][row].value = e.target.value
  })

  // Al presionar Enter, desensfoca la celda
  $('tbody').addEventListener('keydown', (e) => {
    if (!e.target.matches('input')) return
    if (e.key === 'Enter') {
      e.preventDefault()
      e.target.blur()
    }
  })

  // Al enfocar, muestra la fórmula original
  $('tbody').addEventListener('focusin', (e) => {
    if (!e.target.matches('input')) return
    const col = parseInt(e.target.dataset.col, 10)
    const row = parseInt(e.target.dataset.row, 10)

    selectCell(col, row)
    e.target.value = STATE[col][row].value
  })

  // Al salir de la celda, recalcula todas las fórmulas
  $('tbody').addEventListener('focusout', (e) => {
    if (!e.target.matches('input')) return
    updateAllCells()
  })

  $('thead').addEventListener('click', (e) => {
    if (e.target.classList.contains('col-header')) {
      const col = parseInt(e.target.dataset.col, 10)
      selectColumn(col)
    }
  })

  document.addEventListener('keydown', (e) => {
    if (!selectedCell) return
    const { col, row } = selectedCell

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      navigator.clipboard.writeText(STATE[col][row].value)
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      navigator.clipboard.readText().then(text => {
        STATE[col][row].value = text
        updateAllCells()
        selectCell(col, row)
      })
    }
  })  
})