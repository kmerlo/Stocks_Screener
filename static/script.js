console.log("[script.js] Script loading started...");
let activeView = 'monitoring';
let activeListId = null;
let activeTicker = null;
let activeTickerName = null;
let mainChart = null;
let priceSeries = null;
let mainLegend = null;
let activeIndicators = []; // [{ id, type, params, paneIndex, seriesList: [] }]
let secondaryCharts = []; // [{ chart, container, paneIndex, type, legend, series: [] }]
let activePriceData = []; // Store current candles for syncing subplots
let loadedTemplateId = null;
let loadedTemplateName = null;
let screeningSheets = [];
let activeScreeningSheetId = null;
let lastScreeningResults = [];
let screeningResultsCache = {}; // { sheetId: results[] }
let screeningSort = { column: 'symbol', order: 'asc' };
let dynamicFilters = {}; // { columnKey: { min, max } } 
let seriesDataMap = new Map(); // series -> Map<"YYYY-MM-DD", dataPoint>
let subUniverseSymbols = null; // List of symbols to filter by for screening
let lastFilteredSymbols = []; // Symbols currently visible after filtering
let tickerMappingsLookup = new Map(); // symbol_investing -> symbol_yahoo

// Global Sync State
let isSyncing = false;
let isSyncingCrosshair = false;
let syncAnimationFrame = null;
let syncCrosshairAnimationFrame = null;

// --- Multi-Chart Slot System ---
const NUM_CHART_SLOTS = 4;
let chartSlots = [];
let activeChartIndex = 0;
let activeChartCount = 1;

function initChartSlots() {
    chartSlots = [];
    for (let i = 0; i < NUM_CHART_SLOTS; i++) {
        chartSlots[i] = {
            index: i,
            chart: null,
            priceSeries: null,
            legend: null,
            container: null,
            ticker: '',
            tickerName: '',
            activeIndicators: [],
            secondaryCharts: [],
            seriesDataMap: new Map(),
            activePriceData: [],
            currentSeriesType: 'candle',
            canvas: null,
            ctx: null,
        };
    }
    activeChartIndex = 0;
}

function activateChartSlot(index) {
    if (index < 0 || index >= NUM_CHART_SLOTS) return;
    if (activeChartIndex === index && mainChart !== null) return;

    if (mainChart !== null) saveActiveSlotState();
    activeChartIndex = index;
    restoreSlotState(index);

    document.querySelectorAll('.chart-slot-header').forEach(h => h.classList.remove('active'));
    document.querySelectorAll('.chart-slot').forEach(s => s.classList.remove('active'));
    const header = document.querySelector(`.chart-slot-header[data-slot="${index}"]`);
    if (header) header.classList.add('active');
    const slotEl = document.querySelector(`.chart-slot[data-slot="${index}"]`);
    if (slotEl) slotEl.classList.add('active');

    const slot = chartSlots[index];

    const titleMain = document.getElementById('chart-title-main');
    if (titleMain) {
        titleMain.textContent = slot.tickerName
            ? `${slot.ticker} - ${slot.tickerName}`
            : (slot.ticker || 'Select a ticker');
    }

    const nameSpan = document.querySelector(`.chart-slot-name[data-slot="${index}"]`);
    if (nameSpan) nameSpan.textContent = slot.tickerName || '';

    updateVariation();
    renderActiveIndicatorsUI();
    reattachDrawingListeners();
    if (slot.ticker) loadFundamentalData(slot.ticker);
    setTimeout(() => resizeDrawingCanvas(), 50);
}

function saveActiveSlotState() {
    const slot = chartSlots[activeChartIndex];
    if (!slot) return;
    slot.chart = mainChart;
    slot.priceSeries = priceSeries;
    slot.legend = mainLegend;
    slot.ticker = activeTicker;
    slot.tickerName = activeTickerName;
    slot.activeIndicators = activeIndicators;
    slot.secondaryCharts = secondaryCharts;
    slot.seriesDataMap = seriesDataMap;
    slot.activePriceData = activePriceData;
    slot.canvas = drawingCanvas;
    slot.ctx = drawingCtx;
}

function restoreSlotState(index) {
    const slot = chartSlots[index];
    if (!slot) return;
    mainChart = slot.chart;
    priceSeries = slot.priceSeries;
    mainLegend = slot.legend;
    activeTicker = slot.ticker;
    activeTickerName = slot.tickerName;
    activeIndicators = slot.activeIndicators;
    secondaryCharts = slot.secondaryCharts;
    seriesDataMap = slot.seriesDataMap;
    activePriceData = slot.activePriceData;
    drawingCanvas = slot.canvas;
    drawingCtx = slot.ctx;
}
function setChartCount(n) {
    n = Math.max(1, Math.min(4, n));
    activeChartCount = n;

    const grid = document.getElementById('chart-grid');
    if (grid) {
        grid.className = grid.className.replace(/\bcols-\d+\b/g, '').trim() + ` cols-${n}`;
    }

    for (let i = 0; i < NUM_CHART_SLOTS; i++) {
        const slotEl = document.querySelector(`.chart-slot[data-slot="${i}"]`);
        if (slotEl) {
            slotEl.classList.toggle('hidden-slot', i >= n);
        }
    }

    if (activeChartIndex >= n) {
        activateChartSlot(0);
    }

    resizeAllCharts();
}

function changeChartCount(n) {
    setChartCount(n);
    autoPopulateEmptySlots();
}

async function autoPopulateEmptySlots() {
    const firstSlotSelect = document.querySelector('.chart-slot-ticker');
    if (!firstSlotSelect) return;
    const tickers = Array.from(firstSlotSelect.options).map(o => o.value).filter(v => v);
    if (tickers.length === 0) return;

    const originalSlot = activeChartIndex;
    const slot0Ticker = chartSlots[0].ticker;
    let startIndex = tickers.indexOf(slot0Ticker);
    if (startIndex === -1) startIndex = 0;

    for (let i = 0; i < activeChartCount; i++) {
        const slot = chartSlots[i];
        if (slot.ticker) continue;
        // Skip slot 0 if already handled (e.g. during init)
        if (i === 0 && activeTicker) continue;

        const listIdx = (startIndex + i) % tickers.length;
        const symbol = tickers[listIdx];
        const alreadyUsed = chartSlots.some((s, idx) =>
            idx < activeChartCount && idx !== i && s.ticker === symbol
        );
        if (alreadyUsed) continue;

        const slotSelect = document.querySelector(`.chart-slot-ticker[data-slot="${i}"]`);
        if (slotSelect) slotSelect.value = symbol;

        activateChartSlot(i);
        activeTicker = symbol;
        activeTickerName = null;
        await updateChart(symbol);

        const nameSpan = document.querySelector(`.chart-slot-name[data-slot="${i}"]`);
        if (nameSpan) nameSpan.textContent = activeTickerName || '';
        saveActiveSlotState();
    }

    if (activeChartIndex !== originalSlot) {
        activateChartSlot(originalSlot);
    }
}

let variationDebounceTimer = null; // Debounce for variation updates

// Drawing Tools State
let currentDrawingTool = 'cursor';
let drawings = []; // [{ type, points: [{time, price}], ticker }]
let activeDrawing = null;
let drawingCanvas = null;
let drawingCtx = null;
let lastMousePos = { x: 0, y: 0 };
let isDragging = false;
let dragTarget = null;
let dragStartPos = { time: null, price: null };
let dragPointIndex = -1; // -1 = move whole object, >=0 = move specific point
let originalPoints = [];

// Normalization function to ensure all charts start and behave identically
function normalizeChart(chart) {
    if (!chart) return;
    chart.applyOptions({
        timeScale: {
            rightOffset: 5,
            barSpacing: 6,
            minBarSpacing: 0.5,
            shiftVisibleRangeOnNewBar: false,
        },
        rightPriceScale: {
            width: 100,
            autoScale: true,
        },
        leftPriceScale: {
            visible: false,
        }
    });
}

// 1. Chart Sync Listener (Logical Range Based for perfect vertical alignment)
const syncChartsListener = (sourceChart) => {
    if (isSyncing) return;

    const range = sourceChart.timeScale().getVisibleLogicalRange();
    if (!range) return;

    // Find the slot owning sourceChart (independent of activeChartIndex)
    let ownerSlot = null;
    for (const slot of chartSlots) {
        if (slot.chart === sourceChart || slot.secondaryCharts.some(sc => sc.chart === sourceChart)) {
            ownerSlot = slot;
            break;
        }
    }
    if (!ownerSlot) return;

    // Update variation/UI only when interacting with the active chart
    if (ownerSlot === chartSlots[activeChartIndex] && sourceChart === ownerSlot.chart) {
        if (variationDebounceTimer) clearTimeout(variationDebounceTimer);
        variationDebounceTimer = setTimeout(() => {
            const r = sourceChart.timeScale().getVisibleLogicalRange();
            if (r) {
                const numBars = Math.round(r.to - r.from);
                const visibleBarsInput = document.getElementById('visible-bars-input');
                if (visibleBarsInput) visibleBarsInput.value = numBars;
                updateVariation();
            }
        }, 500);
        requestAnimationFrame(redrawAllDrawings);
    }

    cancelAnimationFrame(syncAnimationFrame);
    syncAnimationFrame = requestAnimationFrame(() => {
        isSyncing = true;
        try {
            const charts = [ownerSlot.chart, ...ownerSlot.secondaryCharts.map(sc => sc.chart)];
            charts.forEach(c => {
                if (c && c !== sourceChart) {
                    c.timeScale().setVisibleLogicalRange(range);
                }
            });
        } finally {
            isSyncing = false;
        }
    });
};
window.syncChartsListener = syncChartsListener;

function updateVariation() {
    if (!activePriceData || activePriceData.length === 0) return;

    let startPrice, endPrice;
    
    // Try to get visible range if chart is ready
    if (mainChart && priceSeries) {
        const range = mainChart.timeScale().getVisibleLogicalRange();
        if (range) {
            const data = priceSeries.data ? priceSeries.data() : activePriceData;
            // Map logical range to data indices
            // Logical index 0 is the first data point
            const firstIdx = Math.max(0, Math.floor(range.from));
            const lastIdx = Math.min(activePriceData.length - 1, Math.floor(range.to));

            if (lastIdx > firstIdx) {
                startPrice = activePriceData[firstIdx].close;
                endPrice = activePriceData[lastIdx].close;
            }
        }
    }

    // Fallback or override if logic above failed
    if (startPrice === undefined || endPrice === undefined) {
        const visibleBarsInput = document.getElementById('visible-bars-input');
        const P = visibleBarsInput ? parseInt(visibleBarsInput.value) : 120;

        if (activePriceData.length <= P) {
            document.getElementById('chart-title-variation').textContent = '';
            return;
        }

        const lastBar = activePriceData[activePriceData.length - 1];
        const prevBar = activePriceData[activePriceData.length - 1 - P];
        if (lastBar && prevBar) {
            startPrice = prevBar.close;
            endPrice = lastBar.close;
        }
    }

    if (startPrice !== undefined && endPrice !== undefined) {
        const variation = ((endPrice - startPrice) / startPrice) * 100;
        const color = variation >= 0 ? '#2ea043' : '#da3633';
        const sign = variation >= 0 ? '+' : '';

        const varElement = document.getElementById('chart-title-variation');
        if (varElement) {
            varElement.textContent = `${sign}${variation.toFixed(2)}%`;
            varElement.style.color = color;
        }
    }
}

// 2. Crosshair Sync & Legend Update
const syncCrosshairListener = (sourceChart, param) => {
    if (isSyncingCrosshair) return;

    // Find the slot owning sourceChart
    let ownerSlot = null;
    for (const slot of chartSlots) {
        if (slot.chart === sourceChart || slot.secondaryCharts.some(sc => sc.chart === sourceChart)) {
            ownerSlot = slot;
            break;
        }
    }
    if (!ownerSlot) ownerSlot = chartSlots[activeChartIndex];

    cancelAnimationFrame(syncCrosshairAnimationFrame);
    syncCrosshairAnimationFrame = requestAnimationFrame(() => {
        isSyncingCrosshair = true;
        try {
            const time = param.time;
            const allCharts = [{ chart: ownerSlot.chart, series: [ownerSlot.priceSeries], legend: ownerSlot.legend, isMain: true }, ...ownerSlot.secondaryCharts];

            allCharts.forEach(item => {
                const chart = item.chart;
                if (!chart) return;

                // Sync Position
                if (chart !== sourceChart) {
                    if (!time) {
                        if (typeof chart.clearCrosshairPosition === 'function') {
                            chart.clearCrosshairPosition();
                        }
                    } else {
                        let targetSeries = item.isMain ? ownerSlot.priceSeries : (item.series && item.series.length > 0 ? (item.series.length > 1 ? item.series[1] : item.series[0]) : null);
                        if (targetSeries) {
                            let yPrice = 0;
                            const tk = timeToStr(time);
                            const dm = ownerSlot.seriesDataMap.get(targetSeries);
                            if (tk && dm) {
                                const pt = dm.get(tk);
                                if (pt) {
                                    yPrice = pt.value !== undefined ? pt.value : (pt.close !== undefined ? pt.close : 0);
                                }
                            }
                            try { chart.setCrosshairPosition(yPrice, time, targetSeries); } catch (e) { }
                        }
                    }
                }

                // Update Legend
                const legend = item.legend;
                if (!legend) return;
                if (!time) { legend.style.display = 'none'; return; }
                legend.style.display = 'block';

                if (item.isMain) {
                    const tk = timeToStr(time);
                    const dataMap = ownerSlot.seriesDataMap.get(ownerSlot.priceSeries);
                    const data = tk && dataMap ? dataMap.get(tk) : null;
                    if (data) {
                        const o = data.open || data.value;
                        const h = data.high || data.value;
                        const l = data.low || data.value;
                        const c = data.close || data.value;
                        const v = data.volume || 0;

                        let roc1Str = "";
                        const idx = ownerSlot.activePriceData.findIndex(d => d.time === tk);
                        if (idx > 0) {
                            const prevClose = ownerSlot.activePriceData[idx - 1].close;
                            const roc1 = ((c / prevClose) - 1) * 100;
                            const color = roc1 >= 0 ? '#2ea043' : '#da3633';
                            const sign = roc1 >= 0 ? '+' : '';
                            roc1Str = ` &nbsp;ROC(1): <span style="color:${color}">${sign}${roc1.toFixed(2)}%</span>`;
                        }

                        let html = `<span style="color:var(--accent-color); font-weight:bold; margin-right:10px">${tk}</span> ` +
                            `O: <span style="color:${c >= o ? '#c9d1d9' : '#da3633'}">${o.toFixed(2)}</span> ` +
                            `H: <span style="color:#2ea043">${h.toFixed(2)}</span> ` +
                            `L: <span style="color:#da3633">${l.toFixed(2)}</span> ` +
                            `C: <span style="color:${c >= o ? '#2ea043' : '#da3633'}">${c.toFixed(2)}</span> ` +
                            `V: <span style="color:var(--accent-color)">${v.toLocaleString()}</span>` +
                            roc1Str;

                        ownerSlot.activeIndicators.filter(ind => ind.paneIndex === 0 && ind.seriesList && ind.seriesList.length > 0 && ind.showLegend !== false)
                            .forEach(ind => {
                                ind.seriesList.forEach(s => {
                                    const indMap = ownerSlot.seriesDataMap.get(s);
                                    const indData = tk && indMap ? indMap.get(tk) : null;
                                    if (indData && indData.value !== undefined && indData.value !== null) {
                                        const color = ind.color || getRandomColor(ind.type);
                                        const titleStr = s.title || ind.type.toUpperCase();
                                        html += ` &nbsp;<span style="color:${color}">${titleStr}: ${indData.value.toFixed(2)}</span>`;
                                    }
                                });
                            });
                        legend.innerHTML = html;
                    } else { legend.style.display = 'none'; }
                } else if (item.series && item.series.length > 0) {
                    const tk = timeToStr(time);
                    let legendText = `<span style="color:var(--accent-color); font-weight:bold; margin-right:10px">${tk}</span>` +
                        `<span style="color:var(--accent-color); font-weight:bold">${item.type.toUpperCase()}</span>: `;
                    let hasValue = false;
                    item.series.forEach(s => {
                        const ind = ownerSlot.activeIndicators.find(ai => ai.seriesList && ai.seriesList.includes(s));
                        if (ind && ind.showLegend === false) return;

                        const dataMap = ownerSlot.seriesDataMap.get(s);
                        const sData = tk && dataMap ? dataMap.get(tk) : null;
                        if (sData) {
                            const val = sData.value !== undefined ? sData.value : sData.close;
                            const color = s.options ? s.options().color : 'var(--text-color)';
                            legendText += `<span style="margin-right:15px; color:${color}">${s.title || ''}: ${val.toFixed(2)}</span>`;
                            hasValue = true;
                        }
                    });
                    legend.innerHTML = hasValue ? legendText : '';
                    if (!hasValue) legend.style.display = 'none';
                }
            });
        } finally {
            isSyncingCrosshair = false;
        }
    });
};
window.syncCrosshairListener = syncCrosshairListener;

// Converts any LWC time value to a plain "YYYY-MM-DD" string for use as Map key.
function timeToStr(t) {
    if (!t && t !== 0) return null;
    if (typeof t === 'string') return t;
    if (typeof t === 'number') return new Date(t * 1000).toISOString().split('T')[0];
    if (typeof t === 'object' && t.year !== undefined) {
        const m = String(t.month).padStart(2, '0');
        const d = String(t.day).padStart(2, '0');
        return `${t.year}-${m}-${d}`;
    }
    return String(t);
}

function setSeriesData(series, data) {
    const dataMap = new Map();
    // Store with string key BEFORE setData (in case LWC mutates d.time in-place)
    data.forEach(d => {
        const key = timeToStr(d.time);
        if (key) dataMap.set(key, d);
    });
    seriesDataMap.set(series, dataMap);
    series.setData(data);
}
// --- Template Management ---

async function loadTemplates() {
    try {
        const templates = await apiCall('/templates/');
        const select = document.getElementById('template-select');
        if (!select) return;
        select.innerHTML = '<option value="">Carica Template...</option>';
        templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load templates:", err);
    }
}

async function saveTemplate() {
    if (!loadedTemplateId) {
        return saveAsTemplate();
    }

    const name = prompt("Conferma o modifica il nome del template:", loadedTemplateName);
    if (!name) return;

    if (activeIndicators.length === 0) {
        alert("Aggiungi almeno un indicatore prima di salvare il template.");
        return;
    }

    const templateData = {
        name: name,
        indicators: activeIndicators.map(i => ({
            indicator_type: i.type,
            parameters: JSON.stringify({
                ...i.params,
                _color: i.color,
                _lineStyle: i.lineStyle,
                _lineWidth: i.lineWidth,
                _priceLine: i.priceLineVisible !== false,
                _lastValue: i.lastValueVisible !== false,
                _showLegend: i.showLegend !== false,
                _hidden: i.hidden === true
            }),
            pane_index: i.paneIndex,
            color: i.color || getRandomColor(i.type)
        }))
    };

    try {
        await apiCall(`/templates/${loadedTemplateId}`, 'PUT', templateData);
        loadedTemplateName = name;
        alert("Template aggiornato con successo!");
        loadTemplates();
    } catch (err) {
        alert("Errore nell'aggiornamento: " + err.message);
    }
}

async function saveAsTemplate() {
    const name = prompt("Inserisci il nome del nuovo template:");
    if (!name) return;

    if (activeIndicators.length === 0) {
        alert("Aggiungi almeno un indicatore prima di salvare il template.");
        return;
    }

    const templateData = {
        name: name,
        indicators: activeIndicators.map(i => ({
            indicator_type: i.type,
            parameters: JSON.stringify({
                ...i.params,
                _color: i.color,
                _lineStyle: i.lineStyle,
                _lineWidth: i.lineWidth,
                _priceLine: i.priceLineVisible !== false,
                _lastValue: i.lastValueVisible !== false,
                _showLegend: i.showLegend !== false,
                _hidden: i.hidden === true
            }),
            pane_index: i.paneIndex,
            color: i.color || getRandomColor(i.type)
        }))
    };

    try {
        const result = await apiCall('/templates/', 'POST', templateData);
        loadedTemplateId = result.id;
        loadedTemplateName = result.name;
        document.getElementById('template-select').value = result.id;
        alert("Nuovo template salvato con successo!");
        loadTemplates();
    } catch (err) {
        alert("Errore nel salvataggio: " + err.message);
    }
}

async function deleteTemplate() {
    const id = document.getElementById('template-select').value;
    if (!id) {
        alert("Seleziona un template da eliminare.");
        return;
    }

    if (!confirm("Sei sicuro di voler eliminare questo template?")) return;

    try {
        await apiCall(`/templates/${id}`, 'DELETE');
        if (loadedTemplateId == id) {
            loadedTemplateId = null;
            loadedTemplateName = null;
        }
        loadTemplates();
        alert("Template eliminato.");
    } catch (err) {
        alert("Errore nell'eliminazione: " + err.message);
    }
}

async function applyTemplate(id) {
    if (!id) return;
    try {
        const templates = await apiCall('/templates/');
        const template = templates.find(t => t.id == id);
        if (!template) return;

        // Clear existing
        clearAllIndicators();
        activeIndicators = [];

        // Restore from template
        template.indicators.forEach(ind => {
            const rawParams = JSON.parse(ind.parameters);
            const color = rawParams._color || ind.color || getRandomColor(ind.indicator_type);
            const lineStyle = rawParams._lineStyle !== undefined ? rawParams._lineStyle : 0;
            const lineWidth = rawParams._lineWidth !== undefined ? rawParams._lineWidth : 1.5;
            const priceLineVisible = rawParams._priceLine !== undefined ? rawParams._priceLine : true;
            const lastValueVisible = rawParams._lastValue !== undefined ? rawParams._lastValue : true;
            const showLegend = rawParams._showLegend !== undefined ? rawParams._showLegend : true;
            const hidden = rawParams._hidden === true;

            // Remove visual meta-keys from params
            const { _color, _lineStyle, _lineWidth, _priceLine, _lastValue, _showLegend, _hidden, ...cleanParams } = rawParams;
            activeIndicators.push({
                id: `${ind.indicator_type}_${Date.now()}_${Math.random()}`,
                type: ind.indicator_type,
                params: cleanParams,
                paneIndex: ind.pane_index,
                color, lineStyle, lineWidth,
                priceLineVisible, lastValueVisible, showLegend, hidden,
                seriesList: []
            });
        });

        loadedTemplateId = template.id;
        loadedTemplateName = template.name;

        renderActiveIndicatorsUI();
        if (activeTicker) updateChart(activeTicker);
    } catch (err) {
        console.error("Failed to apply template:", err);
    }
}

function resetChart() {
    clearAllIndicators();
    activeIndicators = [];
    loadedTemplateId = null;
    loadedTemplateName = null;

    // Reset select
    const select = document.getElementById('template-select');
    if (select) select.value = '';

    renderActiveIndicatorsUI();
    if (activeTicker) updateChart(activeTicker);
}

// Chart Sync logic

function initChart() {
    console.log("Initializing multi-chart system...");
    if (typeof LightweightCharts === 'undefined') {
        console.error("LightweightCharts library not found!");
        return;
    }

    initChartSlots();

    for (let i = 0; i < NUM_CHART_SLOTS; i++) {
        const container = document.querySelector(`.chart-container-inner[data-slot="${i}"]`);
        if (!container) continue;

        const slot = chartSlots[i];
        slot.container = container;

        const height = 200;
        container.style.height = `${height}px`;

        const chart = createBaseChart(container, height);
        normalizeChart(chart);
        slot.chart = chart;

        const legend = document.createElement('div');
        legend.className = 'chart-legend';
        container.appendChild(legend);
        slot.legend = legend;

        slot.priceSeries = chart.addCandlestickSeries({
            upColor: '#2ea043', downColor: '#da3633',
            borderDownColor: '#da3633', borderUpColor: '#2ea043',
            wickDownColor: '#da3633', wickUpColor: '#2ea043',
        });

        chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
            syncChartsListener(chart);
            if (i === activeChartIndex) requestAnimationFrame(redrawAllDrawings);
        });

        chart.subscribeCrosshairMove(param => {
            syncCrosshairListener(chart, param);
            if (i === activeChartIndex) requestAnimationFrame(redrawAllDrawings);
        });

        chart.subscribeClick(async param => {
            if (!param || !param.time) return;
            const dateStr = timeToStr(param.time);
            const ticker = chartSlots[i].ticker;
            if (ticker) {
                await loadHistoricalFundamentals(ticker, dateStr);
            }
        });

        setTimeout(() => {
            if (slot.priceSeries) {
                try {
                    const ps = slot.priceSeries.priceScale && slot.priceSeries.priceScale();
                    if (ps && typeof ps.subscribeVisiblePriceRangeChange === 'function') {
                        ps.subscribeVisiblePriceRangeChange(() => {
                            if (i === activeChartIndex) requestAnimationFrame(redrawAllDrawings);
                        });
                    }
                } catch (e) { /* priceScale not available in this LWC version */ }
            }
        }, 500);

        const redrawValue = () => {
            if (i === activeChartIndex) requestAnimationFrame(redrawAllDrawings);
        };
        container.addEventListener('wheel', redrawValue, { passive: true });
        container.addEventListener('pointermove', redrawValue, { passive: true });
        container.addEventListener('pointerdown', redrawValue, { passive: true });
        container.addEventListener('pointerup', redrawValue, { passive: true });

        const canvasEl = container.parentElement.querySelector('.drawing-layer');
        if (canvasEl) {
            slot.canvas = canvasEl;
            slot.ctx = canvasEl.getContext('2d');
        }

        const slotHeader = document.querySelector(`.chart-slot-header[data-slot="${i}"]`);
        if (slotHeader) {
            slotHeader.addEventListener('click', () => activateChartSlot(i));
        }
    }

    activateChartSlot(0);
    setChartCount(1);

    document.querySelectorAll('.chart-slot-ticker').forEach(select => {
        select.addEventListener('change', async (e) => {
            const slotIndex = parseInt(e.target.dataset.slot);
            const symbol = e.target.value;
            if (!symbol) return;
            // Activate the target slot so settings applied next (chart type, indicators,
            // templates, etc.) act on the chart the user just modified.
            activateChartSlot(slotIndex);
            activeTicker = symbol;
            activeTickerName = null;
            // Persist the ticker onto the targeted slot BEFORE updateChart, so the slot
            // is never observed as empty by anyone reading chartSlots[slotIndex].ticker.
            if (chartSlots[slotIndex]) {
                chartSlots[slotIndex].ticker = symbol;
                chartSlots[slotIndex].tickerName = null;
            }
            await updateChart(symbol);
            const nameSpan = document.querySelector(`.chart-slot-name[data-slot="${slotIndex}"]`);
            if (nameSpan) nameSpan.textContent = activeTickerName || '';
            saveActiveSlotState();
        });
    });

    // Clicking anywhere on a chart-slot activates it, so the user can select a chart
    // by clicking its body (not just the thin header).
    for (let i = 0; i < NUM_CHART_SLOTS; i++) {
        const slotEl = document.querySelector(`.chart-slot[data-slot="${i}"]`);
        if (slotEl) {
            slotEl.addEventListener('click', (e) => {
                // Skip clicks on the header and on the ticker select; those already
                // have their own handlers and a header click triggers activateChartSlot.
                if (e.target.closest('.chart-slot-header')) return;
                activateChartSlot(i);
            });
        }
    }

    // Force layout and resize charts before loading any data
    resizeAllCharts();
    loadTemplates();

    // Wait for layout to settle, then load chart data
    requestAnimationFrame(() => {
        if (activeTicker) {
            const slotSelect = document.querySelector(`.chart-slot-ticker[data-slot="${activeChartIndex}"]`);
            if (slotSelect) slotSelect.value = activeTicker;
            const nameSpan = document.querySelector(`.chart-slot-name[data-slot="${activeChartIndex}"]`);
            if (nameSpan) nameSpan.textContent = activeTickerName || '';
            updateChart(activeTicker).then(() => {
                setTimeout(autoPopulateEmptySlots, 100);
            });
        } else {
            setTimeout(autoPopulateEmptySlots, 100);
        }
    });
}


// 3. Global Listeners
window.addEventListener('resize', () => { resizeAllCharts(); });



function createBaseChart(container, height) {
    const chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: height,
        layout: {
            background: { type: LightweightCharts.ColorType.Solid, color: '#161b22' },
            textColor: '#c9d1d9',
        },
        grid: { vertLines: { color: '#30363d' }, horzLines: { color: '#30363d' } },
        crosshair: { mode: 0 }, // 0 = Normal (Magnet=1)

        rightPriceScale: {
            borderColor: '#30363d',
            scaleMargins: { top: 0.1, bottom: 0.1 },
            width: 100,
        },
        handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
        },
        handleScale: {
            axisPressedMouseMove: true,
            axisDoubleClickReset: true,
            mouseWheel: true,
            pinch: true,
            shiftPressedMouseMove: false,
        },
        leftPriceScale: {
            visible: false,
        },
        timeScale: {
            borderColor: '#30363d',
            timeVisible: true,
            visible: true,
            shiftVisibleRangeOnNewBar: false,
        },
        kineticScrolling: {
            touch: true,
            mouse: false,
        }
    });
    return chart;
}

// --- API Calls ---
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = { method, headers: {} };
    if (body && !(body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
        options.body = body;
    }

    const response = await fetch(endpoint, options);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        let msg = errorData.detail || `API error ${response.status}`;
        if (typeof msg === 'object') msg = JSON.stringify(msg);
        throw new Error(msg);
    }

    // Some endpoints might return simple messages or nothing
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return response.json();
    } else {
        return response.text();
    }
}

// --- UI Actions ---
async function loadLists() {
    console.log("[loadLists] Starting...");
    try {
        const lists = await apiCall(`/lists/?t=${Date.now()}`);
        console.log("[loadLists] Lists received:", lists);
        const select = document.getElementById('active-list-select');
        const listSelect = document.getElementById('list-select'); // Maintenance list

        const populate = (s) => {
            if (!s) return;
            console.log("[loadLists] Populating select with", lists.length, "lists");
            s.innerHTML = '<option value="">Select a list...</option>';

            // Add "All" option
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'All (Tutte le liste)';
            s.appendChild(allOption);

            // Sort alphabetical
            const sortedLists = [...lists].sort((a, b) => a.name.localeCompare(b.name));

            sortedLists.forEach(list => {
                const option = document.createElement('option');
                option.value = list.id;
                option.textContent = list.name;
                s.appendChild(option);
            });
            if (activeListId) s.value = activeListId;
        };

        populate(select);
        populate(listSelect);
        console.log("[loadLists] Population complete.");

        // Auto-select if there's only one list or if activeListId is null but lists exist
        if (!activeListId && lists.length > 0) {
            activeListId = lists[0].id;
            console.log("[loadLists] Auto-selected first list:", activeListId);
        }

        if (activeListId) {
            console.log("[loadLists] Setting select value to:", activeListId);
            select.value = activeListId;
            loadListDetails(activeListId);
        }
    } catch (err) {
        console.error("[loadLists] ERROR:", err);
    }
}

async function loadIndices() {
    console.log("Loading indices...");
    try {
        const indices = await apiCall('/indices/');
        console.log("Indices received:", indices);
        const select = document.getElementById('index-import-select');
        if (!select) {
            console.error("Select element 'index-import-select' not found!");
            return;
        }
        select.innerHTML = '<option value="">Select index...</option>';
        if (Array.isArray(indices)) {
            indices.forEach(idx => {
                const option = document.createElement('option');
                option.value = idx;
                option.textContent = idx;
                select.appendChild(option);
            });
        } else {
            console.error("Indices data is not an array:", indices);
        }
    } catch (err) {
        console.error("Error loading indices:", err);
    }
}

async function loadListDetails(listId, forceFirstTicker = false) {
    console.log(`[loadListDetails] Loading details for listId: ${listId}`);
    const lists = await apiCall(`/lists/?t=${Date.now()}`);
    let list;

    if (listId === 'all') {
        const allTickers = [];
        const seen = new Set();
        lists.forEach(l => {
            l.tickers.forEach(t => {
                if (!seen.has(t.symbol)) {
                    seen.add(t.symbol);
                    allTickers.push(t);
                }
            });
        });
        list = {
            id: 'all',
            name: 'All (Tutte le liste)',
            tickers: allTickers
        };
    } else {
        list = lists.find(l => l.id == listId);
    }

    if (!list) {
        console.warn(`[loadListDetails] List not found for ID: ${listId}`);
        return;
    }

    console.log(`[loadListDetails] List found: ${list.name}, Tickers: ${list.tickers.length}`);

    // Svuota i risultati dello screening precedente al cambio lista
    lastScreeningResults = [];
    const rocBody = document.getElementById('screening-roc-body');
    if (rocBody) rocBody.innerHTML = '';
    const rocCount = document.getElementById('roc-row-count');
    if (rocCount) rocCount.textContent = '';
    
    const baseBody = document.getElementById('screening-base-body');
    if (baseBody) baseBody.innerHTML = '';
    const baseCount = document.getElementById('base-row-count');
    if (baseCount) baseCount.textContent = '';

    // Sort tickers alphabetically by symbol
    list.tickers.sort((a, b) => a.symbol.localeCompare(b.symbol));

    // Update per-slot ticker selects
    document.querySelectorAll('.chart-slot-ticker').forEach((select, idx) => {
        const currentVal = select.value;
        const slotIdx = parseInt(select.dataset.slot);
        select.innerHTML = '<option value="">Seleziona...</option>';
        list.tickers.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.symbol;
            opt.textContent = t.symbol;
            select.appendChild(opt);
        });
        if (currentVal && list.tickers.some(t => t.symbol === currentVal)) {
            select.value = currentVal;
        } else {
            // If the previously held ticker is not in the new list, clear stale slot state
            // so autoPopulateEmptySlots can refill this slot with a valid ticker.
            if (chartSlots[slotIdx] && chartSlots[slotIdx].ticker && !list.tickers.some(t => t.symbol === chartSlots[slotIdx].ticker)) {
                chartSlots[slotIdx].ticker = '';
                chartSlots[slotIdx].tickerName = '';
                if (chartSlots[slotIdx].priceSeries) {
                    try { chartSlots[slotIdx].priceSeries.setData([]); } catch (e) { }
                }
            }
        }
    });

    // Auto-select the first ticker if none is active OR if forced (on list change in chart view)
    if ((forceFirstTicker || !activeTicker) && list.tickers.length > 0) {
        activeTicker = list.tickers[0].symbol;
        activeTickerName = list.tickers[0].name;
        // Sync the active slot's select element to reflect the auto-selected ticker
        const slotSelect = document.querySelector(`.chart-slot-ticker[data-slot="${activeChartIndex}"]`);
        if (slotSelect) slotSelect.value = activeTicker;
        const nameSpan = document.querySelector(`.chart-slot-name[data-slot="${activeChartIndex}"]`);
        if (nameSpan) nameSpan.textContent = activeTickerName || '';
        // Defer until charts are initialized (initChart runs after loadLists in the boot flow)
        const runUpdate = () => {
            if (!mainChart || chartSlots.length === 0) {
                setTimeout(runUpdate, 50);
                return;
            }
            updateChart(activeTicker).then(() => {
                // Fill remaining empty slots with tickers from the new list
                autoPopulateEmptySlots();
            });
        };
        runUpdate();
    } else if (activeTicker) {
        // Even if we don't auto-select, refresh the active chart in case the list changed
        const slotSelect = document.querySelector(`.chart-slot-ticker[data-slot="${activeChartIndex}"]`);
        if (slotSelect) slotSelect.value = activeTicker;
        // If the new list contains the active ticker, re-fill empty slots
        const runPopulate = () => {
            if (!mainChart || chartSlots.length === 0) {
                setTimeout(runPopulate, 50);
                return;
            }
            autoPopulateEmptySlots();
        };
        runPopulate();
    }

    // Update Ticker List in Management
    const container = document.getElementById('current-list-tickers');
    container.innerHTML = `<h4>Tickers in this list (${list.tickers.length}):</h4>`;
    list.tickers.forEach(t => {
        const tag = document.createElement('div');
        tag.className = 'ticker-tag';
        const displayName = t.name ? `${t.symbol} - ${t.name}` : t.symbol;
        tag.innerHTML = `${displayName} <span style="cursor:pointer; margin-left:5px" onclick="removeTicker('${t.symbol}')">×</span>`;
        container.appendChild(tag);
    });

    // Disable modification buttons if "All" is selected
    const isAll = (listId === 'all');
    const addTickerBtn = document.getElementById('add-ticker-btn');
    const importIndexBtn = document.getElementById('import-index-btn');
    const uploadCsvBtn = document.getElementById('upload-csv-btn');
    const deleteListBtn = document.getElementById('delete-list-btn');
    const clearListBtn = document.getElementById('clear-list-btn');

    if (addTickerBtn) addTickerBtn.disabled = isAll;
    if (importIndexBtn) importIndexBtn.disabled = isAll;
    if (uploadCsvBtn) uploadCsvBtn.disabled = isAll;
    if (deleteListBtn) deleteListBtn.disabled = isAll;

    // Update Clear Button label and disabling
    const clearBtn = document.getElementById('clear-list-btn');
    if (clearBtn) {
        clearBtn.textContent = isAll ? "Cannot Clear 'All' View" : `Clear All Tickers from "${list.name}"`;
        clearBtn.dataset.listName = list.name;
        clearBtn.disabled = isAll;
    }

    // Populate Historical Ticker Select
    const histSelect = document.getElementById('historical-ticker-select');
    if (histSelect) {
        histSelect.innerHTML = '<option value="">Select ticker...</option>';
        list.tickers.forEach(t => {
            const option = document.createElement('option');
            option.value = t.symbol;
            option.textContent = t.symbol;
            histSelect.appendChild(option);
        });
    }
}

async function removeTicker(symbol) {
    if (!activeListId || activeListId === 'all') return;
    await apiCall(`/lists/${activeListId}/tickers/${symbol}`, 'DELETE');
    loadLists();
}

function resampleData(dailyData, timeframe) {
    if (timeframe === 'D' || !dailyData || dailyData.length === 0) return dailyData;

    const aggregated = [];
    let currentGroup = null;
    let groupKey = '';

    dailyData.forEach(d => {
        const date = new Date(d.time);
        let key = '';

        if (timeframe === 'W') {
            // Group by Monday of that week
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(new Date(date).setDate(diff));
            key = monday.toISOString().split('T')[0];
        } else if (timeframe === 'M') {
            // Group by 1st of the month
            const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
            key = firstOfMonth.toISOString().split('T')[0];
        }

        if (key !== groupKey) {
            if (currentGroup) aggregated.push(currentGroup);
            groupKey = key;
            currentGroup = {
                time: key, // Use the start-of-period as the bin label
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
                adj_close: d.adj_close,
                volume: d.volume || 0
            };
        } else {
            currentGroup.high = Math.max(currentGroup.high, d.high);
            currentGroup.low = Math.min(currentGroup.low, d.low);
            currentGroup.close = d.close;
            currentGroup.adj_close = d.adj_close;
            currentGroup.volume = (currentGroup.volume || 0) + (d.volume || 0);
        }
    });

    if (currentGroup) aggregated.push(currentGroup);
    return aggregated;
}

document.getElementById('timeframe-select').addEventListener('change', () => {
    if (activeTicker) updateChart(activeTicker);
});

document.getElementById('chart-type-select').addEventListener('change', () => {
    if (activeTicker) updateChart(activeTicker);
});

document.getElementById('price-type-select').addEventListener('change', () => {
    if (activeTicker) updateChart(activeTicker);
});

document.getElementById('scale-type-select').addEventListener('change', () => {
    if (activeTicker) updateChart(activeTicker);
});

async function updateChart(symbol) {
    if (!symbol) return;
    if (!mainChart || chartSlots.length === 0) return;

    // Load drawings for this ticker
    await loadDrawings(symbol);

    // Find name from currently loaded lists if possible
    if (!activeTickerName) {
        const lists = await apiCall('/lists/');
        for (const l of lists) {
            const t = l.tickers.find(tk => tk.symbol === symbol);
            if (t) {
                activeTickerName = t.name;
                break;
            }
        }
    }

    const titleMain = document.getElementById('chart-title-main');
    if (titleMain) {
        titleMain.textContent = activeTickerName ? `${symbol} - ${activeTickerName}` : symbol;
    }

    console.log(`Updating chart for: ${symbol}`);

    try {
        const data = await apiCall(`/tickers/${symbol}/data/`);
        if (!data || data.length === 0) {
            handleNoData(symbol);
            return;
        }

        const chartType = document.getElementById('chart-type-select')?.value || 'candle';
        const priceField = document.getElementById('price-type-select')?.value || 'close';
        const scaleMode = parseInt(document.getElementById('scale-type-select')?.value || '0');

        mainChart.applyOptions({ rightPriceScale: { mode: scaleMode } });

        const slot = chartSlots[activeChartIndex];
        if (!slot) return;

        if (slot.currentSeriesType !== chartType) {
            mainChart.removeSeries(priceSeries);
            if (chartType === 'candle') {
                priceSeries = mainChart.addCandlestickSeries({
                    upColor: '#2ea043', downColor: '#da3633',
                    borderDownColor: '#da3633', borderUpColor: '#2ea043',
                    wickDownColor: '#da3633', wickUpColor: '#2ea043',
                });
            } else {
                priceSeries = mainChart.addLineSeries({ color: '#2196f3', lineWidth: 2 });
            }
            slot.currentSeriesType = chartType;
        }

        const rawFormatted = data.map(d => ({
            time: d.date.split('T')[0],
            open: parseFloat(d.open),
            high: parseFloat(d.high),
            low: parseFloat(d.low),
            close: parseFloat(d.close),
            adj_close: parseFloat(d.adj_close),
            volume: parseInt(d.volume) || 0
        })).filter(d => !isNaN(d.open) && !isNaN(d.close));

        rawFormatted.sort((a, b) => a.time.localeCompare(b.time));
        const uniqueDaily = deduplicateData(rawFormatted);
        const timeframe = document.getElementById('timeframe-select')?.value || 'D';
        const resampledData = resampleData(uniqueDaily, timeframe);

        let finalPriceData;
        if (chartType === 'line') {
            finalPriceData = resampledData.map(d => ({
                time: d.time,
                value: priceField === 'adj_close' ? (d.adj_close || d.close) : d.close
            }));
        } else {
            finalPriceData = resampledData;
        }

        activePriceData = resampledData;
        setSeriesData(priceSeries, finalPriceData);

        // Fetch and Render Indicators
        await applyIndicators(symbol);

        updateVariation();

        // Load Fundamental Data
        loadFundamentalData(symbol);

        // Render Transaction Markers
        await renderTransactionMarkers(symbol);

        // Zoom logic: Show the last N bars based on the input field
        const visibleBarsInput = document.getElementById('visible-bars-input');
        const numBars = visibleBarsInput ? parseInt(visibleBarsInput.value) : 120;

        const rightMarginInput = document.getElementById('right-margin-input');
        const marginPercent = rightMarginInput ? parseInt(rightMarginInput.value) : 5;
        const rightOffsetBars = Math.round(numBars * marginPercent / 100);

        // Apply right margin so the last candle is not glued to the right edge
        mainChart.timeScale().applyOptions({ rightOffset: rightOffsetBars });

        // Apply zoom using Logical Range to accurately render the right margin
        const lastIndex = finalPriceData.length - 1;
        if (finalPriceData.length > numBars) {
            mainChart.timeScale().setVisibleLogicalRange({
                from: lastIndex - numBars,
                to: lastIndex + rightOffsetBars
            });
        } else {
            mainChart.timeScale().setVisibleLogicalRange({
                from: 0,
                to: lastIndex + rightOffsetBars
            });
        }
        saveActiveSlotState();
    } catch (err) {
        console.error(`Error updating chart for ${symbol}:`, err);
    }
}

async function renderTransactionMarkers(symbol) {
    if (!priceSeries) return;
    try {
        const response = await fetch(`/transactions/ticker/${symbol}`);
        if (!response.ok) {
            priceSeries.setMarkers([]);
            return;
        }
        const transactions = await response.json();
        
        // Exclude DEPOSIT and WITHDRAWAL since they aren't stock transactions
        const tradeTrans = transactions.filter(t => ['BUY', 'SELL', 'SHORT', 'COVER'].includes(t.type));
        if (tradeTrans.length === 0) {
            priceSeries.setMarkers([]);
            return;
        }

        const timeframe = document.getElementById('timeframe-select')?.value || 'D';
        const grouped = {};
        
        tradeTrans.forEach(t => {
            let timeKey = t.date.split('T')[0];
            if (timeframe === 'W') {
                const date = new Date(t.date);
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(new Date(date).setDate(diff));
                timeKey = monday.toISOString().split('T')[0];
            } else if (timeframe === 'M') {
                const date = new Date(t.date);
                const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
                timeKey = firstOfMonth.toISOString().split('T')[0];
            }
            
            if (!grouped[timeKey]) {
                grouped[timeKey] = [];
            }
            grouped[timeKey].push(t);
        });

        const markers = [];
        Object.keys(grouped).forEach(timeKey => {
            const list = grouped[timeKey];
            if (list.length === 1) {
                const t = list[0];
                const isBuy = t.type === 'BUY' || t.type === 'COVER';
                const position = isBuy ? 'belowBar' : 'aboveBar';
                const shape = isBuy ? 'arrowUp' : 'arrowDown';
                let color = '#2ea043'; // green for BUY/COVER
                if (t.type === 'SELL') color = '#da3633'; // red for SELL
                else if (t.type === 'SHORT') color = '#ff9800'; // orange for SHORT
                else if (t.type === 'COVER') color = '#2196f3'; // blue for COVER

                const portfolioName = portfoliosMap.get(t.portfolio_id) || `P${t.portfolio_id}`;
                const text = `${t.type} ${t.quantity} @ ${t.price} (${portfolioName})`;
                
                markers.push({
                    time: timeKey,
                    position: position,
                    color: color,
                    shape: shape,
                    text: text
                });
            } else {
                const buyCount = list.filter(t => t.type === 'BUY' || t.type === 'COVER').length;
                const sellCount = list.length - buyCount;
                const position = buyCount >= sellCount ? 'belowBar' : 'aboveBar';
                const color = '#9c27b0'; // purple for multiple
                const shape = 'circle';
                
                const desc = list.map(t => {
                    const portfolioName = portfoliosMap.get(t.portfolio_id) || `P${t.portfolio_id}`;
                    return `${t.type} ${t.quantity} (${portfolioName})`;
                }).join(' | ');
                
                markers.push({
                    time: timeKey,
                    position: position,
                    color: color,
                    shape: shape,
                    text: `Trades: ${desc}`
                });
            }
        });

        // Sort markers by date ascending (Lightweight Charts requires markers to be sorted by time)
        markers.sort((a, b) => a.time.localeCompare(b.time));
        
        priceSeries.setMarkers(markers);
    } catch (err) {
        console.error("Error loading transaction markers:", err);
        priceSeries.setMarkers([]);
    }
}

async function handleNoData(symbol) {
    console.log(`No data found for ${symbol}. Triggering automatic update...`);
    const status = document.getElementById('update-status');
    if (status) status.textContent = "Auto-downloading...";
    try {
        const years = document.getElementById('extend-years')?.value || 10;
        await apiCall(`/tickers/${symbol}/update-data/?years=${years}`, 'POST');
        updateChart(symbol);
    } catch (err) {
        console.error("Auto-update failed:", err);
    }
}

function deduplicateData(data) {
    const unique = [];
    const seen = new Set();
    for (const d of data) {
        if (!seen.has(d.time)) {
            unique.push(d);
            seen.add(d.time);
        }
    }
    return unique;
}

function getListTickers() {
    const firstSlotSelect = document.querySelector('.chart-slot-ticker');
    if (!firstSlotSelect) return [];
    return Array.from(firstSlotSelect.options)
        .map(o => o.value)
        .filter(v => v);
}

// --- Indicator Management ---

// Modal state
let _modalIndId = null; // null = new indicator, string = editing existing
let _modalPendingType = null;
let _modalIsScreening = false;
let _modalScreeningColId = null;

function getDefaultParams(type) {
    switch (type) {
        case 'sma': return { length: 20 };
        case 'ema': return { length: 20 };
        case 'bbands': return { length: 20, std: 2 };
        case 'rsi': return { length: 14 };
        case 'macd': return { fast: 12, slow: 26, signal: 9 };
        case 'cci': return { length: 20 };
        case 'atr': return { length: 14 };
        case 'volume': return {};
        case 'hma': return { length: 20 };
        case 'supertrend': return { period: 7, multiplier: 3 };
        case 'donchian': return { length: 20 };
        case 'stoch': return { k: 14, d: 3, smooth_k: 3 };
        case 'roc': return { length: 12 };
        case 'bbp': return { length: 20, std: 2 };
        default: return { length: 14 };
    }
}

function buildModalParamsSection(type, params) {
    const section = document.getElementById('modal-params-section');
    section.innerHTML = '';

    const addRow = (labelText, inputHtml) => {
        const row = document.createElement('div');
        row.className = 'modal-form-row';
        row.innerHTML = `<label style="min-width: 100px;">${labelText}:</label>${inputHtml}`;
        section.appendChild(row);
    };

    if (_modalIsScreening) {
        addRow('Timeframe', `
            <select id="mp-timeframe" style="flex: 1;">
                <option value="D">Giornaliero (D)</option>
                <option value="W">Settimanale (W)</option>
                <option value="M">Mensile (M)</option>
            </select>
        `);
    }
    switch (type) {
        case 'sma':
        case 'ema':
        case 'hma':
        case 'rsi':
        case 'cci':
        case 'atr':
        case 'roc':
            addRow('Periodo', `<input type="number" id="mp-length" min="1" max="500" value="${params.length || 14}">`);
            break;
        case 'bbands':
        case 'bbp':
            addRow('Periodo', `<input type="number" id="mp-length" min="1" max="500" value="${params.length || 20}">`);
            addRow('Deviazioni Std', `<input type="number" id="mp-std" min="0.5" max="5" step="0.5" value="${params.std || 2}">`);
            break;
        case 'supertrend':
            addRow('Periodo', `<input type="number" id="mp-period" min="1" max="100" value="${params.period || 7}">`);
            addRow('Moltiplicatore', `<input type="number" id="mp-mul" min="0.1" max="10" step="0.1" value="${params.multiplier || 3}">`);
            break;
        case 'donchian':
            addRow('Periodo', `<input type="number" id="mp-length" min="1" max="500" value="${params.length || 20}">`);
            break;
        case 'stoch':
            addRow('K', `<input type="number" id="mp-k" min="1" max="100" value="${params.k || 14}">`);
            addRow('D', `<input type="number" id="mp-d" min="1" max="100" value="${params.d || 3}">`);
            addRow('Liscio', `<input type="number" id="mp-smooth" min="1" max="100" value="${params.smooth_k || 3}">`);
            break;
        case 'macd':
            addRow('Periodo Veloce', `<input type="number" id="mp-fast" min="1" max="200" value="${params.fast || 12}">`);
            addRow('Periodo Lento', `<input type="number" id="mp-slow" min="1" max="200" value="${params.slow || 26}">`);
            addRow('Segnale', `<input type="number" id="mp-signal" min="1" max="200" value="${params.signal || 9}">`);
            break;
    }
}

function readModalParams(type) {
    const p = {};
    const g = (id) => { const el = document.getElementById(id); return el ? parseFloat(el.value) : null; };
    switch (type) {
        case 'sma': case 'ema': case 'hma': case 'rsi': case 'cci': case 'atr': case 'roc': case 'donchian':
            p.length = g('mp-length') || 14; break;
        case 'bbands': case 'bbp':
            p.length = g('mp-length') || 20;
            p.std = g('mp-std') || 2; break;
        case 'supertrend':
            p.period = g('mp-period') || 7;
            p.multiplier = g('mp-mul') || 3; break;
        case 'stoch':
            p.k = g('mp-k') || 14;
            p.d = g('mp-d') || 3;
            p.smooth_k = g('mp-smooth') || 3; break;
        case 'macd':
            p.fast = g('mp-fast') || 12;
            p.slow = g('mp-slow') || 26;
            p.signal = g('mp-signal') || 9; break;
    }
    return p;
}

function openIndicatorModal(type, existingId, isScreening = false, screeningColId = null) {
    _modalIndId = existingId || null;
    _modalPendingType = type;
    _modalIsScreening = isScreening;
    _modalScreeningColId = screeningColId;

    // UI: Hide chart-specific visual controls if screening
    const visualControls = document.querySelectorAll('.modal-visual-controls');
    visualControls.forEach(el => el.style.display = isScreening ? 'none' : 'block');

    let params, color, lineStyle, lineWidth;
    if (isScreening && screeningColId) {
        // Find by col ID in the active sheet
        const sheet = screeningSheets.find(s => s.id == activeScreeningSheetId);
        const col = sheet ? sheet.columns.find(c => c.id == screeningColId) : null;
        if (!col) return;
        params = JSON.parse(col.parameters);
        color = col.color || getRandomColor(type);
        lineStyle = 0; lineWidth = 1.5;
    } else if (existingId) {
        const ind = activeIndicators.find(i => i.id === existingId);
        if (!ind) return;
        params = ind.params;
        color = ind.color || getRandomColor(type);
        lineStyle = ind.lineStyle !== undefined ? ind.lineStyle : 0;
        lineWidth = ind.lineWidth !== undefined ? ind.lineWidth : 1.5;
        document.getElementById('modal-price-line').checked = ind.priceLineVisible !== false;
        document.getElementById('modal-last-value').checked = ind.lastValueVisible !== false;
        document.getElementById('modal-show-legend').checked = ind.showLegend !== false;
    } else {
        params = getDefaultParams(type);
        color = getRandomColor(type);
        lineStyle = 0;
        lineWidth = 1.5;
        document.getElementById('modal-price-line').checked = true;
        document.getElementById('modal-last-value').checked = true;
        document.getElementById('modal-show-legend').checked = true;
    }

    // Update modal title
    document.getElementById('modal-title').textContent = `Configura ${type.toUpperCase()}`;

    // Build params section
    buildModalParamsSection(type, params);

    // Set visual controls
    document.getElementById('modal-color').value = color;
    document.querySelectorAll('input[name="modal-line-style"]').forEach(r => {
        r.checked = parseInt(r.value) === lineStyle;
    });
    const widthInput = document.getElementById('modal-line-width');
    widthInput.value = lineWidth;
    document.getElementById('modal-line-width-val').textContent = lineWidth;

    if (isScreening) {
        const tfSelect = document.getElementById('mp-timeframe');
        if (tfSelect) {
            const sheet = screeningSheets.find(s => s.id == activeScreeningSheetId);
            const col = (sheet && screeningColId) ? sheet.columns.find(c => c.id == screeningColId) : null;
            tfSelect.value = col ? col.timeframe : 'D';
        }
    }

    // Show modal
    document.getElementById('indicator-modal-overlay').classList.remove('hidden');
}

function closeIndicatorModal() {
    document.getElementById('indicator-modal-overlay').classList.add('hidden');
    // Reset select
    const sel = document.getElementById('add-indicator-select');
    if (sel) sel.value = '';
    _modalIndId = null;
    _modalPendingType = null;
    _modalIsScreening = false;
    _modalScreeningColId = null;
}

async function confirmIndicatorModal() {
    const type = _modalPendingType;
    if (!type) return;

    const params = readModalParams(type);

    if (_modalIsScreening) {
        try {
            if (_modalScreeningColId) {
                // UPDATE existing column
                await apiCall(`/screening/columns/${_modalScreeningColId}`, 'PUT', {
                    indicator_type: type,
                    parameters: JSON.stringify(params),
                    timeframe: document.getElementById('mp-timeframe')?.value || 'D'
                });
            } else {
                // ADD new column
                await apiCall(`/screening/sheets/${activeScreeningSheetId}/columns/`, 'POST', {
                    indicator_type: type,
                    parameters: JSON.stringify(params),
                    timeframe: document.getElementById('mp-timeframe')?.value || 'D'
                });
            }
            await loadScreeningSheets();
            const sheet = screeningSheets.find(s => s.id == activeScreeningSheetId);
            renderActiveColumnsUI(sheet);
            closeIndicatorModal();
        } catch (err) {
            alert("Errore nel salvataggio della colonna: " + err.message);
        }
        return;
    }

    const color = document.getElementById('modal-color').value;
    const lineStyle = parseInt(document.querySelector('input[name="modal-line-style"]:checked').value);
    const lineWidth = parseFloat(document.getElementById('modal-line-width').value);
    const priceLineVisible = document.getElementById('modal-price-line').checked;
    const lastValueVisible = document.getElementById('modal-last-value').checked;
    const showLegend = document.getElementById('modal-show-legend').checked;

    if (_modalIndId) {
        // Editing existing
        const ind = activeIndicators.find(i => i.id === _modalIndId);
        if (ind) {
            ind.params = params;
            ind.color = color;
            ind.lineStyle = lineStyle;
            ind.lineWidth = lineWidth;
            ind.priceLineVisible = priceLineVisible;
            ind.lastValueVisible = lastValueVisible;
            ind.showLegend = showLegend;
        }
    } else {
        // New indicator
        const isOverlay = ['sma', 'ema', 'hma', 'supertrend', 'donchian', 'bbands', 'volume'].includes(type);
        const paneIndex = isOverlay ? 0 : (secondaryCharts.length + 1);
        activeIndicators.push({
            id: `${type}_${Date.now()}`,
            type, params, paneIndex,
            color, lineStyle, lineWidth,
            priceLineVisible, lastValueVisible,
            showLegend,
            seriesList: []
        });
    }

    closeIndicatorModal();
    renderActiveIndicatorsUI();
    if (activeTicker) updateChart(activeTicker);
}

function addIndicator(type) {
    if (!type) return;
    openIndicatorModal(type, null);
}

function removeIndicator(id) {
    const indIndex = activeIndicators.findIndex(i => i.id === id);
    if (indIndex === -1) return;

    const ind = activeIndicators[indIndex];

    // Remove the chart series BEFORE splicing, while we can still find it
    if (ind.seriesList && ind.seriesList.length > 0) {
        const chartObj = ind.paneIndex === 0
            ? mainChart
            : secondaryCharts.find(sc => sc.paneIndex === ind.paneIndex)?.chart;
        if (chartObj) {
            ind.seriesList.forEach(s => {
                try { chartObj.removeSeries(s); } catch (e) { }
            });
        }
        ind.seriesList = [];
    }

    activeIndicators.splice(indIndex, 1);

    if (ind.paneIndex > 0) {
        const otherInPane = activeIndicators.filter(i => i.paneIndex === ind.paneIndex);
        if (otherInPane.length === 0) {
            removeSecondaryPane(ind.paneIndex);
        }
    }

    renderActiveIndicatorsUI();
    if (activeTicker) updateChart(activeTicker);
}

function toggleIndicatorVisibility(indId) {
    const ind = activeIndicators.find(i => i.id === indId);
    if (ind) {
        ind.hidden = !ind.hidden;
        renderActiveIndicatorsUI();
        if (activeTicker) updateChart(activeTicker);
    }
}

function renderActiveIndicatorsUI() {
    const container = document.getElementById('active-indicators');
    if (!container) return;
    container.innerHTML = '';
    activeIndicators.forEach(ind => {
        const tag = document.createElement('div');
        tag.className = 'indicator-tag';
        if (ind.hidden) tag.classList.add('hidden-tag');
        const bgColor = ind.color || getRandomColor(ind.type);
        tag.style.borderLeft = `4px solid ${bgColor}`;
        tag.innerHTML =
            `<span>${ind.type.toUpperCase()}(${Object.values(ind.params).join(',')})</span> ` +
            `<span class="tag-eye" title="${ind.hidden ? 'Mostra' : 'Nascondi'}" onclick="toggleIndicatorVisibility('${ind.id}')">${ind.hidden ? '👁️‍🗨️' : '👁️'}</span>` +
            `<span class="tag-edit" title="Modifica" onclick="openIndicatorModal('${ind.type}', '${ind.id}')">✎</span>` +
            `<span class="tag-remove" title="Rimuovi" onclick="removeIndicator('${ind.id}')">×</span>`;
        container.appendChild(tag);
    });
}

async function applyIndicators(symbol) {
    if (activeIndicators.length === 0) {
        // Clear all secondary charts and overlays
        clearAllIndicators();
        return;
    }

    try {
        const timeframe = document.getElementById('timeframe-select').value || 'D';
        const req = activeIndicators.map(i => ({
            indicator_type: i.type.toUpperCase(),
            parameters: i.params,
            pane_index: i.paneIndex,
            timeframe: timeframe
        }));
        console.log("Requesting indicators:", req);
        const data = await apiCall(`/indicators/${symbol}/calculate`, 'POST', req);
        console.log("Indicators data received:", data);

        // results come back as { dates: [], indicators: { key: [] } }
        renderIndicatorData(data);
    } catch (err) {
        console.error("Failed to calculate indicators:", err);
    }
}

function renderIndicatorData(data) {
    console.log("Rendering indicator data...");

    // 1. Ensure all required secondary charts (panes) exist first
    activeIndicators.forEach(ind => {
        if (ind.paneIndex > 0) {
            getOrCreatePane(ind.paneIndex, ind.type);
        }
    });

    // 2. Correctly remove OLD series from ALL charts (Main and Secondary)
    secondaryCharts.forEach(sc => {
        if (sc.series) {
            sc.series.forEach(s => { try { sc.chart.removeSeries(s); } catch (e) { } });
        }
        sc.series = [];
    });

    // Clear main chart ghosts and overlays from activeIndicators
    if (mainChart._ghosts) {
        mainChart._ghosts.forEach(s => { try { mainChart.removeSeries(s); } catch (e) { } });
        mainChart._ghosts = [];
    }

    // Pre-clear all seriesList from activeIndicators to be sure no orphans remain
    activeIndicators.forEach(ind => {
        if (ind.seriesList && ind.seriesList.length > 0) {
            const chartObj = ind.paneIndex === 0 ? mainChart : secondaryCharts.find(sc => sc.paneIndex === ind.paneIndex)?.chart;
            if (chartObj) {
                ind.seriesList.forEach(s => { try { chartObj.removeSeries(s); } catch (e) { } });
            }
            ind.seriesList = [];
        }
    });

    const dates = data.dates;
    if (!dates || dates.length === 0) {
        console.warn("No dates in indicator data!");
        return;
    }

    // 3. Add hidden "ghost" series to force the time axis to match the main chart
    // We do this for BOTH mainChart and all secondaryCharts to ensure extent alignment.
    [mainChart, ...secondaryCharts.map(sc => sc.chart)].forEach(chartObj => {
        const ghost = chartObj.addLineSeries({
            visible: false,
            priceScaleId: 'none',
            lastValueVisible: false,
            priceLineVisible: false,
        });
        ghost.setData(dates.map(d => ({ time: d, value: 0 })));

        const sc = secondaryCharts.find(c => c.chart === chartObj);
        if (sc) sc.series.push(ghost);
        else {
            if (!mainChart._ghosts) mainChart._ghosts = [];
            mainChart._ghosts.push(ghost);
        }
    });

    const indicatorKeys = Object.keys(data.indicators);
    console.log(`Available indicator keys from backend:`, indicatorKeys);

    // 4. Iterate over ACTIVE indicators to find their data in the backend response
    activeIndicators.forEach(ind => {
        if (ind.hidden) return;

        ind.seriesList = [];

        // Construct the expected key(s) for this indicator type + params
        // Backend key: "{type}_{paramKey1}{paramValue1}_{paramKey2}{paramValue2}".lower()
        const paramStr = Object.entries(ind.params)
            .map(([k, v]) => `${k}${v}`)
            .join('_')
            .toLowerCase();

        const baseKey = ind.type.toLowerCase();
        const fullKey = paramStr ? `${baseKey}_${paramStr}` : baseKey;

        // Some indicators (like BBands) return multiple keys
        const matchingKeys = indicatorKeys.filter(k => k === fullKey || k.startsWith(fullKey + "_"));

        if (matchingKeys.length === 0) {
            console.warn(`No data found for active indicator: ${fullKey}`);
            return;
        }

        const chartObj = ind.paneIndex === 0 ? mainChart : getOrCreatePane(ind.paneIndex, ind.type);
        if (!chartObj) return;

        matchingKeys.forEach(key => {
            const values = data.indicators[key];
            let seriesData = dates.map((d, idx) => ({ time: d, value: values[idx] }))
                .filter(d => d.value !== null && d.value !== undefined);

            if (seriesData.length === 0) return;

            if (ind.type === 'volume') {
                // Optimize: create a map for price data lookup
                const priceMap = new Map(activePriceData.map(p => [p.time, p]));

                // Color volume bars based on price action (Close vs Open)
                seriesData = seriesData.map(v => {
                    const pricePt = priceMap.get(v.time);
                    let color = 'rgba(38, 166, 154, 0.5)'; // Default green-ish
                    if (pricePt) {
                        const isUp = pricePt.close >= pricePt.open;
                        color = isUp ? 'rgba(46, 160, 67, 0.5)' : 'rgba(218, 54, 51, 0.5)';
                    }
                    return { ...v, color };
                });
            }

            console.log(`Plotting ${seriesData.length} points for ${key}`);

            const lwcLineStyle = ind.lineStyle !== undefined ? ind.lineStyle : 0;

            // Clean up the title for the legend
            // Build parameter string: e.g. "(10)" for SMA or "(12,26,9)" for MACD
            let paramSuffix = '';
            if (ind.params && Object.keys(ind.params).length > 0) {
                paramSuffix = `(${Object.values(ind.params).join(',')})`;
            }

            let displayTitle = key.toUpperCase();
            if (key.includes('_')) {
                const parts = key.split('_');
                const lastPart = parts[parts.length - 1];
                // If it's a multi-column indicator, try to find a nice label (BBL, BBM, BBU, etc.)
                if (['BBL', 'BBM', 'BBU', 'MACD', 'SIGNAL', 'HIST', 'STOCH', 'DCL', 'DCU', 'DCM', 'SUPERT', 'BBP'].some(s => lastPart.includes(s.toLowerCase()))) {
                    displayTitle = `${parts[0].toUpperCase()}${paramSuffix} ${lastPart.toUpperCase()}`;
                } else {
                    displayTitle = `${parts[0].toUpperCase()}${paramSuffix}`;
                }
            } else {
                displayTitle = `${displayTitle}${paramSuffix}`;
            }
            const seriesTitle = ind.showLegend !== false ? displayTitle : '';
            const newSeriesOptions = {
                color: ind.color || (ind.type === 'volume' ? 'rgba(38, 166, 154, 0.5)' : getRandomColor(ind.type)),
                lineWidth: ind.lineWidth || 1.5,
                lineStyle: lwcLineStyle,
                title: seriesTitle,
                priceLineVisible: ind.priceLineVisible !== false,
                lastValueVisible: ind.lastValueVisible !== false
            };

            if (ind.type === 'volume' && ind.paneIndex === 0) {
                // Configure Volume Histogram on LEFT axis
                newSeriesOptions.priceScaleId = 'left';
                newSeriesOptions.priceFormat = { type: 'volume' };
                chartObj.applyOptions({
                    leftPriceScale: {
                        visible: true,
                        borderColor: '#30363d',
                        autoScale: true,
                        scaleMargins: { top: 0.8, bottom: 0 },
                    }
                });
            } else if (ind.paneIndex === 0) {
                newSeriesOptions.priceScaleId = 'right';
            }

            try {
                let newSeries;
                if (ind.type === 'volume') {
                    newSeries = chartObj.addHistogramSeries(newSeriesOptions);
                } else {
                    newSeries = chartObj.addLineSeries(newSeriesOptions);
                }
                setSeriesData(newSeries, seriesData);
                newSeries.title = seriesTitle;

                if (!ind.seriesList) ind.seriesList = [];
                ind.seriesList.push(newSeries);

                if (ind.paneIndex > 0) {
                    const sc = secondaryCharts.find(c => c.paneIndex === ind.paneIndex);
                    if (sc && !sc.series.includes(newSeries)) sc.series.push(newSeries);
                }
            } catch (e) {
                console.error(`Error plotting series for ${key}:`, e);
            }
        });
    });

    // 5. Final sync trigger
    const range = mainChart.timeScale().getVisibleLogicalRange();
    if (range) {
        secondaryCharts.forEach(sc => sc.chart.timeScale().setVisibleLogicalRange(range));
    }

    // 6. Re-align drawing canvas: LWC re-lays out asynchronously after adding series,
    //    so we defer the resize so the plot canvas has settled before we re-position.
    setTimeout(() => resizeDrawingCanvas(), 150);
}

function getOrCreatePane(index, type) {
    const slot = chartSlots[activeChartIndex];
    let sc = slot.secondaryCharts.find(c => c.paneIndex === index);
    if (!sc) {
        const container = document.createElement('div');
        container.classList.add('secondary-pane');

        const height = 60;
        container.style.height = `${height}px`;
        container.id = `pane-${slot.index}-${index}`;

        const subplotsContainer = document.querySelector(`.chart-slot-subplots[data-slot="${slot.index}"]`);
        if (subplotsContainer) subplotsContainer.appendChild(container);

        const newChart = createBaseChart(container, height);
        normalizeChart(newChart);

        const legend = document.createElement('div');
        legend.className = 'chart-legend';
        container.appendChild(legend);

        newChart.timeScale().subscribeVisibleLogicalRangeChange(() => {
            if (window.syncChartsListener) window.syncChartsListener(newChart);
        });

        newChart.subscribeCrosshairMove(param => {
            if (window.syncCrosshairListener) window.syncCrosshairListener(newChart, param);
        });

        sc = { chart: newChart, container, paneIndex: index, type, legend, series: [] };
        slot.secondaryCharts.push(sc);
        updatePanesVisibility();
    }
    return sc.chart;
}

function clearAllIndicators() {
    const slot = chartSlots[activeChartIndex];
    slot.activeIndicators.forEach(ind => {
        if (ind.paneIndex === 0 && ind.seriesList && ind.seriesList.length > 0) {
            ind.seriesList.forEach(s => {
                try { slot.chart.removeSeries(s); } catch (e) { }
            });
            ind.seriesList = [];
        }
    });

    slot.secondaryCharts.forEach(sc => {
        try { sc.chart.remove(); } catch (e) { }
        try { sc.container.remove(); } catch (e) { }
    });
    slot.secondaryCharts = [];
    updatePanesVisibility();

    setTimeout(() => resizeDrawingCanvas(), 150);
}

function removeSecondaryPane(index) {
    const slot = chartSlots[activeChartIndex];
    const idx = slot.secondaryCharts.findIndex(sc => sc.paneIndex === index);
    if (idx !== -1) {
        slot.secondaryCharts[idx].chart.remove();
        slot.secondaryCharts[idx].container.remove();
        slot.secondaryCharts.splice(idx, 1);
        updatePanesVisibility();
    }
}

function updatePanesVisibility() {
    const slot = chartSlots[activeChartIndex];
    const visiblePaneIndices = new Set(
        slot.activeIndicators
            .filter(ind => !ind.hidden && ind.paneIndex > 0)
            .map(ind => ind.paneIndex)
    );

    slot.secondaryCharts.forEach(sc => {
        sc.container.style.display = visiblePaneIndices.has(sc.paneIndex) ? 'block' : 'none';
    });

    slot.chart.applyOptions({ timeScale: { visible: false } });
    slot.secondaryCharts.forEach(sc => sc.chart.applyOptions({ timeScale: { visible: false } }));

    let visibleCharts = [{ chart: slot.chart, paneIndex: 0 }];
    slot.secondaryCharts.forEach(sc => {
        if (visiblePaneIndices.has(sc.paneIndex)) {
            visibleCharts.push({ chart: sc.chart, paneIndex: sc.paneIndex });
        }
    });

    if (visibleCharts.length > 0) {
        const lastVisible = visibleCharts.reduce((prev, curr) => (prev.paneIndex > curr.paneIndex) ? prev : curr);
        lastVisible.chart.applyOptions({ timeScale: { visible: true } });
    }
}

function getRandomColor(type) {
    const colors = {
        sma: '#ff9800', ema: '#e91e63', rsi: '#9c27b0', macd: '#00bcd4',
        bbands: '#4caf50', cci: '#8bc34a', atr: '#ffeb3b',
        supertrend: '#ffc107', hma: '#03a9f4', donchian: '#607d8b',
        stoch: '#9e9e9e', roc: '#795548', bbp: '#4caf50'
    };
    return colors[type] || '#' + Math.floor(Math.random() * 16777215).toString(16);
}

// ============================
// === DRAWING TOOLS ENGINE ===
// ============================

// --- Coordinate helpers ---
function priceToY(price) {
    if (!priceSeries) return null;
    try {
        const val = (typeof price === 'string') ? parseFloat(price) : price;
        if (isNaN(val)) return null;
        return priceSeries.priceToCoordinate(val);
    } catch (e) { return null; }
}

function yToPrice(y) {
    if (!priceSeries) return null;
    try {
        return priceSeries.coordinateToPrice(y);
    } catch (e) { return null; }
}
function timeToX(time) {
    if (!mainChart) return null;
    const ts = mainChart.timeScale();
    try {
        // If it's a BusinessDay object, pass it directly
        if (time && typeof time === 'object' && time.year) {
            return ts.timeToCoordinate(time);
        }

        const numericVal = Number(time);

        // DISTINGUISH BETWEEN LOGICAL INDEX AND TIMESTAMP
        // 1. If it's literally a number and small (e.g. < 1,000,000), it's a logical index (future margin)
        // 2. If it's a large value (> 10^9), it's a timestamp (seconds since epoch)
        // 3. If it's a string like "2023-01-01", numericVal is NaN or a date-number

        if (!isNaN(numericVal)) {
            if (numericVal < 1000000) {
                return ts.logicalToCoordinate(numericVal);
            } else {
                return ts.timeToCoordinate(numericVal);
            }
        }

        // Handle YYYY-MM-DD strings
        return ts.timeToCoordinate(time);
    } catch (e) { return null; }
}
function xToTime(x) {
    if (!mainChart) return null;
    const ts = mainChart.timeScale();
    try {
        const time = ts.coordinateToTime(x);
        if (time !== null) {
            // Return BusinessDay object directly if possible, or ISO string
            if (typeof time === 'string' || typeof time === 'number') return time;
            if (time.year) return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
            return time;
        }
        // If in the future margin, return the logical index as number (small)
        const logical = ts.coordinateToLogical(x);
        return logical;
    } catch (e) { return null; }
}
function yToPrice(y) {
    if (!priceSeries) return null;
    try {
        return priceSeries.coordinateToPrice(y);
    } catch (e) { return null; }
}

// --- Canvas init ---
function initDrawingCanvas() {
    const slot = chartSlots[activeChartIndex];
    if (!slot) return;
    drawingCanvas = slot.canvas || document.querySelector('.drawing-layer');
    if (!drawingCanvas) return;
    drawingCtx = drawingCanvas.getContext('2d');
    resizeDrawingCanvas();
    setupDrawingMouseListeners();

    const container = slot.container || document.querySelector('.chart-container-inner');
    if (container && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
            resizeDrawingCanvas();
        }).observe(container);
    }

    function renderLoop() {
        if (activeTicker) {
            redrawAllDrawings();
        }
        requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
}

// Syncs the drawing canvas SIZE and POSITION to the LWC internal plot area.
// Lightweight Charts' coordinate API (timeToCoordinate, coordinateToTime, etc)
// explicitly expects coordinates relative to the main data pane (plot area), NOT the overall chart container.
// If we use container coordinates, any left-side price scale (like Volume) shifts the coordinate frame,
// causing drawn points to anchor to the wrong timestamps and drift when zooming.
// Must NOT call redrawAllDrawings() to avoid recursion.
function syncDrawingCanvasSize() {
    if (!drawingCanvas || !mainChart) return;
    const slot = chartSlots[activeChartIndex];
    const container = slot?.container || document.querySelector('.chart-container-inner');
    if (!container) return;

    // LWC creates multiple panes/canvases. The main candlestick pane is typically the widest.
    const lwcCanvases = container.querySelectorAll('canvas');
    let plotCanvas = null;
    if (lwcCanvases.length > 0) {
        // Find the main data pane canvas. We use clientWidth to avoid dpi-scaled mismatches.
        plotCanvas = Array.from(lwcCanvases).find(c => c.clientWidth > 100);
    }

    if (plotCanvas) {
        // Use getBoundingClientRect for screen-space offset reliable against DOM nesting
        const containerRect = container.getBoundingClientRect();
        const plotRect = plotCanvas.getBoundingClientRect();

        const offsetLeft = Math.round(plotRect.left - containerRect.left);
        const offsetTop = Math.round(plotRect.top - containerRect.top);

        // We must use the CSS geometry (plotRect.width/height) for BOTH the canvas's physical 
        // pixel buffer (width/height attributes) and its CSS styles.
        // DO NOT use plotCanvas.width/.height here because LWC sets them to high-resolution
        // (clientWidth * devicePixelRatio). If we mismatch buffer vs CSS size, 
        // canvas drawing coordinates will shrink and incorrectly shift to the top-left!
        const dw = Math.round(plotRect.width);
        const dh = Math.round(plotRect.height);

        if (drawingCanvas.width !== dw || drawingCanvas.height !== dh) {
            drawingCanvas.width = dw;
            drawingCanvas.height = dh;
        }

        drawingCanvas.style.left = `${offsetLeft}px`;
        drawingCanvas.style.top = `${offsetTop}px`;
        drawingCanvas.style.width = `${dw}px`;
        drawingCanvas.style.height = `${dh}px`;
    } else {
        // Fallback: cover full container
        const targetW = container.clientWidth;
        const targetH = container.clientHeight;
        if (drawingCanvas.width !== targetW || drawingCanvas.height !== targetH) {
            drawingCanvas.width = targetW;
            drawingCanvas.height = targetH;
        }
        drawingCanvas.style.left = '0px';
        drawingCanvas.style.top = '0px';
        drawingCanvas.style.width = `${targetW}px`;
        drawingCanvas.style.height = `${targetH}px`;
    }
}

function resizeDrawingCanvas() {
    syncDrawingCanvasSize();
    redrawAllDrawings();
}

// --- Toolbar wiring ---
let isDrawingToolbarInitialized = false;
function setupDrawingToolbar() {
    if (isDrawingToolbarInitialized) return;
    console.log("[script.js] setupDrawingToolbar() started");
    const btns = document.querySelectorAll('.drawing-tool-btn[data-tool]');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tool = btn.dataset.tool;
            console.log("[script.js] Toolbar button clicked! data-tool:", tool);
            setDrawingTool(tool);

            // Close dropdown if this button was inside one
            const dropdown = btn.closest('.dropdown-tool-group');
            if (dropdown) {
                dropdown.classList.remove('active');
                // Optional: update dropdown toggle text/icon to show last used tool?
                // For now just closing is enough to recover space
            }
        });
    });

    // Dropdown logic
    const dropdowns = document.querySelectorAll('.drawing-tool-dropdown-group');
    dropdowns.forEach(dd => {
        const toggle = dd.querySelector('.dropdown-toggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isActive = dd.classList.contains('active');
                // Close all other dropdowns
                dropdowns.forEach(other => {
                    if (other !== dd) other.classList.remove('active');
                });
                dd.classList.toggle('active');
            });
        }
    });

    // Close dropdowns on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-tool-group')) {
            dropdowns.forEach(dd => dd.classList.remove('active'));
        }
    });

    isDrawingToolbarInitialized = true;
    const colorPicker = document.getElementById('drawing-color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('input', () => redrawAllDrawings());
        // Save only on change (when user releases the picker)
        colorPicker.addEventListener('change', () => {
            if (activeDrawing) saveDrawing(activeDrawing);
        });
    }
    const widthSlider = document.getElementById('drawing-width-slider');
    const widthLabel = document.getElementById('drawing-width-label');
    if (widthSlider && widthLabel) {
        widthSlider.addEventListener('input', () => {
            widthLabel.textContent = widthSlider.value + 'px';
            redrawAllDrawings();
        });
        // Save only on change (when user releases the slider)
        widthSlider.addEventListener('change', () => {
            if (activeDrawing) saveDrawing(activeDrawing);
        });
    }
    const clearBtn = document.getElementById('clear-drawings-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (!activeTicker) return;
            if (confirm('Eliminare tutti i disegni per ' + activeTicker + '?')) {
                apiCall(`/tickers/${activeTicker}/drawings/`, 'DELETE').then(() => {
                    drawings = drawings.filter(d => d.ticker !== activeTicker);
                    redrawAllDrawings();
                });
            }
        });
    }
}

function getDrawColor() { return document.getElementById('drawing-color-picker')?.value || '#58a6ff'; }
function getDrawWidth() { return parseFloat(document.getElementById('drawing-width-slider')?.value || '1.5'); }

function setDrawingTool(tool) {
    console.log("[script.js] setDrawingTool called with:", tool, "current was:", currentDrawingTool);
    if (tool === 'cursor') {
        console.trace("[script.js] Stack trace for setDrawingTool('cursor')");
    }

    currentDrawingTool = tool;
    activeDrawing = null;

    // Update buttons UI
    document.querySelectorAll('.drawing-tool-btn[data-tool]').forEach(btn => {
        const isActive = btn.dataset.tool === tool;
        btn.classList.toggle('active', isActive);
        if (isActive) {
            console.log(`[script.js] Button for ${tool} marked as active`);
        }
    });
    if (drawingCanvas) {
        const isDrawing = tool !== 'cursor';
        drawingCanvas.classList.toggle('active', isDrawing);
        drawingCanvas.style.cursor = tool === 'eraser' ? 'cell' : isDrawing ? 'crosshair' : 'default';
    }
    if (mainChart) {
        const nav = (tool === 'cursor' || tool === 'eraser');
        mainChart.applyOptions({ handleScroll: { mouseWheel: true, pressedMouseMove: nav, horzTouchDrag: nav, vertTouchDrag: nav } });
    }
    if (tool === 'modify') {
        const needed = {
            horizontal_line: 1, vertical_line: 1, trend_line: 2, extended_line: 2, ray: 2, arrow: 2,
            rectangle: 2, circle: 2, triangle: 3, polyline: 2, brush: 3,
            fib_retracement: 2, fib_extension: 3, regression_channel: 2, price_channel: 3,
            text_label: 1, callout: 2, price_label: 1
        };
        drawings = drawings.filter(d => d.points && d.points.length >= (needed[d.type] || 1));
        redrawAllDrawings();
    }
    redrawAllDrawings();
}

// --- Mouse listeners ---
// Stored handler refs for per-slot canvas re-attachment
let _drawingHandlers = null;

function reattachDrawingListeners() {
    const slot = chartSlots[activeChartIndex];
    if (!slot) return;
    drawingCanvas = slot.canvas;
    drawingCtx = slot.ctx;

    // Remove listeners from all canvases
    document.querySelectorAll('.drawing-layer').forEach(c => {
        if (_drawingHandlers) {
            c.removeEventListener('click', _drawingHandlers.click);
            c.removeEventListener('dblclick', _drawingHandlers.dblclick);
            c.removeEventListener('mousedown', _drawingHandlers.mousedown);
            c.removeEventListener('mousemove', _drawingHandlers.mousemove);
            c.removeEventListener('contextmenu', _drawingHandlers.contextmenu);
        }
    });

    if (!drawingCanvas) return;
    _drawingHandlers = buildDrawingHandlers();
    drawingCanvas.addEventListener('click', _drawingHandlers.click);
    drawingCanvas.addEventListener('dblclick', _drawingHandlers.dblclick);
    drawingCanvas.addEventListener('mousedown', _drawingHandlers.mousedown);
    drawingCanvas.addEventListener('mousemove', _drawingHandlers.mousemove);
    (drawingCanvas.parentElement || drawingCanvas).addEventListener('contextmenu', _drawingHandlers.contextmenu);
}

function buildDrawingHandlers() {
    const needed = {
        horizontal_line: 1, vertical_line: 1, trend_line: 2, extended_line: 2, ray: 2, arrow: 2,
        rectangle: 2, circle: 2, triangle: 3, polyline: Infinity, brush: Infinity,
        fib_retracement: 2, fib_extension: 3, regression_channel: 2, price_channel: 3,
        text_label: 1, callout: 2, price_label: 1
    };

    function clickHandler(e) {
        if (!drawingCanvas) return;
        if (currentDrawingTool === 'cursor') return;
        const rect = drawingCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        if (currentDrawingTool === 'eraser') {
            const target = findNearestDrawing(x, y);
            if (target) { deleteDrawing(target); }
            return;
        }
        const time = xToTime(x), price = yToPrice(y);
        if (time == null || price == null) return;
        if (currentDrawingTool === 'text_label') {
            const text = prompt('Testo da inserire sul grafico:');
            if (!text) return;
            const newDrawing = { type: 'text_label', ticker: activeTicker, points: [{ time, price }], text, color: getDrawColor(), lineWidth: getDrawWidth() };
            drawings.push(newDrawing);
            saveDrawing(newDrawing); redrawAllDrawings(); return;
        }
        if (currentDrawingTool === 'price_label') {
            const newDrawing = { type: 'price_label', ticker: activeTicker, points: [{ time, price }], color: getDrawColor(), lineWidth: getDrawWidth() };
            drawings.push(newDrawing);
            saveDrawing(newDrawing); redrawAllDrawings(); return;
        }
        if (currentDrawingTool === 'callout') {
            if (!activeDrawing) {
                activeDrawing = { type: 'callout', ticker: activeTicker, points: [{ time, price }], color: getDrawColor(), lineWidth: getDrawWidth() };
                redrawAllDrawings(); return;
            } else {
                const text = prompt('Testo del callout:');
                if (!text) { activeDrawing = null; redrawAllDrawings(); return; }
                activeDrawing.text = text;
                activeDrawing.points.push({ time, price });
                const newDrawing = { ...activeDrawing };
                drawings.push(newDrawing);
                saveDrawing(newDrawing); activeDrawing = null;
                redrawAllDrawings(); return;
            }
        }
        if (currentDrawingTool === 'polyline') {
            if (!activeDrawing) activeDrawing = { type: 'polyline', ticker: activeTicker, points: [], color: getDrawColor(), lineWidth: getDrawWidth() };
            activeDrawing.points.push({ time, price });
            redrawAllDrawings(); return;
        }
        if (!activeDrawing) activeDrawing = { type: currentDrawingTool, ticker: activeTicker, points: [], color: getDrawColor(), lineWidth: getDrawWidth() };
        activeDrawing.points.push({ time, price });
        if (activeDrawing.points.length >= (needed[currentDrawingTool] || 2)) {
            const newDrawing = { ...activeDrawing, points: [...activeDrawing.points] };
            drawings.push(newDrawing);
            saveDrawing(newDrawing); activeDrawing = null;
        }
        redrawAllDrawings();
    }

    function dblclickHandler(e) {
        if (currentDrawingTool === 'polyline' && activeDrawing) {
            if (activeDrawing.points.length > 1) {
                const newDrawing = { ...activeDrawing };
                drawings.push(newDrawing);
                saveDrawing(newDrawing);
            }
            activeDrawing = null;
            redrawAllDrawings();
        }
    }

    function mousedownHandler(e) {
        if (!drawingCanvas) return;
        const rect = drawingCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const time = xToTime(x), price = yToPrice(y);
        if (currentDrawingTool === 'modify') {
            const target = findNearestDrawing(x, y);
            if (target && time != null && price != null) {
                let pIdx = -1;
                for (let i = 0; i < target.points.length; i++) {
                    const px = timeToX(target.points[i].time), py = priceToY(target.points[i].price);
                    if (px != null && py != null && Math.hypot(x - px, y - py) < 8) { pIdx = i; break; }
                }
                isDragging = true;
                dragTarget = target;
                dragPointIndex = pIdx;
                dragStartPos = { time, price };
                originalPoints = JSON.parse(JSON.stringify(target.points));
            }
            return;
        }
        if (currentDrawingTool === 'brush') {
            if (time != null && price != null) {
                activeDrawing = { type: 'brush', ticker: activeTicker, points: [{ time, price }], color: getDrawColor(), lineWidth: getDrawWidth() };
            }
        }
    }

    function mousemoveHandler(e) {
        if (!drawingCanvas) return;
        if (currentDrawingTool === 'cursor') return;
        const rect = drawingCanvas.getBoundingClientRect();
        lastMousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        if (isDragging && dragTarget) {
            const curTime = xToTime(lastMousePos.x), curPrice = yToPrice(lastMousePos.y);
            if (curTime != null && curPrice != null && dragStartPos.time != null && dragStartPos.price != null) {
                if (dragPointIndex !== -1) {
                    dragTarget.points[dragPointIndex] = { time: curTime, price: curPrice };
                } else {
                    const pDelta = curPrice - dragStartPos.price;
                    let tDeltaIdx = 0;
                    const startIdx = activePriceData.findIndex(b => b.time === dragStartPos.time);
                    const curIdx = activePriceData.findIndex(b => b.time === curTime);
                    if (startIdx !== -1 && curIdx !== -1) tDeltaIdx = curIdx - startIdx;
                    dragTarget.points = originalPoints.map(p => {
                        let newTime = p.time;
                        if (tDeltaIdx !== 0) {
                            const pIdx = activePriceData.findIndex(b => b.time === p.time);
                            if (pIdx !== -1 && activePriceData[pIdx + tDeltaIdx]) newTime = activePriceData[pIdx + tDeltaIdx].time;
                        }
                        return { time: newTime, price: p.price + pDelta };
                    });
                }
                redrawAllDrawings();
            }
            return;
        }
        if (currentDrawingTool === 'brush' && activeDrawing) {
            const time = xToTime(lastMousePos.x), price = yToPrice(lastMousePos.y);
            if (time != null && price != null) { activeDrawing.points.push({ time, price }); redrawAllDrawings(); }
            return;
        }
        if (currentDrawingTool === 'eraser') {
            redrawAllDrawings();
            const target = findNearestDrawing(lastMousePos.x, lastMousePos.y);
            if (target && drawingCtx) {
                drawingCtx.save();
                drawingCtx.strokeStyle = '#da3633';
                drawingCtx.lineWidth = (target.lineWidth || 1.5) + 4;
                drawingCtx.globalAlpha = 0.5;
                renderDrawing(drawingCtx, target, false);
                drawingCtx.restore();
            }
            return;
        }
        if (activeDrawing && activeDrawing.points.length > 0) redrawAllDrawings();
    }

    function contextmenuHandler(e) {
        if (!drawingCanvas) return;
        const existingMenu = document.getElementById('drawing-ctx-menu');
        if (existingMenu) { e.preventDefault(); dismissContextMenu(); return; }
        if (activeDrawing && activeDrawing.points.length > 0) {
            e.preventDefault(); activeDrawing = null; redrawAllDrawings(); return;
        }
        const rect = drawingCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
        const target = findNearestDrawing(x, y);
        if (target) { e.preventDefault(); showDrawingContextMenu(e.clientX, e.clientY, target); }
        else if (currentDrawingTool !== 'cursor' && !activeDrawing) { e.preventDefault(); setDrawingTool('cursor'); }
        else if (activeDrawing) { e.preventDefault(); activeDrawing = null; redrawAllDrawings(); }
    }

    return { click: clickHandler, dblclick: dblclickHandler, mousedown: mousedownHandler, mousemove: mousemoveHandler, contextmenu: contextmenuHandler };
}

function setupDrawingMouseListeners() {
    // Attach global listeners once
    window.addEventListener('mouseup', () => {
        if (isDragging && dragTarget) {
            isDragging = false;
            saveDrawing(dragTarget);
            dragTarget = null;
            dragPointIndex = -1;
        }
        if (currentDrawingTool === 'brush' && activeDrawing) {
            if (activeDrawing.points.length > 2) {
                const newDrawing = { ...activeDrawing };
                drawings.push(newDrawing);
                saveDrawing(newDrawing);
            }
            activeDrawing = null;
            redrawAllDrawings();
        }
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('#drawing-ctx-menu')) dismissContextMenu();
    });

    reattachDrawingListeners();
}

// --- Main redraw ---
function redrawAllDrawings() {
    if (!drawingCtx || !drawingCanvas || !mainChart) return;

    // Sync the drawing canvas with the LWC internal plot area (correct alignment,
    // NOT the full container which includes price/time scales).
    syncDrawingCanvasSize();

    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    if (!activeTicker) return;
    const needed = {
        horizontal_line: 1, vertical_line: 1, trend_line: 2, extended_line: 2, ray: 2, arrow: 2,
        rectangle: 2, circle: 2, triangle: 3, polyline: 2, brush: 3,
        fib_retracement: 2, fib_extension: 3, regression_channel: 2, price_channel: 3,
        text_label: 1, callout: 2, price_label: 1
    };

    drawings.filter(d => d.ticker === activeTicker).forEach(d => {
        renderDrawing(drawingCtx, d, false);
        // Show anchor points ONLY in modify mode and ONLY for finalized drawings
        if (currentDrawingTool === 'modify' && d.points.length >= (needed[d.type] || 1)) {
            if (d._isHidden) return;
            drawingCtx.save();
            drawingCtx.fillStyle = '#58a6ff';
            drawingCtx.strokeStyle = '#fff';
            drawingCtx.lineWidth = 1;
            d.points.forEach(p => {
                if (p.time != null && p.price != null) {
                    const x = timeToX(p.time), y = priceToY(p.price);
                    if (x != null && y != null) {
                        drawingCtx.beginPath();
                        drawingCtx.arc(x, y, 4, 0, Math.PI * 2);
                        drawingCtx.fill();
                        drawingCtx.stroke();
                    }
                }
            });
            drawingCtx.restore();
        }
    });
    if (activeDrawing && activeDrawing.points.length > 0) {
        const preview = {
            type: activeDrawing.type, ticker: activeDrawing.ticker,
            points: [...activeDrawing.points, { time: xToTime(lastMousePos.x), price: yToPrice(lastMousePos.y) }]
        };
        drawingCtx.globalAlpha = 0.55;
        renderDrawing(drawingCtx, preview, true);
        drawingCtx.globalAlpha = 1.0;
    }
}

// --- Dispatch ---
function renderDrawing(ctx, d, isPreview) {
    switch (d.type) {
        case 'horizontal_line': drawHorizontalLine(ctx, d, isPreview); break;
        case 'vertical_line': drawVerticalLine(ctx, d, isPreview); break;
        case 'trend_line': drawTrendLine(ctx, d, isPreview); break;
        case 'extended_line': drawExtendedLine(ctx, d, isPreview); break;
        case 'polyline': drawPolyline(ctx, d, isPreview); break;
        case 'brush': drawBrush(ctx, d, isPreview); break;
        case 'ray': drawRay(ctx, d, isPreview); break;
        case 'arrow': drawArrow(ctx, d, isPreview); break;
        case 'rectangle': drawRectangle(ctx, d, isPreview); break;
        case 'circle': drawCircle(ctx, d, isPreview); break;
        case 'fib_retracement': drawFibRetracement(ctx, d, isPreview); break;
        case 'fib_extension': drawFibExtension(ctx, d, isPreview); break;
        case 'regression_channel': drawRegressionChannel(ctx, d, isPreview); break;
        case 'price_channel': drawPriceChannel(ctx, d, isPreview); break;
        case 'text_label': drawTextLabel(ctx, d, isPreview); break;
        case 'triangle': drawTriangle(ctx, d, isPreview); break;
        case 'callout': drawCallout(ctx, d, isPreview); break;
        case 'price_label': drawPriceLabel(ctx, d, isPreview); break;
    }
}

function applyStroke(ctx, color, width, dashed) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [6, 4] : []);
}
function dot(ctx, x, y, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
}

// --- Horizontal Line ---
function drawHorizontalLine(ctx, d, isPreview) {
    if (!d.points[0]) return;
    const y = priceToY(d.points[0].price); if (y == null) return;
    const col = d.color || '#58a6ff', w = d.lineWidth || 1.5;
    applyStroke(ctx, col, w, false);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(drawingCanvas.width, y); ctx.stroke();
    if (!isPreview) {
        ctx.fillStyle = col; ctx.font = '11px monospace';
        ctx.fillText(d.points[0].price.toFixed(2), drawingCanvas.width - 80, y - 4);
    }
}

// --- Vertical Line ---
function drawVerticalLine(ctx, d, isPreview) {
    if (!d.points[0]) return;
    const x = timeToX(d.points[0].time); if (x == null) return;
    const col = d.color || '#58a6ff', w = d.lineWidth || 1.5;
    applyStroke(ctx, col, w, false);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, drawingCanvas.height); ctx.stroke();
    if (!isPreview) {
        const lbl = (typeof d.points[0].time === 'string') ? d.points[0].time : timeToStr(d.points[0].time);
        ctx.fillStyle = col; ctx.font = '11px monospace'; ctx.fillText(lbl, x + 4, 16);
    }
}

// --- Trend Line (segment p1 to p2) ---
function drawTrendLine(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    const col = d.color || '#f0a500', w = d.lineWidth || 1.5;
    const x1 = timeToX(pts[0].time), y1 = priceToY(pts[0].price);
    if (x1 == null || y1 == null) return;
    dot(ctx, x1, y1, col);
    if (!pts[1]) return;
    const x2 = timeToX(pts[1].time), y2 = priceToY(pts[1].price);
    if (x2 == null || y2 == null) return;
    applyStroke(ctx, col, w, false);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    dot(ctx, x2, y2, col);
}

// --- Extended Line (infinite through p1 and p2) ---
function drawExtendedLine(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    const col = d.color || '#f0a500', w = d.lineWidth || 1.5;
    const x1 = timeToX(pts[0].time), y1 = priceToY(pts[0].price);
    if (x1 == null || y1 == null) return;
    dot(ctx, x1, y1, col);
    if (!pts[1]) return;
    const x2 = timeToX(pts[1].time), y2 = priceToY(pts[1].price);
    if (x2 == null || y2 == null) return;
    const W = drawingCanvas.width;
    applyStroke(ctx, col, w, false);
    ctx.beginPath();
    if (Math.abs(x2 - x1) > 0.1) {
        const m = (y2 - y1) / (x2 - x1);
        ctx.moveTo(0, y1 + m * (0 - x1)); ctx.lineTo(W, y1 + m * (W - x1));
    } else { ctx.moveTo(x1, 0); ctx.lineTo(x1, drawingCanvas.height); }
    ctx.stroke();
    dot(ctx, x2, y2, col);
}

// --- Ray (extends only right from p1 through p2) ---
function drawRay(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    const col = d.color || '#f0a500', w = d.lineWidth || 1.5;
    const x1 = timeToX(pts[0].time), y1 = priceToY(pts[0].price);
    if (x1 == null || y1 == null) return;
    dot(ctx, x1, y1, col);
    if (!pts[1]) return;
    const x2 = timeToX(pts[1].time), y2 = priceToY(pts[1].price);
    if (x2 == null || y2 == null) return;
    const W = drawingCanvas.width;
    applyStroke(ctx, col, w, false);
    ctx.beginPath(); ctx.moveTo(x1, y1);
    if (x2 !== x1) { const m = (y2 - y1) / (x2 - x1); ctx.lineTo(W, y1 + m * (W - x1)); } else ctx.lineTo(x1, 0);
    ctx.stroke(); dot(ctx, x2, y2, col);
}

// --- Arrow ---
function drawArrow(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    const col = d.color || '#f0a500', w = d.lineWidth || 1.5;
    const x1 = timeToX(pts[0].time), y1 = priceToY(pts[0].price);
    if (x1 == null || y1 == null) return;
    dot(ctx, x1, y1, col);
    if (!pts[1]) return;
    const x2 = timeToX(pts[1].time), y2 = priceToY(pts[1].price);
    if (x2 == null || y2 == null) return;
    applyStroke(ctx, col, w, false);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1), hLen = 14 + w * 2;
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hLen * Math.cos(ang - Math.PI / 6), y2 - hLen * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(x2 - hLen * Math.cos(ang + Math.PI / 6), y2 - hLen * Math.sin(ang + Math.PI / 6));
    ctx.closePath(); ctx.fill();
}

// --- Rectangle ---
function drawRectangle(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    const col = d.color || '#58a6ff', w = d.lineWidth || 1.5;
    const x1 = timeToX(pts[0].time), y1 = priceToY(pts[0].price);
    if (x1 == null || y1 == null) return;

    const p2 = pts[1] || { time: xToTime(lastMousePos.x), price: yToPrice(lastMousePos.y) };
    const x2 = timeToX(p2.time), y2 = priceToY(p2.price);
    if (x2 == null || y2 == null) return;

    const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);

    // Fill
    ctx.fillStyle = col + '18';
    ctx.fillRect(rx, ry, rw, rh);

    // Border
    applyStroke(ctx, col, w, false);
    ctx.strokeRect(rx, ry, rw, rh);

    // Median Line (Horizontal)
    const midY = ry + rh / 2;
    applyStroke(ctx, col, w * 0.8, true); // Slightly thinner, dashed
    ctx.beginPath();
    ctx.moveTo(rx, midY);
    ctx.lineTo(rx + rw, midY);
    ctx.stroke();

    // Reset dash for labels
    ctx.setLineDash([]);

    // Percentage Label
    const p1Price = pts[0].price;
    const p2Price = p2.price;
    const diff = p2Price - p1Price;
    const pct = (diff / p1Price) * 100;
    const labelText = (diff > 0 ? '+' : '') + diff.toFixed(2) + ' (' + (pct > 0 ? '+' : '') + pct.toFixed(2) + '%)';

    ctx.font = 'bold 11px monospace';
    const metrics = ctx.measureText(labelText);
    const labelWidth = metrics.width + 8;
    const labelHeight = 18;

    // Positioning: 
    // If p2Price > p1Price (drawn bottom to top) -> Top Right
    // If p2Price < p1Price (drawn top to bottom) -> Bottom Right
    let lx = rx + rw - labelWidth;
    let ly = (p2Price >= p1Price) ? ry - 5 : ry + rh + labelHeight;

    // Background for label
    ctx.fillStyle = '#161b22cc';
    ctx.fillRect(lx, ly - 12, labelWidth, labelHeight);

    // Label Text
    ctx.fillStyle = col;
    ctx.fillText(labelText, lx + 4, ly);

    if (!isPreview) dot(ctx, x1, y1, col); // show anchor points
}

// --- Circle ---
function drawCircle(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    const col = d.color || '#58a6ff', w = d.lineWidth || 1.5;
    const cx = timeToX(pts[0].time), cy = priceToY(pts[0].price);
    if (cx == null || cy == null) return;
    const p2 = pts[1] || { time: xToTime(lastMousePos.x), price: yToPrice(lastMousePos.y) };
    const ex = timeToX(p2.time), ey = priceToY(p2.price);
    if (ex == null || ey == null) return;
    const r = Math.hypot(ex - cx, ey - cy);
    ctx.fillStyle = col + '18'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    applyStroke(ctx, col, w, false); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    dot(ctx, cx, cy, col);
}

// --- Price Channel (parallel lines) ---
function drawPriceChannel(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    const col = d.color || '#a78bfa', w = d.lineWidth || 1.5;
    const x1 = timeToX(pts[0].time), y1 = priceToY(pts[0].price);
    if (x1 == null || y1 == null) return;
    dot(ctx, x1, y1, col);
    if (!pts[1]) return;
    const x2 = timeToX(pts[1].time), y2 = priceToY(pts[1].price);
    if (x2 == null || y2 == null) return;
    const W = drawingCanvas.width;
    const m = (x2 !== x1) ? (y2 - y1) / (x2 - x1) : Infinity;
    const lineY = (x, base) => m === Infinity ? y1 : base + m * (x - x1);
    applyStroke(ctx, col, w, false);
    ctx.beginPath(); ctx.moveTo(0, lineY(0, y1)); ctx.lineTo(W, lineY(W, y1)); ctx.stroke();
    dot(ctx, x2, y2, col);
    const p3 = pts[2] || { time: xToTime(lastMousePos.x), price: yToPrice(lastMousePos.y) };
    if (!p3 || !p3.price) return;
    const y3 = priceToY(p3.price); if (y3 == null) return;
    const refX = pts[2] ? timeToX(pts[2].time) : lastMousePos.x;
    const offset = y3 - lineY(refX ?? x2, y1);
    applyStroke(ctx, col, w, true);
    ctx.beginPath(); ctx.moveTo(0, lineY(0, y1) + offset); ctx.lineTo(W, lineY(W, y1) + offset); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = col + '15';
    ctx.beginPath();
    ctx.moveTo(0, lineY(0, y1)); ctx.lineTo(W, lineY(W, y1));
    ctx.lineTo(W, lineY(W, y1) + offset); ctx.lineTo(0, lineY(0, y1) + offset);
    ctx.closePath(); ctx.fill();
}

// --- Text Label ---
function drawTextLabel(ctx, d, isPreview) {
    if (!d.points[0] || !d.text) return;
    const x = timeToX(d.points[0].time), y = priceToY(d.points[0].price);
    if (x == null || y == null) return;
    const col = d.color || '#58a6ff', fs = Math.max(11, (d.lineWidth || 1.5) * 7);
    ctx.font = 'bold ' + fs + 'px monospace';
    const mw = ctx.measureText(d.text);
    ctx.fillStyle = '#161b22cc'; ctx.fillRect(x - 3, y - fs, mw.width + 8, fs + 5);
    ctx.fillStyle = col; ctx.setLineDash([]); ctx.fillText(d.text, x + 2, y);
    dot(ctx, x, y, col);
}

// --- Triangle ---
function drawTriangle(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    const col = d.color || '#58a6ff', w = d.lineWidth || 1.5;
    const x1 = timeToX(pts[0].time), y1 = priceToY(pts[0].price);
    if (x1 == null || y1 == null) return;
    dot(ctx, x1, y1, col);

    const p2 = pts[1] || (isPreview ? { time: xToTime(lastMousePos.x), price: yToPrice(lastMousePos.y) } : null);
    if (!p2) return;
    const x2 = timeToX(p2.time), y2 = priceToY(p2.price);
    if (x2 == null || y2 == null) return;
    dot(ctx, x2, y2, col);

    const p3 = pts[2] || (isPreview && pts[1] ? { time: xToTime(lastMousePos.x), price: yToPrice(lastMousePos.y) } : null);
    if (!p3) {
        applyStroke(ctx, col, w, true);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        return;
    }
    const x3 = timeToX(p3.time), y3 = priceToY(p3.price);
    if (x3 == null || y3 == null) return;

    ctx.fillStyle = col + '18';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    applyStroke(ctx, col, w, false);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.stroke();
    dot(ctx, x3, y3, col);
}

// --- Callout ---
function drawCallout(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    const col = d.color || '#58a6ff', w = d.lineWidth || 1.5;
    const x1 = timeToX(pts[0].time), y1 = priceToY(pts[0].price);
    if (x1 == null || y1 == null) return;
    dot(ctx, x1, y1, col);

    const p2 = pts[1] || (isPreview ? { time: xToTime(lastMousePos.x), price: yToPrice(lastMousePos.y) } : null);
    if (!p2) return;
    const x2 = timeToX(p2.time), y2 = priceToY(p2.price);
    if (x2 == null || y2 == null) return;

    // Line from point to box
    applyStroke(ctx, col, w, false);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

    if (d.text) {
        ctx.font = 'bold 12px monospace';
        const metrics = ctx.measureText(d.text);
        const pad = 6;
        const bw = metrics.width + pad * 2, bh = 20;
        const bx = x2 - bw / 2, by = y2 - bh / 2;

        ctx.fillStyle = '#161b22';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = col;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = col;
        ctx.fillText(d.text, bx + pad, by + 14);
    }
}

// --- Price Label ---
function drawPriceLabel(ctx, d, isPreview) {
    if (!d.points[0]) return;
    const x = timeToX(d.points[0].time), y = priceToY(d.points[0].price);
    if (x == null || y == null) return;
    const col = d.color || '#58a6ff';
    const priceText = d.points[0].price.toFixed(2);

    ctx.font = 'bold 11px monospace';
    const metrics = ctx.measureText(priceText);
    const pad = 4;
    const bw = metrics.width + pad * 2 + 10, bh = 18;

    // Drawing a label shape (tag-like)
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10, y - bh / 2);
    ctx.lineTo(x + bw, y - bh / 2);
    ctx.lineTo(x + bw, y + bh / 2);
    ctx.lineTo(x + 10, y + bh / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.fillText(priceText, x + 12, y + 4);
}

// --- Polyline (multipoint) ---
function drawPolyline(ctx, d, isPreview) {
    const pts = d.points; if (pts.length < 1) return;
    const col = d.color || '#58a6ff', w = d.lineWidth || 1.5;
    applyStroke(ctx, col, w, false);
    ctx.beginPath();
    let first = true;
    for (const p of pts) {
        const x = timeToX(p.time), y = priceToY(p.price);
        if (x != null && y != null) {
            if (first) { ctx.moveTo(x, y); first = false; } else { ctx.lineTo(x, y); }
        }
    }
    ctx.stroke();
    if (!isPreview) {
        for (const p of pts) {
            const x = timeToX(p.time), y = priceToY(p.price);
            if (x != null && y != null) dot(ctx, x, y, col);
        }
    }
}

// --- Brush (freehand stroke) ---
function drawBrush(ctx, d, isPreview) {
    const pts = d.points; if (pts.length < 2) return;
    const col = d.color || '#58a6ff', w = d.lineWidth || 1.5;
    applyStroke(ctx, col, w, false);
    ctx.beginPath();
    let first = true;
    for (const p of pts) {
        const x = timeToX(p.time), y = priceToY(p.price);
        if (x != null && y != null) {
            if (first) { ctx.moveTo(x, y); first = false; } else { ctx.lineTo(x, y); }
        }
    }
    ctx.stroke();
}

// --- Fibonacci Retracement ---
function drawFibRetracement(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    if (!pts[1]) {
        const x = timeToX(pts[0].time), y = priceToY(pts[0].price);
        if (x != null && y != null) { ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
        return;
    }
    const x1 = timeToX(pts[0].time), x2 = timeToX(pts[1].time);
    const p1 = pts[0].price, p2 = pts[1].price;
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const cols = ['#2ea043', '#58a6ff', '#f0a500', '#e11d48', '#f0a500', '#58a6ff', '#da3633'];
    const minX = Math.min(x1 ?? 0, x2 ?? drawingCanvas.width);
    const maxX = Math.max(x1 ?? 0, x2 ?? drawingCanvas.width);
    levels.forEach((lvl, i) => {
        const price = p1 + (p2 - p1) * lvl, y = priceToY(price); if (y == null) return;
        applyStroke(ctx, cols[i], 1.2, true);
        ctx.beginPath(); ctx.moveTo(minX, y); ctx.lineTo(maxX, y); ctx.stroke();
        if (i < levels.length - 1) {
            const ny = priceToY(p1 + (p2 - p1) * levels[i + 1]);
            if (ny != null) { ctx.fillStyle = cols[i] + '18'; ctx.fillRect(minX, Math.min(y, ny), maxX - minX, Math.abs(ny - y)); }
        }
        if (!isPreview) {
            ctx.setLineDash([]); ctx.fillStyle = cols[i]; ctx.font = 'bold 10px monospace';
            ctx.fillText(`${(lvl * 100).toFixed(1)}%  ${price.toFixed(2)}`, maxX + 4, y + 4);
        }
    });
    applyStroke(ctx, '#ffffff30', 1, false);
    if (x1 != null) { ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, drawingCanvas.height); ctx.stroke(); }
    if (x2 != null) { ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, drawingCanvas.height); ctx.stroke(); }
}

// --- Fibonacci Extension ---
function drawFibExtension(ctx, d, isPreview) {
    const pts = d.points; if (!pts[0]) return;
    if (!pts[1]) {
        const x = timeToX(pts[0].time), y = priceToY(pts[0].price);
        if (x != null && y != null) { ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
        return;
    }
    const pA = pts[0].price, pB = pts[1].price;
    const pC = pts[2] ? pts[2].price : (yToPrice(lastMousePos.y) ?? pA);
    const xC = pts[2] ? timeToX(pts[2].time) : lastMousePos.x;
    const swing = pB - pA;
    const levels = [0, 0.618, 1.0, 1.618, 2.618];
    const labels = ['0%', '61.8%', '100%', '161.8%', '261.8%'];
    const cols = ['#2ea043', '#58a6ff', '#f0a500', '#e11d48', '#a78bfa'];
    const W = drawingCanvas.width;
    levels.forEach((lvl, i) => {
        const price = pC + swing * lvl, y = priceToY(price); if (y == null) return;
        applyStroke(ctx, cols[i], 1.2, true);
        ctx.beginPath(); ctx.moveTo(xC ?? 0, y); ctx.lineTo(W, y); ctx.stroke();
        if (!isPreview) { ctx.setLineDash([]); ctx.fillStyle = cols[i]; ctx.font = 'bold 10px monospace'; ctx.fillText(`${labels[i]}  ${price.toFixed(2)}`, W - 95, y - 3); }
    });
    const xA = timeToX(pts[0].time), yA = priceToY(pts[0].price);
    const xB = timeToX(pts[1].time), yB = priceToY(pts[1].price);
    if (xA != null && yA != null && xB != null && yB != null) {
        applyStroke(ctx, '#ffffff50', 1.5, false);
        ctx.beginPath(); ctx.moveTo(xA, yA); ctx.lineTo(xB, yB); ctx.stroke();
    }
}

// --- Regression Channel ---
function drawRegressionChannel(ctx, d, isPreview) {
    const pts = d.points;
    if (!pts[0]) return;
    const col = d.color || '#34d399', w = d.lineWidth || 1.5;
    const stdMultiplier = d.stdDev || 2.0;

    if (!pts[1]) {
        const x = timeToX(pts[0].time), y = priceToY(pts[0].price);
        if (x != null && y != null) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
        return;
    }
    if (!activePriceData || activePriceData.length === 0) return;
    const tMin = pts[0].time < pts[1].time ? pts[0].time : pts[1].time;
    const tMax = pts[0].time < pts[1].time ? pts[1].time : pts[0].time;
    const slice = activePriceData.filter(b => b.time >= tMin && b.time <= tMax);
    if (slice.length < 3) {
        d._isHidden = true;
        return;
    }
    d._isHidden = false;
    const n = slice.length;
    let sx = 0, sy = 0, sxy = 0, sx2 = 0;
    slice.forEach((b, i) => { sx += i; sy += b.close; sxy += i * b.close; sx2 += i * i; });
    const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
    const intercept = (sy - slope * sx) / n;

    // Allinea "fisicamente" i punti di ancoraggio alla linea centrale calcolata
    if (!isPreview && pts.length >= 2) {
        if (pts[0].time < pts[1].time) {
            pts[0].price = intercept;
            pts[1].price = slope * (n - 1) + intercept;
        } else {
            pts[1].price = intercept;
            pts[0].price = slope * (n - 1) + intercept;
        }
    }

    const pred = slice.map((_, i) => slope * i + intercept);
    const sigma = Math.sqrt(slice.reduce((s, b, i) => s + (b.close - pred[i]) ** 2, 0) / n);
    const x0 = timeToX(slice[0].time), xN = timeToX(slice[n - 1].time);
    if (x0 == null || xN == null) return;

    let limitX = xN;
    if (d.extendRight && xN !== x0) {
        limitX = drawingCanvas.width;
    }

    const bands = [
        { m: 0, opacity: 'ff', width: w * 1.5, dashed: false }, // Center
        { m: 1, opacity: '99', width: w, dashed: true },
        { m: -1, opacity: '99', width: w, dashed: true },
        { m: stdMultiplier, opacity: '66', width: w, dashed: true }, // Top band
        { m: -stdMultiplier, opacity: '66', width: w, dashed: true } // Bottom band
    ];

    bands.forEach(({ m, opacity, width, dashed }) => {
        const yS = priceToY(pred[0] + m * sigma), yE = priceToY(pred[n - 1] + m * sigma);
        if (yS == null || yE == null) return;
        ctx.strokeStyle = col + opacity; ctx.lineWidth = width; ctx.setLineDash(dashed ? [6, 4] : []);
        
        let endX = xN, endY = yE;
        if (d.extendRight && xN !== x0) {
            endX = limitX;
            endY = yS + (yE - yS) * (endX - x0) / (xN - x0);
        }
        ctx.beginPath(); ctx.moveTo(x0, yS); ctx.lineTo(endX, endY); ctx.stroke();
    });

    // Fill area between outermost bands
    const yTopS = priceToY(pred[0] + stdMultiplier * sigma), yTopE = priceToY(pred[n - 1] + stdMultiplier * sigma);
    const yBotS = priceToY(pred[0] - stdMultiplier * sigma), yBotE = priceToY(pred[n - 1] - stdMultiplier * sigma);
    if (yTopS != null && yTopE != null && yBotS != null && yBotE != null) {
        ctx.setLineDash([]); ctx.fillStyle = col + '12';
        let areaXN = xN, areaTopE = yTopE, areaBotE = yBotE;
        if (d.extendRight && xN !== x0) {
            areaXN = limitX;
            areaTopE = yTopS + (yTopE - yTopS) * (areaXN - x0) / (xN - x0);
            areaBotE = yBotS + (yBotE - yBotS) * (areaXN - x0) / (xN - x0);
        }
        ctx.beginPath(); ctx.moveTo(x0, yTopS); ctx.lineTo(areaXN, areaTopE); ctx.lineTo(areaXN, areaBotE); ctx.lineTo(x0, yBotS); ctx.closePath(); ctx.fill();
    }

    if (!isPreview) {
        const mi = Math.floor(n / 2), mx = timeToX(slice[mi].time), my = priceToY(pred[mi]);
        if (mx != null && my != null) {
            ctx.setLineDash([]); ctx.fillStyle = col; ctx.font = 'bold 10px monospace';
            ctx.fillText('DevStd: ' + stdMultiplier.toFixed(1) + ' (σ=' + sigma.toFixed(2) + ')', mx + 4, my - 6);
        }
    }
}

// --- Context menu ---
function showDrawingContextMenu(ex, ey, target) {
    dismissContextMenu();
    const labels = {
        horizontal_line: 'Linea Orizzontale', vertical_line: 'Linea Verticale', trend_line: 'Trend Line',
        extended_line: 'Linea Estesa', ray: 'Raggio', arrow: 'Freccia', rectangle: 'Rettangolo',
        circle: 'Cerchio', triangle: 'Triangolo', polyline: 'Polilinea', brush: 'Pennello',
        fib_retracement: 'Fibonacci Ret.', fib_extension: 'Fibonacci Ext.', regression_channel: 'Regressione',
        price_channel: 'Canale Parallelo', text_label: 'Testo', callout: 'Callout', price_label: 'Etichetta Prezzo'
    };
    const menu = document.createElement('div');
    menu.className = 'drawing-context-menu'; menu.id = 'drawing-ctx-menu';
    menu.style.left = ex + 'px'; menu.style.top = ey + 'px';
    // Title
    const h = document.createElement('div');
    h.className = 'drawing-context-menu-item'; h.textContent = labels[target.type] || target.type;
    h.style.cssText = 'opacity:0.6;cursor:default;font-weight:bold'; menu.appendChild(h);
    // Color row
    const colorRow = document.createElement('div');
    colorRow.className = 'drawing-context-menu-item'; colorRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const colPick = document.createElement('input'); colPick.type = 'color'; colPick.value = target.color || '#58a6ff';
    colPick.style.cssText = 'width:28px;height:24px;padding:1px;cursor:pointer;border-radius:4px;border:none;background:none;';
    colPick.addEventListener('input', () => { target.color = colPick.value; redrawAllDrawings(); });
    colPick.addEventListener('change', () => { saveDrawing(target); });
    const colLbl = document.createElement('span'); colLbl.textContent = 'Colore';
    colorRow.appendChild(colPick); colorRow.appendChild(colLbl); menu.appendChild(colorRow);
    // Width row
    const wRow = document.createElement('div');
    wRow.className = 'drawing-context-menu-item'; wRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const wSlider = document.createElement('input'); wSlider.type = 'range'; wSlider.min = '1'; wSlider.max = '6'; wSlider.step = '0.5';
    wSlider.value = String(target.lineWidth || 1.5); wSlider.style.cssText = 'width:75px;accent-color:var(--accent-color);';
    const wLbl = document.createElement('span'); wLbl.textContent = (target.lineWidth || 1.5) + 'px';
    wSlider.addEventListener('input', () => { target.lineWidth = parseFloat(wSlider.value); wLbl.textContent = wSlider.value + 'px'; redrawAllDrawings(); });
    wSlider.addEventListener('change', () => { saveDrawing(target); });
    wRow.appendChild(wSlider); wRow.appendChild(wLbl); menu.appendChild(wRow);

    // Regression StdDev row
    if (target.type === 'regression_channel') {
        const devRow = document.createElement('div');
        devRow.className = 'drawing-context-menu-item'; devRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const devSlider = document.createElement('input'); devSlider.type = 'range'; devSlider.min = '1'; devSlider.max = '4'; devSlider.step = '0.5';
        devSlider.value = String(target.stdDev || 2.0); devSlider.style.cssText = 'width:75px;accent-color:var(--accent-color);';
        const devLbl = document.createElement('span'); devLbl.textContent = 'Dev: ' + (target.stdDev || 2.0);
        devSlider.addEventListener('input', () => {
            target.stdDev = parseFloat(devSlider.value);
            devLbl.textContent = 'Dev: ' + devSlider.value;
            saveDrawing(target); redrawAllDrawings();
        });
        devRow.appendChild(devSlider); devRow.appendChild(devLbl); menu.appendChild(devRow);

        const extRow = document.createElement('div');
        extRow.className = 'drawing-context-menu-item'; extRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const extCheck = document.createElement('input'); extCheck.type = 'checkbox'; extCheck.checked = !!target.extendRight;
        const extLbl = document.createElement('span'); extLbl.textContent = 'Estendi a destra';
        extCheck.addEventListener('change', () => {
            target.extendRight = extCheck.checked;
            saveDrawing(target); redrawAllDrawings();
        });
        extRow.appendChild(extCheck); extRow.appendChild(extLbl); menu.appendChild(extRow);
    }

    // Alarm
    if (target.type === 'horizontal_line' || target.type === 'trend_line' || target.type === 'ray' || target.type === 'extended_line') {
        const alarmBtn = document.createElement('div');
        alarmBtn.className = 'drawing-context-menu-item';
        alarmBtn.innerHTML = '🔔 Imposta Allarme';
        alarmBtn.addEventListener('click', () => {
            openAlarmModal(target);
            dismissContextMenu();
        });
        menu.appendChild(alarmBtn);
    }

    // Delete
    const del = document.createElement('div');
    del.className = 'drawing-context-menu-item danger'; del.textContent = '🗑 Elimina';
    del.addEventListener('click', () => { deleteDrawing(target); dismissContextMenu(); });
    menu.appendChild(del); document.body.appendChild(menu);
}
function dismissContextMenu() { const m = document.getElementById('drawing-ctx-menu'); if (m) m.remove(); }
function findNearestDrawing(x, y, thr = 10) {
    for (const d of [...drawings.filter(dd => dd.ticker === activeTicker)].reverse()) {
        const p = d.points;
        
        // Controllo prima se è stato cliccato un punto di ancoraggio
        for (let i = 0; i < p.length; i++) {
            const px = timeToX(p[i].time), py = priceToY(p[i].price);
            if (px != null && py != null && Math.hypot(x - px, y - py) < Math.max(thr, 8)) {
                return d;
            }
        }

        if (d.type === 'horizontal_line' && p[0]) { const dy = priceToY(p[0].price); if (dy != null && Math.abs(dy - y) < thr) return d; }
        else if (d.type === 'vertical_line' && p[0]) { const dx = timeToX(p[0].time); if (dx != null && Math.abs(dx - x) < thr) return d; }
        else if ((d.type === 'extended_line') && p.length >= 2) {
            const x1 = timeToX(p[0].time), y1 = priceToY(p[0].price), x2 = timeToX(p[1].time), y2 = priceToY(p[1].price);
            if (x1 != null && y1 != null && x2 != null && y2 != null) {
                // Infinite line distance
                const dist = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / Math.hypot(y2 - y1, x2 - x1);
                if (dist < thr) return d;
            }
        }
        else if ((d.type === 'trend_line' || d.type === 'ray' || d.type === 'price_channel') && p.length >= 2) {
            const x1 = timeToX(p[0].time), y1 = priceToY(p[0].price), x2 = timeToX(p[1].time), y2 = priceToY(p[1].price);
            if (x1 != null && y1 != null && x2 != null && y2 != null && ptSegDist(x, y, x1, y1, x2, y2) < thr) return d;
        }
        else if (d.type === 'regression_channel' && p.length >= 2) {
            const getCompTime = (t) => (typeof t === 'string' ? new Date(t).getTime() : t);
            const t0 = getCompTime(p[0].time), t1 = getCompTime(p[1].time);
            const tMin = Math.min(t0, t1), tMax = Math.max(t0, t1);
            const slice = activePriceData.filter(b => {
                const bt = getCompTime(b.time);
                return bt >= tMin && bt <= tMax;
            });
            if (slice.length >= 3) {
                const n = slice.length;
                let sx = 0, sy = 0, sxy = 0, sx2 = 0;
                slice.forEach((b, i) => { sx += i; sy += b.close; sxy += i * b.close; sx2 += i * i; });
                const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
                const intercept = (sy - slope * sx) / n;
                const sigma = Math.sqrt(slice.reduce((s, b, i) => s + (b.close - (slope * i + intercept)) ** 2, 0) / n);
                const stdMultiplier = d.stdDev || 2.0;
                const x0 = timeToX(slice[0].time), xN = timeToX(slice[n - 1].time);
                if (x0 != null && xN != null) {
                    const yMidS = priceToY(intercept), yMidE = priceToY(slope * (n - 1) + intercept);
                    const yTopS = priceToY(intercept + sigma * stdMultiplier), yTopE = priceToY(slope * (n - 1) + intercept + sigma * stdMultiplier);
                    const yBotS = priceToY(intercept - sigma * stdMultiplier), yBotE = priceToY(slope * (n - 1) + intercept - sigma * stdMultiplier);

                    if (yMidS != null && yMidE != null && ptSegDist(x, y, x0, yMidS, xN, yMidE) < thr) return d;
                    if (yTopS != null && yTopE != null && ptSegDist(x, y, x0, yTopS, xN, yTopE) < thr) return d;
                    if (yBotS != null && yBotE != null && ptSegDist(x, y, x0, yBotS, xN, yBotE) < thr) return d;

                    if (x >= Math.min(x0, xN) && x <= Math.max(x0, xN)) {
                        const t = (x - x0) / (xN - x0);
                        const curTop = yTopS + t * (yTopE - yTopS);
                        const curBot = yBotS + t * (yBotE - yBotS);
                        if (y >= Math.min(curTop, curBot) - 2 && y <= Math.max(curTop, curBot) + 2) return d;
                    }
                }
            }
        }
        else if ((d.type === 'brush' || d.type === 'polyline') && p.length >= 2) {
            for (let i = 0; i < p.length - 1; i++) {
                const x1 = timeToX(p[i].time), y1 = priceToY(p[i].price), x2 = timeToX(p[i + 1].time), y2 = priceToY(p[i + 1].price);
                if (x1 != null && y1 != null && x2 != null && y2 != null && ptSegDist(x, y, x1, y1, x2, y2) < thr) return d;
            }
        }
        else if (d.type === 'arrow' && p.length >= 2) {
            const x1 = timeToX(p[0].time), y1 = priceToY(p[0].price), x2 = timeToX(p[1].time), y2 = priceToY(p[1].price);
            if (x1 != null && y1 != null && x2 != null && y2 != null && ptSegDist(x, y, x1, y1, x2, y2) < thr) return d;
        }
        else if (d.type === 'rectangle' && p.length >= 2) {
            const rx1 = timeToX(p[0].time), ry1 = priceToY(p[0].price), rx2 = timeToX(p[1].time), ry2 = priceToY(p[1].price);
            if (rx1 != null && ry1 != null && rx2 != null && ry2 != null) {
                const mnx = Math.min(rx1, rx2), mny = Math.min(ry1, ry2), mxw = Math.abs(rx2 - rx1), mxh = Math.abs(ry2 - ry1);
                if (x >= mnx - thr && x <= mnx + mxw + thr && y >= mny - thr && y <= mny + mxh + thr &&
                    (Math.abs(x - mnx) < thr || Math.abs(x - mnx - mxw) < thr || Math.abs(y - mny) < thr || Math.abs(y - mny - mxh) < thr)) return d;
            }
        }
        else if (d.type === 'circle' && p.length >= 2) {
            const cx = timeToX(p[0].time), cy = priceToY(p[0].price), ex = timeToX(p[1].time), ey = priceToY(p[1].price);
            if (cx != null && cy != null && ex != null && ey != null) { const r = Math.hypot(ex - cx, ey - cy); if (Math.abs(Math.hypot(x - cx, y - cy) - r) < thr) return d; }
        }
        else if ((d.type === 'fib_retracement' || d.type === 'fib_extension') && p[0]) { const fy = priceToY(p[0].price); if (fy != null && Math.abs(fy - y) < thr) return d; }
        else if (d.type === 'text_label' && p[0]) {
            const tx = timeToX(p[0].time), ty = priceToY(p[0].price);
            if (tx != null && ty != null && Math.hypot(x - tx, y - ty) < 20) return d;
        }
        else if (d.type === 'price_label' && p[0]) {
            const tx = timeToX(p[0].time), ty = priceToY(p[0].price);
            if (tx != null && ty != null && Math.hypot(x - tx, y - ty) < 20) return d;
        }
        else if (d.type === 'callout' && p.length >= 2) {
            const x1 = timeToX(p[0].time), y1 = priceToY(p[0].price), x2 = timeToX(p[1].time), y2 = priceToY(p[1].price);
            if (x1 != null && y1 != null && x2 != null && y2 != null && (ptSegDist(x, y, x1, y1, x2, y2) < thr || Math.hypot(x - x2, y - y2) < 20)) return d;
        }
        else if (d.type === 'triangle' && p.length >= 3) {
            const x1 = timeToX(p[0].time), y1 = priceToY(p[0].price), x2 = timeToX(p[1].time), y2 = priceToY(p[1].price), x3 = timeToX(p[2].time), y3 = priceToY(p[2].price);
            if (x1 != null && y1 != null && x2 != null && y2 != null && x3 != null && y3 != null && (ptSegDist(x, y, x1, y1, x2, y2) < thr || ptSegDist(x, y, x2, y2, x3, y3) < thr || ptSegDist(x, y, x3, y3, x1, y1) < thr)) return d;
        }
    }
    return null;
}
function ptSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
    return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

// --- Persistence ---
async function saveDrawing(drawing) {
    if (!drawing.ticker) drawing.ticker = activeTicker;
    if (!drawing.ticker) return;

    if (drawing.type === 'regression_channel') {
        drawing.text = JSON.stringify({ stdDev: drawing.stdDev || 2.0, extendRight: !!drawing.extendRight });
    }

    const payload = {
        type: drawing.type,
        points: drawing.points,
        color: drawing.color,
        line_width: drawing.lineWidth || 1.5,
        text: drawing.text
    };

    try {
        if (drawing.id) {
            await apiCall(`/drawings/${drawing.id}`, 'PUT', payload);
        } else {
            const result = await apiCall(`/tickers/${drawing.ticker}/drawings/`, 'POST', payload);
            drawing.id = result.id;
        }
    } catch (e) {
        console.error("Failed to save drawing", e);
        alert("Errore salvataggio disegno: " + e.message);
    }
}

async function deleteDrawing(drawing) {
    if (drawing.id) {
        try {
            await apiCall(`/drawings/${drawing.id}`, 'DELETE');
        } catch (e) {
            console.error("Failed to delete drawing from DB", e);
        }
    }
    drawings = drawings.filter(d => d !== drawing);
    redrawAllDrawings();
}

async function loadDrawings(ticker) {
    if (!ticker) return;
    try {
        const dbDrawings = await apiCall(`/tickers/${ticker}/drawings/`);
        // Filter out existing drawings for this ticker to avoid duplicates
        drawings = drawings.filter(d => d.ticker !== ticker);

        const mapped = dbDrawings.map(d => {
            const out = {
                id: d.id,
                ticker: d.symbol,
                type: d.type,
                points: d.points, // Already parsed by backend schema
                color: d.color,
                lineWidth: d.line_width,
                text: d.text,
                alarms: d.alarms || []
            };
            if (out.type === 'regression_channel' && out.text) {
                try {
                    const cfg = JSON.parse(out.text);
                    if (cfg.stdDev) out.stdDev = cfg.stdDev;
                    if (cfg.extendRight !== undefined) out.extendRight = cfg.extendRight;
                } catch(e) {}
            }
            return out;
        });
        drawings.push(...mapped);
        redrawAllDrawings();
    } catch (e) {
        console.error("Failed to load drawings from API, falling back to localStorage", e);
        try { const raw = localStorage.getItem('drawings_' + ticker); if (raw) { drawings = drawings.filter(d => d.ticker !== ticker); drawings.push(...JSON.parse(raw)); redrawAllDrawings(); } } catch (err) { }
    }
}

async function migrateDrawingsToBackend() {
    if (localStorage.getItem('drawings_migrated')) return;
    const drawingKeys = Object.keys(localStorage).filter(k => k.startsWith('drawings_'));
    if (drawingKeys.length === 0) { localStorage.setItem('drawings_migrated', 'true'); return; }

    console.log("Starting drawings migration to backend...");
    for (const key of drawingKeys) {
        const symbol = key.replace('drawings_', '');
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const local = JSON.parse(raw);
                if (local.length > 0) {
                    const payload = local.map(d => ({
                        type: d.type,
                        points: d.points,
                        color: d.color,
                        line_width: d.lineWidth || 1.5,
                        text: d.text
                    }));
                    await apiCall(`/tickers/${symbol}/drawings/sync`, 'POST', payload);
                }
            }
        } catch (e) { console.error("Migration failed for " + symbol, e); }
    }
    localStorage.setItem('drawings_migrated', 'true');
    console.log("Drawing migration complete.");
}

function initDrawingTools() {
    initDrawingCanvas();
    setupDrawingToolbar();
}

const AVAILABLE_INDICATORS = [
    { id: 'volume', name: 'Volumi', category: 'overlay' },
    { id: 'sma', name: 'SMA', category: 'overlay' },
    { id: 'ema', name: 'EMA', category: 'overlay' },
    { id: 'hma', name: 'Media di Hull (HMA)', category: 'overlay' },
    { id: 'supertrend', name: 'SuperTrend', category: 'overlay' },
    { id: 'donchian', name: 'Donchian Channel', category: 'overlay' },
    { id: 'bbands', name: 'Bollinger Bands', category: 'overlay' },
    { id: 'rsi', name: 'RSI', category: 'subplot' },
    { id: 'stoch', name: 'Stocastico', category: 'subplot' },
    { id: 'macd', name: 'MACD', category: 'subplot' },
    { id: 'roc', name: 'ROC', category: 'subplot' },
    { id: 'cci', name: 'CCI', category: 'subplot' },
    { id: 'atr', name: 'ATR', category: 'subplot' },
    { id: 'bbp', name: 'Bollinger Bands %B', category: 'subplot' }
];

function renderIndicatorDropdown(filter = "") {
    const overlayGroup = document.getElementById('overlay-group');
    const subplotGroup = document.getElementById('subplot-group');
    if (!overlayGroup || !subplotGroup) return;

    overlayGroup.innerHTML = '';
    subplotGroup.innerHTML = '';

    const lowerFilter = filter.toLowerCase();
    const sorted = [...AVAILABLE_INDICATORS].sort((a, b) => a.name.localeCompare(b.name));

    sorted.forEach(ind => {
        if (!ind.name.toLowerCase().includes(lowerFilter)) return;

        const option = document.createElement('option');
        option.value = ind.id;
        option.textContent = ind.name;

        if (ind.category === 'overlay') overlayGroup.appendChild(option);
        else subplotGroup.appendChild(option);
    });
}

document.getElementById('add-indicator-select').addEventListener('change', (e) => {
    addIndicator(e.target.value);
    e.target.value = '';
});

let searchTimeout = null;
const searchInput = document.getElementById('indicator-search');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            renderIndicatorDropdown(e.target.value);
        }, 1000); // 1 second debounce
    });
}

// Initialize dropdown
renderIndicatorDropdown();

// --- Event Listeners ---
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const view = item.getAttribute('data-view');
        document.querySelectorAll('.view-container').forEach(v => v.classList.add('hidden'));
        document.getElementById(`${view}-view`).classList.remove('hidden');

        activeView = view;
        document.getElementById('view-title').textContent = item.textContent;

        // Toggle header monitoring controls
        const monGroup = document.getElementById('monitoring-controls-group');
        if (monGroup) {
            monGroup.classList.toggle('hidden', view !== 'monitoring');
        }

        if (view === 'monitoring' && mainChart) {
            resizeAllCharts();
        }

        if (view === 'lists') {
            loadIndices();
        }
        if (view === 'maintenance') {
            loadOrphans();
        }
        if (view === 'alarms') {
            renderAlarmsView();
        }
        if (view === 'portfolio') {
            initPortfolioView();
        }
    });
});

// Settings toggle
const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
const settingsBox = document.getElementById('settings-collapsible');
if (toggleSettingsBtn && settingsBox) {
    toggleSettingsBtn.addEventListener('click', () => {
        settingsBox.classList.toggle('hidden');
        toggleSettingsBtn.classList.toggle('active');
    });
}

// Tab Switching logic
document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
        const parent = tab.parentElement;
        parent.querySelectorAll('.tab-item').forEach(i => i.classList.remove('active'));
        tab.classList.add('active');

        const target = tab.getAttribute('data-tab');
        const viewContainer = parent.parentElement;
        viewContainer.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(target).classList.remove('hidden');
    });
});

let historicalData = [];
let historicalSortOrder = 'desc'; // 'asc' or 'desc'

// Global state for modular screening (moved to top)

async function loadHistoricalData(symbol) {
    if (!symbol) return;
    const body = document.getElementById('historical-data-body');
    const rangeSpan = document.getElementById('historical-range');
    body.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    if (rangeSpan) rangeSpan.textContent = '';

    try {
        const data = await apiCall(`/tickers/${symbol}/data/`);
        historicalData = data || [];
        body.innerHTML = '';

        if (historicalData.length === 0) {
            body.innerHTML = '<tr><td colspan="7">No data found in database.</td></tr>';
            return;
        }

        // Show date range
        if (rangeSpan && historicalData.length > 0) {
            // Since API returns data ordered by date ASC, we can take first and last
            const minDate = historicalData[0].date.split('T')[0];
            const maxDate = historicalData[historicalData.length - 1].date.split('T')[0];

            const formatDate = (iso) => {
                const parts = iso.split('-');
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            };
            rangeSpan.textContent = `(${formatDate(minDate)} -> ${formatDate(maxDate)})`;
        }

        renderHistoricalTable();
    } catch (err) {
        console.error("Failed to load historical data:", err);
        body.innerHTML = `<tr><td colspan="7" style="color:red">Error: ${err.message}</td></tr>`;
    }
}

function renderHistoricalTable() {
    const body = document.getElementById('historical-data-body');
    if (!body) return;
    body.innerHTML = '';

    // Sort
    const sorted = [...historicalData].sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return historicalSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    sorted.forEach(d => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${d.date.split('T')[0]}</td>
            <td>${d.open.toFixed(2)}</td>
            <td>${d.high.toFixed(2)}</td>
            <td>${d.low.toFixed(2)}</td>
            <td>${d.close.toFixed(2)}</td>
            <td>${d.adj_close.toFixed(2)}</td>
            <td>${d.volume.toLocaleString()}</td>
        `;
        body.appendChild(row);
    });

    // Update Icon
    const icon = document.getElementById('sort-order-icon');
    if (icon) icon.textContent = historicalSortOrder === 'desc' ? '▼' : '▲';
}

console.log("[script.js] Adding top-level event listeners...");
const sortDateHeader = document.getElementById('sort-date-header');
if (sortDateHeader) {
    sortDateHeader.addEventListener('click', () => {
        historicalSortOrder = historicalSortOrder === 'desc' ? 'asc' : 'desc';
        renderHistoricalTable();
    });
}

const historicalTickerSelect = document.getElementById('historical-ticker-select');
if (historicalTickerSelect) {
    historicalTickerSelect.addEventListener('change', (e) => {
        activeTicker = e.target.value;
        activeTickerName = null; // Will be fetched in updateChart
        loadHistoricalData(e.target.value);
        updateChart(e.target.value);
    });
}

const activeListSelect = document.getElementById('active-list-select');
if (activeListSelect) {
    activeListSelect.addEventListener('change', (e) => {
        console.log("[active-list-select] Change detected:", e.target.value);
        activeListId = e.target.value;
        loadListDetails(activeListId, activeView === 'monitoring');
    });
} else {
    console.error("[script.js] CRITICAL: #active-list-select not found during top-level execution!");
}

const deleteListBtn = document.getElementById('delete-list-btn');
if (deleteListBtn) {
    deleteListBtn.addEventListener('click', async () => {
        if (!activeListId) {
            alert("Please select a list to delete first.");
            return;
        }

        const select = document.getElementById('active-list-select');
        const listName = select.options[select.selectedIndex].text;

        if (!confirm(`Are you sure you want to delete the entire list "${listName}"? This cannot be undone.`)) return;

        try {
            console.log(`Sending DELETE request for list ID: ${activeListId}`);
            const res = await apiCall(`/lists/${activeListId}`, 'DELETE');
            console.log("Delete response:", res);

            // Success case
            alert(`List "${listName}" deleted successfully.`);
            activeListId = null;
            activeTicker = null;
            if (priceSeries) {
                priceSeries.setData([]);
            }
            await loadLists();
        } catch (err) {
            console.error("Failed to delete list:", err);
            alert(`Error deleting list: ${err.message}`);
        }
    });
}

document.getElementById('create-list-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('new-list-name').value;
    if (!name) return;
    const newList = await apiCall('/lists/', 'POST', { name });
    activeListId = newList.id; // Auto-select the newly created list
    document.getElementById('new-list-name').value = '';
    await loadLists();
});

document.getElementById('add-ticker-btn')?.addEventListener('click', async () => {
    const symbol = document.getElementById('add-ticker-input').value.toUpperCase().trim();
    if (!activeListId) {
        alert("Please select or create a 'Ticker List' first (using the dropdown in the top header).");
        return;
    }
    if (!symbol) return;

    const btn = document.getElementById('add-ticker-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Verifica...';
    btn.disabled = true;

    try {
        await apiCall(`/lists/${activeListId}/tickers/`, 'POST', { symbol });
        document.getElementById('add-ticker-input').value = '';
        loadLists();
    } catch (err) {
        alert(err.message || `Impossibile aggiungere il ticker '${symbol}'. Verifica il simbolo.`);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

document.getElementById('fetch-missing-names-btn')?.addEventListener('click', async () => {
    if (!activeListId || activeListId === 'all') {
        alert("Seleziona una lista specifica per cercare i nomi mancanti.");
        return;
    }

    const btn = document.getElementById('fetch-missing-names-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Ricerca in corso...';
    btn.disabled = true;

    try {
        const response = await apiCall(`/lists/${activeListId}/fetch-names`, 'POST');
        alert(response.message);
        loadLists();
    } catch (err) {
        alert("Errore durante la ricerca dei nomi: " + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

document.getElementById('import-index-btn')?.addEventListener('click', async () => {
    const indexName = document.getElementById('index-import-select').value;
    if (!activeListId) {
        alert("Please create a 'Ticker List' first (e.g., 'My Stocks') and select it from the top dropdown menu in the header.");
        return;
    }
    if (!indexName) {
        alert("Please select an index (like DAX, S&P 500, etc.) from the menu next to the Import button.");
        return;
    }

    const btn = document.getElementById('import-index-btn');
    const originalText = btn.textContent;
    btn.textContent = "Importing...";
    btn.disabled = true;

    try {
        const res = await apiCall(`/lists/${activeListId}/import-index/${encodeURIComponent(indexName)}`, 'POST');
        alert(res.message || "Import completed.");
        await loadLists();
    } catch (err) {
        console.error("Import failed:", err);
        alert("Import failed. Check console for details.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

document.getElementById('update-data-btn')?.addEventListener('click', async () => {
    // Request notification permission on user interaction
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    const isBulk = document.getElementById('bulk-apply')?.checked;
    const years = document.getElementById('extend-years')?.value || 10;
    const status = document.getElementById('update-status');

    if (isBulk) {
        if (!activeListId) {
            alert("Please select a list first.");
            return;
        }
        const tickerOptions = getListTickers();

        if (tickerOptions.length === 0) {
            alert("The selected list has no tickers.");
            return;
        }

        if (!confirm(`Update data for ALL ${tickerOptions.length} tickers in this list?`)) return;

        status.textContent = `Bulk Updating (0/${tickerOptions.length})...`;
        let count = 0;
        for (const symbol of tickerOptions) {
            try {
                await apiCall(`/tickers/${symbol}/update-data/?years=${years}`, 'POST');
                count++;
                status.textContent = `Bulk Updating (${count}/${tickerOptions.length})...`;
                if (symbol === activeTicker) updateChart(symbol);
            } catch (err) {
                console.error(`Failed to update ${symbol}:`, err);
            }
        }
        status.textContent = `Bulk Update complete! (${count} tickers)`;
        checkAndNotifyAlarms();
    } else {
        if (!activeTicker) {
            alert("Please select a ticker first.");
            return;
        }
        status.textContent = "Updating...";
        try {
            const res = await apiCall(`/tickers/${activeTicker}/update-data/?years=${years}`, 'POST');
            status.textContent = res.message || "Done";
            updateChart(activeTicker);
            checkAndNotifyAlarms();
        } catch (err) {
            status.textContent = "Update failed.";
            console.error(err);
        }
    }
});

document.getElementById('extend-history-btn').addEventListener('click', async () => {
    const isBulk = document.getElementById('bulk-apply')?.checked;
    const years = document.getElementById('extend-years').value;
    const status = document.getElementById('update-status');

    if (isBulk) {
        if (!activeListId) {
            alert("Please select a list first.");
            return;
        }
        const tickerOptions = getListTickers();

        if (tickerOptions.length === 0) {
            alert("The selected list has no tickers.");
            return;
        }

        if (!confirm(`Extend history by ${years} years for ALL ${tickerOptions.length} tickers in this list?`)) return;

        status.textContent = `Bulk Extending (0/${tickerOptions.length})...`;
        let count = 0;
        for (const symbol of tickerOptions) {
            try {
                await apiCall(`/tickers/${symbol}/extend-history/${years}`, 'POST');
                count++;
                status.textContent = `Bulk Extending (${count}/${tickerOptions.length})...`;
                if (symbol === activeTicker) updateChart(symbol);
            } catch (err) {
                console.error(`Failed to extend ${symbol}:`, err);
            }
        }
        status.textContent = `Bulk Extension complete! (${count} tickers)`;
    } else {
        if (!activeTicker) {
            alert("Please select a ticker first.");
            return;
        }
        status.textContent = `Extending (${years}y)...`;
        try {
            const res = await apiCall(`/tickers/${activeTicker}/extend-history/${years}`, 'POST');
            status.textContent = res.message || "History extended!";
            updateChart(activeTicker);
        } catch (err) {
            status.textContent = "Extension failed.";
            console.error(err);
        }
    }
});

document.getElementById('delete-ticker-data-btn').addEventListener('click', async () => {
    const isBulk = document.getElementById('bulk-apply')?.checked;
    const status = document.getElementById('update-status');

    if (isBulk) {
        if (!activeListId) {
            alert("Please select a list first.");
            return;
        }
        const tickerOptions = getListTickers();

        if (tickerOptions.length === 0) {
            alert("The selected list has no tickers.");
            return;
        }

        if (!confirm(`DELETE ALL pricing data for the ${tickerOptions.length} tickers in this list? This cannot be undone.`)) return;

        status.textContent = `Bulk Deleting (0/${tickerOptions.length})...`;
        let count = 0;
        for (const symbol of tickerOptions) {
            try {
                await apiCall(`/tickers/${symbol}/data/`, 'DELETE');
                count++;
                status.textContent = `Bulk Deleting (${count}/${tickerOptions.length})...`;
                if (symbol === activeTicker) {
                    if (priceSeries) priceSeries.setData([]);
                }
            } catch (err) {
                console.error(`Failed to delete data for ${symbol}:`, err);
            }
        }
        status.textContent = `Bulk Delete complete! (${count} tickers)`;
    } else {
        if (!activeTicker) {
            alert("Please select a ticker first.");
            return;
        }
        if (!confirm(`Are you sure you want to delete ALL pricing data for ${activeTicker}?`)) return;

        status.textContent = "Deleting...";
        try {
            const res = await apiCall(`/tickers/${activeTicker}/data/`, 'DELETE');
            status.textContent = res.message || "Data deleted.";
            if (priceSeries) priceSeries.setData([]);
            console.log(`Deleted data for ${activeTicker}`);
        } catch (err) {
            status.textContent = "Delete failed.";
            console.error(err);
        }
    }
});

console.log("[script.js] Registering listener for delete-data-from-date-btn");
document.getElementById('delete-data-from-date-btn')?.addEventListener('click', async () => {
    console.log("[script.js] delete-data-from-date-btn clicked");

    const startDate = document.getElementById('delete-start-date').value;
    if (!startDate) {
        alert("Per favore seleziona una data.");
        return;
    }

    const isBulk = document.getElementById('bulk-apply')?.checked;
    const status = document.getElementById('update-status');
    console.log(`[script.js] isBulk: ${isBulk}, startDate: ${startDate}, activeTicker: ${activeTicker}, activeListId: ${activeListId}`);

    if (isBulk) {
        if (!activeListId) {
            alert("Seleziona prima una lista.");
            return;
        }
        const tickerOptions = getListTickers();

        if (tickerOptions.length === 0) {
            alert("La lista selezionata non ha ticker.");
            return;
        }

        if (!confirm(`Cancellare i dati dal ${startDate} in poi per i ${tickerOptions.length} ticker in questa lista?`)) return;

        status.textContent = `Pulisci (0/${tickerOptions.length})...`;
        let count = 0;
        for (const symbol of tickerOptions) {
            try {
                await apiCall(`/tickers/${symbol}/data-from/?date=${startDate}`, 'DELETE');
                count++;
                status.textContent = `Pulisci (${count}/${tickerOptions.length})...`;
                if (symbol === activeTicker) {
                    // Refresh chart if the active ticker was modified
                    document.getElementById('refresh-chart-btn').click();
                }
            } catch (err) {
                console.error(`Errore nella pulizia di ${symbol}:`, err);
            }
        }
        status.textContent = `Pulizia completata! (${count} ticker)`;
    } else {
        if (!activeTicker) {
            alert("Seleziona prima un ticker.");
            return;
        }
        if (!confirm(`Sei sicuro di voler cancellare i dati di ${activeTicker} dal ${startDate} in poi?`)) return;

        status.textContent = "Pulizia in corso...";
        try {
            const res = await apiCall(`/tickers/${activeTicker}/data-from/?date=${startDate}`, 'DELETE');
            status.textContent = res.message || "Dati cancellati.";
            document.getElementById('refresh-chart-btn').click();
        } catch (err) {
            status.textContent = "Pulizia fallita.";
            console.error(err);
        }
    }
});

document.getElementById('refresh-chart-btn').addEventListener('click', () => {
    if (activeTicker) {
        updateChart(activeTicker);
    } else {
        alert("Select a ticker first.");
    }
});

document.getElementById('upload-csv-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('csv-upload-input');

    if (!activeListId) {
        alert("Per favore, seleziona una lista prima di caricare il CSV.");
        return;
    }

    if (!fileInput.files.length) {
        alert("Per favore, seleziona un file CSV da caricare.");
        return;
    }

    const btn = document.getElementById('upload-csv-btn');
    const originalText = btn.textContent;
    btn.textContent = "Caricamento...";
    btn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        const result = await apiCall(`/lists/${activeListId}/upload-csv/`, 'POST', formData);
        alert(result.message || "CSV caricato con successo!");
        await loadLists();
        // Se siamo nella vista liste, aggiorniamo il dettaglio per mostrare i ticker appena aggiunti
        if (activeView === 'lists') {
            await loadListDetails(activeListId);
        }
    } catch (err) {
        alert("Errore durante il caricamento del CSV: " + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
        fileInput.value = ''; // Reset input
    }
});

document.getElementById('clear-list-btn').addEventListener('click', async () => {
    if (!activeListId) {
        alert("Please select a list first.");
        return;
    }
    const listName = document.getElementById('clear-list-btn').dataset.listName || "this list";
    if (!confirm(`Are you sure you want to remove ALL tickers from "${listName}"?`)) return;

    try {
        const res = await apiCall(`/lists/${activeListId}/clear-tickers`, 'DELETE');
        alert(res.message || "List cleared.");
        await loadLists();
    } catch (err) {
        console.error("Failed to clear list:", err);
        alert("Error: could not clear list.");
    }
});

document.getElementById('export-csv-btn').addEventListener('click', async () => {
    if (!activeListId) return;

    const lists = await apiCall('/lists/');
    const list = lists.find(l => l.id == activeListId);
    if (!list || !list.tickers.length) {
        alert("The list is empty.");
        return;
    }

    const csvContent = "yahoo_ticker;name\n" + list.tickers.map(t => `${t.symbol};${t.name || ""}`).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${list.name}_tickers.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

async function showTickerDetails(symbol) {
    // Switch view to Grafico (monitoring)
    const navItem = document.querySelector('.nav-item[data-view="monitoring"]');
    if (navItem) navItem.click();

    // Sync the global state
    activeTicker = symbol;
    activeTickerName = null;

    const slotSelect = document.querySelector(`.chart-slot-ticker[data-slot="${activeChartIndex}"]`);
    if (slotSelect && symbol) {
        let exists = false;
        for (let i = 0; i < slotSelect.options.length; i++) {
            if (slotSelect.options[i].value === symbol) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = symbol;
            opt.textContent = symbol;
            slotSelect.appendChild(opt);
        }
        slotSelect.value = symbol;
    }

    await updateChart(symbol);
}

// --- Screening Sheets Management ---

async function loadScreeningSheets() {
    try {
        screeningSheets = await apiCall('/screening/sheets/');
        renderScreeningTabs();

        const baseSheet = screeningSheets.find(s => s.name === 'base');
        const rocSheet = screeningSheets.find(s => s.name === 'roc');

        if (!activeScreeningSheetId) {
            switchScreeningSheet(baseSheet ? baseSheet.id : 'base');
        }
    } catch (err) {
        console.error("Failed to load screening sheets:", err);
    }
}

function renderScreeningTabs() {
    const container = document.getElementById('screening-tabs');
    if (!container) return;

    const baseSheet = screeningSheets.find(s => s.name === 'base');
    const rocSheet = screeningSheets.find(s => s.name === 'roc');

    container.innerHTML = `
        <div class="tab-item ${activeScreeningSheetId == (baseSheet ? baseSheet.id : 'base') ? 'active' : ''}" data-tab="screening-base-sheet" onclick="switchScreeningSheet(${baseSheet ? baseSheet.id : "'base'"})">Base</div>
        <div class="tab-item ${activeScreeningSheetId == (rocSheet ? rocSheet.id : 'roc') ? 'active' : ''}" data-tab="screening-roc-sheet" onclick="switchScreeningSheet(${rocSheet ? rocSheet.id : "'roc'"})">ROC Analysis</div>
        <div class="tab-item ${activeScreeningSheetId == 'fundamentals' ? 'active' : ''}" data-tab="screening-fundamental-sheet" onclick="switchScreeningSheet('fundamentals')">Fundamentals</div>
    `;

    screeningSheets.forEach(sheet => {
        if (sheet.name === 'base' || sheet.name === 'roc') return;
        const tab = document.createElement('div');
        tab.className = `tab-item ${activeScreeningSheetId == sheet.id ? 'active' : ''}`;
        tab.textContent = sheet.name;
        tab.onclick = () => switchScreeningSheet(sheet.id);
        container.appendChild(tab);
    });
}

async function createNewScreeningSheet() {
    const name = prompt("Nome del nuovo foglio di screening:");
    if (!name) return;
    try {
        const newSheet = await apiCall('/screening/sheets/', 'POST', { name });
        await loadScreeningSheets();
        switchScreeningSheet(newSheet.id);
    } catch (err) {
        alert("Errore nella creazione: " + err.message);
    }
}

async function deleteActiveScreeningSheet() {
    if (!activeScreeningSheetId || typeof activeScreeningSheetId === 'string') return;
    if (!confirm("Sei sicuro di voler eliminare questo foglio di screening?")) return;
    try {
        await apiCall(`/screening/sheets/${activeScreeningSheetId}`, 'DELETE');
        activeScreeningSheetId = 'base';
        await loadScreeningSheets();
        switchScreeningSheet('base');
    } catch (err) {
        alert("Errore nell'eliminazione: " + err.message);
    }
}

function switchScreeningSheet(sheetId) {
    activeScreeningSheetId = sheetId;

    // UI visibility
    document.querySelectorAll('#screening-view .tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('#screening-view .tabs .tab-item').forEach(t => t.classList.remove('active'));

    const colMgmt = document.getElementById('column-management-card');
    const deleteBtn = document.getElementById('delete-sheet-btn');

    // Always show column management if we have a sheet object (hardcoded or dynamic)
    colMgmt.classList.remove('hidden');

    const sheet = screeningSheets.find(s => s.id == sheetId);
    const isBase = sheet && sheet.name === 'base' || sheetId === 'base';
    const isRoc = sheet && sheet.name === 'roc' || sheetId === 'roc';

    if (isBase) {
        document.getElementById('screening-base-sheet').classList.remove('hidden');
        deleteBtn.style.display = 'none';
        document.getElementById('active-sheet-name').textContent = "Base";
        renderActiveColumnsUIForBaseROC('base');
        renderBaseScreeningTable(sheet);
        // Ensure activeScreeningSheetId is the numeric ID if available
        if (sheetId === 'base' && sheet) activeScreeningSheetId = sheet.id;
    } else if (isRoc) {
        document.getElementById('screening-roc-sheet').classList.remove('hidden');
        deleteBtn.style.display = 'none';
        document.getElementById('active-sheet-name').textContent = "ROC Analysis";
        renderActiveColumnsUIForBaseROC('roc');
        renderROCAnalysisUI();
        // Ensure activeScreeningSheetId is the numeric ID if available
        if (sheetId === 'roc' && sheet) activeScreeningSheetId = sheet.id;
    } else if (sheetId === 'fundamentals') {
        document.getElementById('screening-fundamental-sheet').classList.remove('hidden');
        deleteBtn.style.display = 'none';
        document.getElementById('active-sheet-name').textContent = "Screener Fondamentali";
        colMgmt.classList.add('hidden'); // No indicator columns for fundamentals tab
    } else {
        if (sheet) {
            document.getElementById('screening-custom-sheet').classList.remove('hidden');
            deleteBtn.style.display = 'block';
            document.getElementById('active-sheet-name').textContent = sheet.name;
            renderActiveColumnsUI(sheet);
            renderDynamicScreeningTable(sheet);
        }
    }

    // Load results from cache for this sheet if they exist
    lastScreeningResults = screeningResultsCache[activeScreeningSheetId] || [];
    if (isBase) {
        renderBaseScreeningTable(sheet);
    } else if (isRoc) {
        renderROCAnalysisUI();
    } else if (sheetId === 'fundamentals') {
        // Results loaded via "Carica Fondamentali" button in the tab itself
    } else if (sheet) {
        renderDynamicScreeningTable(sheet);
    }

    updateSaveListButtonsVisibility();

    renderScreeningTabs();
}

function renderActiveColumnsUIForBaseROC(sheetName) {
    const sheet = screeningSheets.find(s => s.name === sheetName);
    if (sheet) {
        renderActiveColumnsUI(sheet);
    } else {
        document.getElementById('active-columns').innerHTML = '<p style="color:var(--text-secondary); font-size:0.8em">Nessuna colonna aggiuntiva configurata.</p>';
    }
}

async function addColumnToSheet(type) {
    let sheetId = activeScreeningSheetId;

    // Resolve numeric ID for system sheets if currently identified by name
    if (sheetId === 'base' || sheetId === 'roc') {
        const sheet = screeningSheets.find(s => s.name === sheetId);
        if (sheet) sheetId = sheet.id;
    }

    if (!sheetId || typeof sheetId === 'string') {
        alert("Errore: Impossibile aggiungere colonne a questo foglio (ID non valido).");
        return;
    }

    openIndicatorModal(type, null, true);
}

function editScreeningColumn(type, id) {
    openIndicatorModal(type, null, true, id);
}

async function removeColumn(columnId) {
    try {
        await apiCall(`/screening/columns/${columnId}`, 'DELETE');
        await loadScreeningSheets();
        const sheet = screeningSheets.find(s => s.id == activeScreeningSheetId);
        renderActiveColumnsUI(sheet);
    } catch (err) {
        alert("Errore nella rimozione colonna: " + err.message);
    }
}

function renderActiveColumnsUI(sheet) {
    const container = document.getElementById('active-columns');
    if (!container) return;
    container.innerHTML = '';

    sheet.columns.forEach(col => {
        const params = JSON.parse(col.parameters);
        const tag = document.createElement('div');
        tag.className = 'indicator-tag';
        tag.style.borderLeft = `4px solid var(--accent-color)`;
        tag.innerHTML =
            `<span>${col.indicator_type.toUpperCase()}(${Object.values(params).join(',')}) [${col.timeframe}]</span> ` +
            `<span class="tag-edit" title="Modifica" style="cursor:pointer; margin-left:8px;" onclick="editScreeningColumn('${col.indicator_type}', ${col.id})">✎</span>` +
            `<span class="tag-remove" title="Rimuovi" onclick="removeColumn(${col.id})">×</span>`;
        container.appendChild(tag);
    });
}

document.querySelectorAll('.run-screening-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        if (btn.classList.contains('dynamic-run')) return; // Handled by runDynamicScreening

        if (!activeListId) {
            alert("Please select a list first.");
            return;
        }

        const p1 = parseInt(document.getElementById('roc-p1').value) || 20;
        const p2 = parseInt(document.getElementById('roc-p2').value) || 60;
        const p3 = parseInt(document.getElementById('roc-p3').value) || 120;
        const p4 = parseInt(document.getElementById('roc-p4').value) || 240;

        // Update headers for ROC sheet
        document.getElementById('roc-h1').childNodes[0].textContent = `ROC (${p1}) `;
        document.getElementById('roc-h2').childNodes[0].textContent = `ROC (${p2}) `;
        document.getElementById('roc-h3').childNodes[0].textContent = `ROC (${p3}) `;
        document.getElementById('roc-h4').childNodes[0].textContent = `ROC (${p4}) `;

        const originalText = btn.textContent;
        btn.textContent = "Running...";
        btn.disabled = true;

        try {
            const periodList = [1, p1, p2, p3, p4];
            console.log(`DEBUG: Running modular screening for activeListId=${activeListId}, subUniverseSymbols count=${subUniverseSymbols ? subUniverseSymbols.length : 'null'}`);
            let results = await apiCall('/screening/run', 'POST', {
                list_id: activeListId === 'all' ? 0 : parseInt(activeListId),
                roc_periods: periodList,
                symbols: subUniverseSymbols
            });

            // Handle additional columns for "base" or "roc" sheet
            const currentSheet = screeningSheets.find(s => s.id == activeScreeningSheetId);
            if (currentSheet && currentSheet.columns.length > 0) {
                const dynamicCols = currentSheet.columns.map(c => ({
                    indicator_type: c.indicator_type,
                    parameters: c.parameters
                }));
                const dynamicRes = await apiCall('/screening/run-dynamic', 'POST', {
                    list_id: activeListId === 'all' ? 0 : parseInt(activeListId),
                    columns: dynamicCols,
                    symbols: subUniverseSymbols
                });

                // Merge dynamic results into the main results by symbol
                const dynMap = new Map(dynamicRes.map(r => [r.symbol, r.data]));
                results = results.map(r => ({
                    ...r,
                    data: { ...r.data, ...(dynMap.get(r.symbol) || {}) }
                }));
            }

            screeningResultsCache[activeScreeningSheetId] = results;
            lastScreeningResults = results;
            renderBaseScreeningTable(currentSheet);
            renderROCAnalysisUI();
            updateSaveListButtonsVisibility();
        } catch (err) {
            console.error("Screening failed:", err);
            alert("Screening failed.");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
});

async function runDynamicScreening(btn) {
    if (!activeListId) {
        alert("Seleziona una lista prima.");
        return;
    }
    const sheet = screeningSheets.find(s => s.id == activeScreeningSheetId);
    if (!sheet || !sheet.columns.length) {
        alert("Aggiungi almeno una colonna a questo foglio prima.");
        return;
    }

    const originalText = btn.textContent;
    btn.textContent = "In esecuzione...";
    btn.disabled = true;

    try {
        const columns = sheet.columns.map(c => ({
            indicator_type: c.indicator_type,
            parameters: c.parameters, // It's already a JSON string in the DB/object
            timeframe: c.timeframe || 'D'
        }));

        const results = await apiCall('/screening/run-dynamic', 'POST', {
            list_id: activeListId === 'all' ? 0 : parseInt(activeListId),
            columns: columns,
            symbols: subUniverseSymbols
        });

        screeningResultsCache[activeScreeningSheetId] = results;
        renderDynamicScreeningTable(sheet, results);
        updateSaveListButtonsVisibility();
    } catch (err) {
        console.error("Dynamic screening failed:", err);
        alert("Errore nello screening dinamico.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function getColumnKey(col) {
    try {
        const params = JSON.parse(col.parameters);
        const paramStr = Object.entries(params).map(([k, v]) => `${k}${v}`).join('_').toLowerCase();
        const baseKey = col.indicator_type.toLowerCase();
        const timeframe = col.timeframe || 'D';
        return paramStr ? `${baseKey}_${paramStr}_${timeframe}` : `${baseKey}_${timeframe}`;
    } catch (e) {
        return col.indicator_type.toLowerCase();
    }
}

function renderDynamicScreeningTable(sheet, results) {
    if (results) lastScreeningResults = results;
    if (!lastScreeningResults.length) return;

    const head = document.getElementById('dynamic-screening-head');
    const table = document.getElementById('dynamic-screening-table');
    if (!head || !table) return;

    head.innerHTML = `
        <th data-sort="symbol" style="cursor:pointer">Ticker <span class="sort-icon">↕</span></th>
        <th data-sort="name" style="cursor:pointer">Nome <span class="sort-icon">↕</span></th>
        <th data-sort="last_price" style="cursor:pointer">Prezzo <span class="sort-icon">↕</span></th>
        <th data-sort="last_date" style="cursor:pointer">Data <span class="sort-icon">↕</span></th>
    `;

    sheet.columns.forEach(col => {
        const key = getColumnKey(col);
        const params = JSON.parse(col.parameters);
        const th = document.createElement('th');
        th.setAttribute('data-sort', key);
        th.style.cursor = 'pointer';

        // Check if it's a Moving Average to show a richer header
        const isMA = ['sma', 'ema', 'wma'].includes(col.indicator_type.toLowerCase());
        const headerTitle = col.indicator_type.toUpperCase();
        const paramVal = Object.values(params).join(',');

        th.innerHTML = `${headerTitle}(${paramVal}) [${col.timeframe || 'D'}] <span class="sort-icon">↕</span>`;
        if (isMA) {
            th.title = "Mostra: Valore, Distanza % e Giorni Trend";
        }
        head.appendChild(th);
    });

    let filterRow = table.querySelector('.filter-row');
    if (!filterRow) {
        filterRow = document.createElement('tr');
        filterRow.className = 'filter-row';
        head.parentElement.appendChild(filterRow);
    }
    filterRow.innerHTML = '<th></th><th></th><th></th><th></th>';
    sheet.columns.forEach(col => {
        const key = getColumnKey(col);
        const isMA = ['sma', 'ema', 'wma'].includes(col.indicator_type.toLowerCase());
        const cfg = dynamicFilters[key] || { min: -Infinity, max: Infinity };
        const th = document.createElement('th');

        let filterHtml = `
            <div class="range-filter">
                <input type="number" step="0.1" placeholder="${isMA ? 'Dist Min' : 'Min'}" class="dynamic-filter" data-col="${key}" data-type="min" value="${cfg.min === -Infinity ? '' : cfg.min}">
                <input type="number" step="0.1" placeholder="${isMA ? 'Dist Max' : 'Max'}" class="dynamic-filter" data-col="${key}" data-type="max" value="${cfg.max === Infinity ? '' : cfg.max}">
            </div>`;

        if (isMA) {
            const daysKey = `${key}_days_filter`;
            const daysCfg = dynamicFilters[daysKey] || { min: -Infinity, max: Infinity };
            filterHtml += `
                <div class="range-filter" style="margin-top:5px">
                    <input type="number" step="1" placeholder="Days Min" class="dynamic-filter" data-col="${daysKey}" data-type="min" value="${daysCfg.min === -Infinity ? '' : daysCfg.min}">
                    <input type="number" step="1" placeholder="Days Max" class="dynamic-filter" data-col="${daysKey}" data-type="max" value="${daysCfg.max === Infinity ? '' : daysCfg.max}">
                </div>`;
        }

        th.innerHTML = filterHtml;
        filterRow.appendChild(th);
    });

    head.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            screeningSort.order = (screeningSort.column === col && screeningSort.order === 'asc') ? 'desc' : 'asc';
            screeningSort.column = col;
            updateDynamicScreeningUI(sheet);
        });
    });

    filterRow.querySelectorAll('.dynamic-filter').forEach(input => {
        input.addEventListener('input', () => {
            const col = input.getAttribute('data-col');
            const type = input.getAttribute('data-type');
            if (!dynamicFilters[col]) dynamicFilters[col] = { min: -Infinity, max: Infinity };
            const val = parseFloat(input.value);
            dynamicFilters[col][type] = isNaN(val) ? (type === 'min' ? -Infinity : Infinity) : val;
            updateDynamicScreeningUI(sheet);
        });
    });

    updateDynamicScreeningUI(sheet);
}

function updateDynamicScreeningUI(sheet) {
    const body = document.getElementById('dynamic-screening-body');
    if (!body) return;

    let filtered = lastScreeningResults.filter(res => {
        for (const [col, cfg] of Object.entries(dynamicFilters)) {
            // Check if it's a "Days" filter for an MA
            if (col.endsWith('_days_filter')) {
                const baseKey = col.replace('_days_filter', '');
                const val = res.data[`${baseKey}_days`];
                if (val !== undefined && val !== null) {
                    const absVal = Math.abs(val);
                    if (absVal < cfg.min || absVal > cfg.max) return false;
                }
                continue;
            }

            // Check if this column is an MA to apply filter on distance
            const colObj = sheet.columns.find(c => getColumnKey(c) === col);
            const isMA = colObj && ['sma', 'ema', 'wma'].includes(colObj.indicator_type.toLowerCase());

            const targetKey = isMA ? `${col}_dist` : col;
            const val = res.data[targetKey];
            if (val !== undefined && val !== null && (val < cfg.min || val > cfg.max)) return false;
        }
        return true;
    });
    lastFilteredSymbols = filtered.map(res => res.symbol);

    const rowCountElem = document.getElementById('dynamic-row-count');
    if (rowCountElem) rowCountElem.textContent = `${filtered.length} tickers`;

    filtered.sort((a, b) => {
        let valA, valB;
        if (screeningSort.column === 'symbol') { valA = a.symbol; valB = b.symbol; }
        else if (screeningSort.column === 'name') { valA = a.name || ''; valB = b.name || ''; }
        else if (screeningSort.column === 'last_price') { valA = a.last_price; valB = b.last_price; }
        else if (screeningSort.column === 'last_date') { valA = a.last_date; valB = b.last_date; }
        else { valA = a.data[screeningSort.column] || 0; valB = b.data[screeningSort.column] || 0; }
        return (valA < valB ? -1 : valA > valB ? 1 : 0) * (screeningSort.order === 'asc' ? 1 : -1);
    });

    body.innerHTML = '';
    filtered.forEach(res => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="cursor:pointer; color:var(--accent-color)" onclick="showTickerDetails('${res.symbol}')">${res.symbol}</td>
            <td style="font-size:0.85em; color:var(--text-secondary)">${res.name || '-'}</td>
            <td>${res.last_price.toFixed(2)}</td>
            <td>${res.last_date}</td>
        `;
        sheet.columns.forEach(col => {
            const key = getColumnKey(col);
            const val = res.data[key];
            const isMA = ['sma', 'ema', 'wma'].includes(col.indicator_type.toLowerCase());

            if (isMA && val !== null && val !== undefined) {
                const dist = res.data[`${key}_dist`];
                const days = res.data[`${key}_days`];

                const distColor = dist >= 0 ? 'var(--success-color, #2ea043)' : 'var(--danger-color, #da3633)';
                const distSign = dist >= 0 ? '+' : '';

                row.innerHTML += `
                    <td>
                        <div style="font-weight:bold">${val.toFixed(2)}</div>
                        <div style="font-size:0.85em; color:${distColor}">
                            ${distSign}${dist.toFixed(2)}% (${Math.abs(days)}d ${days >= 0 ? '↑' : '↓'})
                        </div>
                    </td>`;
            } else {
                row.innerHTML += `<td>${(val !== null && val !== undefined) ? (typeof val === 'number' ? val.toFixed(2) : val) : '-'}</td>`;
            }
        });
        body.appendChild(row);
    });

    document.querySelectorAll('#dynamic-screening-head th .sort-icon').forEach(icon => {
        const th = icon.parentElement;
        icon.textContent = th.getAttribute('data-sort') === screeningSort.column ? (screeningSort.order === 'asc' ? '↑' : '↓') : '↕';
        icon.style.opacity = th.getAttribute('data-sort') === screeningSort.column ? '1' : '0.5';
    });
}

function renderROCAnalysisUI() {
    if (!lastScreeningResults.length) return;

    const p1 = parseInt(document.getElementById('roc-p1').value) || 20;
    const p2 = parseInt(document.getElementById('roc-p2').value) || 60;
    const p3 = parseInt(document.getElementById('roc-p3').value) || 120;
    const p4 = parseInt(document.getElementById('roc-p4').value) || 240;

    const currentSheet = screeningSheets.find(s => s.id == activeScreeningSheetId);
    const table = document.getElementById('roc-analysis-table');
    const head = document.getElementById('screening-roc-head');
    if (!table || !head) return;

    while (head.cells.length > 7) head.deleteCell(-1);
    const filterRow = table.querySelector('.filter-row');
    while (filterRow.cells.length > 7) filterRow.deleteCell(-1);

    if (currentSheet) {
        currentSheet.columns.forEach(col => {
            const key = getColumnKey(col);
            const params = JSON.parse(col.parameters);
            const th = document.createElement('th');
            th.setAttribute('data-sort', key);
            th.style.cursor = 'pointer';
            th.innerHTML = `${col.indicator_type.toUpperCase()}(${Object.values(params).join(',')}) [${col.timeframe || 'D'}] <span class="sort-icon">↕</span>`;
            head.appendChild(th);

            const isMA = ['sma', 'ema', 'wma'].includes(col.indicator_type.toLowerCase());
            const cfg = dynamicFilters[key] || { min: -Infinity, max: Infinity };
            const fth = document.createElement('th');

            let filterHtml = `
                <div class="range-filter">
                    <input type="number" step="0.1" placeholder="${isMA ? 'Dist Min' : 'Min'}" class="dynamic-filter" data-col="${key}" data-type="min" value="${cfg.min === -Infinity ? '' : cfg.min}">
                    <input type="number" step="0.1" placeholder="${isMA ? 'Dist Max' : 'Max'}" class="dynamic-filter" data-col="${key}" data-type="max" value="${cfg.max === Infinity ? '' : cfg.max}">
                </div>`;

            if (isMA) {
                const daysKey = `${key}_days_filter`;
                const daysCfg = dynamicFilters[daysKey] || { min: -Infinity, max: Infinity };
                filterHtml += `
                    <div class="range-filter" style="margin-top:5px">
                        <input type="number" step="1" placeholder="Days Min" class="dynamic-filter" data-col="${daysKey}" data-type="min" value="${daysCfg.min === -Infinity ? '' : daysCfg.min}">
                        <input type="number" step="1" placeholder="Days Max" class="dynamic-filter" data-col="${daysKey}" data-type="max" value="${daysCfg.max === Infinity ? '' : daysCfg.max}">
                    </div>`;
            }
            fth.innerHTML = filterHtml;
            filterRow.appendChild(fth);
        });
    }

    const rocFilters = {};
    // Include 1-day ROC (p0)
    ['p0', 'p1', 'p2', 'p3', 'p4'].forEach(pKey => {
        const inputMin = document.querySelector(`.roc-filter-min[data-roc="${pKey}"]`);
        const inputMax = document.querySelector(`.roc-filter-max[data-roc="${pKey}"]`);
        const minVal = inputMin ? parseFloat(inputMin.value) : NaN;
        const maxVal = inputMax ? parseFloat(inputMax.value) : NaN;
        rocFilters[pKey] = { min: isNaN(minVal) ? -Infinity : minVal, max: isNaN(maxVal) ? Infinity : maxVal };
    });

    let filtered = lastScreeningResults.filter(res => {
        const v0 = res.data[`roc_1`] || 0, v1 = res.data[`roc_${p1}`] || 0, v2 = res.data[`roc_${p2}`] || 0, v3 = res.data[`roc_${p3}`] || 0, v4 = res.data[`roc_${p4}`] || 0;
        if (v0 < rocFilters.p0.min || v0 > rocFilters.p0.max || v1 < rocFilters.p1.min || v1 > rocFilters.p1.max ||
            v2 < rocFilters.p2.min || v2 > rocFilters.p2.max || v3 < rocFilters.p3.min || v3 > rocFilters.p3.max ||
            v4 < rocFilters.p4.min || v4 > rocFilters.p4.max) return false;

        for (const [filterCol, filterCfg] of Object.entries(dynamicFilters)) {
            // Check if it's a "Days" filter for an MA
            if (filterCol.endsWith('_days_filter')) {
                const baseKey = filterCol.replace('_days_filter', '');
                const daysVal = res.data[`${baseKey}_days`];
                if (daysVal !== undefined && daysVal !== null) {
                    const absDaysVal = Math.abs(daysVal);
                    if (absDaysVal < filterCfg.min || absDaysVal > filterCfg.max) return false;
                }
                continue;
            }

            // Check if this column is an MA to apply filter on distance
            const colObj = currentSheet.columns.find(c => getColumnKey(c) === filterCol);
            const isMA = colObj && ['sma', 'ema', 'wma'].includes(colObj.indicator_type.toLowerCase());

            const targetKey = isMA ? `${filterCol}_dist` : filterCol;
            const resVal = res.data[targetKey];
            if (resVal !== undefined && resVal !== null && (resVal < filterCfg.min || resVal > filterCfg.max)) return false;
        }
        return true;
    });
    lastFilteredSymbols = filtered.map(res => res.symbol);

    const rowCountElem = document.getElementById('roc-row-count');
    if (rowCountElem) rowCountElem.textContent = `${filtered.length} tickers`;

    filtered.sort((a, b) => {
        let valA, valB;
        if (screeningSort.column === 'symbol') { valA = a.symbol; valB = b.symbol; }
        else if (screeningSort.column === 'name') { valA = a.name || ''; valB = b.name || ''; }
        else if (screeningSort.column === 'roc_1') { valA = a.data['roc_1'] || 0; valB = b.data['roc_1'] || 0; }
        else if (screeningSort.column.startsWith('roc_p')) {
            const periodMap = { roc_p1: p1, roc_p2: p2, roc_p3: p3, roc_p4: p4 };
            const p = periodMap[screeningSort.column];
            valA = a.data[`roc_${p}`] || 0; valB = b.data[`roc_${p}`] || 0;
        } else { valA = a.data[screeningSort.column] || 0; valB = b.data[screeningSort.column] || 0; }
        return (valA < valB ? -1 : valA > valB ? 1 : 0) * (screeningSort.order === 'asc' ? 1 : -1);
    });

    const body = document.getElementById('screening-roc-body');
    body.innerHTML = '';
    filtered.forEach(res => {
        const rRow = document.createElement('tr');
        const v = [res.data[`roc_1`] || 0, res.data[`roc_${p1}`] || 0, res.data[`roc_${p2}`] || 0, res.data[`roc_${p3}`] || 0, res.data[`roc_${p4}`] || 0];
        const cl = v.map(x => x > 0 ? 'status-positive' : x < 0 ? 'status-negative' : 'status-neutral');
        rRow.innerHTML = `<td style="cursor:pointer; color:var(--accent-color)" onclick="showTickerDetails('${res.symbol}')">${res.symbol}</td>
            <td style="font-size:0.85em; color:var(--text-secondary)">${res.name || '-'}</td>
            ${v.map((x, i) => `<td class="${cl[i]}">${x.toFixed(2)}%</td>`).join('')}`;
        if (currentSheet) {
            currentSheet.columns.forEach(col => {
                const key = getColumnKey(col);
                const val = res.data[key];
                const isMA = ['sma', 'ema', 'wma'].includes(col.indicator_type.toLowerCase());

                if (isMA && val !== null && val !== undefined) {
                    const dist = res.data[`${key}_dist`];
                    const days = res.data[`${key}_days`];

                    const distColor = dist >= 0 ? 'var(--success-color, #2ea043)' : 'var(--danger-color, #da3633)';
                    const distSign = dist >= 0 ? '+' : '';

                    rRow.innerHTML += `
                        <td>
                            <div style="font-weight:bold">${val.toFixed(2)}</div>
                            <div style="font-size:0.85em; color:${distColor}">
                                ${distSign}${dist.toFixed(2)}% (${Math.abs(days)}d ${days >= 0 ? '↑' : '↓'})
                            </div>
                        </td>`;
                } else {
                    rRow.innerHTML += `<td>${(val !== null && val !== undefined) ? (typeof val === 'number' ? val.toFixed(2) : val) : '-'}</td>`;
                }
            });
        }
        body.appendChild(rRow);
    });

    document.querySelectorAll('#screening-roc-head th[data-sort]').forEach(th => {
        if (!th.hasAttribute('data-listened')) {
            th.setAttribute('data-listened', 'true');
            th.addEventListener('click', () => {
                const col = th.getAttribute('data-sort');
                screeningSort.order = (screeningSort.column === col && screeningSort.order === 'asc') ? 'desc' : 'asc';
                screeningSort.column = col;
                renderROCAnalysisUI();
            });
        }
    });

    filterRow.querySelectorAll('.dynamic-filter').forEach(input => {
        if (!input.hasAttribute('data-listened')) {
            input.setAttribute('data-listened', 'true');
            input.addEventListener('input', () => {
                const col = input.getAttribute('data-col'), type = input.getAttribute('data-type');
                if (!dynamicFilters[col]) dynamicFilters[col] = { min: -Infinity, max: Infinity };
                const val = parseFloat(input.value);
                dynamicFilters[col][type] = isNaN(val) ? (type === 'min' ? -Infinity : Infinity) : val;
                renderROCAnalysisUI();
            });
        }
    });

    document.querySelectorAll('.sort-row th .sort-icon').forEach(icon => {
        const th = icon.parentElement;
        icon.textContent = th.getAttribute('data-sort') === screeningSort.column ? (screeningSort.order === 'asc' ? '↑' : '↓') : '↕';
        icon.style.opacity = th.getAttribute('data-sort') === screeningSort.column ? '1' : '0.5';
    });
}

function renderBaseScreeningTable(sheet) {
    if (!lastScreeningResults || !lastScreeningResults.length) {
        const rowCountElem = document.getElementById('base-row-count');
        if (rowCountElem) rowCountElem.textContent = '';
        return;
    }
    const table = document.getElementById('screening-base-table');
    const head = document.getElementById('screening-base-head');
    const body = document.getElementById('screening-base-body');
    if (!table || !head || !body) return;

    head.innerHTML = `
        <th data-sort="symbol" style="cursor:pointer">Ticker <span class="sort-icon">↕</span></th>
        <th data-sort="name" style="cursor:pointer">Nome <span class="sort-icon">↕</span></th>
        <th data-sort="last_price" style="cursor:pointer">Price <span class="sort-icon">↕</span></th>
        <th data-sort="last_date" style="cursor:pointer">Date <span class="sort-icon">↕</span></th>
        <th data-sort="roc_1" style="cursor:pointer">ROC (1) <span class="sort-icon">↕</span></th>
    `;
    let filterRow = table.querySelector('.filter-row');
    if (!filterRow) { filterRow = document.createElement('tr'); filterRow.className = 'filter-row'; head.parentElement.appendChild(filterRow); }
    filterRow.innerHTML = '<th></th><th></th><th></th><th></th><th></th>';

    if (sheet) {
        sheet.columns.forEach(col => {
            const key = getColumnKey(col), params = JSON.parse(col.parameters);
            const th = document.createElement('th');
            th.setAttribute('data-sort', key); th.style.cursor = 'pointer';
            th.innerHTML = `${col.indicator_type.toUpperCase()}(${Object.values(params).join(',')}) [${col.timeframe || 'D'}] <span class="sort-icon">↕</span>`;
            head.appendChild(th);

            const isMA = ['sma', 'ema', 'wma'].includes(col.indicator_type.toLowerCase());
            const cfg = dynamicFilters[key] || { min: -Infinity, max: Infinity };
            const fth = document.createElement('th');

            let filterHtml = `
                <div class="range-filter">
                    <input type="number" step="0.1" placeholder="${isMA ? 'Dist Min' : 'Min'}" class="dynamic-filter" data-col="${key}" data-type="min" value="${cfg.min === -Infinity ? '' : cfg.min}">
                    <input type="number" step="0.1" placeholder="${isMA ? 'Dist Max' : 'Max'}" class="dynamic-filter" data-col="${key}" data-type="max" value="${cfg.max === Infinity ? '' : cfg.max}">
                </div>`;

            if (isMA) {
                const daysKey = `${key}_days_filter`;
                const daysCfg = dynamicFilters[daysKey] || { min: -Infinity, max: Infinity };
                filterHtml += `
                    <div class="range-filter" style="margin-top:5px">
                        <input type="number" step="1" placeholder="Days Min" class="dynamic-filter" data-col="${daysKey}" data-type="min" value="${daysCfg.min === -Infinity ? '' : daysCfg.min}">
                        <input type="number" step="1" placeholder="Days Max" class="dynamic-filter" data-col="${daysKey}" data-type="max" value="${daysCfg.max === Infinity ? '' : daysCfg.max}">
                    </div>`;
            }
            fth.innerHTML = filterHtml;
            filterRow.appendChild(fth);
        });
    }

    head.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            screeningSort.order = (screeningSort.column === col && screeningSort.order === 'asc') ? 'desc' : 'asc';
            screeningSort.column = col;
            renderBaseScreeningTable(sheet);
        });
    });

    filterRow.querySelectorAll('.dynamic-filter').forEach(input => {
        input.addEventListener('input', () => {
            const col = input.getAttribute('data-col'), type = input.getAttribute('data-type');
            if (!dynamicFilters[col]) dynamicFilters[col] = { min: -Infinity, max: Infinity };
            const val = parseFloat(input.value);
            dynamicFilters[col][type] = isNaN(val) ? (type === 'min' ? -Infinity : Infinity) : val;
            renderBaseScreeningTable(sheet);
        });
    });

    let filtered = lastScreeningResults.filter(res => {
        for (const [col, cfg] of Object.entries(dynamicFilters)) {
            // Check if it's a "Days" filter for an MA
            if (col.endsWith('_days_filter')) {
                const baseKey = col.replace('_days_filter', '');
                const val = res.data[`${baseKey}_days`];
                if (val !== undefined && val !== null) {
                    const absVal = Math.abs(val);
                    if (absVal < cfg.min || absVal > cfg.max) return false;
                }
                continue;
            }

            // Check if this column is an MA to apply filter on distance
            const colObj = sheet.columns.find(c => getColumnKey(c) === col);
            const isMA = colObj && ['sma', 'ema', 'wma'].includes(colObj.indicator_type.toLowerCase());

            const targetKey = isMA ? `${col}_dist` : col;
            const val = res.data[targetKey];
            if (val !== undefined && val !== null && (val < cfg.min || val > cfg.max)) return false;
        }
        return true;
    });
    lastFilteredSymbols = filtered.map(res => res.symbol);

    filtered.sort((a, b) => {
        let valA, valB;
        if (screeningSort.column === 'symbol') { valA = a.symbol; valB = b.symbol; }
        else if (screeningSort.column === 'name') { valA = a.name || ''; valB = b.name || ''; }
        else if (screeningSort.column === 'last_price') { valA = a.last_price; valB = b.last_price; }
        else if (screeningSort.column === 'last_date') { valA = a.last_date; valB = b.last_date; }
        else if (screeningSort.column === 'roc_1') { valA = a.data['roc_1'] || 0; valB = b.data['roc_1'] || 0; }
        else { valA = a.data[screeningSort.column] || 0; valB = b.data[screeningSort.column] || 0; }
        return (valA < valB ? -1 : valA > valB ? 1 : 0) * (screeningSort.order === 'asc' ? 1 : -1);
    });

    body.innerHTML = '';
    filtered.forEach(res => {
        const row = document.createElement('tr');
        const r1 = res.data['roc_1'] || 0;
        row.innerHTML = `<td style="cursor:pointer; color:var(--accent-color)" onclick="showTickerDetails('${res.symbol}')">${res.symbol}</td>
            <td style="font-size:0.85em; color:var(--text-secondary)">${res.name || '-'}</td>
            <td>${res.last_price.toFixed(2)}</td><td>${res.last_date}</td>
            <td class="${r1 > 0 ? 'status-positive' : r1 < 0 ? 'status-negative' : 'status-neutral'}">${r1.toFixed(2)}%</td>`;
        if (sheet) {
            sheet.columns.forEach(col => {
                const key = getColumnKey(col);
                const val = res.data[key];
                const isMA = ['sma', 'ema', 'wma'].includes(col.indicator_type.toLowerCase());

                if (isMA && val !== null && val !== undefined) {
                    const dist = res.data[`${key}_dist`];
                    const days = res.data[`${key}_days`];

                    const distColor = dist >= 0 ? 'var(--success-color, #2ea043)' : 'var(--danger-color, #da3633)';
                    const distSign = dist >= 0 ? '+' : '';

                    row.innerHTML += `
                        <td>
                            <div style="font-weight:bold">${val.toFixed(2)}</div>
                            <div style="font-size:0.85em; color:${distColor}">
                                ${distSign}${dist.toFixed(2)}% (${Math.abs(days)}d ${days >= 0 ? '↑' : '↓'})
                            </div>
                        </td>`;
                } else {
                    row.innerHTML += `<td>${(val !== null && val !== undefined) ? (typeof val === 'number' ? val.toFixed(2) : val) : '-'}</td>`;
                }
            });
        }
        body.appendChild(row);
    });

    head.querySelectorAll('th .sort-icon').forEach(icon => {
        const th = icon.parentElement;
        icon.textContent = th.getAttribute('data-sort') === screeningSort.column ? (screeningSort.order === 'asc' ? '↑' : '↓') : '↕';
        icon.style.opacity = th.getAttribute('data-sort') === screeningSort.column ? '1' : '0.5';
    });

    const rowCountElem = document.getElementById('base-row-count');
    if (rowCountElem) rowCountElem.textContent = `${filtered.length} tickers`;
}

function resizeAllCharts() {
    const wrapper = document.getElementById('chart-and-fundamentals-wrapper');
    if (!wrapper) return;
    const wrapperWidth = wrapper.clientWidth;

    const section = document.getElementById('ticker-fundamentals-section');
    const content = document.getElementById('fundamentals-collapsible-content');
    let fundaHeight = 0;
    if (section && !section.classList.contains('hidden') && content && !content.classList.contains('hidden')) {
        fundaHeight = section.offsetHeight + 45;
    }

    const availHeight = wrapper.clientHeight - fundaHeight - 5;
    const gap = 8;
    let colWidth, rowHeight;

    if (activeChartCount === 4) {
        const cols = 2;
        rowHeight = Math.max(150, Math.floor((availHeight - gap) / cols));
        colWidth = Math.floor((wrapperWidth - gap) / cols);
    } else {
        rowHeight = Math.max(150, Math.floor(availHeight));
        colWidth = Math.floor((wrapperWidth - gap * (activeChartCount - 1)) / activeChartCount);
    }

    for (let i = 0; i < NUM_CHART_SLOTS; i++) {
        const slot = chartSlots[i];
        if (!slot || !slot.chart || !slot.container) continue;
        slot.container.style.height = `${rowHeight}px`;
        slot.chart.resize(colWidth, rowHeight);
        const sh = 60;
        slot.secondaryCharts.forEach(sc => {
            sc.container.style.height = `${sh}px`;
            sc.chart.resize(colWidth, sh);
        });
    }

    resizeDrawingCanvas();
}

function setupFundamentalsToggle() {
    const btn = document.getElementById('toggle-fundamentals-side-btn');
    const title = document.getElementById('fundamentals-title-clickable');
    const section = document.getElementById('ticker-fundamentals-section');
    const icon = document.getElementById('fundamentals-toggle-icon');
    
    if (!btn || !section) return;
    
    const performToggle = () => {
        const isCurrentlyHidden = section.classList.contains('hidden');
        if (isCurrentlyHidden) {
            section.classList.remove('hidden');
            if (icon) icon.textContent = '▲';
            localStorage.setItem('fundamentals_side_collapsed', 'false');
        } else {
            section.classList.add('hidden');
            if (icon) icon.textContent = '▼';
            localStorage.setItem('fundamentals_side_collapsed', 'true');
        }
        
        // Let the flex container update layout before resizing the chart
        setTimeout(resizeAllCharts, 50);
    };
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        performToggle();
    });
    
    if (title) {
        title.addEventListener('click', performToggle);
    }
}

// --- INITIALIZATION ---
function initApp() {
    setupFundamentalsToggle();
    initChart();
    if (mainChart) normalizeChart(mainChart);

    // Attach chart count listener early, before drawing tools
    const chartCountSelect = document.getElementById('chart-count-select');
    if (chartCountSelect) {
        chartCountSelect.addEventListener('change', function(e) {
            changeChartCount(parseInt(e.target.value));
        });
    }

    initDrawingTools();

    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        setTimeout(resizeAllCharts, 350);
    });

    // Config checkbox for Reopening Fundamentals
    const configReopenCheckbox = document.getElementById('config-reopen-fundamentals');
    if (configReopenCheckbox) {
        configReopenCheckbox.checked = localStorage.getItem('config_reopen_fundamentals') === 'true';
        configReopenCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('config_reopen_fundamentals', e.target.checked);
        });
    }

    ['visible-bars-input', 'right-margin-input', 'main-height-input', 'sub-height-input'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            if (id === 'visible-bars-input' || id === 'right-margin-input') {
                if (activeTicker) updateChart(activeTicker);
                updateVariation();
            } else {
                resizeAllCharts();
            }
        });
    });

    document.getElementById('modal-line-width').addEventListener('input', (e) => {
        document.getElementById('modal-line-width-val').textContent = e.target.value;
    });

    document.getElementById('save-template-btn').addEventListener('click', saveTemplate);
    document.getElementById('save-as-template-btn').addEventListener('click', saveAsTemplate);
    document.getElementById('reset-chart-btn').addEventListener('click', resetChart);
    document.getElementById('delete-template-btn').addEventListener('click', deleteTemplate);
    document.getElementById('template-select').addEventListener('change', (e) => applyTemplate(e.target.value));

    document.getElementById('create-sheet-btn').addEventListener('click', createNewScreeningSheet);
    document.getElementById('delete-sheet-btn').addEventListener('click', deleteActiveScreeningSheet);
    document.getElementById('add-column-select').addEventListener('change', (e) => {
        if (e.target.value) { addColumnToSheet(e.target.value); e.target.value = ''; }
    });

    document.querySelectorAll('.run-screening-btn.dynamic-run').forEach(btn => {
        btn.addEventListener('click', () => runDynamicScreening(btn));
    });

    document.querySelectorAll('.save-subuniverse-btn').forEach(btn => {
        btn.onclick = saveCurrentFilteredList;
    });

    document.getElementById('clear-subuniverse-btn').onclick = clearSubUniverse;

    document.querySelectorAll('.filter-row input').forEach(input => {
        input.addEventListener('input', () => renderROCAnalysisUI());
    });

    document.getElementById('indicator-modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('indicator-modal-overlay')) closeIndicatorModal();
    });

    loadTemplates();
    loadScreeningSheets();

    // Sub-universe listeners
    document.querySelectorAll('.save-subuniverse-btn').forEach(btn => {
        btn.addEventListener('click', saveCurrentFilteredList);
    });

    document.getElementById('clear-subuniverse-btn').addEventListener('click', clearSubUniverse);

    // Maintenance view buttons
    document.getElementById('clear-all-prices-btn').addEventListener('click', clearAllPrices);
    document.getElementById('vacuum-db-btn').addEventListener('click', vacuumDatabase);

    // Initial drawings migration
    migrateDrawingsToBackend();

    // Google Sheet Listeners
    const gsLoadBtn = document.getElementById('gsheet-load-btn');
    if (gsLoadBtn) gsLoadBtn.onclick = loadGSheetData;
    const gsNameInput = document.getElementById('gsheet-name-input');
    if (gsNameInput) {
        gsNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') loadGSheetData();
        });
    }

    // Investing.com Listeners
    const investingLoadBtn = document.getElementById('investing-load-btn');
    if (investingLoadBtn) investingLoadBtn.onclick = loadInvestingPortfolio;

    // Alarm Listeners
    const refreshAlarmsBtn = document.getElementById('refresh-alarms-btn');
    if (refreshAlarmsBtn) {
        refreshAlarmsBtn.onclick = () => {
            renderAlarmsView();
            checkAndNotifyAlarms();
        };
    }
    const alarmConfirmBtn = document.getElementById('alarm-confirm-btn');
    if (alarmConfirmBtn) alarmConfirmBtn.onclick = saveAlarm;
    const alarmModalOverlay = document.getElementById('alarm-modal-overlay');
    if (alarmModalOverlay) {
        alarmModalOverlay.onclick = (e) => {
            if (e.target === alarmModalOverlay) closeAlarmModal();
        };
    }

    // Fundamental Data Listeners
    const updateFundBtn = document.getElementById('update-fundamentals-btn');
    if (updateFundBtn) updateFundBtn.onclick = () => updateFundamentalsManually();

    const runFundScreenBtn = document.getElementById('run-fundamental-screening-btn');
    if (runFundScreenBtn) runFundScreenBtn.onclick = runFundamentalScreening;
}


function saveCurrentFilteredList() {
    if (lastFilteredSymbols.length === 0) {
        alert("La lista filtrata è vuota. Nulla da salvare.");
        return;
    }
    subUniverseSymbols = [...lastFilteredSymbols];

    // Hide "Salva Lista" buttons
    document.querySelectorAll('.save-subuniverse-btn').forEach(btn => btn.classList.add('hidden'));

    // Show "Clear" button in header
    const clearBtn = document.getElementById('clear-subuniverse-btn');
    if (clearBtn) clearBtn.classList.remove('hidden');

    alert(`Salvata una lista di ${subUniverseSymbols.length} ticker. Ora lo screening userà solo questi.`);
}

function clearSubUniverse() {
    subUniverseSymbols = null;
    document.getElementById('clear-subuniverse-btn').classList.add('hidden');

    // Clear all filters to reset view
    dynamicFilters = {};
    document.querySelectorAll('.roc-filter-min, .roc-filter-max, .dynamic-filter').forEach(input => {
        input.value = '';
    });

    // Re-show "Salva Lista" if we have results
    updateSaveListButtonsVisibility();

    // Re-render UI to show all results
    const isRoc = activeScreeningSheetId === 'roc';
    if (isRoc) {
        renderROCAnalysisUI();
    } else {
        const currentSheet = screeningSheets.find(s => s.id == activeScreeningSheetId);
        if (activeScreeningSheetId === 'base') {
            renderBaseScreeningTable(currentSheet);
        } else {
            renderDynamicScreeningTable(currentSheet);
        }
    }
    alert("Sotto-insieme e filtri rimossi. Ora verrà usata la lista principale selezionata.");
}

function updateSaveListButtonsVisibility() {
    const hasResults = lastFilteredSymbols && lastFilteredSymbols.length > 0;
    const isShowingSubUniverse = subUniverseSymbols && subUniverseSymbols.length > 0;

    // We only show it if we have results AND we are not currently viewing a locked sub-universe
    const showButton = hasResults && !isShowingSubUniverse;

    document.querySelectorAll('.save-subuniverse-btn').forEach(btn => {
        // Also check if the button belongs to an active tab before showing it,
        // though strictly they exist in DOM and we can just toggle the class.
        btn.classList.toggle('hidden', !showButton);
    });

    const clearBtn = document.getElementById('clear-subuniverse-btn');
    if (clearBtn) {
        if (isShowingSubUniverse) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
}

// --- Maintenance Functions ---

async function loadOrphans() {
    const body = document.getElementById('maintenance-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="4">Caricamento...</td></tr>';

    try {
        const orphans = await apiCall('/maintenance/orphans');
        body.innerHTML = '';

        if (orphans.length === 0) {
            body.innerHTML = '<tr><td colspan="4">Nessun indicatore orfano trovato.</td></tr>';
            return;
        }

        orphans.forEach(o => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="checkbox" class="orphan-select" data-key="${o.indicator_key}"></td>
                <td><code style="color: var(--accent-color)">${o.indicator_key}</code></td>
                <td>${o.count.toLocaleString()}</td>
                <td>
                    <button class="danger" style="padding: 2px 8px; font-size: 0.8em" onclick="deleteSingleOrphan('${o.indicator_key}')">Elimina</button>
                </td>
            `;
            body.appendChild(row);
        });

        setupOrphanListeners();
    } catch (err) {
        body.innerHTML = `<tr><td colspan="4" style="color:red">Errore: ${err.message}</td></tr>`;
    }
}

function setupOrphanListeners() {
    const selectAll = document.getElementById('select-all-orphans');
    const deleteBtn = document.getElementById('delete-selected-orphans-btn');
    const checkboxes = document.querySelectorAll('.orphan-select');

    selectAll.onchange = () => {
        checkboxes.forEach(cb => cb.checked = selectAll.checked);
        updateDeleteOrphansBtn();
    };

    checkboxes.forEach(cb => {
        cb.onchange = updateDeleteOrphansBtn;
    });
}

function updateDeleteOrphansBtn() {
    const checked = document.querySelectorAll('.orphan-select:checked');
    const btn = document.getElementById('delete-selected-orphans-btn');
    if (checked.length > 0) {
        btn.style.display = 'block';
        btn.textContent = `Elimina Selezionati (${checked.length})`;
        btn.onclick = deleteSelectedOrphans;
    } else {
        btn.style.display = 'none';
    }
}

async function deleteSingleOrphan(key) {
    if (!confirm(`Eliminare tutti i dati per ${key}?`)) return;
    try {
        await apiCall('/maintenance/delete-orphans', 'POST', { indicator_keys: [key] });
        loadOrphans();
    } catch (err) {
        alert("Errore nell'eliminazione: " + err.message);
    }
}

async function deleteSelectedOrphans() {
    const checked = Array.from(document.querySelectorAll('.orphan-select:checked')).map(cb => cb.dataset.key);
    if (!confirm(`Eliminare i dati per ${checked.length} indicatori selezionati?`)) return;

    try {
        await apiCall('/maintenance/delete-orphans', 'POST', { indicator_keys: checked });
        loadOrphans();
    } catch (err) {
        alert("Errore nell'eliminazione: " + err.message);
    }
}

async function clearAllPrices() {
    if (!confirm("ATTENZIONE: Stai per cancellare TUTTI i dati storici dei prezzi dal database. Questa operazione non è reversibile. Vuoi procedere?")) {
        return;
    }

    try {
        const result = await apiCall('/maintenance/clear-prices', 'POST');
        alert(result.message || "Tutti i prezzi sono stati cancellati.");
        // Refresh views if necessary
        if (activeView === 'historical') loadHistoricalData(activeTicker);
    } catch (err) {
        alert("Errore nella cancellazione dei prezzi: " + err.message);
    }
}

async function vacuumDatabase() {
    const btn = document.getElementById('vacuum-db-btn');
    const originalText = btn.textContent;
    btn.textContent = "⌛ Ottimizzazione...";
    btn.disabled = true;

    try {
        const result = await apiCall('/maintenance/vacuum', 'POST');
        alert(result.message || "Database ottimizzato con successo.");
    } catch (err) {
        alert("Errore durante l'ottimizzazione: " + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ========================
// === GOOGLE SHEET VIEW ===
// ========================

// State for Google Sheet view
const gsheetState = {
    data: {},           // { sheetName: [ {...}, {...} ] }
    activeSheet: null,  // currently selected sheet name
    sort: {},           // { sheetName: { col, order } }  order: 'asc'|'desc'
    filters: {},        // { sheetName: { col: filterText } }
};

// =============================
// === INVESTING.COM SECTION ===
// =============================

// State for Investing view
let investingDataCache = {
    prezzo: [],
    tecnica: [],
    csv_datasets: {} // { name: data_array }
};

async function refreshTickerMappingsLookup() {
    try {
        const mappings = await apiCall('/tickers/mapping/');
        tickerMappingsLookup.clear();
        mappings.forEach(m => {
            if (m.symbol_investing) {
                // Use trim() to handle potential extra spaces
                tickerMappingsLookup.set(m.symbol_investing.trim().toLowerCase(), m.symbol_yahoo.trim());
            }
        });
        console.log(`Ticker mappings lookup refreshed: ${tickerMappingsLookup.size} entries.`);
    } catch (err) {
        console.error("Failed to refresh ticker mappings lookup:", err);
    }
}

async function loadInvestingUrls() {
    const select = document.getElementById('investing-url-select');
    if (!select) return;

    try {
        const urls = await apiCall('/investing/urls');
        // Keep the first option ("Nuovo URL...")
        select.innerHTML = '<option value="">Nuovo URL...</option>';
        urls.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.url;
            opt.dataset.id = item.id;
            opt.textContent = item.name;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load Investing URLs:", err);
    }
}

async function saveInvestingUrl() {
    const urlInput = document.getElementById('investing-url-input');
    const url = urlInput ? urlInput.value.trim() : '';
    if (!url) {
        alert("Inserisci un URL.");
        return;
    }

    const name = prompt("Inserisci un nome per questa lista:", "Le mie azioni");
    if (!name) return;

    try {
        await apiCall('/investing/urls', 'POST', { name, url });
        alert("URL salvato correttamente.");
        loadInvestingUrls();
    } catch (err) {
        alert("Errore nel salvataggio: " + err.message);
    }
}

async function deleteInvestingUrl() {
    const select = document.getElementById('investing-url-select');
    if (!select || !select.value) {
        alert("Seleziona una lista salvata da eliminare.");
        return;
    }

    const selectedOption = select.options[select.selectedIndex];
    const urlId = selectedOption.dataset.id;

    if (!confirm(`Sei sicuro di voler eliminare la lista "${selectedOption.textContent}"?`)) {
        return;
    }

    try {
        await apiCall(`/investing/urls/${urlId}`, 'DELETE');
        alert("URL eliminato.");
        document.getElementById('investing-url-input').value = 'https://it.investing.com/portfolio';
        loadInvestingUrls();
    } catch (err) {
        alert("Errore nell'eliminazione: " + err.message);
    }
}

async function loadInvestingPortfolio() {
    const urlInput = document.getElementById('investing-url-input');
    const statusEl = document.getElementById('investing-status');
    const resultsCard = document.getElementById('investing-results-card');
    const loadBtn = document.getElementById('investing-load-btn');

    const url = urlInput ? urlInput.value.trim() : '';
    if (!url) {
        alert('Inserisci l\'URL del portfolio Investing.com.');
        return;
    }

    if (loadBtn) loadBtn.disabled = true;
    statusEl.textContent = '⏳ Apertura Chrome e caricamento dati... (può richiedere 15-30 secondi)';
    resultsCard.style.display = 'none';

    try {
        const result = await apiCall(`/investing/portfolio?url=${encodeURIComponent(url)}`);
        investingDataCache.prezzo = result.data.prezzo || [];
        investingDataCache.tecnica = result.data.tecnica || [];

        if (!investingDataCache.prezzo.length && !investingDataCache.tecnica.length) {
            statusEl.textContent = '⚠️ Nessun dato trovato nel portfolio.';
            return;
        }

        // Render Prezzo tab by default
        renderInvestingTable(investingDataCache.prezzo);

        resultsCard.style.display = 'block';
        setInvestingTabActive('prezzo');
        statusEl.textContent = `✅ Caricati ${investingDataCache.prezzo.length} strumenti (Prezzo) e ${investingDataCache.tecnica.length} strumenti (Tecnica).`;

    } catch (e) {
        console.error('Investing.com load error:', e);
        statusEl.textContent = `❌ Errore: ${e.message}`;
    } finally {
        if (loadBtn) loadBtn.disabled = false;
    }
}

async function loadInvestingCSV() {
    const urlInput = document.getElementById('investing-url-input');
    const statusEl = document.getElementById('investing-status');
    const resultsCard = document.getElementById('investing-results-card');
    const loadCsvBtn = document.getElementById('investing-load-csv-btn');

    const url = urlInput ? urlInput.value.trim() : '';
    if (!url) {
        alert('Inserisci l\'URL del portfolio Investing.com.');
        return;
    }

    if (loadCsvBtn) loadCsvBtn.disabled = true;
    statusEl.textContent = '⏳ Scaricamento CSV in corso... (può richiedere pochi secondi)';
    resultsCard.style.display = 'none';

    try {
        const result = await apiCall(`/investing/portfolio_csv?url=${encodeURIComponent(url)}`);
        const { data, name } = result;

        if (!data || data.length === 0) {
            statusEl.textContent = '⚠️ Nessun dato trovato nel CSV.';
            return;
        }

        // Add to datasets
        investingDataCache.csv_datasets[name] = data;

        // Update tabs and show card
        updateInvestingCSVTabs();
        resultsCard.style.display = 'block';

        // Render and activate the new CSV tab
        renderInvestingCSVTable(data);
        setInvestingTabActive(`csv-${name}`);

        statusEl.textContent = `✅ Importati ${data.length} strumenti dal file CSV (${name}).`;

    } catch (e) {
        console.error('Investing.com CSV error:', e);
        statusEl.textContent = `❌ Errore CSV: ${e.message}`;
    } finally {
        if (loadCsvBtn) loadCsvBtn.disabled = false;
    }
}

async function loadLocalInvestingCSV() {
    const statusEl = document.getElementById('investing-status');
    const resultsCard = document.getElementById('investing-results-card');
    const loadCsvLocalBtn = document.getElementById('investing-load-csv-local-btn');

    if (loadCsvLocalBtn) loadCsvLocalBtn.disabled = true;
    statusEl.textContent = '⏳ Lettura file CSV in corso...';
    resultsCard.style.display = 'none';

    try {
        const result = await apiCall(`/investing/portfolio_csv_local`);
        const { data, name } = result;

        if (!data || data.length === 0) {
            statusEl.textContent = '⚠️ Nessun dato trovato nel CSV locale.';
            return;
        }

        // Add to datasets
        investingDataCache.csv_datasets[name] = data;

        // Update tabs
        updateInvestingCSVTabs();
        resultsCard.style.display = 'block';

        // Render and activate
        renderInvestingCSVTable(data);
        setInvestingTabActive(`csv-${name}`);

        statusEl.textContent = `✅ Importati ${data.length} strumenti dal file CSV locale (${name}).`;
    } catch (e) {
        console.error('Investing.com Local CSV error:', e);
        statusEl.textContent = `❌ Errore CSV locale: ${e.message}`;
    } finally {
        if (loadCsvLocalBtn) loadCsvLocalBtn.disabled = false;
    }
}

function renderInvestingTable(dataArray) {
    const tableHead = document.getElementById('investing-table-head');
    const tableBody = document.getElementById('investing-table-body');

    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    if (!dataArray || dataArray.length === 0) return;

    // Build header
    const headers = Object.keys(dataArray[0]);
    tableHead.innerHTML = headers.map(h => `<th>${h}</th>`).join('');

    // Build body
    dataArray.forEach(row => {
        const tr = document.createElement('tr');
        headers.forEach(h => {
            const td = document.createElement('td');
            const val = row[h] || '';
            td.textContent = val;

            // Color variation columns and Buy/Sell texts
            const lowerH = h.toLowerCase();
            const lowerVal = String(val).toLowerCase();

            if (lowerH.includes('var')) {
                const num = parseFloat(val.replace(',', '.').replace('%', ''));
                if (!isNaN(num)) {
                    td.style.color = num >= 0 ? 'var(--positive-color, #2ea043)' : 'var(--negative-color, #f85149)';
                    td.style.fontWeight = '600';
                }
            } else if (lowerVal.includes('compra') || lowerVal.includes('buy')) {
                td.style.color = 'var(--positive-color, #2ea043)';
                td.style.fontWeight = '600';
            } else if (lowerVal.includes('vendi') || lowerVal.includes('sell')) {
                td.style.color = 'var(--negative-color, #f85149)';
                td.style.fontWeight = '600';
            }
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
}

function updateInvestingCSVTabs() {
    const container = document.getElementById('investing-csv-tabs');
    if (!container) return;

    container.innerHTML = '';

    Object.keys(investingDataCache.csv_datasets).forEach(name => {
        const btn = document.createElement('button');
        btn.id = `investing-tab-csv-${name}`;
        btn.className = 'tab-item-csv';
        btn.style.padding = '6px 15px';
        btn.style.cursor = 'pointer';
        btn.style.border = '1px solid var(--border-color)';
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-color)';
        btn.style.borderRadius = '4px';
        btn.textContent = name;

        btn.addEventListener('click', () => {
            renderInvestingCSVTable(investingDataCache.csv_datasets[name]);
            setInvestingTabActive(`csv-${name}`);
        });

        container.appendChild(btn);
    });
}

async function renderInvestingCSVTable(dataArray) {
    // Refresh mappings before render to be sure they are up to date
    await refreshTickerMappingsLookup();

    const tableHead = document.getElementById('investing-table-head');
    const tableBody = document.getElementById('investing-table-body');

    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    if (!dataArray || dataArray.length === 0) return;

    // Build header with filter inputs
    let headers = Object.keys(dataArray[0]);

    // Add "Ticker Yahoo" as first column
    const displayHeaders = ['Ticker Yahoo', ...headers];

    displayHeaders.forEach(h => {
        const th = document.createElement('th');
        th.style.verticalAlign = 'top';
        th.style.minWidth = '120px';

        if (h === 'Ticker Yahoo') {
            th.innerHTML = `<div style="margin-bottom: 5px;">${h}</div>`;
            tableHead.appendChild(th);
            return;
        }

        // Check if column is likely numerical by looking at first few non-empty values
        let isNumeric = true;
        let sampleCount = 0;
        for (let i = 0; i < Math.min(dataArray.length, 10); i++) {
            const val = dataArray[i][h];
            if (val && val !== '-' && val !== '--') {
                const cleanVal = String(val).replace(',', '.').replace('%', '').replace('+', '').trim();
                if (isNaN(parseFloat(cleanVal))) {
                    isNumeric = false;
                    break;
                }
                sampleCount++;
            }
        }
        if (sampleCount === 0) isNumeric = false;

        if (isNumeric) {
            th.innerHTML = `
                <div style="margin-bottom: 5px;">${h}</div>
                <div style="display: flex; gap: 2px;">
                    <input type="text" class="csv-filter-input min" data-col="${h}" placeholder="Min" style="width: 50%; padding: 4px; font-size: 0.75rem; box-sizing: border-box;">
                    <input type="text" class="csv-filter-input max" data-col="${h}" placeholder="Max" style="width: 50%; padding: 4px; font-size: 0.75rem; box-sizing: border-box;">
                </div>
            `;
        } else {
            th.innerHTML = `
                <div style="margin-bottom: 5px;">${h}</div>
                <input type="text" class="csv-filter-input text" data-col="${h}" placeholder="Filtra..." style="width: 100%; padding: 4px; font-size: 0.8rem; box-sizing: border-box;">
            `;
        }
        tableHead.appendChild(th);
    });

    // Initial render
    renderCSVBody(dataArray, headers, tableBody);

    // Attach filter event listeners
    const container = document.getElementById('investing-results-card');
    container.addEventListener('input', (e) => {
        if (!e.target.classList.contains('csv-filter-input')) return;

        const allInputs = container.querySelectorAll('.csv-filter-input');
        const filters = {};

        allInputs.forEach(inp => {
            const col = inp.dataset.col;
            if (!filters[col]) filters[col] = { text: '', min: -Infinity, max: Infinity };

            const val = inp.value.trim();
            if (inp.classList.contains('min')) {
                if (val !== '') filters[col].min = parseFloat(val.replace(',', '.'));
            } else if (inp.classList.contains('max')) {
                if (val !== '') filters[col].max = parseFloat(val.replace(',', '.'));
            } else {
                filters[col].text = val.toLowerCase();
            }
        });

        // Filter data
        const filteredData = dataArray.filter(row => {
            for (const col in filters) {
                const val = row[col] || '';
                const f = filters[col];

                // Text filter
                if (f.text && !String(val).toLowerCase().includes(f.text)) return false;

                // Numeric range filter
                if (f.min !== -Infinity || f.max !== Infinity) {
                    const num = parseFloat(String(val).replace(',', '.').replace('%', '').replace('+', ''));
                    if (isNaN(num)) return false;
                    if (num < f.min || num > f.max) return false;
                }
            }
            return true;
        });

        renderCSVBody(filteredData, headers, tableBody);
    });
}

function renderCSVBody(dataArray, originalHeaders, tableBody) {
    tableBody.innerHTML = '';

    // Find index of "Simbolo" column for lookup
    const simboloCol = originalHeaders.find(h => h.toLowerCase() === 'simbolo');

    dataArray.forEach(row => {
        const tr = document.createElement('tr');

        // Add "Ticker Yahoo" cell first
        const tdYahoo = document.createElement('td');
        const invTicker = simboloCol ? (row[simboloCol] || '').toString().trim() : '';
        const yahooTicker = tickerMappingsLookup.get(invTicker.toLowerCase());

        if (yahooTicker) {
            tdYahoo.innerHTML = `<a href="#" class="ticker-link" 
                style="color:var(--accent-color); text-decoration:none; font-weight:600;"
                onclick="event.preventDefault(); goToTicker('${yahooTicker}')">${yahooTicker}</a>`;
        } else {
            // No mapping: show inline input to quickly add one
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex; align-items:center; gap:4px;';

            const inp = document.createElement('input');
            inp.type = 'text';
            inp.placeholder = 'Yahoo ticker';
            inp.style.cssText = 'width:90px; padding:3px 5px; font-size:0.78rem; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-color); color:var(--text-color);';
            inp.title = `Aggiungi mapping per ${invTicker}`;

            const btn = document.createElement('button');
            btn.textContent = '✚';
            btn.title = 'Salva mapping';
            btn.style.cssText = 'padding:2px 6px; font-size:0.78rem; background:var(--accent-color); color:white; border:none; border-radius:4px; cursor:pointer;';

            const saveMapping = async () => {
                const yTicker = inp.value.trim().toUpperCase();
                if (!yTicker) { inp.focus(); return; }
                try {
                    await apiCall('/tickers/mapping/', 'POST', {
                        symbol_yahoo: yTicker,
                        symbol_investing: invTicker,
                        name: null
                    });
                    await refreshTickerMappingsLookup();
                    // Replace the cell content with a link to the new ticker
                    tdYahoo.innerHTML = `<a href="#" class="ticker-link" 
                        style="color:var(--accent-color); text-decoration:none; font-weight:600;"
                        onclick="event.preventDefault(); goToTicker('${yTicker}')">${yTicker}</a>`;
                } catch (err) {
                    alert('Errore salvataggio mapping: ' + err.message);
                }
            };

            btn.addEventListener('click', saveMapping);
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveMapping(); });

            wrapper.appendChild(inp);
            wrapper.appendChild(btn);
            tdYahoo.appendChild(wrapper);
        }
        tr.appendChild(tdYahoo);

        originalHeaders.forEach(h => {
            const td = document.createElement('td');
            const val = row[h] || '';
            td.textContent = val;

            const lowerH = h.toLowerCase();
            const lowerVal = String(val).toLowerCase();

            // Apply similar variation coloring
            if (lowerH.includes('var') || lowerH.includes('chg')) {
                const numStr = val.replace(',', '.').replace('%', '').replace('+', '');
                const num = parseFloat(numStr);
                if (!isNaN(num)) {
                    td.style.color = num >= 0 ? 'var(--positive-color, #2ea043)' : 'var(--negative-color, #f85149)';
                    td.style.fontWeight = '600';
                }
            } else if (lowerVal.includes('compra') || lowerVal.includes('buy') || lowerVal === 'strong buy') {
                td.style.color = 'var(--positive-color, #2ea043)';
                td.style.fontWeight = '600';
            } else if (lowerVal.includes('vendi') || lowerVal.includes('sell') || lowerVal === 'strong sell') {
                td.style.color = 'var(--negative-color, #f85149)';
                td.style.fontWeight = '600';
            }
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
}

// Bind Tabs
// --- INVESTING LOGIC INITIALIZATION ---
function initInvestingLogic() {
    document.getElementById('investing-load-csv-btn')?.addEventListener('click', loadInvestingCSV);
    document.getElementById('investing-load-csv-local-btn')?.addEventListener('click', loadLocalInvestingCSV);

    const urlSelect = document.getElementById('investing-url-select');
    if (urlSelect) {
        urlSelect.addEventListener('change', () => {
            const input = document.getElementById('investing-url-input');
            if (input) input.value = urlSelect.value || 'https://it.investing.com/portfolio';
        });
        loadInvestingUrls();
    }

    document.getElementById('investing-save-url-btn')?.addEventListener('click', saveInvestingUrl);
    document.getElementById('investing-delete-url-btn')?.addEventListener('click', deleteInvestingUrl);

    document.getElementById('investing-load-btn')?.addEventListener('click', loadInvestingPortfolio);

    const btnPrezzo = document.getElementById('investing-tab-prezzo');
    const btnTecnica = document.getElementById('investing-tab-tecnica');

    if (btnPrezzo && btnTecnica) {
        btnPrezzo.addEventListener('click', () => {
            setInvestingTabActive('prezzo');
            renderInvestingTable(investingDataCache.prezzo || []);
        });

        btnTecnica.addEventListener('click', () => {
            setInvestingTabActive('tecnica');
            renderInvestingTable(investingDataCache.tecnica || []);
        });
    }
}

function setInvestingTabActive(activeName) {
    // Collect all possible tabs
    const staticTabs = {
        'prezzo': document.getElementById('investing-tab-prezzo'),
        'tecnica': document.getElementById('investing-tab-tecnica')
    };

    // Dynamic tabs
    const csvTabs = {};
    Object.keys(investingDataCache.csv_datasets).forEach(name => {
        csvTabs[`csv-${name}`] = document.getElementById(`investing-tab-csv-${name}`);
    });

    const allTabs = { ...staticTabs, ...csvTabs };

    Object.keys(allTabs).forEach(name => {
        const t = allTabs[name];
        if (!t) return;

        if (name === activeName) {
            t.style.background = 'var(--accent-color)';
            t.style.color = 'white';
            t.style.border = 'none';
            t.classList.add('active');
        } else {
            t.style.background = 'transparent';
            t.style.color = 'var(--text-color)';
            t.style.border = '1px solid var(--border-color)';
            t.classList.remove('active');
        }
    });
}


async function loadGSheetData() {
    const nameInput = document.getElementById('gsheet-name-input');
    const spreadsheetName = nameInput ? nameInput.value.trim() : 'Investing';
    if (!spreadsheetName) {
        alert('Inserisci il nome del Google Sheet.');
        return;
    }

    const statusEl = document.getElementById('gsheet-status');
    const tabsBar = document.getElementById('gsheet-tabs-bar');
    const container = document.getElementById('gsheet-sheets-container');

    statusEl.textContent = '⏳ Caricamento in corso...';
    statusEl.style.color = '#8b949e';
    tabsBar.style.display = 'none';
    container.innerHTML = '';

    try {
        const data = await apiCall(`/gsheet/data?spreadsheet_name=${encodeURIComponent(spreadsheetName)}`);

        gsheetState.data = data;
        gsheetState.sort = {};
        gsheetState.filters = {};

        const sheetNames = Object.keys(data);

        if (sheetNames.length === 0) {
            statusEl.textContent = 'Nessun foglio trovato.';
            return;
        }

        statusEl.textContent = `✅ ${sheetNames.length} fogli caricati`;
        statusEl.style.color = '#2ea043';

        // Build tabs
        tabsBar.innerHTML = '';
        tabsBar.style.display = 'flex';
        container.innerHTML = '';

        sheetNames.forEach((name, idx) => {
            // Initialize state for this sheet
            gsheetState.sort[name] = { col: null, order: 'asc' };
            gsheetState.filters[name] = {};

            // Tab button
            const tab = document.createElement('div');
            tab.className = 'tab-item' + (idx === 0 ? ' active' : '');
            tab.textContent = name;
            tab.dataset.sheet = name;
            tab.addEventListener('click', () => {
                tabsBar.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                gsheetState.activeSheet = name;
                container.querySelectorAll('.gsheet-sheet-panel').forEach(p => {
                    p.style.display = p.dataset.sheet === name ? '' : 'none';
                });
            });
            tabsBar.appendChild(tab);

            // Panel
            const panel = document.createElement('div');
            panel.className = 'gsheet-sheet-panel';
            panel.dataset.sheet = name;
            panel.style.display = idx === 0 ? '' : 'none';
            panel.style.marginTop = '16px';
            container.appendChild(panel);

            renderGSheetPanel(name);
        });

        gsheetState.activeSheet = sheetNames[0];

    } catch (err) {
        statusEl.textContent = `❌ Errore: ${err.message}`;
        statusEl.style.color = '#da3633';
        console.error('GSheet error:', err);
    }
}

function renderGSheetPanel(sheetName) {
    const panel = document.querySelector(`.gsheet-sheet-panel[data-sheet="${CSS.escape(sheetName)}"]`);
    if (!panel) return;

    const records = gsheetState.data[sheetName] || [];
    if (records.length === 0) {
        panel.innerHTML = `<div class="card"><p style="color:#8b949e;">Il foglio "<strong>${sheetName}</strong>" è vuoto o non ha dati strutturati.</p></div>`;
        return;
    }

    const columns = Object.keys(records[0]);
    const sortState = gsheetState.sort[sheetName];
    const filterState = gsheetState.filters[sheetName];

    // Apply filters
    let filtered = records.filter(row => {
        return columns.every(col => {
            const f = (filterState[col] || '').toLowerCase();
            if (!f) return true;
            const val = String(row[col] ?? '').toLowerCase();
            return val.includes(f);
        });
    });

    // Apply sort
    if (sortState.col !== null) {
        filtered.sort((a, b) => {
            const va = a[sortState.col];
            const vb = b[sortState.col];
            const na = parseFloat(va);
            const nb = parseFloat(vb);
            let cmp;
            if (!isNaN(na) && !isNaN(nb)) {
                cmp = na - nb;
            } else {
                cmp = String(va ?? '').localeCompare(String(vb ?? ''));
            }
            return sortState.order === 'asc' ? cmp : -cmp;
        });
    }

    // Build HTML
    const rowCountHtml = `<span class="row-count-badge">${filtered.length} / ${records.length} righe</span>`;

    let thead = '<thead>';
    // Sort row
    thead += '<tr class="sort-row">';
    columns.forEach(col => {
        const isActive = sortState.col === col;
        const icon = isActive ? (sortState.order === 'asc' ? '↑' : '↓') : '↕';
        const iconOpacity = isActive ? '1' : '0.5';
        thead += `<th data-col="${col}" style="cursor:pointer; user-select:none;">
            ${col} <span class="sort-icon" style="opacity:${iconOpacity}">${icon}</span>
        </th>`;
    });
    thead += '</tr>';

    // Filter row
    thead += '<tr>';
    columns.forEach(col => {
        const val = filterState[col] || '';
        thead += `<th style="padding: 4px 8px;">
            <input type="text" class="gsheet-filter-input" data-col="${col}" value="${val}"
                placeholder="Filtra..."
                style="width:100%; padding:3px 6px; font-size:0.75rem; background:rgba(255,255,255,0.05); border:1px solid var(--border-color); border-radius:4px; color:var(--text-color);">
        </th>`;
    });
    thead += '</tr>';
    thead += '</thead>';

    let tbody = '<tbody>';
    filtered.forEach(row => {
        tbody += '<tr>';
        columns.forEach((col, colIdx) => {
            const val = row[col] ?? '';
            if (colIdx === 0 && val) {
                // First column: render as clickable ticker link
                tbody += `<td><a href="#" class="ticker-link"
                    style="color:var(--accent-color); text-decoration:none; font-weight:600;"
                    onclick="event.preventDefault(); showTickerDetails('${String(val).replace(/'/g, "\\'")}');"
                    >${val}</a></td>`;
            } else {
                tbody += `<td>${val}</td>`;
            }
        });
        tbody += '</tr>';
    });
    if (filtered.length === 0) {
        tbody += `<tr><td colspan="${columns.length}" style="text-align:center; color:#8b949e; padding:20px;">Nessun risultato con i filtri applicati.</td></tr>`;
    }
    tbody += '</tbody>';

    panel.innerHTML = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0;">${sheetName} ${rowCountHtml}</h3>
            </div>
            <div style="overflow-x:auto; max-height:600px; overflow-y:auto;">
                <table id="gsheet-table-${sheetName.replace(/\s+/g, '_')}" class="gsheet-data-table">
                    ${thead}
                    ${tbody}
                </table>
            </div>
        </div>`;

    // Bind sort listeners
    panel.querySelectorAll('th[data-col]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            const s = gsheetState.sort[sheetName];
            if (s.col === col) {
                s.order = s.order === 'asc' ? 'desc' : 'asc';
            } else {
                s.col = col;
                s.order = 'asc';
            }
            renderGSheetPanel(sheetName);
        });
    });

    // Bind filter listeners (with 1-second debounce)
    panel.querySelectorAll('.gsheet-filter-input').forEach(input => {
        let debounceTimer = null;
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                gsheetState.filters[sheetName][input.dataset.col] = input.value;
                renderGSheetPanel(sheetName);
            }, 1000);
        });
        // Stop click on filter row from triggering column sort
        input.addEventListener('click', (e) => e.stopPropagation());
    });
}

// --- Alarm Management ---

// Notification helpers
let _lastTriggeredAlarms = new Set();
async function checkAndNotifyAlarms() {
    try {
        const alarms = await apiCall('/alarms/');
        let newlyTriggered = false;
        let messages = [];

        alarms.forEach(al => {
            if (al.triggered_at && !_lastTriggeredAlarms.has(al.id)) {
                _lastTriggeredAlarms.add(al.id);
                newlyTriggered = true;
                const dr = al.drawing || {};
                const price = al.last_checked_price ? al.last_checked_price.toFixed(2) : 'N/A';
                messages.push(`${dr.symbol} [${al.trigger_type}] al prezzo: ${price}`);
            } else if (!al.triggered_at) {
                _lastTriggeredAlarms.delete(al.id);
            }
        });

        if (newlyTriggered) {
            playBeep();
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Allarme Scattato!", {
                    body: messages.join("\\n"),
                    icon: "https://cdn-icons-png.flaticon.com/512/1827/1827370.png"
                });
            } else {
                alert("🔔 ALLARMI SCATTATI 🔔\\n\\n" + messages.join("\\n"));
            }
        }
    } catch (err) {
        console.error("Failed to check alarms for notifications:", err);
    }
}

function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.error("Audio block", e);
    }
}

let _activeAlarmDrawing = null;

async function renderAlarmsView() {
    const body = document.getElementById('alarms-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="7">Caricamento...</td></tr>';

    try {
        const alarms = await apiCall('/alarms/');
        body.innerHTML = '';

        if (alarms.length === 0) {
            body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-secondary);">Nessun allarme configurato.</td></tr>';
            return;
        }

        alarms.forEach(al => {
            const dr = al.drawing;
            if (!dr) return;

            const row = document.createElement('tr');
            row.className = 'alarm-row';

            let posInfo = "";
            if (dr.type === 'horizontal_line') {
                posInfo = dr.points[0].price.toFixed(2);
            } else {
                posInfo = `${dr.points[0].price.toFixed(2)} → ${dr.points[1] ? dr.points[1].price.toFixed(2) : '...'}`;
            }

            const statusClass = al.triggered_at ? 'badge-triggered' : (al.is_active ? 'badge-active' : 'badge-inactive');
            const statusText = al.triggered_at ? 'Scattato' : (al.is_active ? 'Attivo' : 'Inattivo');
            const triggerInfo = al.trigger_type === 'close' ? 'Chiusura' : 'Intraday';

            let lastCheckStr = '-';
            if (al.triggered_at) {
                const d = new Date(al.triggered_at);
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                lastCheckStr = `${day}/${month}/${year} ${hours}:${minutes}`;
            } else if (al.last_checked_price) {
                lastCheckStr = `Prezzo: ${al.last_checked_price.toFixed(2)}`;
            }

            row.innerHTML = `
                <td><a href="#" class="ticker-link" onclick="event.preventDefault(); goToAlarmTicker('${dr.symbol}')">${dr.symbol}</a></td>
                <td>${dr.type.replace('_', ' ')}</td>
                <td>${posInfo}</td>
                <td>${triggerInfo}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>${lastCheckStr}</td>
                <td>
                    <button class="goto-btn" onclick="goToAlarmTicker('${dr.symbol}')">Vai</button>
                    <button class="danger" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteAlarmFromList(${dr.id})">Elimina</button>
                </td>
            `;
            body.appendChild(row);
        });
    } catch (err) {
        body.innerHTML = `<tr><td colspan="7" style="color:red">Errore: ${err.message}</td></tr>`;
    }
}

function goToAlarmTicker(symbol) {
    const navItem = document.querySelector('.nav-item[data-view="monitoring"]');
    if (navItem) navItem.click();
    showTickerDetails(symbol);
}

async function deleteAlarmFromList(drawingId) {
    if (!confirm('Eliminare l\'allarme selezionato?')) return;
    try {
        await apiCall(`/drawings/${drawingId}/alarm`, 'DELETE');
        renderAlarmsView();
    } catch (err) {
        alert('Errore: ' + err.message);
    }
}

function openAlarmModal(drawing) {
    if (!drawing.id) {
        alert("Attendi un istante: il disegno è in fase di salvataggio nel server. Riprova tra poco.");
        return;
    }

    _activeAlarmDrawing = drawing;
    const modal = document.getElementById('alarm-modal-overlay');
    const info = document.getElementById('alarm-modal-info');

    info.textContent = `Imposta allarme per ${drawing.ticker} su ${drawing.type.replace('_', ' ')}`;

    // Check if drawing already has an alarm
    const existingAlarm = drawing.alarms && drawing.alarms.length > 0 ? drawing.alarms[0] : null;

    if (existingAlarm) {
        document.querySelector(`input[name="alarm-trigger-type"][value="${existingAlarm.trigger_type}"]`).checked = true;
        document.getElementById('alarm-active-checkbox').checked = existingAlarm.is_active === 1;
    } else {
        document.querySelector('input[name="alarm-trigger-type"][value="intraday"]').checked = true;
        document.getElementById('alarm-active-checkbox').checked = true;
    }

    modal.classList.remove('hidden');
}

function closeAlarmModal() {
    document.getElementById('alarm-modal-overlay').classList.add('hidden');
    _activeAlarmDrawing = null;
}

async function saveAlarm() {
    if (!_activeAlarmDrawing) return;

    const triggerType = document.querySelector('input[name="alarm-trigger-type"]:checked').value;
    const isActive = document.getElementById('alarm-active-checkbox').checked ? 1 : 0;

    try {
        const res = await apiCall(`/drawings/${_activeAlarmDrawing.id}/alarm`, 'POST', {
            trigger_type: triggerType,
            is_active: isActive
        });

        // Update local drawing object to reflect the change
        if (!_activeAlarmDrawing.alarms) _activeAlarmDrawing.alarms = [];
        _activeAlarmDrawing.alarms[0] = res;

        closeAlarmModal();
        redrawAllDrawings();
        alert('Allarme salvato con successo.');

        if (activeView === 'alarms') renderAlarmsView();
    } catch (err) {
        alert('Errore nel salvataggio dell\'allarme: ' + err.message);
    }
}


// --- Fundamental Data ---

function formatFloat(val) {
    if (val === null || val === undefined || val === '') return 'N/A';
    const num = parseFloat(val);
    if (isNaN(num)) return 'N/A';
    return num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(val) {
    if (val === null || val === undefined || val === '') return 'N/A';
    const num = parseFloat(val);
    if (isNaN(num)) return 'N/A';
    return (num * 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function formatDateVal(val) {
    if (val === null || val === undefined || val === '') return 'N/A';
    try {
        let dateObj;
        if (typeof val === 'number') {
            dateObj = new Date(val * 1000);
        } else {
            dateObj = new Date(val);
        }
        if (isNaN(dateObj.getTime())) return 'N/A';
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return 'N/A';
    }
}

function renderKeyStatisticsDashboard(data, container) {
    if (!container) return;
    container.innerHTML = '';
    
    let rawInfo = {};
    if (data && data.raw_info) {
        try {
            rawInfo = JSON.parse(data.raw_info);
        } catch (e) {
            console.error("Error parsing raw_info:", e);
        }
    }

    // Helper functions for fallback values
    const getVal = (rawKey, fallbackVal) => {
        if (rawInfo && rawInfo[rawKey] !== undefined && rawInfo[rawKey] !== null) {
            return rawInfo[rawKey];
        }
        return fallbackVal;
    };

    // Formatters
    const fmtLarge = (val) => formatLargeNumber(val);
    const fmtFloat = (val) => formatFloat(val);
    const fmtPercent = (val) => formatPercent(val);
    const fmtDate = (val) => formatDateVal(val);

    // Specific getter for dividend yield to handle current percent vs historical ratio
    const getDivYield = () => {
        if (rawInfo && rawInfo.dividendYield !== undefined && rawInfo.dividendYield !== null) {
            return parseFloat(rawInfo.dividendYield).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
        }
        if (data && data.dividend_yield !== undefined && data.dividend_yield !== null) {
            return (parseFloat(data.dividend_yield) * 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
        }
        return 'N/A';
    };

    const getDebtToEquity = () => {
        const val = getVal('debtToEquity');
        if (val !== undefined && val !== null && val !== '') {
            return parseFloat(val).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
        }
        return 'N/A';
    };

    const getExDivDate = () => {
        const val = getVal('exDividendDate') || getVal('lastDividendDate');
        return fmtDate(val);
    };

    // 1. MISURE DI VALUTAZIONE
    const valuationRows = [
        { label: 'Market Cap (Capitalizzazione)', value: fmtLarge(getVal('marketCap', data.market_cap)) },
        { label: 'Enterprise Value (Valore Impresa)', value: fmtLarge(getVal('enterpriseValue')) },
        { label: 'Trailing P/E (P/E Corrente)', value: fmtFloat(getVal('trailingPE', data.pe_ratio)) },
        { label: 'Forward P/E (P/E Prospettico)', value: fmtFloat(getVal('forwardPE', data.forward_pe)) },
        { label: 'PEG Ratio (5 anni previsti)', value: fmtFloat(getVal('pegRatio')) },
        { label: 'Price/Sales (Prezzo/Vendite ttm)', value: fmtFloat(getVal('priceToSalesTrailing12Months', data.ps_ratio)) },
        { label: 'Price/Book (Prezzo/Libro mrq)', value: fmtFloat(getVal('priceToBook', data.pb_ratio)) },
        { label: 'EV/Revenue (EV/Fatturato)', value: fmtFloat(getVal('enterpriseToRevenue')) },
        { label: 'EV/EBITDA (EV/EBITDA)', value: fmtFloat(getVal('enterpriseToEbitda')) }
    ];

    // 2. HIGHLIGHT FINANZIARI
    const highlightRows = [
        { isSubheading: true, label: 'Redditività ed Efficacia' },
        { label: 'Profit Margin (Margine Profitto)', value: fmtPercent(getVal('profitMargins', data.profit_margins)) },
        { label: 'Operating Margin (Margine Operativo ttm)', value: fmtPercent(getVal('operatingMargins', data.operating_margins)) },
        { label: 'Return on Assets (ROA ttm)', value: fmtPercent(getVal('returnOnAssets')) },
        { label: 'Return on Equity (ROE ttm)', value: fmtPercent(getVal('returnOnEquity')) },
        
        { isSubheading: true, label: 'Conto Economico' },
        { label: 'Revenue (Fatturato ttm)', value: fmtLarge(getVal('totalRevenue', data.total_revenue)) },
        { label: 'Revenue Per Share (Fatturato p. Azione)', value: fmtFloat(getVal('revenuePerShare')) },
        { label: 'Quarterly Revenue Growth (YoY)', value: fmtPercent(getVal('revenueGrowth', data.revenue_growth)) },
        { label: 'Gross Profit (Utile Lordo ttm)', value: fmtLarge(getVal('grossProfits')) },
        { label: 'Gross Margin (Margine Lordo)', value: fmtPercent(getVal('grossMargins', data.gross_margins)) },
        { label: 'EBITDA (ttm)', value: fmtLarge(getVal('ebitda')) },
        { label: 'Net Income (Utile Netto ttm)', value: fmtLarge(getVal('netIncomeToCommon')) },
        { label: 'Diluted EPS (EPS Diluito ttm)', value: fmtFloat(getVal('trailingEps', data.ttm_eps)) },
        { label: 'Quarterly Earnings Growth (YoY)', value: fmtPercent(getVal('earningsQuarterlyGrowth')) },
        
        { isSubheading: true, label: 'Stato Patrimoniale' },
        { label: 'Total Cash (Cassa Totale mrq)', value: fmtLarge(getVal('totalCash', data.total_cash)) },
        { label: 'Total Cash Per Share (Cassa p. Azione)', value: fmtFloat(getVal('totalCashPerShare')) },
        { label: 'Total Debt (Debito Totale mrq)', value: fmtLarge(getVal('totalDebt', data.total_debt)) },
        { label: 'Debt/Equity (Debito/Capitale mrq)', value: getDebtToEquity() },
        { label: 'Quick Ratio (mrq)', value: fmtFloat(getVal('quickRatio')) },
        { label: 'Current Ratio (mrq)', value: fmtFloat(getVal('currentRatio', data.current_ratio)) },
        { label: 'Book Value Per Share (mrq)', value: fmtFloat(getVal('bookValue', data.book_value)) },
        
        { isSubheading: true, label: 'Flussi di Cassa' },
        { label: 'Operating Cash Flow (ttm)', value: fmtLarge(getVal('operatingCashflow')) },
        { label: 'Levered Free Cash Flow (ttm)', value: fmtLarge(getVal('freeCashflow')) }
    ];

    // 3. INFORMAZIONI DI TRADING
    const tradingRows = [
        { isSubheading: true, label: 'Storico dei Prezzi' },
        { label: 'Beta (3 anni mensile)', value: fmtFloat(getVal('beta', data.beta)) },
        { label: '52-Week Change (Var. 52 Sett.)', value: fmtPercent(getVal('fiftyTwoWeekChangePercent', getVal('52WeekChange'))) },
        { label: 'S&P500 52-Week Change', value: fmtPercent(getVal('SandP52WeekChange')) },
        { label: '52-Week High (Massimo 52 Sett.)', value: fmtFloat(getVal('fiftyTwoWeekHigh')) },
        { label: '52-Week Low (Minimo 52 Sett.)', value: fmtFloat(getVal('fiftyTwoWeekLow')) },
        { label: '50-Day Moving Average', value: fmtFloat(getVal('fiftyDayAverage')) },
        { label: '200-Day Moving Average', value: fmtFloat(getVal('twoHundredDayAverage')) },
        
        { isSubheading: true, label: 'Statistiche delle Azioni' },
        { label: 'Avg Volume (3 mesi)', value: fmtLarge(getVal('averageVolume', getVal('averageDailyVolume3Month'))) },
        { label: 'Avg Volume (10 giorni)', value: fmtLarge(getVal('averageVolume10days', getVal('averageDailyVolume10Day'))) },
        { label: 'Shares Outstanding (Azioni Emesse)', value: fmtLarge(getVal('sharesOutstanding', data.shares)) },
        { label: 'Float (Azioni Flottanti)', value: fmtLarge(getVal('floatShares')) },
        { label: '% Insiders (% Poss. da Insider)', value: fmtPercent(getVal('heldPercentInsiders')) },
        { label: '% Institutions (% Poss. da Istituz.)', value: fmtPercent(getVal('heldPercentInstitutions')) },
        { label: 'Shares Short (Azioni Shortate)', value: fmtLarge(getVal('sharesShort')) },
        { label: 'Short Ratio', value: fmtFloat(getVal('shortRatio')) },
        { label: 'Short % of Float', value: fmtPercent(getVal('shortPercentOfFloat')) },
        { label: 'Shares Short (Prior Month)', value: fmtLarge(getVal('sharesShortPriorMonth')) },
        
        { isSubheading: true, label: 'Dividendi e Frazionamenti' },
        { label: 'Forward Annual Dividend Rate', value: fmtFloat(getVal('dividendRate')) },
        { label: 'Forward Annual Dividend Yield', value: getDivYield() },
        { label: 'Trailing Annual Dividend Rate', value: fmtFloat(getVal('trailingAnnualDividendRate')) },
        { label: 'Trailing Annual Dividend Yield', value: fmtPercent(getVal('trailingAnnualDividendYield')) },
        { label: '5 Year Avg Dividend Yield', value: fmtPercent(getVal('fiveYearAvgDividendYield')) },
        { label: 'Payout Ratio', value: fmtPercent(getVal('payoutRatio')) },
        { label: 'Dividend Date (Data Dividendo)', value: fmtDate(getVal('dividendDate')) },
        { label: 'Ex-Dividend Date (Data Ex-Div)', value: getExDivDate() },
        { label: 'Last Split Factor (Fattore Split)', value: getVal('lastSplitFactor') || 'N/A' },
        { label: 'Last Split Date (Data Split)', value: fmtDate(getVal('lastSplitDate')) }
    ];

    const generateTableHtml = (rows) => {
        let html = '<table class="fundamentals-table">';
        rows.forEach(r => {
            if (r.isSubheading) {
                html += `
                    <tr class="subheading-row">
                        <td colspan="2" class="fundamentals-table-subheading">${r.label}</td>
                    </tr>
                `;
            } else {
                html += `
                    <tr>
                        <td class="label-col">${r.label}</td>
                        <td class="value-col">${r.value}</td>
                    </tr>
                `;
            }
        });
        html += '</table>';
        return html;
    };

    const dashboardHtml = `
        <div class="fundamentals-sections-wrapper" style="width: 100%;">
            <div class="fundamentals-section-card">
                <h4>Misure di Valutazione</h4>
                ${generateTableHtml(valuationRows)}
            </div>
            <div class="fundamentals-section-card">
                <h4>Highlight Finanziari</h4>
                ${generateTableHtml(highlightRows)}
            </div>
            <div class="fundamentals-section-card">
                <h4>Informazioni di Trading</h4>
                ${generateTableHtml(tradingRows)}
            </div>
        </div>
    `;

    container.innerHTML = dashboardHtml;

    // Wire up search input
    const searchInput = document.getElementById('fundamentals-search-input');
    if (searchInput) {
        searchInput.oninput = () => {
            const query = searchInput.value.toLowerCase().trim();
            const cards = container.querySelectorAll('.fundamentals-section-card');
            
            cards.forEach(card => {
                const rows = card.querySelectorAll('.fundamentals-table tr');
                let cardHasVisibleRows = false;
                
                rows.forEach(row => {
                    if (row.classList.contains('subheading-row')) return;
                    
                    const label = row.querySelector('.label-col')?.textContent.toLowerCase() || '';
                    const value = row.querySelector('.value-col')?.textContent.toLowerCase() || '';
                    const match = label.includes(query) || value.includes(query);
                    
                    if (match) {
                        row.classList.remove('hidden-row');
                        cardHasVisibleRows = true;
                    } else {
                        row.classList.add('hidden-row');
                    }
                });
                
                // Show/hide subheadings dynamically based on matching items below them
                let currentSubheadingRow = null;
                let subheadingHasVisibleData = false;
                
                rows.forEach(row => {
                    if (row.classList.contains('subheading-row')) {
                        if (currentSubheadingRow) {
                            if (subheadingHasVisibleData) {
                                currentSubheadingRow.classList.remove('hidden-row');
                            } else {
                                currentSubheadingRow.classList.add('hidden-row');
                            }
                        }
                        currentSubheadingRow = row;
                        subheadingHasVisibleData = false;
                    } else {
                        if (!row.classList.contains('hidden-row')) {
                            subheadingHasVisibleData = true;
                        }
                    }
                });
                
                if (currentSubheadingRow) {
                    if (subheadingHasVisibleData) {
                        currentSubheadingRow.classList.remove('hidden-row');
                    } else {
                        currentSubheadingRow.classList.add('hidden-row');
                    }
                }
                
                if (query !== '' && !cardHasVisibleRows) {
                    card.style.display = 'none';
                } else {
                    card.style.display = 'block';
                }
            });
        };
        
        // Trigger initial filtering if search input has a value
        if (searchInput.value) {
            searchInput.oninput();
        }
    }
}

async function loadFundamentalData(symbol, forceUpdate = true) {
    if (!symbol) return;
    console.log("Loading fundamentals for:", symbol);
    try {
        const data = await apiCall(`/tickers/${symbol}/fundamentals`);
        console.log("Fundamentals data received:", data);
        const section = document.getElementById('ticker-fundamentals-section');

        if (!section) {
            console.error("Element #ticker-fundamentals-section not found!");
            return;
        }

        // Check configuration for reopening
        const autoReopen = localStorage.getItem('config_reopen_fundamentals') === 'true';
        const isCollapsed = localStorage.getItem('fundamentals_side_collapsed') === 'true';
        const icon = document.getElementById('fundamentals-toggle-icon');

        if (forceUpdate && (!data || !data.raw_info)) {
            console.log("No fundamental data or raw_info in DB, triggering update...");
            
            if (autoReopen || !isCollapsed) {
                section.classList.remove('hidden');
                if (icon) icon.textContent = '▲';
                if (autoReopen && isCollapsed) localStorage.setItem('fundamentals_side_collapsed', 'false');
            }
            
            document.getElementById('fundamental-ticker-symbol').textContent = symbol;
            document.getElementById('fundamentals-container').innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Recupero dati fondamentali in corso...</p>';
            updateFundamentalsManually(symbol);
            return;
        }

        if (!data) {
            // If data is null and forceUpdate was false
            document.getElementById('fundamentals-container').innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Nessun dato fondamentale disponibile.</p>';
            return;
        }

        // Check freshness: if older than 24h, update in background
        const lastUpdated = data.last_updated ? new Date(data.last_updated) : null;
        const now = new Date();
        const isOld = !lastUpdated || (now - lastUpdated) > (24 * 60 * 60 * 1000);

        if (isOld && forceUpdate) {
            console.log("Fundamental data is old, updating in background...");
            // Non-blocking update
            apiCall(`/tickers/${symbol}/fundamentals/update`, 'POST')
                .then(() => console.log("Background update complete for", symbol))
                .catch(err => console.error("Background update failed:", err));
        }

        if (autoReopen || !isCollapsed) {
            section.classList.remove('hidden');
            if (icon) icon.textContent = '▲';
            if (autoReopen && isCollapsed) localStorage.setItem('fundamentals_side_collapsed', 'false');
        }
        document.getElementById('fundamental-ticker-fullname').textContent = activeTickerName || symbol;
        document.getElementById('fundamental-ticker-symbol').textContent = symbol;
        const qDateEl = document.getElementById('fundamental-quarter-date');
        if (qDateEl) qDateEl.textContent = "(Trimestre: Oggi)";

        const lastUpdatedEl = document.getElementById('fundamental-last-updated');
        if (lastUpdatedEl && lastUpdated) {
            const day = String(lastUpdated.getDate()).padStart(2, '0');
            const month = String(lastUpdated.getMonth() + 1).padStart(2, '0');
            const year = lastUpdated.getFullYear();
            const hours = String(lastUpdated.getHours()).padStart(2, '0');
            const minutes = String(lastUpdated.getMinutes()).padStart(2, '0');
            const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;
            lastUpdatedEl.textContent = "Ultimo aggiornamento: " + formattedDate;
        }

        const container = document.getElementById('fundamentals-container');
        renderKeyStatisticsDashboard(data, container);

        document.getElementById('fundamental-summary').textContent = data.long_business_summary || '';
    } catch (err) {
        console.error("Error loading fundamentals:", err);
    }
}

async function loadHistoricalFundamentals(symbol, date) {
    if (!symbol || !date) return;
    console.log("Loading historical fundamentals for:", symbol, "on date:", date);
    try {
        const section = document.getElementById('ticker-fundamentals-section');
        if (!section) return;

        // Display loading indicator
        document.getElementById('fundamentals-container').innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Recupero dati fondamentali storici in corso...</p>';
        document.getElementById('fundamental-summary').textContent = '';
        
        // Expand the section if it was hidden
        const isCollapsed = section.classList.contains('hidden');
        const icon = document.getElementById('fundamentals-toggle-icon');
        if (isCollapsed) {
            section.classList.remove('hidden');
            if (icon) icon.textContent = '▲';
            localStorage.setItem('fundamentals_side_collapsed', 'false');
        }

        const data = await apiCall(`/tickers/${symbol}/fundamentals/historical?date=${date}`);
        console.log("Historical fundamentals data received:", data);

        document.getElementById('fundamental-ticker-fullname').textContent = activeTickerName || symbol;
        document.getElementById('fundamental-ticker-symbol').textContent = symbol;

        // Set quarter date element
        const qDateEl = document.getElementById('fundamental-quarter-date');
        if (qDateEl && data.quarter_date) {
            const qDate = new Date(data.quarter_date);
            const qStr = qDate.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
            let qNum = Math.floor(qDate.getMonth() / 3) + 1;
            qDateEl.textContent = `(Trimestre: Q${qNum} ${qDate.getFullYear()} - ${qStr})`;
        }

        const lastUpdatedEl = document.getElementById('fundamental-last-updated');
        if (lastUpdatedEl && data.last_updated) {
            const lastUpdated = new Date(data.last_updated);
            const day = String(lastUpdated.getDate()).padStart(2, '0');
            const month = String(lastUpdated.getMonth() + 1).padStart(2, '0');
            const year = lastUpdated.getFullYear();
            const hours = String(lastUpdated.getHours()).padStart(2, '0');
            const minutes = String(lastUpdated.getMinutes()).padStart(2, '0');
            const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;
            lastUpdatedEl.textContent = "Ultimo calcolo cache: " + formattedDate;
        }

        const container = document.getElementById('fundamentals-container');
        renderKeyStatisticsDashboard(data, container);

        document.getElementById('fundamental-summary').textContent = data.long_business_summary || '';
    } catch (err) {
        console.error("Error loading historical fundamentals:", err);
        document.getElementById('fundamentals-container').innerHTML = `<p style="padding: 20px; color: var(--danger-color);">Errore nel recupero dei dati storici: ${err.message}</p>`;
    }
}

function formatLargeNumber(num) {
    if (!num) return 'N/A';
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    return num.toLocaleString();
}

async function updateFundamentalsManually(symbol) {
    const targetSymbol = symbol || activeTicker;
    const isBulk = document.getElementById('update-fundamentals-list-checkbox')?.checked;

    if (isBulk && !activeListId) {
        alert("Seleziona una lista prima di aggiornare tutti i titoli.");
        return;
    }

    if (!targetSymbol && !isBulk) return;

    const btn = document.getElementById('update-fundamentals-btn');
    const originalText = btn.textContent;
    btn.textContent = isBulk ? 'Updating List...' : 'Updating...';
    btn.disabled = true;

    try {
        if (isBulk) {
            const idForApi = activeListId === 'all' ? 0 : activeListId;
            await apiCall(`/lists/${idForApi}/fundamentals/update`, 'POST');
            // After bulk update, reload data if we are in fundamental screening view
            if (activeView === 'screening' && activeTab === 'fundamental-screening') {
                runFundamentalScreening();
            }
            // Also reload current ticker if it was part of the update
            if (activeTicker) await loadFundamentalData(activeTicker);
        } else {
            await apiCall(`/tickers/${targetSymbol}/fundamentals/update`, 'POST');
            await loadFundamentalData(targetSymbol, false);
        }
    } catch (err) {
        alert("Errore aggiornamento: " + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function runFundamentalScreening() {
    if (!activeListId) {
        alert("Seleziona una lista prima.");
        return;
    }
    const btn = document.getElementById('run-fundamental-screening-btn');
    btn.disabled = true;
    btn.textContent = 'Loading...';
    try {
        const idForApi = activeListId === 'all' ? 0 : activeListId;
        const data = await apiCall(`/lists/${idForApi}/fundamentals`);
        renderFundamentalScreening(data);
    } catch (err) {
        alert("Errore screening fondamentali: " + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Carica Fondamentali';
    }
}

let fundamentalDataLastFetched = [];
let fundamentalSortState = { field: 'symbol', order: 'asc' };

// Column definitions for the Fundamental screening table
// type: 'text' (text filter), 'range' (min/max numeric filter)
// format: 'raw', 'large', 'float2', 'pct', 'date'
// rawKey: yfinance key in raw_info (defaults to field name if omitted)
// filterScale: divide stored value by this for filter input display
const FUNDAMENTAL_COLUMNS = [
    { field: 'symbol', label: 'Ticker', type: 'text' },

    // --- Misure di Valutazione ---
    { field: 'market_cap', label: 'Market Cap', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'marketCap' },
    { field: 'enterprise_value', label: 'Enterprise Value', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'enterpriseValue' },
    { field: 'pe_ratio', label: 'P/E', type: 'range', format: 'float2', rawKey: 'trailingPE' },
    { field: 'forward_pe', label: 'Fwd P/E', type: 'range', format: 'float2', rawKey: 'forwardPE' },
    { field: 'peg_ratio', label: 'PEG Ratio', type: 'range', format: 'float2', rawKey: 'pegRatio' },
    { field: 'ps_ratio', label: 'P/S', type: 'range', format: 'float2', rawKey: 'priceToSalesTrailing12Months' },
    { field: 'pb_ratio', label: 'P/B', type: 'range', format: 'float2', rawKey: 'priceToBook' },
    { field: 'ev_to_revenue', label: 'EV/Revenue', type: 'range', format: 'float2', rawKey: 'enterpriseToRevenue' },
    { field: 'ev_to_ebitda', label: 'EV/EBITDA', type: 'range', format: 'float2', rawKey: 'enterpriseToEbitda' },

    // --- Highlight Finanziari ---
    { field: 'profit_margins', label: 'Profit Margin', type: 'range', format: 'pct', rawKey: 'profitMargins' },
    { field: 'operating_margins', label: 'Op. Margin', type: 'range', format: 'pct', rawKey: 'operatingMargins' },
    { field: 'ebitda_margins', label: 'EBITDA Margin', type: 'range', format: 'pct', rawKey: 'ebitdaMargins' },
    { field: 'gross_margins', label: 'Gross Margin', type: 'range', format: 'pct', rawKey: 'grossMargins' },
    { field: 'return_on_assets', label: 'ROA', type: 'range', format: 'pct', rawKey: 'returnOnAssets' },
    { field: 'return_on_equity', label: 'ROE', type: 'range', format: 'pct', rawKey: 'returnOnEquity' },
    { field: 'total_revenue', label: 'Revenue', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'totalRevenue' },
    { field: 'revenue_per_share', label: 'Rev/Share', type: 'range', format: 'float2', rawKey: 'revenuePerShare' },
    { field: 'revenue_growth', label: 'Rev. Growth', type: 'range', format: 'pct', rawKey: 'revenueGrowth' },
    { field: 'gross_profits', label: 'Gross Profit', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'grossProfits' },
    { field: 'ebitda', label: 'EBITDA', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'ebitda' },
    { field: 'net_income', label: 'Net Income', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'netIncomeToCommon' },
    { field: 'ttm_eps', label: 'Diluted EPS', type: 'range', format: 'float2', rawKey: 'trailingEps' },
    { field: 'earnings_q_growth', label: 'Earnings Growth', type: 'range', format: 'pct', rawKey: 'earningsQuarterlyGrowth' },
    { field: 'total_cash', label: 'Total Cash', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'totalCash' },
    { field: 'cash_per_share', label: 'Cash/Share', type: 'range', format: 'float2', rawKey: 'totalCashPerShare' },
    { field: 'total_debt', label: 'Total Debt', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'totalDebt' },
    { field: 'debt_to_equity', label: 'D/E', type: 'range', format: 'pct', rawKey: 'debtToEquity' },
    { field: 'quick_ratio', label: 'Quick Ratio', type: 'range', format: 'float2', rawKey: 'quickRatio' },
    { field: 'current_ratio', label: 'Curr. Ratio', type: 'range', format: 'float2', rawKey: 'currentRatio' },
    { field: 'book_value', label: 'Book Value', type: 'range', format: 'float2', rawKey: 'bookValue' },
    { field: 'op_cashflow', label: 'Op. Cash Flow', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'operatingCashflow' },
    { field: 'free_cashflow', label: 'Free Cash Flow', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'freeCashflow' },

    // --- Informazioni di Trading ---
    { field: 'beta', label: 'Beta', type: 'range', format: 'float2', rawKey: 'beta' },
    { field: 'change_52w', label: '52W Change', type: 'range', format: 'pct', rawKey: 'fiftyTwoWeekChangePercent' },
    { field: 'sandp_52w_change', label: 'S&P 52W Change', type: 'range', format: 'pct', rawKey: 'SandP52WeekChange' },
    { field: 'high_52w', label: '52W High', type: 'range', format: 'float2', rawKey: 'fiftyTwoWeekHigh' },
    { field: 'low_52w', label: '52W Low', type: 'range', format: 'float2', rawKey: 'fiftyTwoWeekLow' },
    { field: 'ma_50d', label: '50D MA', type: 'range', format: 'float2', rawKey: 'fiftyDayAverage' },
    { field: 'ma_200d', label: '200D MA', type: 'range', format: 'float2', rawKey: 'twoHundredDayAverage' },
    { field: 'avg_vol_3m', label: 'Avg Vol 3M', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'averageVolume' },
    { field: 'avg_vol_10d', label: 'Avg Vol 10D', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'averageVolume10days' },
    { field: 'shares_out', label: 'Shares Out.', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'sharesOutstanding' },
    { field: 'float_shares', label: 'Float', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'floatShares' },
    { field: 'pct_insiders', label: '% Insiders', type: 'range', format: 'pct', rawKey: 'heldPercentInsiders' },
    { field: 'pct_institutions', label: '% Institutions', type: 'range', format: 'pct', rawKey: 'heldPercentInstitutions' },
    { field: 'shares_short', label: 'Short Shares', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'sharesShort' },
    { field: 'short_ratio', label: 'Short Ratio', type: 'range', format: 'float2', rawKey: 'shortRatio' },
    { field: 'short_pct_float', label: 'Short % Float', type: 'range', format: 'pct', rawKey: 'shortPercentOfFloat' },
    { field: 'shares_short_prior', label: 'Short Prior M', type: 'range', format: 'large', filterScale: 1e6, rawKey: 'sharesShortPriorMonth' },
    { field: 'dividend_yield', label: 'Div. Yield', type: 'range', format: 'pct', rawKey: 'dividendYield' },
    { field: 'div_rate_fwd', label: 'Fwd Div Rate', type: 'range', format: 'float2', rawKey: 'dividendRate' },
    { field: 'tr_div_rate', label: 'Tr. Div Rate', type: 'range', format: 'float2', rawKey: 'trailingAnnualDividendRate' },
    { field: 'tr_div_yield', label: 'Tr. Div Yield', type: 'range', format: 'pct', rawKey: 'trailingAnnualDividendYield' },
    { field: 'div_yield_5y', label: '5Y Avg Div Yield', type: 'range', format: 'pct', rawKey: 'fiveYearAvgDividendYield' },
    { field: 'payout_ratio', label: 'Payout Ratio', type: 'range', format: 'pct', rawKey: 'payoutRatio' },
    { field: 'div_date', label: 'Div Date', type: 'text', format: 'date', rawKey: 'dividendDate' },
    { field: 'ex_div_date', label: 'Ex-Div Date', type: 'text', format: 'date', rawKey: 'exDividendDate' },
    { field: 'split_factor', label: 'Split Factor', type: 'text', format: 'raw', rawKey: 'lastSplitFactor' },
    { field: 'split_date', label: 'Split Date', type: 'text', format: 'date', rawKey: 'lastSplitDate' },
    { field: 'sector', label: 'Settore', type: 'text', rawKey: 'sector' },
    { field: 'industry', label: 'Industria', type: 'text', rawKey: 'industry' },
];

function formatFundValue(val, format) {
    if (val === null || val === undefined || val === '') return 'N/A';
    const num = Number(val);
    if (format === 'large') return formatLargeNumber(num);
    if (format === 'float2') {
        if (isNaN(num)) return 'N/A';
        return num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (format === 'pct') {
        if (isNaN(num)) return 'N/A';
        return (num * 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    }
    if (format === 'date') {
        if (!val) return 'N/A';
        try {
            let d = typeof val === 'number' ? new Date(val * 1000) : new Date(val);
            if (isNaN(d.getTime())) return 'N/A';
            return d.toLocaleDateString('it-IT');
        } catch (e) { return 'N/A'; }
    }
    return String(val);
}

function buildFundamentalHeaders() {
    const thead = document.querySelector('#fundamental-screening-table thead');
    if (!thead) return;
    let sortRow = '<tr class="sort-row" id="fundamental-sort-row">';
    let filterRow = '<tr class="filter-row">';
    FUNDAMENTAL_COLUMNS.forEach(col => {
        sortRow += `<th data-sort="${col.field}" style="cursor:pointer; user-select:none;">${col.label} <span class="sort-icon">↕</span></th>`;
        if (col.type === 'text') {
            filterRow += `<th><input type="text" placeholder="Filtra..." class="fund-filter-text" data-field="${col.field}"></th>`;
        } else {
            filterRow += `<th><div class="range-filter"><input type="number" placeholder="Min" step="any" class="fund-filter-min" data-field="${col.field}"><input type="number" placeholder="Max" step="any" class="fund-filter-max" data-field="${col.field}"></div></th>`;
        }
    });
    sortRow += '</tr>';
    filterRow += '</tr>';
    thead.innerHTML = sortRow + '\n' + filterRow;
}

function enrichFundamentalData(data) {
    return data.map(item => {
        if (!item.raw_info) return item;
        try {
            const raw = JSON.parse(item.raw_info);
            FUNDAMENTAL_COLUMNS.forEach(col => {
                const rawKey = col.rawKey || col.field;
                if (item[col.field] !== undefined && item[col.field] !== null) return;
                let val;
                if (raw[rawKey] !== undefined && raw[rawKey] !== null) {
                    val = raw[rawKey];
                } else if (col.field !== rawKey && raw[rawKey] !== undefined && raw[rawKey] !== null) {
                    val = raw[rawKey];
                }
                if (val !== undefined) {
                    if (col.field === 'dividend_yield' && rawKey === 'dividendYield') {
                        val = parseFloat(val) / 100;
                    }
                    item[col.field] = val;
                }
            });
            // Fallbacks for fields with alternative yfinance keys
            if (item.change_52w === undefined || item.change_52w === null) {
                item.change_52w = raw.fiftyTwoWeekChangePercent;
            }
            if ((item.change_52w === undefined || item.change_52w === null) && raw['52WeekChange'] !== undefined) {
                item.change_52w = raw['52WeekChange'];
            }
            if ((item.avg_vol_3m === undefined || item.avg_vol_3m === null) && raw.averageDailyVolume3Month !== undefined) {
                item.avg_vol_3m = raw.averageDailyVolume3Month;
            }
            if ((item.avg_vol_10d === undefined || item.avg_vol_10d === null) && raw.averageDailyVolume10Day !== undefined) {
                item.avg_vol_10d = raw.averageDailyVolume10Day;
            }
            if ((item.ex_div_date === undefined || item.ex_div_date === null) && raw.lastDividendDate !== undefined) {
                item.ex_div_date = raw.lastDividendDate;
            }
        } catch (e) {}
        return item;
    });
}

function renderFundamentalScreening(data) {
    if (subUniverseSymbols && subUniverseSymbols.length > 0) {
        fundamentalDataLastFetched = data.filter(d => subUniverseSymbols.includes(d.symbol));
    } else {
        fundamentalDataLastFetched = data;
    }

    fundamentalDataLastFetched = enrichFundamentalData(fundamentalDataLastFetched);

    buildFundamentalHeaders();

    // Initialize icons
    const headers = document.querySelectorAll('#fundamental-sort-row th[data-sort]');
    headers.forEach(h => {
        const icon = h.querySelector('.sort-icon');
        if (icon) {
            if (h.dataset.sort === fundamentalSortState.field) {
                icon.textContent = fundamentalSortState.order === 'asc' ? '↑' : '↓';
                icon.style.opacity = '1';
            } else {
                icon.textContent = '↕';
                icon.style.opacity = '0.5';
            }
        }
    });

    setupFundamentalFilters();
    setupFundamentalSortListeners();
    applyFundamentalSortAndFilter();
}

function setupFundamentalSortListeners() {
    const headers = document.querySelectorAll('#fundamental-sort-row th[data-sort]');
    headers.forEach(th => {
        th.onclick = () => {
            const field = th.dataset.sort;
            if (fundamentalSortState.field === field) {
                fundamentalSortState.order = fundamentalSortState.order === 'asc' ? 'desc' : 'asc';
            } else {
                fundamentalSortState.field = field;
                fundamentalSortState.order = 'asc';
            }

            headers.forEach(h => {
                const icon = h.querySelector('.sort-icon');
                if (icon) {
                    if (h.dataset.sort === fundamentalSortState.field) {
                        icon.textContent = fundamentalSortState.order === 'asc' ? '↑' : '↓';
                        icon.style.opacity = '1';
                    } else {
                        icon.textContent = '↕';
                        icon.style.opacity = '0.5';
                    }
                }
            });

            applyFundamentalSortAndFilter();
        };
    });
}

function setupFundamentalFilters() {
    const filters = document.querySelectorAll('.fund-filter-text, .fund-filter-min, .fund-filter-max');
    filters.forEach(input => {
        input.oninput = () => applyFundamentalSortAndFilter();
    });
}

function applyFundamentalSortAndFilter() {
    const allData = fundamentalDataLastFetched;

    // Build text filters map { field: lowerCaseValue }
    const textFilters = {};
    document.querySelectorAll('.fund-filter-text').forEach(el => {
        textFilters[el.dataset.field] = el.value.toLowerCase();
    });

    // Build range filters map { field: { min, max } }
    const rangeFilters = {};
    FUNDAMENTAL_COLUMNS.forEach(col => {
        if (col.type !== 'range') return;
        const minEl = document.querySelector(`.fund-filter-min[data-field="${col.field}"]`);
        const maxEl = document.querySelector(`.fund-filter-max[data-field="${col.field}"]`);
        if (!minEl || !maxEl) return;
        rangeFilters[col.field] = {
            min: parseFloat(minEl.value) || -Infinity,
            max: parseFloat(maxEl.value) || Infinity
        };
    });

    const filtered = allData.filter(item => {
        // Check all text filters
        for (const [field, filterVal] of Object.entries(textFilters)) {
            if (!filterVal) continue;
            const col = FUNDAMENTAL_COLUMNS.find(c => c.field === field);
            if (!col) continue;
            const val = item[field];
            if (!String(val || '').toLowerCase().includes(filterVal)) return false;
        }

        // Check all range filters
        for (const [field, range] of Object.entries(rangeFilters)) {
            let raw = item[field];
            if (raw === undefined || raw === null) {
                if (range.max === Infinity) continue;
                raw = 0;
            }
            const col = FUNDAMENTAL_COLUMNS.find(c => c.field === field);
            if (!col) continue;

            let val = Number(raw);
            if (col.format === 'pct') {
                val = val * 100;
            } else if (col.filterScale) {
                val = val / col.filterScale;
            }
            if (val < range.min || val > range.max) return false;
        }

        return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
        const field = fundamentalSortState.field;
        let valA = a[field];
        let valB = b[field];

        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';

        let cmp = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
            cmp = valA - valB;
        } else {
            cmp = String(valA).localeCompare(String(valB));
        }

        return fundamentalSortState.order === 'asc' ? cmp : -cmp;
    });

    // Re-render only body
    const body = document.getElementById('fundamental-screening-body');
    body.innerHTML = '';
    document.getElementById('fundamental-row-count').textContent = filtered.length;

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = () => {
            activeView = 'monitoring';
            activeTicker = item.symbol;
            document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === 'monitoring'));
            document.querySelectorAll('.view-container').forEach(v => v.classList.toggle('hidden', v.id !== 'monitoring-view'));
            const slotSelect = document.querySelector(`.chart-slot-ticker[data-slot="${activeChartIndex}"]`);
            if (slotSelect) slotSelect.value = item.symbol;
            updateChart(item.symbol);
        };
        let cells = '';
        FUNDAMENTAL_COLUMNS.forEach(col => {
            let val = item[col.field];
            cells += `<td>${formatFundValue(val, col.format)}</td>`;
        });
        tr.innerHTML = cells;
        body.appendChild(tr);
    });

    // Update global state for "Salva Lista"
    lastFilteredSymbols = filtered.map(item => item.symbol);
    updateSaveListButtonsVisibility();
}

// --- Ticker Mapping Management ---

let allTickerMappings = [];
let mappingSort = { col: 'symbol_yahoo', order: 'asc' };
let mappingFilters = { yahoo: '', investing: '', name: '' };

async function loadTickerMappings() {
    const body = document.getElementById('ticker-mapping-body');
    const status = document.getElementById('mapping-status');
    if (!body) return;

    body.innerHTML = '<tr><td colspan="5">Caricamento in corso...</td></tr>';
    status.textContent = "Caricamento...";

    try {
        allTickerMappings = await apiCall('/tickers/mapping/');
        renderTickerMappings();
    } catch (err) {
        body.innerHTML = `<tr><td colspan="5" style="color:var(--danger-color)">Errore: ${err.message}</td></tr>`;
        status.textContent = "Errore caricamento.";
    }
}

function renderTickerMappings() {
    const body = document.getElementById('ticker-mapping-body');
    const status = document.getElementById('mapping-status');
    if (!body) return;

    // 1. Filter
    let filtered = allTickerMappings.filter(m => {
        const matchYahoo = m.symbol_yahoo.toLowerCase().includes(mappingFilters.yahoo.toLowerCase());
        const matchInvesting = m.symbol_investing.toLowerCase().includes(mappingFilters.investing.toLowerCase());
        const matchName = (m.name || '').toLowerCase().includes(mappingFilters.name.toLowerCase());
        return matchYahoo && matchInvesting && matchName;
    });

    // 2. Sort
    filtered.sort((a, b) => {
        let valA = a[mappingSort.col] || '';
        let valB = b[mappingSort.col] || '';
        if (mappingSort.col === 'last_updated') {
            valA = new Date(valA).getTime();
            valB = new Date(valB).getTime();
        } else {
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();
        }
        if (valA < valB) return mappingSort.order === 'asc' ? -1 : 1;
        if (valA > valB) return mappingSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    // 3. Render
    body.innerHTML = '';
    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-secondary);">Nessun mapping trovato o nessun risultato per i filtri.</td></tr>';
        status.textContent = "Nessun dato.";
        return;
    }

    filtered.forEach(m => {
        const tr = document.createElement('tr');
        const d = new Date(m.last_updated);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;

        tr.innerHTML = `
            <td><strong>${m.symbol_yahoo}</strong></td>
            <td>${m.symbol_investing}</td>
            <td>${m.name || '-'}</td>
            <td style="font-size:0.8rem; color:#8b949e;">${formattedDate}</td>
            <td style="white-space:nowrap;">
                <button class="mapping-edit-btn secondary" style="padding: 2px 8px; font-size: 0.8rem; margin-right: 5px;" title="Modifica">✏️</button>
                <button class="mapping-delete-btn" style="background-color: var(--danger-color); padding: 2px 8px; font-size: 0.8rem;" title="Elimina">🗑️</button>
            </td>
        `;

        // Add event listeners to avoid JSON.stringify issues
        tr.querySelector('.mapping-edit-btn').addEventListener('click', () => editTickerMapping(m));
        tr.querySelector('.mapping-delete-btn').addEventListener('click', () => deleteTickerMapping(m.id));

        body.appendChild(tr);
    });
    status.textContent = `${filtered.length} mapping visualizzati.`;
    updateMappingSortIcons();
}

function toggleMappingSort(col) {
    if (mappingSort.col === col) {
        mappingSort.order = mappingSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        mappingSort.col = col;
        mappingSort.order = 'asc';
    }
    renderTickerMappings();
}

function updateMappingSortIcons() {
    ['symbol_yahoo', 'symbol_investing', 'name', 'last_updated'].forEach(col => {
        const icon = document.getElementById(`sort-icon-${col}`);
        if (!icon) return;
        if (mappingSort.col === col) {
            icon.textContent = mappingSort.order === 'asc' ? ' ↑' : ' ↓';
            icon.style.color = 'var(--accent-color)';
        } else {
            icon.textContent = '';
        }
    });
}

function applyMappingFilters() {
    mappingFilters.yahoo = document.getElementById('filter-mapping-yahoo').value;
    mappingFilters.investing = document.getElementById('filter-mapping-investing').value;
    mappingFilters.name = document.getElementById('filter-mapping-name').value;
    renderTickerMappings();
}

async function deleteTickerMapping(id) {
    if (!confirm("Sei sicuro di voler eliminare questa associazione?")) return;
    try {
        await apiCall(`/tickers/mapping/${id}`, 'DELETE');
        loadTickerMappings();
        refreshTickerMappingsLookup(); // Update lookup Map immediately
    } catch (err) {
        alert("Errore eliminazione: " + err.message);
    }
}

function editTickerMapping(m) {
    document.getElementById('manual-yahoo-ticker').value = m.symbol_yahoo;
    document.getElementById('manual-investing-ticker').value = m.symbol_investing;
    document.getElementById('manual-mapping-name').value = m.name || '';
    // Focus Yahoo input
    document.getElementById('manual-yahoo-ticker').focus();
    // Smooth scroll to top of maintenance mappings
    document.getElementById('maintenance-mappings').scrollIntoView({ behavior: 'smooth' });
}

async function exportTickerMappings() {
    try {
        const response = await fetch('/tickers/mapping/export/');
        if (!response.ok) throw new Error("Errore nell'esportazione");

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ticker_mappings.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (err) {
        alert("Errore esportazione: " + err.message);
    }
}

async function importTickerMappings(file) {
    if (!file) return;
    const status = document.getElementById('mapping-status');
    status.textContent = "Importazione in corso...";

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await apiCall('/tickers/mapping/import/', 'POST', formData);
        alert(res.message);
        loadTickerMappings();
    } catch (err) {
        alert("Errore importazione: " + err.message);
        status.textContent = "Errore importazione.";
    }
}

// Maintenance View Tab Switching
function setupMaintenanceTabs() {
    const tabs = document.querySelectorAll('[data-maintenance-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab header
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding content
            const targetId = tab.dataset.maintenanceTab;
            document.querySelectorAll('.maintenance-tab-content').forEach(content => {
                content.style.display = content.id === targetId ? 'block' : 'none';
            });

            // If it's the mapping tab, load data automatically
            if (targetId === 'maintenance-mappings') {
                loadTickerMappings();
            }
        });
    });
}

// Global initialization or listeners
// --- FINAL CONSOLIDATED ENTRY POINT ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Critical functional loads
    await loadLists(); // Prioritized
    await loadIndices();
    await loadPortfolios();

    // 2. Component initialization
    initApp();
    initInvestingLogic();
    setupMaintenanceTabs();

    // Initialize flatpickr instances
    if (typeof flatpickr !== 'undefined') {
        flatpickr.localize(flatpickr.l10ns.it); // use Italian locale
        
        deleteStartDatePickr = flatpickr("#delete-start-date", {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/Y",
            allowInput: true
        });

        transDatePickr = flatpickr("#trans-date", {
            enableTime: true,
            dateFormat: "Y-m-dTH:i:S",
            altInput: true,
            altFormat: "d/m/Y H:i",
            time_24hr: true,
            allowInput: true,
            onChange: function(selectedDates, dateStr, instance) {
                updateAutomaticExchangeRate();
            }
        });

        cashDatePickr = flatpickr("#cash-date", {
            enableTime: true,
            dateFormat: "Y-m-dTH:i:S",
            altInput: true,
            altFormat: "d/m/Y H:i",
            time_24hr: true,
            allowInput: true
        });
    }

    // 3. Global mapping listeners
    document.getElementById('refresh-mappings-btn')?.addEventListener('click', loadTickerMappings);
    document.getElementById('export-mapping-csv-btn')?.addEventListener('click', exportTickerMappings);
    document.getElementById('import-mapping-csv')?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importTickerMappings(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.getElementById('add-manual-mapping-btn')?.addEventListener('click', addManualMapping);

    document.getElementById('trans-currency')?.addEventListener('change', updateAutomaticExchangeRate);
    document.getElementById('trans-date')?.addEventListener('change', updateAutomaticExchangeRate);
});

async function addManualMapping() {
    const yahooInp = document.getElementById('manual-yahoo-ticker');
    const invInp = document.getElementById('manual-investing-ticker');
    const nameInp = document.getElementById('manual-mapping-name');

    const symbol_yahoo = yahooInp.value.trim().toUpperCase();
    const symbol_investing = invInp.value.trim();
    const name = nameInp.value.trim() || null;

    if (!symbol_yahoo || !symbol_investing) {
        alert("Inserisci sia il ticker Yahoo che quello Investing.");
        return;
    }

    try {
        await apiCall('/tickers/mapping/', 'POST', {
            symbol_yahoo,
            symbol_investing,
            name
        });

        // Clear inputs
        yahooInp.value = '';
        invInp.value = '';
        nameInp.value = '';

        // Refresh table and lookup Map
        loadTickerMappings();
        refreshTickerMappingsLookup();
        alert("Associazione salvata con successo.");
    } catch (err) {
        alert("Errore nel salvataggio: " + err.message);
    }
}

function goToTicker(symbol) {
    showTickerDetails(symbol);
}

// === Portfolio Tracking Logic ===

let activePortfolioId = null;
let activePortfolioBaseCurrency = 'EUR';
let commissionPlans = [];
let portfoliosMap = new Map();
let currentTransactions = [];
let editingTransactionId = null;
let transDatePickr = null;
let cashDatePickr = null;
let deleteStartDatePickr = null;

async function initPortfolioView() {
    await loadPortfolios();
    await loadCommissionPlans();
}

async function loadPortfolios() {
    try {
        const response = await fetch('/portfolios/');
        const portfolios = await response.json();
        portfoliosMap.clear();
        portfolios.forEach(p => {
            portfoliosMap.set(p.id, p.name);
        });
        const select = document.getElementById('portfolio-select');
        if (select) {
            const currentVal = select.value;
            select.innerHTML = '<option value="">Seleziona Portafoglio...</option>';
            portfolios.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${p.base_currency})`;
                select.appendChild(opt);
            });
            if (currentVal) select.value = currentVal;
        }
    } catch (err) {
        console.error("Error loading portfolios:", err);
    }
}

async function loadCommissionPlans() {
    try {
        const response = await fetch('/commission_plans/');
        commissionPlans = await response.json();
        renderCommissionPlansTable();
        
        // Update transaction modal dropdown
        const transSelect = document.getElementById('trans-commission-plan');
        transSelect.innerHTML = '<option value="">Nessuno (0.00)</option>';
        commissionPlans.forEach(plan => {
            const opt = document.createElement('option');
            opt.value = plan.id;
            const details = plan.type === 'absolute' ? `${plan.fixed_fee} ${plan.currency}` : `${plan.percentage}% (min ${plan.min_fee}, max ${plan.max_fee})`;
            opt.textContent = `${plan.name} [${details}]`;
            transSelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Error loading commission plans:", err);
    }
}

function renderCommissionPlansTable() {
    const tbody = document.getElementById('commission-plans-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    commissionPlans.forEach(plan => {
        const tr = document.createElement('tr');
        const details = plan.type === 'absolute' ? 
            `${plan.fixed_fee} ${plan.currency}` : 
            `${plan.percentage}% (min ${plan.min_fee}, max ${plan.max_fee}) ${plan.currency}`;
        
        tr.innerHTML = `
            <td style="padding: 5px;">${plan.name}</td>
            <td style="padding: 5px;">${plan.type}</td>
            <td style="padding: 5px; text-align: right;">${details}</td>
            <td style="padding: 5px; text-align: center;">
                <button class="header-btn danger small" onclick="deleteCommissionPlan(${plan.id})">Elimina</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteCommissionPlan(id) {
    if (!confirm("Sei sicuro di voler eliminare questo piano commissionale?")) return;
    try {
        await fetch(`/commission_plans/${id}`, { method: 'DELETE' });
        loadCommissionPlans();
    } catch (err) {
        alert("Errore nell'eliminazione: " + err.message);
    }
}

// Event Listeners for Portfolio Select
if (document.getElementById('portfolio-select')) {
    document.getElementById('portfolio-select').addEventListener('change', (e) => {
        activePortfolioId = e.target.value;
        if (activePortfolioId) {
            document.getElementById('portfolio-summary-dashboard').style.display = 'grid';
            document.getElementById('portfolio-actions').style.display = 'flex';
            document.getElementById('portfolio-positions-container').style.display = 'block';
            document.getElementById('portfolio-history-container').style.display = 'block';
            refreshPortfolio();
        } else {
            document.getElementById('portfolio-summary-dashboard').style.display = 'none';
            document.getElementById('portfolio-actions').style.display = 'none';
            document.getElementById('portfolio-positions-container').style.display = 'none';
            document.getElementById('portfolio-history-container').style.display = 'none';
        }
    });
}

async function refreshPortfolio() {
    if (!activePortfolioId) return;
    try {
        const response = await fetch(`/portfolios/${activePortfolioId}/summary`);
        const data = await response.json();
        renderPortfolioSummary(data);
        loadTransactionsHistory();
    } catch (err) {
        console.error("Error refreshing portfolio:", err);
    }
}

function renderPortfolioSummary(data) {
    const summary = data.summary;
    const portfolio = data.portfolio;
    const curr = portfolio.base_currency;
    activePortfolioBaseCurrency = curr;

    document.getElementById('portfolio-cash-display').textContent = `${portfolio.cash_balance.toFixed(2)} ${curr}`;
    document.getElementById('portfolio-value-display').textContent = `${summary.total_current_value.toFixed(2)} ${curr}`;
    document.getElementById('portfolio-net-display').textContent = `${summary.net_liquidity.toFixed(2)} ${curr}`;
    
    const unPnl = summary.total_unrealized_pl;
    const unEl = document.getElementById('portfolio-unrealized-display');
    unEl.textContent = `${unPnl.toFixed(2)} ${curr}`;
    unEl.style.color = unPnl >= 0 ? 'var(--up-color)' : 'var(--down-color)';

    const rePnl = summary.total_realized_pl;
    const reEl = document.getElementById('portfolio-realized-display');
    reEl.textContent = `${rePnl.toFixed(2)} ${curr}`;
    reEl.style.color = rePnl >= 0 ? 'var(--up-color)' : 'var(--down-color)';

    currentPortfolioPositions = data.positions;
    renderPortfolioPositions();
}

function renderPortfolioPositions() {
    const tbody = document.getElementById('portfolio-positions-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const curr = activePortfolioBaseCurrency;
    
    const filters = {
        ticker: document.getElementById('pos-filter-ticker')?.value.toLowerCase() || '',
        qty: document.getElementById('pos-filter-qty')?.value.toLowerCase() || '',
        pmcBase: document.getElementById('pos-filter-pmc-base')?.value.toLowerCase() || '',
        pmcVal: document.getElementById('pos-filter-pmc-val')?.value.toLowerCase() || '',
        price: document.getElementById('pos-filter-price')?.value.toLowerCase() || '',
        valueBase: document.getElementById('pos-filter-value-base')?.value.toLowerCase() || '',
        valueVal: document.getElementById('pos-filter-value-val')?.value.toLowerCase() || '',
        pnlBase: document.getElementById('pos-filter-pnl-base')?.value.toLowerCase() || '',
        pnlVal: document.getElementById('pos-filter-pnl-val')?.value.toLowerCase() || ''
    };

    const filtered = currentPortfolioPositions.filter(pos => {
        if (filters.ticker && (!pos.ticker || !pos.ticker.toLowerCase().includes(filters.ticker))) return false;
        if (filters.qty && (pos.quantity == null || !pos.quantity.toFixed(0).includes(filters.qty))) return false;
        if (filters.pmcBase && (pos.pmc == null || !pos.pmc.toFixed(2).includes(filters.pmcBase))) return false;
        if (filters.pmcVal && !(pos.pmc_instrument ?? 0).toFixed(2).includes(filters.pmcVal)) return false;
        if (filters.price && (pos.current_price == null || !pos.current_price.toFixed(2).includes(filters.price))) return false;
        if (filters.valueBase && (pos.current_value == null || !pos.current_value.toFixed(2).includes(filters.valueBase))) return false;
        if (filters.valueVal && (pos.current_value_instrument == null || !pos.current_value_instrument.toFixed(2).includes(filters.valueVal))) return false;
        if (filters.pnlBase && (pos.unrealized_pl == null || !pos.unrealized_pl.toFixed(2).includes(filters.pnlBase))) return false;
        if (filters.pnlVal && !(pos.unrealized_pl_instrument ?? 0).toFixed(2).includes(filters.pnlVal)) return false;
        return true;
    });

    filtered.forEach(pos => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = () => goToTicker(pos.ticker);
        
        const pnl = pos.unrealized_pl;
        const pnlColor = pnl >= 0 ? 'var(--up-color)' : 'var(--down-color)';
        
        const pnlInstrument = pos.unrealized_pl_instrument ?? 0.0;
        const pnlInstrumentColor = pnlInstrument >= 0 ? 'var(--up-color)' : 'var(--down-color)';
        const instrumentCurrency = pos.currency || curr;
        const pmcInstrument = pos.pmc_instrument ?? 0.0;
        
        tr.innerHTML = `
            <td><a href="#" class="ticker-link" onclick="event.stopPropagation(); event.preventDefault(); goToTicker('${pos.ticker}')">${pos.ticker}</a></td>
            <td>${pos.quantity.toFixed(0)}</td>
            <td>${pos.pmc.toFixed(2)} ${curr}</td>
            <td>${pmcInstrument.toFixed(2)} ${instrumentCurrency}</td>
            <td>${pos.current_price.toFixed(2)} ${instrumentCurrency}</td>
            <td>${pos.current_value.toFixed(2)} ${curr}</td>
            <td>${(pos.current_value_instrument ?? 0).toFixed(2)} ${instrumentCurrency}</td>
            <td style="color: ${pnlColor}; font-weight: bold;">${pnl.toFixed(2)} ${curr}</td>
            <td style="color: ${pnlInstrumentColor}; font-weight: bold;">${pnlInstrument.toFixed(2)} ${instrumentCurrency}</td>
            <td>
                <button class="header-btn danger small" onclick="event.stopPropagation(); closePositionModal('${pos.ticker}', ${pos.quantity}, ${pos.current_price})">Chiudi</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function loadTransactionsHistory() {
    if (!activePortfolioId) return;
    try {
        const response = await fetch(`/portfolios/${activePortfolioId}/transactions/`);
        const transactions = await response.json();
        currentTransactions = transactions;
        renderPortfolioHistory();
    } catch (err) {
        console.error("Error loading history:", err);
    }
}

function renderPortfolioHistory() {
    const tbody = document.getElementById('portfolio-history-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filters = {
        date: document.getElementById('hist-filter-date')?.value.toLowerCase() || '',
        ticker: document.getElementById('hist-filter-ticker')?.value.toLowerCase() || '',
        type: document.getElementById('hist-filter-type')?.value.toLowerCase() || '',
        qty: document.getElementById('hist-filter-qty')?.value.toLowerCase() || '',
        price: document.getElementById('hist-filter-price')?.value.toLowerCase() || '',
        cvBase: document.getElementById('hist-filter-cv-base')?.value.toLowerCase() || '',
        cvVal: document.getElementById('hist-filter-cv-val')?.value.toLowerCase() || '',
        currency: document.getElementById('hist-filter-currency')?.value.toLowerCase() || '',
        fx: document.getElementById('hist-filter-fx')?.value.toLowerCase() || '',
        comm: document.getElementById('hist-filter-comm')?.value.toLowerCase() || ''
    };

    const filtered = currentTransactions.filter(t => {
        const d = new Date(t.date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;

        const cvVal = (t.price || 0) * (t.quantity || 0);
        const cvBase = cvVal * (t.exchange_rate || 1.0);

        if (filters.date && !formattedDate.toLowerCase().includes(filters.date)) return false;
        if (filters.ticker && (!t.ticker || !t.ticker.toLowerCase().includes(filters.ticker))) return false;
        if (filters.type && (!t.type || !t.type.toLowerCase().includes(filters.type))) return false;
        if (filters.qty && (t.quantity == null || !t.quantity.toFixed(0).includes(filters.qty))) return false;
        if (filters.price && (t.price == null || !t.price.toFixed(4).includes(filters.price))) return false;
        if (filters.cvBase && !cvBase.toFixed(2).includes(filters.cvBase)) return false;
        if (filters.cvVal && !cvVal.toFixed(2).includes(filters.cvVal)) return false;
        if (filters.currency && (!t.instrument_currency || !t.instrument_currency.toLowerCase().includes(filters.currency))) return false;
        if (filters.fx && (t.exchange_rate == null || !t.exchange_rate.toFixed(4).includes(filters.fx))) return false;
        if (filters.comm && (t.commission == null || !t.commission.toFixed(2).includes(filters.comm))) return false;
        return true;
    });

    filtered.forEach(t => {
            const tr = document.createElement('tr');
            const d = new Date(t.date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;
            const tickerHtml = t.ticker ? `<a href="#" class="ticker-link" onclick="event.preventDefault(); goToTicker('${t.ticker}')">${t.ticker}</a>` : '-';
            const cvVal = (t.price || 0) * (t.quantity || 0);
            const cvBase = cvVal * (t.exchange_rate || 1.0);
            
            tr.innerHTML = `
                <td>${formattedDate}</td>
                <td>${tickerHtml}</td>
                <td><span class="badge" style="background: ${getTransTypeColor(t.type)}; border-radius: 4px; padding: 2px 6px; font-size: 0.75rem;">${t.type}</span></td>
                <td>${t.quantity.toFixed(0)}</td>
                <td>${t.price.toFixed(2)}</td>
                <td>${cvBase.toFixed(2)}</td>
                <td>${cvVal.toFixed(2)}</td>
                <td>${t.instrument_currency}</td>
                <td>${t.exchange_rate.toFixed(4)}</td>
                <td>${t.commission_paid.toFixed(2)}</td>
                <td>
                    <button class="header-btn secondary small" style="margin-right: 4px;" onclick="openEditTransactionModal(${t.id})">Mod</button>
                    <button class="header-btn danger small" onclick="deleteTransaction(${t.id})">Del</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
}

function getTransTypeColor(type) {
    switch (type) {
        case 'BUY': return 'var(--up-color)';
        case 'SELL': return 'var(--down-color)';
        case 'SHORT': return '#ffa726';
        case 'COVER': return '#66bb6a';
        case 'DEPOSIT': return 'var(--accent-color)';
        case 'WITHDRAWAL': return '#78909c';
        default: return '#888';
    }
}

async function deleteTransaction(id) {
    if (!confirm("Sei sicuro di voler eliminare questa transazione? Il saldo cash verrà ripristinato.")) return;
    try {
        await fetch(`/transactions/${id}`, { method: 'DELETE' });
        refreshPortfolio();
    } catch (err) {
        alert("Errore nell'eliminazione: " + err.message);
    }
}

// Modal Toggle Handlers
if (document.getElementById('create-portfolio-btn')) {
    document.getElementById('create-portfolio-btn').onclick = () => {
        document.getElementById('create-portfolio-modal').classList.remove('hidden');
    };
}

async function deletePortfolio() {
    if (!activePortfolioId) {
        alert("Seleziona prima un portafoglio da eliminare.");
        return;
    }
    const select = document.getElementById('portfolio-select');
    const portfolioName = select.options[select.selectedIndex].text;
    if (!confirm(`Sei sicuro di voler eliminare il portafoglio "${portfolioName}"?\nTutte le transazioni associate verranno eliminate definitivamente.`)) return;
    try {
        const response = await fetch(`/portfolios/${activePortfolioId}`, { method: 'DELETE' });
        if (!response.ok) {
            const err = await response.json();
            alert("Errore: " + (err.detail || "Eliminazione fallita"));
            return;
        }
        activePortfolioId = null;
        document.getElementById('portfolio-summary-dashboard').style.display = 'none';
        document.getElementById('portfolio-actions').style.display = 'none';
        document.getElementById('portfolio-positions-container').style.display = 'none';
        document.getElementById('portfolio-history-container').style.display = 'none';
        await loadPortfolios();
    } catch (err) {
        alert("Errore nell'eliminazione: " + err.message);
    }
}

if (document.getElementById('delete-portfolio-btn')) {
    document.getElementById('delete-portfolio-btn').onclick = deletePortfolio;
}

if (document.getElementById('manage-commission-plans-btn')) {
    document.getElementById('manage-commission-plans-btn').onclick = () => {
        document.getElementById('commission-plans-modal').classList.remove('hidden');
    };
}

function closePositionModal(ticker, quantity, currentPrice) {
    editingTransactionId = null;
    const titleEl = document.getElementById('transaction-modal-title');
    if (titleEl) titleEl.textContent = "Chiudi Posizione";

    const modal = document.getElementById('transaction-modal');
    modal.classList.remove('hidden');
    
    const transType = document.getElementById('trans-type');
    if (quantity > 0) {
        transType.value = 'SELL';
    } else {
        transType.value = 'COVER';
    }
    
    document.getElementById('trans-ticker').value = ticker;
    document.getElementById('trans-qty').value = Math.abs(quantity);
    document.getElementById('trans-price').value = currentPrice;
    
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const val = now.toISOString().slice(0, 16);
    if (transDatePickr) transDatePickr.setDate(val, false);
    else document.getElementById('trans-date').value = val;
    
    document.getElementById('trans-short-fee-row').style.display = 'none';
}
window.closePositionModal = closePositionModal;

function openEditTransactionModal(id) {
    const t = currentTransactions.find(item => item.id === id);
    if (!t) return;
    
    editingTransactionId = id;
    
    // Check if it is a cash deposit/withdrawal or a normal trade
    if (t.type === 'DEPOSIT' || t.type === 'WITHDRAWAL') {
        const titleEl = document.getElementById('cash-modal-title');
        if (titleEl) titleEl.textContent = "Modifica Deposito / Prelievo";
        
        document.getElementById('cash-type').value = t.type;
        document.getElementById('cash-amount').value = t.quantity;
        
        const d = new Date(t.date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        const val = d.toISOString().slice(0, 16);
        if (cashDatePickr) cashDatePickr.setDate(val, false);
        else document.getElementById('cash-date').value = val;
        
        document.getElementById('cash-modal').classList.remove('hidden');
    } else {
        const titleEl = document.getElementById('transaction-modal-title');
        if (titleEl) titleEl.textContent = "Modifica Transazione";
        
        document.getElementById('trans-type').value = t.type;
        document.getElementById('trans-ticker').value = t.ticker || '';
        
        const d = new Date(t.date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        const val = d.toISOString().slice(0, 16);
        if (transDatePickr) transDatePickr.setDate(val, false);
        else document.getElementById('trans-date').value = val;
        
        document.getElementById('trans-qty').value = t.quantity;
        document.getElementById('trans-price').value = t.price;
        document.getElementById('trans-currency').value = t.instrument_currency || 'EUR';
        document.getElementById('trans-fx').value = t.exchange_rate;
        document.getElementById('trans-commission-plan').value = t.commission_plan_id || '';
        document.getElementById('trans-short-fee').value = t.short_borrow_fee_rate || 0;
        
        document.getElementById('trans-short-fee-row').style.display = t.type === 'SHORT' ? 'flex' : 'none';
        
        document.getElementById('transaction-modal').classList.remove('hidden');
    }
}
async function updateAutomaticExchangeRate() {
    if (!activePortfolioId) return;
    const baseCurrency = activePortfolioBaseCurrency || 'EUR';
    const instrumentCurrency = document.getElementById('trans-currency').value;
    const dateVal = document.getElementById('trans-date').value;
    
    if (instrumentCurrency === baseCurrency) {
        document.getElementById('trans-fx').value = "1.000000";
        return;
    }
    
    if (!dateVal) return;
    
    try {
        const response = await fetch(`/fx_rate?base_currency=${baseCurrency}&instrument_currency=${instrumentCurrency}&date=${dateVal}`);
        if (response.ok) {
            const data = await response.json();
            document.getElementById('trans-fx').value = data.rate.toFixed(6);
        }
    } catch (err) {
        console.error("Error fetching FX rate:", err);
    }
}
window.updateAutomaticExchangeRate = updateAutomaticExchangeRate;
window.openEditTransactionModal = openEditTransactionModal;

if (document.getElementById('add-transaction-btn')) {
    document.getElementById('add-transaction-btn').onclick = () => {
        editingTransactionId = null;
        const titleEl = document.getElementById('transaction-modal-title');
        if (titleEl) titleEl.textContent = "Nuova Transazione";

        const modal = document.getElementById('transaction-modal');
        modal.classList.remove('hidden');
        document.getElementById('trans-type').value = 'BUY';
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const val = now.toISOString().slice(0, 16);
        if (transDatePickr) transDatePickr.setDate(val, false);
        else document.getElementById('trans-date').value = val;
        if (activeTicker) document.getElementById('trans-ticker').value = activeTicker;
        document.getElementById('trans-short-fee-row').style.display = 'none';
        
        updateAutomaticExchangeRate();
    };
}

if (document.getElementById('close-position-top-btn')) {
    document.getElementById('close-position-top-btn').onclick = () => {
        editingTransactionId = null;
        const titleEl = document.getElementById('transaction-modal-title');
        if (titleEl) titleEl.textContent = "Nuova Transazione";

        const modal = document.getElementById('transaction-modal');
        modal.classList.remove('hidden');
        document.getElementById('trans-type').value = 'SELL';
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const val = now.toISOString().slice(0, 16);
        if (transDatePickr) transDatePickr.setDate(val, false);
        else document.getElementById('trans-date').value = val;
        if (activeTicker) document.getElementById('trans-ticker').value = activeTicker;
        document.getElementById('trans-short-fee-row').style.display = 'none';
        
        updateAutomaticExchangeRate();
    };
}

if (document.getElementById('add-cash-btn')) {
    document.getElementById('add-cash-btn').onclick = () => {
        editingTransactionId = null;
        const titleEl = document.getElementById('cash-modal-title');
        if (titleEl) titleEl.textContent = "Deposita / Preleva Liquidità";

        const modal = document.getElementById('cash-modal');
        modal.classList.remove('hidden');
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const val = now.toISOString().slice(0, 16);
        if (cashDatePickr) cashDatePickr.setDate(val, false);
        else document.getElementById('cash-date').value = val;
    };
}

// Form Submission Handlers
if (document.getElementById('save-new-portfolio-btn')) {
    document.getElementById('save-new-portfolio-btn').onclick = async () => {
        const name = document.getElementById('new-portfolio-name').value;
        const currency = document.getElementById('new-portfolio-currency').value;
        if (!name) return alert("Inserisci un nome");
        
        try {
            const response = await fetch('/portfolios/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, base_currency: currency, cash_balance: 0 })
            });
            if (response.ok) {
                document.getElementById('create-portfolio-modal').classList.add('hidden');
                loadPortfolios();
            }
        } catch (err) {
            alert("Errore nel salvataggio: " + err.message);
        }
    };
}

if (document.getElementById('add-commission-plan-btn')) {
    document.getElementById('add-commission-plan-btn').onclick = async () => {
        const name = document.getElementById('comm-name').value;
        const type = document.getElementById('comm-type').value;
        const fixed_fee = parseFloat(document.getElementById('comm-fixed').value) || 0;
        const percentage = parseFloat(document.getElementById('comm-perc').value) || 0;
        const min_fee = parseFloat(document.getElementById('comm-min').value) || 0;
        const max_fee = parseFloat(document.getElementById('comm-max').value) || 0;
        
        if (!name) return alert("Inserisci un nome per il piano");

        try {
            const response = await fetch('/commission_plans/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type, fixed_fee, percentage, min_fee, max_fee, currency: 'BASE' })
            });
            if (response.ok) {
                loadCommissionPlans();
                // Clear inputs
                document.getElementById('comm-name').value = '';
                document.getElementById('comm-fixed').value = '';
                document.getElementById('comm-perc').value = '';
                document.getElementById('comm-min').value = '';
                document.getElementById('comm-max').value = '';
            }
        } catch (err) {
            alert("Errore nel salvataggio: " + err.message);
        }
    };
}

if (document.getElementById('comm-type')) {
    document.getElementById('comm-type').onchange = (e) => {
        const isPerc = e.target.value === 'percentage';
        document.getElementById('comm-perc').style.display = isPerc ? 'block' : 'none';
        document.getElementById('comm-min').style.display = isPerc ? 'block' : 'none';
        document.getElementById('comm-max').style.display = isPerc ? 'block' : 'none';
    };
}

if (document.getElementById('save-transaction-btn')) {
    document.getElementById('save-transaction-btn').onclick = async () => {
        if (!activePortfolioId) return;
        
        const ticker = document.getElementById('trans-ticker').value.toUpperCase();
        const type = document.getElementById('trans-type').value;
        const date = document.getElementById('trans-date').value;
        const quantity = parseFloat(document.getElementById('trans-qty').value);
        const price = parseFloat(document.getElementById('trans-price').value);
        const instrument_currency = document.getElementById('trans-currency').value;
        const exchange_rate = parseFloat(document.getElementById('trans-fx').value) || 1.0;
        const commission_plan_id = document.getElementById('trans-commission-plan').value || null;
        const short_borrow_fee_rate = parseFloat(document.getElementById('trans-short-fee').value) || 0;

        if (!ticker || isNaN(quantity) || isNaN(price)) return alert("Compila tutti i campi obbligatori");

        const url = editingTransactionId ? `/transactions/${editingTransactionId}` : `/portfolios/${activePortfolioId}/transactions/`;
        const method = editingTransactionId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    portfolio_id: parseInt(activePortfolioId),
                    ticker, type, date, quantity, price, 
                    instrument_currency, exchange_rate, 
                    commission_plan_id: commission_plan_id ? parseInt(commission_plan_id) : null,
                    short_borrow_fee_rate
                })
            });
            if (response.ok) {
                document.getElementById('transaction-modal').classList.add('hidden');
                refreshPortfolio();
            } else {
                const err = await response.json();
                alert("Errore: " + JSON.stringify(err.detail));
            }
        } catch (err) {
            alert("Errore nella richiesta: " + err.message);
        }
    };
}

if (document.getElementById('trans-type')) {
    document.getElementById('trans-type').onchange = (e) => {
        document.getElementById('trans-short-fee-row').style.display = e.target.value === 'SHORT' ? 'flex' : 'none';
    };
}

if (document.getElementById('fetch-price-btn')) {
    document.getElementById('fetch-price-btn').onclick = async () => {
        const ticker = document.getElementById('trans-ticker').value.toUpperCase();
        const dateVal = transDatePickr ? transDatePickr.selectedDates[0] : document.getElementById('trans-date').value;
        if (!ticker) return alert("Inserisci il ticker prima.");
        if (!dateVal) return alert("Seleziona una data prima.");
        let dateStr;
        if (dateVal instanceof Date) {
            const y = dateVal.getFullYear();
            const m = String(dateVal.getMonth() + 1).padStart(2, '0');
            const d = String(dateVal.getDate()).padStart(2, '0');
            dateStr = `${y}-${m}-${d}`;
        } else {
            dateStr = dateVal.split('T')[0];
        }
        try {
            const response = await fetch(`/ticker_price?symbol=${encodeURIComponent(ticker)}&date=${dateStr}`);
            const data = await response.json();
            if (data.price !== null && data.price !== undefined) {
                document.getElementById('trans-price').value = data.price.toFixed(4);
            } else {
                alert("Nessun prezzo trovato nel DB per " + ticker + " in data " + dateStr);
            }
        } catch (err) {
            alert("Errore nel recupero del prezzo: " + err.message);
        }
    };
}

if (document.getElementById('save-cash-btn')) {
    document.getElementById('save-cash-btn').onclick = async () => {
        if (!activePortfolioId) return;
        
        const type = document.getElementById('cash-type').value;
        const amount = parseFloat(document.getElementById('cash-amount').value);
        const date = document.getElementById('cash-date').value;

        if (isNaN(amount)) return alert("Inserisci un importo");

        const url = editingTransactionId ? `/transactions/${editingTransactionId}` : `/portfolios/${activePortfolioId}/transactions/`;
        const method = editingTransactionId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    portfolio_id: parseInt(activePortfolioId),
                    ticker: 'CASH', type, date, quantity: amount, price: 1.0, 
                    instrument_currency: 'BASE', exchange_rate: 1.0
                })
            });
            if (response.ok) {
                document.getElementById('cash-modal').classList.add('hidden');
                refreshPortfolio();
            } else {
                const err = await response.json();
                alert("Errore: " + JSON.stringify(err.detail));
            }
        } catch (err) {
            alert("Errore: " + err.message);
        }
    };
}

document.querySelectorAll('.portfolio-pos-filter').forEach(input => {
    input.addEventListener('input', renderPortfolioPositions);
});
document.querySelectorAll('.portfolio-hist-filter').forEach(input => {
    input.addEventListener('input', renderPortfolioHistory);
});

console.log("[script.js] Script execution reached end.");
